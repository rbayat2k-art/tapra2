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
        ('customer.create', 'Create Customers in the active context')
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
        ($2, 'customer.read'), ($2, 'customer.create'),
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
    console.log('Seeded deterministic Foundation identities, memberships, roles and permissions.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  seedDatabase().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Seed failed.');
    process.exit(1);
  });
}
