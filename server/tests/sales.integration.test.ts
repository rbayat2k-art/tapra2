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
  memberships: Array<{
    membershipId: string;
    workspace: { id: string; slug: string };
    company: { id: string } | null;
    permissions: string[];
  }>;
  activeContext: null | { membershipId: string };
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
): Promise<SessionResponse> {
  const membership = session.memberships.find((item) => item.workspace.slug === workspaceSlug);
  if (!membership) throw new Error(`Membership ${workspaceSlug} was not found.`);
  const response = await agent.post('/api/v1/session/context')
    .set('x-csrf-token', session.csrfToken)
    .send({ membershipId: membership.membershipId }).expect(200);
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
    managerSession = await selectContext(manager, await login(manager, 'demo@tapra.local', 'TapraDemo!2026'), 'tapra-alpha');
    sellerOne = request.agent(createApp());
    sellerOneSession = await selectContext(sellerOne, await login(sellerOne, 'sales-one@tapra.local', 'TapraSales!2026'), 'tapra-alpha');
    sellerTwo = request.agent(createApp());
    sellerTwoSession = await selectContext(sellerTwo, await login(sellerTwo, 'sales-two@tapra.local', 'TapraSales!2026'), 'tapra-alpha');
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
      ]]);
      expect(tables.rows).toHaveLength(7);
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
      currentAssignee: null,
    });

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
    const betaSession = await selectContext(betaManager, await login(betaManager, 'demo@tapra.local', 'TapraDemo!2026'), 'tapra-beta');
    await betaManager.get('/api/v1/sales/leads').expect(200)
      .expect(({ body }) => expect(body.leads).toHaveLength(0));
    const betaAssignees = await betaManager.get('/api/v1/sales/assignees').expect(200);
    expect(betaAssignees.body.assignees.map((item: { membershipId: string }) => item.membershipId))
      .toEqual([betaSession.activeContext?.membershipId]);
    await manager.post(`/api/v1/sales/leads/${leadId}/assignments`)
      .set('x-csrf-token', managerSession.csrfToken).set('idempotency-key', randomUUID())
      .send({ targetMembershipId: betaSession.activeContext?.membershipId, reason: 'cross-company check' }).expect(400);
    await betaManager.get(`/api/v1/sales/leads/${leadId}`).expect(404);
    expect(betaSession.activeContext).not.toBeNull();

    await withTenantTransaction({ workspaceId: ids.workspaceBeta, companyId: ids.companyBeta }, async (client) => {
      const leads = await client.query<{ count: string }>('SELECT count(*)::text AS count FROM sales_leads WHERE id = $1', [leadId]);
      const calls = await client.query<{ count: string }>('SELECT count(*)::text AS count FROM sales_call_logs WHERE lead_id = $1', [leadId]);
      expect(leads.rows[0]?.count).toBe('0');
      expect(calls.rows[0]?.count).toBe('0');
    });
  });
});
