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
  activeContext: null | { membershipId: string; permissions: string[] };
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
  accountSalesOne: '40000000-0000-4000-8000-000000000003',
  accountSalesTwo: '40000000-0000-4000-8000-000000000004',
  financialAccountAlpha: '80000000-0000-4000-8000-000000000001',
} as const;

function assertDedicatedTestDatabase(connectionString: string): void {
  const parsed = new URL(connectionString);
  if (parsed.pathname !== '/tapra2_test') throw new Error('Refusing to reset a database other than tapra2_test.');
  if (decodeURIComponent(parsed.username) !== 'tapra2_owner') throw new Error('Test reset requires tapra2_owner.');
}

async function resetTestDatabase(): Promise<void> {
  assertDedicatedTestDatabase(migrationUrl!);
  const client = new Client({ connectionString: migrationUrl, application_name: 'tapra2_sales_test_reset' });
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
  const response = await agent.post('/api/v1/auth/login').send({ email, password }).expect(200);
  return response.body as SessionResponse;
}

async function selectContext(
  agent: ReturnType<typeof request.agent>, session: SessionResponse, workspaceSlug: string,
  requiredPermission: string,
): Promise<SessionResponse> {
  const membership = session.memberships.find((item) => (
    item.workspace.slug === workspaceSlug
    && item.company !== null
    && item.scope.type === 'COMPANY'
    && item.permissions.includes(requiredPermission)
  ));
  if (!membership) throw new Error(`Membership ${workspaceSlug} was not found.`);
  const response = await agent.post('/api/v1/session/context')
    .set('x-csrf-token', session.csrfToken)
    .send({ membershipId: membership.membershipId, scopeType: membership.scope.type, scopeId: membership.scope.id }).expect(200);
  return response.body as SessionResponse;
}

async function selectExactContext(
  agent: ReturnType<typeof request.agent>, session: SessionResponse,
  predicate: (membership: SessionResponse['memberships'][number]) => boolean,
): Promise<SessionResponse> {
  const membership = session.memberships.find(predicate);
  if (!membership) throw new Error(`The required scoped membership was not found. Available: ${JSON.stringify(
    session.memberships.map((item) => ({ membershipId: item.membershipId, scope: item.scope, permissions: item.permissions })),
  )}`);
  const response = await agent.post('/api/v1/session/context')
    .set('x-csrf-token', session.csrfToken)
    .send({ membershipId: membership.membershipId, scopeType: membership.scope.type, scopeId: membership.scope.id })
    .expect(200);
  return response.body as SessionResponse;
}

describe('Sales Backend Vertical Slice 1', () => {
  let leadId = '';
  let manager: ReturnType<typeof request.agent>;
  let managerSession: SessionResponse;
  let sellerOne: ReturnType<typeof request.agent>;
  let sellerOneSession: SessionResponse;
  let sellerTwo: ReturnType<typeof request.agent>;
  let sellerTwoSession: SessionResponse;

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

    manager = request.agent(createApp());
    managerSession = await selectContext(manager, await login(manager, 'demo@tapra.local', 'TapraDemo!2026'), 'tapra-alpha', 'sales.lead.create');
    sellerOne = request.agent(createApp());
    sellerOneSession = await selectContext(sellerOne, await login(sellerOne, 'sales-one@tapra.local', 'TapraSales!2026'), 'tapra-alpha', 'sales.queue.read');
    sellerTwo = request.agent(createApp());
    sellerTwoSession = await selectContext(sellerTwo, await login(sellerTwo, 'sales-two@tapra.local', 'TapraSales!2026'), 'tapra-alpha', 'sales.queue.read');
  });

  afterAll(async () => { await closePool(); });

  it('applies the Sales migration with forced RLS and an explicit configurable policy', async () => {
    const owner = new Client({ connectionString: migrationUrl, application_name: 'tapra2_sales_schema_verify' });
    await owner.connect();
    try {
      const tables = await owner.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(`
        SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
        WHERE relname = ANY($1::text[]) ORDER BY relname
      `, [[
        'sales_policies', 'sales_leads', 'sales_lead_assignments', 'sales_lead_timeline_events',
        'sales_call_logs', 'sales_customer_relationships', 'sales_customer_relationship_events',
        'sales_lead_marketing_links',
      ]]);
      expect(tables.rows).toHaveLength(8);
      expect(tables.rows.every((row) => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
    } finally {
      await owner.end();
    }
    await withTenantTransaction({ workspaceId: ids.workspaceAlpha, companyId: ids.companyAlpha }, async (client) => {
      const policy = await client.query<{
        effective_call_outcomes: string[]; relationship_lock_mode: string;
        failed_call_releases_assignment: boolean; shift_end_releases_assignment: boolean;
      }>('SELECT effective_call_outcomes, relationship_lock_mode, failed_call_releases_assignment, shift_end_releases_assignment FROM sales_policies');
      expect(policy.rows[0]).toMatchObject({
        relationship_lock_mode: 'until_reassigned',
        failed_call_releases_assignment: false,
        shift_end_releases_assignment: false,
      });
      expect(policy.rows[0]?.effective_call_outcomes).toEqual(expect.arrayContaining(['real_conversation', 'interested']));
    });
  });

  it('creates an idempotent Company-scoped Lead linked to Workspace Customer identity', async () => {
    const key = randomUUID();
    const body = {
      customerId: ids.customerAlpha,
      source: 'manual-vertical-slice',
      declaredInterest: 'پیگیری سرویس سازمانی',
      priority: 'high',
      campaignReference: 'CMP-SLICE-1',
      promotionReference: 'PRM-SLICE-1',
      context: { channel: 'manual', campaign: 'CMP-SLICE-1' },
    };
    const created = await manager.post('/api/v1/sales/leads')
      .set('x-csrf-token', managerSession.csrfToken).set('idempotency-key', key)
      .send(body).expect(201);
    leadId = created.body.lead.id as string;
    expect(created.body.lead).toMatchObject({
      customerId: ids.customerAlpha,
      company: { id: ids.companyAlpha },
      campaignReference: 'CMP-SLICE-1',
      promotionReference: 'PRM-SLICE-1',
      currentAssignee: null,
    });
    await withTenantTransaction({ workspaceId: ids.workspaceAlpha, companyId: ids.companyAlpha }, async (client) => {
      const identity = await client.query<{ lead_identity: string; customer_identity: string }>(`
        SELECT lead.canonical_identity_id AS lead_identity,
          customer.canonical_identity_id AS customer_identity
        FROM sales_leads lead JOIN customers customer ON customer.id = lead.customer_id
        WHERE lead.id = $1
      `, [leadId]);
      expect(identity.rows[0]?.lead_identity).toBe(identity.rows[0]?.customer_identity);
    });
    expect(created.body.lead.marketingLinks.map((link: { type: string; referenceCode: string }) => ({
      type: link.type, referenceCode: link.referenceCode,
    }))).toEqual([
      { type: 'campaign', referenceCode: 'CMP-SLICE-1' },
      { type: 'promotion', referenceCode: 'PRM-SLICE-1' },
    ]);

    const repeated = await manager.post('/api/v1/sales/leads')
      .set('x-csrf-token', managerSession.csrfToken).set('idempotency-key', key)
      .send(body).expect(201);
    expect(repeated.body.lead.id).toBe(leadId);
  });

  it('prevents ordinary sellers from claiming work and exposes only their own queue', async () => {
    await sellerOne.get('/api/v1/sales/leads').expect(200)
      .expect(({ body }) => expect(body.leads).toHaveLength(0));
    await sellerOne.get('/api/v1/sales/assignees').expect(403);
    await sellerOne.post(`/api/v1/sales/leads/${leadId}/assignments`)
      .set('x-csrf-token', sellerOneSession.csrfToken).set('idempotency-key', randomUUID())
      .send({ targetMembershipId: ids.membershipSalesOne }).expect(403);
    await sellerOne.post(`/api/v1/sales/leads/${leadId}/marketing-links`)
      .set('x-csrf-token', sellerOneSession.csrfToken).set('idempotency-key', randomUUID())
      .send({ type: 'promotion', referenceCode: 'SELLER-CANNOT-LINK' }).expect(403);
  });

  it('allows a manager to assign while keeping other sellers isolated from the open Lead', async () => {
    const assigned = await manager.post(`/api/v1/sales/leads/${leadId}/assignments`)
      .set('x-csrf-token', managerSession.csrfToken).set('idempotency-key', randomUUID())
      .send({ targetMembershipId: ids.membershipSalesOne }).expect(201);
    expect(assigned.body.lead.currentAssignee.membershipId).toBe(ids.membershipSalesOne);
    await sellerOne.get('/api/v1/sales/leads').expect(200)
      .expect(({ body }) => expect(body.leads.map((lead: { id: string }) => lead.id)).toContain(leadId));
    await sellerTwo.get('/api/v1/sales/leads').expect(200)
      .expect(({ body }) => expect(body.leads).toHaveLength(0));
    await sellerTwo.post(`/api/v1/sales/leads/${leadId}/calls`)
      .set('x-csrf-token', sellerTwoSession.csrfToken).set('idempotency-key', randomUUID())
      .send({ outcome: 'no_answer', startedAt: new Date(Date.now() - 30_000).toISOString() }).expect(404);
  });

  it('keeps a failed call traceable without creating permanent Customer ownership', async () => {
    const response = await sellerOne.post(`/api/v1/sales/leads/${leadId}/calls`)
      .set('x-csrf-token', sellerOneSession.csrfToken).set('idempotency-key', randomUUID())
      .send({
        outcome: 'no_answer', startedAt: new Date(Date.now() - 45_000).toISOString(),
        note: 'پاسخ داده نشد', context: { dialer: 'manual' },
      }).expect(201);
    expect(response.body.lead.currentAssignee.membershipId).toBe(ids.membershipSalesOne);
    expect(response.body.lead.calls[0]).toMatchObject({
      outcome: 'no_answer', effective: false, companyName: 'شرکت آلفا',
      salespersonName: 'فروشنده نمونه یک', campaignReference: 'CMP-SLICE-1',
    });
    expect(response.body.lead.relationship).toBeNull();

    await withTenantTransaction({ workspaceId: ids.workspaceAlpha, companyId: ids.companyAlpha }, async (client) => {
      const relationships = await client.query<{ count: string }>('SELECT count(*)::text AS count FROM sales_customer_relationships');
      expect(relationships.rows[0]?.count).toBe('0');
    });
  });

  it('creates the Company relationship and lock only after a policy-effective call', async () => {
    const response = await sellerOne.post(`/api/v1/sales/leads/${leadId}/calls`)
      .set('x-csrf-token', sellerOneSession.csrfToken).set('idempotency-key', randomUUID())
      .send({
        outcome: 'real_conversation', startedAt: new Date(Date.now() - 120_000).toISOString(),
        note: 'مذاکره واقعی انجام شد', context: { callContext: 'sales-queue' },
      }).expect(201);
    expect(response.body.lead).toMatchObject({
      status: 'in_negotiation',
      relationship: { lockMode: 'until_reassigned', ownerMembershipId: ids.membershipSalesOne },
    });
    expect(response.body.lead.firstEffectiveContactAt).toBeTruthy();
    expect(response.body.lead.marketingLinks.every((link: { relationshipId: string | null }) => (
      link.relationshipId === response.body.lead.relationship.id
    ))).toBe(true);
    expect(response.body.lead.calls[0].marketingSnapshot.map((link: { referenceCode: string }) => link.referenceCode))
      .toEqual(['CMP-SLICE-1', 'PRM-SLICE-1']);

    await withTenantTransaction({ workspaceId: ids.workspaceAlpha, companyId: ids.companyAlpha }, async (client) => {
      const timeline = await client.query<{ count: string }>(`
        SELECT count(*)::text AS count FROM customer_timeline_events
        WHERE customer_id = $1 AND event_type = 'sales_call_logged'
      `, [ids.customerAlpha]);
      const audit = await client.query<{ count: string }>(`
        SELECT count(*)::text AS count FROM audit_entries WHERE action = 'sales.call.logged'
      `);
      expect(Number(timeline.rows[0]?.count)).toBe(2);
      expect(Number(audit.rows[0]?.count)).toBe(2);
    });
  });

  it('links an additional Promotion to the existing Lead/relationship with idempotent Audit/history', async () => {
    const key = randomUUID();
    const input = {
      type: 'promotion', referenceCode: 'PRM-UPSELL-1', displayName: 'پیشنهاد مکمل اعتبارسنجی',
      context: { source: 'integration-test' },
    };
    const linked = await manager.post(`/api/v1/sales/leads/${leadId}/marketing-links`)
      .set('x-csrf-token', managerSession.csrfToken).set('idempotency-key', key)
      .send(input).expect(201);
    expect(linked.body.lead.marketingLinks).toHaveLength(3);
    expect(linked.body.lead.marketingLinks.at(-1)).toMatchObject({
      type: 'promotion', referenceCode: 'PRM-UPSELL-1', displayName: 'پیشنهاد مکمل اعتبارسنجی',
      relationshipId: linked.body.lead.relationship.id,
    });

    const repeated = await manager.post(`/api/v1/sales/leads/${leadId}/marketing-links`)
      .set('x-csrf-token', managerSession.csrfToken).set('idempotency-key', key)
      .send(input).expect(201);
    expect(repeated.body.lead.marketingLinks).toHaveLength(3);

    await withTenantTransaction({ workspaceId: ids.workspaceAlpha, companyId: ids.companyAlpha }, async (client) => {
      const audit = await client.query<{ count: string }>(`
        SELECT count(*)::text AS count FROM audit_entries
        WHERE action = 'sales.marketing.linked' AND resource_type = 'sales_marketing_link'
      `);
      const history = await client.query<{ count: string }>(`
        SELECT count(*)::text AS count FROM customer_timeline_events
        WHERE customer_id = $1 AND event_type = 'sales_marketing_linked'
      `, [ids.customerAlpha]);
      expect(audit.rows[0]?.count).toBe('1');
      expect(history.rows[0]?.count).toBe('1');
    });
  });

  it('lets a manager reassign with a reason, transfers the lock, and appends Audit/history', async () => {
    await manager.post(`/api/v1/sales/leads/${leadId}/assignments`)
      .set('x-csrf-token', managerSession.csrfToken).set('idempotency-key', randomUUID())
      .send({ targetMembershipId: ids.membershipSalesTwo }).expect(400);

    const reassigned = await manager.post(`/api/v1/sales/leads/${leadId}/assignments`)
      .set('x-csrf-token', managerSession.csrfToken).set('idempotency-key', randomUUID())
      .send({ targetMembershipId: ids.membershipSalesTwo, reason: 'انتقال برنامه‌ریزی‌شده توسط مدیر فروش' }).expect(201);
    expect(reassigned.body.lead).toMatchObject({
      currentAssignee: { membershipId: ids.membershipSalesTwo },
      relationship: { ownerMembershipId: ids.membershipSalesTwo },
    });
    expect(reassigned.body.lead.assignments.map((item: { type: string }) => item.type)).toEqual(['assigned', 'reassigned']);
    await sellerOne.get('/api/v1/sales/leads').expect(200)
      .expect(({ body }) => expect(body.leads).toHaveLength(0));
    await sellerTwo.get('/api/v1/sales/leads').expect(200)
      .expect(({ body }) => expect(body.leads.map((lead: { id: string }) => lead.id)).toContain(leadId));

    await withTenantTransaction({ workspaceId: ids.workspaceAlpha, companyId: ids.companyAlpha }, async (client) => {
      const audit = await client.query<{ reason: string; previous_state: { assigneeMembershipId: string }; new_state: { assigneeMembershipId: string } }>(`
        SELECT reason, previous_state, new_state FROM audit_entries
        WHERE action = 'sales.lead.reassigned' AND resource_id = $1 ORDER BY occurred_at DESC LIMIT 1
      `, [leadId]);
      expect(audit.rows[0]).toMatchObject({
        reason: 'انتقال برنامه‌ریزی‌شده توسط مدیر فروش',
        previous_state: { assigneeMembershipId: ids.membershipSalesOne },
        new_state: { assigneeMembershipId: ids.membershipSalesTwo },
      });
    });
  });

  it('keeps Sales activity isolated from another Company at API and PostgreSQL RLS layers', async () => {
    const betaManager = request.agent(createApp());
    const betaSession = await selectContext(betaManager, await login(betaManager, 'demo@tapra.local', 'TapraDemo!2026'), 'tapra-beta', 'sales.lead.create');
    await betaManager.get('/api/v1/sales/leads').expect(200)
      .expect(({ body }) => expect(body.leads).toHaveLength(0));
    const betaAssignees = await betaManager.get('/api/v1/sales/assignees').expect(200);
    expect(betaAssignees.body.assignees.map((item: { membershipId: string }) => item.membershipId))
      .toEqual([betaSession.activeContext?.membershipId]);
    await manager.post(`/api/v1/sales/leads/${leadId}/assignments`)
      .set('x-csrf-token', managerSession.csrfToken).set('idempotency-key', randomUUID())
      .send({ targetMembershipId: betaSession.activeContext?.membershipId, reason: 'cross-company check' }).expect(400);
    await betaManager.get(`/api/v1/sales/leads/${leadId}`).expect(404);
    await betaManager.post(`/api/v1/sales/leads/${leadId}/marketing-links`)
      .set('x-csrf-token', betaSession.csrfToken).set('idempotency-key', randomUUID())
      .send({ type: 'campaign', referenceCode: 'CROSS-COMPANY' }).expect(404);
    expect(betaSession.activeContext).not.toBeNull();

    await withTenantTransaction({ workspaceId: ids.workspaceBeta, companyId: ids.companyBeta }, async (client) => {
      const leads = await client.query<{ count: string }>('SELECT count(*)::text AS count FROM sales_leads WHERE id = $1', [leadId]);
      const calls = await client.query<{ count: string }>('SELECT count(*)::text AS count FROM sales_call_logs WHERE lead_id = $1', [leadId]);
      expect(leads.rows[0]?.count).toBe('0');
      expect(calls.rows[0]?.count).toBe('0');
    });
  });

  it('creates one PostgreSQL Invoice from a direct Sale with stable Customer identity and seller/actor attribution', async () => {
    const created = await sellerTwo.post('/api/v1/sales/sales')
      .set('x-csrf-token', sellerTwoSession.csrfToken).set('idempotency-key', randomUUID())
      .send({
        customerId: ids.customerAlpha,
        leadId,
        entryMode: 'direct',
        source: { channel: 'sales-queue' },
        lines: [
          { itemType: 'goods', itemName: 'کالای نمونه سازمانی', quantity: 2, unitPrice: '500000', discountAmount: '100000' },
          { itemType: 'service', itemName: 'خدمت راه‌اندازی', quantity: 1, unitPrice: '300000', discountAmount: '0' },
        ],
      }).expect(201);
    const invoice = created.body.invoice;
    expect(invoice).toMatchObject({
      status: 'awaiting_supervisor_approval', paymentStatus: 'unpaid', revision: 1,
      subtotalAmount: '1300000', discountAmount: '100000', finalAmount: '1200000',
      sale: {
        entryMode: 'direct', seller: { membershipId: ids.membershipSalesTwo },
        customer: { id: ids.customerAlpha }, leadId,
      },
    });
    expect(invoice.sale.actor.name).toBe(invoice.sale.seller.name);
    expect(invoice.lines.every((line: { fulfillmentStatus: string }) => line.fulfillmentStatus === 'blocked_by_payment')).toBe(true);

    await sellerOne.get('/api/v1/sales/invoices').expect(200)
      .expect(({ body }) => expect(body.invoices).toHaveLength(0));
    await sellerOne.get(`/api/v1/sales/invoices/${invoice.id}`).expect(404);
    await sellerTwo.get('/api/v1/sales/invoices').expect(200)
      .expect(({ body }) => expect(body.invoices.map((item: { id: string }) => item.id)).toContain(invoice.id));

    const database = await withTenantTransaction({ workspaceId: ids.workspaceAlpha, companyId: ids.companyAlpha }, async (client) => {
      const row = await client.query<{ canonical_identity_id: string; relation_identity_id: string; invoices: string }>(`
        SELECT sale.canonical_identity_id, customer.canonical_identity_id AS relation_identity_id,
          count(invoice.id)::text AS invoices
        FROM sales_transactions sale
        JOIN customers customer ON customer.id = sale.customer_id
        JOIN sales_invoices invoice ON invoice.sale_id = sale.id
        WHERE sale.id = $1 GROUP BY sale.canonical_identity_id, customer.canonical_identity_id
      `, [invoice.sale.id]);
      return row.rows[0];
    });
    expect(database?.canonical_identity_id).toBe(database?.relation_identity_id);
    expect(database?.invoices).toBe('1');
  });

  it('supports audited paper entry while keeping seller and actor separate and preventing self-approval', async () => {
    const created = await manager.post('/api/v1/sales/sales')
      .set('x-csrf-token', managerSession.csrfToken).set('idempotency-key', randomUUID())
      .send({
        customerId: ids.customerAlpha, entryMode: 'paper_entry', sellerMembershipId: ids.membershipSalesOne,
        source: { paperReference: 'PAPER-001' },
        lines: [{ itemType: 'service', itemName: 'خدمت ثبت کاغذی', quantity: 1, unitPrice: '250000' }],
      }).expect(201);
    expect(created.body.invoice.sale).toMatchObject({
      entryMode: 'paper_entry', seller: { membershipId: ids.membershipSalesOne },
    });
    expect(created.body.invoice.sale.actor.name).not.toBe(created.body.invoice.sale.seller.name);

    const ownSale = await manager.post('/api/v1/sales/sales')
      .set('x-csrf-token', managerSession.csrfToken).set('idempotency-key', randomUUID())
      .send({
        customerId: ids.customerAlpha, entryMode: 'paper_entry', sellerMembershipId: managerSession.activeContext?.membershipId,
        lines: [{ itemType: 'service', itemName: 'فاکتور تست تفکیک وظایف', quantity: 1, unitPrice: '100000' }],
      }).expect(201);
    await manager.post(`/api/v1/sales/invoices/${ownSale.body.invoice.id}/supervisor-approval`)
      .set('x-csrf-token', managerSession.csrfToken).expect(409)
      .expect(({ body }) => expect(body.error.code).toBe('invoice_self_approval_denied'));
  });

  it('keeps partial approved Payments blocked and releases all current Lines only at the exact approved total', async () => {
    const invoices = await manager.get('/api/v1/sales/invoices').expect(200);
    const invoice = invoices.body.invoices.find((item: { sale: { leadId: string | null } }) => item.sale.leadId === leadId);
    await manager.post(`/api/v1/sales/invoices/${invoice.id}/supervisor-approval`)
      .set('x-csrf-token', managerSession.csrfToken).expect(200)
      .expect(({ body }) => expect(body.invoice.status).toBe('awaiting_payment'));

    const partial = await sellerTwo.post(`/api/v1/sales/invoices/${invoice.id}/payments`)
      .set('x-csrf-token', sellerTwoSession.csrfToken).set('idempotency-key', randomUUID())
      .send({
        amount: '400000', paymentMethod: 'card_to_card', occurredAt: new Date(Date.now() - 30_000).toISOString(),
        lastFourDigits: '1234', destinationAccountId: ids.financialAccountAlpha, trackingNumber: 'PAY-PARTIAL-001',
      }).expect(201);
    const firstPayment = partial.body.invoice.payments.at(-1);
    expect(partial.body.invoice.status).toBe('awaiting_financial_review');

    const partialApproved = await manager.post(`/api/v1/sales/invoices/${invoice.id}/payments/${firstPayment.id}/review`)
      .set('x-csrf-token', managerSession.csrfToken).send({ decision: 'approved' }).expect(200);
    expect(partialApproved.body.invoice).toMatchObject({
      status: 'partially_paid', paymentStatus: 'partial', approvedPaymentAmount: '400000',
    });
    expect(partialApproved.body.invoice.lines.every((line: { fulfillmentStatus: string }) => line.fulfillmentStatus === 'blocked_by_payment')).toBe(true);

    const remainder = await sellerTwo.post(`/api/v1/sales/invoices/${invoice.id}/payments`)
      .set('x-csrf-token', sellerTwoSession.csrfToken).set('idempotency-key', randomUUID())
      .send({
        amount: '800000', paymentMethod: 'bank_transfer', occurredAt: new Date(Date.now() - 20_000).toISOString(),
        lastFourDigits: '5678', destinationAccountId: ids.financialAccountAlpha, trackingNumber: 'PAY-REMAINDER-001',
      }).expect(201);
    const secondPayment = remainder.body.invoice.payments.at(-1);
    const fullyApproved = await manager.post(`/api/v1/sales/invoices/${invoice.id}/payments/${secondPayment.id}/review`)
      .set('x-csrf-token', managerSession.csrfToken).send({ decision: 'approved' }).expect(200);
    expect(fullyApproved.body.invoice).toMatchObject({
      status: 'financially_approved', paymentStatus: 'paid', approvedPaymentAmount: '1200000',
    });
    expect(fullyApproved.body.invoice.lines.every((line: { fulfillmentStatus: string }) => line.fulfillmentStatus === 'eligible')).toBe(true);
  });

  it('returns only the incorrect Payment, preserves other history, and accepts a traceable correction', async () => {
    const created = await manager.post('/api/v1/sales/sales')
      .set('x-csrf-token', managerSession.csrfToken).set('idempotency-key', randomUUID())
      .send({
        customerId: ids.customerAlpha, entryMode: 'paper_entry', sellerMembershipId: ids.membershipSalesTwo,
        lines: [{ itemType: 'service', itemName: 'خدمت قابل اصلاح', quantity: 1, unitPrice: '500000' }],
      }).expect(201);
    const invoiceId = created.body.invoice.id as string;
    await manager.post(`/api/v1/sales/invoices/${invoiceId}/supervisor-approval`)
      .set('x-csrf-token', managerSession.csrfToken).expect(200);
    const recorded = await sellerTwo.post(`/api/v1/sales/invoices/${invoiceId}/payments`)
      .set('x-csrf-token', sellerTwoSession.csrfToken).set('idempotency-key', randomUUID())
      .send({
        amount: '500000', paymentMethod: 'card_to_card', occurredAt: new Date(Date.now() - 20_000).toISOString(),
        lastFourDigits: '1111', destinationAccountId: ids.financialAccountAlpha, trackingNumber: 'PAY-WRONG-001',
      }).expect(201);
    const returnedId = recorded.body.invoice.payments[0].id as string;
    await manager.post(`/api/v1/sales/invoices/${invoiceId}/payments/${returnedId}/review`)
      .set('x-csrf-token', managerSession.csrfToken)
      .send({ decision: 'needs_correction' }).expect(400)
      .expect(({ body }) => expect(body.error.code).toBe('payment_review_reason_required'));
    const returned = await manager.post(`/api/v1/sales/invoices/${invoiceId}/payments/${returnedId}/review`)
      .set('x-csrf-token', managerSession.csrfToken)
      .send({ decision: 'needs_correction', reason: 'شماره پیگیری با رسید بانکی تطبیق ندارد' }).expect(200);
    expect(returned.body.invoice).toMatchObject({ status: 'payment_correction_required', paymentStatus: 'correction_required' });
    expect(returned.body.invoice.payments[0]).toMatchObject({ status: 'needs_correction' });

    const corrected = await sellerTwo.post(`/api/v1/sales/invoices/${invoiceId}/payments`)
      .set('x-csrf-token', sellerTwoSession.csrfToken).set('idempotency-key', randomUUID())
      .send({
        amount: '500000', paymentMethod: 'card_to_card', occurredAt: new Date(Date.now() - 10_000).toISOString(),
        lastFourDigits: '1111', destinationAccountId: ids.financialAccountAlpha,
        trackingNumber: 'PAY-CORRECT-001', correctsPaymentId: returnedId,
      }).expect(201);
    expect(corrected.body.invoice.payments[0]).toMatchObject({ status: 'superseded', supersededByPaymentId: corrected.body.invoice.payments[1].id });
    expect(corrected.body.invoice.payments[1]).toMatchObject({ status: 'submitted', correctsPaymentId: returnedId });
    const approved = await manager.post(`/api/v1/sales/invoices/${invoiceId}/payments/${corrected.body.invoice.payments[1].id}/review`)
      .set('x-csrf-token', managerSession.csrfToken).send({ decision: 'approved' }).expect(200);
    expect(approved.body.invoice.status).toBe('financially_approved');
  });

  it('keeps large Rial amounts exact and serializes duplicate Sale, Payment, and review requests', async () => {
    await manager.put('/api/v1/sales/settings/supervisor-approval')
      .set('x-csrf-token', managerSession.csrfToken).send({ required: false }).expect(200);
    try {
      const saleKey = randomUUID();
      const saleBody = {
        customerId: ids.customerAlpha, entryMode: 'direct',
        lines: [{ itemType: 'service', itemName: 'خدمت با مبلغ بزرگ', quantity: 1, unitPrice: '9007199254740993' }],
      };
      const saleResponses = await Promise.all([
        sellerTwo.post('/api/v1/sales/sales').set('x-csrf-token', sellerTwoSession.csrfToken).set('idempotency-key', saleKey).send(saleBody),
        sellerTwo.post('/api/v1/sales/sales').set('x-csrf-token', sellerTwoSession.csrfToken).set('idempotency-key', saleKey).send(saleBody),
      ]);
      expect(saleResponses.map((response) => response.status)).toEqual([201, 201]);
      const invoiceId = saleResponses[0].body.invoice.id as string;
      expect(saleResponses[1].body.invoice.id).toBe(invoiceId);
      expect(saleResponses[0].body.invoice).toMatchObject({
        finalAmount: '9007199254740993', salesApprovalRequired: false, status: 'awaiting_payment',
      });

      await sellerTwo.post(`/api/v1/sales/invoices/${invoiceId}/payments`)
        .set('x-csrf-token', sellerTwoSession.csrfToken).set('idempotency-key', randomUUID())
        .send({
          amount: '1', paymentMethod: 'payment_gateway', occurredAt: new Date(Date.now() - 5_000).toISOString(),
          destinationAccountId: ids.financialAccountAlpha, trackingNumber: 'NO-GATEWAY',
        }).expect(400);

      const paymentKey = randomUUID();
      const paymentBody = {
        amount: '9007199254740993', paymentMethod: 'bank_transfer', occurredAt: new Date(Date.now() - 10_000).toISOString(),
        lastFourDigits: '9090', destinationAccountId: ids.financialAccountAlpha, trackingNumber: 'BIG-RIAL-001',
      };
      const paymentResponses = await Promise.all([
        sellerTwo.post(`/api/v1/sales/invoices/${invoiceId}/payments`).set('x-csrf-token', sellerTwoSession.csrfToken).set('idempotency-key', paymentKey).send(paymentBody),
        sellerTwo.post(`/api/v1/sales/invoices/${invoiceId}/payments`).set('x-csrf-token', sellerTwoSession.csrfToken).set('idempotency-key', paymentKey).send(paymentBody),
      ]);
      expect(paymentResponses.map((response) => response.status)).toEqual([201, 201]);
      const paymentId = paymentResponses[0].body.invoice.payments[0].id as string;
      expect(paymentResponses[1].body.invoice.payments).toHaveLength(1);
      expect(paymentResponses[0].body.invoice.payments[0].amount).toBe('9007199254740993');

      await sellerOne.post(`/api/v1/sales/invoices/${invoiceId}/payments/${paymentId}/review`)
        .set('x-csrf-token', sellerOneSession.csrfToken).send({ decision: 'approved' }).expect(403);
      const reviewResponses = await Promise.all([
        manager.post(`/api/v1/sales/invoices/${invoiceId}/payments/${paymentId}/review`).set('x-csrf-token', managerSession.csrfToken).send({ decision: 'approved' }),
        manager.post(`/api/v1/sales/invoices/${invoiceId}/payments/${paymentId}/review`).set('x-csrf-token', managerSession.csrfToken).send({ decision: 'approved' }),
      ]);
      expect(reviewResponses.map((response) => response.status).sort()).toEqual([200, 409]);
      const final = await manager.get(`/api/v1/sales/invoices/${invoiceId}`).expect(200);
      expect(final.body.invoice).toMatchObject({
        finalAmount: '9007199254740993', approvedPaymentAmount: '9007199254740993',
        paymentStatus: 'paid', status: 'financially_approved',
      });
      expect(final.body.invoice.lines[0].fulfillmentStatus).toBe('eligible');
    } finally {
      await manager.put('/api/v1/sales/settings/supervisor-approval')
        .set('x-csrf-token', managerSession.csrfToken).send({ required: true }).expect(200);
    }
  });

  it('keeps every Invoice revision and requires supervisor reapproval after an approved amendment', async () => {
    const created = await manager.post('/api/v1/sales/sales')
      .set('x-csrf-token', managerSession.csrfToken).set('idempotency-key', randomUUID())
      .send({
        customerId: ids.customerAlpha, entryMode: 'paper_entry', sellerMembershipId: ids.membershipSalesTwo,
        lines: [{ itemType: 'service', itemName: 'خدمت نسخه اول', quantity: 1, unitPrice: '300000' }],
      }).expect(201);
    const invoiceId = created.body.invoice.id as string;
    const draftRevision = await manager.put(`/api/v1/sales/invoices/${invoiceId}`)
      .set('x-csrf-token', managerSession.csrfToken)
      .send({ lines: [{ itemType: 'service', itemName: 'خدمت نسخه دوم', quantity: 1, unitPrice: '350000' }] })
      .expect(200);
    expect(draftRevision.body.invoice).toMatchObject({ revision: 2, status: 'awaiting_supervisor_approval', finalAmount: '350000' });
    await manager.post(`/api/v1/sales/invoices/${invoiceId}/supervisor-approval`)
      .set('x-csrf-token', managerSession.csrfToken).expect(200);
    const amended = await manager.put(`/api/v1/sales/invoices/${invoiceId}`)
      .set('x-csrf-token', managerSession.csrfToken)
      .send({
        reason: 'اصلاح مبلغ پیش از شروع پرداخت',
        lines: [{ itemType: 'service', itemName: 'خدمت نسخه سوم', quantity: 1, unitPrice: '360000' }],
      }).expect(200);
    expect(amended.body.invoice).toMatchObject({ revision: 3, status: 'awaiting_supervisor_approval', finalAmount: '360000' });
    expect(amended.body.invoice.supervisorApproval).toBeNull();
    await manager.post(`/api/v1/sales/invoices/${invoiceId}/supervisor-approval`)
      .set('x-csrf-token', managerSession.csrfToken).expect(200);
    await withTenantTransaction({ workspaceId: ids.workspaceAlpha, companyId: ids.companyAlpha }, async (client) => {
      const revisions = await client.query<{ revision: number; reason: string }>(`
        SELECT revision, reason FROM sales_invoice_revisions WHERE invoice_id = $1 ORDER BY revision
      `, [invoiceId]);
      expect(revisions.rows.map((row) => row.revision)).toEqual([1, 2, 3]);
      expect(revisions.rows[2]?.reason).toBe('اصلاح مبلغ پیش از شروع پرداخت');
    });
  });

  it('denies overpayment, rejects disabled COD, and isolates Invoice data across Companies with RLS', async () => {
    const created = await manager.post('/api/v1/sales/sales')
      .set('x-csrf-token', managerSession.csrfToken).set('idempotency-key', randomUUID())
      .send({
        customerId: ids.customerAlpha, entryMode: 'paper_entry', sellerMembershipId: ids.membershipSalesTwo,
        lines: [{ itemType: 'goods', itemName: 'کالای تست اضافه پرداخت', quantity: 1, unitPrice: '200000' }],
      }).expect(201);
    const invoiceId = created.body.invoice.id as string;
    await manager.post(`/api/v1/sales/invoices/${invoiceId}/supervisor-approval`)
      .set('x-csrf-token', managerSession.csrfToken).expect(200);
    await sellerTwo.post(`/api/v1/sales/invoices/${invoiceId}/payments`)
      .set('x-csrf-token', sellerTwoSession.csrfToken).set('idempotency-key', randomUUID())
      .send({
        amount: '200000', paymentMethod: 'cod', occurredAt: new Date(Date.now() - 10_000).toISOString(),
        destinationAccountId: ids.financialAccountAlpha, trackingNumber: 'COD-DISABLED-001',
      }).expect(409).expect(({ body }) => expect(body.error.code).toBe('payment_method_disabled'));
    const recorded = await sellerTwo.post(`/api/v1/sales/invoices/${invoiceId}/payments`)
      .set('x-csrf-token', sellerTwoSession.csrfToken).set('idempotency-key', randomUUID())
      .send({
        amount: '200001', paymentMethod: 'bank_transfer', occurredAt: new Date(Date.now() - 10_000).toISOString(),
        lastFourDigits: '2222', destinationAccountId: ids.financialAccountAlpha, trackingNumber: 'OVERPAY-001',
      }).expect(201);
    await manager.post(`/api/v1/sales/invoices/${invoiceId}/payments/${recorded.body.invoice.payments[0].id}/review`)
      .set('x-csrf-token', managerSession.csrfToken).send({ decision: 'approved' }).expect(409)
      .expect(({ body }) => expect(body.error.code).toBe('payment_overpayment_denied'));
    const held = await manager.get(`/api/v1/sales/invoices/${invoiceId}`).expect(200);
    expect(held.body.invoice).toMatchObject({ status: 'awaiting_financial_review', paymentStatus: 'submitted', approvedPaymentAmount: '0' });
    expect(held.body.invoice.lines[0].fulfillmentStatus).toBe('blocked_by_payment');

    const betaManager = request.agent(createApp());
    const betaSession = await selectContext(betaManager, await login(betaManager, 'demo@tapra.local', 'TapraDemo!2026'), 'tapra-beta', 'sales.invoice.read_all');
    await betaManager.get('/api/v1/sales/invoices').expect(200)
      .expect(({ body }) => expect(body.invoices).toHaveLength(0));
    await betaManager.get(`/api/v1/sales/invoices/${invoiceId}`).expect(404);
    expect(betaSession.activeContext).not.toBeNull();
    await withTenantTransaction({ workspaceId: ids.workspaceBeta, companyId: ids.companyBeta }, async (client) => {
      for (const table of ['sales_transactions', 'sales_invoices', 'sales_invoice_lines', 'sales_payments']) {
        const result = await client.query<{ count: string }>(`SELECT count(*)::text AS count FROM ${table} WHERE company_id = $1`, [ids.companyAlpha]);
        expect(result.rows[0]?.count).toBe('0');
      }
    });
  });

  it('provisions safe Sales defaults and masked collection accounts for a newly created Company', async () => {
    const admin = request.agent(createApp());
    let adminSession = await login(admin, 'demo@tapra.local', 'TapraDemo!2026');
    adminSession = await selectExactContext(admin, adminSession, (membership) => (
      membership.workspace.id === ids.workspaceAlpha && membership.scope.type === 'WORKSPACE'
    ));
    const companyCode = `NEW${Date.now()}`;
    const created = await admin.post('/api/v1/organization/companies')
      .set('x-csrf-token', adminSession.csrfToken)
      .send({ code: companyCode, name: 'شرکت تازه برای تست فروش' }).expect(201);
    const companyId = created.body.company.id as string;
    adminSession = (await admin.get('/api/v1/auth/session').expect(200)).body as SessionResponse;
    adminSession = await selectExactContext(admin, adminSession, (membership) => (
      membership.company?.id === companyId && membership.scope.type === 'COMPANY'
    ));

    const infrastructure = await admin.get('/api/v1/sales/payment-infrastructure').expect(200);
    expect(infrastructure.body.salesApprovalPolicy.supervisorApprovalRequired).toBe(true);
    expect(infrastructure.body.policies).toHaveLength(6);
    expect(infrastructure.body.accounts).toHaveLength(0);
    const account = await admin.post('/api/v1/sales/collection-accounts')
      .set('x-csrf-token', adminSession.csrfToken)
      .send({ displayName: 'حساب وصول اصلی', bankName: 'بانک توسعه', maskedReference: '•••• ۴۳۲۱' })
      .expect(201);
    expect(account.body.account).toMatchObject({ name: 'حساب وصول اصلی', maskedReference: '•••• ۴۳۲۱', active: true });
    expect(account.body.account).not.toHaveProperty('accountNumber');
    expect(account.body.account).not.toHaveProperty('cardNumber');
    const accountId = account.body.account.id as string;
    await admin.put(`/api/v1/sales/collection-accounts/${accountId}`)
      .set('x-csrf-token', adminSession.csrfToken)
      .send({ displayName: 'حساب وصول اصلی', bankName: 'بانک توسعه', maskedReference: '•••• ۴۳۲۱', isActive: false })
      .expect(200).expect(({ body }) => expect(body.account.active).toBe(false));
    await admin.put('/api/v1/sales/settings/supervisor-approval')
      .set('x-csrf-token', adminSession.csrfToken).send({ required: false }).expect(200)
      .expect(({ body }) => expect(body.policy.supervisorApprovalRequired).toBe(false));

    await withTenantTransaction({ workspaceId: ids.workspaceAlpha, companyId: ids.companyAlpha }, async (client) => {
      const hidden = await client.query<{ count: string }>('SELECT count(*)::text AS count FROM financial_accounts WHERE id = $1', [accountId]);
      expect(hidden.rows[0]?.count).toBe('0');
    });
    await withTenantTransaction({ workspaceId: ids.workspaceAlpha, companyId }, async (client) => {
      const defaults = await client.query<{ sales: string; payments: string; approval: boolean }>(`
        SELECT (SELECT count(*)::text FROM sales_policies) AS sales,
          (SELECT count(*)::text FROM sales_payment_method_policies) AS payments,
          (SELECT supervisor_approval_required FROM sales_invoice_policies) AS approval
      `);
      expect(defaults.rows[0]).toEqual({ sales: '1', payments: '6', approval: false });
      const audit = await client.query<{ action: string }>(`
        SELECT action FROM audit_entries
        WHERE action IN ('sales.collection_account.created', 'sales.collection_account.updated', 'sales.invoice_approval_policy.updated')
        ORDER BY action
      `);
      expect(audit.rows.map((row) => row.action)).toEqual([
        'sales.collection_account.created', 'sales.collection_account.updated', 'sales.invoice_approval_policy.updated',
      ]);
    });
  });

  it('fails closed for PAPER_ENTRY in Branch, Department, and Team scopes', async () => {
    const admin = request.agent(createApp());
    let adminSession = await login(admin, 'demo@tapra.local', 'TapraDemo!2026');
    adminSession = await selectExactContext(admin, adminSession, (membership) => (
      membership.workspace.id === ids.workspaceAlpha && membership.scope.type === 'WORKSPACE'
    ));
    const units: Array<{ id: string; type: 'BRANCH' | 'DEPARTMENT' | 'TEAM' }> = [];
    let parentId: string | undefined;
    for (const type of ['BRANCH', 'DEPARTMENT', 'TEAM'] as const) {
      const unit = await admin.post('/api/v1/organization/units')
        .set('x-csrf-token', adminSession.csrfToken)
        .send({ companyId: ids.companyAlpha, parentId, type, code: `SALE_${type}`, name: `محدوده تست ${type}` })
        .expect(201);
      units.push({ id: unit.body.unit.id as string, type });
      parentId = unit.body.unit.id as string;
    }
    const role = await admin.post('/api/v1/organization/roles')
      .set('x-csrf-token', adminSession.csrfToken)
      .send({
        code: `sales_scoped_${Date.now()}`, name: 'ثبت‌کننده فروش در محدوده واحد',
        permissionCodes: ['sales.sale.create', 'sales.sale.create_on_behalf', 'sales.invoice.read_all'],
      }).expect(201);
    for (const unit of units) {
      await admin.post('/api/v1/organization/role-assignments')
        .set('x-csrf-token', adminSession.csrfToken)
        .send({ membershipId: ids.membershipSalesOne, roleId: role.body.role.id, scopeType: unit.type, scopeId: unit.id })
        .expect(201);
    }

    const scopedSeller = request.agent(createApp());
    let scopedSession = await login(scopedSeller, 'sales-one@tapra.local', 'TapraSales!2026');
    for (const unit of units) {
      scopedSession = await selectExactContext(scopedSeller, scopedSession, (membership) => (
        membership.scope.type === unit.type && membership.scope.id === unit.id
      ));
      await scopedSeller.post('/api/v1/sales/sales')
        .set('x-csrf-token', scopedSession.csrfToken).set('idempotency-key', randomUUID())
        .send({
          customerId: ids.customerAlpha, entryMode: 'paper_entry', sellerMembershipId: ids.membershipSalesOne,
          lines: [{ itemType: 'service', itemName: 'فروش خارج از محدوده پشتیبانی‌شده', quantity: 1, unitPrice: '1000' }],
        }).expect(403).expect(({ body }) => expect(body.error.code).toBe('sales_scope_unsupported'));
    }
  });

  it('blocks financial review during impersonation and for both real and effective Payment creators', async () => {
    const owner = new Client({ connectionString: migrationUrl, application_name: 'tapra2_maker_checker_setup' });
    await owner.connect();
    try {
      await owner.query(`
        INSERT INTO role_permissions(role_id, permission_code)
        VALUES
          ('60000000-0000-4000-8000-000000000005', 'sales.payment.review'),
          ('60000000-0000-4000-8000-000000000005', 'sales.invoice.read_all'),
          ('60000000-0000-4000-8000-000000000006', 'sales.invoice.read_own')
        ON CONFLICT DO NOTHING
      `);
    } finally {
      await owner.end();
    }

    const created = await manager.post('/api/v1/sales/sales')
      .set('x-csrf-token', managerSession.csrfToken).set('idempotency-key', randomUUID())
      .send({
        customerId: ids.customerAlpha, entryMode: 'paper_entry', sellerMembershipId: ids.membershipSalesOne,
        lines: [{ itemType: 'service', itemName: 'خدمت کنترل تفکیک وظایف', quantity: 1, unitPrice: '410000' }],
      }).expect(201);
    const invoiceId = created.body.invoice.id as string;
    await manager.post(`/api/v1/sales/invoices/${invoiceId}/supervisor-approval`)
      .set('x-csrf-token', managerSession.csrfToken).expect(200);

    const target = request.agent(createApp());
    const targetSession = await login(target, 'sales-one@tapra.local', 'TapraSales!2026');
    const targetContext = targetSession.memberships.find((membership) => (
      membership.company?.id === ids.companyAlpha && membership.scope.type === 'COMPANY'
    ));
    if (!targetContext) throw new Error('Target Sales context was not found.');
    const admin = request.agent(createApp());
    let adminSession = await login(admin, 'demo@tapra.local', 'TapraDemo!2026');
    adminSession = await selectExactContext(admin, adminSession, (membership) => (
      membership.workspace.id === ids.workspaceAlpha && membership.scope.type === 'WORKSPACE'
    ));
    const impersonated = await admin.post('/api/v1/impersonation/start')
      .set('x-csrf-token', adminSession.csrfToken)
      .send({
        targetUserAccountId: targetSession.user.id, targetMembershipId: targetContext.membershipId,
        targetScopeType: targetContext.scope.type, targetScopeId: targetContext.scope.id,
        reason: 'ثبت پرداخت برای آزمون تفکیک وظایف', durationMinutes: 15,
      }).expect(200);
    const impersonatedSession = impersonated.body as SessionResponse;
    const recorded = await admin.post(`/api/v1/sales/invoices/${invoiceId}/payments`)
      .set('x-csrf-token', impersonatedSession.csrfToken).set('idempotency-key', randomUUID())
      .send({
        amount: '410000', paymentMethod: 'card_to_card', occurredAt: new Date(Date.now() - 10_000).toISOString(),
        lastFourDigits: '4141', destinationAccountId: ids.financialAccountAlpha, trackingNumber: 'IMPERSONATED-001',
      });
    expect(recorded.status, JSON.stringify(recorded.body)).toBe(201);
    const paymentId = recorded.body.invoice.payments[0].id as string;
    await admin.post(`/api/v1/sales/invoices/${invoiceId}/payments/${paymentId}/review`)
      .set('x-csrf-token', impersonatedSession.csrfToken).send({ decision: 'approved' }).expect(403)
      .expect(({ body }) => expect(body.error.code).toBe('financial_review_impersonation_forbidden'));
    const stopped = await admin.post('/api/v1/impersonation/stop')
      .set('x-csrf-token', impersonatedSession.csrfToken).send({ reason: 'پایان آزمون تفکیک وظایف' }).expect(200);
    adminSession = await selectExactContext(admin, stopped.body as SessionResponse, (membership) => (
      membership.company?.id === ids.companyAlpha && membership.scope.type === 'COMPANY'
    ));
    await admin.post(`/api/v1/sales/invoices/${invoiceId}/payments/${paymentId}/review`)
      .set('x-csrf-token', adminSession.csrfToken).send({ decision: 'approved' }).expect(409)
      .expect(({ body }) => expect(body.error.code).toBe('payment_self_review_denied'));

    sellerOneSession = await selectContext(sellerOne, await login(sellerOne, 'sales-one@tapra.local', 'TapraSales!2026'), 'tapra-alpha', 'sales.payment.review');
    await sellerOne.post(`/api/v1/sales/invoices/${invoiceId}/payments/${paymentId}/review`)
      .set('x-csrf-token', sellerOneSession.csrfToken).send({ decision: 'approved' }).expect(409)
      .expect(({ body }) => expect(body.error.code).toBe('payment_self_review_denied'));
    sellerTwoSession = await selectContext(sellerTwo, await login(sellerTwo, 'sales-two@tapra.local', 'TapraSales!2026'), 'tapra-alpha', 'sales.payment.review');
    await sellerTwo.post(`/api/v1/sales/invoices/${invoiceId}/payments/${paymentId}/review`)
      .set('x-csrf-token', sellerTwoSession.csrfToken).send({ decision: 'approved' }).expect(200);

    await withTenantTransaction({ workspaceId: ids.workspaceAlpha, companyId: ids.companyAlpha }, async (client) => {
      const identity = await client.query<{
        creator_actor_user_account_id: string; creator_effective_user_account_id: string;
      }>(`
        SELECT creator_actor_user_account_id, creator_effective_user_account_id
        FROM sales_payments WHERE id = $1
      `, [paymentId]);
      expect(identity.rows[0]).toEqual({
        creator_actor_user_account_id: adminSession.actor.id,
        creator_effective_user_account_id: ids.accountSalesOne,
      });
    });
  });

  it('applies forced RLS to every new financial table and records Sale/Payment audit history', async () => {
    const owner = new Client({ connectionString: migrationUrl, application_name: 'tapra2_invoice_schema_verify' });
    await owner.connect();
    try {
      const tables = await owner.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(`
        SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
        WHERE relname = ANY($1::text[]) ORDER BY relname
      `, [[
        'financial_accounts', 'payment_gateways', 'sales_payment_method_policies', 'sales_transactions',
        'sales_invoices', 'sales_invoice_lines', 'sales_invoice_revisions', 'sales_payments',
        'sales_invoice_events', 'sales_payment_review_events', 'sales_invoice_policies',
      ]]);
      expect(tables.rows).toHaveLength(11);
      expect(tables.rows.every((row) => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
    } finally {
      await owner.end();
    }
    await withTenantTransaction({ workspaceId: ids.workspaceAlpha, companyId: ids.companyAlpha }, async (client) => {
      const audit = await client.query<{ action: string; count: string }>(`
        SELECT action, count(*)::text AS count FROM audit_entries
        WHERE action IN ('sales.invoice.created', 'sales.invoice.supervisor_approved', 'sales.payment.recorded', 'sales.payment.reviewed')
        GROUP BY action ORDER BY action
      `);
      expect(audit.rows.map((row) => row.action)).toEqual([
        'sales.invoice.created', 'sales.invoice.supervisor_approved', 'sales.payment.recorded', 'sales.payment.reviewed',
      ]);
      expect(audit.rows.every((row) => Number(row.count) > 0)).toBe(true);
    });
  });
});
