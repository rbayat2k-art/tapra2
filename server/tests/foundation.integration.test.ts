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

function assertDedicatedTestDatabase(connectionString: string): void {
  const parsed = new URL(connectionString);
  if (parsed.pathname !== '/tapra2_test') throw new Error('Refusing to reset a database other than tapra2_test.');
  if (decodeURIComponent(parsed.username) !== 'tapra2_owner') throw new Error('Test reset requires the tapra2_owner role.');
}

async function resetTestDatabase(): Promise<void> {
  assertDedicatedTestDatabase(migrationUrl!);
  const client = new Client({ connectionString: migrationUrl, application_name: 'tapra2_test_reset' });
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
  agent: ReturnType<typeof request.agent>,
  session: SessionResponse,
  workspaceSlug: string,
): Promise<SessionResponse> {
  const membership = session.memberships.find((item) => item.workspace.slug === workspaceSlug);
  if (!membership) throw new Error(`Seed membership ${workspaceSlug} was not found.`);
  const response = await agent
    .post('/api/v1/session/context')
    .set('x-csrf-token', session.csrfToken)
    .send({ membershipId: membership.membershipId })
    .expect(200);
  return response.body as SessionResponse;
}

describe('Foundation Sprint 1 vertical slice', () => {
  let createdCustomerId: string;
  let alphaWorkspaceId: string;
  let alphaCompanyId: string;

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
  });

  afterAll(async () => {
    await closePool();
  });

  it('rejects unauthenticated customer reads', async () => {
    await request(createApp()).get('/api/v1/customers').expect(401).expect(({ body }) => {
      expect(body.error.code).toBe('authentication_required');
    });
  });

  it('authenticates, verifies membership, and requires an active context', async () => {
    const agent = request.agent(createApp());
    const session = await login(agent, 'demo@tapra.local', 'TapraDemo!2026');
    expect(session.memberships).toHaveLength(2);
    expect(session.activeContext).toBeNull();
    await agent.get('/api/v1/customers').expect(409);

    await agent
      .post('/api/v1/session/context')
      .set('x-csrf-token', session.csrfToken)
      .send({ membershipId: '50000000-0000-4000-8000-000000000003' })
      .expect(403)
      .expect(({ body }) => expect(body.error.code).toBe('membership_forbidden'));
  });

  it('creates and reads a persistent Customer with validation, idempotency, and AuditEntry', async () => {
    const agent = request.agent(createApp());
    let session = await login(agent, 'demo@tapra.local', 'TapraDemo!2026');
    session = await selectContext(agent, session, 'tapra-alpha');
    const alpha = session.memberships.find((item) => item.workspace.slug === 'tapra-alpha')!;
    alphaWorkspaceId = alpha.workspace.id;
    alphaCompanyId = alpha.company!.id;

    await agent
      .post('/api/v1/customers')
      .set('x-csrf-token', session.csrfToken)
      .set('idempotency-key', randomUUID())
      .send({ fullName: '', phonePrimary: '1' })
      .expect(400)
      .expect(({ body }) => expect(body.error.code).toBe('validation_failed'));

    const idempotencyKey = randomUUID();
    const input = { fullName: 'مشتری آزمون پایدار', phonePrimary: '09123334455' };
    const created = await agent
      .post('/api/v1/customers')
      .set('x-csrf-token', session.csrfToken)
      .set('idempotency-key', idempotencyKey)
      .send(input)
      .expect(201);
    createdCustomerId = created.body.customer.id as string;

    const repeated = await agent
      .post('/api/v1/customers')
      .set('x-csrf-token', session.csrfToken)
      .set('idempotency-key', idempotencyKey)
      .send(input)
      .expect(201);
    expect(repeated.body.customer.id).toBe(createdCustomerId);

    await agent.get(`/api/v1/customers/${createdCustomerId}`).expect(200);
    await withTenantTransaction({ workspaceId: alphaWorkspaceId, companyId: alphaCompanyId }, async (client) => {
      const result = await client.query<{ count: string }>(`
        SELECT count(*)::text AS count FROM audit_entries
        WHERE action = 'customer.created' AND resource_id = $1
      `, [createdCustomerId]);
      expect(result.rows[0]?.count).toBe('1');
    });
  });

  it('enforces permission checks and tenant isolation', async () => {
    const reader = request.agent(createApp());
    let readerSession = await login(reader, 'alpha-only@tapra.local', 'TapraAlpha!2026');
    readerSession = await selectContext(reader, readerSession, 'tapra-alpha');
    await reader.get('/api/v1/customers').expect(200);
    await reader
      .post('/api/v1/customers')
      .set('x-csrf-token', readerSession.csrfToken)
      .set('idempotency-key', randomUUID())
      .send({ fullName: 'غیرمجاز', phonePrimary: '09127778899' })
      .expect(403)
      .expect(({ body }) => expect(body.error.code).toBe('permission_denied'));

    const manager = request.agent(createApp());
    let managerSession = await login(manager, 'demo@tapra.local', 'TapraDemo!2026');
    managerSession = await selectContext(manager, managerSession, 'tapra-beta');
    const list = await manager.get('/api/v1/customers').expect(200);
    expect(list.body.customers.some((customer: { id: string }) => customer.id === createdCustomerId)).toBe(false);
    await manager.get(`/api/v1/customers/${createdCustomerId}`).expect(404);
  });

  it('supports multiple normalized phones, addresses, provenance, timeline, and idempotency', async () => {
    const agent = request.agent(createApp());
    let session = await login(agent, 'demo@tapra.local', 'TapraDemo!2026');
    session = await selectContext(agent, session, 'tapra-alpha');

    const phoneKey = randomUUID();
    await agent
      .post(`/api/v1/customers/${createdCustomerId}/phones`)
      .set('x-csrf-token', session.csrfToken)
      .set('idempotency-key', phoneKey)
      .send({
        value: '+98 912 555 6677',
        label: 'work',
        source: { type: 'call_center', name: 'تماس ورودی تست', reference: 'call-test-1', confidence: 0.9 },
      })
      .expect(201);
    await agent
      .post(`/api/v1/customers/${createdCustomerId}/phones`)
      .set('x-csrf-token', session.csrfToken)
      .set('idempotency-key', phoneKey)
      .send({ value: '+98 912 555 6677', label: 'work' })
      .expect(201);

    await agent
      .post(`/api/v1/customers/${createdCustomerId}/addresses`)
      .set('x-csrf-token', session.csrfToken)
      .set('idempotency-key', randomUUID())
      .send({ province: 'تهران', city: 'تهران', addressText: 'خیابان آزمون، پلاک ۱', label: 'work' })
      .expect(201);
    await agent
      .post(`/api/v1/customers/${createdCustomerId}/addresses`)
      .set('x-csrf-token', session.csrfToken)
      .set('idempotency-key', randomUUID())
      .send({ province: 'البرز', city: 'کرج', addressText: 'نشانی دوم آزمون', label: 'home' })
      .expect(201);

    const duplicate = await agent
      .post('/api/v1/customers/duplicates/check')
      .set('x-csrf-token', session.csrfToken)
      .send({ phone: '09125556677' })
      .expect(200);
    expect(duplicate.body.match).toBe('EXACT_MATCH');
    expect(duplicate.body.candidates.map((candidate: { id: string }) => candidate.id)).toContain(createdCustomerId);

    const profile = await agent.get(`/api/v1/customers/${createdCustomerId}`).expect(200);
    expect(profile.body.customer.phones).toHaveLength(2);
    expect(profile.body.customer.phones.find((phone: { label: string }) => phone.label === 'work').normalizedValue).toBe('09125556677');
    expect(profile.body.customer.addresses).toHaveLength(2);
    expect(profile.body.customer.sources.some((source: { sourceType: string }) => source.sourceType === 'call_center')).toBe(true);
    const eventTypes = profile.body.customer.timeline.map((event: { eventType: string }) => event.eventType);
    expect(eventTypes).toContain('phone_added');
    expect(eventTypes.filter((event: string) => event === 'address_added')).toHaveLength(2);
  });

  it('prevents a normalized phone from silently belonging to two Customers', async () => {
    const agent = request.agent(createApp());
    let session = await login(agent, 'demo@tapra.local', 'TapraDemo!2026');
    session = await selectContext(agent, session, 'tapra-alpha');
    const second = await agent
      .post('/api/v1/customers')
      .set('x-csrf-token', session.csrfToken)
      .set('idempotency-key', randomUUID())
      .send({ fullName: 'مشتری تعارض شماره', phonePrimary: '09129990001' })
      .expect(201);
    await agent
      .post(`/api/v1/customers/${second.body.customer.id}/phones`)
      .set('x-csrf-token', session.csrfToken)
      .set('idempotency-key', randomUUID())
      .send({ value: '0098 912 555 6677' })
      .expect(409)
      .expect(({ body }) => expect(body.error.code).toBe('customer_phone_conflict'));
  });

  it('returns deterministic possible duplicate candidates without auto-merging', async () => {
    const agent = request.agent(createApp());
    let session = await login(agent, 'demo@tapra.local', 'TapraDemo!2026');
    session = await selectContext(agent, session, 'tapra-alpha');
    const result = await agent
      .post('/api/v1/customers/duplicates/check')
      .set('x-csrf-token', session.csrfToken)
      .send({ phone: '09128887766', fullName: 'مشتری آزمون پایدار' })
      .expect(200);
    expect(result.body.match).toBe('POSSIBLE_DUPLICATE');
    expect(result.body.candidates).toHaveLength(1);
  });

  it('rejects unauthorized and cross-Workspace merges', async () => {
    const manager = request.agent(createApp());
    let managerSession = await login(manager, 'demo@tapra.local', 'TapraDemo!2026');
    managerSession = await selectContext(manager, managerSession, 'tapra-alpha');
    const mergeTarget = await manager
      .post('/api/v1/customers')
      .set('x-csrf-token', managerSession.csrfToken)
      .set('idempotency-key', randomUUID())
      .send({ fullName: 'هدف ادغام مجوز', phonePrimary: '09129990002' })
      .expect(201);

    const reader = request.agent(createApp());
    let readerSession = await login(reader, 'alpha-only@tapra.local', 'TapraAlpha!2026');
    readerSession = await selectContext(reader, readerSession, 'tapra-alpha');
    await reader
      .post('/api/v1/customers/merge')
      .set('x-csrf-token', readerSession.csrfToken)
      .set('idempotency-key', randomUUID())
      .send({ customerId: createdCustomerId, targetCustomerId: mergeTarget.body.customer.id, reason: 'آزمون عدم مجوز' })
      .expect(403)
      .expect(({ body }) => expect(body.error.code).toBe('permission_denied'));

    await manager
      .post('/api/v1/customers/merge')
      .set('x-csrf-token', managerSession.csrfToken)
      .set('idempotency-key', randomUUID())
      .send({
        customerId: createdCustomerId,
        targetCustomerId: '70000000-0000-4000-8000-000000000002',
        reason: 'آزمون مرز Workspace',
      })
      .expect(409)
      .expect(({ body }) => expect(body.error.code).toBe('customer_merge_scope_violation'));
  });

  it('merges transactionally without data loss and fully restores both profiles on unmerge', async () => {
    const agent = request.agent(createApp());
    let session = await login(agent, 'demo@tapra.local', 'TapraDemo!2026');
    session = await selectContext(agent, session, 'tapra-alpha');
    const first = await agent
      .post('/api/v1/customers')
      .set('x-csrf-token', session.csrfToken)
      .set('idempotency-key', randomUUID())
      .send({ fullName: 'ادغام شونده اول', phonePrimary: '09121110001' })
      .expect(201);
    const second = await agent
      .post('/api/v1/customers')
      .set('x-csrf-token', session.csrfToken)
      .set('idempotency-key', randomUUID())
      .send({ fullName: 'ادغام شونده دوم', phonePrimary: '09121110002' })
      .expect(201);
    await agent
      .post(`/api/v1/customers/${second.body.customer.id}/addresses`)
      .set('x-csrf-token', session.csrfToken)
      .set('idempotency-key', randomUUID())
      .send({ city: 'شیراز', addressText: 'نشانی حفظ‌شونده پس از ادغام' })
      .expect(201);

    const merged = await agent
      .post('/api/v1/customers/merge')
      .set('x-csrf-token', session.csrfToken)
      .set('idempotency-key', randomUUID())
      .send({ customerId: second.body.customer.id, targetCustomerId: first.body.customer.id, reason: 'تأیید انسانی برای آزمون بازیابی' })
      .expect(200);
    expect(merged.body.canonicalCustomer.phones).toHaveLength(2);
    expect(merged.body.canonicalCustomer.addresses.some((address: { addressText: string }) => address.addressText === 'نشانی حفظ‌شونده پس از ادغام')).toBe(true);
    expect(merged.body.canonicalCustomer.timeline.some((event: { eventType: string }) => event.eventType === 'customer_merged')).toBe(true);

    await withTenantTransaction({ workspaceId: alphaWorkspaceId, companyId: alphaCompanyId }, async (client) => {
      const rows = await client.query<{ count: string }>(`
        SELECT count(*)::text AS count FROM customers WHERE id = ANY($1::uuid[])
      `, [[first.body.customer.id, second.body.customer.id]]);
      expect(rows.rows[0]?.count).toBe('2');
      const audits = await client.query<{ count: string }>(`
        SELECT count(*)::text AS count FROM audit_entries
        WHERE action = 'customer.merged' AND resource_id = $1
      `, [merged.body.operationId]);
      expect(audits.rows[0]?.count).toBe('1');
    });

    const restored = await agent
      .post(`/api/v1/customers/merges/${merged.body.operationId}/unmerge`)
      .set('x-csrf-token', session.csrfToken)
      .send({ reason: 'بازگردانی کنترل‌شده آزمون' })
      .expect(200);
    expect(restored.body.restoredCustomer.status).toBe('active');
    expect(restored.body.restoredCustomer.addresses).toHaveLength(1);
    expect(restored.body.canonicalCustomer.timeline.some((event: { eventType: string }) => event.eventType === 'customer_split')).toBe(true);
    const list = await agent.get('/api/v1/customers').expect(200);
    expect(list.body.customers.filter((customer: { id: string }) => [first.body.customer.id, second.body.customer.id].includes(customer.id))).toHaveLength(2);
  });

  it('keeps phones, addresses, duplicate candidates, and timeline isolated by Tenant RLS', async () => {
    const manager = request.agent(createApp());
    let session = await login(manager, 'demo@tapra.local', 'TapraDemo!2026');
    session = await selectContext(manager, session, 'tapra-beta');
    await manager.get(`/api/v1/customers/${createdCustomerId}`).expect(404);
    const duplicate = await manager
      .post('/api/v1/customers/duplicates/check')
      .set('x-csrf-token', session.csrfToken)
      .send({ phone: '09125556677' })
      .expect(200);
    expect(duplicate.body).toEqual({ match: 'NO_MATCH', candidates: [] });
    await manager.get(`/api/v1/customers/${createdCustomerId}/timeline`).expect(404);

    const beta = session.memberships.find((item) => item.workspace.slug === 'tapra-beta')!;
    await withTenantTransaction({ workspaceId: beta.workspace.id, companyId: beta.company!.id }, async (client) => {
      for (const table of ['customer_phones', 'customer_addresses', 'customer_timeline_events']) {
        const result = await client.query<{ count: string }>(`SELECT count(*)::text AS count FROM ${table} WHERE customer_id = $1`, [createdCustomerId]);
        expect(result.rows[0]?.count).toBe('0');
      }
    });
  });

  it('rejects malformed Customer 360 commands', async () => {
    const agent = request.agent(createApp());
    let session = await login(agent, 'demo@tapra.local', 'TapraDemo!2026');
    session = await selectContext(agent, session, 'tapra-alpha');
    await agent
      .post(`/api/v1/customers/${createdCustomerId}/phones`)
      .set('x-csrf-token', session.csrfToken)
      .set('idempotency-key', randomUUID())
      .send({ value: '12' })
      .expect(400)
      .expect(({ body }) => expect(body.error.code).toBe('validation_failed'));
    await agent
      .post(`/api/v1/customers/${createdCustomerId}/addresses`)
      .set('x-csrf-token', session.csrfToken)
      .set('idempotency-key', randomUUID())
      .send({ addressText: '' })
      .expect(400);
  });

  it('retains the Customer after the database pool and application are recreated', async () => {
    await closePool();
    resetEnvironmentForTests();
    const agent = request.agent(createApp());
    let session = await login(agent, 'demo@tapra.local', 'TapraDemo!2026');
    session = await selectContext(agent, session, 'tapra-alpha');
    await agent.get(`/api/v1/customers/${createdCustomerId}`).expect(200).expect(({ body }) => {
      expect(body.customer.fullName).toBe('مشتری آزمون پایدار');
      expect(body.customer.phones).toHaveLength(2);
      expect(body.customer.addresses).toHaveLength(2);
    });
  });
});
