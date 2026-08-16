import { randomUUID } from 'node:crypto';
import { config as loadDotEnv } from 'dotenv';
import { Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app/create-app.js';
import { resetEnvironmentForTests } from '../src/config/env.js';
import { closePool, withTenantTransaction } from '../src/infrastructure/database/pool.js';
import { runMigrations } from '../scripts/migrate.js';
import { seedDatabase } from '../scripts/seed.js';

interface SessionResponse {
  csrfToken: string;
  user: { id: string; email: string };
  actor: { id: string; email: string };
  impersonation: null | { id: string; reason: string; expiresAt: string };
  memberships: Array<{
    membershipId: string;
    workspace: { id: string; slug: string };
    company: { id: string } | null;
    scope: { type: 'WORKSPACE' | 'COMPANY' | 'BRANCH' | 'DEPARTMENT' | 'TEAM' | 'SELF'; id: string };
    permissions: string[];
  }>;
}

loadDotEnv({ path: '.env.local', quiet: true });
const migrationUrl = process.env.TEST_DATABASE_MIGRATION_URL;
const runtimeUrl = process.env.TEST_DATABASE_URL;
if (!migrationUrl || !runtimeUrl) throw new Error('TEST_DATABASE_MIGRATION_URL and TEST_DATABASE_URL are required.');

const ids = {
  workspaceAlpha: '10000000-0000-4000-8000-000000000001',
  workspaceBeta: '10000000-0000-4000-8000-000000000002',
  companyAlpha: '20000000-0000-4000-8000-000000000001',
  companyBeta: '20000000-0000-4000-8000-000000000002',
  customerAlpha: '70000000-0000-4000-8000-000000000001',
  membershipSalesOne: '50000000-0000-4000-8000-000000000004',
  membershipSalesTwo: '50000000-0000-4000-8000-000000000005',
  roleAlphaSeller: '60000000-0000-4000-8000-000000000005',
  financialAccountAlpha: '80000000-0000-4000-8000-000000000001',
} as const;

function assertDedicatedTestDatabase(connectionString: string): void {
  const parsed = new URL(connectionString);
  if (parsed.pathname !== '/tapra2_test') throw new Error('Refusing to reset a database other than tapra2_test.');
  if (decodeURIComponent(parsed.username) !== 'tapra2_owner') throw new Error('Test reset requires tapra2_owner.');
}

async function resetTestDatabase(): Promise<void> {
  assertDedicatedTestDatabase(migrationUrl!);
  const client = new Client({ connectionString: migrationUrl, application_name: 'tapra2_warehouse_test_reset' });
  await client.connect();
  try {
    await client.query('DROP SCHEMA public CASCADE');
    await client.query('CREATE SCHEMA public AUTHORIZATION tapra2_owner');
    await client.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
  } finally {
    await client.end();
  }
}

async function login(agent: ReturnType<typeof request.agent>, email: string, password: string): Promise<SessionResponse> {
  return (await agent.post('/api/v1/auth/login').send({ email, password }).expect(200)).body as SessionResponse;
}

async function selectContext(
  agent: ReturnType<typeof request.agent>, session: SessionResponse, workspaceSlug: string, permission: string,
): Promise<SessionResponse> {
  const membership = session.memberships.find((item) => item.workspace.slug === workspaceSlug
    && item.company !== null && item.scope.type === 'COMPANY' && item.permissions.includes(permission));
  if (!membership) throw new Error(`Context ${workspaceSlug}/${permission} was not found.`);
  return (await agent.post('/api/v1/session/context').set('x-csrf-token', session.csrfToken)
    .send({ membershipId: membership.membershipId, scopeType: membership.scope.type, scopeId: membership.scope.id })
    .expect(200)).body as SessionResponse;
}

async function selectWorkspaceContext(
  agent: ReturnType<typeof request.agent>, session: SessionResponse, workspaceSlug: string, permission: string,
): Promise<SessionResponse> {
  const membership = session.memberships.find((item) => item.workspace.slug === workspaceSlug
    && item.company === null && item.scope.type === 'WORKSPACE' && item.permissions.includes(permission));
  if (!membership) throw new Error(`Workspace context ${workspaceSlug}/${permission} was not found.`);
  return (await agent.post('/api/v1/session/context').set('x-csrf-token', session.csrfToken)
    .send({ membershipId: membership.membershipId, scopeType: membership.scope.type, scopeId: membership.scope.id })
    .expect(200)).body as SessionResponse;
}

describe('Warehouse Foundation', () => {
  let manager: ReturnType<typeof request.agent>;
  let managerSession: SessionResponse;
  let maker: ReturnType<typeof request.agent>;
  let makerSession: SessionResponse;
  let paymentMaker: ReturnType<typeof request.agent>;
  let paymentMakerSession: SessionResponse;
  let workspaceManager: ReturnType<typeof request.agent>;
  let workspaceManagerSession: SessionResponse;
  let secondAlphaCompany = '';
  let warehouseOne = '';
  let warehouseTwo = '';
  let receivingOne = '';
  let storageOne = '';
  let returnsOne = '';
  let quarantineOne = '';
  let damagedOne = '';
  let receivingTwo = '';
  let storageTwo = '';
  let itemNone = '';
  let itemLot = '';
  let itemSerial = '';
  let noneStockIdentity = '';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_MIGRATION_URL = migrationUrl;
    process.env.DATABASE_URL = runtimeUrl;
    process.env.SESSION_COOKIE_SECURE = 'false';
    resetEnvironmentForTests();
    await closePool();
    await resetTestDatabase();
    await runMigrations(migrationUrl);
    await seedDatabase(migrationUrl);

    const owner = new Client({ connectionString: migrationUrl, application_name: 'tapra2_warehouse_test_permissions' });
    await owner.connect();
    try {
      await owner.query(`
        INSERT INTO role_permissions(role_id, permission_code)
        SELECT $1, code FROM permissions WHERE code IN (
          'warehouse.read', 'warehouse.adjustment.create', 'warehouse.adjustment.approve',
          'warehouse.count.create', 'warehouse.count.approve'
        ) ON CONFLICT DO NOTHING
      `, [ids.roleAlphaSeller]);
    } finally {
      await owner.end();
    }

    manager = request.agent(createApp());
    managerSession = await selectContext(manager, await login(manager, 'demo@tapra.local', 'TapraDemo!2026'), 'tapra-alpha', 'warehouse.manage');
    maker = request.agent(createApp());
    makerSession = await selectContext(maker, await login(maker, 'sales-one@tapra.local', 'TapraSales!2026'), 'tapra-alpha', 'warehouse.adjustment.create');
    paymentMaker = request.agent(createApp());
    paymentMakerSession = await selectContext(paymentMaker, await login(paymentMaker, 'sales-two@tapra.local', 'TapraSales!2026'), 'tapra-alpha', 'sales.payment.record');
    workspaceManager = request.agent(createApp());
    workspaceManagerSession = await selectWorkspaceContext(
      workspaceManager, await login(workspaceManager, 'demo@tapra.local', 'TapraDemo!2026'), 'tapra-alpha', 'warehouse.manage',
    );
    secondAlphaCompany = (await workspaceManager.post('/api/v1/organization/companies')
      .set('x-csrf-token', workspaceManagerSession.csrfToken)
      .send({ code: 'ALPHA_SECOND_OWNER', name: 'شرکت دوم در Workspace آلفا' }).expect(201)).body.company.id as string;
  });

  afterAll(async () => { await closePool(); });

  it('applies all Warehouse tables with FORCE RLS and exact numeric quantities', async () => {
    const owner = new Client({ connectionString: migrationUrl, application_name: 'tapra2_warehouse_schema_verify' });
    await owner.connect();
    try {
      const expectedTables = [
        'warehouses', 'warehouse_locations', 'inventory_items', 'inventory_lots', 'inventory_serials',
        'stock_identities', 'inventory_balances', 'inventory_movements', 'warehouse_receipts',
        'warehouse_receipt_lines', 'inventory_reservations', 'inventory_allocations', 'warehouse_transfers',
        'warehouse_transfer_lines', 'inventory_adjustments', 'inventory_adjustment_lines', 'inventory_counts',
        'inventory_count_lines', 'inventory_returns', 'inventory_return_lines', 'inventory_return_inspections',
      ];
      const tables = await owner.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(`
        SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
        WHERE relname = ANY($1::text[]) ORDER BY relname
      `, [expectedTables]);
      expect(tables.rows).toHaveLength(expectedTables.length);
      expect(tables.rows.every((row) => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
      const columns = await owner.query<{ table_name: string; data_type: string; numeric_precision: number; numeric_scale: number }>(`
        SELECT table_name, data_type, numeric_precision, numeric_scale FROM information_schema.columns
        WHERE table_name = ANY($1::text[]) AND column_name IN (
          'quantity', 'on_hand_quantity', 'requested_quantity', 'reserved_quantity', 'shortage_quantity',
          'actual_quantity', 'expected_quantity'
        )
      `, [expectedTables]);
      expect(columns.rows.length).toBeGreaterThan(10);
      expect(columns.rows.every((row) => row.data_type === 'numeric' && row.numeric_precision === 20 && row.numeric_scale === 6)).toBe(true);
    } finally {
      await owner.end();
    }
  });

  it('creates two Warehouses, operational Locations, and NONE/LOT/SERIAL Inventory Items', async () => {
    const createWarehouse = async (code: string, name: string) => (await manager.post('/api/v1/warehouse/warehouses')
      .set('x-csrf-token', managerSession.csrfToken).send({ code, name }).expect(201)).body.warehouse.id as string;
    const createLocation = async (warehouseId: string, code: string, name: string, locationType: string) => (
      await manager.post(`/api/v1/warehouse/warehouses/${warehouseId}/locations`)
        .set('x-csrf-token', managerSession.csrfToken).send({ code, name, locationType }).expect(201)
    ).body.location.id as string;
    warehouseOne = await createWarehouse('ALPHA_MAIN', 'انبار اصلی آلفا');
    warehouseTwo = await createWarehouse('ALPHA_SECOND', 'انبار دوم آلفا');
    receivingOne = await createLocation(warehouseOne, 'REC', 'دریافت', 'RECEIVING');
    storageOne = await createLocation(warehouseOne, 'STO', 'موجودی قابل فروش', 'SELLABLE');
    returnsOne = await createLocation(warehouseOne, 'RET', 'ورودی برگشتی', 'RETURNS');
    quarantineOne = await createLocation(warehouseOne, 'QUA', 'قرنطینه', 'QUARANTINE');
    damagedOne = await createLocation(warehouseOne, 'DMG', 'آسیب‌دیده', 'DAMAGED');
    receivingTwo = await createLocation(warehouseTwo, 'REC', 'دریافت', 'RECEIVING');
    storageTwo = await createLocation(warehouseTwo, 'STO', 'موجودی قابل فروش', 'SELLABLE');
    const createItem = async (sku: string, trackingMode: string, catalogReference: string, uom: string) => (
      await manager.post('/api/v1/warehouse/items').set('x-csrf-token', managerSession.csrfToken)
        .send({ sku, name: `کالای ${sku}`, catalogReference, trackingMode, uom }).expect(201)
    ).body.item.id as string;
    itemNone = await createItem('NONE-001', 'NONE', 'CAT-NONE-001', 'PCS');
    itemLot = await createItem('LOT-001', 'LOT', 'CAT-LOT-001', 'KG');
    itemSerial = await createItem('SERIAL-001', 'SERIAL', 'CAT-SERIAL-001', 'PCS');
    expect(new Set([warehouseOne, warehouseTwo, itemNone, itemLot, itemSerial]).size).toBe(5);
  });

  it('enforces manual evidence, tracking constraints, decimal precision, serial uniqueness, and idempotent Receiving', async () => {
    await manager.post('/api/v1/warehouse/receipts')
      .set('x-csrf-token', managerSession.csrfToken).set('idempotency-key', randomUUID())
      .send({ warehouseId: warehouseOne, receivingLocationId: receivingOne, receiptType: 'MANUAL', sourceNote: 'ثبت دستی بدون علت', lines: [{ inventoryItemId: itemNone, quantity: '1', evidenceNote: 'صورت‌جلسه' }] })
      .expect(400);
    await manager.post('/api/v1/warehouse/receipts')
      .set('x-csrf-token', managerSession.csrfToken).set('idempotency-key', randomUUID())
      .send({ warehouseId: warehouseOne, receivingLocationId: receivingOne, receiptType: 'PURCHASE', sourceNote: 'خرید سریال', lines: [{ inventoryItemId: itemSerial, quantity: '2', serialCode: 'SER-INVALID', evidenceNote: 'فاکتور خرید' }] })
      .expect(201).then(async ({ body }) => {
        await manager.post(`/api/v1/warehouse/receipts/${body.receipt.id}/post`)
          .set('x-csrf-token', managerSession.csrfToken).expect(409)
          .expect(({ body: errorBody }) => expect(errorBody.error.code).toBe('serial_quantity_invalid'));
      });

    const key = randomUUID();
    const receiptInput = {
      warehouseId: warehouseOne, receivingLocationId: storageOne, receiptType: 'MANUAL',
      sourceNote: 'صورت‌جلسه دریافت دستی', reason: 'موجودی اولیه کنترل‌شده',
      lines: [
        { inventoryItemId: itemNone, quantity: '12.123456', evidenceNote: 'صورت‌جلسه شماره ۱' },
        { inventoryItemId: itemLot, quantity: '2.500001', lotCode: 'LOT-A', evidenceNote: 'فاکتور خرید LOT' },
        { inventoryItemId: itemSerial, quantity: '1', serialCode: 'SER-001', evidenceNote: 'فاکتور خرید سریال' },
      ],
    };
    const created = await manager.post('/api/v1/warehouse/receipts')
      .set('x-csrf-token', managerSession.csrfToken).set('idempotency-key', key).send(receiptInput).expect(201);
    const repeated = await manager.post('/api/v1/warehouse/receipts')
      .set('x-csrf-token', managerSession.csrfToken).set('idempotency-key', key).send(receiptInput).expect(201);
    expect(repeated.body.receipt.id).toBe(created.body.receipt.id);
    await manager.post(`/api/v1/warehouse/receipts/${created.body.receipt.id}/post`)
      .set('x-csrf-token', managerSession.csrfToken).expect(200);
    await manager.post(`/api/v1/warehouse/receipts/${created.body.receipt.id}/post`)
      .set('x-csrf-token', managerSession.csrfToken).expect(200);

    const duplicateSerial = await manager.post('/api/v1/warehouse/receipts')
      .set('x-csrf-token', managerSession.csrfToken).set('idempotency-key', randomUUID())
      .send({
        warehouseId: warehouseTwo, receivingLocationId: receivingTwo, receiptType: 'PURCHASE', sourceNote: 'تکرار سریال',
        lines: [{ inventoryItemId: itemSerial, quantity: '1', serialCode: 'SER-001', evidenceNote: 'رسید تکراری' }],
      }).expect(201);
    await manager.post(`/api/v1/warehouse/receipts/${duplicateSerial.body.receipt.id}/post`)
      .set('x-csrf-token', managerSession.csrfToken).expect(409)
      .expect(({ body }) => expect(body.error.code).toBe('serial_already_on_hand'));

    const second = await manager.post('/api/v1/warehouse/receipts')
      .set('x-csrf-token', managerSession.csrfToken).set('idempotency-key', randomUUID())
      .send({
        warehouseId: warehouseTwo, receivingLocationId: storageTwo, receiptType: 'PURCHASE', sourceNote: 'خرید انبار دوم',
        lines: [{ inventoryItemId: itemNone, quantity: '4.000000', evidenceNote: 'فاکتور خرید انبار دوم' }],
      }).expect(201);
    await manager.post(`/api/v1/warehouse/receipts/${second.body.receipt.id}/post`)
      .set('x-csrf-token', managerSession.csrfToken).expect(200);

    await withTenantTransaction({ workspaceId: ids.workspaceAlpha, companyId: ids.companyAlpha }, async (client) => {
      const none = await client.query<{ id: string; quantity: string }>(`
        SELECT identity.id, sum(balance.on_hand_quantity)::text AS quantity FROM inventory_balances balance
        JOIN stock_identities identity ON identity.id = balance.stock_identity_id
        WHERE identity.inventory_item_id = $1 GROUP BY identity.id
      `, [itemNone]);
      expect(none.rows[0]?.quantity).toBe('16.123456');
      noneStockIdentity = none.rows[0]!.id;
      const serial = await client.query<{ count: string }>('SELECT count(*)::text AS count FROM inventory_serials WHERE serial_code = $1', ['SER-001']);
      expect(serial.rows[0]?.count).toBe('1');
    });
  });

  it('keeps one physical Serial identity across owners and rejects concurrent duplicate Receiving', async () => {
    const otherWarehouse = await workspaceManager.post('/api/v1/warehouse/warehouses')
      .set('x-csrf-token', workspaceManagerSession.csrfToken)
      .send({ ownerCompanyId: secondAlphaCompany, code: 'SECOND_OWNER_WH', name: 'انبار شرکت دوم' }).expect(201);
    const otherLocation = await workspaceManager.post(`/api/v1/warehouse/warehouses/${otherWarehouse.body.warehouse.id}/locations`)
      .set('x-csrf-token', workspaceManagerSession.csrfToken)
      .send({ code: 'SELLABLE', name: 'موجودی قابل فروش', locationType: 'SELLABLE' }).expect(201);

    const duplicateOwnerReceipt = await workspaceManager.post('/api/v1/warehouse/receipts')
      .set('x-csrf-token', workspaceManagerSession.csrfToken).set('idempotency-key', randomUUID())
      .send({
        ownerCompanyId: secondAlphaCompany, warehouseId: otherWarehouse.body.warehouse.id,
        receivingLocationId: otherLocation.body.location.id, receiptType: 'PURCHASE', sourceNote: 'تکرار مالکیت Serial',
        lines: [{ inventoryItemId: itemSerial, quantity: '1', serialCode: 'SER-001', evidenceNote: 'سند خرید شرکت دوم' }],
      }).expect(201);
    await workspaceManager.post(`/api/v1/warehouse/receipts/${duplicateOwnerReceipt.body.receipt.id}/post`)
      .set('x-csrf-token', workspaceManagerSession.csrfToken).expect(409)
      .expect(({ body }) => expect(body.error.code).toBe('serial_already_on_hand'));

    const serialCode = `SER-CONCURRENT-${randomUUID()}`;
    const alphaReceipt = await workspaceManager.post('/api/v1/warehouse/receipts')
      .set('x-csrf-token', workspaceManagerSession.csrfToken).set('idempotency-key', randomUUID())
      .send({
        ownerCompanyId: ids.companyAlpha, warehouseId: warehouseOne, receivingLocationId: storageOne,
        receiptType: 'PURCHASE', sourceNote: 'دریافت همزمان آلفا',
        lines: [{ inventoryItemId: itemSerial, quantity: '1', serialCode, evidenceNote: 'سند آلفا' }],
      }).expect(201);
    const otherReceipt = await workspaceManager.post('/api/v1/warehouse/receipts')
      .set('x-csrf-token', workspaceManagerSession.csrfToken).set('idempotency-key', randomUUID())
      .send({
        ownerCompanyId: secondAlphaCompany, warehouseId: otherWarehouse.body.warehouse.id,
        receivingLocationId: otherLocation.body.location.id, receiptType: 'PURCHASE', sourceNote: 'دریافت همزمان شرکت دوم',
        lines: [{ inventoryItemId: itemSerial, quantity: '1', serialCode, evidenceNote: 'سند شرکت دوم' }],
      }).expect(201);
    const results = await Promise.all([
      workspaceManager.post(`/api/v1/warehouse/receipts/${alphaReceipt.body.receipt.id}/post`)
        .set('x-csrf-token', workspaceManagerSession.csrfToken),
      workspaceManager.post(`/api/v1/warehouse/receipts/${otherReceipt.body.receipt.id}/post`)
        .set('x-csrf-token', workspaceManagerSession.csrfToken),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    expect(results.find((result) => result.status === 409)?.body.error.code).toBe('serial_already_on_hand');
    await withTenantTransaction({ workspaceId: ids.workspaceAlpha, companyId: null }, async (client) => {
      const physical = await client.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM inventory_serials WHERE inventory_item_id = $1 AND serial_code = $2',
        [itemSerial, serialCode],
      );
      expect(physical.rows[0]?.count).toBe('1');
    });
  });

  it('keeps Shared Service Warehouse stock isolated by owner Company', async () => {
    const unit = await workspaceManager.post('/api/v1/organization/units')
      .set('x-csrf-token', workspaceManagerSession.csrfToken)
      .send({ type: 'SHARED_SERVICE', code: 'WAREHOUSE_SHARED', name: 'خدمات مشترک انبار', serviceKind: 'DATA' }).expect(201);
    const warehouse = await workspaceManager.post('/api/v1/warehouse/warehouses')
      .set('x-csrf-token', workspaceManagerSession.csrfToken)
      .send({ operatorUnitId: unit.body.unit.id, code: 'SHARED_WH', name: 'انبار خدمات مشترک' }).expect(201);
    const location = await workspaceManager.post(`/api/v1/warehouse/warehouses/${warehouse.body.warehouse.id}/locations`)
      .set('x-csrf-token', workspaceManagerSession.csrfToken)
      .send({ code: 'SELLABLE', name: 'موجودی قابل فروش', locationType: 'SELLABLE' }).expect(201);
    const receipt = await workspaceManager.post('/api/v1/warehouse/receipts')
      .set('x-csrf-token', workspaceManagerSession.csrfToken).set('idempotency-key', randomUUID())
      .send({
        ownerCompanyId: secondAlphaCompany, warehouseId: warehouse.body.warehouse.id,
        receivingLocationId: location.body.location.id, receiptType: 'PURCHASE', sourceNote: 'موجودی شرکت دوم در انبار مشترک',
        lines: [{ inventoryItemId: itemNone, quantity: '1', evidenceNote: 'سند خرید شرکت دوم' }],
      }).expect(201);
    await workspaceManager.post(`/api/v1/warehouse/receipts/${receipt.body.receipt.id}/post`)
      .set('x-csrf-token', workspaceManagerSession.csrfToken).expect(200);
    const workspaceOverview = await workspaceManager.get('/api/v1/warehouse').expect(200);
    expect(workspaceOverview.body.warehouse.warehouses.some((entry: { id: string }) => entry.id === warehouse.body.warehouse.id)).toBe(true);
    const companyOverview = await manager.get('/api/v1/warehouse').expect(200);
    expect(companyOverview.body.warehouse.warehouses.some((entry: { id: string }) => entry.id === warehouse.body.warehouse.id)).toBe(false);
    expect(companyOverview.body.warehouse.balances.some((entry: { ownerCompanyId: string }) => entry.ownerCompanyId === secondAlphaCompany)).toBe(false);
  });

  async function createEligibleInvoice(itemName: string, catalogReference: string, quantity: number): Promise<{ invoiceId: string; lineId: string }> {
    const sale = await manager.post('/api/v1/sales/sales')
      .set('x-csrf-token', managerSession.csrfToken).set('idempotency-key', randomUUID())
      .send({
        customerId: ids.customerAlpha, entryMode: 'paper_entry', sellerMembershipId: ids.membershipSalesTwo,
        lines: [{ itemType: 'goods', catalogReference, itemName, quantity, unitPrice: '1000' }],
      }).expect(201);
    const invoiceId = sale.body.invoice.id as string;
    const lineId = sale.body.invoice.lines[0].id as string;
    await manager.post(`/api/v1/sales/invoices/${invoiceId}/supervisor-approval`)
      .set('x-csrf-token', managerSession.csrfToken).expect(200);
    const paid = await paymentMaker.post(`/api/v1/sales/invoices/${invoiceId}/payments`)
      .set('x-csrf-token', paymentMakerSession.csrfToken).set('idempotency-key', randomUUID())
      .send({
        amount: String(quantity * 1000), paymentMethod: 'bank_transfer', occurredAt: new Date(Date.now() - 1_000).toISOString(),
        lastFourDigits: '4242', destinationAccountId: ids.financialAccountAlpha, trackingNumber: `WAREHOUSE-${randomUUID()}`,
      }).expect(201);
    const paymentId = paid.body.invoice.payments[0].id as string;
    await manager.post(`/api/v1/sales/invoices/${invoiceId}/payments/${paymentId}/review`)
      .set('x-csrf-token', managerSession.csrfToken).send({ decision: 'approved' }).expect(200);
    return { invoiceId, lineId };
  }

  it('denies unresolved/non-eligible/old Invoice Lines and reserves eligible goods across multiple Warehouses', async () => {
    const unresolved = await manager.post('/api/v1/sales/sales')
      .set('x-csrf-token', managerSession.csrfToken).set('idempotency-key', randomUUID())
      .send({
        customerId: ids.customerAlpha, entryMode: 'paper_entry', sellerMembershipId: ids.membershipSalesTwo,
        lines: [{ itemType: 'goods', itemName: 'کالای آزاد نامعتبر', quantity: 1, unitPrice: '1000' }],
      }).expect(201);
    await manager.post('/api/v1/warehouse/reservations')
      .set('x-csrf-token', managerSession.csrfToken).set('idempotency-key', randomUUID())
      .send({ invoiceLineId: unresolved.body.invoice.lines[0].id }).expect(409)
      .expect(({ body }) => expect(body.error.code).toBe('invoice_line_not_financially_eligible'));

    const eligible = await createEligibleInvoice('کالای چندانباری', 'CAT-NONE-001', 16);
    const reserved = await manager.post('/api/v1/warehouse/reservations')
      .set('x-csrf-token', managerSession.csrfToken).set('idempotency-key', randomUUID())
      .send({ invoiceLineId: eligible.lineId }).expect(201);
    expect(reserved.body.reservation).toMatchObject({
      status: 'RESERVED', requestedQuantity: '16.000000', reservedQuantity: '16.000000', shortageQuantity: '0.000000',
    });
    await withTenantTransaction({ workspaceId: ids.workspaceAlpha, companyId: ids.companyAlpha }, async (client) => {
      const allocations = await client.query<{ warehouse_id: string }>('SELECT warehouse_id FROM inventory_allocations WHERE reservation_id = $1 ORDER BY warehouse_id', [reserved.body.reservation.id]);
      expect(new Set(allocations.rows.map((row) => row.warehouse_id)).size).toBe(2);
    });
    await manager.post(`/api/v1/warehouse/reservations/${reserved.body.reservation.id}/release`)
      .set('x-csrf-token', managerSession.csrfToken).send({ reason: 'پایان آزمون رزرو چندانباری' }).expect(200);

    const oldInvoice = await manager.post('/api/v1/sales/sales')
      .set('x-csrf-token', managerSession.csrfToken).set('idempotency-key', randomUUID())
      .send({
        customerId: ids.customerAlpha, entryMode: 'paper_entry', sellerMembershipId: ids.membershipSalesTwo,
        lines: [{ itemType: 'goods', catalogReference: 'CAT-LOT-001', itemName: 'کالای نسخه قدیم', quantity: 1, unitPrice: '1000' }],
      }).expect(201);
    const oldRevisionLineId = oldInvoice.body.invoice.lines[0].id as string;
    await manager.put(`/api/v1/sales/invoices/${oldInvoice.body.invoice.id}`)
      .set('x-csrf-token', managerSession.csrfToken)
      .send({ reason: 'نسخه جدید برای آزمون رزرو', lines: [{ itemType: 'goods', catalogReference: 'CAT-LOT-001', itemName: 'کالای نسخه جدید', quantity: 1, unitPrice: '1000' }] })
      .expect(200);
    await manager.post('/api/v1/warehouse/reservations')
      .set('x-csrf-token', managerSession.csrfToken).set('idempotency-key', randomUUID())
      .send({ invoiceLineId: oldRevisionLineId }).expect(409)
      .expect(({ body }) => expect(body.error.code).toBe('old_invoice_revision_denied'));
  });

  it('reserves only SELLABLE stock and keeps duplicate Reservation requests idempotent', async () => {
    const createNoneItem = async (suffix: string) => (await manager.post('/api/v1/warehouse/items')
      .set('x-csrf-token', managerSession.csrfToken)
      .send({
        sku: `LOCATION-${suffix}`, name: `کالای محل ${suffix}`, catalogReference: `CAT-LOCATION-${suffix}`,
        trackingMode: 'NONE', uom: 'PCS',
      }).expect(201)).body.item.id as string;
    const addByAdjustment = async (inventoryItemId: string, locationId: string) => {
      const identityReceipt = await manager.post('/api/v1/warehouse/receipts')
        .set('x-csrf-token', managerSession.csrfToken).set('idempotency-key', randomUUID())
        .send({
          warehouseId: warehouseOne, receivingLocationId: storageOne, receiptType: 'PURCHASE', sourceNote: 'ایجاد هویت موجودی',
          lines: [{ inventoryItemId, quantity: '1', evidenceNote: 'سند پایه' }],
        }).expect(201);
      await manager.post(`/api/v1/warehouse/receipts/${identityReceipt.body.receipt.id}/post`)
        .set('x-csrf-token', managerSession.csrfToken).expect(200);
      const stockIdentityId = await withTenantTransaction(
        { workspaceId: ids.workspaceAlpha, companyId: ids.companyAlpha },
        async (client) => (await client.query<{ id: string }>(
          'SELECT id FROM stock_identities WHERE inventory_item_id = $1', [inventoryItemId],
        )).rows[0]!.id,
      );
      const adjust = async (targetLocationId: string, direction: 'IN' | 'OUT') => {
        const adjustment = await maker.post('/api/v1/warehouse/adjustments')
          .set('x-csrf-token', makerSession.csrfToken).set('idempotency-key', randomUUID())
          .send({
            warehouseId: warehouseOne, locationId: targetLocationId,
            reason: 'آماده‌سازی محل برای آزمون', evidenceNote: 'سند آزمون کنترل‌شده',
            lines: [{ stockIdentityId, direction, quantity: '1' }],
          }).expect(201);
        await maker.post(`/api/v1/warehouse/adjustments/${adjustment.body.adjustment.id}/submit`)
          .set('x-csrf-token', makerSession.csrfToken).expect(200);
        await manager.post(`/api/v1/warehouse/adjustments/${adjustment.body.adjustment.id}/approve`)
          .set('x-csrf-token', managerSession.csrfToken).expect(200);
      };
      await adjust(storageOne, 'OUT');
      await adjust(locationId, 'IN');
    };

    const sellableItem = await createNoneItem('SELLABLE');
    const sellableReceipt = await manager.post('/api/v1/warehouse/receipts')
      .set('x-csrf-token', managerSession.csrfToken).set('idempotency-key', randomUUID())
      .send({
        warehouseId: warehouseOne, receivingLocationId: storageOne, receiptType: 'PURCHASE', sourceNote: 'موجودی قابل فروش',
        lines: [{ inventoryItemId: sellableItem, quantity: '1', evidenceNote: 'سند خرید' }],
      }).expect(201);
    await manager.post(`/api/v1/warehouse/receipts/${sellableReceipt.body.receipt.id}/post`)
      .set('x-csrf-token', managerSession.csrfToken).expect(200);
    const eligible = await createEligibleInvoice('کالای قابل فروش', 'CAT-LOCATION-SELLABLE', 1);
    const key = randomUUID();
    const reserved = await manager.post('/api/v1/warehouse/reservations')
      .set('x-csrf-token', managerSession.csrfToken).set('idempotency-key', key)
      .send({ invoiceLineId: eligible.lineId }).expect(201);
    const retried = await manager.post('/api/v1/warehouse/reservations')
      .set('x-csrf-token', managerSession.csrfToken).set('idempotency-key', key)
      .send({ invoiceLineId: eligible.lineId }).expect(201);
    expect(retried.body.reservation.id).toBe(reserved.body.reservation.id);
    expect(reserved.body.reservation.status).toBe('RESERVED');
    await expect(withTenantTransaction(
      { workspaceId: ids.workspaceAlpha, companyId: ids.companyAlpha },
      async (client) => client.query(`UPDATE inventory_allocations SET warehouse_id = $2, location_id = $3
        WHERE reservation_id = $1`, [reserved.body.reservation.id, warehouseOne, quarantineOne]),
    )).rejects.toMatchObject({ code: '23514' });

    for (const [suffix, locationId] of [
      ['RECEIVING', receivingOne], ['QUARANTINE', quarantineOne], ['DAMAGED', damagedOne], ['RETURNS', returnsOne],
    ] as const) {
      const itemId = await createNoneItem(suffix);
      await addByAdjustment(itemId, locationId);
      const invoice = await createEligibleInvoice(`کالای ${suffix}`, `CAT-LOCATION-${suffix}`, 1);
      const result = await manager.post('/api/v1/warehouse/reservations')
        .set('x-csrf-token', managerSession.csrfToken).set('idempotency-key', randomUUID())
        .send({ invoiceLineId: invoice.lineId }).expect(201);
      expect(result.body.reservation).toMatchObject({
        status: 'PARTIALLY_RESERVED', reservedQuantity: '0.000000', shortageQuantity: '1.000000',
      });
    }
    await withTenantTransaction({ workspaceId: ids.workspaceAlpha, companyId: ids.companyAlpha }, async (client) => {
      const invalid = await client.query<{ count: string }>(`
        SELECT count(*)::text AS count FROM inventory_allocations allocation
        JOIN warehouse_locations location ON location.id = allocation.location_id
        WHERE location.location_type <> 'SELLABLE'
      `);
      expect(invalid.rows[0]?.count).toBe('0');
    });
  });

  it('prevents concurrent oversell, supports partial reservation, and releases without changing physical stock', async () => {
    const item = await manager.post('/api/v1/warehouse/items').set('x-csrf-token', managerSession.csrfToken)
      .send({ sku: 'CONCURRENT-001', name: 'کالای آزمون همزمانی', catalogReference: 'CAT-CONCURRENT-001', trackingMode: 'NONE', uom: 'PCS' }).expect(201);
    const receipt = await manager.post('/api/v1/warehouse/receipts')
      .set('x-csrf-token', managerSession.csrfToken).set('idempotency-key', randomUUID())
      .send({ warehouseId: warehouseOne, receivingLocationId: storageOne, receiptType: 'PURCHASE', sourceNote: 'خرید همزمانی', lines: [{ inventoryItemId: item.body.item.id, quantity: '5', evidenceNote: 'فاکتور خرید' }] }).expect(201);
    await manager.post(`/api/v1/warehouse/receipts/${receipt.body.receipt.id}/post`).set('x-csrf-token', managerSession.csrfToken).expect(200);
    const first = await createEligibleInvoice('کالای همزمان اول', 'CAT-CONCURRENT-001', 4);
    const second = await createEligibleInvoice('کالای همزمان دوم', 'CAT-CONCURRENT-001', 4);
    const [firstReservation, secondReservation] = await Promise.all([
      manager.post('/api/v1/warehouse/reservations').set('x-csrf-token', managerSession.csrfToken)
        .set('idempotency-key', randomUUID()).send({ invoiceLineId: first.lineId }),
      manager.post('/api/v1/warehouse/reservations').set('x-csrf-token', managerSession.csrfToken)
        .set('idempotency-key', randomUUID()).send({ invoiceLineId: second.lineId }),
    ]);
    expect([firstReservation.status, secondReservation.status]).toEqual([201, 201]);
    const reservations = [firstReservation.body.reservation, secondReservation.body.reservation];
    expect(reservations.map((item) => item.status).sort()).toEqual(['PARTIALLY_RESERVED', 'RESERVED']);
    expect(reservations.reduce((sum, item) => sum + BigInt(item.reservedQuantity.replace('.', '')), 0n)).toBe(5_000_000n);
    const partial = reservations.find((item) => item.status === 'PARTIALLY_RESERVED')!;
    await manager.post(`/api/v1/warehouse/reservations/${partial.id}/release`)
      .set('x-csrf-token', managerSession.csrfToken).send({ reason: 'آزادسازی آزمون کمبود' }).expect(200);
    await withTenantTransaction({ workspaceId: ids.workspaceAlpha, companyId: ids.companyAlpha }, async (client) => {
      const physical = await client.query<{ quantity: string }>(`SELECT sum(balance.on_hand_quantity)::text AS quantity
        FROM inventory_balances balance JOIN stock_identities identity ON identity.id = balance.stock_identity_id
        WHERE identity.inventory_item_id = $1`, [item.body.item.id]);
      expect(physical.rows[0]?.quantity).toBe('5.000000');
    });
  });

  it('dispatches and fully receives Transfers while denying negative inventory and preserving idempotency', async () => {
    const key = randomUUID();
    const input = {
      sourceWarehouseId: warehouseOne, destinationWarehouseId: warehouseTwo,
      sourceLocationId: storageOne, destinationLocationId: storageTwo, reason: 'تأمین انبار دوم',
      lines: [{ stockIdentityId: noneStockIdentity, quantity: '1.000001' }],
    };
    const created = await manager.post('/api/v1/warehouse/transfers').set('x-csrf-token', managerSession.csrfToken)
      .set('idempotency-key', key).send(input).expect(201);
    const repeated = await manager.post('/api/v1/warehouse/transfers').set('x-csrf-token', managerSession.csrfToken)
      .set('idempotency-key', key).send(input).expect(201);
    expect(repeated.body.transfer.id).toBe(created.body.transfer.id);
    await manager.post(`/api/v1/warehouse/transfers/${created.body.transfer.id}/dispatch`)
      .set('x-csrf-token', managerSession.csrfToken).expect(200);
    await manager.post(`/api/v1/warehouse/transfers/${created.body.transfer.id}/receive`)
      .set('x-csrf-token', managerSession.csrfToken).expect(200)
      .expect(({ body }) => expect(body.transfer.status).toBe('RECEIVED'));

    const transferOutMovement = await withTenantTransaction(
      { workspaceId: ids.workspaceAlpha, companyId: ids.companyAlpha },
      async (client) => (await client.query<{ id: string }>(`
        SELECT id FROM inventory_movements WHERE source_type = 'WAREHOUSE_TRANSFER'
          AND source_id = $1 AND movement_type = 'TRANSFER_OUT'
      `, [created.body.transfer.id])).rows[0]!.id,
    );
    await manager.post(`/api/v1/warehouse/movements/${transferOutMovement}/reverse`)
      .set('x-csrf-token', managerSession.csrfToken).send({ reason: 'برگشت تک‌حرکت ممنوع' }).expect(409)
      .expect(({ body }) => expect(body.error.code).toBe('transfer_document_reversal_required'));
    await manager.post(`/api/v1/warehouse/transfers/${created.body.transfer.id}/reverse`)
      .set('x-csrf-token', managerSession.csrfToken).send({ reason: 'برگشت کامل انتقال دریافت‌شده' }).expect(200)
      .expect(({ body }) => expect(body.transfer.status).toBe('CANCELLED'));

    const inTransit = await manager.post('/api/v1/warehouse/transfers')
      .set('x-csrf-token', managerSession.csrfToken).set('idempotency-key', randomUUID())
      .send({ ...input, lines: [{ stockIdentityId: noneStockIdentity, quantity: '0.250000' }] }).expect(201);
    await manager.post(`/api/v1/warehouse/transfers/${inTransit.body.transfer.id}/dispatch`)
      .set('x-csrf-token', managerSession.csrfToken).expect(200);
    await manager.post(`/api/v1/warehouse/transfers/${inTransit.body.transfer.id}/reverse`)
      .set('x-csrf-token', managerSession.csrfToken).send({ reason: 'لغو کامل پیش از دریافت' }).expect(200)
      .expect(({ body }) => expect(body.transfer.status).toBe('CANCELLED'));

    const concurrent = await manager.post('/api/v1/warehouse/transfers')
      .set('x-csrf-token', managerSession.csrfToken).set('idempotency-key', randomUUID())
      .send({ ...input, lines: [{ stockIdentityId: noneStockIdentity, quantity: '0.500000' }] }).expect(201);
    await manager.post(`/api/v1/warehouse/transfers/${concurrent.body.transfer.id}/dispatch`)
      .set('x-csrf-token', managerSession.csrfToken).expect(200);
    await manager.post(`/api/v1/warehouse/transfers/${concurrent.body.transfer.id}/receive`)
      .set('x-csrf-token', managerSession.csrfToken).expect(200);
    const concurrentResults = await Promise.all([
      manager.post(`/api/v1/warehouse/transfers/${concurrent.body.transfer.id}/reverse`)
        .set('x-csrf-token', managerSession.csrfToken).send({ reason: 'برگشت همزمان کامل' }),
      manager.post(`/api/v1/warehouse/transfers/${concurrent.body.transfer.id}/reverse`)
        .set('x-csrf-token', managerSession.csrfToken).send({ reason: 'برگشت همزمان کامل' }),
    ]);
    expect(concurrentResults.map((result) => result.status)).toEqual([200, 200]);

    const partial = await manager.post('/api/v1/warehouse/transfers')
      .set('x-csrf-token', managerSession.csrfToken).set('idempotency-key', randomUUID())
      .send({ ...input, lines: [{ stockIdentityId: noneStockIdentity, quantity: '0.750000' }] }).expect(201);
    await manager.post(`/api/v1/warehouse/transfers/${partial.body.transfer.id}/dispatch`)
      .set('x-csrf-token', managerSession.csrfToken).expect(200);
    await withTenantTransaction({ workspaceId: ids.workspaceAlpha, companyId: ids.companyAlpha }, async (client) => {
      await client.query('UPDATE warehouse_transfer_lines SET received_quantity = $2 WHERE transfer_id = $1', [partial.body.transfer.id, '0.250000']);
    });
    await manager.post(`/api/v1/warehouse/transfers/${partial.body.transfer.id}/reverse`)
      .set('x-csrf-token', managerSession.csrfToken).send({ reason: 'برگشت ناایمن انتقال جزئی' }).expect(409)
      .expect(({ body }) => expect(body.error.code).toBe('warehouse_transfer_reversal_unsafe'));
    await withTenantTransaction({ workspaceId: ids.workspaceAlpha, companyId: ids.companyAlpha }, async (client) => {
      const partialReversals = await client.query<{ count: string }>(`
        SELECT count(*)::text AS count FROM inventory_movements
        WHERE source_type = 'WAREHOUSE_TRANSFER_REVERSAL' AND source_id = $1
      `, [partial.body.transfer.id]);
      expect(partialReversals.rows[0]?.count).toBe('0');
      await client.query('UPDATE warehouse_transfer_lines SET received_quantity = 0 WHERE transfer_id = $1', [partial.body.transfer.id]);
      const concurrentReversals = await client.query<{ count: string }>(`
        SELECT count(*)::text AS count FROM inventory_movements
        WHERE source_type = 'WAREHOUSE_TRANSFER_REVERSAL' AND source_id = $1
      `, [concurrent.body.transfer.id]);
      expect(concurrentReversals.rows[0]?.count).toBe('2');
    });
    await manager.post(`/api/v1/warehouse/transfers/${partial.body.transfer.id}/reverse`)
      .set('x-csrf-token', managerSession.csrfToken).send({ reason: 'برگشت کامل پس از رفع وضعیت جزئی' }).expect(200);

    const excessive = await manager.post('/api/v1/warehouse/transfers').set('x-csrf-token', managerSession.csrfToken)
      .set('idempotency-key', randomUUID()).send({ ...input, lines: [{ stockIdentityId: noneStockIdentity, quantity: '999999' }] }).expect(201);
    await manager.post(`/api/v1/warehouse/transfers/${excessive.body.transfer.id}/dispatch`)
      .set('x-csrf-token', managerSession.csrfToken).expect(409)
      .expect(({ body }) => expect(body.error.code).toBe('negative_inventory_denied'));

    await withTenantTransaction({ workspaceId: ids.workspaceAlpha, companyId: ids.companyAlpha }, async (client) => {
      const conservation = await client.query<{ source_id: string; net: string }>(`
        WITH effects AS (
          SELECT source_id, -quantity AS delta FROM inventory_movements
          WHERE source_type IN ('WAREHOUSE_TRANSFER', 'WAREHOUSE_TRANSFER_REVERSAL') AND from_location_id IS NOT NULL
          UNION ALL
          SELECT source_id, quantity AS delta FROM inventory_movements
          WHERE source_type IN ('WAREHOUSE_TRANSFER', 'WAREHOUSE_TRANSFER_REVERSAL') AND to_location_id IS NOT NULL
        )
        SELECT source_id, sum(delta)::text AS net FROM effects GROUP BY source_id HAVING sum(delta) <> 0
      `);
      expect(conservation.rows).toHaveLength(0);
    });
  });

  it('enforces maker-checker for Adjustments and Counts and creates immutable reversible ledger entries', async () => {
    const adjustment = await maker.post('/api/v1/warehouse/adjustments')
      .set('x-csrf-token', makerSession.csrfToken).set('idempotency-key', randomUUID())
      .send({
        warehouseId: warehouseOne, locationId: receivingOne, reason: 'اصلاح کنترل‌شده موجودی', evidenceNote: 'صورت‌جلسه اصلاح',
        lines: [{ stockIdentityId: noneStockIdentity, direction: 'IN', quantity: '0.000001' }],
      }).expect(201);
    await maker.post(`/api/v1/warehouse/adjustments/${adjustment.body.adjustment.id}/submit`)
      .set('x-csrf-token', makerSession.csrfToken).expect(200);
    await maker.post(`/api/v1/warehouse/adjustments/${adjustment.body.adjustment.id}/approve`)
      .set('x-csrf-token', makerSession.csrfToken).expect(409)
      .expect(({ body }) => expect(body.error.code).toBe('warehouse_maker_checker_denied'));
    await manager.post(`/api/v1/warehouse/adjustments/${adjustment.body.adjustment.id}/approve`)
      .set('x-csrf-token', managerSession.csrfToken).expect(200);

    const count = await maker.post('/api/v1/warehouse/counts')
      .set('x-csrf-token', makerSession.csrfToken).set('idempotency-key', randomUUID())
      .send({
        warehouseId: warehouseOne, locationId: receivingOne, reason: 'شمارش دوره‌ای مستقل',
        lines: [{ stockIdentityId: noneStockIdentity, actualQuantity: '11.123455' }],
      }).expect(201);
    await maker.post(`/api/v1/warehouse/counts/${count.body.count.id}/submit`)
      .set('x-csrf-token', makerSession.csrfToken).expect(200);
    await manager.post(`/api/v1/warehouse/counts/${count.body.count.id}/approve`)
      .set('x-csrf-token', managerSession.csrfToken).expect(200);

    const movement = await withTenantTransaction({ workspaceId: ids.workspaceAlpha, companyId: ids.companyAlpha }, async (client) => {
      const result = await client.query<{ id: string }>(`SELECT id FROM inventory_movements
        WHERE source_type = 'INVENTORY_ADJUSTMENT' AND source_id = $1`, [adjustment.body.adjustment.id]);
      return result.rows[0]!.id;
    });
    await expect(withTenantTransaction({ workspaceId: ids.workspaceAlpha, companyId: ids.companyAlpha }, async (client) => (
      client.query('UPDATE inventory_movements SET reason = $2 WHERE id = $1', [movement, 'بازنویسی ممنوع'])
    ))).rejects.toThrow(/immutable|permission denied/i);
    const reversed = await manager.post(`/api/v1/warehouse/movements/${movement}/reverse`)
      .set('x-csrf-token', managerSession.csrfToken).send({ reason: 'برگشت کنترل‌شده اصلاح' }).expect(200);
    expect(reversed.body.movement.movementId).not.toBe(movement);
  });

  it('receives Returns and records every approved disposition without Shipment or financial mutation', async () => {
    const returned = await manager.post('/api/v1/warehouse/returns')
      .set('x-csrf-token', managerSession.csrfToken).set('idempotency-key', randomUUID())
      .send({
        warehouseId: warehouseOne, returnsLocationId: returnsOne, customerId: ids.customerAlpha,
        reason: 'برگشت مشتری برای بازرسی', evidenceNote: 'رسید تحویل مشتری',
        lines: [{ inventoryItemId: itemNone, quantity: '5' }],
      }).expect(201);
    await manager.post(`/api/v1/warehouse/returns/${returned.body.inventoryReturn.id}/receive`)
      .set('x-csrf-token', managerSession.csrfToken).expect(200);
    const lineId = await withTenantTransaction({ workspaceId: ids.workspaceAlpha, companyId: ids.companyAlpha }, async (client) => (
      await client.query<{ id: string }>('SELECT id FROM inventory_return_lines WHERE return_id = $1', [returned.body.inventoryReturn.id])
    ).rows[0]!.id);
    const dispositions = [
      { disposition: 'SELLABLE', destinationLocationId: storageOne },
      { disposition: 'QUARANTINE', destinationLocationId: quarantineOne },
      { disposition: 'DAMAGED', destinationLocationId: damagedOne },
      { disposition: 'RETURN_TO_SUPPLIER' },
      { disposition: 'SCRAP' },
    ];
    for (const [index, disposition] of dispositions.entries()) {
      const inspected = await manager.post(`/api/v1/warehouse/returns/${returned.body.inventoryReturn.id}/lines/${lineId}/inspect`)
        .set('x-csrf-token', managerSession.csrfToken)
        .send({ ...disposition, quantity: '1', reason: `نتیجه بازرسی شماره ${index + 1}` }).expect(200);
      if (index === dispositions.length - 1) expect(inspected.body.inspection.status).toBe('INSPECTED');
    }
    await withTenantTransaction({ workspaceId: ids.workspaceAlpha, companyId: ids.companyAlpha }, async (client) => {
      const rows = await client.query<{ disposition: string }>('SELECT disposition FROM inventory_return_inspections WHERE return_id = $1 ORDER BY disposition', [returned.body.inventoryReturn.id]);
      expect(rows.rows.map((row) => row.disposition).sort()).toEqual(dispositions.map((item) => item.disposition).sort());
    });
  });

  it('rebuilds InventoryBalance from the immutable Movement ledger and detects projection drift', async () => {
    await manager.get('/api/v1/warehouse/projection/verify').expect(200)
      .expect(({ body }) => expect(body.projection.consistent).toBe(true));
    const changed = await withTenantTransaction(
      { workspaceId: ids.workspaceAlpha, companyId: ids.companyAlpha },
      async (client) => (await client.query<{ location_id: string; stock_identity_id: string }>(`
        UPDATE inventory_balances SET on_hand_quantity = on_hand_quantity + 0.000001
        WHERE (workspace_id, location_id, stock_identity_id) = (
          SELECT balance.workspace_id, balance.location_id, balance.stock_identity_id FROM inventory_balances balance
          JOIN stock_identities identity ON identity.id = balance.stock_identity_id
          WHERE identity.serial_id IS NULL ORDER BY balance.location_id, balance.stock_identity_id LIMIT 1
        )
        RETURNING location_id, stock_identity_id
      `)).rows[0]!,
    );
    await manager.get('/api/v1/warehouse/projection/verify').expect(409)
      .expect(({ body }) => expect(body.error.code).toBe('inventory_projection_mismatch'));
    await withTenantTransaction({ workspaceId: ids.workspaceAlpha, companyId: ids.companyAlpha }, async (client) => {
      await client.query(`UPDATE inventory_balances SET on_hand_quantity = on_hand_quantity - 0.000001
        WHERE location_id = $1 AND stock_identity_id = $2`, [changed.location_id, changed.stock_identity_id]);
    });
    await manager.get('/api/v1/warehouse/projection/verify').expect(200)
      .expect(({ body }) => expect(body.projection.consistent).toBe(true));
  });

  it('keeps Company operational stock isolated by FORCE RLS and never changes Payment status', async () => {
    const beta = request.agent(createApp());
    const betaSession = await selectContext(beta, await login(beta, 'demo@tapra.local', 'TapraDemo!2026'), 'tapra-beta', 'warehouse.read');
    const betaOverview = await beta.get('/api/v1/warehouse').expect(200);
    expect(betaOverview.body.warehouse.warehouses).toHaveLength(0);
    expect(betaOverview.body.warehouse.balances).toHaveLength(0);
    expect(betaSession.user.email).toBe('demo@tapra.local');
    await withTenantTransaction({ workspaceId: ids.workspaceBeta, companyId: ids.companyBeta }, async (client) => {
      for (const table of ['inventory_balances', 'inventory_movements', 'inventory_reservations', 'inventory_returns']) {
        const hidden = await client.query<{ count: string }>(`SELECT count(*)::text AS count FROM ${table} WHERE owner_company_id = $1`, [ids.companyAlpha]);
        expect(hidden.rows[0]?.count).toBe('0');
      }
    });
    await withTenantTransaction({ workspaceId: ids.workspaceAlpha, companyId: ids.companyAlpha }, async (client) => {
      const statuses = await client.query<{ status: string }>('SELECT DISTINCT status FROM sales_payments');
      expect(statuses.rows.every((row) => ['submitted', 'approved', 'needs_correction'].includes(row.status))).toBe(true);
      const audit = await client.query<{ count: string }>(`SELECT count(*)::text AS count FROM audit_entries WHERE action LIKE 'warehouse.%'`);
      expect(BigInt(audit.rows[0]!.count)).toBeGreaterThan(0n);
    });
  });
});
