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

function assertDedicatedTestDatabase(connectionString: string): void {
  const parsed = new URL(connectionString);
  if (parsed.pathname !== '/tapra2_test' || decodeURIComponent(parsed.username) !== 'tapra2_owner') {
    throw new Error('Warehouse migration compatibility test requires tapra2_owner on tapra2_test.');
  }
}

async function reset(): Promise<void> {
  assertDedicatedTestDatabase(migrationUrl!);
  const client = new Client({ connectionString: migrationUrl, application_name: 'tapra2_warehouse_migration_reset' });
  await client.connect();
  try {
    await client.query('DROP SCHEMA public CASCADE');
    await client.query('CREATE SCHEMA public AUTHORIZATION tapra2_owner');
    await client.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
  } finally { await client.end(); }
}

describe('Warehouse migration compatibility', () => {
  it('upgrades current stable data through 0019-0022, preserves it, and reruns safely', async () => {
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
      ]);
      const movementCount = await after.query<{ count: string }>('SELECT count(*)::text AS count FROM inventory_movements');
      expect(movementCount.rows[0]!.count).toBe('0');
    } finally { await after.end(); }
  }, 60_000);
});
