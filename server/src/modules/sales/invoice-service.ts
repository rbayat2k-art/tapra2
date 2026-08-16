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
export const paymentReviewDecisions = ['approved', 'needs_correction'] as const;
export type PaymentReviewDecision = typeof paymentReviewDecisions[number];
export const paymentStatuses = ['submitted', 'approved', 'needs_correction'] as const;
export type PaymentStatus = typeof paymentStatuses[number];

const postgresBigintMax = 9_223_372_036_854_775_807n;
const rialPattern = /^(0|[1-9][0-9]*)$/;

export interface InvoiceLineInput {
  itemType: InvoiceItemType;
  catalogReference?: string;
  itemName: string;
  quantity: number;
  unitPrice: string;
  discountAmount: string;
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
  amount: string;
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

export interface CollectionAccountInput {
  displayName: string;
  bankName: string;
  maskedReference: string;
  isActive?: boolean;
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
  sales_approval_required: boolean;
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
  subtotalAmount: string;
  discountAmount: string;
  finalAmount: string;
  approvedPaymentAmount: string;
  salesApprovalRequired: boolean;
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
    itemName: string; quantity: number; unitPrice: string; discountAmount: string;
    lineTotal: string; sourceType: InvoiceLineSourceType; fulfillmentStatus: string;
    snapshot: Record<string, unknown>;
  }>;
  payments: Array<{
    id: string; amount: string; method: PaymentMethod; occurredAt: string;
    lastFourDigits: string | null; destinationAccountId: string | null;
    destinationAccountName: string | null; trackingNumber: string | null;
    receiptReference: string | null; status: PaymentStatus; recorderName: string;
    reviewerName: string | null; reviewedAt: string | null; reviewReason: string | null;
    correctsPaymentId: string | null; supersededByPaymentId: string | null;
  }>;
  history: Array<{ id: string; type: string; reason: string | null; actorName: string; occurredAt: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface SaleSeller {
  membershipId: string;
  userAccountId: string;
  fullName: string;
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

function requireAnyPermission(context: MembershipContext, permissions: string[]): void {
  if (!permissions.some((permission) => hasPermission(context, permission))) {
    throw new AppError(403, 'permission_denied', 'Required Sales permission is missing.');
  }
}

function iso(value: Date | string | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

function parseRial(value: string, options: { positive?: boolean; field: string }): bigint {
  if (!rialPattern.test(value)) {
    throw new AppError(400, 'invoice_amount_invalid', `${options.field} must be an integer decimal string in Rial.`);
  }
  const amount = BigInt(value);
  if (amount > postgresBigintMax || (options.positive ? amount <= 0n : amount < 0n)) {
    throw new AppError(400, 'invoice_amount_invalid', `${options.field} is outside the supported Rial range.`);
  }
  return amount;
}

async function lockIdempotencyKey(client: PoolClient, namespace: string, key: string): Promise<void> {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`${namespace}:${key}`]);
}

function calculateLines(lines: InvoiceLineInput[]) {
  const normalized = lines.map((line, index) => {
    const unitPrice = parseRial(line.unitPrice, { field: `Invoice Line ${index + 1} unit price` });
    const discountAmount = parseRial(line.discountAmount, { field: `Invoice Line ${index + 1} discount` });
    const gross = BigInt(line.quantity) * unitPrice;
    if (gross > postgresBigintMax || discountAmount > gross) {
      throw new AppError(400, 'invoice_amount_invalid', `Invoice Line ${index + 1} has an invalid amount.`);
    }
    return {
      ...line,
      unitPrice: unitPrice.toString(),
      discountAmount: discountAmount.toString(),
      lineNumber: index + 1,
      lineTotal: (gross - discountAmount).toString(),
      grossAmount: gross,
    };
  });
  const subtotalAmount = normalized.reduce((total, line) => total + line.grossAmount, 0n);
  const discountAmount = normalized.reduce((total, line) => total + BigInt(line.discountAmount), 0n);
  const finalAmount = subtotalAmount - discountAmount;
  if (subtotalAmount > postgresBigintMax || discountAmount > postgresBigintMax
    || finalAmount <= 0n || finalAmount > postgresBigintMax) {
    throw new AppError(400, 'invoice_amount_invalid', 'Invoice totals are outside the supported Rial range.');
  }
  return {
    lines: normalized.map(({ grossAmount: _grossAmount, ...line }) => line),
    subtotalAmount: subtotalAmount.toString(),
    discountAmount: discountAmount.toString(),
    finalAmount: finalAmount.toString(),
  };
}

const invoiceSelect = `
  SELECT invoice.id, invoice.invoice_code, invoice.revision, invoice.status, invoice.payment_status,
    invoice.currency, invoice.subtotal_amount, invoice.discount_amount, invoice.final_amount,
    invoice.sales_approval_required,
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

async function assertInvoiceReadable(
  client: PoolClient,
  context: MembershipContext,
  invoiceId: string,
  lock = false,
): Promise<InvoiceRow> {
  const readAll = hasPermission(context, 'sales.invoice.read_all');
  if (!readAll && !hasPermission(context, 'sales.invoice.read_own')) {
    throw new AppError(403, 'permission_denied', 'Permission to read Sales Invoices is required.');
  }
  const result = await client.query<InvoiceRow>(`
    ${invoiceSelect}
    WHERE invoice.id = $1 AND ($2::boolean OR sale.seller_membership_id = $3)
    ${lock ? 'FOR UPDATE OF invoice' : ''}
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
      tracking_number: string | null; receipt_reference: string | null; status: PaymentStatus;
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
      WHERE invoice_id = $1 AND status = 'approved' AND superseded_by_payment_id IS NULL
    `, [row.id]);
  return {
    id: row.id, code: row.invoice_code, revision: row.revision, status: row.status,
    paymentStatus: row.payment_status, currency: row.currency,
    subtotalAmount: row.subtotal_amount, discountAmount: row.discount_amount,
    finalAmount: row.final_amount, approvedPaymentAmount: approved.rows[0]?.total ?? '0',
    salesApprovalRequired: row.sales_approval_required,
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
      unitPrice: line.unit_price, discountAmount: line.discount_amount,
      lineTotal: line.line_total, sourceType: line.source_type,
      fulfillmentStatus: line.fulfillment_status, snapshot: line.item_snapshot ?? {},
    })),
    payments: payments.rows.map((payment) => ({
      id: payment.id, amount: payment.amount, method: payment.payment_method,
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
        catalog_reference, inventory_item_id, item_name, quantity, unit_price, discount_amount, line_total,
        source_type, item_snapshot
      ) VALUES ($1, $2, $3, $4, $5, $6, $7,
        (SELECT id FROM inventory_items
          WHERE workspace_id = $1 AND catalog_reference = $7 AND is_active = true AND $6 = 'goods'),
        $8, $9, $10, $11, $12, $13, $14)
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

export async function listSaleSellers(context: MembershipContext): Promise<SaleSeller[]> {
  requireAnyPermission(context, ['sales.sale.create', 'sales.sale.create_on_behalf']);
  const company = companyFrom(context);
  return withTenantTransaction({ workspaceId: context.workspace.id, companyId: company.id }, async (client) => {
    const result = await client.query<{
      membership_id: string; user_account_id: string; full_name: string;
    }>(`
      SELECT DISTINCT membership.id AS membership_id, account.id AS user_account_id, person.full_name
      FROM memberships membership
      JOIN persons person ON person.id = membership.person_id
      JOIN user_accounts account ON account.person_id = person.id AND account.is_active = true
      JOIN role_assignments assignment ON assignment.membership_id = membership.id
        AND assignment.workspace_id = membership.workspace_id
        AND assignment.scope_type IN ('COMPANY', 'SELF')
        AND assignment.company_id = $2
        AND (assignment.valid_until IS NULL OR assignment.valid_until > now())
      JOIN roles role ON role.id = assignment.role_id
        AND role.workspace_id = assignment.workspace_id AND role.is_active = true
      JOIN role_permissions permission ON permission.role_id = assignment.role_id
      WHERE membership.workspace_id = $1
        AND membership.company_id = $2
        AND membership.status = 'active'
        AND membership.valid_from <= now()
        AND (membership.valid_until IS NULL OR membership.valid_until > now())
        AND permission.permission_code = 'sales.sale.create'
      ORDER BY person.full_name
    `, [context.workspace.id, company.id]);
    return result.rows.map((row) => ({
      membershipId: row.membership_id, userAccountId: row.user_account_id, fullName: row.full_name,
    }));
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
    await lockIdempotencyKey(client, 'sales.sale', idempotencyKey);
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
        AND assignment.scope_type IN ('COMPANY', 'SELF')
        AND assignment.company_id = $2
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
    const invoicePolicy = await client.query<{ supervisor_approval_required: boolean }>(`
      SELECT supervisor_approval_required FROM sales_invoice_policies
      WHERE workspace_id = $1 AND company_id = $2
    `, [context.workspace.id, company.id]);
    const salesApprovalRequired = invoicePolicy.rows[0]?.supervisor_approval_required ?? true;
    const initialStatus = salesApprovalRequired ? 'awaiting_supervisor_approval' : 'awaiting_payment';
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
        subtotal_amount, discount_amount, final_amount, created_by_user_account_id,
        status, sales_approval_required
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [
      invoiceId, context.workspace.id, company.id, saleId, invoiceCode,
      calculation.subtotalAmount, calculation.discountAmount, calculation.finalAmount, session.userAccountId,
      initialStatus, salesApprovalRequired,
    ]);
    await insertInvoiceLines(client, context, invoiceId, 1, calculation.lines);
    await client.query(`
      INSERT INTO sales_invoice_revisions(
        workspace_id, company_id, invoice_id, revision, content_snapshot, created_by_user_account_id
      ) VALUES ($1, $2, $3, 1, $4, $5)
    `, [context.workspace.id, company.id, invoiceId, JSON.stringify(revisionSnapshot(calculation)), session.userAccountId]);
    await appendInvoiceEvent(client, context, session, invoiceId, 'invoice_created', correlationId, {
      newState: { status: initialStatus, revision: 1, finalAmount: calculation.finalAmount, salesApprovalRequired },
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
    const invoice = await assertInvoiceReadable(client, context, invoiceId, true);
    const isDraft = invoice.status === 'awaiting_supervisor_approval';
    const automaticallyApprovedDraft = !invoice.sales_approval_required && invoice.status === 'awaiting_payment';
    requirePermission(context, isDraft || automaticallyApprovedDraft ? 'sales.invoice.edit_draft' : 'sales.invoice.amend');
    if (!isDraft && invoice.status !== 'awaiting_payment') {
      throw new AppError(409, 'invoice_revision_blocked', 'Only an unapproved Invoice or an approved Invoice without Payment activity can be revised.');
    }
    if (!isDraft && !automaticallyApprovedDraft && (!reason || reason.trim().length < 3)) {
      throw new AppError(400, 'invoice_revision_reason_required', 'An approved Invoice amendment requires a reason.');
    }
    const payments = await client.query<{ count: string }>(`
      SELECT count(*)::text AS count FROM sales_payments
      WHERE invoice_id = $1
    `, [invoiceId]);
    if (Number(payments.rows[0]?.count) > 0) {
      throw new AppError(409, 'invoice_has_payments', 'An Invoice with Payment activity cannot be revised by this flow.');
    }
    const nextRevision = invoice.revision + 1;
    const nextStatus = invoice.sales_approval_required ? 'awaiting_supervisor_approval' : 'awaiting_payment';
    await insertInvoiceLines(client, context, invoiceId, nextRevision, calculation.lines);
    await client.query(`
      INSERT INTO sales_invoice_revisions(
        workspace_id, company_id, invoice_id, revision, content_snapshot, reason, created_by_user_account_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      context.workspace.id, company.id, invoiceId, nextRevision,
      JSON.stringify(revisionSnapshot(calculation)), reason ?? 'Draft Invoice edited before financial activity', session.userAccountId,
    ]);
    await client.query(`
      UPDATE sales_invoices SET revision = $2, subtotal_amount = $3, discount_amount = $4,
        final_amount = $5, status = $6, payment_status = 'unpaid',
        supervisor_approved_by_user_account_id = NULL, supervisor_approved_at = NULL,
        updated_at = now(), version = version + 1 WHERE id = $1
    `, [invoiceId, nextRevision, calculation.subtotalAmount, calculation.discountAmount, calculation.finalAmount, nextStatus]);
    await appendInvoiceEvent(client, context, session, invoiceId, 'invoice_revised', correlationId, {
      previousState: { revision: invoice.revision, finalAmount: invoice.final_amount, status: invoice.status },
      newState: { revision: nextRevision, finalAmount: calculation.finalAmount, status: nextStatus },
      reason,
    });
    await appendAuditEntry(client, {
      workspaceId: context.workspace.id, companyId: company.id, ...auditIdentity(session),
      action: 'sales.invoice.revised', resourceType: 'sales_invoice', resourceId: invoiceId,
      result: 'success', reason,
      previousState: { revision: invoice.revision, finalAmount: invoice.final_amount, status: invoice.status },
      newState: { revision: nextRevision, finalAmount: calculation.finalAmount, status: nextStatus },
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
    const invoice = await assertInvoiceReadable(client, context, invoiceId, true);
    if (!invoice.sales_approval_required) {
      throw new AppError(409, 'sales_approval_not_required', 'Supervisor approval is disabled for this Invoice.');
    }
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
  status: string; paymentStatus: string; approvedAmount: string; exactPaid: boolean;
}> {
  const invoice = await client.query<{
    final_amount: string; supervisor_approved_at: Date | null; status: string; sales_approval_required: boolean;
  }>(`
    SELECT final_amount, supervisor_approved_at, status, sales_approval_required
    FROM sales_invoices WHERE id = $1 FOR UPDATE
  `, [invoiceId]);
  const row = invoice.rows[0];
  if (!row) throw new AppError(404, 'sales_invoice_not_found', 'Sales Invoice was not found.');
  const totals = await client.query<{
    approved: string; submitted_count: string; correction_count: string;
  }>(`
    SELECT COALESCE(sum(amount) FILTER (WHERE status = 'approved'), 0)::text AS approved,
      count(*) FILTER (WHERE status = 'submitted')::text AS submitted_count,
      count(*) FILTER (WHERE status = 'needs_correction')::text AS correction_count
    FROM sales_payments WHERE invoice_id = $1 AND superseded_by_payment_id IS NULL
  `, [invoiceId]);
  const approvedAmount = BigInt(totals.rows[0]?.approved ?? '0');
  const finalAmount = BigInt(row.final_amount);
  const hasSubmitted = Number(totals.rows[0]?.submitted_count ?? 0) > 0;
  const hasCorrection = Number(totals.rows[0]?.correction_count ?? 0) > 0;
  let status = 'awaiting_payment';
  let paymentStatus = 'unpaid';
  if (row.sales_approval_required && !row.supervisor_approved_at) status = 'awaiting_supervisor_approval';
  else if (hasCorrection) { status = 'payment_correction_required'; paymentStatus = 'correction_required'; }
  else if (hasSubmitted) { status = 'awaiting_financial_review'; paymentStatus = 'submitted'; }
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
  return { status, paymentStatus, approvedAmount: approvedAmount.toString(), exactPaid };
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
  const amount = parseRial(input.amount, { positive: true, field: 'Payment amount' }).toString();
  return withTenantTransaction({ workspaceId: context.workspace.id, companyId: company.id }, async (client) => {
    await lockIdempotencyKey(client, 'sales.payment', idempotencyKey);
    const invoice = await assertInvoiceReadable(client, context, invoiceId, true);
    const repeated = await client.query<{ invoice_id: string }>('SELECT invoice_id FROM sales_payments WHERE idempotency_key = $1', [idempotencyKey]);
    if (repeated.rows[0]) {
      if (repeated.rows[0].invoice_id !== invoiceId) throw new AppError(409, 'idempotency_key_reused', 'Idempotency key belongs to another Payment.');
      return loadInvoice(client, invoice);
    }
    if ((invoice.sales_approval_required && !invoice.supervisor_approved_at)
      || ['cancelled', 'cancellation_requested', 'financially_approved'].includes(invoice.status)) {
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
        SELECT id FROM sales_payments
        WHERE id = $1 AND invoice_id = $2 AND status = 'needs_correction'
          AND superseded_by_payment_id IS NULL
        FOR UPDATE
      `, [input.correctsPaymentId, invoiceId]);
      if (!previous.rows[0]) throw new AppError(409, 'payment_correction_invalid', 'Only a returned Payment can be corrected.');
    }
    const paymentId = randomUUID();
    await client.query(`
      INSERT INTO sales_payments(
        id, workspace_id, company_id, invoice_id, amount, payment_method, occurred_at,
        last_four_digits, destination_account_id, tracking_number, receipt_reference,
        recorded_by_user_account_id, creator_actor_user_account_id,
        creator_effective_user_account_id, corrects_payment_id, idempotency_key
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    `, [
      paymentId, context.workspace.id, company.id, invoiceId, amount, input.paymentMethod,
      input.occurredAt, input.lastFourDigits ?? null, input.destinationAccountId, input.trackingNumber,
      input.receiptReference ?? null, session.userAccountId, session.actorUserAccountId,
      session.userAccountId, input.correctsPaymentId ?? null, idempotencyKey,
    ]);
    if (input.correctsPaymentId) {
      await client.query(`
        UPDATE sales_payments SET superseded_by_payment_id = $2,
          updated_at = now(), version = version + 1
        WHERE id = $1 AND status = 'needs_correction' AND superseded_by_payment_id IS NULL
      `, [input.correctsPaymentId, paymentId]);
    }
    const derived = await deriveInvoicePaymentState(client, invoiceId);
    await appendInvoiceEvent(client, context, session, invoiceId, 'payment_recorded', correlationId, {
      newState: { paymentId, amount, method: input.paymentMethod, invoiceStatus: derived.status },
    });
    await client.query(`
      INSERT INTO customer_timeline_events(
        workspace_id, company_id, customer_id, actor_user_account_id, event_type, summary, metadata
      ) VALUES ($1, $2, $3, $4, 'sales_payment_recorded', 'Payment declared for Sales Invoice.', $5)
    `, [context.workspace.id, company.id, invoice.customer_id, session.userAccountId, JSON.stringify({ invoiceId, paymentId, amount })]);
    await appendAuditEntry(client, {
      workspaceId: context.workspace.id, companyId: company.id, ...auditIdentity(session),
      action: 'sales.payment.recorded', resourceType: 'sales_payment', resourceId: paymentId,
      result: 'success', newState: { invoiceId, amount, method: input.paymentMethod,
        creatorActorUserAccountId: session.actorUserAccountId,
        creatorEffectiveUserAccountId: session.userAccountId,
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
  if (session.impersonationId) {
    throw new AppError(403, 'financial_review_impersonation_forbidden', 'Financial Review is forbidden during impersonation.');
  }
  const company = companyFrom(context);
  return withTenantTransaction({ workspaceId: context.workspace.id, companyId: company.id }, async (client) => {
    const invoice = await assertInvoiceReadable(client, context, invoiceId, true);
    const payment = await client.query<{
      id: string; status: PaymentStatus; recorded_by_user_account_id: string; amount: string;
      creator_actor_user_account_id: string; creator_effective_user_account_id: string;
    }>(`
      SELECT id, status, recorded_by_user_account_id, amount,
        creator_actor_user_account_id, creator_effective_user_account_id
      FROM sales_payments
      WHERE id = $1 AND invoice_id = $2 FOR UPDATE
    `, [paymentId, invoiceId]);
    const previous = payment.rows[0];
    if (!previous) throw new AppError(404, 'sales_payment_not_found', 'Payment was not found on this Invoice.');
    if (previous.status !== 'submitted') throw new AppError(409, 'payment_already_reviewed', 'Only a submitted Payment can be reviewed.');
    const creatorIdentities = new Set([
      previous.recorded_by_user_account_id,
      previous.creator_actor_user_account_id,
      previous.creator_effective_user_account_id,
    ]);
    if (creatorIdentities.has(session.actorUserAccountId) || creatorIdentities.has(session.userAccountId)) {
      throw new AppError(409, 'payment_self_review_denied', 'A Payment creator identity cannot review the same Payment.');
    }
    if (input.decision !== 'approved' && (!input.reason || input.reason.trim().length < 3)) {
      throw new AppError(400, 'payment_review_reason_required', 'A reason is required when Payment is not approved.');
    }
    if (input.decision === 'approved') {
      const totals = await client.query<{ approved: string }>(`
        SELECT COALESCE(sum(amount) FILTER (WHERE status = 'approved'), 0)::text AS approved
        FROM sales_payments
        WHERE invoice_id = $1 AND superseded_by_payment_id IS NULL
      `, [invoiceId]);
      if (BigInt(totals.rows[0]?.approved ?? '0') + BigInt(previous.amount) > BigInt(invoice.final_amount)) {
        throw new AppError(409, 'payment_overpayment_denied', 'Approving this Payment would exceed the Invoice total.');
      }
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
  const canManage = hasPermission(context, 'sales.payment.infrastructure.manage');
  if (!hasPermission(context, 'sales.payment.record') && !canManage) {
    throw new AppError(403, 'permission_denied', 'Payment infrastructure permission is required.');
  }
  return withTenantTransaction({ workspaceId: context.workspace.id, companyId: company.id }, async (client) => {
    const accounts = await client.query<{
      id: string; display_name: string; bank_name: string; masked_reference: string | null; is_active: boolean;
    }>(`
        SELECT id, display_name, bank_name,
          COALESCE(masked_reference,
            CASE WHEN card_number IS NULL THEN NULL ELSE '•••• ' || right(card_number, 4) END,
            CASE WHEN iban IS NULL THEN NULL ELSE '•••• ' || right(iban, 4) END,
            CASE WHEN account_number IS NULL THEN NULL ELSE '•••• ' || right(account_number, 4) END
          ) AS masked_reference,
          is_active
        FROM financial_accounts WHERE ($1::boolean OR is_active = true) ORDER BY is_active DESC, display_name
      `, [canManage]);
    const gateways = await client.query<{ id: string; name: string; provider_code: string; settlement_account_id: string }>(`
        SELECT id, name, provider_code, settlement_account_id FROM payment_gateways WHERE is_active = true ORDER BY name
      `);
    const policies = await client.query<{ payment_method: PaymentMethod; is_enabled: boolean; manual_review_required: boolean }>(`
        SELECT payment_method, is_enabled, manual_review_required FROM sales_payment_method_policies ORDER BY payment_method
      `);
    const approvalPolicy = await client.query<{ supervisor_approval_required: boolean }>(`
      SELECT supervisor_approval_required FROM sales_invoice_policies
      WHERE workspace_id = $1 AND company_id = $2
    `, [context.workspace.id, company.id]);
    return {
      accounts: accounts.rows.map((row) => ({
        id: row.id, name: row.display_name, bankName: row.bank_name,
        maskedReference: row.masked_reference, active: row.is_active,
      })),
      gateways: gateways.rows.map((row) => ({ id: row.id, name: row.name, providerCode: row.provider_code, settlementAccountId: row.settlement_account_id })),
      policies: policies.rows.map((row) => ({ method: row.payment_method, enabled: row.is_enabled, manualReviewRequired: row.manual_review_required })),
      salesApprovalPolicy: { supervisorApprovalRequired: approvalPolicy.rows[0]?.supervisor_approval_required ?? true },
    };
  });
}

export async function createCollectionAccount(
  context: MembershipContext,
  session: AuthenticatedSession,
  input: CollectionAccountInput,
  correlationId: string,
) {
  requirePermission(context, 'sales.payment.infrastructure.manage');
  const company = companyFrom(context);
  return withTenantTransaction({ workspaceId: context.workspace.id, companyId: company.id }, async (client) => {
    const result = await client.query<{
      id: string; display_name: string; bank_name: string; masked_reference: string; is_active: boolean;
    }>(`
      INSERT INTO financial_accounts(workspace_id, company_id, display_name, bank_name, masked_reference, is_active)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, display_name, bank_name, masked_reference, is_active
    `, [context.workspace.id, company.id, input.displayName, input.bankName, input.maskedReference, input.isActive ?? true]);
    const account = result.rows[0]!;
    await appendAuditEntry(client, {
      workspaceId: context.workspace.id, companyId: company.id, ...auditIdentity(session),
      action: 'sales.collection_account.created', resourceType: 'financial_account', resourceId: account.id,
      result: 'success', newState: {
        displayName: account.display_name, bankName: account.bank_name,
        maskedReference: account.masked_reference, active: account.is_active,
      }, correlationId,
    });
    return {
      id: account.id, name: account.display_name, bankName: account.bank_name,
      maskedReference: account.masked_reference, active: account.is_active,
    };
  });
}

export async function updateCollectionAccount(
  context: MembershipContext,
  session: AuthenticatedSession,
  accountId: string,
  input: CollectionAccountInput,
  correlationId: string,
) {
  requirePermission(context, 'sales.payment.infrastructure.manage');
  const company = companyFrom(context);
  return withTenantTransaction({ workspaceId: context.workspace.id, companyId: company.id }, async (client) => {
    const previous = await client.query<{
      display_name: string; bank_name: string; masked_reference: string | null; is_active: boolean;
    }>('SELECT display_name, bank_name, masked_reference, is_active FROM financial_accounts WHERE id = $1', [accountId]);
    if (!previous.rows[0]) throw new AppError(404, 'collection_account_not_found', 'Collection Account was not found.');
    const result = await client.query<{
      id: string; display_name: string; bank_name: string; masked_reference: string; is_active: boolean;
    }>(`
      UPDATE financial_accounts SET display_name = $2, bank_name = $3, masked_reference = $4,
        is_active = $5, updated_at = now()
      WHERE id = $1
      RETURNING id, display_name, bank_name, masked_reference, is_active
    `, [accountId, input.displayName, input.bankName, input.maskedReference, input.isActive ?? true]);
    const account = result.rows[0]!;
    await appendAuditEntry(client, {
      workspaceId: context.workspace.id, companyId: company.id, ...auditIdentity(session),
      action: 'sales.collection_account.updated', resourceType: 'financial_account', resourceId: account.id,
      result: 'success', previousState: {
        displayName: previous.rows[0].display_name, bankName: previous.rows[0].bank_name,
        maskedReference: previous.rows[0].masked_reference, active: previous.rows[0].is_active,
      }, newState: {
        displayName: account.display_name, bankName: account.bank_name,
        maskedReference: account.masked_reference, active: account.is_active,
      }, correlationId,
    });
    return {
      id: account.id, name: account.display_name, bankName: account.bank_name,
      maskedReference: account.masked_reference, active: account.is_active,
    };
  });
}

export async function updateSalesApprovalPolicy(
  context: MembershipContext,
  session: AuthenticatedSession,
  supervisorApprovalRequired: boolean,
  correlationId: string,
) {
  requirePermission(context, 'sales.payment.infrastructure.manage');
  const company = companyFrom(context);
  return withTenantTransaction({ workspaceId: context.workspace.id, companyId: company.id }, async (client) => {
    const previous = await client.query<{ supervisor_approval_required: boolean }>(`
      SELECT supervisor_approval_required FROM sales_invoice_policies
      WHERE workspace_id = $1 AND company_id = $2 FOR UPDATE
    `, [context.workspace.id, company.id]);
    const previousRequired = previous.rows[0]?.supervisor_approval_required ?? true;
    await client.query(`
      INSERT INTO sales_invoice_policies(
        workspace_id, company_id, supervisor_approval_required, updated_by_user_account_id, updated_at
      ) VALUES ($1, $2, $3, $4, now())
      ON CONFLICT (workspace_id, company_id) DO UPDATE SET
        supervisor_approval_required = EXCLUDED.supervisor_approval_required,
        updated_by_user_account_id = EXCLUDED.updated_by_user_account_id,
        updated_at = now()
    `, [context.workspace.id, company.id, supervisorApprovalRequired, session.userAccountId]);
    await appendAuditEntry(client, {
      workspaceId: context.workspace.id, companyId: company.id, ...auditIdentity(session),
      action: 'sales.invoice_approval_policy.updated', resourceType: 'sales_invoice_policy', resourceId: company.id,
      result: 'success', previousState: { supervisorApprovalRequired: previousRequired },
      newState: { supervisorApprovalRequired }, correlationId,
    });
    return { supervisorApprovalRequired };
  });
}
