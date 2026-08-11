import type { DatabaseError } from 'pg';
import { withTenantTransaction } from '../../infrastructure/database/pool.js';
import { AppError } from '../../shared/errors.js';
import { appendAuditEntry } from '../audit/audit-service.js';
import type { AuthenticatedSession, MembershipContext } from '../identity/types.js';

export interface CustomerRecord {
  id: string;
  fullName: string;
  phonePrimary: string;
  phoneSecondary: string | null;
  address: string | null;
  province: string | null;
  city: string | null;
  postalCode: string | null;
  createdAt: string;
}

export interface CreateCustomerInput {
  fullName: string;
  phonePrimary: string;
  phoneSecondary?: string;
  address?: string;
  province?: string;
  city?: string;
  postalCode?: string;
}

interface CustomerRow {
  id: string;
  full_name: string;
  phone_primary: string;
  phone_secondary: string | null;
  address: string | null;
  province: string | null;
  city: string | null;
  postal_code: string | null;
  created_at: Date;
}

function mapCustomer(row: CustomerRow): CustomerRecord {
  return {
    id: row.id,
    fullName: row.full_name,
    phonePrimary: row.phone_primary,
    phoneSecondary: row.phone_secondary,
    address: row.address,
    province: row.province,
    city: row.city,
    postalCode: row.postal_code,
    createdAt: row.created_at.toISOString(),
  };
}

function requireCompany(context: MembershipContext): { id: string; name: string; code: string } {
  if (!context.company) throw new AppError(409, 'company_context_required', 'A Company context is required.');
  return context.company;
}

export async function listCustomers(context: MembershipContext): Promise<CustomerRecord[]> {
  const company = requireCompany(context);
  return withTenantTransaction({ workspaceId: context.workspace.id, companyId: company.id }, async (client) => {
    const result = await client.query<CustomerRow>(`
      SELECT id, full_name, phone_primary, phone_secondary, address, province, city, postal_code, created_at
      FROM customers
      ORDER BY created_at DESC, id DESC
      LIMIT 200
    `);
    return result.rows.map(mapCustomer);
  });
}

export async function readCustomer(context: MembershipContext, customerId: string): Promise<CustomerRecord> {
  const company = requireCompany(context);
  return withTenantTransaction({ workspaceId: context.workspace.id, companyId: company.id }, async (client) => {
    const result = await client.query<CustomerRow>(`
      SELECT id, full_name, phone_primary, phone_secondary, address, province, city, postal_code, created_at
      FROM customers
      WHERE id = $1
    `, [customerId]);
    const row = result.rows[0];
    if (!row) throw new AppError(404, 'customer_not_found', 'Customer was not found in the active context.');
    return mapCustomer(row);
  });
}

export async function createCustomer(
  context: MembershipContext,
  session: AuthenticatedSession,
  input: CreateCustomerInput,
  idempotencyKey: string,
  correlationId: string,
): Promise<CustomerRecord> {
  const company = requireCompany(context);
  try {
    return await withTenantTransaction({ workspaceId: context.workspace.id, companyId: company.id }, async (client) => {
      const result = await client.query<CustomerRow>(`
        INSERT INTO customers(
          workspace_id, company_id, full_name, phone_primary, phone_secondary,
          address, province, city, postal_code, created_by_user_account_id, idempotency_key
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (workspace_id, company_id, idempotency_key) WHERE idempotency_key IS NOT NULL
        DO NOTHING
        RETURNING id, full_name, phone_primary, phone_secondary, address, province, city, postal_code, created_at
      `, [
        context.workspace.id,
        company.id,
        input.fullName,
        input.phonePrimary,
        input.phoneSecondary ?? null,
        input.address ?? null,
        input.province ?? null,
        input.city ?? null,
        input.postalCode ?? null,
        session.userAccountId,
        idempotencyKey,
      ]);

      let row = result.rows[0];
      if (!row) {
        const existing = await client.query<CustomerRow>(`
          SELECT id, full_name, phone_primary, phone_secondary, address, province, city, postal_code, created_at
          FROM customers WHERE idempotency_key = $1
        `, [idempotencyKey]);
        row = existing.rows[0];
      }
      if (!row) throw new AppError(409, 'customer_create_conflict', 'Customer creation could not be completed.');

      if (result.rowCount) {
        await appendAuditEntry(client, {
          workspaceId: context.workspace.id,
          companyId: company.id,
          actorUserAccountId: session.userAccountId,
          action: 'customer.created',
          resourceType: 'Customer',
          resourceId: row.id,
          result: 'success',
          newState: { fullName: row.full_name, phonePrimary: row.phone_primary },
          correlationId,
        });
      }
      return mapCustomer(row);
    });
  } catch (error) {
    const databaseError = error as Partial<DatabaseError>;
    if (databaseError.code === '23505') {
      throw new AppError(409, 'customer_phone_conflict', 'This phone number already exists in the active Company.');
    }
    throw error;
  }
}
