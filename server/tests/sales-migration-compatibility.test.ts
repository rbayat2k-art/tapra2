import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { config as loadDotEnv } from 'dotenv';
import { Client } from 'pg';
import { describe, expect, it } from 'vitest';
import { runMigrations } from '../scripts/migrate.js';
import { seedDatabase } from '../scripts/seed.js';

loadDotEnv({ path: '.env.local', quiet: true });
const migrationUrl = process.env.TEST_DATABASE_MIGRATION_URL;
const runtimeUrl = process.env.TEST_DATABASE_URL;
if (!migrationUrl || !runtimeUrl) throw new Error('TEST_DATABASE_MIGRATION_URL and TEST_DATABASE_URL are required.');

const legacyChecksums = {
  lead: '5dc3fd8406316ad6ef7baea4bfa0bd204302134afeb7a6b55bcf5e0aebbecb4d',
  marketing: 'f0da64e7ba372345b3af1e18f70dffaa4461363447f72208d897159af85b865f',
} as const;

const fixtureIds = {
  workspace: '10000000-0000-4000-8000-000000000001',
  company: '20000000-0000-4000-8000-000000000001',
  account: '40000000-0000-4000-8000-000000000001',
  sellerMembership: '50000000-0000-4000-8000-000000000004',
  identity: '65000000-0000-4000-8000-000000000001',
  customer: '70000000-0000-4000-8000-000000000001',
  financialAccount: '80000000-0000-4000-8000-000000000001',
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
        '0017_sales_collection_policy.sql', '0018_payment_lineage_status_cleanup.sql',
      ]]);
      expect(ledger.rows).toHaveLength(8);
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
      const canonical = await fresh.query<{ description: string; constraint_definition: string }>(`
        SELECT permission.description,
          pg_get_constraintdef(constraint_row.oid) AS constraint_definition
        FROM permissions permission
        CROSS JOIN pg_constraint constraint_row
        WHERE permission.code = 'sales.payment.review'
          AND constraint_row.conrelid = 'sales_payments'::regclass
          AND constraint_row.conname = 'sales_payments_status_check'
      `);
      expect(canonical.rows[0]?.description).toBe('Approve or return an individual Sales Payment for correction');
      expect(canonical.rows[0]?.description.toLowerCase()).not.toContain('reject');
      expect(canonical.rows[0]?.constraint_definition).toContain("'submitted'::text");
      expect(canonical.rows[0]?.constraint_definition).toContain("'approved'::text");
      expect(canonical.rows[0]?.constraint_definition).toContain("'needs_correction'::text");
      expect(canonical.rows[0]?.constraint_definition).not.toContain('superseded');
      expect(canonical.rows[0]?.constraint_definition).not.toContain('rejected');
    } finally {
      await fresh.end();
    }
  }, 60_000);

  it('converts persisted superseded correction lineage without losing review history', async () => {
    await resetTestDatabase();
    await runMigrations(migrationUrl, { through: '0017_sales_collection_policy.sql' });
    const previousMigrationUrl = process.env.DATABASE_MIGRATION_URL;
    const previousRuntimeUrl = process.env.DATABASE_URL;
    process.env.DATABASE_MIGRATION_URL = migrationUrl;
    process.env.DATABASE_URL = runtimeUrl;
    try {
      await seedDatabase(migrationUrl);
    } finally {
      if (previousMigrationUrl === undefined) delete process.env.DATABASE_MIGRATION_URL;
      else process.env.DATABASE_MIGRATION_URL = previousMigrationUrl;
      if (previousRuntimeUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousRuntimeUrl;
    }

    const saleId = randomUUID();
    const invoiceId = randomUUID();
    const originalPaymentId = randomUUID();
    const correctionPaymentId = randomUUID();
    const setup = new Client({ connectionString: runtimeUrl, application_name: 'tapra2_superseded_lineage_fixture' });
    await setup.connect();
    try {
      await setup.query("SELECT set_config('app.workspace_id', $1, false), set_config('app.company_id', $2, false)", [
        fixtureIds.workspace, fixtureIds.company,
      ]);
      await setup.query(`
        INSERT INTO sales_transactions(
          id, workspace_id, company_id, canonical_identity_id, customer_id,
          seller_membership_id, actor_user_account_id, entry_mode, idempotency_key
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'direct', $8)
      `, [
        saleId, fixtureIds.workspace, fixtureIds.company, fixtureIds.identity, fixtureIds.customer,
        fixtureIds.sellerMembership, fixtureIds.account, randomUUID(),
      ]);
      await setup.query(`
        INSERT INTO sales_invoices(
          id, workspace_id, company_id, sale_id, invoice_code, status, payment_status,
          subtotal_amount, discount_amount, final_amount, supervisor_approved_by_user_account_id,
          supervisor_approved_at, created_by_user_account_id, sales_approval_required
        ) VALUES ($1, $2, $3, $4, $5, 'awaiting_financial_review', 'submitted',
          500000, 0, 500000, $6, now(), $6, true)
      `, [invoiceId, fixtureIds.workspace, fixtureIds.company, saleId, `INV-MIG-${invoiceId.slice(0, 8)}`, fixtureIds.account]);
      await setup.query(`
        INSERT INTO sales_payments(
          id, workspace_id, company_id, invoice_id, amount, payment_method, occurred_at,
          last_four_digits, destination_account_id, tracking_number, status,
          recorded_by_user_account_id, reviewed_by_user_account_id, reviewed_at, review_reason,
          creator_actor_user_account_id, creator_effective_user_account_id, idempotency_key
        ) VALUES ($1, $2, $3, $4, 500000, 'card_to_card', now(), '1234', $5,
          'LEGACY-RETURNED', 'needs_correction', $6, $6, now(), 'اطلاعات رسید نیازمند اصلاح بود', $6, $6, $7)
      `, [
        originalPaymentId, fixtureIds.workspace, fixtureIds.company, invoiceId,
        fixtureIds.financialAccount, fixtureIds.account, randomUUID(),
      ]);
      await setup.query(`
        INSERT INTO sales_payments(
          id, workspace_id, company_id, invoice_id, amount, payment_method, occurred_at,
          last_four_digits, destination_account_id, tracking_number, status,
          recorded_by_user_account_id, creator_actor_user_account_id,
          creator_effective_user_account_id, corrects_payment_id, idempotency_key
        ) VALUES ($1, $2, $3, $4, 500000, 'card_to_card', now(), '1234', $5,
          'LEGACY-CORRECTION', 'submitted', $6, $6, $6, $7, $8)
      `, [
        correctionPaymentId, fixtureIds.workspace, fixtureIds.company, invoiceId,
        fixtureIds.financialAccount, fixtureIds.account, originalPaymentId, randomUUID(),
      ]);
      await setup.query(`
        UPDATE sales_payments
        SET status = 'superseded', superseded_by_payment_id = $2
        WHERE id = $1
      `, [originalPaymentId, correctionPaymentId]);
    } finally {
      await setup.end();
    }

    await runMigrations(migrationUrl);
    const verify = new Client({ connectionString: runtimeUrl, application_name: 'tapra2_payment_lineage_cleanup_verify' });
    await verify.connect();
    try {
      await verify.query("SELECT set_config('app.workspace_id', $1, false), set_config('app.company_id', $2, false)", [
        fixtureIds.workspace, fixtureIds.company,
      ]);
      const payments = await verify.query<{
        id: string; status: string; corrects_payment_id: string | null; superseded_by_payment_id: string | null;
        review_reason: string | null; reviewed_at: Date | null;
      }>(`
        SELECT id, status, corrects_payment_id, superseded_by_payment_id, review_reason, reviewed_at
        FROM sales_payments WHERE id = ANY($1::uuid[]) ORDER BY id
      `, [[originalPaymentId, correctionPaymentId]]);
      const original = payments.rows.find((payment) => payment.id === originalPaymentId);
      const correction = payments.rows.find((payment) => payment.id === correctionPaymentId);
      expect(original).toMatchObject({
        status: 'needs_correction', superseded_by_payment_id: correctionPaymentId,
        review_reason: 'اطلاعات رسید نیازمند اصلاح بود',
      });
      expect(original?.reviewed_at).not.toBeNull();
      expect(correction).toMatchObject({ status: 'submitted', corrects_payment_id: originalPaymentId });
      await expect(verify.query("UPDATE sales_payments SET status = 'superseded' WHERE id = $1", [correctionPaymentId]))
        .rejects.toThrow(/sales_payments_status_check/);

      await runMigrations(migrationUrl);
      const ledger = new Client({ connectionString: migrationUrl, application_name: 'tapra2_payment_lineage_rerun_verify' });
      await ledger.connect();
      try {
        const applied = await ledger.query<{ count: string }>(`
          SELECT count(*)::text AS count FROM schema_migrations
          WHERE name = '0018_payment_lineage_status_cleanup.sql'
        `);
        expect(applied.rows[0]?.count).toBe('1');
      } finally {
        await ledger.end();
      }
    } finally {
      await verify.end();
    }
  }, 60_000);
});
