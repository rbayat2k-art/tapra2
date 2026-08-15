import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { withTenantTransaction } from '../../infrastructure/database/pool.js';
import { AppError } from '../../shared/errors.js';
import { appendAuditEntry, auditIdentity } from '../audit/audit-service.js';
import type { AuthenticatedSession, MembershipContext } from '../identity/types.js';

export const saleEntryModes = ['direct', 'paper_entry'] as const;
export type SaleEntryMode = typeof saleEntryModes[number];
export const invoiceItemTypes = ['goods', 'service'] as const;
export type InvoiceItemType = typeof invoiceItemTypes[number];
export const invoiceLineSourceTypes = ['promotion_core', 'cross_sell', 'upsell', 'manual_addition'] as const;
export type InvoiceLineSourceType = typeof invoiceLineSourceTypes[number];
export const paymentMethods = ['card_to_card', 'bank_transfer', 'payment_gateway', 'cash', 'cheque', 'cod'] as const;
export type PaymentMethod = typeof paymentMethods[number];
export const paymentReviewDecisions = ['approved', 'needs_correction', 'rejected'] as const;
export type PaymentReviewDecision = typeof paymentReviewDecisions[number];

export interface InvoiceLineInput {
  itemType: InvoiceItemType;
  catalogReference?: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  sourceType: InvoiceLineSourceType;
  snapshot?: Record<string, unknown>;
}

export interface CreateSaleInput {
  customerId: string;
  leadId?: string;
  entryMode: SaleEntryMode;
  sellerMembershipId?: string;
  source?: Record<string, unknown>;
  lines: InvoiceLineInput[];
}

export interface RecordPaymentInput {
  amount: number;
  paymentMethod: Exclude<PaymentMethod, 'payment_gateway'>;
  occurredAt: string;
  lastFourDigits?: string;
  destinationAccountId: string;
  trackingNumber: string;
  receiptReference?: string;
  correctsPaymentId?: string;
}

export interface ReviewPaymentInput {
  decision: PaymentReviewDecision;
  reason?: string;
}

interface InvoiceRow {
  id: string;
  invoice_code: string;
  revision: number;
  status: string;
  payment_status: string;
  currency: 'IRR';
  subtotal_amount: string;
  discount_amount: string;
  final_amount: string;
  supervisor_approved_by_user_account_id: string | null;
  supervisor_approved_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  sale_id: string;
  entry_mode: SaleEntryMode;
  seller_membership_id: string;
  seller_name: string;
  actor_user_account_id: string;
  actor_name: string;
  customer_id: string;
  canonical_identity_id: string;
  customer_name: string;
  lead_id: string | null;
}

export interface SalesInvoiceView {
  id: string;
  code: string;
  revision: number;
  status: string;
  paymentStatus: string;
  currency: 'IRR';
  subtotalAmount: number;
  discountAmount: number;
  finalAmount: number;
  approvedPaymentAmount: number;
  supervisorApproval: null | { userAccountId: string; at: string };
  sale: {
    id: string;
    entryMode: SaleEntryMode;
    seller: { membershipId: string; name: string };
    actor: { userAccountId: string; name: string };
    customer: { id: string; canonicalIdentityId: string; name: string };
    leadId: string | null;
  };
  lines: Array<{
    id: string; lineNumber: number; itemType: InvoiceItemType; catalogReference: string | null;
    itemName: string; quantity: number; unitPrice: number; discountAmount: number;
    lineTotal: number; sourceType: InvoiceLineSourceType; fulfillmentStatus: string;
    snapshot: Record<string, unknown>;
  }>;
  payments: Array<{
    id: string; amount: number; method: PaymentMethod; occurredAt: string;
    lastFourDigits: string | null; destinationAccountId: string | null;
    destinationAccountName: string | null; trackingNumber: string | null;
    receiptReference: string | null; status: string; recorderName: string;
    reviewerName: string | null; reviewedAt: string | null; reviewReason: string | null;
    correctsPaymentId: string | null; supersededByPaymentId: string | null;
  }>;
  history: Array<{ id: string; type: string; reason: string | null; actorName: string; occurredAt: string }>;
  createdAt: string;
  updatedAt: string;
}

function companyFrom(context: MembershipContext) {
  if (!context.company) throw new AppError(409, 'company_context_required', 'A Company context is required for Sales Invoices.');
  if (!['COMPANY', 'SELF'].includes(context.scope.type)) {
    throw new AppError(403, 'sales_scope_unsupported', 'Sales Invoices require a Company or Self context until Invoice Lines are attributed to organization units.');
  }
  return context.company;
}

function hasPermission(context: MembershipContext, permission: string): boolean {
  return context.permissions.includes(permission);
}

function requirePermission(context: MembershipContext, permission: string): void {
  if (!hasPermission(context, permission)) throw new AppError(403, 'permission_denied', `Permission ${permission} is required.`);
}

function iso(value: Date | string | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

function calculateLines(lines: InvoiceLineInput[]) {
  const normalized = lines.map((line, index) => {
    const gross = line.quantity * line.unitPrice;
    if (!Number.isSafeInteger(gross) || line.discountAmount > gross) {
      throw new AppError(400, 'invoice_amount_invalid', `Invoice Line ${index + 1} has an invalid amount.`);
    }
    return { ...line, lineNumber: index + 1, lineTotal: gross - line.discountAmount };
  });
  const subtotalAmount = normalized.reduce((total, line) => total + line.quantity * line.unitPrice, 0);
  const discountAmount = normalized.reduce((total, line) => total + line.discountAmount, 0);
  const finalAmount = subtotalAmount - discountAmount;
  if (!Number.isSafeInteger(finalAmount) || finalAmount <= 0) {
    throw new AppError(400, 'invoice_amount_invalid', 'Invoice final amount must be a positive safe integer.');
  }
  return { lines: normalized, subtotalAmount, discountAmount, finalAmount };
}

const invoiceSelect = `
  SELECT invoice.id, invoice.invoice_code, invoice.revision, invoice.status, invoice.payment_status,
    invoice.currency, invoice.subtotal_amount, invoice.discount_amount, invoice.final_amount,
    invoice.supervisor_approved_by_user_account_id, invoice.supervisor_approved_at,
    invoice.created_at, invoice.updated_at, sale.id AS sale_id, sale.entry_mode,
    sale.seller_membership_id, seller_person.full_name AS seller_name,
    sale.actor_user_account_id, actor_person.full_name AS actor_name,
    sale.customer_id, sale.canonical_identity_id, customer.full_name AS customer_name, sale.lead_id
  FROM sales_invoices invoice
  JOIN sales_transactions sale ON sale.id = invoice.sale_id
  JOIN memberships seller_membership ON seller_membership.id = sale.seller_membership_id
  JOIN persons seller_person ON seller_person.id = seller_membership.person_id
  JOIN user_accounts actor_account ON actor_account.id = sale.actor_user_account_id
  JOIN persons actor_person ON actor_person.id = actor_account.person_id
  JOIN customers customer ON customer.id = sale.customer_id
`;

async function assertInvoiceReadable(client: PoolClient, context: MembershipContext, invoiceId: string): Promise<InvoiceRow> {
  const readAll = hasPermission(context, 'sales.invoice.read_all');
  if (!readAll && !hasPermission(context, 'sales.invoice.read_own')) {
    throw new AppError(403, 'permission_denied', 'Permission to read Sales Invoices is required.');
  }
  const result = await client.query<InvoiceRow>(`
    ${invoiceSelect}
    WHERE invoice.id = $1 AND ($2::boolean OR sale.seller_membership_id = $3)
  `, [invoiceId, readAll, context.membershipId]);
  const row = result.rows[0];
  if (!row) throw new AppError(404, 'sales_invoice_not_found', 'Sales Invoice was not found in the active scope.');
  return row;
}

async function loadInvoice(client: PoolClient, rowOrId: InvoiceRow | string): Promise<SalesInvoiceView> {
  const row = typeof rowOrId === 'string'
    ? (await client.query<InvoiceRow>(`${invoiceSelect} WHERE invoice.id = $1`, [rowOrId])).rows[0]
    : rowOrId;
  if (!row) throw new AppError(404, 'sales_invoice_not_found', 'Sales Invoice was not found.');
  const lines = await client.query<{
      id: string; line_number: number; item_type: InvoiceItemType; catalog_reference: string | null;
      item_name: string; quantity: number; unit_price: string; discount_amount: string;
      line_total: string; source_type: InvoiceLineSourceType; fulfillment_status: string;
      item_snapshot: Record<string, unknown>;
    }>(`
      SELECT id, line_number, item_type, catalog_reference, item_name, quantity, unit_price,
        discount_amount, line_total, source_type, fulfillment_status, item_snapshot
      FROM sales_invoice_lines WHERE invoice_id = $1 AND invoice_revision = $2 ORDER BY line_number
    `, [row.id, row.revision]);
  const payments = await client.query<{
      id: string; amount: string; payment_method: PaymentMethod; occurred_at: Date | string;
      last_four_digits: string | null; destination_account_id: string | null; destination_account_name: string | null;
      tracking_number: string | null; receipt_reference: string | null; status: string;
      recorder_name: string; reviewer_name: string | null; reviewed_at: Date | string | null;
      review_reason: string | null; corrects_payment_id: string | null; superseded_by_payment_id: string | null;
    }>(`
      SELECT payment.id, payment.amount, payment.payment_method, payment.occurred_at,
        payment.last_four_digits, payment.destination_account_id, account.display_name AS destination_account_name,
        payment.tracking_number, payment.receipt_reference, payment.status,
        recorder_person.full_name AS recorder_name, reviewer_person.full_name AS reviewer_name,
        payment.reviewed_at, payment.review_reason, payment.corrects_payment_id, payment.superseded_by_payment_id
      FROM sales_payments payment
      JOIN user_accounts recorder ON recorder.id = payment.recorded_by_user_account_id
      JOIN persons recorder_person ON recorder_person.id = recorder.person_id
      LEFT JOIN user_accounts reviewer ON reviewer.id = payment.reviewed_by_user_account_id
      LEFT JOIN persons reviewer_person ON reviewer_person.id = reviewer.person_id
      LEFT JOIN financial_accounts account ON account.id = payment.destination_account_id
      WHERE payment.invoice_id = $1 ORDER BY payment.created_at, payment.id
    `, [row.id]);
  const history = await client.query<{ id: string; event_type: string; reason: string | null; actor_name: string; occurred_at: Date | string }>(`
      SELECT event.id, event.event_type, event.reason, person.full_name AS actor_name, event.occurred_at
      FROM sales_invoice_events event
      JOIN user_accounts account ON account.id = event.actor_user_account_id
      JOIN persons person ON person.id = account.person_id
      WHERE event.invoice_id = $1 ORDER BY event.occurred_at, event.id
    `, [row.id]);
  const approved = await client.query<{ total: string }>(`
      SELECT COALESCE(sum(amount), 0)::text AS total FROM sales_payments
      WHERE invoice_id = $1 AND status = 'approved'
    `, [row.id]);
  return {
    id: row.id, code: row.invoice_code, revision: row.revision, status: row.status,
    paymentStatus: row.payment_status, currency: row.currency,
    subtotalAmount: Number(row.subtotal_amount), discountAmount: Number(row.discount_amount),
    finalAmount: Number(row.final_amount), approvedPaymentAmount: Number(approved.rows[0]?.total ?? 0),
    supervisorApproval: row.supervisor_approved_at ? {
      userAccountId: row.supervisor_approved_by_user_account_id!, at: iso(row.supervisor_approved_at)!,
    } : null,
    sale: {
      id: row.sale_id, entryMode: row.entry_mode,
      seller: { membershipId: row.seller_membership_id, name: row.seller_name },
      actor: { userAccountId: row.actor_user_account_id, name: row.actor_name },
      customer: { id: row.customer_id, canonicalIdentityId: row.canonical_identity_id, name: row.customer_name },
      leadId: row.lead_id,
    },
    lines: lines.rows.map((line) => ({
      id: line.id, lineNumber: line.line_number, itemType: line.item_type,
      catalogReference: line.catalog_reference, itemName: line.item_name, quantity: line.quantity,
      unitPrice: Number(line.unit_price), discountAmount: Number(line.discount_amount),
      lineTotal: Number(line.line_total), sourceType: line.source_type,
      fulfillmentStatus: line.fulfillment_status, snapshot: line.item_snapshot ?? {},
    })),
    payments: payments.rows.map((payment) => ({
      id: payment.id, amount: Number(payment.amount), method: payment.payment_method,
      occurredAt: iso(payment.occurred_at)!, lastFourDigits: payment.last_four_digits,
      destinationAccountId: payment.destination_account_id,
      destinationAccountName: payment.destination_account_name,
      trackingNumber: payment.tracking_number, receiptReference: payment.receipt_reference,
      status: payment.status, recorderName: payment.recorder_name, reviewerName: payment.reviewer_name,
      reviewedAt: iso(payment.reviewed_at), reviewReason: payment.review_reason,
      correctsPaymentId: payment.corrects_payment_id, supersededByPaymentId: payment.superseded_by_payment_id,
    })),
    history: history.rows.map((event) => ({
      id: event.id, type: event.event_type, reason: event.reason,
      actorName: event.actor_name, occurredAt: iso(event.occurred_at)!,
    })),
    createdAt: iso(row.created_at)!, updatedAt: iso(row.updated_at)!,
  };
}

async function insertInvoiceLines(
  client: PoolClient,
  context: MembershipContext,
  invoiceId: string,
  revision: number,
  lines: ReturnType<typeof calculateLines>['lines'],
): Promise<void> {
  for (const line of lines) {
    await client.query(`
      INSERT INTO sales_invoice_lines(
        workspace_id, company_id, invoice_id, invoice_revision, line_number, item_type,
        catalog_reference, item_name, quantity, unit_price, discount_amount, line_total,
        source_type, item_snapshot
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    `, [
      context.workspace.id, context.company!.id, invoiceId, revision, line.lineNumber, line.itemType,
      line.catalogReference ?? null, line.itemName, line.quantity, line.unitPrice,
      line.discountAmount, line.lineTotal, line.sourceType, JSON.stringify(line.snapshot ?? {}),
    ]);
  }
}

function revisionSnapshot(calculation: ReturnType<typeof calculateLines>) {
  return {
    subtotalAmount: calculation.subtotalAmount,
    discountAmount: calculation.discountAmount,
    finalAmount: calculation.finalAmount,
    currency: 'IRR',
    lines: calculation.lines.map(({ lineNumber, lineTotal, ...line }) => ({ ...line, lineNumber, lineTotal })),
  };
}

async function appendInvoiceEvent(
  client: PoolClient,
  context: MembershipContext,
  session: AuthenticatedSession,
  invoiceId: string,
  eventType: string,
  correlationId: string,
  options: { previousState?: unknown; newState?: unknown; reason?: string } = {},
): Promise<void> {
  await client.query(`
    INSERT INTO sales_invoice_events(
      workspace_id, company_id, invoice_id, actor_user_account_id, event_type,
      previous_state, new_state, reason, correlation_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  `, [
    context.workspace.id, context.company!.id, invoiceId, session.userAccountId, eventType,
    options.previousState ? JSON.stringify(options.previousState) : null,
    options.newState ? JSON.stringify(options.newState) : null,
    options.reason ?? null, correlationId,
  ]);
}

export async function listSalesInvoices(context: MembershipContext): Promise<SalesInvoiceView[]> {
  const company = companyFrom(context);
  const readAll = hasPermission(context, 'sales.invoice.read_all');
  if (!readAll && !hasPermission(context, 'sales.invoice.read_own')) {
    throw new AppError(403, 'permission_denied', 'Permission to read Sales Invoices is required.');
  }
  return withTenantTransaction({ workspaceId: context.workspace.id, companyId: company.id }, async (client) => {
    const result = await client.query<InvoiceRow>(`
      ${invoiceSelect}
      WHERE ($1::boolean OR sale.seller_membership_id = $2)
      ORDER BY invoice.updated_at DESC, invoice.id DESC
    `, [readAll, context.membershipId]);
    const invoices: SalesInvoiceView[] = [];
    for (const row of result.rows) invoices.push(await loadInvoice(client, row));
    return invoices;
  });
}

export async function readSalesInvoice(context: MembershipContext, invoiceId: string): Promise<SalesInvoiceView> {
  const company = companyFrom(context);
  return withTenantTransaction({ workspaceId: context.workspace.id, companyId: company.id }, async (client) => (
    loadInvoice(client, await assertInvoiceReadable(client, context, invoiceId))
  ));
}

export async function createSaleAndInvoice(
  context: MembershipContext,
  session: AuthenticatedSession,
  input: CreateSaleInput,
  idempotencyKey: string,
  correlationId: string,
): Promise<SalesInvoiceView> {
  const company = companyFrom(context);
  const paperEntry = input.entryMode === 'paper_entry';
  requirePermission(context, paperEntry ? 'sales.sale.create_on_behalf' : 'sales.sale.create');
  const sellerMembershipId = paperEntry ? input.sellerMembershipId : context.membershipId;
  if (!sellerMembershipId) throw new AppError(400, 'seller_required', 'Seller membership is required.');
  if (!paperEntry && input.sellerMembershipId && input.sellerMembershipId !== context.membershipId) {
    throw new AppError(400, 'seller_mismatch', 'Direct Sale seller must match the active membership.');
  }
  const calculation = calculateLines(input.lines);
  return withTenantTransaction({ workspaceId: context.workspace.id, companyId: company.id }, async (client) => {
    const repeated = await client.query<{ invoice_id: string }>(`
      SELECT invoice.id AS invoice_id FROM sales_transactions sale
      JOIN sales_invoices invoice ON invoice.sale_id = sale.id
      WHERE sale.idempotency_key = $1
    `, [idempotencyKey]);
    if (repeated.rows[0]) return loadInvoice(client, repeated.rows[0].invoice_id);

    const seller = await client.query<{ id: string }>(`
      SELECT membership.id FROM memberships membership
      JOIN role_assignments assignment ON assignment.membership_id = membership.id
        AND assignment.workspace_id = membership.workspace_id
        AND (assignment.valid_until IS NULL OR assignment.valid_until > now())
        AND (assignment.scope_type = 'WORKSPACE' OR assignment.company_id = $2)
      JOIN role_permissions permission ON permission.role_id = assignment.role_id
      WHERE membership.id = $1 AND membership.company_id = $2 AND membership.status = 'active'
        AND membership.valid_from <= now() AND (membership.valid_until IS NULL OR membership.valid_until > now())
        AND permission.permission_code = 'sales.sale.create'
      LIMIT 1
    `, [sellerMembershipId, company.id]);
    if (!seller.rows[0]) throw new AppError(400, 'seller_invalid', 'Seller is not active and permitted in the active Company.');

    const customer = await client.query<{ id: string; canonical_identity_id: string; full_name: string }>(`
      SELECT id, canonical_identity_id, full_name FROM customers WHERE id = $1 AND status = 'active'
    `, [input.customerId]);
    const customerRow = customer.rows[0];
    if (!customerRow) throw new AppError(404, 'customer_not_found', 'Customer was not found in the active Company.');
    if (input.leadId) {
      const lead = await client.query<{ id: string; customer_id: string; current_assignee_membership_id: string | null }>(`
        SELECT id, customer_id, current_assignee_membership_id FROM sales_leads WHERE id = $1 FOR UPDATE
      `, [input.leadId]);
      if (!lead.rows[0] || lead.rows[0].customer_id !== input.customerId) {
        throw new AppError(400, 'lead_customer_mismatch', 'Sales Lead does not belong to this Customer relationship.');
      }
      if (!paperEntry && lead.rows[0].current_assignee_membership_id !== sellerMembershipId) {
        throw new AppError(403, 'sales_lead_not_assigned', 'Direct Sale requires the Lead to be assigned to the active seller.');
      }
    }

    const saleId = randomUUID();
    const invoiceId = randomUUID();
    const invoiceCode = `INV-${new Date().getUTCFullYear()}-${invoiceId.replaceAll('-', '').slice(0, 8).toUpperCase()}`;
    await client.query(`
      INSERT INTO sales_transactions(
        id, workspace_id, company_id, canonical_identity_id, customer_id, lead_id,
        seller_membership_id, actor_user_account_id, entry_mode, source_snapshot, idempotency_key
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [
      saleId, context.workspace.id, company.id, customerRow.canonical_identity_id, input.customerId,
      input.leadId ?? null, sellerMembershipId, session.userAccountId, input.entryMode,
      JSON.stringify(input.source ?? {}), idempotencyKey,
    ]);
    await client.query(`
      INSERT INTO sales_invoices(
        id, workspace_id, company_id, sale_id, invoice_code,
        subtotal_amount, discount_amount, final_amount, created_by_user_account_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      invoiceId, context.workspace.id, company.id, saleId, invoiceCode,
      calculation.subtotalAmount, calculation.discountAmount, calculation.finalAmount, session.userAccountId,
    ]);
    await insertInvoiceLines(client, context, invoiceId, 1, calculation.lines);
    await client.query(`
      INSERT INTO sales_invoice_revisions(
        workspace_id, company_id, invoice_id, revision, content_snapshot, created_by_user_account_id
      ) VALUES ($1, $2, $3, 1, $4, $5)
    `, [context.workspace.id, company.id, invoiceId, JSON.stringify(revisionSnapshot(calculation)), session.userAccountId]);
    await appendInvoiceEvent(client, context, session, invoiceId, 'invoice_created', correlationId, {
      newState: { status: 'awaiting_supervisor_approval', revision: 1, finalAmount: calculation.finalAmount },
    });
    if (input.leadId) {
      await client.query(`UPDATE sales_leads SET status = 'closed_won', updated_at = now(), version = version + 1 WHERE id = $1`, [input.leadId]);
    }
    for (const [eventType, summary, metadata] of [
      ['sales_sale_created', 'Sale recorded for Customer relationship.', { saleId, entryMode: input.entryMode }],
      ['sales_invoice_created', 'Invoice created automatically from Sale.', { invoiceId, invoiceCode }],
    ] as const) {
      await client.query(`
        INSERT INTO customer_timeline_events(
          workspace_id, company_id, customer_id, actor_user_account_id, event_type, summary, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [context.workspace.id, company.id, input.customerId, session.userAccountId, eventType, summary, JSON.stringify(metadata)]);
    }
    await appendAuditEntry(client, {
      workspaceId: context.workspace.id, companyId: company.id, ...auditIdentity(session),
      action: 'sales.invoice.created', resourceType: 'sales_invoice', resourceId: invoiceId,
      result: 'success', newState: { saleId, invoiceCode, sellerMembershipId, actorUserAccountId: session.userAccountId,
        entryMode: input.entryMode, customerId: input.customerId, canonicalIdentityId: customerRow.canonical_identity_id,
        finalAmount: calculation.finalAmount }, correlationId,
    });
    return loadInvoice(client, invoiceId);
  });
}

export async function reviseSalesInvoice(
  context: MembershipContext,
  session: AuthenticatedSession,
  invoiceId: string,
  lines: InvoiceLineInput[],
  reason: string | undefined,
  correlationId: string,
): Promise<SalesInvoiceView> {
  const company = companyFrom(context);
  const calculation = calculateLines(lines);
  return withTenantTransaction({ workspaceId: context.workspace.id, companyId: company.id }, async (client) => {
    const invoice = await assertInvoiceReadable(client, context, invoiceId);
    const isDraft = invoice.status === 'awaiting_supervisor_approval';
    requirePermission(context, isDraft ? 'sales.invoice.edit_draft' : 'sales.invoice.amend');
    if (!isDraft && invoice.status !== 'awaiting_payment') {
      throw new AppError(409, 'invoice_revision_blocked', 'Only an unapproved Invoice or an approved Invoice without Payment activity can be revised.');
    }
    if (!isDraft && (!reason || reason.trim().length < 3)) {
      throw new AppError(400, 'invoice_revision_reason_required', 'An approved Invoice amendment requires a reason.');
    }
    const payments = await client.query<{ count: string }>(`
      SELECT count(*)::text AS count FROM sales_payments
      WHERE invoice_id = $1 AND status NOT IN ('rejected', 'superseded')
    `, [invoiceId]);
    if (Number(payments.rows[0]?.count) > 0) {
      throw new AppError(409, 'invoice_has_payments', 'An Invoice with Payment activity cannot be revised by this flow.');
    }
    const nextRevision = invoice.revision + 1;
    await insertInvoiceLines(client, context, invoiceId, nextRevision, calculation.lines);
    await client.query(`
      INSERT INTO sales_invoice_revisions(
        workspace_id, company_id, invoice_id, revision, content_snapshot, reason, created_by_user_account_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      context.workspace.id, company.id, invoiceId, nextRevision,
      JSON.stringify(revisionSnapshot(calculation)), reason ?? 'Draft Invoice edited before approval', session.userAccountId,
    ]);
    await client.query(`
      UPDATE sales_invoices SET revision = $2, subtotal_amount = $3, discount_amount = $4,
        final_amount = $5, status = 'awaiting_supervisor_approval', payment_status = 'unpaid',
        supervisor_approved_by_user_account_id = NULL, supervisor_approved_at = NULL,
        updated_at = now(), version = version + 1 WHERE id = $1
    `, [invoiceId, nextRevision, calculation.subtotalAmount, calculation.discountAmount, calculation.finalAmount]);
    await appendInvoiceEvent(client, context, session, invoiceId, 'invoice_revised', correlationId, {
      previousState: { revision: invoice.revision, finalAmount: Number(invoice.final_amount), status: invoice.status },
      newState: { revision: nextRevision, finalAmount: calculation.finalAmount, status: 'awaiting_supervisor_approval' },
      reason,
    });
    await appendAuditEntry(client, {
      workspaceId: context.workspace.id, companyId: company.id, ...auditIdentity(session),
      action: 'sales.invoice.revised', resourceType: 'sales_invoice', resourceId: invoiceId,
      result: 'success', reason,
      previousState: { revision: invoice.revision, finalAmount: Number(invoice.final_amount), status: invoice.status },
      newState: { revision: nextRevision, finalAmount: calculation.finalAmount, status: 'awaiting_supervisor_approval' },
      correlationId,
    });
    return loadInvoice(client, invoiceId);
  });
}

export async function approveSalesInvoice(
  context: MembershipContext,
  session: AuthenticatedSession,
  invoiceId: string,
  correlationId: string,
): Promise<SalesInvoiceView> {
  requirePermission(context, 'sales.invoice.supervisor_approve');
  const company = companyFrom(context);
  return withTenantTransaction({ workspaceId: context.workspace.id, companyId: company.id }, async (client) => {
    const invoice = await assertInvoiceReadable(client, context, invoiceId);
    if (invoice.status !== 'awaiting_supervisor_approval') {
      throw new AppError(409, 'invoice_not_awaiting_supervisor', 'Invoice is not awaiting supervisor approval.');
    }
    if (invoice.seller_membership_id === context.membershipId) {
      throw new AppError(409, 'invoice_self_approval_denied', 'Seller cannot approve their own Invoice.');
    }
    await client.query(`
      UPDATE sales_invoices SET status = 'awaiting_payment', supervisor_approved_by_user_account_id = $2,
        supervisor_approved_at = now(), updated_at = now(), version = version + 1 WHERE id = $1
    `, [invoiceId, session.userAccountId]);
    await appendInvoiceEvent(client, context, session, invoiceId, 'supervisor_approved', correlationId, {
      previousState: { status: invoice.status }, newState: { status: 'awaiting_payment' },
    });
    await appendAuditEntry(client, {
      workspaceId: context.workspace.id, companyId: company.id, ...auditIdentity(session),
      action: 'sales.invoice.supervisor_approved', resourceType: 'sales_invoice', resourceId: invoiceId,
      result: 'success', previousState: { status: invoice.status }, newState: { status: 'awaiting_payment' }, correlationId,
    });
    return loadInvoice(client, invoiceId);
  });
}

async function deriveInvoicePaymentState(client: PoolClient, invoiceId: string): Promise<{
  status: string; paymentStatus: string; approvedAmount: number; exactPaid: boolean;
}> {
  const invoice = await client.query<{ final_amount: string; supervisor_approved_at: Date | null; status: string }>(`
    SELECT final_amount, supervisor_approved_at, status FROM sales_invoices WHERE id = $1 FOR UPDATE
  `, [invoiceId]);
  const row = invoice.rows[0];
  if (!row) throw new AppError(404, 'sales_invoice_not_found', 'Sales Invoice was not found.');
  const totals = await client.query<{
    approved: string; declared_count: string; correction_count: string;
  }>(`
    SELECT COALESCE(sum(amount) FILTER (WHERE status = 'approved'), 0)::text AS approved,
      count(*) FILTER (WHERE status = 'declared')::text AS declared_count,
      count(*) FILTER (WHERE status = 'needs_correction')::text AS correction_count
    FROM sales_payments WHERE invoice_id = $1
  `, [invoiceId]);
  const approvedAmount = Number(totals.rows[0]?.approved ?? 0);
  const finalAmount = Number(row.final_amount);
  const hasDeclared = Number(totals.rows[0]?.declared_count ?? 0) > 0;
  const hasCorrection = Number(totals.rows[0]?.correction_count ?? 0) > 0;
  let status = 'awaiting_payment';
  let paymentStatus = 'unpaid';
  if (!row.supervisor_approved_at) status = 'awaiting_supervisor_approval';
  else if (hasCorrection) { status = 'payment_correction_required'; paymentStatus = 'correction_required'; }
  else if (hasDeclared) { status = 'awaiting_financial_review'; paymentStatus = 'declared'; }
  else if (approvedAmount > finalAmount) { status = 'overpayment_hold'; paymentStatus = 'overpaid'; }
  else if (approvedAmount === finalAmount) { status = 'financially_approved'; paymentStatus = 'paid'; }
  else if (approvedAmount > 0) { status = 'partially_paid'; paymentStatus = 'partial'; }
  await client.query(`
    UPDATE sales_invoices SET status = $2, payment_status = $3, updated_at = now(), version = version + 1 WHERE id = $1
  `, [invoiceId, status, paymentStatus]);
  const exactPaid = status === 'financially_approved';
  await client.query(`
    UPDATE sales_invoice_lines SET fulfillment_status = CASE WHEN $3 THEN 'eligible' ELSE 'blocked_by_payment' END
    WHERE invoice_id = $1 AND invoice_revision = $2 AND fulfillment_status IN ('blocked_by_payment', 'eligible')
  `, [invoiceId, (await client.query<{ revision: number }>('SELECT revision FROM sales_invoices WHERE id = $1', [invoiceId])).rows[0]?.revision, exactPaid]);
  return { status, paymentStatus, approvedAmount, exactPaid };
}

export async function recordSalesPayment(
  context: MembershipContext,
  session: AuthenticatedSession,
  invoiceId: string,
  input: RecordPaymentInput,
  idempotencyKey: string,
  correlationId: string,
): Promise<SalesInvoiceView> {
  requirePermission(context, 'sales.payment.record');
  const company = companyFrom(context);
  return withTenantTransaction({ workspaceId: context.workspace.id, companyId: company.id }, async (client) => {
    const invoice = await assertInvoiceReadable(client, context, invoiceId);
    const repeated = await client.query<{ invoice_id: string }>('SELECT invoice_id FROM sales_payments WHERE idempotency_key = $1', [idempotencyKey]);
    if (repeated.rows[0]) {
      if (repeated.rows[0].invoice_id !== invoiceId) throw new AppError(409, 'idempotency_key_reused', 'Idempotency key belongs to another Payment.');
      return loadInvoice(client, invoice);
    }
    if (!invoice.supervisor_approved_at || ['cancelled', 'cancellation_requested', 'financially_approved'].includes(invoice.status)) {
      throw new AppError(409, 'payment_recording_blocked', 'Payment cannot be recorded in the current Invoice state.');
    }
    const policy = await client.query<{ is_enabled: boolean; manual_review_required: boolean }>(`
      SELECT is_enabled, manual_review_required FROM sales_payment_method_policies WHERE payment_method = $1
    `, [input.paymentMethod]);
    if (!policy.rows[0]?.is_enabled) throw new AppError(409, 'payment_method_disabled', 'Payment method is disabled for the active Company.');
    if (!policy.rows[0].manual_review_required) {
      throw new AppError(409, 'manual_payment_not_allowed', 'This Payment method requires its dedicated integration path.');
    }
    const account = await client.query<{ id: string }>('SELECT id FROM financial_accounts WHERE id = $1 AND is_active = true', [input.destinationAccountId]);
    if (!account.rows[0]) throw new AppError(400, 'financial_account_invalid', 'Destination Financial Account is not active in the current Company.');
    if (['card_to_card', 'bank_transfer'].includes(input.paymentMethod) && !input.lastFourDigits) {
      throw new AppError(400, 'payment_last_four_required', 'Last four digits are required for this Payment method.');
    }
    if (new Date(input.occurredAt).getTime() > Date.now() + 5 * 60_000) {
      throw new AppError(400, 'payment_time_invalid', 'Payment time cannot be in the future.');
    }
    if (input.correctsPaymentId) {
      const previous = await client.query<{ id: string }>(`
        SELECT id FROM sales_payments WHERE id = $1 AND invoice_id = $2 AND status = 'needs_correction' FOR UPDATE
      `, [input.correctsPaymentId, invoiceId]);
      if (!previous.rows[0]) throw new AppError(409, 'payment_correction_invalid', 'Only a returned Payment can be corrected.');
    }
    const paymentId = randomUUID();
    await client.query(`
      INSERT INTO sales_payments(
        id, workspace_id, company_id, invoice_id, amount, payment_method, occurred_at,
        last_four_digits, destination_account_id, tracking_number, receipt_reference,
        recorded_by_user_account_id, corrects_payment_id, idempotency_key
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    `, [
      paymentId, context.workspace.id, company.id, invoiceId, input.amount, input.paymentMethod,
      input.occurredAt, input.lastFourDigits ?? null, input.destinationAccountId, input.trackingNumber,
      input.receiptReference ?? null, session.userAccountId, input.correctsPaymentId ?? null, idempotencyKey,
    ]);
    if (input.correctsPaymentId) {
      await client.query(`
        UPDATE sales_payments SET status = 'superseded', superseded_by_payment_id = $2,
          updated_at = now(), version = version + 1 WHERE id = $1
      `, [input.correctsPaymentId, paymentId]);
    }
    const derived = await deriveInvoicePaymentState(client, invoiceId);
    await appendInvoiceEvent(client, context, session, invoiceId, 'payment_recorded', correlationId, {
      newState: { paymentId, amount: input.amount, method: input.paymentMethod, invoiceStatus: derived.status },
    });
    await client.query(`
      INSERT INTO customer_timeline_events(
        workspace_id, company_id, customer_id, actor_user_account_id, event_type, summary, metadata
      ) VALUES ($1, $2, $3, $4, 'sales_payment_recorded', 'Payment declared for Sales Invoice.', $5)
    `, [context.workspace.id, company.id, invoice.customer_id, session.userAccountId, JSON.stringify({ invoiceId, paymentId, amount: input.amount })]);
    await appendAuditEntry(client, {
      workspaceId: context.workspace.id, companyId: company.id, ...auditIdentity(session),
      action: 'sales.payment.recorded', resourceType: 'sales_payment', resourceId: paymentId,
      result: 'success', newState: { invoiceId, amount: input.amount, method: input.paymentMethod,
        correctsPaymentId: input.correctsPaymentId ?? null }, correlationId,
    });
    return loadInvoice(client, invoiceId);
  });
}

export async function reviewSalesPayment(
  context: MembershipContext,
  session: AuthenticatedSession,
  invoiceId: string,
  paymentId: string,
  input: ReviewPaymentInput,
  correlationId: string,
): Promise<SalesInvoiceView> {
  requirePermission(context, 'sales.payment.review');
  const company = companyFrom(context);
  return withTenantTransaction({ workspaceId: context.workspace.id, companyId: company.id }, async (client) => {
    const invoice = await assertInvoiceReadable(client, context, invoiceId);
    const payment = await client.query<{ id: string; status: string; recorded_by_user_account_id: string; amount: string }>(`
      SELECT id, status, recorded_by_user_account_id, amount FROM sales_payments
      WHERE id = $1 AND invoice_id = $2 FOR UPDATE
    `, [paymentId, invoiceId]);
    const previous = payment.rows[0];
    if (!previous) throw new AppError(404, 'sales_payment_not_found', 'Payment was not found on this Invoice.');
    if (previous.status !== 'declared') throw new AppError(409, 'payment_already_reviewed', 'Only a declared Payment can be reviewed.');
    if (previous.recorded_by_user_account_id === session.userAccountId) {
      throw new AppError(409, 'payment_self_review_denied', 'Payment recorder cannot review the same Payment.');
    }
    if (input.decision !== 'approved' && (!input.reason || input.reason.trim().length < 3)) {
      throw new AppError(400, 'payment_review_reason_required', 'A reason is required when Payment is not approved.');
    }
    await client.query(`
      UPDATE sales_payments SET status = $2, reviewed_by_user_account_id = $3, reviewed_at = now(),
        review_reason = $4, updated_at = now(), version = version + 1 WHERE id = $1
    `, [paymentId, input.decision, session.userAccountId, input.reason ?? null]);
    await client.query(`
      INSERT INTO sales_payment_review_events(
        workspace_id, company_id, invoice_id, payment_id, actor_user_account_id,
        decision, reason, previous_status, new_status, correlation_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $6, $9)
    `, [
      context.workspace.id, company.id, invoiceId, paymentId, session.userAccountId,
      input.decision, input.reason ?? null, previous.status, correlationId,
    ]);
    const derived = await deriveInvoicePaymentState(client, invoiceId);
    await appendInvoiceEvent(client, context, session, invoiceId, 'payment_reviewed', correlationId, {
      previousState: { paymentId, status: previous.status },
      newState: { paymentId, status: input.decision, invoiceStatus: derived.status, approvedAmount: derived.approvedAmount },
      reason: input.reason,
    });
    await client.query(`
      INSERT INTO customer_timeline_events(
        workspace_id, company_id, customer_id, actor_user_account_id, event_type, summary, metadata
      ) VALUES ($1, $2, $3, $4, 'sales_payment_reviewed', 'Payment reviewed independently by Finance.', $5)
    `, [context.workspace.id, company.id, invoice.customer_id, session.userAccountId, JSON.stringify({
      invoiceId, paymentId, decision: input.decision, invoiceStatus: derived.status,
    })]);
    await appendAuditEntry(client, {
      workspaceId: context.workspace.id, companyId: company.id, ...auditIdentity(session),
      action: 'sales.payment.reviewed', resourceType: 'sales_payment', resourceId: paymentId,
      result: 'success', reason: input.reason, previousState: { status: previous.status },
      newState: { status: input.decision, invoiceId, invoiceStatus: derived.status, approvedAmount: derived.approvedAmount },
      correlationId,
    });
    return loadInvoice(client, invoiceId);
  });
}

export async function getPaymentInfrastructure(context: MembershipContext) {
  const company = companyFrom(context);
  if (!hasPermission(context, 'sales.payment.record') && !hasPermission(context, 'sales.payment.infrastructure.manage')) {
    throw new AppError(403, 'permission_denied', 'Payment infrastructure permission is required.');
  }
  return withTenantTransaction({ workspaceId: context.workspace.id, companyId: company.id }, async (client) => {
    const accounts = await client.query<{ id: string; display_name: string; bank_name: string; card_number: string | null }>(`
        SELECT id, display_name, bank_name,
          CASE WHEN card_number IS NULL THEN NULL ELSE right(card_number, 4) END AS card_number
        FROM financial_accounts WHERE is_active = true ORDER BY display_name
      `);
    const gateways = await client.query<{ id: string; name: string; provider_code: string; settlement_account_id: string }>(`
        SELECT id, name, provider_code, settlement_account_id FROM payment_gateways WHERE is_active = true ORDER BY name
      `);
    const policies = await client.query<{ payment_method: PaymentMethod; is_enabled: boolean; manual_review_required: boolean }>(`
        SELECT payment_method, is_enabled, manual_review_required FROM sales_payment_method_policies ORDER BY payment_method
      `);
    return {
      accounts: accounts.rows.map((row) => ({ id: row.id, name: row.display_name, bankName: row.bank_name, cardLastFour: row.card_number })),
      gateways: gateways.rows.map((row) => ({ id: row.id, name: row.name, providerCode: row.provider_code, settlementAccountId: row.settlement_account_id })),
      policies: policies.rows.map((row) => ({ method: row.payment_method, enabled: row.is_enabled, manualReviewRequired: row.manual_review_required })),
    };
  });
}
