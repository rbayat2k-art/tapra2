import type { DatabaseError, PoolClient } from 'pg';
import { withTenantTransaction, withWorkspaceTransaction } from '../../infrastructure/database/pool.js';
import { AppError } from '../../shared/errors.js';
import { appendAuditEntry, auditIdentity } from '../audit/audit-service.js';
import type { AuthenticatedSession, MembershipContext } from '../identity/types.js';

export type DuplicateMatch = 'EXACT_MATCH' | 'POSSIBLE_DUPLICATE' | 'NO_MATCH';

export interface SourceInput {
  type?: 'manual' | 'legacy_crm' | 'excel' | 'call_center' | 'website' | 'campaign' | 'external_company' | 'api_integration';
  name?: string;
  reference?: string;
  importReference?: string;
  observedAt?: string;
  rawSourceReference?: string;
  confidence?: number;
  verificationStatus?: 'unverified' | 'verified' | 'rejected';
  metadata?: Record<string, unknown>;
}

export interface CreateCustomerInput {
  fullName: string;
  phonePrimary: string;
  phoneSecondary?: string;
  address?: string;
  province?: string;
  city?: string;
  postalCode?: string;
  source?: SourceInput;
}

export interface AddPhoneInput {
  value: string;
  label?: string;
  isPrimary?: boolean;
  verificationStatus?: 'unverified' | 'verified' | 'rejected';
  source?: SourceInput;
}

export interface AddAddressInput {
  province?: string;
  city?: string;
  addressText: string;
  postalCode?: string;
  label?: string;
  isPrimary?: boolean;
  source?: SourceInput;
}

export interface CustomerSummary {
  id: string;
  identityId: string;
  canonicalIdentityId: string;
  fullName: string;
  phonePrimary: string;
  status: 'active' | 'merged';
  mergedIntoCustomerId: string | null;
  createdAt: string;
}

interface CustomerRow {
  id: string;
  identity_id: string;
  canonical_identity_id: string;
  full_name: string;
  phone_primary: string;
  status: 'active' | 'merged';
  merged_into_customer_id: string | null;
  created_at: Date;
}

interface PhoneRow {
  id: string;
  customer_id: string;
  value: string;
  normalized_value: string;
  label: string;
  is_primary: boolean;
  verification_status: string;
  source_id: string | null;
  created_at: Date;
  updated_at: Date;
}

interface AddressRow {
  id: string;
  customer_id: string;
  province: string | null;
  city: string | null;
  address_text: string;
  postal_code: string | null;
  label: string;
  is_primary: boolean;
  source_id: string | null;
  created_at: Date;
  updated_at: Date;
}

interface SourceRow {
  id: string;
  customer_id: string;
  source_type: string;
  source_name: string;
  source_reference: string | null;
  import_reference: string | null;
  observed_at: Date | null;
  ingested_at: Date;
  raw_source_reference: string | null;
  confidence: string | null;
  verification_status: string;
  metadata: Record<string, unknown>;
}

interface TimelineRow {
  id: string;
  customer_id: string;
  event_type: string;
  summary: string;
  metadata: Record<string, unknown>;
  occurred_at: Date;
}

interface MergeRow {
  id: string;
  canonical_customer_id: string;
  merged_customer_id: string;
  status: 'active' | 'reversed';
  reason: string;
  merged_at: Date;
  reversed_at: Date | null;
  reversal_reason: string | null;
}

interface IdentityRow {
  id: string;
  normalized_primary_phone: string;
  status: 'active' | 'merged';
  merged_into_identity_id: string | null;
  created_at: Date;
}

interface IdentityMergeRow {
  id: string;
  canonical_identity_id: string;
  merged_identity_id: string;
  status: 'active' | 'reversed';
  reason: string;
  merged_at: Date;
  reversed_at: Date | null;
  reversal_reason: string | null;
}

export interface CustomerIdentityMergeOperation {
  id: string;
  canonicalIdentityId: string;
  mergedIdentityId: string;
  status: 'active' | 'reversed';
  reason: string;
  mergedAt: string;
  reversedAt: string | null;
  reversalReason: string | null;
}

export interface CustomerProfile extends CustomerSummary {
  phones: Array<{
    id: string; originalCustomerId: string; value: string; normalizedValue: string; label: string;
    isPrimary: boolean; verificationStatus: string; sourceId: string | null; createdAt: string; updatedAt: string;
  }>;
  addresses: Array<{
    id: string; originalCustomerId: string; province: string | null; city: string | null; addressText: string;
    postalCode: string | null; label: string; isPrimary: boolean; sourceId: string | null; createdAt: string; updatedAt: string;
  }>;
  sources: Array<{
    id: string; originalCustomerId: string; sourceType: string; sourceName: string; sourceReference: string | null;
    importReference: string | null; observedAt: string | null; ingestedAt: string;
    rawSourceReference: string | null; confidence: number | null; verificationStatus: string;
    metadata: Record<string, unknown>;
  }>;
  timeline: Array<{
    id: string; originalCustomerId: string; eventType: string; summary: string;
    metadata: Record<string, unknown>; occurredAt: string;
  }>;
  merges: Array<{
    id: string; canonicalCustomerId: string; mergedCustomerId: string; status: 'active' | 'reversed';
    reason: string; mergedAt: string; reversedAt: string | null; reversalReason: string | null;
  }>;
}

function requireCompany(context: MembershipContext): { id: string; name: string; code: string } {
  if (!context.company) throw new AppError(409, 'company_context_required', 'A Company context is required.');
  return context.company;
}

function mapSummary(row: CustomerRow): CustomerSummary {
  return {
    id: row.id,
    identityId: row.identity_id,
    canonicalIdentityId: row.canonical_identity_id,
    fullName: row.full_name,
    phonePrimary: row.phone_primary,
    status: row.status,
    mergedIntoCustomerId: row.merged_into_customer_id,
    createdAt: row.created_at.toISOString(),
  };
}

function mapIdentityMerge(row: IdentityMergeRow): CustomerIdentityMergeOperation {
  return {
    id: row.id,
    canonicalIdentityId: row.canonical_identity_id,
    mergedIdentityId: row.merged_identity_id,
    status: row.status,
    reason: row.reason,
    mergedAt: row.merged_at.toISOString(),
    reversedAt: row.reversed_at?.toISOString() ?? null,
    reversalReason: row.reversal_reason,
  };
}

async function normalizePhoneValue(client: PoolClient, value: string): Promise<string> {
  const result = await client.query<{ normalized_value: string }>(
    'SELECT normalize_customer_phone($1) AS normalized_value',
    [value],
  );
  return result.rows[0]!.normalized_value;
}

async function ensureIdentityPhone(
  client: PoolClient,
  workspaceId: string,
  identityId: string,
  value: string,
): Promise<{ normalizedValue: string; ownerIdentityId: string }> {
  const normalized = await normalizePhoneValue(client, value);
  await client.query(`
    INSERT INTO customer_identity_phones(workspace_id, identity_id, normalized_value)
    VALUES ($1, $2, $3)
    ON CONFLICT (workspace_id, normalized_value) DO NOTHING
  `, [workspaceId, identityId, normalized]);
  const owner = (await client.query<{ identity_id: string }>(`
    SELECT identity_id FROM customer_identity_phones
    WHERE workspace_id = $1 AND normalized_value = $2
  `, [workspaceId, normalized])).rows[0];
  if (!owner) {
    throw new AppError(409, 'customer_phone_conflict', 'This phone cannot be attached to the selected Customer identity.');
  }
  const identities = await client.query<{ id: string; canonical_identity_id: string }>(`
    SELECT id, COALESCE(merged_into_identity_id, id) AS canonical_identity_id
    FROM customer_identities WHERE id = ANY($1::uuid[])
  `, [[owner.identity_id, identityId]]);
  const roots = new Map(identities.rows.map((row) => [row.id, row.canonical_identity_id]));
  if (roots.get(owner.identity_id) !== roots.get(identityId)) {
    throw new AppError(409, 'customer_phone_conflict', 'This phone belongs to another Customer identity.');
  }
  return { normalizedValue: normalized, ownerIdentityId: owner.identity_id };
}

async function resolveCustomerIdentity(
  client: PoolClient,
  workspaceId: string,
  primaryPhone: string,
): Promise<string> {
  const normalized = await normalizePhoneValue(client, primaryPhone);
  const existingOwner = (await client.query<{ identity_id: string }>(`
    SELECT identity_id FROM customer_identity_phones
    WHERE workspace_id = $1 AND normalized_value = $2
  `, [workspaceId, normalized])).rows[0];
  if (existingOwner) {
    const existingIdentity = (await client.query<{ canonical_identity_id: string }>(`
      SELECT COALESCE(merged_into_identity_id, id) AS canonical_identity_id
      FROM customer_identities WHERE workspace_id = $1 AND id = $2
    `, [workspaceId, existingOwner.identity_id])).rows[0];
    if (!existingIdentity) throw new AppError(409, 'customer_identity_conflict', 'Customer identity could not be resolved.');
    return existingIdentity.canonical_identity_id;
  }
  await client.query(`
    INSERT INTO customer_identities(workspace_id, normalized_primary_phone)
    VALUES ($1, $2)
    ON CONFLICT (workspace_id, normalized_primary_phone) DO NOTHING
  `, [workspaceId, normalized]);
  const identity = (await client.query<{ id: string; canonical_identity_id: string }>(`
    SELECT id, COALESCE(merged_into_identity_id, id) AS canonical_identity_id FROM customer_identities
    WHERE workspace_id = $1 AND normalized_primary_phone = $2
  `, [workspaceId, normalized])).rows[0];
  if (!identity) throw new AppError(409, 'customer_identity_conflict', 'Customer identity could not be resolved.');
  await ensureIdentityPhone(client, workspaceId, identity.id, primaryPhone);
  return identity.canonical_identity_id;
}

async function loadCustomerProfile(client: PoolClient, customerId: string): Promise<CustomerProfile> {
  const customerResult = await client.query<CustomerRow>(`
    SELECT id, identity_id, canonical_identity_id, full_name, phone_primary, status, merged_into_customer_id, created_at
    FROM customers WHERE id = $1
  `, [customerId]);
  const customer = customerResult.rows[0];
  if (!customer) throw new AppError(404, 'customer_not_found', 'Customer was not found in the active context.');

  const profileIds = customer.status === 'active'
    ? (await client.query<{ id: string }>(`
        SELECT $1::uuid AS id
        UNION ALL
        SELECT merged_customer_id FROM customer_merge_operations
        WHERE canonical_customer_id = $1 AND status = 'active'
      `, [customerId])).rows.map((row) => row.id)
    : [customerId];

  const phones = await client.query<PhoneRow>(`
      SELECT id, customer_id, value, normalized_value, label, is_primary, verification_status,
        source_id, created_at, updated_at
      FROM customer_phones WHERE customer_id = ANY($1::uuid[])
      ORDER BY is_primary DESC, created_at, id
    `, [profileIds]);
  const addresses = await client.query<AddressRow>(`
      SELECT id, customer_id, province, city, address_text, postal_code, label, is_primary,
        source_id, created_at, updated_at
      FROM customer_addresses WHERE customer_id = ANY($1::uuid[])
      ORDER BY is_primary DESC, created_at, id
    `, [profileIds]);
  const sources = await client.query<SourceRow>(`
      SELECT id, customer_id, source_type, source_name, source_reference, import_reference,
        observed_at, ingested_at, raw_source_reference, confidence, verification_status, metadata
      FROM customer_sources WHERE customer_id = ANY($1::uuid[])
      ORDER BY ingested_at, id
    `, [profileIds]);
  const timeline = await client.query<TimelineRow>(`
      SELECT id, customer_id, event_type, summary, metadata, occurred_at
      FROM customer_timeline_events WHERE customer_id = ANY($1::uuid[])
      ORDER BY occurred_at DESC, id DESC LIMIT 300
    `, [profileIds]);
  const merges = await client.query<MergeRow>(`
      SELECT id, canonical_customer_id, merged_customer_id, status, reason,
        merged_at, reversed_at, reversal_reason
      FROM customer_merge_operations
      WHERE canonical_customer_id = $1 OR merged_customer_id = $1
      ORDER BY merged_at DESC, id DESC
    `, [customerId]);

  return {
    ...mapSummary(customer),
    phones: phones.rows.map((row) => ({
      id: row.id, originalCustomerId: row.customer_id, value: row.value, normalizedValue: row.normalized_value,
      label: row.label, isPrimary: row.is_primary, verificationStatus: row.verification_status,
      sourceId: row.source_id, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
    })),
    addresses: addresses.rows.map((row) => ({
      id: row.id, originalCustomerId: row.customer_id, province: row.province, city: row.city,
      addressText: row.address_text, postalCode: row.postal_code, label: row.label, isPrimary: row.is_primary,
      sourceId: row.source_id, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
    })),
    sources: sources.rows.map((row) => ({
      id: row.id, originalCustomerId: row.customer_id, sourceType: row.source_type, sourceName: row.source_name,
      sourceReference: row.source_reference, importReference: row.import_reference,
      observedAt: row.observed_at?.toISOString() ?? null, ingestedAt: row.ingested_at.toISOString(),
      rawSourceReference: row.raw_source_reference, confidence: row.confidence === null ? null : Number(row.confidence),
      verificationStatus: row.verification_status, metadata: row.metadata,
    })),
    timeline: timeline.rows.map((row) => ({
      id: row.id, originalCustomerId: row.customer_id, eventType: row.event_type,
      summary: row.summary, metadata: row.metadata, occurredAt: row.occurred_at.toISOString(),
    })),
    merges: merges.rows.map((row) => ({
      id: row.id, canonicalCustomerId: row.canonical_customer_id, mergedCustomerId: row.merged_customer_id,
      status: row.status, reason: row.reason, mergedAt: row.merged_at.toISOString(),
      reversedAt: row.reversed_at?.toISOString() ?? null, reversalReason: row.reversal_reason,
    })),
  };
}

async function insertSource(
  client: PoolClient,
  scope: { workspaceId: string; companyId: string; customerId: string; actorId: string },
  source: SourceInput | undefined,
): Promise<string> {
  const result = await client.query<{ id: string }>(`
    INSERT INTO customer_sources(
      workspace_id, company_id, customer_id, source_type, source_name, source_reference,
      import_reference, observed_at, raw_source_reference, confidence, verification_status,
      created_by_user_account_id, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING id
  `, [
    scope.workspaceId, scope.companyId, scope.customerId, source?.type ?? 'manual',
    source?.name ?? 'Manual entry', source?.reference ?? null, source?.importReference ?? null,
    source?.observedAt ?? null, source?.rawSourceReference ?? null, source?.confidence ?? null,
    source?.verificationStatus ?? 'unverified', scope.actorId, JSON.stringify(source?.metadata ?? {}),
  ]);
  return result.rows[0]!.id;
}

export interface ImportedCustomerInput extends CreateCustomerInput {
  importRecordId: string;
}

/**
 * Customer-module contract used by approved import transactions. The import
 * module owns reconciliation; this function alone owns creation of Customer
 * identity records, provenance, and the Customer timeline.
 */
export async function createImportedCustomerWithinTransaction(
  client: PoolClient,
  scope: { workspaceId: string; companyId: string; actorId: string },
  input: ImportedCustomerInput,
): Promise<string> {
  const idempotencyKey = `customer-import:${input.importRecordId}`;
  const prior = (await client.query<{ id: string }>(
    'SELECT id FROM customers WHERE idempotency_key = $1', [idempotencyKey],
  )).rows[0];
  if (prior) return prior.id;
  const identityId = await resolveCustomerIdentity(client, scope.workspaceId, input.phonePrimary);
  const created = await client.query<{ id: string }>(`
    INSERT INTO customers(
      workspace_id, company_id, identity_id, canonical_identity_id, full_name, phone_primary, phone_secondary,
      address, province, city, postal_code, created_by_user_account_id, idempotency_key
    ) VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    ON CONFLICT (workspace_id, company_id, idempotency_key) WHERE idempotency_key IS NOT NULL
    DO NOTHING RETURNING id
  `, [
    scope.workspaceId, scope.companyId, identityId, input.fullName, input.phonePrimary, input.phoneSecondary || null,
    input.address || null, input.province || null, input.city || null, input.postalCode || null,
    scope.actorId, idempotencyKey,
  ]);
  const customerId = created.rows[0]?.id ?? (await client.query<{ id: string }>(
    'SELECT id FROM customers WHERE idempotency_key = $1', [idempotencyKey],
  )).rows[0]?.id;
  if (!customerId) throw new AppError(409, 'customer_import_create_conflict', 'Imported Customer creation could not be completed.');
  if (!created.rowCount) return customerId;

  const sourceId = await insertSource(client, {
    workspaceId: scope.workspaceId, companyId: scope.companyId, customerId, actorId: scope.actorId,
  }, input.source);
  const primaryPhone = await ensureIdentityPhone(client, scope.workspaceId, identityId, input.phonePrimary);
  await client.query(`
    INSERT INTO customer_phones(
      workspace_id, company_id, customer_id, identity_id, source_id, value, normalized_value,
      label, is_primary, verification_status, idempotency_key
    ) VALUES ($1, $2, $3, $4, $5, $6, normalize_customer_phone($6), 'mobile', true, 'unverified', $7)
  `, [scope.workspaceId, scope.companyId, customerId, primaryPhone.ownerIdentityId, sourceId, input.phonePrimary, idempotencyKey]);
  if (input.phoneSecondary) {
    const secondaryPhone = await ensureIdentityPhone(client, scope.workspaceId, identityId, input.phoneSecondary);
    await client.query(`
      INSERT INTO customer_phones(
        workspace_id, company_id, customer_id, identity_id, source_id, value, normalized_value,
        label, is_primary, verification_status, idempotency_key
      ) VALUES ($1, $2, $3, $4, $5, $6, normalize_customer_phone($6), 'secondary', false, 'unverified', $7)
    `, [scope.workspaceId, scope.companyId, customerId, secondaryPhone.ownerIdentityId, sourceId, input.phoneSecondary, `${idempotencyKey}:secondary`]);
  }
  if (input.address) {
    await client.query(`
      INSERT INTO customer_addresses(
        workspace_id, company_id, customer_id, source_id, province, city, address_text,
        postal_code, label, is_primary, normalized_search_text, idempotency_key
      ) VALUES (
        $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::text, $6::text, $7::text,
        $8::text, 'imported', true, lower(trim(concat_ws(' ', $5::text, $6::text, $7::text, $8::text))), $9
      )
    `, [
      scope.workspaceId, scope.companyId, customerId, sourceId, input.province || null,
      input.city || null, input.address, input.postalCode || null, idempotencyKey,
    ]);
  }
  await appendTimeline(client, {
    workspaceId: scope.workspaceId, companyId: scope.companyId, customerId, actorId: scope.actorId,
    eventType: 'customer_imported', summary: 'Customer از فایل تأییدشده ایجاد شد.',
    metadata: { importRecordId: input.importRecordId, sourceId },
  });
  return customerId;
}

/** Attach an approved import row as provenance to an existing Customer. */
export async function linkImportedSourceWithinTransaction(
  client: PoolClient,
  scope: { workspaceId: string; companyId: string; actorId: string },
  customerId: string,
  input: { importRecordId: string; source: SourceInput },
): Promise<void> {
  const alreadyLinked = await client.query(
    'SELECT id FROM customer_sources WHERE customer_id = $1 AND import_reference = $2',
    [customerId, input.importRecordId],
  );
  if (alreadyLinked.rowCount) return;
  const sourceId = await insertSource(client, { ...scope, customerId }, input.source);
  await appendTimeline(client, {
    workspaceId: scope.workspaceId, companyId: scope.companyId, customerId, actorId: scope.actorId,
    eventType: 'import_data_linked', summary: 'یک ردیف تأییدشده Import به Customer متصل شد.',
    metadata: { importRecordId: input.importRecordId, sourceId },
  });
}

async function appendTimeline(
  client: PoolClient,
  input: { workspaceId: string; companyId: string; customerId: string; actorId: string; eventType: string; summary: string; metadata?: unknown },
): Promise<void> {
  await client.query(`
    INSERT INTO customer_timeline_events(
      workspace_id, company_id, customer_id, actor_user_account_id, event_type, summary, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
  `, [input.workspaceId, input.companyId, input.customerId, input.actorId, input.eventType, input.summary, JSON.stringify(input.metadata ?? {})]);
}

function databaseConflict(error: unknown): never {
  const databaseError = error as Partial<DatabaseError>;
  if (databaseError.code === '23505') {
    if (
      databaseError.constraint === 'customers_company_canonical_identity_active_idx'
      || databaseError.constraint === 'customers_company_identity_unique_idx'
      || databaseError.constraint === 'customers_workspace_id_company_id_phone_primary_key'
      || databaseError.constraint === 'customer_phones_relationship_normalized_unique_idx'
    ) {
      throw new AppError(409, 'customer_phone_conflict', 'This phone is already attached to a Customer in the active Company.');
    }
    throw new AppError(409, 'customer_identity_conflict', 'The requested Customer identity change conflicts with existing data.');
  }
  throw error;
}

export async function listCustomers(context: MembershipContext): Promise<CustomerSummary[]> {
  const company = requireCompany(context);
  return withTenantTransaction({ workspaceId: context.workspace.id, companyId: company.id }, async (client) => {
    const result = await client.query<CustomerRow>(`
      SELECT id, identity_id, canonical_identity_id, full_name, phone_primary, status, merged_into_customer_id, created_at
      FROM customers WHERE status = 'active'
      ORDER BY created_at DESC, id DESC LIMIT 200
    `);
    return result.rows.map(mapSummary);
  });
}

export async function readCustomer(context: MembershipContext, customerId: string): Promise<CustomerProfile> {
  const company = requireCompany(context);
  return withTenantTransaction({ workspaceId: context.workspace.id, companyId: company.id }, (client) => loadCustomerProfile(client, customerId));
}

export async function readTimeline(context: MembershipContext, customerId: string): Promise<CustomerProfile['timeline']> {
  return (await readCustomer(context, customerId)).timeline;
}

export async function createCustomer(
  context: MembershipContext,
  session: AuthenticatedSession,
  input: CreateCustomerInput,
  idempotencyKey: string,
  correlationId: string,
): Promise<CustomerProfile> {
  const company = requireCompany(context);
  try {
    return await withTenantTransaction({ workspaceId: context.workspace.id, companyId: company.id }, async (client) => {
      const prior = (await client.query<{ id: string }>(
        'SELECT id FROM customers WHERE idempotency_key = $1', [idempotencyKey],
      )).rows[0];
      if (prior) return loadCustomerProfile(client, prior.id);
      const identityId = await resolveCustomerIdentity(client, context.workspace.id, input.phonePrimary);
      const created = await client.query<{ id: string }>(`
        INSERT INTO customers(
          workspace_id, company_id, identity_id, canonical_identity_id, full_name, phone_primary, phone_secondary,
          address, province, city, postal_code, created_by_user_account_id, idempotency_key
        ) VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (workspace_id, company_id, idempotency_key) WHERE idempotency_key IS NOT NULL
        DO NOTHING RETURNING id
      `, [
        context.workspace.id, company.id, identityId, input.fullName, input.phonePrimary, input.phoneSecondary || null,
        input.address || null, input.province || null, input.city || null, input.postalCode || null,
        session.userAccountId, idempotencyKey,
      ]);

      let customerId = created.rows[0]?.id;
      if (!customerId) {
        customerId = (await client.query<{ id: string }>(
          'SELECT id FROM customers WHERE idempotency_key = $1', [idempotencyKey],
        )).rows[0]?.id;
      }
      if (!customerId) throw new AppError(409, 'customer_create_conflict', 'Customer creation could not be completed.');

      if (created.rowCount) {
        const sourceId = await insertSource(client, {
          workspaceId: context.workspace.id, companyId: company.id, customerId, actorId: session.userAccountId,
        }, input.source);
        const primaryPhone = await ensureIdentityPhone(client, context.workspace.id, identityId, input.phonePrimary);
        await client.query(`
          INSERT INTO customer_phones(
            workspace_id, company_id, customer_id, identity_id, source_id, value, normalized_value,
            label, is_primary, verification_status
          ) VALUES ($1, $2, $3, $4, $5, $6, normalize_customer_phone($6), 'mobile', true, 'unverified')
        `, [context.workspace.id, company.id, customerId, primaryPhone.ownerIdentityId, sourceId, input.phonePrimary]);
        if (input.phoneSecondary) {
          const secondaryPhone = await ensureIdentityPhone(client, context.workspace.id, identityId, input.phoneSecondary);
          await client.query(`
            INSERT INTO customer_phones(
              workspace_id, company_id, customer_id, identity_id, source_id, value, normalized_value,
              label, is_primary, verification_status
            ) VALUES ($1, $2, $3, $4, $5, $6, normalize_customer_phone($6), 'secondary', false, 'unverified')
          `, [context.workspace.id, company.id, customerId, secondaryPhone.ownerIdentityId, sourceId, input.phoneSecondary]);
        }
        if (input.address) {
          await client.query(`
            INSERT INTO customer_addresses(
              workspace_id, company_id, customer_id, source_id, province, city, address_text,
              postal_code, label, is_primary, normalized_search_text
            ) VALUES (
              $1::uuid, $2::uuid, $3::uuid, $4::uuid,
              $5::text, $6::text, $7::text, $8::text,
              'other', true, lower(trim(concat_ws(' ', $5::text, $6::text, $7::text, $8::text)))
            )
          `, [context.workspace.id, company.id, customerId, sourceId, input.province || null, input.city || null, input.address, input.postalCode || null]);
        }
        await appendTimeline(client, {
          workspaceId: context.workspace.id, companyId: company.id, customerId, actorId: session.userAccountId,
          eventType: 'customer_created', summary: 'پروفایل مشتری ایجاد شد.', metadata: { sourceId },
        });
        await appendAuditEntry(client, {
          workspaceId: context.workspace.id, companyId: company.id, ...auditIdentity(session),
          action: 'customer.created', resourceType: 'Customer', resourceId: customerId, result: 'success',
          newState: { fullName: input.fullName, sourceId }, correlationId,
        });
      }
      return loadCustomerProfile(client, customerId);
    });
  } catch (error) {
    return databaseConflict(error);
  }
}

export async function addPhone(
  context: MembershipContext, session: AuthenticatedSession, customerId: string, input: AddPhoneInput,
  idempotencyKey: string, correlationId: string,
): Promise<CustomerProfile> {
  const company = requireCompany(context);
  try {
    return await withTenantTransaction({ workspaceId: context.workspace.id, companyId: company.id }, async (client) => {
      const customer = (await client.query<CustomerRow>(`
        SELECT id, identity_id, canonical_identity_id, full_name, phone_primary, status, merged_into_customer_id, created_at
        FROM customers WHERE id = $1 FOR UPDATE
      `, [customerId])).rows[0];
      if (!customer) throw new AppError(404, 'customer_not_found', 'Customer was not found in the active context.');
      if (customer.status !== 'active') throw new AppError(409, 'customer_merged', 'Add identity data to the canonical Customer.');

      const existing = await client.query<{ id: string }>(
        'SELECT id FROM customer_phones WHERE idempotency_key = $1', [idempotencyKey],
      );
      if (!existing.rowCount) {
        const identityPhone = await ensureIdentityPhone(client, context.workspace.id, customer.identity_id, input.value);
        const sourceId = await insertSource(client, {
          workspaceId: context.workspace.id, companyId: company.id, customerId, actorId: session.userAccountId,
        }, input.source);
        if (input.isPrimary) {
          await client.query('UPDATE customer_phones SET is_primary = false, updated_at = now() WHERE customer_id = $1 AND is_primary', [customerId]);
        }
        await client.query(`
          INSERT INTO customer_phones(
            workspace_id, company_id, customer_id, identity_id, source_id, value, normalized_value, label,
            is_primary, verification_status, idempotency_key
          ) VALUES ($1, $2, $3, $4, $5, $6, normalize_customer_phone($6), $7, $8, $9, $10)
        `, [
          context.workspace.id, company.id, customerId, identityPhone.ownerIdentityId, sourceId, input.value, input.label ?? 'mobile',
          input.isPrimary ?? false, input.verificationStatus ?? 'unverified', idempotencyKey,
        ]);
        if (input.isPrimary) {
          await client.query('UPDATE customers SET phone_primary = $1, updated_at = now() WHERE id = $2', [input.value, customerId]);
        } else {
          await client.query('UPDATE customers SET phone_secondary = COALESCE(phone_secondary, $1), updated_at = now() WHERE id = $2', [input.value, customerId]);
        }
        await appendTimeline(client, {
          workspaceId: context.workspace.id, companyId: company.id, customerId, actorId: session.userAccountId,
          eventType: 'phone_added', summary: 'شماره تماس جدید افزوده شد.', metadata: { label: input.label ?? 'mobile', sourceId },
        });
        await appendAuditEntry(client, {
          workspaceId: context.workspace.id, companyId: company.id, ...auditIdentity(session),
          action: 'customer.phone_added', resourceType: 'Customer', resourceId: customerId, result: 'success',
          newState: { label: input.label ?? 'mobile', sourceId }, correlationId,
        });
      }
      return loadCustomerProfile(client, customerId);
    });
  } catch (error) {
    return databaseConflict(error);
  }
}

export async function addAddress(
  context: MembershipContext, session: AuthenticatedSession, customerId: string, input: AddAddressInput,
  idempotencyKey: string, correlationId: string,
): Promise<CustomerProfile> {
  const company = requireCompany(context);
  try {
    return await withTenantTransaction({ workspaceId: context.workspace.id, companyId: company.id }, async (client) => {
      const customer = (await client.query<{ status: string }>('SELECT status FROM customers WHERE id = $1 FOR UPDATE', [customerId])).rows[0];
      if (!customer) throw new AppError(404, 'customer_not_found', 'Customer was not found in the active context.');
      if (customer.status !== 'active') throw new AppError(409, 'customer_merged', 'Add identity data to the canonical Customer.');
      const existing = await client.query('SELECT id FROM customer_addresses WHERE idempotency_key = $1', [idempotencyKey]);
      if (!existing.rowCount) {
        const sourceId = await insertSource(client, {
          workspaceId: context.workspace.id, companyId: company.id, customerId, actorId: session.userAccountId,
        }, input.source);
        if (input.isPrimary) {
          await client.query('UPDATE customer_addresses SET is_primary = false, updated_at = now() WHERE customer_id = $1 AND is_primary', [customerId]);
        }
        await client.query(`
          INSERT INTO customer_addresses(
            workspace_id, company_id, customer_id, source_id, province, city, address_text,
            postal_code, label, is_primary, normalized_search_text, idempotency_key
          ) VALUES (
            $1::uuid, $2::uuid, $3::uuid, $4::uuid,
            $5::text, $6::text, $7::text, $8::text, $9::text, $10::boolean,
            lower(trim(concat_ws(' ', $5::text, $6::text, $7::text, $8::text))), $11::text
          )
        `, [
          context.workspace.id, company.id, customerId, sourceId, input.province || null, input.city || null,
          input.addressText, input.postalCode || null, input.label ?? 'other', input.isPrimary ?? false, idempotencyKey,
        ]);
        await client.query(`
          UPDATE customers SET address = $1, province = $2, city = $3, postal_code = $4, updated_at = now()
          WHERE id = $5 AND ($6::boolean OR address IS NULL)
        `, [input.addressText, input.province || null, input.city || null, input.postalCode || null, customerId, input.isPrimary ?? false]);
        await appendTimeline(client, {
          workspaceId: context.workspace.id, companyId: company.id, customerId, actorId: session.userAccountId,
          eventType: 'address_added', summary: 'نشانی جدید افزوده شد.', metadata: { label: input.label ?? 'other', sourceId },
        });
        await appendAuditEntry(client, {
          workspaceId: context.workspace.id, companyId: company.id, ...auditIdentity(session),
          action: 'customer.address_added', resourceType: 'Customer', resourceId: customerId, result: 'success',
          newState: { label: input.label ?? 'other', sourceId }, correlationId,
        });
      }
      return loadCustomerProfile(client, customerId);
    });
  } catch (error) {
    return databaseConflict(error);
  }
}

export async function checkDuplicates(
  context: MembershipContext,
  input: { phone: string; fullName?: string; excludeCustomerId?: string },
): Promise<{ match: DuplicateMatch; candidates: CustomerSummary[] }> {
  const company = requireCompany(context);
  return withTenantTransaction({ workspaceId: context.workspace.id, companyId: company.id }, async (client) => {
    const exact = await client.query<CustomerRow>(`
      SELECT DISTINCT c.id, c.identity_id, c.canonical_identity_id, c.full_name, c.phone_primary,
        c.status, c.merged_into_customer_id, c.created_at
      FROM customer_phones p JOIN customers c ON c.id = p.customer_id
      WHERE p.normalized_value = normalize_customer_phone($1)
        AND c.status = 'active' AND ($2::uuid IS NULL OR c.id <> $2)
      ORDER BY c.created_at, c.id LIMIT 10
    `, [input.phone, input.excludeCustomerId ?? null]);
    if (exact.rowCount) return { match: 'EXACT_MATCH', candidates: exact.rows.map(mapSummary) };
    if (input.fullName) {
      const possible = await client.query<CustomerRow>(`
        SELECT id, identity_id, canonical_identity_id, full_name, phone_primary, status, merged_into_customer_id, created_at
        FROM customers
        WHERE status = 'active' AND lower(trim(full_name)) = lower(trim($1))
          AND ($2::uuid IS NULL OR id <> $2)
        ORDER BY created_at, id LIMIT 10
      `, [input.fullName, input.excludeCustomerId ?? null]);
      if (possible.rowCount) return { match: 'POSSIBLE_DUPLICATE', candidates: possible.rows.map(mapSummary) };
    }
    return { match: 'NO_MATCH', candidates: [] };
  });
}

export async function mergeCustomers(
  context: MembershipContext, session: AuthenticatedSession,
  input: { customerId: string; targetCustomerId: string; reason: string },
  idempotencyKey: string, correlationId: string,
): Promise<{ operationId: string; canonicalCustomer: CustomerProfile }> {
  const company = requireCompany(context);
  if (input.customerId === input.targetCustomerId) throw new AppError(400, 'customer_merge_same_profile', 'Two different Customers are required.');
  try {
    return await withTenantTransaction({ workspaceId: context.workspace.id, companyId: company.id }, async (client) => {
      const prior = await client.query<{ id: string; canonical_customer_id: string }>(`
        SELECT id, canonical_customer_id FROM customer_merge_operations WHERE idempotency_key = $1
      `, [idempotencyKey]);
      if (prior.rows[0]) {
        return { operationId: prior.rows[0].id, canonicalCustomer: await loadCustomerProfile(client, prior.rows[0].canonical_customer_id) };
      }

      const selected = await client.query<CustomerRow>(`
        SELECT id, identity_id, canonical_identity_id, full_name, phone_primary, status, merged_into_customer_id, created_at
        FROM customers WHERE id = ANY($1::uuid[]) ORDER BY created_at, id FOR UPDATE
      `, [[input.customerId, input.targetCustomerId]]);
      if (selected.rowCount !== 2) {
        throw new AppError(409, 'customer_merge_scope_violation', 'Both Customers must be visible in the same active Company context.');
      }
      if (selected.rows.some((row) => row.status !== 'active')) {
        throw new AppError(409, 'customer_merge_state_invalid', 'Only active Customer profiles can be merged.');
      }
      const canonical = selected.rows[0]!;
      const merged = selected.rows[1]!;
      const related = await client.query<{ customer_id: string; phone_ids: string[]; address_ids: string[]; source_ids: string[] }>(`
        SELECT c.id AS customer_id,
          COALESCE(array_agg(DISTINCT p.id) FILTER (WHERE p.id IS NOT NULL), '{}') AS phone_ids,
          COALESCE(array_agg(DISTINCT a.id) FILTER (WHERE a.id IS NOT NULL), '{}') AS address_ids,
          COALESCE(array_agg(DISTINCT s.id) FILTER (WHERE s.id IS NOT NULL), '{}') AS source_ids
        FROM customers c
        LEFT JOIN customer_phones p ON p.customer_id = c.id
        LEFT JOIN customer_addresses a ON a.customer_id = c.id
        LEFT JOIN customer_sources s ON s.customer_id = c.id
        WHERE c.id = ANY($1::uuid[]) GROUP BY c.id
      `, [[canonical.id, merged.id]]);
      const operation = await client.query<{ id: string }>(`
        INSERT INTO customer_merge_operations(
          workspace_id, company_id, canonical_customer_id, merged_customer_id, reason,
          merged_by_user_account_id, idempotency_key, lineage_snapshot
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id
      `, [
        context.workspace.id, company.id, canonical.id, merged.id, input.reason,
        session.userAccountId, idempotencyKey,
        JSON.stringify({ canonical: mapSummary(canonical), merged: mapSummary(merged), related: related.rows }),
      ]);
      await client.query(`
        UPDATE customers SET status = 'merged', merged_into_customer_id = $1, updated_at = now() WHERE id = $2
      `, [canonical.id, merged.id]);
      const metadata = { operationId: operation.rows[0]!.id, canonicalCustomerId: canonical.id, mergedCustomerId: merged.id };
      await appendTimeline(client, {
        workspaceId: context.workspace.id, companyId: company.id, customerId: canonical.id, actorId: session.userAccountId,
        eventType: 'customer_merged', summary: 'یک پروفایل مشتری با این پروفایل ادغام شد.', metadata,
      });
      await appendTimeline(client, {
        workspaceId: context.workspace.id, companyId: company.id, customerId: merged.id, actorId: session.userAccountId,
        eventType: 'customer_merged', summary: 'این پروفایل در پروفایل اصلی ادغام شد.', metadata,
      });
      await appendAuditEntry(client, {
        workspaceId: context.workspace.id, companyId: company.id, ...auditIdentity(session),
        action: 'customer.merged', resourceType: 'CustomerMerge', resourceId: operation.rows[0]!.id,
        result: 'success', reason: input.reason, previousState: { canonical: canonical.id, merged: merged.id },
        newState: { canonical: canonical.id, merged: merged.id, status: 'active' }, correlationId,
      });
      return { operationId: operation.rows[0]!.id, canonicalCustomer: await loadCustomerProfile(client, canonical.id) };
    });
  } catch (error) {
    return databaseConflict(error);
  }
}

export async function unmergeCustomers(
  context: MembershipContext, session: AuthenticatedSession, operationId: string,
  reason: string, correlationId: string,
): Promise<{ canonicalCustomer: CustomerProfile; restoredCustomer: CustomerProfile }> {
  const company = requireCompany(context);
  return withTenantTransaction({ workspaceId: context.workspace.id, companyId: company.id }, async (client) => {
    const operation = (await client.query<MergeRow>(`
      SELECT id, canonical_customer_id, merged_customer_id, status, reason,
        merged_at, reversed_at, reversal_reason
      FROM customer_merge_operations WHERE id = $1 FOR UPDATE
    `, [operationId])).rows[0];
    if (!operation) throw new AppError(404, 'customer_merge_not_found', 'Merge operation was not found in the active context.');
    if (operation.status !== 'active') throw new AppError(409, 'customer_merge_already_reversed', 'This merge has already been reversed.');
    const relationshipIdentities = await client.query<{ canonical_identity_id: string }>(`
      SELECT canonical_identity_id FROM customers
      WHERE id = ANY($1::uuid[]) FOR UPDATE
    `, [[operation.canonical_customer_id, operation.merged_customer_id]]);
    if (
      relationshipIdentities.rowCount === 2
      && relationshipIdentities.rows[0]?.canonical_identity_id === relationshipIdentities.rows[1]?.canonical_identity_id
    ) {
      throw new AppError(
        409,
        'customer_relationship_unmerge_identity_conflict',
        'Reverse the central identity reconciliation before restoring both Company relationships.',
      );
    }
    await client.query(`
      UPDATE customer_merge_operations
      SET status = 'reversed', reversed_by_user_account_id = $1, reversed_at = now(), reversal_reason = $2
      WHERE id = $3
    `, [session.userAccountId, reason, operationId]);
    await client.query(`
      UPDATE customers SET status = 'active', merged_into_customer_id = NULL, updated_at = now()
      WHERE id = $1 AND merged_into_customer_id = $2
    `, [operation.merged_customer_id, operation.canonical_customer_id]);
    const metadata = {
      operationId, canonicalCustomerId: operation.canonical_customer_id, restoredCustomerId: operation.merged_customer_id,
    };
    for (const customerId of [operation.canonical_customer_id, operation.merged_customer_id]) {
      await appendTimeline(client, {
        workspaceId: context.workspace.id, companyId: company.id, customerId, actorId: session.userAccountId,
        eventType: 'customer_split', summary: 'ادغام مشتری بازگردانی شد.', metadata,
      });
    }
    await appendAuditEntry(client, {
      workspaceId: context.workspace.id, companyId: company.id, ...auditIdentity(session),
      action: 'customer.unmerged', resourceType: 'CustomerMerge', resourceId: operationId,
      result: 'success', reason, previousState: { status: 'active' }, newState: { status: 'reversed' }, correlationId,
    });
    return {
      canonicalCustomer: await loadCustomerProfile(client, operation.canonical_customer_id),
      restoredCustomer: await loadCustomerProfile(client, operation.merged_customer_id),
    };
  });
}

function requireWorkspaceIdentityContext(context: MembershipContext): void {
  if (context.scope.type !== 'WORKSPACE' || context.company) {
    throw new AppError(
      403,
      'customer_identity_workspace_scope_required',
      'Central Customer identity reconciliation requires an authorized Workspace context.',
    );
  }
}

async function setCompanyDatabaseContext(client: PoolClient, companyId: string | null): Promise<void> {
  await client.query("SELECT set_config('app.company_id', $1, true)", [companyId ?? '']);
}

export async function mergeCustomerIdentities(
  context: MembershipContext,
  session: AuthenticatedSession,
  input: { identityId: string; targetIdentityId: string; reason: string },
  idempotencyKey: string,
  correlationId: string,
): Promise<CustomerIdentityMergeOperation> {
  requireWorkspaceIdentityContext(context);
  if (input.identityId === input.targetIdentityId) {
    throw new AppError(400, 'customer_identity_merge_same_identity', 'Two different Customer identities are required.');
  }

  return withWorkspaceTransaction({ workspaceId: context.workspace.id, companyId: null }, async (client) => {
    const prior = (await client.query<IdentityMergeRow>(`
      SELECT id, canonical_identity_id, merged_identity_id, status, reason, merged_at, reversed_at, reversal_reason
      FROM customer_identity_merge_operations
      WHERE workspace_id = $1 AND idempotency_key = $2
    `, [context.workspace.id, idempotencyKey])).rows[0];
    if (prior) return mapIdentityMerge(prior);

    const selected = await client.query<IdentityRow>(`
      SELECT id, normalized_primary_phone, status, merged_into_identity_id, created_at
      FROM customer_identities
      WHERE workspace_id = $1 AND id = ANY($2::uuid[])
      ORDER BY created_at, id
      FOR UPDATE
    `, [context.workspace.id, [input.identityId, input.targetIdentityId]]);
    if (selected.rowCount !== 2) {
      throw new AppError(404, 'customer_identity_reconciliation_not_found', 'The requested Customer identities are not available.');
    }
    if (selected.rows.some((identity) => identity.status !== 'active' || identity.merged_into_identity_id)) {
      throw new AppError(409, 'customer_identity_merge_state_invalid', 'Only active, independent Customer identities can be reconciled.');
    }
    const activeDescendant = await client.query(`
      SELECT id FROM customer_identity_merge_operations
      WHERE workspace_id = $1 AND status = 'active' AND canonical_identity_id = ANY($2::uuid[])
      LIMIT 1
    `, [context.workspace.id, [input.identityId, input.targetIdentityId]]);
    if (activeDescendant.rowCount) {
      throw new AppError(409, 'customer_identity_merge_chain_unsupported', 'Reverse existing identity reconciliations before creating another merge chain.');
    }

    const canonical = selected.rows[0]!;
    const merged = selected.rows[1]!;
    const identityPhones = await client.query<{ id: string; identity_id: string; normalized_value: string }>(`
      SELECT id, identity_id, normalized_value FROM customer_identity_phones
      WHERE workspace_id = $1 AND identity_id = ANY($2::uuid[])
      ORDER BY created_at, id
    `, [context.workspace.id, [canonical.id, merged.id]]);
    const companies = await client.query<{ id: string }>(`
      SELECT id FROM companies WHERE workspace_id = $1 ORDER BY id
    `, [context.workspace.id]);
    const relationships: Array<{
      id: string; companyId: string; identityId: string; canonicalIdentityId: string; status: 'active' | 'merged';
    }> = [];

    for (const company of companies.rows) {
      await setCompanyDatabaseContext(client, company.id);
      const companyRelationships = await client.query<{
        id: string; company_id: string; identity_id: string; canonical_identity_id: string; status: 'active' | 'merged';
      }>(`
        SELECT id, company_id, identity_id, canonical_identity_id, status
        FROM customers
        WHERE canonical_identity_id = ANY($1::uuid[])
        ORDER BY created_at, id
        FOR UPDATE
      `, [[canonical.id, merged.id]]);
      const activeIdentityIds = new Set(
        companyRelationships.rows.filter((row) => row.status === 'active').map((row) => row.canonical_identity_id),
      );
      if (activeIdentityIds.has(canonical.id) && activeIdentityIds.has(merged.id)) {
        throw new AppError(
          409,
          'customer_identity_relationship_conflict',
          'Merge the duplicate Company relationships before reconciling their central identities.',
        );
      }
      relationships.push(...companyRelationships.rows.map((row) => ({
        id: row.id,
        companyId: row.company_id,
        identityId: row.identity_id,
        canonicalIdentityId: row.canonical_identity_id,
        status: row.status,
      })));
    }

    await setCompanyDatabaseContext(client, null);
    const operation = (await client.query<IdentityMergeRow>(`
      INSERT INTO customer_identity_merge_operations(
        workspace_id, canonical_identity_id, merged_identity_id, reason,
        merged_by_user_account_id, idempotency_key, lineage_snapshot
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, canonical_identity_id, merged_identity_id, status, reason, merged_at, reversed_at, reversal_reason
    `, [
      context.workspace.id,
      canonical.id,
      merged.id,
      input.reason,
      session.actorUserAccountId,
      idempotencyKey,
      JSON.stringify({
        identities: selected.rows.map((identity) => ({
          id: identity.id,
          normalizedPrimaryPhone: identity.normalized_primary_phone,
          status: identity.status,
        })),
        phones: identityPhones.rows.map((phone) => ({
          id: phone.id,
          identityId: phone.identity_id,
          normalizedValue: phone.normalized_value,
        })),
        relationships,
      }),
    ])).rows[0]!;

    await client.query(`
      UPDATE customer_identities
      SET status = 'merged', merged_into_identity_id = $1, updated_at = now()
      WHERE workspace_id = $2 AND id = $3
    `, [canonical.id, context.workspace.id, merged.id]);

    for (const company of companies.rows) {
      await setCompanyDatabaseContext(client, company.id);
      const updated = await client.query<{ id: string }>(`
        UPDATE customers SET canonical_identity_id = $1, updated_at = now()
        WHERE canonical_identity_id = $2
        RETURNING id
      `, [canonical.id, merged.id]);
      for (const relationship of updated.rows) {
        await appendTimeline(client, {
          workspaceId: context.workspace.id,
          companyId: company.id,
          customerId: relationship.id,
          actorId: session.actorUserAccountId,
          eventType: 'customer_identity_merged',
          summary: 'هویت مرکزی مشتری با بررسی انسانی یکپارچه شد.',
          metadata: { operationId: operation.id, canonicalIdentityId: canonical.id, mergedIdentityId: merged.id },
        });
      }
    }

    await setCompanyDatabaseContext(client, null);
    await appendAuditEntry(client, {
      workspaceId: context.workspace.id,
      companyId: null,
      ...auditIdentity(session),
      action: 'customer.identity_merged',
      resourceType: 'CustomerIdentityMerge',
      resourceId: operation.id,
      result: 'success',
      reason: input.reason,
      previousState: { canonicalIdentityId: canonical.id, mergedIdentityId: merged.id, status: 'independent' },
      newState: { canonicalIdentityId: canonical.id, mergedIdentityId: merged.id, status: 'merged' },
      correlationId,
    });
    return mapIdentityMerge(operation);
  });
}

export async function unmergeCustomerIdentity(
  context: MembershipContext,
  session: AuthenticatedSession,
  operationId: string,
  reason: string,
  correlationId: string,
): Promise<CustomerIdentityMergeOperation> {
  requireWorkspaceIdentityContext(context);
  return withWorkspaceTransaction({ workspaceId: context.workspace.id, companyId: null }, async (client) => {
    const operation = (await client.query<IdentityMergeRow>(`
      SELECT id, canonical_identity_id, merged_identity_id, status, reason, merged_at, reversed_at, reversal_reason
      FROM customer_identity_merge_operations
      WHERE workspace_id = $1 AND id = $2
      FOR UPDATE
    `, [context.workspace.id, operationId])).rows[0];
    if (!operation) {
      throw new AppError(404, 'customer_identity_reconciliation_not_found', 'The requested Customer identity reconciliation is not available.');
    }
    if (operation.status === 'reversed') return mapIdentityMerge(operation);

    const mergedIdentity = (await client.query<IdentityRow>(`
      SELECT id, normalized_primary_phone, status, merged_into_identity_id, created_at
      FROM customer_identities
      WHERE workspace_id = $1 AND id = $2
      FOR UPDATE
    `, [context.workspace.id, operation.merged_identity_id])).rows[0];
    if (
      !mergedIdentity
      || mergedIdentity.status !== 'merged'
      || mergedIdentity.merged_into_identity_id !== operation.canonical_identity_id
    ) {
      throw new AppError(409, 'customer_identity_unmerge_state_invalid', 'Identity lineage no longer matches this reconciliation.');
    }

    const companies = await client.query<{ id: string }>(`
      SELECT id FROM companies WHERE workspace_id = $1 ORDER BY id
    `, [context.workspace.id]);
    for (const company of companies.rows) {
      await setCompanyDatabaseContext(client, company.id);
      const restored = await client.query<{ id: string }>(`
        UPDATE customers SET canonical_identity_id = $1, updated_at = now()
        WHERE identity_id = $1 AND canonical_identity_id = $2
        RETURNING id
      `, [operation.merged_identity_id, operation.canonical_identity_id]);
      for (const relationship of restored.rows) {
        await appendTimeline(client, {
          workspaceId: context.workspace.id,
          companyId: company.id,
          customerId: relationship.id,
          actorId: session.actorUserAccountId,
          eventType: 'customer_identity_split',
          summary: 'یکپارچه‌سازی هویت مرکزی پس از بررسی بازگردانی شد.',
          metadata: { operationId: operation.id, restoredIdentityId: operation.merged_identity_id },
        });
      }
    }

    await setCompanyDatabaseContext(client, null);
    await client.query(`
      UPDATE customer_identities
      SET status = 'active', merged_into_identity_id = NULL, updated_at = now()
      WHERE workspace_id = $1 AND id = $2
    `, [context.workspace.id, operation.merged_identity_id]);
    const reversed = (await client.query<IdentityMergeRow>(`
      UPDATE customer_identity_merge_operations
      SET status = 'reversed', reversed_by_user_account_id = $1,
        reversed_at = now(), reversal_reason = $2
      WHERE workspace_id = $3 AND id = $4
      RETURNING id, canonical_identity_id, merged_identity_id, status, reason, merged_at, reversed_at, reversal_reason
    `, [session.actorUserAccountId, reason, context.workspace.id, operation.id])).rows[0]!;
    await appendAuditEntry(client, {
      workspaceId: context.workspace.id,
      companyId: null,
      ...auditIdentity(session),
      action: 'customer.identity_unmerged',
      resourceType: 'CustomerIdentityMerge',
      resourceId: operation.id,
      result: 'success',
      reason,
      previousState: { status: 'merged', mergedIdentityId: operation.merged_identity_id },
      newState: { status: 'active', restoredIdentityId: operation.merged_identity_id },
      correlationId,
    });
    return mapIdentityMerge(reversed);
  });
}
