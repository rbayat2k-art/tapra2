import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { withTenantTransaction } from '../../infrastructure/database/pool.js';
import { AppError } from '../../shared/errors.js';
import { appendAuditEntry, auditIdentity } from '../audit/audit-service.js';
import {
  createImportedCustomerWithinTransaction,
  linkImportedSourceWithinTransaction,
  type SourceInput,
} from '../customers/customer-service.js';
import type { AuthenticatedSession, MembershipContext } from '../identity/types.js';
import {
  normalizeIdentityText,
  normalizePhone,
  normalizeText,
  parseCustomerImportCsv,
  type ParsedCustomerImportRow,
} from './csv-parser.js';

export type ImportClassification = 'VALID' | 'INVALID' | 'EXACT_MATCH' | 'POSSIBLE_DUPLICATE' | 'REVIEW_REQUIRED';
export type ImportAction = 'CREATE_NEW' | 'LINK_TO_EXISTING' | 'LINK_TO_STAGED' | 'REJECT' | 'KEEP_FOR_REVIEW';

interface ExistingCustomerRow {
  id: string;
  full_name: string;
  phone_primary: string;
  normalized_phone: string | null;
}

interface ImportRecordRow {
  id: string;
  import_job_id: string;
  row_number: number;
  raw_data: Record<string, string>;
  full_name: string | null;
  normalized_full_name: string | null;
  phone: string | null;
  normalized_phone: string | null;
  phone_secondary: string | null;
  address_text: string | null;
  province: string | null;
  city: string | null;
  postal_code: string | null;
  purchase_reference: string | null;
  purchase_date: Date | string | null;
  purchase_amount: string | null;
  purchased_item: string | null;
  source_reference: string | null;
  classification: ImportClassification;
  reasons: string[];
  candidate_customer_ids: string[];
  duplicate_of_record_id: string | null;
  proposed_action: ImportAction;
  decided_action: ImportAction | null;
  target_customer_id: string | null;
  target_record_id: string | null;
  applied_customer_id: string | null;
  reviewed_at: Date | null;
  applied_at: Date | null;
}

interface ImportJobRow {
  id: string;
  file_name: string;
  source_name: string;
  file_sha256: string;
  schema_version: string;
  status: 'staged' | 'in_review' | 'approved' | 'failed';
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  exact_match_rows: number;
  possible_duplicate_rows: number;
  review_required_rows: number;
  approved_rows: number;
  rejected_rows: number;
  created_at: Date;
  approved_at: Date | null;
  completed_at: Date | null;
}

export interface ImportRecord {
  id: string;
  rowNumber: number;
  rawData: Record<string, string>;
  fullName: string | null;
  normalizedFullName: string | null;
  phone: string | null;
  normalizedPhone: string | null;
  phoneSecondary: string | null;
  address: string | null;
  province: string | null;
  city: string | null;
  postalCode: string | null;
  purchaseReference: string | null;
  purchaseDate: string | null;
  purchaseAmount: number | null;
  purchasedItem: string | null;
  sourceReference: string | null;
  classification: ImportClassification;
  reasons: string[];
  candidateCustomerIds: string[];
  duplicateOfRecordId: string | null;
  proposedAction: ImportAction;
  decidedAction: ImportAction | null;
  targetCustomerId: string | null;
  targetRecordId: string | null;
  appliedCustomerId: string | null;
  reviewedAt: string | null;
  appliedAt: string | null;
}

export interface ImportJob {
  id: string;
  fileName: string;
  sourceName: string;
  fileSha256: string;
  schemaVersion: string;
  status: ImportJobRow['status'];
  counts: { total: number; valid: number; invalid: number; exactMatch: number; possibleDuplicate: number; reviewRequired: number; approved: number; rejected: number };
  createdAt: string;
  approvedAt: string | null;
  completedAt: string | null;
  records?: ImportRecord[];
  candidates?: Array<{ id: string; fullName: string; phonePrimary: string }>;
}

export type ImportJobSummary = Pick<
  ImportJob,
  'id' | 'fileName' | 'sourceName' | 'schemaVersion' | 'status' | 'counts' | 'createdAt' | 'approvedAt' | 'completedAt'
>;

export function summarizeCustomerImport(job: ImportJob): ImportJobSummary {
  return {
    id: job.id,
    fileName: job.fileName,
    sourceName: job.sourceName,
    schemaVersion: job.schemaVersion,
    status: job.status,
    counts: job.counts,
    createdAt: job.createdAt,
    approvedAt: job.approvedAt,
    completedAt: job.completedAt,
  };
}

function requireCompany(context: MembershipContext): { id: string } {
  if (!context.company) throw new AppError(409, 'company_context_required', 'A Company context is required.');
  return context.company;
}

function mapRecord(row: ImportRecordRow): ImportRecord {
  const purchaseDate = row.purchase_date instanceof Date
    ? row.purchase_date.toISOString().slice(0, 10)
    : row.purchase_date;
  return {
    id: row.id, rowNumber: row.row_number, rawData: row.raw_data,
    fullName: row.full_name, normalizedFullName: row.normalized_full_name,
    phone: row.phone, normalizedPhone: row.normalized_phone, phoneSecondary: row.phone_secondary,
    address: row.address_text, province: row.province, city: row.city, postalCode: row.postal_code,
    purchaseReference: row.purchase_reference, purchaseDate,
    purchaseAmount: row.purchase_amount === null ? null : Number(row.purchase_amount), purchasedItem: row.purchased_item,
    sourceReference: row.source_reference, classification: row.classification, reasons: row.reasons,
    candidateCustomerIds: row.candidate_customer_ids, duplicateOfRecordId: row.duplicate_of_record_id,
    proposedAction: row.proposed_action, decidedAction: row.decided_action,
    targetCustomerId: row.target_customer_id, targetRecordId: row.target_record_id,
    appliedCustomerId: row.applied_customer_id,
    reviewedAt: row.reviewed_at?.toISOString() ?? null, appliedAt: row.applied_at?.toISOString() ?? null,
  };
}

function mapJob(row: ImportJobRow): ImportJob {
  return {
    id: row.id, fileName: row.file_name, sourceName: row.source_name,
    fileSha256: row.file_sha256, schemaVersion: row.schema_version, status: row.status,
    counts: {
      total: row.total_rows, valid: row.valid_rows, invalid: row.invalid_rows,
      exactMatch: row.exact_match_rows, possibleDuplicate: row.possible_duplicate_rows,
      reviewRequired: row.review_required_rows,
      approved: row.approved_rows, rejected: row.rejected_rows,
    },
    createdAt: row.created_at.toISOString(), approvedAt: row.approved_at?.toISOString() ?? null,
    completedAt: row.completed_at?.toISOString() ?? null,
  };
}

function validIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function normalizedRow(row: ParsedCustomerImportRow) {
  const reasons: string[] = [];
  const fullName = normalizeText(row.full_name);
  const phone = normalizeText(row.phone);
  const phoneSecondary = normalizeText(row.phone_secondary);
  const normalizedPrimary = normalizePhone(phone);
  const normalizedSecondary = normalizePhone(phoneSecondary);
  if (fullName.length < 2) reasons.push('missing_or_short_full_name');
  if (!phone || !/^[0-9۰-۹٠-٩+()\- ]+$/.test(phone) || normalizedPrimary.length < 7 || normalizedPrimary.length > 20) {
    reasons.push('invalid_phone');
  }
  if (phoneSecondary && (!/^[0-9۰-۹٠-٩+()\- ]+$/.test(phoneSecondary) || normalizedSecondary.length < 7 || normalizedSecondary.length > 20)) {
    reasons.push('invalid_secondary_phone');
  }
  if (phoneSecondary && normalizedPrimary === normalizedSecondary) reasons.push('duplicate_phone_fields');
  const purchaseDateValid = !row.purchase_date || validIsoDate(row.purchase_date);
  if (!purchaseDateValid) reasons.push('invalid_purchase_date');
  const amountText = row.purchase_amount.replace(/,/g, '');
  const amount = amountText === '' ? null : Number(amountText);
  if (amount !== null && (!Number.isFinite(amount) || amount < 0)) reasons.push('invalid_purchase_amount');
  return {
    fullName, normalizedFullName: normalizeIdentityText(fullName), phone,
    normalizedPhone: normalizedPrimary, phoneSecondary, normalizedSecondary,
    province: normalizeText(row.province), city: normalizeText(row.city), address: normalizeText(row.address),
    postalCode: normalizeText(row.postal_code), purchaseReference: normalizeText(row.purchase_reference),
    purchasedItem: normalizeText(row.purchased_item),
    purchaseDate: purchaseDateValid ? row.purchase_date || null : null,
    purchaseAmount: amount !== null && Number.isFinite(amount) && amount >= 0 ? amount : null,
    sourceReference: normalizeText(row.source_reference), reasons,
  };
}

async function readJob(client: PoolClient, jobId: string): Promise<ImportJob> {
  const jobRow = (await client.query<ImportJobRow>(`
    SELECT id, file_name, source_name, file_sha256, schema_version, status, total_rows,
      valid_rows, invalid_rows, exact_match_rows, possible_duplicate_rows,
      review_required_rows, approved_rows, rejected_rows, created_at, approved_at, completed_at
    FROM customer_import_jobs WHERE id = $1
  `, [jobId])).rows[0];
  if (!jobRow) throw new AppError(404, 'customer_import_not_found', 'Customer import was not found in the active context.');
  const records = await client.query<ImportRecordRow>(`
    SELECT * FROM customer_import_records WHERE import_job_id = $1 ORDER BY row_number
  `, [jobId]);
  const candidateIds = [...new Set(records.rows.flatMap((row) => row.candidate_customer_ids))];
  const candidates = candidateIds.length ? (await client.query<{ id: string; full_name: string; phone_primary: string }>(`
    SELECT id, full_name, phone_primary FROM customers WHERE id = ANY($1::uuid[]) AND status = 'active'
    ORDER BY full_name, id
  `, [candidateIds])).rows : [];
  return {
    ...mapJob(jobRow), records: records.rows.map(mapRecord),
    candidates: candidates.map((row) => ({ id: row.id, fullName: row.full_name, phonePrimary: row.phone_primary })),
  };
}

export async function stageCustomerImport(
  context: MembershipContext,
  session: AuthenticatedSession,
  input: { csv: string; fileName: string; sourceName: string; idempotencyKey: string; correlationId: string },
): Promise<ImportJob> {
  const company = requireCompany(context);
  const parsed = parseCustomerImportCsv(input.csv);
  const normalized = parsed.map((row) => ({ row, value: normalizedRow(row) }));
  const fileSha256 = createHash('sha256').update(input.csv).digest('hex');
  return withTenantTransaction({ workspaceId: context.workspace.id, companyId: company.id }, async (client) => {
    const prior = await client.query<{ id: string; file_sha256: string }>(`
      SELECT id, file_sha256 FROM customer_import_jobs WHERE idempotency_key = $1
    `, [input.idempotencyKey]);
    if (prior.rows[0]) {
      if (prior.rows[0].file_sha256 !== fileSha256) {
        throw new AppError(409, 'customer_import_idempotency_conflict', 'Idempotency-Key was already used for a different file.');
      }
      return readJob(client, prior.rows[0].id);
    }

    const phones = [...new Set(normalized.map(({ value }) => value.normalizedPhone).filter(Boolean))];
    const names = [...new Set(normalized.map(({ value }) => value.normalizedFullName).filter(Boolean))];
    const existing = await client.query<ExistingCustomerRow>(`
      SELECT DISTINCT c.id, c.full_name, c.phone_primary, p.normalized_value AS normalized_phone
      FROM customers c LEFT JOIN customer_phones p ON p.customer_id = c.id
      WHERE c.status = 'active' AND (
        p.normalized_value = ANY($1::text[])
        OR lower(regexp_replace(translate(c.full_name, 'يك', 'یک'), '\\s+', ' ', 'g')) = ANY($2::text[])
      )
    `, [phones, names]);
    const byPhone = new Map<string, ExistingCustomerRow[]>();
    const byName = new Map<string, ExistingCustomerRow[]>();
    for (const customer of existing.rows) {
      if (customer.normalized_phone) byPhone.set(customer.normalized_phone, [...(byPhone.get(customer.normalized_phone) ?? []), customer]);
      const name = normalizeIdentityText(customer.full_name);
      if (!byName.get(name)?.some((item) => item.id === customer.id)) byName.set(name, [...(byName.get(name) ?? []), customer]);
    }

    const prepared: Array<ReturnType<typeof normalizedRow> & {
      row: ParsedCustomerImportRow; classification: ImportClassification; reasons: string[];
      candidates: string[]; proposedAction: ImportAction; duplicateIndex: number | null;
    }> = [];
    const leaderByPhone = new Map<string, number>();
    const leaderByName = new Map<string, number>();
    normalized.forEach(({ row, value }, index) => {
      let classification: ImportClassification = 'VALID';
      let proposedAction: ImportAction = 'CREATE_NEW';
      let candidates: string[] = [];
      let duplicateIndex: number | null = null;
      const reasons = [...value.reasons];
      if (reasons.length) {
        classification = 'INVALID'; proposedAction = 'REJECT';
      } else {
        const exact = byPhone.get(value.normalizedPhone) ?? [];
        const leader = leaderByPhone.get(value.normalizedPhone);
        if (exact.length === 1) {
          classification = 'EXACT_MATCH'; proposedAction = 'LINK_TO_EXISTING';
          candidates = [exact[0]!.id]; reasons.push('existing_normalized_phone_match');
        } else if (exact.length > 1) {
          classification = 'REVIEW_REQUIRED'; proposedAction = 'KEEP_FOR_REVIEW';
          candidates = exact.map((item) => item.id); reasons.push('multiple_existing_phone_matches');
        } else if (leader !== undefined) {
          classification = 'EXACT_MATCH'; proposedAction = 'LINK_TO_STAGED'; duplicateIndex = leader;
          reasons.push('duplicate_normalized_phone_in_file');
        } else {
          const possible = byName.get(value.normalizedFullName) ?? [];
          if (possible.length) {
            classification = 'POSSIBLE_DUPLICATE'; proposedAction = 'KEEP_FOR_REVIEW';
            candidates = possible.map((item) => item.id); reasons.push('existing_normalized_name_match');
          } else if (leaderByName.has(value.normalizedFullName)) {
            classification = 'POSSIBLE_DUPLICATE'; proposedAction = 'KEEP_FOR_REVIEW';
            duplicateIndex = leaderByName.get(value.normalizedFullName)!;
            reasons.push('normalized_name_match_in_file');
          }
          leaderByPhone.set(value.normalizedPhone, index);
          if (!leaderByName.has(value.normalizedFullName)) leaderByName.set(value.normalizedFullName, index);
        }
      }
      prepared.push({ ...value, row, classification, proposedAction, candidates, duplicateIndex, reasons });
    });

    const counts = {
      valid: prepared.filter((item) => item.classification === 'VALID').length,
      invalid: prepared.filter((item) => item.classification === 'INVALID').length,
      exact: prepared.filter((item) => item.classification === 'EXACT_MATCH').length,
      possible: prepared.filter((item) => item.classification === 'POSSIBLE_DUPLICATE').length,
      review: prepared.filter((item) => item.classification === 'REVIEW_REQUIRED').length,
    };
    const job = await client.query<{ id: string }>(`
      INSERT INTO customer_import_jobs(
        workspace_id, company_id, file_name, source_name, file_sha256, total_rows,
        valid_rows, invalid_rows, exact_match_rows, possible_duplicate_rows,
        review_required_rows, created_by_user_account_id, idempotency_key
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id
    `, [
      context.workspace.id, company.id, input.fileName, input.sourceName, fileSha256, prepared.length,
      counts.valid, counts.invalid, counts.exact, counts.possible, counts.review,
      session.userAccountId, input.idempotencyKey,
    ]);
    const recordIds: string[] = [];
    for (const item of prepared) {
      const duplicateOf = item.duplicateIndex === null ? null : recordIds[item.duplicateIndex];
      const inserted = await client.query<{ id: string }>(`
        INSERT INTO customer_import_records(
          workspace_id, company_id, import_job_id, row_number, raw_data, full_name,
          normalized_full_name, phone, normalized_phone, phone_secondary, address_text,
          province, city, postal_code, purchase_reference, purchase_date, purchase_amount,
          purchased_item, source_reference, classification, reasons, candidate_customer_ids,
          duplicate_of_record_id, proposed_action, target_customer_id, target_record_id
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
          $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26
        ) RETURNING id
      `, [
        context.workspace.id, company.id, job.rows[0]!.id, item.row.rowNumber, JSON.stringify(item.row),
        item.fullName || null, item.normalizedFullName || null, item.phone || null,
        item.normalizedPhone || null, item.phoneSecondary || null, item.address || null,
        item.province || null, item.city || null, item.postalCode || null,
        item.purchaseReference || null, item.purchaseDate || null, item.purchaseAmount,
        item.purchasedItem || null, item.sourceReference || null, item.classification, item.reasons, item.candidates,
        duplicateOf, item.proposedAction, item.proposedAction === 'LINK_TO_EXISTING' ? item.candidates[0] : null,
        item.proposedAction === 'LINK_TO_STAGED' ? duplicateOf : null,
      ]);
      recordIds.push(inserted.rows[0]!.id);
    }
    await appendAuditEntry(client, {
      workspaceId: context.workspace.id, companyId: company.id, ...auditIdentity(session),
      action: 'customer_import.staged', resourceType: 'CustomerImportJob', resourceId: job.rows[0]!.id,
      result: 'success', newState: { fileName: input.fileName, fileSha256, totalRows: prepared.length, counts },
      correlationId: input.correlationId,
    });
    return readJob(client, job.rows[0]!.id);
  });
}

export async function listCustomerImports(context: MembershipContext): Promise<ImportJobSummary[]> {
  const company = requireCompany(context);
  return withTenantTransaction({ workspaceId: context.workspace.id, companyId: company.id }, async (client) => {
    const jobs = await client.query<ImportJobRow>(`
      SELECT id, file_name, source_name, file_sha256, schema_version, status, total_rows,
        valid_rows, invalid_rows, exact_match_rows, possible_duplicate_rows,
      review_required_rows, approved_rows, rejected_rows, created_at, approved_at, completed_at
      FROM customer_import_jobs ORDER BY created_at DESC, id DESC LIMIT 50
    `);
    return jobs.rows.map(mapJob).map(summarizeCustomerImport);
  });
}

export async function readCustomerImport(context: MembershipContext, jobId: string): Promise<ImportJob> {
  const company = requireCompany(context);
  return withTenantTransaction({ workspaceId: context.workspace.id, companyId: company.id }, (client) => readJob(client, jobId));
}

export async function applySafeImportDecisions(
  context: MembershipContext, session: AuthenticatedSession, jobId: string, correlationId: string,
): Promise<ImportJob> {
  const company = requireCompany(context);
  return withTenantTransaction({ workspaceId: context.workspace.id, companyId: company.id }, async (client) => {
    const job = await readJob(client, jobId);
    if (job.status === 'approved') throw new AppError(409, 'customer_import_already_approved', 'Approved imports cannot be reviewed again.');
    await client.query(`
      UPDATE customer_import_records
      SET decided_action = proposed_action,
        target_customer_id = CASE WHEN proposed_action = 'LINK_TO_EXISTING' THEN candidate_customer_ids[1] ELSE target_customer_id END,
        target_record_id = CASE WHEN proposed_action = 'LINK_TO_STAGED' THEN duplicate_of_record_id ELSE target_record_id END,
        reviewed_by_user_account_id = $1, reviewed_at = now()
      WHERE import_job_id = $2 AND decided_action IS NULL AND proposed_action <> 'KEEP_FOR_REVIEW'
    `, [session.userAccountId, jobId]);
    await client.query(`UPDATE customer_import_jobs SET status = 'in_review' WHERE id = $1`, [jobId]);
    await appendAuditEntry(client, {
      workspaceId: context.workspace.id, companyId: company.id, ...auditIdentity(session),
      action: 'customer_import.safe_decisions_applied', resourceType: 'CustomerImportJob', resourceId: jobId,
      result: 'success', correlationId,
    });
    return readJob(client, jobId);
  });
}

export async function decideImportRecord(
  context: MembershipContext, session: AuthenticatedSession,
  input: { jobId: string; recordId: string; action: ImportAction; targetCustomerId?: string; targetRecordId?: string; correlationId: string },
): Promise<ImportJob> {
  const company = requireCompany(context);
  if (input.action === 'LINK_TO_EXISTING' && !input.targetCustomerId) throw new AppError(400, 'customer_import_target_required', 'An existing Customer target is required.');
  if (input.action === 'LINK_TO_STAGED' && !input.targetRecordId) throw new AppError(400, 'customer_import_target_required', 'A staged record target is required.');
  return withTenantTransaction({ workspaceId: context.workspace.id, companyId: company.id }, async (client) => {
    const record = (await client.query<ImportRecordRow>(`
      SELECT * FROM customer_import_records WHERE id = $1 AND import_job_id = $2 FOR UPDATE
    `, [input.recordId, input.jobId])).rows[0];
    if (!record) throw new AppError(404, 'customer_import_record_not_found', 'Import record was not found in the active context.');
    const job = await readJob(client, input.jobId);
    if (job.status === 'approved') throw new AppError(409, 'customer_import_already_approved', 'Approved imports cannot be changed.');
    if (input.action === 'CREATE_NEW' && (!record.full_name || !record.normalized_phone || record.classification === 'INVALID')) {
      throw new AppError(409, 'customer_import_record_invalid', 'Invalid identity data cannot create a Customer.');
    }
    if (input.action === 'LINK_TO_EXISTING') {
      const target = await client.query('SELECT id FROM customers WHERE id = $1 AND status = $2', [input.targetCustomerId, 'active']);
      if (!target.rowCount) throw new AppError(409, 'customer_import_target_invalid', 'Target Customer is not visible in the active context.');
    }
    if (input.action === 'LINK_TO_STAGED') {
      const target = await client.query('SELECT id FROM customer_import_records WHERE id = $1 AND import_job_id = $2', [input.targetRecordId, input.jobId]);
      if (!target.rowCount || input.targetRecordId === input.recordId) throw new AppError(409, 'customer_import_target_invalid', 'Target staged record is invalid.');
    }
    await client.query(`
      UPDATE customer_import_records
      SET decided_action = $1, target_customer_id = $2, target_record_id = $3,
        reviewed_by_user_account_id = $4, reviewed_at = now()
      WHERE id = $5
    `, [input.action, input.targetCustomerId ?? null, input.targetRecordId ?? null, session.userAccountId, input.recordId]);
    await client.query(`UPDATE customer_import_jobs SET status = 'in_review' WHERE id = $1`, [input.jobId]);
    await appendAuditEntry(client, {
      workspaceId: context.workspace.id, companyId: company.id, ...auditIdentity(session),
      action: 'customer_import.record_decided', resourceType: 'CustomerImportRecord', resourceId: input.recordId,
      result: 'success', previousState: { action: record.decided_action },
      newState: { action: input.action, targetCustomerId: input.targetCustomerId, targetRecordId: input.targetRecordId },
      correlationId: input.correlationId,
    });
    return readJob(client, input.jobId);
  });
}

function sourceForRecord(job: ImportJob, record: ImportRecord): SourceInput {
  return {
    type: 'excel', name: job.sourceName, reference: record.sourceReference || job.fileName,
    importReference: record.id, observedAt: record.purchaseDate ? `${record.purchaseDate}T00:00:00.000Z` : undefined,
    rawSourceReference: `${job.fileName}:row:${record.rowNumber}`, verificationStatus: 'verified',
    metadata: {
      importJobId: job.id, importRecordId: record.id, fileSha256: job.fileSha256,
      purchaseReference: record.purchaseReference, purchaseDate: record.purchaseDate,
      purchaseAmount: record.purchaseAmount, purchasedItem: record.purchasedItem,
    },
  };
}

export async function approveCustomerImport(
  context: MembershipContext, session: AuthenticatedSession, jobId: string, correlationId: string,
): Promise<ImportJob> {
  const company = requireCompany(context);
  return withTenantTransaction({ workspaceId: context.workspace.id, companyId: company.id }, async (client) => {
    await client.query('SELECT id FROM customer_import_jobs WHERE id = $1 FOR UPDATE', [jobId]);
    const job = await readJob(client, jobId);
    if (job.status === 'approved') return job;
    const records = job.records ?? [];
    const unresolved = records.filter((record) => !record.decidedAction || record.decidedAction === 'KEEP_FOR_REVIEW');
    if (unresolved.length) {
      throw new AppError(409, 'customer_import_review_incomplete', `${unresolved.length} import records still require a final decision.`);
    }
    const appliedByRecord = new Map<string, string>();
    for (const record of records) {
      const action = record.decidedAction!;
      let customerId: string | null = record.appliedCustomerId;
      if (!customerId && action === 'CREATE_NEW') {
        customerId = await createImportedCustomerWithinTransaction(client, {
          workspaceId: context.workspace.id, companyId: company.id, actorId: session.userAccountId,
        }, {
          fullName: record.fullName!, phonePrimary: record.phone!, phoneSecondary: record.phoneSecondary || undefined,
          address: record.address || undefined, province: record.province || undefined, city: record.city || undefined,
          postalCode: record.postalCode || undefined, source: sourceForRecord(job, record), importRecordId: record.id,
        });
      } else if (!customerId && action === 'LINK_TO_EXISTING') {
        customerId = record.targetCustomerId;
        if (!customerId) throw new AppError(409, 'customer_import_target_missing', 'Approved existing-Customer link has no target.');
        await linkImportedSourceWithinTransaction(client, {
          workspaceId: context.workspace.id, companyId: company.id, actorId: session.userAccountId,
        }, customerId, { importRecordId: record.id, source: sourceForRecord(job, record) });
      } else if (!customerId && action === 'LINK_TO_STAGED') {
        customerId = record.targetRecordId ? appliedByRecord.get(record.targetRecordId) ?? null : null;
        if (!customerId) throw new AppError(409, 'customer_import_staged_target_unresolved', 'A linked staged record must be applied before its dependent row.');
        await linkImportedSourceWithinTransaction(client, {
          workspaceId: context.workspace.id, companyId: company.id, actorId: session.userAccountId,
        }, customerId, { importRecordId: record.id, source: sourceForRecord(job, record) });
      }
      if (customerId) appliedByRecord.set(record.id, customerId);
      await client.query(`
        UPDATE customer_import_records SET applied_customer_id = $1, applied_at = now() WHERE id = $2
      `, [customerId, record.id]);
      await appendAuditEntry(client, {
        workspaceId: context.workspace.id, companyId: company.id, ...auditIdentity(session),
        action: `customer_import.${action.toLowerCase()}`, resourceType: 'CustomerImportRecord', resourceId: record.id,
        result: 'success', newState: { action, customerId }, correlationId,
      });
    }
    const approvedRows = records.filter((record) => record.decidedAction !== 'REJECT').length;
    const rejectedRows = records.length - approvedRows;
    await client.query(`
      UPDATE customer_import_jobs SET status = 'approved', approved_by_user_account_id = $1, approved_at = now(),
        approved_rows = $3, rejected_rows = $4, completed_at = now()
      WHERE id = $2
    `, [session.userAccountId, jobId, approvedRows, rejectedRows]);
    await appendAuditEntry(client, {
      workspaceId: context.workspace.id, companyId: company.id, ...auditIdentity(session),
      action: 'customer_import.approved', resourceType: 'CustomerImportJob', resourceId: jobId,
      result: 'success', newState: { status: 'approved', totalRows: records.length }, correlationId,
    });
    return readJob(client, jobId);
  });
}
