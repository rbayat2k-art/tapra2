import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotEnv } from 'dotenv';
import { Client } from 'pg';
import { closePool } from '../src/infrastructure/database/pool.js';
import { hashPassword } from '../src/modules/identity/password.js';
import type { AuthenticatedSession, MembershipContext } from '../src/modules/identity/types.js';
import { assignSalesLead, createSalesLead, recordSalesCall } from '../src/modules/sales/sales-service.js';
import { approveSalesInvoice, createSaleAndInvoice, recordSalesPayment, reviewSalesPayment } from '../src/modules/sales/invoice-service.js';
import { createInventoryItem, createWarehouse, createWarehouseLocation, listWarehouseOverview, type WarehouseMutationContext } from '../src/modules/warehouse/core-service.js';
import { createReceipt, createReservation, postReceipt } from '../src/modules/warehouse/operations-service.js';

loadDotEnv({ path: '.env.local', quiet: true });
loadDotEnv({ quiet: true });

const ids = {
  workspaceAlpha: '10000000-0000-4000-8000-000000000001',
  workspaceBeta: '10000000-0000-4000-8000-000000000002',
  companyAlpha: '20000000-0000-4000-8000-000000000001',
  companyBeta: '20000000-0000-4000-8000-000000000002',
  personDemo: '30000000-0000-4000-8000-000000000001',
  personAlphaOnly: '30000000-0000-4000-8000-000000000002',
  personSalesOne: '30000000-0000-4000-8000-000000000003',
  personSalesTwo: '30000000-0000-4000-8000-000000000004',
  personSalesSupervisor: '30000000-0000-4000-8000-000000000005',
  personPaperEntry: '30000000-0000-4000-8000-000000000006',
  personFinanceReviewer: '30000000-0000-4000-8000-000000000007',
  personCustomerOperator: '30000000-0000-4000-8000-000000000008',
  personWarehouseOperator: '30000000-0000-4000-8000-000000000009',
  personWarehouseApprover: '30000000-0000-4000-8000-000000000010',
  accountDemo: '40000000-0000-4000-8000-000000000001',
  accountAlphaOnly: '40000000-0000-4000-8000-000000000002',
  accountSalesOne: '40000000-0000-4000-8000-000000000003',
  accountSalesTwo: '40000000-0000-4000-8000-000000000004',
  accountSalesSupervisor: '40000000-0000-4000-8000-000000000005',
  accountPaperEntry: '40000000-0000-4000-8000-000000000006',
  accountFinanceReviewer: '40000000-0000-4000-8000-000000000007',
  accountCustomerOperator: '40000000-0000-4000-8000-000000000008',
  accountWarehouseOperator: '40000000-0000-4000-8000-000000000009',
  accountWarehouseApprover: '40000000-0000-4000-8000-000000000010',
  membershipDemoAlpha: '50000000-0000-4000-8000-000000000001',
  membershipDemoBeta: '50000000-0000-4000-8000-000000000002',
  membershipAlphaOnly: '50000000-0000-4000-8000-000000000003',
  membershipSalesOne: '50000000-0000-4000-8000-000000000004',
  membershipSalesTwo: '50000000-0000-4000-8000-000000000005',
  membershipSalesSupervisor: '50000000-0000-4000-8000-000000000006',
  membershipPaperEntry: '50000000-0000-4000-8000-000000000007',
  membershipFinanceReviewer: '50000000-0000-4000-8000-000000000008',
  membershipCustomerOperator: '50000000-0000-4000-8000-000000000009',
  membershipWarehouseOperator: '50000000-0000-4000-8000-000000000010',
  membershipWarehouseApprover: '50000000-0000-4000-8000-000000000011',
  roleAlphaManager: '60000000-0000-4000-8000-000000000001',
  roleBetaManager: '60000000-0000-4000-8000-000000000002',
  roleAlphaReader: '60000000-0000-4000-8000-000000000003',
  roleWorkspaceAdmin: '60000000-0000-4000-8000-000000000006',
  roleAlphaSeller: '60000000-0000-4000-8000-000000000005',
  roleAlphaSalesSupervisor: '60000000-0000-4000-8000-000000000007',
  roleAlphaPaperEntry: '60000000-0000-4000-8000-000000000008',
  roleAlphaFinanceReviewer: '60000000-0000-4000-8000-000000000009',
  roleAlphaCustomerOperator: '60000000-0000-4000-8000-000000000010',
  roleAlphaWarehouseOperator: '60000000-0000-4000-8000-000000000011',
  roleAlphaWarehouseApprover: '60000000-0000-4000-8000-000000000012',
  customerIdentityAlpha: '65000000-0000-4000-8000-000000000001',
  customerIdentityBeta: '65000000-0000-4000-8000-000000000002',
  customerAlpha: '70000000-0000-4000-8000-000000000001',
  customerBeta: '70000000-0000-4000-8000-000000000002',
  financialAccountAlpha: '80000000-0000-4000-8000-000000000001',
  financialAccountBeta: '80000000-0000-4000-8000-000000000002',
  qaReceiptKey: '90000000-0000-4000-8000-000000000001',
  qaLeadKey: '90000000-0000-4000-8000-000000000002',
  qaAssignmentKey: '90000000-0000-4000-8000-000000000003',
  qaCallKey: '90000000-0000-4000-8000-000000000004',
  qaSaleKey: '90000000-0000-4000-8000-000000000005',
  qaPaymentKey: '90000000-0000-4000-8000-000000000006',
  qaReservationKey: '90000000-0000-4000-8000-000000000007',
  qaCorrelationId: '90000000-0000-4000-8000-000000000008',
} as const;

type SeedEnvironment = 'development' | 'test' | 'production';

export function assertSafeSeedTarget(
  connectionString: string,
  expectedRole: 'tapra2_owner' | 'tapra2_app',
  environment = process.env.NODE_ENV as SeedEnvironment | undefined,
): { database: string } {
  const activeEnvironment = environment ?? 'development';
  if (activeEnvironment === 'production') {
    throw new Error('Development seed is forbidden when NODE_ENV=production.');
  }
  if (activeEnvironment !== 'development' && activeEnvironment !== 'test') {
    throw new Error('Development seed requires NODE_ENV=development or NODE_ENV=test.');
  }
  const parsed = new URL(connectionString);
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  const role = decodeURIComponent(parsed.username);
  const expectedDatabase = activeEnvironment === 'test' ? 'tapra2_test' : 'tapra2_dev';
  if (database !== expectedDatabase) {
    throw new Error(`Development seed requires the dedicated ${expectedDatabase} database.`);
  }
  if (role !== expectedRole) {
    throw new Error(`Development seed requires the restricted ${expectedRole} role.`);
  }
  return { database };
}

function qaContext(
  membershipId: string,
  role: { id: string; code: string; name: string },
  permissions: string[],
): MembershipContext {
  return {
    membershipId,
    workspace: { id: ids.workspaceAlpha, name: 'فضای کاری آلفا', slug: 'tapra-alpha' },
    company: { id: ids.companyAlpha, name: 'شرکت آلفا', code: 'ALPHA' },
    organizationUnit: null,
    scope: { type: 'COMPANY', id: ids.companyAlpha },
    contextKey: `${membershipId}:COMPANY:${ids.companyAlpha}`,
    roles: [role],
    permissions,
  };
}

function qaSession(
  userAccountId: string,
  personId: string,
  membershipId: string,
  fullName: string,
  email: string,
): AuthenticatedSession {
  return {
    sessionId: `seed-${userAccountId}`,
    userAccountId, personId, fullName, email, requiresPasswordChange: false,
    csrfToken: 'development-seed', activeMembershipId: membershipId,
    activeScopeType: 'COMPANY', activeScopeId: ids.companyAlpha,
    actorUserAccountId: userAccountId, actorPersonId: personId, actorFullName: fullName,
    actorEmail: email, actorMembershipId: membershipId, actorScopeType: 'COMPANY',
    actorScopeId: ids.companyAlpha, impersonationId: null, impersonationReason: null,
    impersonationExpiresAt: null,
  };
}

async function seedOperationalAcceptanceData(): Promise<void> {
  const managerContext = qaContext(ids.membershipDemoAlpha, {
    id: ids.roleAlphaManager, code: 'customer_manager', name: 'مدیر مشتریان',
  }, [
    'sales.lead.create', 'sales.lead.read_all', 'sales.lead.assign', 'sales.lead.reassign',
    'sales.invoice.read_all', 'sales.invoice.supervisor_approve',
  ]);
  const managerSession = qaSession(ids.accountDemo, ids.personDemo, ids.membershipDemoAlpha, 'کاربر نمایشی Tapra2', 'demo@tapra.local');
  const sellerContext = qaContext(ids.membershipSalesOne, {
    id: ids.roleAlphaSeller, code: 'sales_seller', name: 'فروشنده',
  }, ['sales.queue.read', 'sales.call.create', 'sales.sale.create', 'sales.invoice.read_own', 'sales.payment.record']);
  const sellerSession = qaSession(ids.accountSalesOne, ids.personSalesOne, ids.membershipSalesOne, 'فروشنده نمونه یک', 'sales-one@tapra.local');
  const financeContext = qaContext(ids.membershipFinanceReviewer, {
    id: ids.roleAlphaFinanceReviewer, code: 'finance_reviewer', name: 'بررسی‌کننده مالی',
  }, ['sales.invoice.read_all', 'sales.payment.review']);
  const financeSession = qaSession(ids.accountFinanceReviewer, ids.personFinanceReviewer, ids.membershipFinanceReviewer, 'بررسی‌کننده مالی', 'finance-review@tapra.local');
  const warehousePermissions = [
    'warehouse.read', 'warehouse.manage', 'warehouse.item.manage', 'warehouse.receiving.create',
    'warehouse.receiving.post', 'warehouse.receiving.manual', 'warehouse.reservation.manage',
    'warehouse.transfer.manage', 'warehouse.adjustment.create', 'warehouse.count.create',
    'warehouse.return.manage', 'warehouse.movement.reverse', 'sales.invoice.read_all',
  ];
  const warehouseContext = qaContext(ids.membershipWarehouseOperator, {
    id: ids.roleAlphaWarehouseOperator, code: 'warehouse_operator', name: 'اپراتور انبار',
  }, warehousePermissions);
  const warehouseSession = qaSession(ids.accountWarehouseOperator, ids.personWarehouseOperator, ids.membershipWarehouseOperator, 'اپراتور انبار', 'warehouse-operator@tapra.local');
  const mutation: WarehouseMutationContext = { context: warehouseContext, session: warehouseSession, correlationId: ids.qaCorrelationId };

  let overview = await listWarehouseOverview(warehouseContext) as {
    warehouses: Array<{ id: string; code: string }>;
    locations: Array<{ id: string; warehouseId: string; locationType: string }>;
    items: Array<{ id: string; catalogReference: string }>;
    movements: Array<{ sourceType: string }>;
    reservations: Array<{ invoiceLineId: string; status: string }>;
  };
  let warehouse = overview.warehouses.find((entry) => entry.code === 'QA-MAIN');
  if (!warehouse) warehouse = await createWarehouse(mutation, {
    code: 'QA-MAIN', name: 'انبار پذیرش مرکزی', description: 'داده ایزوله محیط توسعه و پذیرش',
  }) as { id: string; code: string };
  const requiredLocations = [
    ['QA-RECEIVE', 'دریافت پذیرش', 'RECEIVING'],
    ['QA-SELLABLE', 'قابل فروش پذیرش', 'SELLABLE'],
    ['QA-RETURNS', 'برگشتی پذیرش', 'RETURNS'],
    ['QA-QUARANTINE', 'قرنطینه پذیرش', 'QUARANTINE'],
    ['QA-DAMAGED', 'آسیب‌دیده پذیرش', 'DAMAGED'],
  ] as const;
  for (const [code, name, locationType] of requiredLocations) {
    if (!overview.locations.some((entry) => entry.warehouseId === warehouse!.id && entry.locationType === locationType)) {
      await createWarehouseLocation(mutation, warehouse.id, { code, name, locationType });
    }
  }
  let item = overview.items.find((entry) => entry.catalogReference === 'QA-GOODS-001');
  if (!item) item = await createInventoryItem(mutation, {
    sku: 'QA-GOODS-001', name: 'کالای نمونه پذیرش', catalogReference: 'QA-GOODS-001', trackingMode: 'NONE', uom: 'PCS',
  }) as { id: string; catalogReference: string };
  overview = await listWarehouseOverview(warehouseContext) as typeof overview;
  const receivingLocation = overview.locations.find((entry) => entry.warehouseId === warehouse!.id && entry.locationType === 'RECEIVING');
  if (!receivingLocation) throw new Error('Operational seed receiving location was not resolved.');
  if (!overview.movements.some((entry) => entry.sourceType === 'WAREHOUSE_RECEIPT')) {
    const receipt = await createReceipt(mutation, {
      warehouseId: warehouse.id, receivingLocationId: receivingLocation.id, receiptType: 'PURCHASE',
      sourceNote: 'رسید خرید نمونه پذیرش', lines: [{ inventoryItemId: item.id, quantity: '25', evidenceNote: 'سند امن توسعه' }],
    }, ids.qaReceiptKey);
    await postReceipt(mutation, receipt.id);
  }

  const lead = await createSalesLead(managerContext, managerSession, {
    customerId: ids.customerAlpha, source: 'داده پذیرش محلی', declaredInterest: 'کالای نمونه پذیرش',
    priority: 'high', campaignReference: 'QA-CAMPAIGN-01', context: { environment: 'development' },
  }, ids.qaLeadKey, ids.qaCorrelationId);
  const assigned = lead.currentAssignee?.membershipId === ids.membershipSalesOne
    ? lead
    : await assignSalesLead(managerContext, managerSession, lead.id, { targetMembershipId: ids.membershipSalesOne }, ids.qaAssignmentKey, ids.qaCorrelationId);
  if (assigned.calls.length === 0) {
    await recordSalesCall(sellerContext, sellerSession, lead.id, {
      outcome: 'ready_for_invoice', startedAt: new Date(Date.now() - 15 * 60_000).toISOString(),
      note: 'تماس مؤثر نمونه برای سناریوی پذیرش', context: { environment: 'development' },
    }, ids.qaCallKey, ids.qaCorrelationId);
  }
  let invoice = await createSaleAndInvoice(sellerContext, sellerSession, {
    customerId: ids.customerAlpha, leadId: lead.id, entryMode: 'direct', source: { environment: 'development' },
    lines: [{ itemType: 'goods', catalogReference: 'QA-GOODS-001', itemName: 'کالای نمونه پذیرش', quantity: 2, unitPrice: '5000000', discountAmount: '0', sourceType: 'manual_addition' }],
  }, ids.qaSaleKey, ids.qaCorrelationId);
  if (invoice.status === 'awaiting_supervisor_approval') invoice = await approveSalesInvoice(managerContext, managerSession, invoice.id, ids.qaCorrelationId);
  if (invoice.status === 'awaiting_payment') invoice = await recordSalesPayment(sellerContext, sellerSession, invoice.id, {
    amount: invoice.finalAmount, paymentMethod: 'card_to_card', occurredAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    lastFourDigits: '1234', destinationAccountId: ids.financialAccountAlpha, trackingNumber: 'QA-PAYMENT-001', receiptReference: 'QA-RECEIPT-001',
  }, ids.qaPaymentKey, ids.qaCorrelationId);
  const submittedPayment = invoice.payments.find((payment) => payment.status === 'submitted');
  if (submittedPayment) invoice = await reviewSalesPayment(financeContext, financeSession, invoice.id, submittedPayment.id, { decision: 'approved' }, ids.qaCorrelationId);
  const reservableLine = invoice.lines.find((line) => line.itemType === 'goods' && line.fulfillmentStatus === 'eligible');
  overview = await listWarehouseOverview(warehouseContext) as typeof overview;
  if (reservableLine && !overview.reservations.some((entry) => entry.invoiceLineId === reservableLine.id && entry.status !== 'RELEASED')) {
    await createReservation(mutation, { invoiceLineId: reservableLine.id }, ids.qaReservationKey);
  }
}

export async function seedDatabase(connectionString = process.env.DATABASE_MIGRATION_URL): Promise<void> {
  if (!connectionString?.startsWith('postgresql://')) throw new Error('DATABASE_MIGRATION_URL is required.');
  const migrationTarget = assertSafeSeedTarget(connectionString, 'tapra2_owner');
  const client = new Client({ connectionString, application_name: 'tapra2_seed' });
  await client.connect();
  try {
    const demoHash = await hashPassword('TapraDemo!2026', 'tapra2-demo-seed');
    const alphaHash = await hashPassword('TapraAlpha!2026', 'tapra2-alpha-seed');
    const salesHash = await hashPassword('TapraSales!2026', 'tapra2-sales-seed');
    const operationsHash = await hashPassword('TapraOperations!2026', 'tapra2-operations-seed');
    const financeHash = await hashPassword('TapraFinance!2026', 'tapra2-finance-seed');
    const warehouseHash = await hashPassword('TapraWarehouse!2026', 'tapra2-warehouse-seed');
    await client.query('BEGIN');
    await client.query(`
      INSERT INTO workspaces(id, slug, name) VALUES
        ($1, 'tapra-alpha', 'فضای کاری آلفا'),
        ($2, 'tapra-beta', 'فضای کاری بتا')
      ON CONFLICT (id) DO UPDATE SET slug = EXCLUDED.slug, name = EXCLUDED.name
    `, [ids.workspaceAlpha, ids.workspaceBeta]);
    await client.query(`
      INSERT INTO companies(id, workspace_id, code, name) VALUES
        ($1, $2, 'ALPHA', 'شرکت آلفا'),
        ($3, $4, 'BETA', 'شرکت بتا')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, code = EXCLUDED.code
    `, [ids.companyAlpha, ids.workspaceAlpha, ids.companyBeta, ids.workspaceBeta]);
    await client.query(`
      INSERT INTO persons(id, full_name) VALUES
        ($1, 'کاربر نمایشی Tapra2'),
        ($2, 'کاربر محدود آلفا'),
        ($3, 'فروشنده نمونه یک'),
        ($4, 'فروشنده نمونه دو'),
        ($5, 'سرپرست فروش نمونه'),
        ($6, 'اپراتور ثبت کاغذی'),
        ($7, 'بررسی‌کننده مالی'),
        ($8, 'اپراتور مشتریان'),
        ($9, 'اپراتور انبار'),
        ($10, 'تأییدکننده انبار')
      ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name
    `, [
      ids.personDemo, ids.personAlphaOnly, ids.personSalesOne, ids.personSalesTwo,
      ids.personSalesSupervisor, ids.personPaperEntry, ids.personFinanceReviewer,
      ids.personCustomerOperator, ids.personWarehouseOperator, ids.personWarehouseApprover,
    ]);
    await client.query(`
      INSERT INTO user_accounts(id, person_id, email, password_hash) VALUES
        ($1, $2, 'demo@tapra.local', $3),
        ($4, $5, 'alpha-only@tapra.local', $6),
        ($7, $8, 'sales-one@tapra.local', $9),
        ($10, $11, 'sales-two@tapra.local', $9),
        ($12, $13, 'sales-supervisor@tapra.local', $14),
        ($15, $16, 'paper-entry@tapra.local', $14),
        ($17, $18, 'finance-review@tapra.local', $19),
        ($20, $21, 'customer-operator@tapra.local', $14),
        ($22, $23, 'warehouse-operator@tapra.local', $24),
        ($25, $26, 'warehouse-approver@tapra.local', $24)
      ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, password_hash = EXCLUDED.password_hash, is_active = true
    `, [
      ids.accountDemo, ids.personDemo, demoHash,
      ids.accountAlphaOnly, ids.personAlphaOnly, alphaHash,
      ids.accountSalesOne, ids.personSalesOne, salesHash,
      ids.accountSalesTwo, ids.personSalesTwo,
      ids.accountSalesSupervisor, ids.personSalesSupervisor, operationsHash,
      ids.accountPaperEntry, ids.personPaperEntry,
      ids.accountFinanceReviewer, ids.personFinanceReviewer, financeHash,
      ids.accountCustomerOperator, ids.personCustomerOperator,
      ids.accountWarehouseOperator, ids.personWarehouseOperator, warehouseHash,
      ids.accountWarehouseApprover, ids.personWarehouseApprover,
    ]);
    await client.query(`
      INSERT INTO memberships(id, workspace_id, company_id, person_id) VALUES
        ($1, $2, $3, $4),
        ($5, $6, $7, $4),
        ($8, $2, $3, $9),
        ($10, $2, $3, $11),
        ($12, $2, $3, $13),
        ($14, $2, $3, $15),
        ($16, $2, $3, $17),
        ($18, $2, $3, $19),
        ($20, $2, $3, $21),
        ($22, $2, $3, $23),
        ($24, $2, $3, $25)
      ON CONFLICT (id) DO UPDATE SET status = 'active', valid_until = NULL
    `, [
      ids.membershipDemoAlpha, ids.workspaceAlpha, ids.companyAlpha, ids.personDemo,
      ids.membershipDemoBeta, ids.workspaceBeta, ids.companyBeta,
      ids.membershipAlphaOnly, ids.personAlphaOnly,
      ids.membershipSalesOne, ids.personSalesOne,
      ids.membershipSalesTwo, ids.personSalesTwo,
      ids.membershipSalesSupervisor, ids.personSalesSupervisor,
      ids.membershipPaperEntry, ids.personPaperEntry,
      ids.membershipFinanceReviewer, ids.personFinanceReviewer,
      ids.membershipCustomerOperator, ids.personCustomerOperator,
      ids.membershipWarehouseOperator, ids.personWarehouseOperator,
      ids.membershipWarehouseApprover, ids.personWarehouseApprover,
    ]);
    await client.query(`
      INSERT INTO memberships(workspace_id, company_id, person_id)
      SELECT $1, NULL, $2
      WHERE NOT EXISTS (
        SELECT 1
        FROM memberships
        WHERE workspace_id = $1
          AND company_id IS NULL
          AND person_id = $2
      )
      ON CONFLICT DO NOTHING
    `, [ids.workspaceAlpha, ids.personDemo]);
    await client.query(`
      UPDATE memberships
      SET status = 'active', valid_until = NULL
      WHERE workspace_id = $1
        AND company_id IS NULL
        AND person_id = $2
    `, [ids.workspaceAlpha, ids.personDemo]);
    await client.query(`
      INSERT INTO permissions(code, description) VALUES
        ('customer.read', 'Read Customers in the active context'),
        ('customer.create', 'Create Customers in the active context'),
        ('customer.identity.manage', 'Manage Customer identity details in the active context'),
        ('customer.merge', 'Merge and unmerge Customers in the active context'),
        ('customer.identity.reconcile', 'Merge and reverse Workspace Customer identities with lineage and audit'),
        ('customer.import.read', 'Read sanitized Customer import summaries in the active context'),
        ('customer.import.create', 'Create a staged Customer CSV import in the active context'),
        ('customer.import.review', 'Review and reconcile staged Customer import records'),
        ('customer.import.approve', 'Approve a reconciled Customer import into Customer 360'),
        ('sales.queue.read', 'Read the active seller queue in the current Company context'),
        ('sales.lead.create', 'Create a Sales Lead for a Customer relationship in the current Company'),
        ('sales.lead.read_all', 'Read all Sales Leads in the current Company context'),
        ('sales.lead.assign', 'Assign an unowned Sales Lead in the current Company'),
        ('sales.lead.reassign', 'Reassign an owned Sales Lead with a reason in the current Company'),
        ('sales.call.create', 'Record a Call Log for an assigned Sales Lead'),
        ('sales.marketing.link', 'Link Campaign or Promotion context to a Sales Lead and Company relationship'),
        ('sales.sale.create', 'Create a direct Sale and its Invoice in the active Company'),
        ('sales.sale.create_on_behalf', 'Create a paper-entry Sale for another seller in the active Company'),
        ('sales.invoice.read_own', 'Read Invoices attributed to the active Sales membership'),
        ('sales.invoice.read_all', 'Read all Sales Invoices in the active Company'),
        ('sales.invoice.supervisor_approve', 'Approve a Sales Invoice before financial review'),
        ('sales.payment.record', 'Record a Customer Payment declaration for a Sales Invoice'),
        ('sales.payment.review', 'Approve or return an individual Sales Payment'),
        ('sales.invoice.edit_draft', 'Edit a draft Sales Invoice before approval'),
        ('sales.invoice.correct_returned', 'Correct a returned Sales Invoice with a new revision'),
        ('sales.invoice.amend', 'Amend an approved Sales Invoice with a new audited revision'),
        ('sales.payment.infrastructure.manage', 'Manage Company collection accounts and Sales approval policy'),
        ('organization.read', 'Read the permitted Organization structure and access assignments'),
        ('organization.company.manage', 'Create and update Companies in the permitted scope'),
        ('organization.unit.manage', 'Create and update Organization units'),
        ('organization.user.manage', 'Create and activate or deactivate UserAccounts'),
        ('organization.membership.manage', 'Create and update Memberships'),
        ('organization.role.manage', 'Create Roles and assign scoped Roles'),
        ('organization.impersonate', 'Start a time-limited audited impersonation session'),
        ('warehouse.read', 'Read Warehouse inventory and operational records in the active context'),
        ('warehouse.manage', 'Manage Warehouses and Warehouse Locations in the active context'),
        ('warehouse.item.manage', 'Manage Workspace Inventory Items and tracking identities'),
        ('warehouse.receiving.create', 'Create Warehouse Receiving records'),
        ('warehouse.receiving.post', 'Post validated Warehouse Receiving records to the inventory ledger'),
        ('warehouse.receiving.manual', 'Create manual Receiving with mandatory reason and evidence'),
        ('warehouse.reservation.manage', 'Create and release financially eligible inventory Reservations'),
        ('warehouse.transfer.manage', 'Create, dispatch and receive internal Warehouse Transfers'),
        ('warehouse.adjustment.create', 'Create Inventory Adjustments'),
        ('warehouse.adjustment.approve', 'Approve and post Inventory Adjustments created by another user'),
        ('warehouse.count.create', 'Create and submit Inventory Counts'),
        ('warehouse.count.approve', 'Approve and post Inventory Counts created by another user'),
        ('warehouse.return.manage', 'Receive and inspect Customer inventory Returns'),
        ('warehouse.movement.reverse', 'Reverse a posted Inventory Movement without rewriting history')
      ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description
    `);
    await client.query(`
      INSERT INTO roles(id, workspace_id, code, name) VALUES
        ($1, $2, 'customer_manager', 'مدیر مشتریان'),
        ($3, $4, 'customer_manager', 'مدیر مشتریان'),
        ($5, $2, 'customer_reader', 'مشاهده‌گر مشتریان'),
        ($6, $2, 'workspace_admin', 'مدیر فضای کاری'),
        ($7, $2, 'sales_seller', 'فروشنده'),
        ($8, $2, 'sales_supervisor', 'سرپرست فروش'),
        ($9, $2, 'paper_entry_operator', 'اپراتور ثبت کاغذی'),
        ($10, $2, 'finance_reviewer', 'بررسی‌کننده مالی'),
        ($11, $2, 'customer_operator', 'اپراتور مشتریان'),
        ($12, $2, 'warehouse_operator', 'اپراتور انبار'),
        ($13, $2, 'warehouse_approver', 'تأییدکننده انبار')
      ON CONFLICT DO NOTHING
    `, [
      ids.roleAlphaManager, ids.workspaceAlpha, ids.roleBetaManager, ids.workspaceBeta,
      ids.roleAlphaReader, ids.roleWorkspaceAdmin, ids.roleAlphaSeller,
      ids.roleAlphaSalesSupervisor, ids.roleAlphaPaperEntry, ids.roleAlphaFinanceReviewer,
      ids.roleAlphaCustomerOperator, ids.roleAlphaWarehouseOperator, ids.roleAlphaWarehouseApprover,
    ]);
    const seededRoles = await client.query<{ id: string; workspace_id: string; code: string }>(`
      SELECT id, workspace_id, code FROM roles
      WHERE (workspace_id = $1 AND code IN (
        'customer_manager', 'customer_reader', 'workspace_admin', 'sales_seller',
        'sales_supervisor', 'paper_entry_operator', 'finance_reviewer', 'customer_operator',
        'warehouse_operator', 'warehouse_approver'
      ))
        OR (workspace_id = $2 AND code = 'customer_manager')
    `, [ids.workspaceAlpha, ids.workspaceBeta]);
    const seededRoleId = (workspaceId: string, code: string): string => {
      const role = seededRoles.rows.find((row) => row.workspace_id === workspaceId && row.code === code);
      if (!role) throw new Error(`Seed role ${workspaceId}/${code} was not resolved.`);
      return role.id;
    };
    const roleAlphaManager = seededRoleId(ids.workspaceAlpha, 'customer_manager');
    const roleBetaManager = seededRoleId(ids.workspaceBeta, 'customer_manager');
    const roleAlphaReader = seededRoleId(ids.workspaceAlpha, 'customer_reader');
    const roleWorkspaceAdmin = seededRoleId(ids.workspaceAlpha, 'workspace_admin');
    const roleAlphaSeller = seededRoleId(ids.workspaceAlpha, 'sales_seller');
    const roleAlphaSalesSupervisor = seededRoleId(ids.workspaceAlpha, 'sales_supervisor');
    const roleAlphaPaperEntry = seededRoleId(ids.workspaceAlpha, 'paper_entry_operator');
    const roleAlphaFinanceReviewer = seededRoleId(ids.workspaceAlpha, 'finance_reviewer');
    const roleAlphaCustomerOperator = seededRoleId(ids.workspaceAlpha, 'customer_operator');
    const roleAlphaWarehouseOperator = seededRoleId(ids.workspaceAlpha, 'warehouse_operator');
    const roleAlphaWarehouseApprover = seededRoleId(ids.workspaceAlpha, 'warehouse_approver');
    await client.query(`
      INSERT INTO role_permissions(role_id, permission_code) VALUES
        ($1, 'customer.read'), ($1, 'customer.create'),
        ($1, 'customer.identity.manage'), ($1, 'customer.merge'),
        ($1, 'customer.import.read'), ($1, 'customer.import.create'), ($1, 'customer.import.review'), ($1, 'customer.import.approve'),
        ($1, 'sales.queue.read'), ($1, 'sales.lead.create'), ($1, 'sales.lead.read_all'),
        ($1, 'sales.lead.assign'), ($1, 'sales.lead.reassign'), ($1, 'sales.call.create'), ($1, 'sales.marketing.link'),
        ($1, 'sales.sale.create'), ($1, 'sales.sale.create_on_behalf'), ($1, 'sales.invoice.read_all'),
        ($1, 'sales.invoice.supervisor_approve'), ($1, 'sales.payment.record'), ($1, 'sales.payment.review'),
        ($1, 'sales.invoice.edit_draft'), ($1, 'sales.invoice.correct_returned'), ($1, 'sales.invoice.amend'),
        ($1, 'sales.payment.infrastructure.manage'),
        ($2, 'customer.read'), ($2, 'customer.create'),
        ($2, 'customer.identity.manage'), ($2, 'customer.merge'),
        ($2, 'customer.import.read'), ($2, 'customer.import.create'), ($2, 'customer.import.review'), ($2, 'customer.import.approve'),
        ($2, 'sales.queue.read'), ($2, 'sales.lead.create'), ($2, 'sales.lead.read_all'),
        ($2, 'sales.lead.assign'), ($2, 'sales.lead.reassign'), ($2, 'sales.call.create'), ($2, 'sales.marketing.link'),
        ($2, 'sales.sale.create'), ($2, 'sales.sale.create_on_behalf'), ($2, 'sales.invoice.read_all'),
        ($2, 'sales.invoice.supervisor_approve'), ($2, 'sales.payment.record'), ($2, 'sales.payment.review'),
        ($2, 'sales.invoice.edit_draft'), ($2, 'sales.invoice.correct_returned'), ($2, 'sales.invoice.amend'),
        ($2, 'sales.payment.infrastructure.manage'),
        ($3, 'customer.read'),
        ($4, 'customer.read'), ($4, 'customer.create'), ($4, 'customer.identity.manage'), ($4, 'customer.merge'), ($4, 'customer.identity.reconcile'),
        ($4, 'customer.import.read'), ($4, 'customer.import.create'), ($4, 'customer.import.review'), ($4, 'customer.import.approve'),
        ($4, 'organization.read'), ($4, 'organization.company.manage'), ($4, 'organization.unit.manage'),
        ($4, 'organization.user.manage'), ($4, 'organization.membership.manage'),
        ($4, 'organization.role.manage'), ($4, 'organization.impersonate'),
        ($4, 'sales.sale.create'), ($4, 'sales.sale.create_on_behalf'), ($4, 'sales.invoice.read_all'),
        ($4, 'sales.invoice.supervisor_approve'), ($4, 'sales.payment.record'), ($4, 'sales.payment.review'),
        ($4, 'sales.invoice.edit_draft'), ($4, 'sales.invoice.correct_returned'), ($4, 'sales.invoice.amend'),
        ($4, 'sales.payment.infrastructure.manage'),
        ($5, 'customer.read'), ($5, 'sales.queue.read'), ($5, 'sales.call.create'),
        ($5, 'sales.sale.create'), ($5, 'sales.invoice.read_own'), ($5, 'sales.payment.record'),
        ($5, 'sales.invoice.edit_draft')
      ON CONFLICT DO NOTHING
    `, [roleAlphaManager, roleBetaManager, roleAlphaReader, roleWorkspaceAdmin, roleAlphaSeller]);
    await client.query(`
      INSERT INTO role_permissions(role_id, permission_code) VALUES
        ($1, 'customer.read'), ($1, 'sales.lead.read_all'), ($1, 'sales.lead.assign'),
        ($1, 'sales.lead.reassign'), ($1, 'sales.marketing.link'), ($1, 'sales.invoice.read_all'),
        ($1, 'sales.invoice.supervisor_approve'),
        ($2, 'customer.read'), ($2, 'sales.sale.create_on_behalf'), ($2, 'sales.invoice.read_all'),
        ($3, 'sales.invoice.read_all'), ($3, 'sales.payment.review'),
        ($4, 'customer.read'), ($4, 'customer.create'), ($4, 'customer.identity.manage'),
        ($4, 'customer.import.read'), ($4, 'customer.import.create'), ($4, 'customer.import.review'),
        ($4, 'sales.lead.create'),
        ($5, 'sales.invoice.read_all'), ($5, 'warehouse.read'), ($5, 'warehouse.manage'),
        ($5, 'warehouse.item.manage'), ($5, 'warehouse.receiving.create'),
        ($5, 'warehouse.receiving.post'), ($5, 'warehouse.receiving.manual'),
        ($5, 'warehouse.reservation.manage'), ($5, 'warehouse.transfer.manage'),
        ($5, 'warehouse.adjustment.create'), ($5, 'warehouse.count.create'),
        ($5, 'warehouse.return.manage'), ($5, 'warehouse.movement.reverse'),
        ($6, 'warehouse.read'), ($6, 'warehouse.adjustment.approve'), ($6, 'warehouse.count.approve')
      ON CONFLICT DO NOTHING
    `, [
      roleAlphaSalesSupervisor, roleAlphaPaperEntry, roleAlphaFinanceReviewer,
      roleAlphaCustomerOperator, roleAlphaWarehouseOperator, roleAlphaWarehouseApprover,
    ]);
    await client.query(`
      INSERT INTO role_permissions(role_id, permission_code)
      SELECT role_id, permission.code
      FROM unnest($1::uuid[]) AS role_id
      CROSS JOIN permissions permission
      WHERE permission.code LIKE 'warehouse.%'
      ON CONFLICT DO NOTHING
    `, [[roleAlphaManager, roleBetaManager, roleWorkspaceAdmin]]);
    await client.query(`
      DELETE FROM role_permissions
      WHERE role_id = $1
        AND permission_code IN ('warehouse.adjustment.approve', 'warehouse.count.approve')
    `, [roleAlphaWarehouseOperator]);
    await client.query(`
      INSERT INTO role_assignments(workspace_id, membership_id, role_id, scope_type, company_id) VALUES
        ($1, $2, $3, 'COMPANY', $4),
        ($5, $6, $7, 'COMPANY', $8),
        ($1, $9, $10, 'COMPANY', $4),
        ($1, $11, $12, 'COMPANY', $4),
        ($1, $13, $12, 'COMPANY', $4)
      ON CONFLICT DO NOTHING
    `, [
      ids.workspaceAlpha, ids.membershipDemoAlpha, roleAlphaManager, ids.companyAlpha,
      ids.workspaceBeta, ids.membershipDemoBeta, roleBetaManager, ids.companyBeta,
      ids.membershipAlphaOnly, roleAlphaReader,
      ids.membershipSalesOne, roleAlphaSeller,
      ids.membershipSalesTwo,
    ]);
    await client.query(`
      INSERT INTO role_assignments(workspace_id, membership_id, role_id, scope_type, company_id) VALUES
        ($1, $2, $3, 'COMPANY', $4),
        ($1, $5, $6, 'COMPANY', $4),
        ($1, $7, $8, 'COMPANY', $4),
        ($1, $9, $10, 'COMPANY', $4),
        ($1, $11, $12, 'COMPANY', $4),
        ($1, $13, $14, 'COMPANY', $4)
      ON CONFLICT DO NOTHING
    `, [
      ids.workspaceAlpha, ids.membershipSalesSupervisor, roleAlphaSalesSupervisor, ids.companyAlpha,
      ids.membershipPaperEntry, roleAlphaPaperEntry,
      ids.membershipFinanceReviewer, roleAlphaFinanceReviewer,
      ids.membershipCustomerOperator, roleAlphaCustomerOperator,
      ids.membershipWarehouseOperator, roleAlphaWarehouseOperator,
      ids.membershipWarehouseApprover, roleAlphaWarehouseApprover,
    ]);
    await client.query(`
      INSERT INTO role_assignments(workspace_id, membership_id, role_id, scope_type, company_id)
      SELECT $1, membership.id, $3, 'WORKSPACE', NULL
      FROM memberships membership
      WHERE membership.workspace_id = $1
        AND membership.company_id IS NULL
        AND membership.person_id = $2
      ON CONFLICT DO NOTHING
    `, [ids.workspaceAlpha, ids.personDemo, roleWorkspaceAdmin]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }

  const runtimeConnectionString = process.env.DATABASE_URL;
  if (!runtimeConnectionString?.startsWith('postgresql://')) throw new Error('DATABASE_URL is required for tenant-scoped seed data.');
  const runtimeTarget = assertSafeSeedTarget(runtimeConnectionString, 'tapra2_app');
  if (runtimeTarget.database !== migrationTarget.database) {
    throw new Error('Seed migration and runtime connections must target the same dedicated database.');
  }
  const runtime = new Client({ connectionString: runtimeConnectionString, application_name: 'tapra2_seed_tenant_data' });
  await runtime.connect();
  try {
    const contexts = [
      { workspaceId: ids.workspaceAlpha, companyId: ids.companyAlpha, identityId: ids.customerIdentityAlpha, customerId: ids.customerAlpha, name: 'مشتری نمونه آلفا', phone: '09120000001' },
      { workspaceId: ids.workspaceBeta, companyId: ids.companyBeta, identityId: ids.customerIdentityBeta, customerId: ids.customerBeta, name: 'مشتری نمونه بتا', phone: '09120000002' },
    ];
    for (const context of contexts) {
      await runtime.query('BEGIN');
      try {
        await runtime.query("SELECT set_config('app.workspace_id', $1, true), set_config('app.company_id', $2, true)", [context.workspaceId, context.companyId]);
        await runtime.query(`
          INSERT INTO sales_policies(workspace_id, company_id)
          VALUES ($1, $2)
          ON CONFLICT (workspace_id, company_id) DO NOTHING
        `, [context.workspaceId, context.companyId]);
        await runtime.query(`
          INSERT INTO financial_accounts(
            id, workspace_id, company_id, display_name, bank_name, card_number
          ) VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name,
            bank_name = EXCLUDED.bank_name, card_number = EXCLUDED.card_number, is_active = true
        `, [
          context.companyId === ids.companyAlpha ? ids.financialAccountAlpha : ids.financialAccountBeta,
          context.workspaceId, context.companyId, 'حساب تسویه توسعه',
          'بانک توسعه', context.companyId === ids.companyAlpha ? '0000000000001111' : '0000000000002222',
        ]);
        await runtime.query(`
          INSERT INTO sales_payment_method_policies(
            workspace_id, company_id, payment_method, is_enabled, manual_review_required
          ) VALUES
            ($1, $2, 'card_to_card', true, true),
            ($1, $2, 'bank_transfer', true, true),
            ($1, $2, 'payment_gateway', true, false),
            ($1, $2, 'cash', false, true),
            ($1, $2, 'cheque', false, true),
            ($1, $2, 'cod', false, true)
          ON CONFLICT (workspace_id, company_id, payment_method) DO UPDATE SET
            is_enabled = EXCLUDED.is_enabled, manual_review_required = EXCLUDED.manual_review_required,
            updated_at = now()
        `, [context.workspaceId, context.companyId]);
        await runtime.query(`
          INSERT INTO customer_identities(id, workspace_id, normalized_primary_phone)
          VALUES ($1, $2, normalize_customer_phone($3))
          ON CONFLICT DO NOTHING
        `, [context.identityId, context.workspaceId, context.phone]);
        await runtime.query(`
          INSERT INTO customer_identity_phones(workspace_id, identity_id, normalized_value)
          VALUES ($1, $2, normalize_customer_phone($3))
          ON CONFLICT DO NOTHING
        `, [context.workspaceId, context.identityId, context.phone]);
        await runtime.query(`
          INSERT INTO customers(id, workspace_id, company_id, identity_id, canonical_identity_id, full_name, phone_primary, created_by_user_account_id, idempotency_key)
          VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8)
          ON CONFLICT (id) DO NOTHING
        `, [context.customerId, context.workspaceId, context.companyId, context.identityId, context.name, context.phone, ids.accountDemo, `seed-${context.customerId}`]);
        await runtime.query(`
          INSERT INTO customer_sources(
            workspace_id, company_id, customer_id, source_type, source_name,
            source_reference, confidence, verification_status, created_by_user_account_id
          )
          SELECT $1::uuid, $2::uuid, $3::uuid, 'manual', 'Deterministic development seed', $3::uuid::text,
            1, 'verified', $4::uuid
          WHERE NOT EXISTS (
            SELECT 1 FROM customer_sources WHERE customer_id = $3::uuid
          )
        `, [context.workspaceId, context.companyId, context.customerId, ids.accountDemo]);
        await runtime.query(`
          INSERT INTO customer_phones(
            workspace_id, company_id, customer_id, identity_id, source_id, value, normalized_value,
            label, is_primary, verification_status
          )
          SELECT $1::uuid, $2::uuid, $3::uuid, $4::uuid, s.id, $5::text, normalize_customer_phone($5::text),
            'mobile', true, 'unverified'
          FROM customer_sources s
          WHERE s.customer_id = $3::uuid
          ORDER BY s.created_at, s.id
          LIMIT 1
          ON CONFLICT (workspace_id, company_id, customer_id, normalized_value) DO NOTHING
        `, [context.workspaceId, context.companyId, context.customerId, context.identityId, context.phone]);
        await runtime.query(`
          INSERT INTO customer_timeline_events(
            workspace_id, company_id, customer_id, actor_user_account_id,
            event_type, summary, metadata
          )
          SELECT $1::uuid, $2::uuid, $3::uuid, $4::uuid, 'customer_created', 'پروفایل مشتری ایجاد شد.',
            '{"source":"development_seed"}'::jsonb
          WHERE NOT EXISTS (
            SELECT 1 FROM customer_timeline_events
            WHERE customer_id = $3::uuid AND event_type = 'customer_created'
          )
        `, [context.workspaceId, context.companyId, context.customerId, ids.accountDemo]);
        await runtime.query('COMMIT');
      } catch (error) {
        await runtime.query('ROLLBACK');
        throw error;
      }
    }
    console.log('Seeded deterministic Foundation identities, contexts, permissions and Customers.');
  } finally {
    await runtime.end();
  }
  if ((process.env.NODE_ENV ?? 'development') === 'development') {
    try {
      await seedOperationalAcceptanceData();
      console.log('Seeded isolated operational acceptance data for Sales, Finance and Warehouse.');
    } finally {
      await closePool();
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  seedDatabase().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Seed failed.');
    process.exit(1);
  });
}
