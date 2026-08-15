import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { config as loadDotEnv } from 'dotenv';
import { Client } from 'pg';
import { describe, expect, it } from 'vitest';
import { runMigrations } from '../scripts/migrate.js';

loadDotEnv({ path: '.env.local', quiet: true });
const migrationUrl = process.env.TEST_DATABASE_MIGRATION_URL;
const runtimeUrl = process.env.TEST_DATABASE_URL;
if (!migrationUrl || !runtimeUrl) throw new Error('TEST_DATABASE_MIGRATION_URL and TEST_DATABASE_URL are required.');

const legacyChecksums = {
  lead: '5dc3fd8406316ad6ef7baea4bfa0bd204302134afeb7a6b55bcf5e0aebbecb4d',
  marketing: 'f0da64e7ba372345b3af1e18f70dffaa4461363447f72208d897159af85b865f',
} as const;

function assertDedicatedTestDatabase(connectionString: string): void {
  const parsed = new URL(connectionString);
  if (parsed.pathname !== '/tapra2_test' || decodeURIComponent(parsed.username) !== 'tapra2_owner') {
    throw new Error('Refusing to reset a database other than tapra2_test owned by tapra2_owner.');
  }
}

async function resetTestDatabase(): Promise<void> {
  assertDedicatedTestDatabase(migrationUrl!);
  const client = new Client({ connectionString: migrationUrl, application_name: 'tapra2_sales_upgrade_reset' });
  await client.connect();
  try {
    await client.query('DROP SCHEMA public CASCADE');
    await client.query('CREATE SCHEMA public AUTHORIZATION tapra2_owner');
    await client.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
  } finally {
    await client.end();
  }
}

async function exactLegacySalesMigrations(): Promise<{ lead: string; marketing: string }> {
  const leadUrl = new URL('../migrations/0013_sales_lead_queue.sql', import.meta.url);
  const marketingUrl = new URL('../migrations/0014_sales_marketing_context_links.sql', import.meta.url);
  const canonicalLead = await readFile(leadUrl, 'utf8');
  const canonicalMarketing = await readFile(marketingUrl, 'utf8');
  const lead = canonicalLead
    .replace(
      "    'sales_lead_created', 'sales_call_logged', 'sales_marketing_linked',\n    'customer_identity_merged', 'customer_identity_split'",
      "    'sales_lead_created', 'sales_call_logged'",
    )
    .replaceAll('canonical_identity_id', 'customer_identity_id')
    .replace('\nGRANT UPDATE(customer_identity_id) ON sales_call_logs TO tapra2_app;', '');
  const marketing = canonicalMarketing.replace(
    "    'sales_lead_created', 'sales_call_logged', 'sales_marketing_linked',\n    'customer_identity_merged', 'customer_identity_split'",
    "    'sales_lead_created', 'sales_call_logged', 'sales_marketing_linked'",
  );
  expect(createHash('sha256').update(lead).digest('hex')).toBe(legacyChecksums.lead);
  expect(createHash('sha256').update(marketing).digest('hex')).toBe(legacyChecksums.marketing);
  return { lead, marketing };
}

describe('Sales migration compatibility', () => {
  it('upgrades the exact legacy 0009/0010 history without resets, forged checksums, or data loss', async () => {
    await resetTestDatabase();
    await runMigrations(migrationUrl, { through: '0008_customer_identity_scope.sql' });
    const legacy = await exactLegacySalesMigrations();
    const client = new Client({ connectionString: migrationUrl, application_name: 'tapra2_exact_legacy_sales_fixture' });
    await client.connect();
    try {
      await client.query(`
        INSERT INTO workspaces(id, slug, name) VALUES
          ('10000000-0000-4000-8000-000000000091', 'legacy-sales', 'Legacy Sales')
      `);
      await client.query(`
        INSERT INTO companies(id, workspace_id, code, name) VALUES
          ('20000000-0000-4000-8000-000000000091', '10000000-0000-4000-8000-000000000091', 'LEGACY', 'Legacy Company')
      `);
      await client.query(legacy.lead);
      await client.query(legacy.marketing);
      await client.query(`
        INSERT INTO schema_migrations(name, checksum) VALUES
          ('0009_sales_lead_queue.sql', $1),
          ('0010_sales_marketing_context_links.sql', $2)
      `, [legacyChecksums.lead, legacyChecksums.marketing]);
    } finally {
      await client.end();
    }

    await runMigrations(migrationUrl);
    const verify = new Client({ connectionString: migrationUrl, application_name: 'tapra2_sales_upgrade_verify' });
    await verify.connect();
    try {
      await verify.query("SELECT set_config('app.workspace_id', $1, false), set_config('app.company_id', $2, false)", [
        '10000000-0000-4000-8000-000000000091', '20000000-0000-4000-8000-000000000091',
      ]);
      const columns = await verify.query<{ column_name: string }>(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'sales_leads'
          AND column_name IN ('customer_identity_id', 'canonical_identity_id')
      `);
      expect(columns.rows.map((row) => row.column_name)).toEqual(['canonical_identity_id']);
      const ledger = await verify.query<{ name: string; checksum: string }>(`
        SELECT name, trim(checksum) AS checksum FROM schema_migrations
        WHERE name = ANY($1::text[]) ORDER BY name
      `, [[
        '0009_sales_lead_queue.sql', '0010_sales_marketing_context_links.sql',
        '0013_sales_lead_queue.sql', '0014_sales_marketing_context_links.sql',
        '0015_sale_invoice_payment.sql', '0016_payment_review_safety.sql',
        '0017_sales_collection_policy.sql',
      ]]);
      expect(ledger.rows).toHaveLength(7);
      expect(ledger.rows.find((row) => row.name === '0009_sales_lead_queue.sql')?.checksum).toBe(legacyChecksums.lead);
      expect(ledger.rows.find((row) => row.name === '0010_sales_marketing_context_links.sql')?.checksum).toBe(legacyChecksums.marketing);
      const beforeRerun = await verify.query<{ migrations: string; policies: string }>(`
        SELECT (SELECT count(*)::text FROM schema_migrations) AS migrations,
          (SELECT count(*)::text FROM sales_policies) AS policies
      `);
      await runMigrations(migrationUrl);
      const afterRerun = await verify.query<{ migrations: string; policies: string }>(`
        SELECT (SELECT count(*)::text FROM schema_migrations) AS migrations,
          (SELECT count(*)::text FROM sales_policies) AS policies
      `);
      expect(afterRerun.rows[0]).toEqual(beforeRerun.rows[0]);
    } finally {
      await verify.end();
    }
    const runtime = new Client({ connectionString: runtimeUrl, application_name: 'tapra2_sales_upgrade_data_verify' });
    await runtime.connect();
    try {
      await runtime.query("SELECT set_config('app.workspace_id', $1, false), set_config('app.company_id', $2, false)", [
        '10000000-0000-4000-8000-000000000091', '20000000-0000-4000-8000-000000000091',
      ]);
      const policy = await runtime.query<{ count: string }>(`
        SELECT count(*)::text AS count FROM sales_policies
        WHERE workspace_id = '10000000-0000-4000-8000-000000000091'
          AND company_id = '20000000-0000-4000-8000-000000000091'
      `);
      expect(policy.rows[0]?.count).toBe('1');
    } finally {
      await runtime.end();
    }

    await resetTestDatabase();
    await runMigrations(migrationUrl);
    const fresh = new Client({ connectionString: migrationUrl, application_name: 'tapra2_fresh_sales_verify' });
    await fresh.connect();
    try {
      const tables = await fresh.query<{ count: string }>(`
        SELECT count(*)::text AS count FROM pg_class
        WHERE relname = ANY(ARRAY['sales_invoices', 'sales_payments', 'sales_invoice_policies'])
      `);
      expect(tables.rows[0]?.count).toBe('3');
    } finally {
      await fresh.end();
    }
  }, 60_000);
});
