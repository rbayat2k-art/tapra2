import { config as loadDotEnv } from 'dotenv';
import { Client } from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runMigrations } from '../scripts/migrate.js';
import { seedDatabase } from '../scripts/seed.js';

loadDotEnv({ path: '.env.local', quiet: true });
const migrationUrl = process.env.TEST_DATABASE_MIGRATION_URL;
const runtimeUrl = process.env.TEST_DATABASE_URL;
if (!migrationUrl || !runtimeUrl) throw new Error('TEST_DATABASE_MIGRATION_URL and TEST_DATABASE_URL are required.');

let previousEnvironment: Record<'NODE_ENV' | 'DATABASE_MIGRATION_URL' | 'DATABASE_URL', string | undefined>;

beforeEach(() => {
  previousEnvironment = {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_MIGRATION_URL: process.env.DATABASE_MIGRATION_URL,
    DATABASE_URL: process.env.DATABASE_URL,
  };
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_MIGRATION_URL = migrationUrl;
  process.env.DATABASE_URL = runtimeUrl;
});

afterEach(() => {
  for (const [key, value] of Object.entries(previousEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function assertDedicatedTestDatabase(connectionString: string, expectedUser: 'tapra2_owner' | 'tapra2_app'): void {
  const parsed = new URL(connectionString);
  if (parsed.pathname !== '/tapra2_test' || decodeURIComponent(parsed.username) !== expectedUser) {
    throw new Error(`Warehouse migration compatibility test requires ${expectedUser} on tapra2_test.`);
  }
}

async function reset(): Promise<void> {
  assertDedicatedTestDatabase(migrationUrl!, 'tapra2_owner');
  assertDedicatedTestDatabase(runtimeUrl!, 'tapra2_app');
  const client = new Client({ connectionString: migrationUrl, application_name: 'tapra2_warehouse_migration_reset' });
  await client.connect();
  try {
    await client.query('DROP SCHEMA public CASCADE');
    await client.query('CREATE SCHEMA public AUTHORIZATION tapra2_owner');
    await client.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
  } finally { await client.end(); }
}

describe('Warehouse migration compatibility', () => {
  it('upgrades current stable data through 0019-0023, preserves it, and reruns safely', async () => {
    await reset();
    await runMigrations(migrationUrl!, { through: '0018_payment_lineage_status_cleanup.sql' });
    await seedDatabase(migrationUrl!);
    const before = new Client({ connectionString: migrationUrl, application_name: 'tapra2_warehouse_upgrade_before' });
    await before.connect();
    const companiesBefore = (await before.query<{ count: string }>('SELECT count(*)::text AS count FROM companies')).rows[0]!.count;
    const invoicesBefore = (await before.query<{ count: string }>('SELECT count(*)::text AS count FROM sales_invoices')).rows[0]!.count;
    await before.end();

    await runMigrations(migrationUrl!);
    await runMigrations(migrationUrl!);

    const after = new Client({ connectionString: migrationUrl, application_name: 'tapra2_warehouse_upgrade_after' });
    await after.connect();
    try {
      expect((await after.query<{ count: string }>('SELECT count(*)::text AS count FROM companies')).rows[0]!.count).toBe(companiesBefore);
      expect((await after.query<{ count: string }>('SELECT count(*)::text AS count FROM sales_invoices')).rows[0]!.count).toBe(invoicesBefore);
      const applied = await after.query<{ name: string }>(`SELECT name FROM schema_migrations
        WHERE name >= '0019' ORDER BY name`);
      expect(applied.rows.map((row) => row.name)).toEqual([
        '0019_warehouse_inventory_core.sql', '0020_warehouse_operations.sql',
        '0021_warehouse_controls_and_returns.sql', '0022_invoice_inventory_item_handoff.sql',
        '0023_warehouse_integrity_remediation.sql',
      ]);
      const serialColumns = await after.query<{ column_name: string }>(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'inventory_serials' ORDER BY column_name
      `);
      expect(serialColumns.rows.some((row) => row.column_name === 'owner_company_id')).toBe(false);
      const locationConstraint = await after.query<{ definition: string }>(`
        SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
        WHERE conname = 'warehouse_locations_location_type_check'
      `);
      expect(locationConstraint.rows[0]?.definition).toContain('SELLABLE');
      expect(locationConstraint.rows[0]?.definition).not.toContain('STORAGE');
      const movementCount = await after.query<{ count: string }>('SELECT count(*)::text AS count FROM inventory_movements');
      expect(movementCount.rows[0]!.count).toBe('0');
    } finally { await after.end(); }
  }, 60_000);

  it('fails safely when legacy physical Serial identities are ambiguous across owners', async () => {
    await reset();
    await runMigrations(migrationUrl!, { through: '0022_invoice_inventory_item_handoff.sql' });
    await seedDatabase(migrationUrl!);
    let client = new Client({ connectionString: migrationUrl, application_name: 'tapra2_warehouse_serial_validation' });
    await client.connect();
    try {
      const secondCompany = '20000000-0000-4000-8000-000000000099';
      const itemId = '91000000-0000-4000-8000-000000000099';
      await client.query(`INSERT INTO companies(id, workspace_id, code, name)
        VALUES ($1, '10000000-0000-4000-8000-000000000001', 'SERIAL_OWNER_2', 'مالک دوم سریال')`, [secondCompany]);
      await client.end();
      client = new Client({ connectionString: runtimeUrl, application_name: 'tapra2_warehouse_serial_validation_runtime' });
      await client.connect();
      await client.query("SELECT set_config('app.workspace_id', '10000000-0000-4000-8000-000000000001', false), set_config('app.company_id', '20000000-0000-4000-8000-000000000001', false)");
      await client.query(`INSERT INTO inventory_items(id, workspace_id, sku, name, catalog_reference, tracking_mode, uom, created_by_user_account_id)
        VALUES ($1, '10000000-0000-4000-8000-000000000001', 'SERIAL-MIGRATION', 'سریال مهاجرت',
          'SERIAL-MIGRATION', 'SERIAL', 'PCS', '40000000-0000-4000-8000-000000000001')`, [itemId]);
      await client.query(`INSERT INTO inventory_serials(workspace_id, inventory_item_id, owner_company_id, serial_code)
        VALUES ('10000000-0000-4000-8000-000000000001', $1, '20000000-0000-4000-8000-000000000001', 'PHYSICAL-DUPLICATE')`, [itemId]);
      await client.query("SELECT set_config('app.company_id', $1, false)", [secondCompany]);
      await client.query(`INSERT INTO inventory_serials(workspace_id, inventory_item_id, owner_company_id, serial_code)
        VALUES ('10000000-0000-4000-8000-000000000001', $1, $2, 'PHYSICAL-DUPLICATE')`, [itemId, secondCompany]);
    } finally { await client.end(); }

    await expect(runMigrations(migrationUrl!)).rejects.toThrow(/duplicate workspace\/item\/serial rows/i);
  }, 60_000);
});
