import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotEnv } from 'dotenv';
import { Client } from 'pg';
import { hashPassword } from '../src/modules/identity/password.js';

loadDotEnv({ path: '.env.local', quiet: true });
loadDotEnv({ quiet: true });

const ids = {
  workspaceAlpha: '10000000-0000-4000-8000-000000000001',
  workspaceBeta: '10000000-0000-4000-8000-000000000002',
  companyAlpha: '20000000-0000-4000-8000-000000000001',
  companyBeta: '20000000-0000-4000-8000-000000000002',
  personDemo: '30000000-0000-4000-8000-000000000001',
  personAlphaOnly: '30000000-0000-4000-8000-000000000002',
  accountDemo: '40000000-0000-4000-8000-000000000001',
  accountAlphaOnly: '40000000-0000-4000-8000-000000000002',
  membershipDemoAlpha: '50000000-0000-4000-8000-000000000001',
  membershipDemoBeta: '50000000-0000-4000-8000-000000000002',
  membershipAlphaOnly: '50000000-0000-4000-8000-000000000003',
  roleAlphaManager: '60000000-0000-4000-8000-000000000001',
  roleBetaManager: '60000000-0000-4000-8000-000000000002',
  roleAlphaReader: '60000000-0000-4000-8000-000000000003',
  customerIdentityAlpha: '65000000-0000-4000-8000-000000000001',
  customerIdentityBeta: '65000000-0000-4000-8000-000000000002',
  customerAlpha: '70000000-0000-4000-8000-000000000001',
  customerBeta: '70000000-0000-4000-8000-000000000002',
} as const;

export async function seedDatabase(connectionString = process.env.DATABASE_MIGRATION_URL): Promise<void> {
  if (!connectionString?.startsWith('postgresql://')) throw new Error('DATABASE_MIGRATION_URL is required.');
  const client = new Client({ connectionString, application_name: 'tapra2_seed' });
  await client.connect();
  try {
    const demoHash = await hashPassword('TapraDemo!2026', 'tapra2-demo-seed');
    const alphaHash = await hashPassword('TapraAlpha!2026', 'tapra2-alpha-seed');
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
        ($2, 'کاربر محدود آلفا')
      ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name
    `, [ids.personDemo, ids.personAlphaOnly]);
    await client.query(`
      INSERT INTO user_accounts(id, person_id, email, password_hash) VALUES
        ($1, $2, 'demo@tapra.local', $3),
        ($4, $5, 'alpha-only@tapra.local', $6)
      ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, password_hash = EXCLUDED.password_hash, is_active = true
    `, [ids.accountDemo, ids.personDemo, demoHash, ids.accountAlphaOnly, ids.personAlphaOnly, alphaHash]);
    await client.query(`
      INSERT INTO memberships(id, workspace_id, company_id, person_id) VALUES
        ($1, $2, $3, $4),
        ($5, $6, $7, $4),
        ($8, $2, $3, $9)
      ON CONFLICT (id) DO UPDATE SET status = 'active', valid_until = NULL
    `, [
      ids.membershipDemoAlpha, ids.workspaceAlpha, ids.companyAlpha, ids.personDemo,
      ids.membershipDemoBeta, ids.workspaceBeta, ids.companyBeta,
      ids.membershipAlphaOnly, ids.personAlphaOnly,
    ]);
    await client.query(`
      INSERT INTO permissions(code, description) VALUES
        ('customer.read', 'Read Customers in the active context'),
        ('customer.create', 'Create Customers in the active context'),
        ('customer.identity.manage', 'Manage Customer identity details in the active context'),
        ('customer.merge', 'Merge and unmerge Customers in the active context'),
        ('customer.import.read', 'Read sanitized Customer import summaries in the active context'),
        ('customer.import.create', 'Create a staged Customer CSV import in the active context'),
        ('customer.import.review', 'Review and reconcile staged Customer import records'),
        ('customer.import.approve', 'Approve a reconciled Customer import into Customer 360')
      ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description
    `);
    await client.query(`
      INSERT INTO roles(id, workspace_id, code, name) VALUES
        ($1, $2, 'customer_manager', 'مدیر مشتریان'),
        ($3, $4, 'customer_manager', 'مدیر مشتریان'),
        ($5, $2, 'customer_reader', 'مشاهده‌گر مشتریان')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
    `, [ids.roleAlphaManager, ids.workspaceAlpha, ids.roleBetaManager, ids.workspaceBeta, ids.roleAlphaReader]);
    await client.query(`
      INSERT INTO role_permissions(role_id, permission_code) VALUES
        ($1, 'customer.read'), ($1, 'customer.create'),
        ($1, 'customer.identity.manage'), ($1, 'customer.merge'),
        ($1, 'customer.import.read'), ($1, 'customer.import.create'), ($1, 'customer.import.review'), ($1, 'customer.import.approve'),
        ($2, 'customer.read'), ($2, 'customer.create'),
        ($2, 'customer.identity.manage'), ($2, 'customer.merge'),
        ($2, 'customer.import.read'), ($2, 'customer.import.create'), ($2, 'customer.import.review'), ($2, 'customer.import.approve'),
        ($3, 'customer.read')
      ON CONFLICT DO NOTHING
    `, [ids.roleAlphaManager, ids.roleBetaManager, ids.roleAlphaReader]);
    await client.query(`
      INSERT INTO role_assignments(workspace_id, membership_id, role_id) VALUES
        ($1, $2, $3), ($4, $5, $6), ($1, $7, $8)
      ON CONFLICT DO NOTHING
    `, [
      ids.workspaceAlpha, ids.membershipDemoAlpha, ids.roleAlphaManager,
      ids.workspaceBeta, ids.membershipDemoBeta, ids.roleBetaManager,
      ids.membershipAlphaOnly, ids.roleAlphaReader,
    ]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }

  const runtimeConnectionString = process.env.DATABASE_URL;
  if (!runtimeConnectionString?.startsWith('postgresql://')) throw new Error('DATABASE_URL is required for tenant-scoped seed data.');
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
          INSERT INTO customers(id, workspace_id, company_id, identity_id, full_name, phone_primary, created_by_user_account_id, idempotency_key)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
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
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  seedDatabase().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Seed failed.');
    process.exit(1);
  });
}
