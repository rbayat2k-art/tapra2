import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotEnv } from 'dotenv';
import { Client } from 'pg';
import { hashPassword } from '../src/modules/identity/password.js';
import {
  CURRENT_ROLE_BUNDLES,
  type CurrentRoleBundleCode,
} from '../src/modules/access/current-role-bundles.js';

loadDotEnv({ path: '.env.local', quiet: true });
loadDotEnv({ quiet: true });

const ids = {
  workspaceAlpha: '10000000-0000-4000-8000-000000000001',
  workspaceBeta: '10000000-0000-4000-8000-000000000002',
  companyAlpha: '20000000-0000-4000-8000-000000000001',
  companyBeta: '20000000-0000-4000-8000-000000000002',
  personDemo: '30000000-0000-4000-8000-000000000001',
  personAlphaOnly: '30000000-0000-4000-8000-000000000002',
  personSalesOne: '30000000-0000-4000-8000-000000000003',
  personSalesTwo: '30000000-0000-4000-8000-000000000004',
  accountDemo: '40000000-0000-4000-8000-000000000001',
  accountAlphaOnly: '40000000-0000-4000-8000-000000000002',
  accountSalesOne: '40000000-0000-4000-8000-000000000003',
  accountSalesTwo: '40000000-0000-4000-8000-000000000004',
  membershipDemoAlpha: '50000000-0000-4000-8000-000000000001',
  membershipDemoBeta: '50000000-0000-4000-8000-000000000002',
  membershipAlphaOnly: '50000000-0000-4000-8000-000000000003',
  membershipSalesOne: '50000000-0000-4000-8000-000000000004',
  membershipSalesTwo: '50000000-0000-4000-8000-000000000005',
  roleAlphaManager: '60000000-0000-4000-8000-000000000001',
  roleBetaManager: '60000000-0000-4000-8000-000000000002',
  roleAlphaReader: '60000000-0000-4000-8000-000000000003',
  roleWorkspaceAdmin: '60000000-0000-4000-8000-000000000006',
  roleAlphaSeller: '60000000-0000-4000-8000-000000000005',
  customerIdentityAlpha: '65000000-0000-4000-8000-000000000001',
  customerIdentityBeta: '65000000-0000-4000-8000-000000000002',
  customerAlpha: '70000000-0000-4000-8000-000000000001',
  customerBeta: '70000000-0000-4000-8000-000000000002',
  financialAccountAlpha: '80000000-0000-4000-8000-000000000001',
  financialAccountBeta: '80000000-0000-4000-8000-000000000002',
} as const;

type SeedEnvironment = 'development' | 'test' | 'production';

export function assertSafeSeedTarget(
  connectionString: string,
  expectedRole: 'tapra2_owner' | 'tapra2_app',
  environment = process.env.NODE_ENV as SeedEnvironment | undefined,
): { database: string } {
  const activeEnvironment = environment ?? 'development';
  if (activeEnvironment === 'production') {
    throw new Error('Development seed is forbidden when NODE_ENV=production.');
  }
  if (activeEnvironment !== 'development' && activeEnvironment !== 'test') {
    throw new Error('Development seed requires NODE_ENV=development or NODE_ENV=test.');
  }
  const parsed = new URL(connectionString);
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  const role = decodeURIComponent(parsed.username);
  const expectedDatabase = activeEnvironment === 'test' ? 'tapra2_test' : 'tapra2_dev';
  if (database !== expectedDatabase) {
    throw new Error(`Development seed requires the dedicated ${expectedDatabase} database.`);
  }
  if (role !== expectedRole) {
    throw new Error(`Development seed requires the restricted ${expectedRole} role.`);
  }
  return { database };
}

export async function seedDatabase(connectionString = process.env.DATABASE_MIGRATION_URL): Promise<void> {
  if (!connectionString?.startsWith('postgresql://')) throw new Error('DATABASE_MIGRATION_URL is required.');
  const migrationTarget = assertSafeSeedTarget(connectionString, 'tapra2_owner');
  const client = new Client({ connectionString, application_name: 'tapra2_seed' });
  await client.connect();
  try {
    const demoHash = await hashPassword('TapraDemo!2026', 'tapra2-demo-seed');
    const alphaHash = await hashPassword('TapraAlpha!2026', 'tapra2-alpha-seed');
    const salesHash = await hashPassword('TapraSales!2026', 'tapra2-sales-seed');
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
        ($2, 'کاربر محدود آلفا'),
        ($3, 'فروشنده نمونه یک'),
        ($4, 'فروشنده نمونه دو')
      ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name
    `, [ids.personDemo, ids.personAlphaOnly, ids.personSalesOne, ids.personSalesTwo]);
    await client.query(`
      INSERT INTO user_accounts(id, person_id, email, password_hash) VALUES
        ($1, $2, 'demo@tapra.local', $3),
        ($4, $5, 'alpha-only@tapra.local', $6),
        ($7, $8, 'sales-one@tapra.local', $9),
        ($10, $11, 'sales-two@tapra.local', $9)
      ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, password_hash = EXCLUDED.password_hash, is_active = true
    `, [
      ids.accountDemo, ids.personDemo, demoHash,
      ids.accountAlphaOnly, ids.personAlphaOnly, alphaHash,
      ids.accountSalesOne, ids.personSalesOne, salesHash,
      ids.accountSalesTwo, ids.personSalesTwo,
    ]);
    await client.query(`
      INSERT INTO memberships(id, workspace_id, company_id, person_id) VALUES
        ($1, $2, $3, $4),
        ($5, $6, $7, $4),
        ($8, $2, $3, $9),
        ($10, $2, $3, $11),
        ($12, $2, $3, $13)
      ON CONFLICT (id) DO UPDATE SET status = 'active', valid_until = NULL
    `, [
      ids.membershipDemoAlpha, ids.workspaceAlpha, ids.companyAlpha, ids.personDemo,
      ids.membershipDemoBeta, ids.workspaceBeta, ids.companyBeta,
      ids.membershipAlphaOnly, ids.personAlphaOnly,
      ids.membershipSalesOne, ids.personSalesOne,
      ids.membershipSalesTwo, ids.personSalesTwo,
    ]);
    await client.query(`
      INSERT INTO memberships(workspace_id, company_id, person_id)
      SELECT $1, NULL, $2
      WHERE NOT EXISTS (
        SELECT 1
        FROM memberships
        WHERE workspace_id = $1
          AND company_id IS NULL
          AND person_id = $2
      )
      ON CONFLICT DO NOTHING
    `, [ids.workspaceAlpha, ids.personDemo]);
    await client.query(`
      UPDATE memberships
      SET status = 'active', valid_until = NULL
      WHERE workspace_id = $1
        AND company_id IS NULL
        AND person_id = $2
    `, [ids.workspaceAlpha, ids.personDemo]);
    await client.query(`
      INSERT INTO permissions(code, description) VALUES
        ('customer.read', 'Read Customers in the active context'),
        ('customer.create', 'Create Customers in the active context'),
        ('customer.identity.manage', 'Manage Customer identity details in the active context'),
        ('customer.merge', 'Merge and unmerge Customers in the active context'),
        ('customer.identity.reconcile', 'Merge and reverse Workspace Customer identities with lineage and audit'),
        ('customer.import.read', 'Read sanitized Customer import summaries in the active context'),
        ('customer.import.create', 'Create a staged Customer CSV import in the active context'),
        ('customer.import.review', 'Review and reconcile staged Customer import records'),
        ('customer.import.approve', 'Approve a reconciled Customer import into Customer 360'),
        ('sales.queue.read', 'Read the active seller queue in the current Company context'),
        ('sales.lead.create', 'Create a Sales Lead for a Customer relationship in the current Company'),
        ('sales.lead.read_all', 'Read all Sales Leads in the current Company context'),
        ('sales.lead.assign', 'Assign an unowned Sales Lead in the current Company'),
        ('sales.lead.reassign', 'Reassign an owned Sales Lead with a reason in the current Company'),
        ('sales.call.create', 'Record a Call Log for an assigned Sales Lead'),
        ('sales.marketing.link', 'Link Campaign or Promotion context to a Sales Lead and Company relationship'),
        ('sales.sale.create', 'Create a direct Sale and its Invoice in the active Company'),
        ('sales.sale.create_on_behalf', 'Create a paper-entry Sale for another seller in the active Company'),
        ('sales.invoice.read_own', 'Read Invoices attributed to the active Sales membership'),
        ('sales.invoice.read_all', 'Read all Sales Invoices in the active Company'),
        ('sales.invoice.supervisor_approve', 'Approve a Sales Invoice before financial review'),
        ('sales.payment.record', 'Record a Customer Payment declaration for a Sales Invoice'),
        ('sales.payment.review', 'Approve or return an individual Sales Payment'),
        ('sales.invoice.edit_draft', 'Edit a draft Sales Invoice before approval'),
        ('sales.invoice.correct_returned', 'Correct a returned Sales Invoice with a new revision'),
        ('sales.invoice.amend', 'Amend an approved Sales Invoice with a new audited revision'),
        ('sales.payment.infrastructure.manage', 'Manage Company collection accounts and Sales approval policy'),
        ('organization.read', 'Read the permitted Organization structure and access assignments'),
        ('organization.company.manage', 'Create and update Companies in the permitted scope'),
        ('organization.unit.manage', 'Create and update Organization units'),
        ('organization.user.manage', 'Create and activate or deactivate UserAccounts'),
        ('organization.membership.manage', 'Create and update Memberships'),
        ('organization.role.manage', 'Create Roles and assign scoped Roles'),
        ('organization.impersonate', 'Start a time-limited audited impersonation session'),
        ('warehouse.read', 'Read Warehouse inventory and operational records in the active context'),
        ('warehouse.manage', 'Manage Warehouses and Warehouse Locations in the active context'),
        ('warehouse.item.manage', 'Manage Workspace Inventory Items and tracking identities'),
        ('warehouse.receiving.create', 'Create Warehouse Receiving records'),
        ('warehouse.receiving.post', 'Post validated Warehouse Receiving records to the inventory ledger'),
        ('warehouse.receiving.manual', 'Create manual Receiving with mandatory reason and evidence'),
        ('warehouse.reservation.manage', 'Create and release financially eligible inventory Reservations'),
        ('warehouse.transfer.manage', 'Create, dispatch and receive internal Warehouse Transfers'),
        ('warehouse.adjustment.create', 'Create Inventory Adjustments'),
        ('warehouse.adjustment.approve', 'Approve and post Inventory Adjustments created by another user'),
        ('warehouse.count.create', 'Create and submit Inventory Counts'),
        ('warehouse.count.approve', 'Approve and post Inventory Counts created by another user'),
        ('warehouse.return.manage', 'Receive and inspect Customer inventory Returns'),
        ('warehouse.movement.reverse', 'Reverse a posted Inventory Movement without rewriting history')
      ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description
    `);
    await client.query(`
      INSERT INTO roles(id, workspace_id, code, name) VALUES
        ($1, $2, 'customer_manager', 'مدیر مشتریان'),
        ($3, $4, 'customer_manager', 'مدیر مشتریان'),
        ($5, $2, 'customer_reader', 'مشاهده‌گر مشتریان'),
        ($6, $2, 'workspace_admin', 'مدیر فضای کاری'),
        ($7, $2, 'sales_seller', 'فروشنده')
      ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name
    `, [
      ids.roleAlphaManager, ids.workspaceAlpha, ids.roleBetaManager, ids.workspaceBeta,
      ids.roleAlphaReader, ids.roleWorkspaceAdmin, ids.roleAlphaSeller,
    ]);

    const fixedRoleIds = new Map<string, string>([
      [`${ids.workspaceAlpha}:customer_manager`, ids.roleAlphaManager],
      [`${ids.workspaceBeta}:customer_manager`, ids.roleBetaManager],
      [`${ids.workspaceAlpha}:customer_reader`, ids.roleAlphaReader],
      [`${ids.workspaceAlpha}:workspace_admin`, ids.roleWorkspaceAdmin],
      [`${ids.workspaceAlpha}:sales_seller`, ids.roleAlphaSeller],
    ]);
    const roleIds = new Map<string, string>();
    for (const workspaceId of [ids.workspaceAlpha, ids.workspaceBeta]) {
      for (const bundle of CURRENT_ROLE_BUNDLES) {
        const key = `${workspaceId}:${bundle.code}`;
        const fixedId = fixedRoleIds.get(key);
        let roleId = fixedId;
        if (!roleId) {
          const existing = await client.query<{ id: string }>(`
            SELECT id FROM roles WHERE workspace_id = $1 AND code = $2 ORDER BY created_at, id LIMIT 1
          `, [workspaceId, bundle.code]);
          roleId = existing.rows[0]?.id;
        }
        if (!roleId) {
          const created = await client.query<{ id: string }>(`
            INSERT INTO roles(workspace_id, code, name, description)
            VALUES ($1, $2, $3, $4)
            RETURNING id
          `, [workspaceId, bundle.code, bundle.name, bundle.description]);
          roleId = created.rows[0]?.id;
        }
        if (!roleId) throw new Error(`Seed role ${key} was not resolved.`);
        await client.query(`
          UPDATE roles SET name = $2, description = $3, is_active = true WHERE id = $1
        `, [roleId, bundle.name, bundle.description]);
        await client.query('DELETE FROM role_permissions WHERE role_id = $1', [roleId]);
        await client.query(`
          INSERT INTO role_permissions(role_id, permission_code)
          SELECT $1, permission_code FROM unnest($2::text[]) AS permission_code
        `, [roleId, [...bundle.permissions]]);
        roleIds.set(key, roleId);
      }
    }

    const roleId = (workspaceId: string, code: CurrentRoleBundleCode): string => {
      const resolved = roleIds.get(`${workspaceId}:${code}`);
      if (!resolved) throw new Error(`Seed role ${workspaceId}/${code} was not resolved.`);
      return resolved;
    };
    const assignRole = async (
      workspaceId: string,
      membershipId: string,
      code: CurrentRoleBundleCode,
      scopeType: 'WORKSPACE' | 'COMPANY',
      companyId: string | null,
    ): Promise<void> => {
      await client.query(`
        INSERT INTO role_assignments(workspace_id, membership_id, role_id, scope_type, company_id)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT DO NOTHING
      `, [workspaceId, membershipId, roleId(workspaceId, code), scopeType, companyId]);
    };

    await assignRole(ids.workspaceAlpha, ids.membershipDemoAlpha, 'customer_manager', 'COMPANY', ids.companyAlpha);
    await assignRole(ids.workspaceBeta, ids.membershipDemoBeta, 'customer_manager', 'COMPANY', ids.companyBeta);
    await assignRole(ids.workspaceAlpha, ids.membershipAlphaOnly, 'customer_reader', 'COMPANY', ids.companyAlpha);
    await assignRole(ids.workspaceAlpha, ids.membershipSalesOne, 'sales_seller', 'COMPANY', ids.companyAlpha);
    await assignRole(ids.workspaceAlpha, ids.membershipSalesTwo, 'sales_seller', 'COMPANY', ids.companyAlpha);

    // The broad demo account intentionally combines separate CURRENT bundles for integration
    // coverage. No individual role below crosses domains or combines maker and approver rights.
    const companyFixtureBundles: CurrentRoleBundleCode[] = [
      'sales_seller', 'sales_supervisor', 'sales_manager', 'paper_entry_operator', 'payment_recorder',
      'financial_reviewer', 'collection_manager', 'warehouse_manager', 'receiving_operator',
      'manual_receiving_operator', 'reservation_operator', 'transfer_operator', 'inventory_maker',
      'inventory_approver', 'return_inspector', 'movement_reversal_officer',
    ];
    for (const code of companyFixtureBundles) {
      await assignRole(ids.workspaceAlpha, ids.membershipDemoAlpha, code, 'COMPANY', ids.companyAlpha);
      await assignRole(ids.workspaceBeta, ids.membershipDemoBeta, code, 'COMPANY', ids.companyBeta);
    }

    const workspaceMembership = await client.query<{ id: string }>(`
      SELECT id FROM memberships
      WHERE workspace_id = $1 AND company_id IS NULL AND person_id = $2
      ORDER BY created_at, id LIMIT 1
    `, [ids.workspaceAlpha, ids.personDemo]);
    const workspaceMembershipId = workspaceMembership.rows[0]?.id;
    if (!workspaceMembershipId) throw new Error('Workspace demo membership was not resolved.');
    const workspaceFixtureBundles: CurrentRoleBundleCode[] = [
      'workspace_admin', 'data_steward', 'payment_recorder', 'financial_reviewer',
      'collection_manager', 'warehouse_manager',
      'receiving_operator', 'manual_receiving_operator', 'reservation_operator', 'transfer_operator',
      'inventory_maker', 'inventory_approver', 'return_inspector', 'movement_reversal_officer',
    ];
    for (const code of workspaceFixtureBundles) {
      await assignRole(ids.workspaceAlpha, workspaceMembershipId, code, 'WORKSPACE', null);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }

  const runtimeConnectionString = process.env.DATABASE_URL;
  if (!runtimeConnectionString?.startsWith('postgresql://')) throw new Error('DATABASE_URL is required for tenant-scoped seed data.');
  const runtimeTarget = assertSafeSeedTarget(runtimeConnectionString, 'tapra2_app');
  if (runtimeTarget.database !== migrationTarget.database) {
    throw new Error('Seed migration and runtime connections must target the same dedicated database.');
  }
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
          INSERT INTO sales_policies(workspace_id, company_id)
          VALUES ($1, $2)
          ON CONFLICT (workspace_id, company_id) DO NOTHING
        `, [context.workspaceId, context.companyId]);
        await runtime.query(`
          INSERT INTO financial_accounts(
            id, workspace_id, company_id, display_name, bank_name, card_number
          ) VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name,
            bank_name = EXCLUDED.bank_name, card_number = EXCLUDED.card_number, is_active = true
        `, [
          context.companyId === ids.companyAlpha ? ids.financialAccountAlpha : ids.financialAccountBeta,
          context.workspaceId, context.companyId, 'حساب تسویه توسعه',
          'بانک توسعه', context.companyId === ids.companyAlpha ? '0000000000001111' : '0000000000002222',
        ]);
        await runtime.query(`
          INSERT INTO sales_payment_method_policies(
            workspace_id, company_id, payment_method, is_enabled, manual_review_required
          ) VALUES
            ($1, $2, 'card_to_card', true, true),
            ($1, $2, 'bank_transfer', true, true),
            ($1, $2, 'payment_gateway', true, false),
            ($1, $2, 'cash', false, true),
            ($1, $2, 'cheque', false, true),
            ($1, $2, 'cod', false, true)
          ON CONFLICT (workspace_id, company_id, payment_method) DO UPDATE SET
            is_enabled = EXCLUDED.is_enabled, manual_review_required = EXCLUDED.manual_review_required,
            updated_at = now()
        `, [context.workspaceId, context.companyId]);
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
          INSERT INTO customers(id, workspace_id, company_id, identity_id, canonical_identity_id, full_name, phone_primary, created_by_user_account_id, idempotency_key)
          VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8)
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
