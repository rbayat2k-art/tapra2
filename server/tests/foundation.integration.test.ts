import { randomUUID } from 'node:crypto';
import { config as loadDotEnv } from 'dotenv';
import { Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app/create-app.js';
import { resetEnvironmentForTests } from '../src/config/env.js';
import { closePool, withTenantTransaction } from '../src/infrastructure/database/pool.js';
import { runMigrations } from '../scripts/migrate.js';
import { assertSafeSeedTarget, seedDatabase } from '../scripts/seed.js';
import { normalizeIdentityText, normalizePhone, parseCustomerImportCsv } from '../src/modules/customer-imports/csv-parser.js';

interface SessionResponse {
  csrfToken: string;
  user: { id: string; email: string; requiresPasswordChange: boolean };
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

async function verifyPopulatedLegacyCustomerUpgrade(): Promise<void> {
  const workspaceId = '91000000-0000-4000-8000-000000000001';
  const companyId = '92000000-0000-4000-8000-000000000001';
  const personId = '93000000-0000-4000-8000-000000000001';
  const accountId = '94000000-0000-4000-8000-000000000001';
  const customerId = '95000000-0000-4000-8000-000000000001';
  const client = new Client({ connectionString: migrationUrl, application_name: 'tapra2_legacy_upgrade_fixture' });
  const runtimeClient = new Client({ connectionString: runtimeUrl, application_name: 'tapra2_legacy_upgrade_verify' });

  await runMigrations(migrationUrl, { through: '0007_customer_import_read_permission.sql' });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('ALTER TABLE customers NO FORCE ROW LEVEL SECURITY');
    await client.query('ALTER TABLE customer_phones NO FORCE ROW LEVEL SECURITY');
    await client.query("SELECT set_config('app.workspace_id', $1, true), set_config('app.company_id', $2, true)", [workspaceId, companyId]);
    await client.query("INSERT INTO workspaces(id, slug, name) VALUES ($1, 'legacy-upgrade', 'Legacy Upgrade')", [workspaceId]);
    await client.query("INSERT INTO companies(id, workspace_id, code, name) VALUES ($1, $2, 'LEGACY', 'Legacy Company')", [companyId, workspaceId]);
    await client.query("INSERT INTO persons(id, full_name) VALUES ($1, 'Legacy Customer Owner')", [personId]);
    await client.query(`
      INSERT INTO user_accounts(id, person_id, email, password_hash)
      VALUES ($1, $2, 'legacy-upgrade@tapra.local', 'not-used')
    `, [accountId, personId]);
    await client.query(`
      INSERT INTO customers(id, workspace_id, company_id, full_name, phone_primary, created_by_user_account_id)
      VALUES ($1, $2, $3, 'Legacy Existing Customer', '09121234567', $4)
    `, [customerId, workspaceId, companyId, accountId]);
    await client.query(`
      INSERT INTO customer_phones(workspace_id, company_id, customer_id, value, normalized_value, is_primary)
      VALUES ($1, $2, $3, '09121234567', '09121234567', true)
    `, [workspaceId, companyId, customerId]);
    await client.query('ALTER TABLE customers FORCE ROW LEVEL SECURITY');
    await client.query('ALTER TABLE customer_phones FORCE ROW LEVEL SECURITY');
    await client.query('COMMIT');

    await runMigrations(migrationUrl);

    await runtimeClient.connect();
    await runtimeClient.query('BEGIN');
    await runtimeClient.query("SELECT set_config('app.workspace_id', $1, true), set_config('app.company_id', $2, true)", [workspaceId, companyId]);
    const result = await runtimeClient.query<{ customer_identity_id: string; phone_identity_id: string }>(`
      SELECT customer.identity_id::text AS customer_identity_id,
             phone.identity_id::text AS phone_identity_id
      FROM customers customer
      JOIN customer_phones phone ON phone.customer_id = customer.id
      WHERE customer.id = $1
    `, [customerId]);
    await runtimeClient.query('COMMIT');
    if (!result.rows[0]?.customer_identity_id || result.rows[0].customer_identity_id !== result.rows[0].phone_identity_id) {
      throw new Error('Legacy Customer identity backfill did not preserve the existing relationship.');
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    await runtimeClient.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await runtimeClient.end().catch(() => undefined);
    await client.end();
  }
}

async function login(agent: ReturnType<typeof request.agent>, email: string, password: string): Promise<SessionResponse> {
  const response = await agent.post('/api/v1/auth/login').send({ email, password }).expect(200);
  return response.body as SessionResponse;
}

async function activateTemporaryCredential(
  agent: ReturnType<typeof request.agent>,
  email: string,
  temporaryPassword: string,
): Promise<SessionResponse> {
  const session = await login(agent, email, temporaryPassword);
  expect(session.user.requiresPasswordChange).toBe(true);
  const firstContext = session.memberships[0];
  if (firstContext) {
    await agent
      .post('/api/v1/session/context')
      .set('x-csrf-token', session.csrfToken)
      .send({ membershipId: firstContext.membershipId, scopeType: firstContext.scope.type, scopeId: firstContext.scope.id })
      .expect(403)
      .expect(({ body }) => expect(body.error.code).toBe('password_change_required'));
  }
  const newPassword = `Activated!Aa9-${randomUUID()}`;
  const changed = await agent
    .post('/api/v1/auth/password')
    .set('x-csrf-token', session.csrfToken)
    .send({ currentPassword: temporaryPassword, newPassword })
    .expect(200);
  expect(changed.body.user.requiresPasswordChange).toBe(false);
  await request(createApp()).post('/api/v1/auth/login').send({ email, password: temporaryPassword }).expect(401);
  await request(createApp()).post('/api/v1/auth/login').send({ email, password: newPassword }).expect(200);
  return changed.body as SessionResponse;
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
    .send({ membershipId: membership.membershipId, scopeType: membership.scope.type, scopeId: membership.scope.id })
    .expect(200);
  return response.body as SessionResponse;
}

describe('Foundation Sprint 1 vertical slice', () => {
  let createdCustomerId: string;
  let alphaWorkspaceId: string;
  let alphaCompanyId: string;
  let populatedLegacyUpgradeVerified = false;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_MIGRATION_URL = migrationUrl;
    process.env.DATABASE_URL = runtimeUrl;
    process.env.SESSION_COOKIE_SECURE = 'false';
    resetEnvironmentForTests();
    await closePool();
    await resetTestDatabase();
    await verifyPopulatedLegacyCustomerUpgrade();
    populatedLegacyUpgradeVerified = true;
    await resetTestDatabase();
    await runMigrations(migrationUrl);
    await seedDatabase(migrationUrl);
  });

  afterAll(async () => {
    await closePool();
  });

  it('backfills workspace identities for populated pre-0008 Customer data', () => {
    expect(populatedLegacyUpgradeVerified).toBe(true);
  });

  it('refuses unsafe or production seed targets before connecting', () => {
    const ownerDev = 'postgresql://tapra2_owner:placeholder@localhost:5432/tapra2_dev';
    const appTest = 'postgresql://tapra2_app:placeholder@localhost:5432/tapra2_test';
    expect(() => assertSafeSeedTarget(ownerDev, 'tapra2_owner', 'production')).toThrow(/forbidden/);
    expect(() => assertSafeSeedTarget(ownerDev, 'tapra2_owner', 'test')).toThrow(/tapra2_test/);
    expect(() => assertSafeSeedTarget('postgresql://postgres:placeholder@localhost:5432/tapra2_dev', 'tapra2_owner', 'development')).toThrow(/tapra2_owner/);
    expect(assertSafeSeedTarget(ownerDev, 'tapra2_owner', 'development')).toEqual({ database: 'tapra2_dev' });
    expect(assertSafeSeedTarget(appTest, 'tapra2_app', 'test')).toEqual({ database: 'tapra2_test' });
  });

  it('rejects unauthenticated customer reads', async () => {
    await request(createApp()).get('/api/v1/customers').expect(401).expect(({ body }) => {
      expect(body.error.code).toBe('authentication_required');
    });
  });

  it('authenticates, verifies membership, and requires an active context', async () => {
    const agent = request.agent(createApp());
    const session = await login(agent, 'demo@tapra.local', 'TapraDemo!2026');
    expect(session.memberships.some((item) => item.company?.id)).toBe(true);
    expect(session.memberships.some((item) => item.company === null)).toBe(true);
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

  it('parses bounded CSV safely and normalizes Persian identity values deterministically', () => {
    const rows = parseCustomerImportCsv('\uFEFFfull_name,phone,purchase_reference\n"علی رضایی","+98 912 345 6789","سفارش, ۱"');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.purchase_reference).toBe('سفارش, ۱');
    expect(normalizePhone(rows[0]!.phone)).toBe('09123456789');
    expect(normalizeIdentityText('  علي   كريمي  ')).toBe('علی کریمی');
    expect(() => parseCustomerImportCsv('phone\n09120000000')).toThrow();
    expect(() => parseCustomerImportCsv('full_name,phone\n"broken,09120000000')).toThrow();
  });

  it('requires import permission and keeps staged data tenant-isolated', async () => {
    const reader = request.agent(createApp());
    let readerSession = await login(reader, 'alpha-only@tapra.local', 'TapraAlpha!2026');
    readerSession = await selectContext(reader, readerSession, 'tapra-alpha');
    await reader.get('/api/v1/customer-imports').expect(403);
    await reader
      .post('/api/v1/customer-imports')
      .set('x-csrf-token', readerSession.csrfToken)
      .set('idempotency-key', randomUUID())
      .set('x-file-name', 'reader.csv')
      .set('content-type', 'text/csv')
      .send('full_name,phone\nReader Import,09128880001')
      .expect(403);

    const manager = request.agent(createApp());
    let managerSession = await login(manager, 'demo@tapra.local', 'TapraDemo!2026');
    managerSession = await selectContext(manager, managerSession, 'tapra-alpha');
    const staged = await manager
      .post('/api/v1/customer-imports')
      .set('x-csrf-token', managerSession.csrfToken)
      .set('idempotency-key', randomUUID())
      .set('x-file-name', 'tenant-check.csv')
      .set('content-type', 'text/csv')
      .send('full_name,phone\nTenant Import,09128880002\nBeta Seed Phone,09120000002')
      .expect(201);
    expect(staged.body.import.counts).toMatchObject({ total: 2, valid: 2, exactMatch: 0 });
    expect(staged.body.import.records).toBeUndefined();
    expect(staged.body.import.fileSha256).toBeUndefined();

    const owner = new Client({ connectionString: migrationUrl, application_name: 'tapra2_import_permission_test' });
    await owner.connect();
    try {
      await owner.query(`
        INSERT INTO role_permissions(role_id, permission_code)
        VALUES ('60000000-0000-4000-8000-000000000003', 'customer.import.read')
        ON CONFLICT DO NOTHING
      `);
      const importReader = request.agent(createApp());
      let importReaderSession = await login(importReader, 'alpha-only@tapra.local', 'TapraAlpha!2026');
      importReaderSession = await selectContext(importReader, importReaderSession, 'tapra-alpha');
      const summaries = await importReader.get('/api/v1/customer-imports').expect(200);
      const summary = summaries.body.imports.find((item: { id: string }) => item.id === staged.body.import.id);
      expect(summary).toBeTruthy();
      expect(summary.records).toBeUndefined();
      expect(summary.fileSha256).toBeUndefined();
      await importReader.get(`/api/v1/customer-imports/${staged.body.import.id}`).expect(403);
    } finally {
      await owner.query(`
        DELETE FROM role_permissions
        WHERE role_id = '60000000-0000-4000-8000-000000000003'
          AND permission_code = 'customer.import.read'
      `);
      await owner.end();
    }

    const reviewerDetail = await manager.get(`/api/v1/customer-imports/${staged.body.import.id}`).expect(200);
    expect(reviewerDetail.body.import.records).toHaveLength(2);
    expect(reviewerDetail.body.import.records[0].rawData).toBeTruthy();

    await reader
      .post(`/api/v1/customer-imports/${staged.body.import.id}/apply-safe-decisions`)
      .set('x-csrf-token', readerSession.csrfToken)
      .send({})
      .expect(403);

    managerSession = await selectContext(manager, managerSession, 'tapra-beta');
    await manager.get(`/api/v1/customer-imports/${staged.body.import.id}`).expect(404);
  });

  it('stages, reconciles, and idempotently approves Customer imports with provenance and audit history', async () => {
    const agent = request.agent(createApp());
    let session = await login(agent, 'demo@tapra.local', 'TapraDemo!2026');
    session = await selectContext(agent, session, 'tapra-alpha');
    const possibleName = `Import Possible ${randomUUID()}`;
    await agent
      .post('/api/v1/customers')
      .set('x-csrf-token', session.csrfToken)
      .set('idempotency-key', randomUUID())
      .send({ fullName: possibleName, phonePrimary: '09127770990' })
      .expect(201);
    const before = await agent.get('/api/v1/customers').expect(200);

    const csv = [
      'full_name,phone,phone_secondary,province,city,address,postal_code,purchase_reference,purchase_date,purchase_amount,source_reference,purchased_item',
      'Import New Person,09127770001,,Tehran,Tehran,First address,1234567890,ORDER-1,2026-01-10,1250000,legacy-sales,Test service one',
      'Import New Person,09127770001,,,,,,ORDER-2,2026-02-10,2500000,legacy-sales,Test service two',
      'Seed Exact Phone,09120000001,,,,,,ORDER-3,2026-03-10,300000,legacy-sales,Test product three',
      `${possibleName},09127770002,,,,,,ORDER-4,2026-04-10,400000,legacy-sales,Test product four`,
      'Invalid Import,12,,,,,,ORDER-5,2026-05-10,500000,legacy-sales,Invalid test item',
      'Invalid Import Date,09127770003,,,,,,ORDER-6,2026-02-30,600000,legacy-sales,Invalid date item',
      'Invalid Import Amount,09127770004,,,,,,ORDER-7,2026-05-12,not-a-number,legacy-sales,Invalid amount item',
    ].join('\n');
    const key = randomUUID();
    const staged = await agent
      .post('/api/v1/customer-imports')
      .set('x-csrf-token', session.csrfToken)
      .set('idempotency-key', key)
      .set('x-file-name', 'customer-import-test.csv')
      .set('x-import-source', 'Automated test fixture')
      .set('content-type', 'text/csv')
      .send(csv)
      .expect(201);
    expect(staged.body.import.counts).toMatchObject({ total: 7, valid: 1, invalid: 3, exactMatch: 2, possibleDuplicate: 1 });
    const afterStaging = await agent.get('/api/v1/customers').expect(200);
    expect(afterStaging.body.customers).toHaveLength(before.body.customers.length);

    const repeated = await agent
      .post('/api/v1/customer-imports')
      .set('x-csrf-token', session.csrfToken)
      .set('idempotency-key', key)
      .set('x-file-name', 'customer-import-test.csv')
      .set('x-import-source', 'Automated test fixture')
      .set('content-type', 'text/csv')
      .send(csv)
      .expect(201);
    expect(repeated.body.import.id).toBe(staged.body.import.id);

    const reviewed = await agent
      .post(`/api/v1/customer-imports/${staged.body.import.id}/apply-safe-decisions`)
      .set('x-csrf-token', session.csrfToken)
      .send({})
      .expect(200);
    await agent
      .post(`/api/v1/customer-imports/${staged.body.import.id}/approve`)
      .set('x-csrf-token', session.csrfToken)
      .send({})
      .expect(409)
      .expect(({ body }) => expect(body.error.code).toBe('customer_import_review_incomplete'));

    const possibleRecord = reviewed.body.import.records.find((record: { classification: string }) => record.classification === 'POSSIBLE_DUPLICATE');
    await agent
      .put(`/api/v1/customer-imports/${staged.body.import.id}/records/${possibleRecord.id}/decision`)
      .set('x-csrf-token', session.csrfToken)
      .send({ action: 'CREATE_NEW' })
      .expect(200);
    const approved = await agent
      .post(`/api/v1/customer-imports/${staged.body.import.id}/approve`)
      .set('x-csrf-token', session.csrfToken)
      .send({})
      .expect(200);
    expect(approved.body.import.status).toBe('approved');
    expect(approved.body.import.counts).toMatchObject({ approved: 4, rejected: 3 });
    expect(approved.body.import.completedAt).toBeTruthy();
    const approvedAgain = await agent
      .post(`/api/v1/customer-imports/${staged.body.import.id}/approve`)
      .set('x-csrf-token', session.csrfToken)
      .send({})
      .expect(200);
    expect(approvedAgain.body.import.id).toBe(staged.body.import.id);

    const createdRecord = approved.body.import.records.find((record: { rowNumber: number }) => record.rowNumber === 2);
    const linkedRecord = approved.body.import.records.find((record: { rowNumber: number }) => record.rowNumber === 3);
    expect(linkedRecord.appliedCustomerId).toBe(createdRecord.appliedCustomerId);
    const profile = await agent.get(`/api/v1/customers/${createdRecord.appliedCustomerId}`).expect(200);
    expect(profile.body.customer.sources.filter((source: { importReference: string | null }) => source.importReference)).toHaveLength(2);
    expect(profile.body.customer.sources.some((source: { metadata: { purchasedItem?: string } }) => source.metadata.purchasedItem === 'Test service one')).toBe(true);
    expect(profile.body.customer.timeline.map((event: { eventType: string }) => event.eventType)).toEqual(expect.arrayContaining(['customer_imported', 'import_data_linked']));
    const afterApproval = await agent.get('/api/v1/customers').expect(200);
    expect(afterApproval.body.customers).toHaveLength(before.body.customers.length + 2);

    await withTenantTransaction({ workspaceId: alphaWorkspaceId, companyId: alphaCompanyId }, async (client) => {
      const audits = await client.query<{ action: string }>(`
        SELECT action FROM audit_entries WHERE resource_id = $1 OR resource_id IN (
          SELECT id FROM customer_import_records WHERE import_job_id = $1
        )
      `, [staged.body.import.id]);
      expect(audits.rows.map((row) => row.action)).toEqual(expect.arrayContaining([
        'customer_import.staged', 'customer_import.approved', 'customer_import.create_new',
        'customer_import.link_to_staged', 'customer_import.link_to_existing', 'customer_import.reject',
      ]));
    });
  });

  it('rejects unsafe import file names, malformed rows, and reused keys for different content', async () => {
    const agent = request.agent(createApp());
    let session = await login(agent, 'demo@tapra.local', 'TapraDemo!2026');
    session = await selectContext(agent, session, 'tapra-alpha');
    const key = randomUUID();
    const base = agent.post('/api/v1/customer-imports').set('x-csrf-token', session.csrfToken).set('content-type', 'text/csv');
    await base.set('idempotency-key', randomUUID()).set('x-file-name', '../unsafe.csv').send('full_name,phone\nUnsafe,09120000991').expect(400);
    await agent.post('/api/v1/customer-imports').set('x-csrf-token', session.csrfToken).set('content-type', 'text/csv')
      .set('idempotency-key', randomUUID()).set('x-file-name', 'broken.csv').send('full_name,phone\n"broken,09120000992').expect(400);
    await agent.post('/api/v1/customer-imports').set('x-csrf-token', session.csrfToken).set('content-type', 'text/csv')
      .set('idempotency-key', key).set('x-file-name', 'first.csv').send('full_name,phone\nFirst,09120000993').expect(201);
    await agent.post('/api/v1/customer-imports').set('x-csrf-token', session.csrfToken).set('content-type', 'text/csv')
      .set('idempotency-key', key).set('x-file-name', 'second.csv').send('full_name,phone\nSecond,09120000994').expect(409);
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

  it('shares Workspace identity without exposing Company-scoped Customer relationships', async () => {
    const secondCompanyId = '20000000-0000-4000-8000-000000000003';
    const secondMembershipId = randomUUID();
    const owner = new Client({ connectionString: migrationUrl, application_name: 'tapra2_multicompany_identity_test' });
    await owner.connect();
    try {
      await owner.query(`
        INSERT INTO companies(id, workspace_id, code, name)
        VALUES ($1, '10000000-0000-4000-8000-000000000001', 'ALPHA-SECOND', 'شرکت آلفا - شعبه دوم')
        ON CONFLICT (id) DO NOTHING
      `, [secondCompanyId]);
      await owner.query(`
        INSERT INTO memberships(id, workspace_id, company_id, person_id)
        VALUES ($1, '10000000-0000-4000-8000-000000000001', $2, '30000000-0000-4000-8000-000000000001')
        ON CONFLICT (id) DO NOTHING
      `, [secondMembershipId, secondCompanyId]);
      await owner.query(`
        INSERT INTO role_assignments(workspace_id, membership_id, role_id)
        VALUES ('10000000-0000-4000-8000-000000000001', $1, '60000000-0000-4000-8000-000000000001')
        ON CONFLICT DO NOTHING
      `, [secondMembershipId]);
    } finally {
      await owner.end();
    }

    const agent = request.agent(createApp());
    let session = await login(agent, 'demo@tapra.local', 'TapraDemo!2026');
    const selectCompany = async (companyId: string) => {
      const membership = session.memberships.find((item) => item.company?.id === companyId);
      if (!membership) throw new Error(`Membership for Company ${companyId} was not found.`);
      const response = await agent
        .post('/api/v1/session/context')
        .set('x-csrf-token', session.csrfToken)
        .send({ membershipId: membership.membershipId, scopeType: membership.scope.type, scopeId: membership.scope.id })
        .expect(200);
      session = response.body as SessionResponse;
    };

    await selectCompany('20000000-0000-4000-8000-000000000001');
    const firstRelationship = await agent
      .post('/api/v1/customers')
      .set('x-csrf-token', session.csrfToken)
      .set('idempotency-key', randomUUID())
      .send({ fullName: 'رابطه مشتری شرکت اول', phonePrimary: '09126667788' })
      .expect(201);

    await selectCompany(secondCompanyId);
    await agent
      .post('/api/v1/customers/duplicates/check')
      .set('x-csrf-token', session.csrfToken)
      .send({ phone: '09126667788' })
      .expect(200)
      .expect(({ body }) => expect(body).toEqual({ match: 'NO_MATCH', candidates: [] }));
    await agent.get(`/api/v1/customers/${firstRelationship.body.customer.id}`).expect(404);

    const secondRelationship = await agent
      .post('/api/v1/customers')
      .set('x-csrf-token', session.csrfToken)
      .set('idempotency-key', randomUUID())
      .send({ fullName: 'رابطه مستقل همان مشتری در شرکت دوم', phonePrimary: '+98 912 666 7788' })
      .expect(201);
    expect(secondRelationship.body.customer.id).not.toBe(firstRelationship.body.customer.id);
    expect(secondRelationship.body.customer.identityId).toBe(firstRelationship.body.customer.identityId);
    expect(secondRelationship.body.customer.canonicalIdentityId).toBe(firstRelationship.body.customer.canonicalIdentityId);
    await agent
      .post(`/api/v1/customers/${secondRelationship.body.customer.id}/addresses`)
      .set('x-csrf-token', session.csrfToken)
      .set('idempotency-key', randomUUID())
      .send({ city: 'تهران', addressText: 'نشانی اختصاصی شرکت دوم' })
      .expect(201);

    await selectCompany('20000000-0000-4000-8000-000000000001');
    await agent.get(`/api/v1/customers/${secondRelationship.body.customer.id}`).expect(404);
    const firstProfile = await agent.get(`/api/v1/customers/${firstRelationship.body.customer.id}`).expect(200);
    expect(firstProfile.body.customer.addresses).toHaveLength(0);

    const verifier = new Client({ connectionString: runtimeUrl, application_name: 'tapra2_multicompany_identity_verify' });
    await verifier.connect();
    try {
      await verifier.query('BEGIN');
      await verifier.query("SELECT set_config('app.workspace_id', $1, true), set_config('app.company_id', $2, true)", [
        '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
      ]);
      const firstIdentity = await verifier.query<{ identity_id: string }>(
        'SELECT identity_id FROM customers WHERE id = $1', [firstRelationship.body.customer.id],
      );
      await verifier.query("SELECT set_config('app.company_id', $1, true)", [secondCompanyId]);
      const secondIdentity = await verifier.query<{ identity_id: string }>(
        'SELECT identity_id FROM customers WHERE id = $1', [secondRelationship.body.customer.id],
      );
      expect(firstIdentity.rows).toHaveLength(1);
      expect(secondIdentity.rows).toHaveLength(1);
      expect(secondIdentity.rows[0]?.identity_id).toBe(firstIdentity.rows[0]?.identity_id);
      const centralPhones = await verifier.query<{ count: string }>(`
        SELECT count(*)::text AS count FROM customer_identity_phones
        WHERE workspace_id = '10000000-0000-4000-8000-000000000001'
          AND normalized_value = '09126667788'
      `);
      expect(centralPhones.rows[0]?.count).toBe('1');
      await verifier.query('COMMIT');
    } finally {
      await verifier.query('ROLLBACK').catch(() => undefined);
      await verifier.end();
    }
  });

  it('reconciles central identities separately from Company relationships with reversible lineage', async () => {
    const agent = request.agent(createApp());
    let session = await login(agent, 'demo@tapra.local', 'TapraDemo!2026');
    const alphaCompanyContext = session.memberships.find((item) =>
      item.company?.id === '20000000-0000-4000-8000-000000000001');
    const alphaWorkspaceContext = session.memberships.find((item) =>
      item.workspace.slug === 'tapra-alpha' && item.scope.type === 'WORKSPACE');
    if (!alphaCompanyContext || !alphaWorkspaceContext) throw new Error('Required Alpha contexts were not found.');

    const selectMembership = async (membership: SessionResponse['memberships'][number]) => {
      session = (await agent
        .post('/api/v1/session/context')
        .set('x-csrf-token', session.csrfToken)
        .send({ membershipId: membership.membershipId, scopeType: membership.scope.type, scopeId: membership.scope.id })
        .expect(200)).body as SessionResponse;
    };

    await selectMembership(alphaCompanyContext);
    const first = await agent
      .post('/api/v1/customers')
      .set('x-csrf-token', session.csrfToken)
      .set('idempotency-key', randomUUID())
      .send({ fullName: 'مشتری با اطلاعات اولیه', phonePrimary: '09128880101' })
      .expect(201);
    const second = await agent
      .post('/api/v1/customers')
      .set('x-csrf-token', session.csrfToken)
      .set('idempotency-key', randomUUID())
      .send({ fullName: 'نام کامل‌شده مشتری', phonePrimary: '09128880102' })
      .expect(201);
    expect(first.body.customer.identityId).not.toBe(second.body.customer.identityId);
    expect(first.body.customer.identityId).toBe(first.body.customer.canonicalIdentityId);

    await selectMembership(alphaWorkspaceContext);
    await agent
      .post('/api/v1/customer-identities/merge')
      .set('x-csrf-token', session.csrfToken)
      .set('idempotency-key', randomUUID())
      .send({
        identityId: first.body.customer.identityId,
        targetIdentityId: second.body.customer.identityId,
        reason: 'دو رابطه فعال یک شرکت نباید با merge هویت پنهان شوند.',
      })
      .expect(409)
      .expect(({ body }) => expect(body.error.code).toBe('customer_identity_relationship_conflict'));
    await selectMembership(alphaCompanyContext);

    const relationshipMerge = await agent
      .post('/api/v1/customers/merge')
      .set('x-csrf-token', session.csrfToken)
      .set('idempotency-key', randomUUID())
      .send({
        customerId: first.body.customer.id,
        targetCustomerId: second.body.customer.id,
        reason: 'ابتدا رابطه‌های تکراری همین شرکت یکپارچه شدند.',
      })
      .expect(200);

    await agent
      .post('/api/v1/customer-identities/merge')
      .set('x-csrf-token', session.csrfToken)
      .set('idempotency-key', randomUUID())
      .send({
        identityId: first.body.customer.identityId,
        targetIdentityId: second.body.customer.identityId,
        reason: 'Company scope must not reconcile Workspace identities.',
      })
      .expect(403)
      .expect(({ body }) => expect(body.error.code).toBe('customer_identity_workspace_scope_required'));

    await selectMembership(alphaWorkspaceContext);
    expect(session.activeContext?.permissions).toContain('customer.identity.reconcile');
    const identityMergeKey = randomUUID();
    const identityMerge = await agent
      .post('/api/v1/customer-identities/merge')
      .set('x-csrf-token', session.csrfToken)
      .set('idempotency-key', identityMergeKey)
      .send({
        identityId: first.body.customer.identityId,
        targetIdentityId: second.body.customer.identityId,
        reason: 'دو شماره پس از بررسی انسانی متعلق به یک شخص تشخیص داده شدند.',
      })
      .expect(200);
    expect(identityMerge.body.operation.status).toBe('active');
    expect([
      first.body.customer.identityId,
      second.body.customer.identityId,
    ]).toContain(identityMerge.body.operation.canonicalIdentityId);

    await agent
      .post('/api/v1/customer-identities/merge')
      .set('x-csrf-token', session.csrfToken)
      .set('idempotency-key', identityMergeKey)
      .send({
        identityId: first.body.customer.identityId,
        targetIdentityId: second.body.customer.identityId,
        reason: 'درخواست idempotent همان عملیات.',
      })
      .expect(200)
      .expect(({ body }) => expect(body.operation.id).toBe(identityMerge.body.operation.id));

    await agent
      .post('/api/v1/customer-identities/merge')
      .set('x-csrf-token', session.csrfToken)
      .set('idempotency-key', randomUUID())
      .send({
        identityId: first.body.customer.identityId,
        targetIdentityId: randomUUID(),
        reason: 'هویت خارج از Workspace نباید قابل کشف باشد.',
      })
      .expect(404)
      .expect(({ body }) => expect(body.error.code).toBe('customer_identity_reconciliation_not_found'));

    await selectMembership(alphaCompanyContext);
    const reconciledFirst = await agent.get(`/api/v1/customers/${first.body.customer.id}`).expect(200);
    const reconciledSecond = await agent.get(`/api/v1/customers/${second.body.customer.id}`).expect(200);
    expect(reconciledFirst.body.customer.canonicalIdentityId)
      .toBe(reconciledSecond.body.customer.canonicalIdentityId);
    await agent
      .post(`/api/v1/customers/merges/${relationshipMerge.body.operationId}/unmerge`)
      .set('x-csrf-token', session.csrfToken)
      .send({ reason: 'ترتیب ناامن بازگردانی باید رد شود.' })
      .expect(409)
      .expect(({ body }) => expect(body.error.code).toBe('customer_relationship_unmerge_identity_conflict'));

    await selectMembership(alphaWorkspaceContext);
    const reversedIdentity = await agent
      .post(`/api/v1/customer-identities/merges/${identityMerge.body.operation.id}/unmerge`)
      .set('x-csrf-token', session.csrfToken)
      .send({ reason: 'بازگردانی کنترل‌شده پس از بازبینی lineage.' })
      .expect(200);
    expect(reversedIdentity.body.operation.status).toBe('reversed');

    await selectMembership(alphaCompanyContext);
    const restoredRelationships = await agent
      .post(`/api/v1/customers/merges/${relationshipMerge.body.operationId}/unmerge`)
      .set('x-csrf-token', session.csrfToken)
      .send({ reason: 'رابطه‌های شرکتی پس از جداسازی هویت بازیابی شدند.' })
      .expect(200);
    expect(restoredRelationships.body.canonicalCustomer.status).toBe('active');
    expect(restoredRelationships.body.restoredCustomer.status).toBe('active');
    expect(restoredRelationships.body.canonicalCustomer.canonicalIdentityId)
      .not.toBe(restoredRelationships.body.restoredCustomer.canonicalIdentityId);
    const identityEvents = [
      ...restoredRelationships.body.canonicalCustomer.timeline,
      ...restoredRelationships.body.restoredCustomer.timeline,
    ].map((event: { eventType: string }) => event.eventType);
    expect(identityEvents).toContain('customer_identity_merged');
    expect(identityEvents).toContain('customer_identity_split');

    const verifier = new Client({ connectionString: runtimeUrl, application_name: 'tapra2_identity_reconciliation_verify' });
    await verifier.connect();
    try {
      await verifier.query('BEGIN');
      await verifier.query("SELECT set_config('app.workspace_id', $1, true), set_config('app.company_id', '', true)", [
        '10000000-0000-4000-8000-000000000001',
      ]);
      const lineage = await verifier.query<{ identity_count: number }>(`
        SELECT jsonb_array_length(lineage_snapshot->'identities') AS identity_count
        FROM customer_identity_merge_operations WHERE id = $1
      `, [identityMerge.body.operation.id]);
      expect(lineage.rows[0]?.identity_count).toBe(2);
      const audit = await verifier.query(`
        SELECT id FROM audit_entries
        WHERE resource_id = $1 AND action IN ('customer.identity_merged', 'customer.identity_unmerged')
      `, [identityMerge.body.operation.id]);
      expect(audit.rows).toHaveLength(2);
      await verifier.query("SELECT set_config('app.workspace_id', $1, true)", ['10000000-0000-4000-8000-000000000002']);
      const isolated = await verifier.query('SELECT id FROM customer_identity_merge_operations WHERE id = $1', [identityMerge.body.operation.id]);
      expect(isolated.rows).toHaveLength(0);
      await verifier.query('COMMIT');
    } finally {
      await verifier.query('ROLLBACK').catch(() => undefined);
      await verifier.end();
    }
  });

  it('manages multi-Company Organization access with scoped Roles, Shared Services, RLS, and Audit', async () => {
    const admin = request.agent(createApp());
    let adminSession = await login(admin, 'demo@tapra.local', 'TapraDemo!2026');
    const workspaceContext = adminSession.memberships.find((item) =>
      item.workspace.slug === 'tapra-alpha' && item.scope.type === 'WORKSPACE');
    if (!workspaceContext) throw new Error('Workspace administrator context was not found.');
    adminSession = (await admin
      .post('/api/v1/session/context')
      .set('x-csrf-token', adminSession.csrfToken)
      .send({ membershipId: workspaceContext.membershipId, scopeType: workspaceContext.scope.type, scopeId: workspaceContext.scope.id })
      .expect(200)).body as SessionResponse;

    const company = await admin
      .post('/api/v1/organization/companies')
      .set('x-csrf-token', adminSession.csrfToken)
      .send({ code: `MC${Date.now()}`, name: 'شرکت آزمون چندشرکتی', description: 'محدوده تست' })
      .expect(201);
    const sharedService = await admin
      .post('/api/v1/organization/units')
      .set('x-csrf-token', adminSession.csrfToken)
      .send({ type: 'SHARED_SERVICE', code: `MIS${Date.now()}`, name: 'خدمات مشترک داده و MIS', serviceKind: 'MIS' })
      .expect(201);
    expect(sharedService.body.unit.companyId).toBeNull();
    const branch = await admin
      .post('/api/v1/organization/units')
      .set('x-csrf-token', adminSession.csrfToken)
      .send({ type: 'BRANCH', companyId: '20000000-0000-4000-8000-000000000001', code: `BR${Date.now()}`, name: 'شعبه آزمون Alpha' })
      .expect(201);
    expect(branch.body.unit.companyId).toBe('20000000-0000-4000-8000-000000000001');

    const workspaceUser = await admin
      .post('/api/v1/organization/users')
      .set('x-csrf-token', adminSession.csrfToken)
      .send({ fullName: 'مدیر داده مشترک', email: `shared-data-${Date.now()}@tapra.local` })
      .expect(201);
    expect(workspaceUser.body.temporaryPassword).toMatch(/^.{20,}$/);
    // Provisioning is atomic: an account is never hidden as an orphan without a Membership.
    const organizationAfterProvisioning = await admin.get('/api/v1/organization').expect(200);
    expect(organizationAfterProvisioning.body.organization.users.some((item: { id: string }) => item.id === workspaceUser.body.account.id)).toBe(true);
    const workspaceMembership = { body: { membership: workspaceUser.body.account.membership } };
    expect(workspaceMembership.body.membership.companyId).toBeNull();
    const sharedRole = await admin
      .post('/api/v1/organization/roles')
      .set('x-csrf-token', adminSession.csrfToken)
      .send({
        code: `shared_data_${Date.now()}`, name: 'مدیر داده مشترک',
        permissionCodes: ['organization.read', 'organization.unit.manage'],
      })
      .expect(201);
    await admin
      .post('/api/v1/organization/role-assignments')
      .set('x-csrf-token', adminSession.csrfToken)
      .send({ membershipId: workspaceMembership.body.membership.id, roleId: sharedRole.body.role.id, scopeType: 'WORKSPACE' })
      .expect(201);

    const sharedAgent = request.agent(createApp());
    let sharedSession = await activateTemporaryCredential(sharedAgent, workspaceUser.body.account.email, workspaceUser.body.temporaryPassword);
    const sharedWorkspaceContext = sharedSession.memberships.find((item) => item.scope.type === 'WORKSPACE');
    if (!sharedWorkspaceContext) throw new Error('Workspace-level Membership did not produce a usable context.');
    sharedSession = (await sharedAgent
      .post('/api/v1/session/context')
      .set('x-csrf-token', sharedSession.csrfToken)
      .send({ membershipId: sharedWorkspaceContext.membershipId, scopeType: sharedWorkspaceContext.scope.type, scopeId: sharedWorkspaceContext.scope.id })
      .expect(200)).body as SessionResponse;
    const sharedView = await sharedAgent.get('/api/v1/organization').expect(200);
    expect(sharedView.body.organization.companies.some((item: { id: string }) => item.id === company.body.company.id)).toBe(true);
    expect(sharedView.body.organization.units.some((item: { id: string }) => item.id === sharedService.body.unit.id)).toBe(true);

    const scopedUser = await admin
      .post('/api/v1/organization/users')
      .set('x-csrf-token', adminSession.csrfToken)
      .send({ fullName: 'مدیر محدود شرکت', email: `company-manager-${Date.now()}@tapra.local` })
      .expect(201);
    const alphaMembership = await admin
      .post('/api/v1/organization/memberships')
      .set('x-csrf-token', adminSession.csrfToken)
      .send({ personId: scopedUser.body.account.personId, companyId: '20000000-0000-4000-8000-000000000001' })
      .expect(201);
    const otherMembership = await admin
      .post('/api/v1/organization/memberships')
      .set('x-csrf-token', adminSession.csrfToken)
      .send({ personId: scopedUser.body.account.personId, companyId: company.body.company.id })
      .expect(201);
    const viewerRole = await admin
      .post('/api/v1/organization/roles')
      .set('x-csrf-token', adminSession.csrfToken)
      .send({ code: `viewer_${Date.now()}`, name: 'مشاهده‌گر', permissionCodes: ['organization.read'] })
      .expect(201);
    await admin
      .post('/api/v1/organization/role-assignments')
      .set('x-csrf-token', adminSession.csrfToken)
      .send({ membershipId: alphaMembership.body.membership.id, roleId: sharedRole.body.role.id, scopeType: 'COMPANY', scopeId: company.body.company.id })
      .expect(400);
    await admin
      .post('/api/v1/organization/role-assignments')
      .set('x-csrf-token', adminSession.csrfToken)
      .send({ membershipId: alphaMembership.body.membership.id, roleId: sharedRole.body.role.id, scopeType: 'COMPANY', scopeId: '20000000-0000-4000-8000-000000000001' })
      .expect(201);
    await admin
      .post('/api/v1/organization/role-assignments')
      .set('x-csrf-token', adminSession.csrfToken)
      .send({ membershipId: otherMembership.body.membership.id, roleId: viewerRole.body.role.id, scopeType: 'COMPANY', scopeId: company.body.company.id })
      .expect(201);

    const scopedAgent = request.agent(createApp());
    let scopedSession = await activateTemporaryCredential(scopedAgent, scopedUser.body.account.email, scopedUser.body.temporaryPassword);
    const alphaContext = scopedSession.memberships.find((item) => item.company?.id === '20000000-0000-4000-8000-000000000001');
    const otherContext = scopedSession.memberships.find((item) => item.company?.id === company.body.company.id);
    if (!alphaContext || !otherContext) throw new Error('Multi-Company scoped contexts were not found.');
    expect(alphaContext.permissions).toContain('organization.unit.manage');
    expect(otherContext.permissions).not.toContain('organization.unit.manage');
    scopedSession = (await scopedAgent
      .post('/api/v1/session/context')
      .set('x-csrf-token', scopedSession.csrfToken)
      .send({ membershipId: alphaContext.membershipId, scopeType: alphaContext.scope.type, scopeId: alphaContext.scope.id })
      .expect(200)).body as SessionResponse;
    const companyView = await scopedAgent.get('/api/v1/organization').expect(200);
    expect(companyView.body.organization.companies.map((item: { id: string }) => item.id)).toEqual(['20000000-0000-4000-8000-000000000001']);
    expect(companyView.body.organization.units.some((item: { type: string }) => item.type === 'SHARED_SERVICE')).toBe(false);
    await scopedAgent
      .post('/api/v1/organization/companies')
      .set('x-csrf-token', scopedSession.csrfToken)
      .send({ code: 'FORBIDDEN', name: 'شرکت غیرمجاز' })
      .expect(403);
    await scopedAgent
      .post('/api/v1/organization/units')
      .set('x-csrf-token', scopedSession.csrfToken)
      .send({ type: 'SHARED_SERVICE', code: 'FORBIDDEN-MIS', name: 'خدمت غیرمجاز', serviceKind: 'MIS' })
      .expect(403)
      .expect(({ body }) => expect(body.error.code).toBe('workspace_scope_required'));

    const runtime = new Client({ connectionString: runtimeUrl, application_name: 'tapra2_organization_rls_negative' });
    await runtime.connect();
    try {
      await runtime.query('BEGIN');
      await runtime.query("SELECT set_config('app.workspace_id', $1, true), set_config('app.company_id', '', true)", ['10000000-0000-4000-8000-000000000001']);
      await expect(runtime.query(`
        INSERT INTO organization_units(workspace_id, unit_type, code, name, service_kind)
        VALUES ('10000000-0000-4000-8000-000000000002', 'SHARED_SERVICE', 'CROSS-TENANT', 'Cross tenant', 'DATA')
      `)).rejects.toMatchObject({ code: '42501' });
    } finally {
      await runtime.query('ROLLBACK').catch(() => undefined);
      await runtime.end();
    }

    await withTenantTransaction({
      workspaceId: '10000000-0000-4000-8000-000000000001',
      companyId: '20000000-0000-4000-8000-000000000001',
    }, async (client) => {
      const audits = await client.query<{ action: string }>(`
        SELECT action FROM audit_entries WHERE workspace_id = '10000000-0000-4000-8000-000000000001'
          AND action LIKE 'organization.%'
      `);
      expect(audits.rows.map((row) => row.action)).toEqual(expect.arrayContaining([
        'organization.company.created', 'organization.unit.created', 'organization.user.created',
        'organization.membership.upserted', 'organization.role.created', 'organization.role.assigned',
      ]));
    });
  });

  it('impersonates without passwords, caps permissions, records the real actor, and returns safely', async () => {
    const targetAgent = request.agent(createApp());
    const targetSession = await login(targetAgent, 'alpha-only@tapra.local', 'TapraAlpha!2026');
    const targetContext = targetSession.memberships.find((item) => item.company?.id === '20000000-0000-4000-8000-000000000001');
    if (!targetContext) throw new Error('Impersonation target context was not found.');

    const admin = request.agent(createApp());
    let adminSession = await login(admin, 'demo@tapra.local', 'TapraDemo!2026');
    const actorContext = adminSession.memberships.find((item) => item.workspace.slug === 'tapra-alpha' && item.scope.type === 'WORKSPACE');
    if (!actorContext) throw new Error('Impersonation actor Workspace context was not found.');
    adminSession = (await admin
      .post('/api/v1/session/context')
      .set('x-csrf-token', adminSession.csrfToken)
      .send({ membershipId: actorContext.membershipId, scopeType: actorContext.scope.type, scopeId: actorContext.scope.id })
      .expect(200)).body as SessionResponse;

    await admin
      .post('/api/v1/impersonation/start')
      .set('x-csrf-token', adminSession.csrfToken)
      .send({ targetUserAccountId: targetSession.user.id, targetMembershipId: targetContext.membershipId,
        targetScopeType: targetContext.scope.type, targetScopeId: targetContext.scope.id, reason: '', durationMinutes: 15 })
      .expect(400);
    await admin
      .post('/api/v1/impersonation/start')
      .set('x-csrf-token', adminSession.csrfToken)
      .send({ targetUserAccountId: targetSession.user.id, targetMembershipId: targetContext.membershipId,
        targetScopeType: targetContext.scope.type, targetScopeId: targetContext.scope.id,
        reason: 'بررسی دسترسی پشتیبانی', durationMinutes: 60 })
      .expect(400);

    const started = await admin
      .post('/api/v1/impersonation/start')
      .set('x-csrf-token', adminSession.csrfToken)
      .send({ targetUserAccountId: targetSession.user.id, targetMembershipId: targetContext.membershipId,
        targetScopeType: targetContext.scope.type, targetScopeId: targetContext.scope.id,
        reason: 'بررسی دسترسی پشتیبانی', durationMinutes: 15 })
      .expect(200);
    const impersonated = started.body as SessionResponse;
    expect(impersonated.user.email).toBe('alpha-only@tapra.local');
    expect(impersonated.actor.email).toBe('demo@tapra.local');
    expect(impersonated.impersonation?.reason).toBe('بررسی دسترسی پشتیبانی');
    expect(impersonated.activeContext?.permissions).toContain('customer.read');
    expect(impersonated.activeContext?.permissions).not.toContain('customer.create');
    expect(impersonated.activeContext?.permissions).not.toContain('organization.impersonate');
    await admin.get('/api/v1/customers').expect(200);
    await admin
      .post('/api/v1/customers')
      .set('x-csrf-token', impersonated.csrfToken)
      .set('idempotency-key', randomUUID())
      .send({ fullName: 'نباید ایجاد شود', phonePrimary: '09123334455' })
      .expect(403);
    await admin.get('/api/v1/organization').expect(403);
    await admin
      .post('/api/v1/impersonation/start')
      .set('x-csrf-token', impersonated.csrfToken)
      .send({ targetUserAccountId: targetSession.user.id, targetMembershipId: targetContext.membershipId,
        targetScopeType: targetContext.scope.type, targetScopeId: targetContext.scope.id,
        reason: 'نشست تو در تو', durationMinutes: 15 })
      .expect(403);

    const stopped = await admin
      .post('/api/v1/impersonation/stop')
      .set('x-csrf-token', impersonated.csrfToken)
      .send({ reason: 'پایان بررسی دسترسی' })
      .expect(200);
    expect(stopped.body.user.email).toBe('demo@tapra.local');
    expect(stopped.body.impersonation).toBeNull();

    await withTenantTransaction({
      workspaceId: '10000000-0000-4000-8000-000000000001',
      companyId: '20000000-0000-4000-8000-000000000001',
    }, async (client) => {
      const audits = await client.query<{ action: string; actor_user_account_id: string; effective_user_account_id: string; impersonation_id: string }>(`
        SELECT action, actor_user_account_id, effective_user_account_id, impersonation_id
        FROM audit_entries WHERE action LIKE 'security.impersonation.%' ORDER BY occurred_at
      `);
      expect(audits.rows.map((row) => row.action)).toEqual(['security.impersonation.started', 'security.impersonation.ended']);
      expect(audits.rows.every((row) => row.actor_user_account_id === adminSession.actor.id)).toBe(true);
      expect(audits.rows.every((row) => row.effective_user_account_id === targetSession.user.id)).toBe(true);
      expect(audits.rows.every((row) => Boolean(row.impersonation_id))).toBe(true);
    });
  });
});
