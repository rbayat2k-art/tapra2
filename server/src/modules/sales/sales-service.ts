import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { withTenantTransaction } from '../../infrastructure/database/pool.js';
import { AppError } from '../../shared/errors.js';
import { appendAuditEntry } from '../audit/audit-service.js';
import type { AuthenticatedSession, MembershipContext } from '../identity/types.js';

export const salesLeadStatuses = [
  'new', 'pending_action', 'callback_scheduled', 'overdue', 'in_negotiation',
  'ready_for_invoice', 'closed_won', 'closed_lost', 'wrong_number', 'complaint_blocked',
] as const;
export type SalesLeadStatus = typeof salesLeadStatuses[number];

export const salesCallOutcomes = [
  'not_dialed', 'could_not_connect', 'switched_off', 'no_answer', 'wrong_number',
  'connected_no_time', 'real_conversation', 'callback_requested', 'interested',
  'ready_for_invoice', 'cancelled', 'complaint',
] as const;
export type SalesCallOutcome = typeof salesCallOutcomes[number];

interface LeadRow {
  id: string;
  tracking_code: string;
  customer_id: string;
  customer_identity_id: string;
  customer_name: string;
  company_id: string;
  company_name: string;
  source: string;
  declared_interest: string;
  priority: 'low' | 'normal' | 'high';
  status: SalesLeadStatus;
  campaign_reference: string | null;
  context_snapshot: Record<string, unknown>;
  current_assignee_membership_id: string | null;
  current_assignee_name: string | null;
  first_attempt_at: Date | string | null;
  first_effective_contact_at: Date | string | null;
  last_call_outcome: SalesCallOutcome | null;
  action_deadline: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  call_count: string;
}

interface PolicyRow {
  effective_call_outcomes: SalesCallOutcome[];
  relationship_lock_mode: 'none' | 'until_reassigned' | 'duration';
  relationship_lock_duration_minutes: number | null;
  failed_call_releases_assignment: boolean;
  shift_end_releases_assignment: boolean;
  version: number;
}

interface RelationshipRow {
  id: string;
  owner_membership_id: string | null;
  lock_mode: 'none' | 'until_reassigned' | 'duration';
  lock_expires_at: Date | string | null;
}

export interface SalesLeadSummary {
  id: string;
  trackingCode: string;
  customerId: string;
  customerIdentityId: string;
  customerName: string;
  company: { id: string; name: string };
  source: string;
  declaredInterest: string;
  priority: 'low' | 'normal' | 'high';
  status: SalesLeadStatus;
  campaignReference: string | null;
  context: Record<string, unknown>;
  currentAssignee: { membershipId: string; name: string } | null;
  firstAttemptAt: string | null;
  firstEffectiveContactAt: string | null;
  lastCallOutcome: SalesCallOutcome | null;
  actionDeadline: string | null;
  createdAt: string;
  updatedAt: string;
  callCount: number;
}

export interface SalesLeadDetail extends SalesLeadSummary {
  timeline: Array<{ id: string; type: string; summary: string; metadata: Record<string, unknown>; actorName: string; occurredAt: string }>;
  assignments: Array<{ id: string; type: 'assigned' | 'reassigned'; previousAssigneeName: string | null; assigneeName: string; assignedByName: string; reason: string | null; assignedAt: string }>;
  calls: Array<{ id: string; salespersonName: string; companyName: string; campaignReference: string | null; context: Record<string, unknown>; startedAt: string; endedAt: string; outcome: SalesCallOutcome; effective: boolean; note: string | null; callbackAt: string | null }>;
  relationship: null | { id: string; status: 'active' | 'released'; lockMode: 'none' | 'until_reassigned' | 'duration'; ownerMembershipId: string | null; ownerName: string | null; lockAcquiredAt: string | null; lockExpiresAt: string | null; updatedAt: string };
}

export interface SalesAssignee {
  membershipId: string;
  userAccountId: string;
  fullName: string;
}

export interface CreateSalesLeadInput {
  customerId: string;
  source: string;
  declaredInterest: string;
  priority: 'low' | 'normal' | 'high';
  campaignReference?: string;
  context?: Record<string, unknown>;
}

export interface AssignSalesLeadInput {
  targetMembershipId: string;
  reason?: string;
}

export interface RecordSalesCallInput {
  outcome: SalesCallOutcome;
  startedAt: string;
  note?: string;
  callbackAt?: string;
  context?: Record<string, unknown>;
}

function companyFrom(context: MembershipContext) {
  if (!context.company) throw new AppError(409, 'company_context_required', 'A Company context is required for Sales.');
  return context.company;
}

function hasPermission(context: MembershipContext, permission: string): boolean {
  return context.permissions.includes(permission);
}

function requireAnyPermission(context: MembershipContext, permissions: string[]): void {
  if (!permissions.some((permission) => hasPermission(context, permission))) {
    throw new AppError(403, 'permission_denied', `One of these permissions is required: ${permissions.join(', ')}.`);
  }
}

function iso(value: Date | string | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

function mapLead(row: LeadRow): SalesLeadSummary {
  return {
    id: row.id,
    trackingCode: row.tracking_code,
    customerId: row.customer_id,
    customerIdentityId: row.customer_identity_id,
    customerName: row.customer_name,
    company: { id: row.company_id, name: row.company_name },
    source: row.source,
    declaredInterest: row.declared_interest,
    priority: row.priority,
    status: row.status,
    campaignReference: row.campaign_reference,
    context: row.context_snapshot ?? {},
    currentAssignee: row.current_assignee_membership_id && row.current_assignee_name
      ? { membershipId: row.current_assignee_membership_id, name: row.current_assignee_name }
      : null,
    firstAttemptAt: iso(row.first_attempt_at),
    firstEffectiveContactAt: iso(row.first_effective_contact_at),
    lastCallOutcome: row.last_call_outcome,
    actionDeadline: iso(row.action_deadline),
    createdAt: iso(row.created_at)!,
    updatedAt: iso(row.updated_at)!,
    callCount: Number(row.call_count),
  };
}

const leadSelect = `
  SELECT lead.id, lead.tracking_code, lead.customer_id, lead.customer_identity_id,
    customer.full_name AS customer_name, lead.company_id, company.name AS company_name,
    lead.source, lead.declared_interest, lead.priority, lead.status, lead.campaign_reference,
    lead.context_snapshot, lead.current_assignee_membership_id, assignee.full_name AS current_assignee_name,
    lead.first_attempt_at, lead.first_effective_contact_at, lead.last_call_outcome,
    lead.action_deadline, lead.created_at, lead.updated_at,
    (SELECT count(*)::text FROM sales_call_logs call_log WHERE call_log.lead_id = lead.id) AS call_count
  FROM sales_leads lead
  JOIN customers customer ON customer.id = lead.customer_id
  JOIN companies company ON company.id = lead.company_id
  LEFT JOIN memberships membership ON membership.id = lead.current_assignee_membership_id
  LEFT JOIN persons assignee ON assignee.id = membership.person_id
`;

async function loadLead(client: PoolClient, leadId: string): Promise<SalesLeadSummary> {
  const result = await client.query<LeadRow>(`${leadSelect} WHERE lead.id = $1`, [leadId]);
  const row = result.rows[0];
  if (!row) throw new AppError(404, 'sales_lead_not_found', 'Sales Lead was not found in the active Company.');
  return mapLead(row);
}

async function assertLeadReadable(client: PoolClient, context: MembershipContext, leadId: string, lock = false): Promise<LeadRow> {
  const result = await client.query<LeadRow>(`${leadSelect} WHERE lead.id = $1 ${lock ? 'FOR UPDATE OF lead' : ''}`, [leadId]);
  const row = result.rows[0];
  if (!row) throw new AppError(404, 'sales_lead_not_found', 'Sales Lead was not found in the active Company.');
  if (!hasPermission(context, 'sales.lead.read_all') && row.current_assignee_membership_id !== context.membershipId) {
    throw new AppError(404, 'sales_lead_not_found', 'Sales Lead was not found in the active queue.');
  }
  return row;
}

async function loadLeadDetail(client: PoolClient, leadId: string): Promise<SalesLeadDetail> {
  const lead = await loadLead(client, leadId);
  const timeline = await client.query<{
      id: string; event_type: string; summary: string; metadata: Record<string, unknown>;
      actor_name: string; occurred_at: Date | string;
    }>(`
      SELECT event.id, event.event_type, event.summary, event.metadata,
        person.full_name AS actor_name, event.occurred_at
      FROM sales_lead_timeline_events event
      JOIN user_accounts account ON account.id = event.actor_user_account_id
      JOIN persons person ON person.id = account.person_id
      WHERE event.lead_id = $1 ORDER BY event.occurred_at, event.id
    `, [leadId]);
  const assignments = await client.query<{
      id: string; assignment_type: 'assigned' | 'reassigned'; previous_name: string | null;
      assignee_name: string; actor_name: string; reason: string | null; assigned_at: Date | string;
    }>(`
      SELECT assignment.id, assignment.assignment_type, previous_person.full_name AS previous_name,
        assignee_person.full_name AS assignee_name, actor_person.full_name AS actor_name,
        assignment.reason, assignment.assigned_at
      FROM sales_lead_assignments assignment
      LEFT JOIN memberships previous_membership ON previous_membership.id = assignment.previous_assignee_membership_id
      LEFT JOIN persons previous_person ON previous_person.id = previous_membership.person_id
      JOIN memberships assignee_membership ON assignee_membership.id = assignment.assignee_membership_id
      JOIN persons assignee_person ON assignee_person.id = assignee_membership.person_id
      JOIN user_accounts actor_account ON actor_account.id = assignment.assigned_by_user_account_id
      JOIN persons actor_person ON actor_person.id = actor_account.person_id
      WHERE assignment.lead_id = $1 ORDER BY assignment.assigned_at, assignment.id
    `, [leadId]);
  const calls = await client.query<{
      id: string; salesperson_name: string; company_name: string; campaign_reference: string | null;
      context_snapshot: Record<string, unknown>; started_at: Date | string; ended_at: Date | string;
      outcome: SalesCallOutcome; effective: boolean; note: string | null; callback_at: Date | string | null;
    }>(`
      SELECT call_log.id, person.full_name AS salesperson_name, company.name AS company_name,
        call_log.campaign_reference, call_log.context_snapshot, call_log.started_at, call_log.ended_at,
        call_log.outcome, call_log.effective, call_log.note, call_log.callback_at
      FROM sales_call_logs call_log
      JOIN user_accounts account ON account.id = call_log.actor_user_account_id
      JOIN persons person ON person.id = account.person_id
      JOIN companies company ON company.id = call_log.company_id
      WHERE call_log.lead_id = $1 ORDER BY call_log.created_at DESC, call_log.id DESC
    `, [leadId]);
  const relationship = await client.query<{
      id: string; status: 'active' | 'released'; lock_mode: 'none' | 'until_reassigned' | 'duration';
      owner_membership_id: string | null; owner_name: string | null; lock_acquired_at: Date | string | null;
      lock_expires_at: Date | string | null; updated_at: Date | string;
    }>(`
      SELECT relationship.id, relationship.status, relationship.lock_mode,
        relationship.owner_membership_id, owner.full_name AS owner_name,
        relationship.lock_acquired_at, relationship.lock_expires_at, relationship.updated_at
      FROM sales_customer_relationships relationship
      LEFT JOIN memberships membership ON membership.id = relationship.owner_membership_id
      LEFT JOIN persons owner ON owner.id = membership.person_id
      WHERE relationship.customer_id = $1
    `, [lead.customerId]);

  const relationshipRow = relationship.rows[0];
  return {
    ...lead,
    timeline: timeline.rows.map((row) => ({
      id: row.id, type: row.event_type, summary: row.summary, metadata: row.metadata ?? {},
      actorName: row.actor_name, occurredAt: iso(row.occurred_at)!,
    })),
    assignments: assignments.rows.map((row) => ({
      id: row.id, type: row.assignment_type, previousAssigneeName: row.previous_name,
      assigneeName: row.assignee_name, assignedByName: row.actor_name, reason: row.reason,
      assignedAt: iso(row.assigned_at)!,
    })),
    calls: calls.rows.map((row) => ({
      id: row.id, salespersonName: row.salesperson_name, companyName: row.company_name,
      campaignReference: row.campaign_reference, context: row.context_snapshot ?? {},
      startedAt: iso(row.started_at)!, endedAt: iso(row.ended_at)!, outcome: row.outcome,
      effective: row.effective, note: row.note, callbackAt: iso(row.callback_at),
    })),
    relationship: relationshipRow ? {
      id: relationshipRow.id, status: relationshipRow.status, lockMode: relationshipRow.lock_mode,
      ownerMembershipId: relationshipRow.owner_membership_id, ownerName: relationshipRow.owner_name,
      lockAcquiredAt: iso(relationshipRow.lock_acquired_at), lockExpiresAt: iso(relationshipRow.lock_expires_at),
      updatedAt: iso(relationshipRow.updated_at)!,
    } : null,
  };
}

async function loadPolicy(client: PoolClient): Promise<PolicyRow> {
  const result = await client.query<PolicyRow>(`
    SELECT effective_call_outcomes, relationship_lock_mode, relationship_lock_duration_minutes,
      failed_call_releases_assignment, shift_end_releases_assignment, version
    FROM sales_policies
  `);
  const policy = result.rows[0];
  if (!policy) throw new AppError(409, 'sales_policy_missing', 'Sales policy is not configured for the active Company.');
  return policy;
}

export async function listSalesLeads(context: MembershipContext): Promise<SalesLeadSummary[]> {
  requireAnyPermission(context, ['sales.queue.read', 'sales.lead.read_all']);
  const company = companyFrom(context);
  return withTenantTransaction({ workspaceId: context.workspace.id, companyId: company.id }, async (client) => {
    const readAll = hasPermission(context, 'sales.lead.read_all');
    const result = await client.query<LeadRow>(`
      ${leadSelect}
      WHERE ($1::boolean OR lead.current_assignee_membership_id = $2::uuid)
      ORDER BY lead.updated_at DESC, lead.id DESC
    `, [readAll, context.membershipId]);
    return result.rows.map(mapLead);
  });
}

export async function readSalesLead(context: MembershipContext, leadId: string): Promise<SalesLeadDetail> {
  requireAnyPermission(context, ['sales.queue.read', 'sales.lead.read_all']);
  const company = companyFrom(context);
  return withTenantTransaction({ workspaceId: context.workspace.id, companyId: company.id }, async (client) => {
    await assertLeadReadable(client, context, leadId);
    return loadLeadDetail(client, leadId);
  });
}

export async function listSalesAssignees(context: MembershipContext): Promise<SalesAssignee[]> {
  requireAnyPermission(context, ['sales.lead.assign', 'sales.lead.reassign']);
  const company = companyFrom(context);
  return withTenantTransaction({ workspaceId: context.workspace.id, companyId: company.id }, async (client) => {
    const result = await client.query<{
      membership_id: string; user_account_id: string; full_name: string;
    }>(`
      SELECT DISTINCT membership.id AS membership_id, account.id AS user_account_id, person.full_name
      FROM memberships membership
      JOIN persons person ON person.id = membership.person_id
      JOIN user_accounts account ON account.person_id = person.id AND account.is_active = true
      JOIN role_assignments assignment ON assignment.membership_id = membership.id
      JOIN role_permissions role_permission ON role_permission.role_id = assignment.role_id
      WHERE membership.status = 'active'
        AND membership.workspace_id = $1
        AND membership.company_id = $2
        AND membership.valid_from <= now()
        AND (membership.valid_until IS NULL OR membership.valid_until > now())
        AND role_permission.permission_code = 'sales.queue.read'
      ORDER BY person.full_name
    `, [context.workspace.id, company.id]);
    return result.rows.map((row) => ({
      membershipId: row.membership_id, userAccountId: row.user_account_id, fullName: row.full_name,
    }));
  });
}

export async function createSalesLead(
  context: MembershipContext,
  session: AuthenticatedSession,
  input: CreateSalesLeadInput,
  idempotencyKey: string,
  correlationId: string,
): Promise<SalesLeadDetail> {
  if (!hasPermission(context, 'sales.lead.create')) {
    throw new AppError(403, 'permission_denied', 'Permission sales.lead.create is required.');
  }
  const company = companyFrom(context);
  return withTenantTransaction({ workspaceId: context.workspace.id, companyId: company.id }, async (client) => {
    const repeated = await client.query<{ id: string }>(`
      SELECT id FROM sales_leads WHERE idempotency_key = $1
    `, [idempotencyKey]);
    if (repeated.rows[0]) return loadLeadDetail(client, repeated.rows[0].id);

    const customer = await client.query<{ id: string; identity_id: string; full_name: string }>(`
      SELECT id, identity_id, full_name FROM customers WHERE id = $1 AND status = 'active'
    `, [input.customerId]);
    const customerRow = customer.rows[0];
    if (!customerRow) throw new AppError(404, 'customer_not_found', 'Customer was not found in the active Company.');

    const leadId = randomUUID();
    const trackingCode = `LD-${leadId.replaceAll('-', '').slice(0, 8).toUpperCase()}`;
    await client.query(`
      INSERT INTO sales_leads(
        id, workspace_id, company_id, customer_identity_id, customer_id, tracking_code,
        source, declared_interest, priority, campaign_reference, context_snapshot,
        created_by_user_account_id, idempotency_key
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `, [
      leadId, context.workspace.id, company.id, customerRow.identity_id, customerRow.id, trackingCode,
      input.source, input.declaredInterest, input.priority, input.campaignReference ?? null,
      JSON.stringify(input.context ?? {}), session.userAccountId, idempotencyKey,
    ]);
    await client.query(`
      INSERT INTO sales_lead_timeline_events(
        workspace_id, company_id, lead_id, actor_user_account_id, event_type, summary, metadata
      ) VALUES ($1, $2, $3, $4, 'lead_created', 'Lead برای رابطهٔ مشتری ایجاد شد.', $5)
    `, [context.workspace.id, company.id, leadId, session.userAccountId, JSON.stringify({
      source: input.source, campaignReference: input.campaignReference ?? null,
    })]);
    await client.query(`
      INSERT INTO customer_timeline_events(
        workspace_id, company_id, customer_id, actor_user_account_id, event_type, summary, metadata
      ) VALUES ($1, $2, $3, $4, 'sales_lead_created', 'Lead فروش برای مشتری ایجاد شد.', $5)
    `, [context.workspace.id, company.id, customerRow.id, session.userAccountId, JSON.stringify({
      leadId, trackingCode, source: input.source, campaignReference: input.campaignReference ?? null,
    })]);
    await appendAuditEntry(client, {
      workspaceId: context.workspace.id, companyId: company.id, actorUserAccountId: session.userAccountId,
      action: 'sales.lead.created', resourceType: 'sales_lead', resourceId: leadId, result: 'success',
      newState: { customerId: customerRow.id, customerIdentityId: customerRow.identity_id, trackingCode }, correlationId,
    });
    return loadLeadDetail(client, leadId);
  });
}

export async function assignSalesLead(
  context: MembershipContext,
  session: AuthenticatedSession,
  leadId: string,
  input: AssignSalesLeadInput,
  idempotencyKey: string,
  correlationId: string,
): Promise<SalesLeadDetail> {
  requireAnyPermission(context, ['sales.lead.assign', 'sales.lead.reassign']);
  const company = companyFrom(context);
  return withTenantTransaction({ workspaceId: context.workspace.id, companyId: company.id }, async (client) => {
    const repeated = await client.query<{ lead_id: string }>(`
      SELECT lead_id FROM sales_lead_assignments WHERE idempotency_key = $1
    `, [idempotencyKey]);
    if (repeated.rows[0]) {
      if (repeated.rows[0].lead_id !== leadId) throw new AppError(409, 'idempotency_key_reused', 'Idempotency key was used for another Lead.');
      return loadLeadDetail(client, leadId);
    }

    const leadResult = await client.query<LeadRow>(`${leadSelect} WHERE lead.id = $1 FOR UPDATE OF lead`, [leadId]);
    const lead = leadResult.rows[0];
    if (!lead) throw new AppError(404, 'sales_lead_not_found', 'Sales Lead was not found in the active Company.');

    const target = await client.query<{ membership_id: string; full_name: string }>(`
      SELECT DISTINCT membership.id AS membership_id, person.full_name
      FROM memberships membership
      JOIN persons person ON person.id = membership.person_id
      JOIN role_assignments assignment ON assignment.membership_id = membership.id
      JOIN role_permissions role_permission ON role_permission.role_id = assignment.role_id
      WHERE membership.id = $1 AND membership.status = 'active'
        AND membership.workspace_id = $2
        AND membership.company_id = $3
        AND membership.valid_from <= now()
        AND (membership.valid_until IS NULL OR membership.valid_until > now())
        AND role_permission.permission_code = 'sales.queue.read'
    `, [input.targetMembershipId, context.workspace.id, company.id]);
    const targetRow = target.rows[0];
    if (!targetRow) throw new AppError(400, 'sales_assignee_invalid', 'Target is not an active Sales queue member in this Company.');
    if (lead.current_assignee_membership_id === targetRow.membership_id) {
      throw new AppError(409, 'sales_lead_already_assigned', 'Sales Lead is already assigned to this member.');
    }

    const assignmentType = lead.current_assignee_membership_id ? 'reassigned' : 'assigned';
    if (assignmentType === 'assigned' && !hasPermission(context, 'sales.lead.assign')) {
      throw new AppError(403, 'permission_denied', 'Permission sales.lead.assign is required.');
    }
    if (assignmentType === 'reassigned') {
      if (!hasPermission(context, 'sales.lead.reassign')) {
        throw new AppError(403, 'permission_denied', 'Permission sales.lead.reassign is required.');
      }
      if (!input.reason || input.reason.trim().length < 3) {
        throw new AppError(400, 'reassignment_reason_required', 'A reason is required for Sales Lead reassignment.');
      }
    }

    const assignmentId = randomUUID();
    await client.query(`
      INSERT INTO sales_lead_assignments(
        id, workspace_id, company_id, lead_id, previous_assignee_membership_id,
        assignee_membership_id, assigned_by_user_account_id, assignment_type, reason, idempotency_key
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      assignmentId, context.workspace.id, company.id, lead.id, lead.current_assignee_membership_id,
      targetRow.membership_id, session.userAccountId, assignmentType, input.reason ?? null, idempotencyKey,
    ]);
    await client.query(`
      UPDATE sales_leads SET current_assignee_membership_id = $2,
        status = CASE WHEN status = 'new' THEN 'pending_action' ELSE status END,
        updated_at = now(), version = version + 1
      WHERE id = $1
    `, [lead.id, targetRow.membership_id]);
    await client.query(`
      INSERT INTO sales_lead_timeline_events(
        workspace_id, company_id, lead_id, actor_user_account_id, event_type, summary, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      context.workspace.id, company.id, lead.id, session.userAccountId,
      assignmentType === 'assigned' ? 'lead_assigned' : 'lead_reassigned',
      assignmentType === 'assigned' ? `Lead به ${targetRow.full_name} تخصیص یافت.` : `Lead به ${targetRow.full_name} بازتخصیص یافت.`,
      JSON.stringify({
        assignmentId, previousMembershipId: lead.current_assignee_membership_id,
        targetMembershipId: targetRow.membership_id, reason: input.reason ?? null,
      }),
    ]);

    if (assignmentType === 'reassigned') {
      const relationship = await client.query<RelationshipRow>(`
        SELECT id, owner_membership_id, lock_mode, lock_expires_at
        FROM sales_customer_relationships WHERE customer_id = $1 FOR UPDATE
      `, [lead.customer_id]);
      const relationshipRow = relationship.rows[0];
      if (relationshipRow?.owner_membership_id) {
        if (relationshipRow.owner_membership_id !== lead.current_assignee_membership_id) {
          throw new AppError(409, 'sales_relationship_owner_conflict', 'Customer relationship owner does not match the current Lead owner.');
        }
        const policy = await loadPolicy(client);
        const expiresAt = policy.relationship_lock_mode === 'duration'
          ? new Date(Date.now() + policy.relationship_lock_duration_minutes! * 60_000).toISOString()
          : null;
        await client.query(`
          UPDATE sales_customer_relationships SET owner_membership_id = $2,
            lock_mode = $3, lock_acquired_at = CASE WHEN $3 = 'none' THEN NULL ELSE now() END,
            lock_expires_at = $4, updated_at = now(), version = version + 1
          WHERE id = $1
        `, [relationshipRow.id, policy.relationship_lock_mode === 'none' ? null : targetRow.membership_id, policy.relationship_lock_mode, expiresAt]);
        await client.query(`
          INSERT INTO sales_customer_relationship_events(
            workspace_id, company_id, relationship_id, lead_id, actor_user_account_id,
            event_type, previous_owner_membership_id, new_owner_membership_id, reason, metadata
          ) VALUES ($1, $2, $3, $4, $5, 'lock_reassigned', $6, $7, $8, $9)
        `, [
          context.workspace.id, company.id, relationshipRow.id, lead.id, session.userAccountId,
          relationshipRow.owner_membership_id, policy.relationship_lock_mode === 'none' ? null : targetRow.membership_id,
          input.reason, JSON.stringify({ policyVersion: policy.version, assignmentId }),
        ]);
      }
    }

    await appendAuditEntry(client, {
      workspaceId: context.workspace.id, companyId: company.id, actorUserAccountId: session.userAccountId,
      action: assignmentType === 'assigned' ? 'sales.lead.assigned' : 'sales.lead.reassigned',
      resourceType: 'sales_lead', resourceId: lead.id, result: 'success', reason: input.reason,
      previousState: { assigneeMembershipId: lead.current_assignee_membership_id },
      newState: { assigneeMembershipId: targetRow.membership_id, assignmentId }, correlationId,
    });
    return loadLeadDetail(client, lead.id);
  });
}

const terminalStatuses: SalesLeadStatus[] = ['closed_won', 'closed_lost', 'wrong_number', 'complaint_blocked'];
const outcomeStatus: Record<SalesCallOutcome, SalesLeadStatus | null> = {
  not_dialed: null, could_not_connect: null, switched_off: null, no_answer: null,
  wrong_number: 'wrong_number', connected_no_time: null, real_conversation: 'in_negotiation',
  callback_requested: 'callback_scheduled', interested: 'in_negotiation',
  ready_for_invoice: 'ready_for_invoice', cancelled: 'closed_lost', complaint: 'complaint_blocked',
};

function relationshipLockIsActive(relationship: RelationshipRow): boolean {
  if (!relationship.owner_membership_id || relationship.lock_mode === 'none') return false;
  if (relationship.lock_mode === 'until_reassigned') return true;
  return !!relationship.lock_expires_at && new Date(relationship.lock_expires_at).getTime() > Date.now();
}

export async function recordSalesCall(
  context: MembershipContext,
  session: AuthenticatedSession,
  leadId: string,
  input: RecordSalesCallInput,
  idempotencyKey: string,
  correlationId: string,
): Promise<SalesLeadDetail> {
  if (!hasPermission(context, 'sales.call.create')) {
    throw new AppError(403, 'permission_denied', 'Permission sales.call.create is required.');
  }
  const company = companyFrom(context);
  return withTenantTransaction({ workspaceId: context.workspace.id, companyId: company.id }, async (client) => {
    const repeated = await client.query<{ lead_id: string }>(`
      SELECT lead_id FROM sales_call_logs WHERE idempotency_key = $1
    `, [idempotencyKey]);
    if (repeated.rows[0]) {
      if (repeated.rows[0].lead_id !== leadId) throw new AppError(409, 'idempotency_key_reused', 'Idempotency key was used for another Call Log.');
      return loadLeadDetail(client, leadId);
    }

    const leadResult = await client.query<LeadRow>(`${leadSelect} WHERE lead.id = $1 FOR UPDATE OF lead`, [leadId]);
    const lead = leadResult.rows[0];
    if (!lead || lead.current_assignee_membership_id !== context.membershipId) {
      throw new AppError(404, 'sales_lead_not_found', 'Sales Lead was not found in your active queue.');
    }
    if (terminalStatuses.includes(lead.status)) {
      throw new AppError(409, 'sales_lead_terminal', 'A terminal Sales Lead cannot receive another Call Log.');
    }

    const startedAt = new Date(input.startedAt);
    if (startedAt.getTime() > Date.now() + 5 * 60_000) {
      throw new AppError(400, 'call_start_invalid', 'Call start time cannot be in the future.');
    }
    const policy = await loadPolicy(client);
    const effective = policy.effective_call_outcomes.includes(input.outcome);
    const existingRelationship = await client.query<RelationshipRow>(`
      SELECT id, owner_membership_id, lock_mode, lock_expires_at
      FROM sales_customer_relationships WHERE customer_id = $1 FOR UPDATE
    `, [lead.customer_id]);
    const relationshipBefore = existingRelationship.rows[0];
    if (
      effective && relationshipBefore && relationshipLockIsActive(relationshipBefore)
      && relationshipBefore.owner_membership_id !== context.membershipId
    ) {
      throw new AppError(409, 'customer_relationship_locked', 'Customer relationship is locked to another Sales member. A manager must reassign it.');
    }

    const callId = randomUUID();
    await client.query(`
      INSERT INTO sales_call_logs(
        id, workspace_id, company_id, lead_id, customer_identity_id, customer_id,
        salesperson_membership_id, actor_user_account_id, campaign_reference, context_snapshot,
        started_at, outcome, effective, note, callback_at, idempotency_key
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    `, [
      callId, context.workspace.id, company.id, lead.id, lead.customer_identity_id, lead.customer_id,
      context.membershipId, session.userAccountId, lead.campaign_reference,
      JSON.stringify({ ...lead.context_snapshot, ...input.context }), input.startedAt, input.outcome,
      effective, input.note ?? null, input.callbackAt ?? null, idempotencyKey,
    ]);

    const nextStatus = outcomeStatus[input.outcome] ?? (lead.status === 'new' ? 'pending_action' : lead.status);
    const releaseFailedAssignment = !effective && policy.failed_call_releases_assignment;
    await client.query(`
      UPDATE sales_leads SET status = $2, first_attempt_at = COALESCE(first_attempt_at, now()),
        first_effective_contact_at = CASE WHEN $3 THEN COALESCE(first_effective_contact_at, now()) ELSE first_effective_contact_at END,
        last_call_outcome = $4, action_deadline = CASE WHEN $4 = 'callback_requested' THEN $5 ELSE action_deadline END,
        current_assignee_membership_id = CASE WHEN $6 THEN NULL ELSE current_assignee_membership_id END,
        updated_at = now(), version = version + 1
      WHERE id = $1
    `, [lead.id, nextStatus, effective, input.outcome, input.callbackAt ?? null, releaseFailedAssignment]);

    let relationshipEvent: 'relationship_created' | 'lock_acquired' | 'lock_refreshed' | null = null;
    let relationshipId: string | null = null;
    if (effective) {
      const lockOwner = policy.relationship_lock_mode === 'none' ? null : context.membershipId;
      const lockExpiresAt = policy.relationship_lock_mode === 'duration'
        ? new Date(Date.now() + policy.relationship_lock_duration_minutes! * 60_000).toISOString()
        : null;
      if (!relationshipBefore) {
        relationshipId = randomUUID();
        await client.query(`
          INSERT INTO sales_customer_relationships(
            id, workspace_id, company_id, customer_identity_id, customer_id, owner_membership_id,
            lock_mode, lock_acquired_at, lock_expires_at, latest_effective_call_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, CASE WHEN $7 = 'none' THEN NULL ELSE now() END, $8, $9)
        `, [
          relationshipId, context.workspace.id, company.id, lead.customer_identity_id, lead.customer_id,
          lockOwner, policy.relationship_lock_mode, lockExpiresAt, callId,
        ]);
        relationshipEvent = policy.relationship_lock_mode === 'none' ? 'relationship_created' : 'lock_acquired';
      } else {
        relationshipId = relationshipBefore.id;
        await client.query(`
          UPDATE sales_customer_relationships SET status = 'active', owner_membership_id = $2,
            lock_mode = $3, lock_acquired_at = CASE WHEN $3 = 'none' THEN NULL ELSE now() END,
            lock_expires_at = $4, latest_effective_call_id = $5, updated_at = now(), version = version + 1
          WHERE id = $1
        `, [relationshipBefore.id, lockOwner, policy.relationship_lock_mode, lockExpiresAt, callId]);
        relationshipEvent = policy.relationship_lock_mode === 'none' ? 'relationship_created' : 'lock_refreshed';
      }
      await client.query(`
        INSERT INTO sales_customer_relationship_events(
          workspace_id, company_id, relationship_id, lead_id, call_log_id, actor_user_account_id,
          event_type, previous_owner_membership_id, new_owner_membership_id, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        context.workspace.id, company.id, relationshipId, lead.id, callId, session.userAccountId,
        relationshipEvent, relationshipBefore?.owner_membership_id ?? null, lockOwner,
        JSON.stringify({ policyVersion: policy.version, outcome: input.outcome }),
      ]);
    }

    await client.query(`
      INSERT INTO sales_lead_timeline_events(
        workspace_id, company_id, lead_id, actor_user_account_id, event_type, summary, metadata
      ) VALUES ($1, $2, $3, $4, 'call_logged', $5, $6)
    `, [
      context.workspace.id, company.id, lead.id, session.userAccountId,
      effective ? 'تماس مؤثر ثبت و رابطهٔ فروش به‌روزرسانی شد.' : 'تلاش تماس ثبت شد؛ رابطه یا lock دائمی ایجاد نشد.',
      JSON.stringify({ callId, outcome: input.outcome, effective, policyVersion: policy.version, relationshipEvent }),
    ]);
    await client.query(`
      INSERT INTO customer_timeline_events(
        workspace_id, company_id, customer_id, actor_user_account_id, event_type, summary, metadata
      ) VALUES ($1, $2, $3, $4, 'sales_call_logged', $5, $6)
    `, [
      context.workspace.id, company.id, lead.customer_id, session.userAccountId,
      effective ? 'تماس مؤثر فروش ثبت شد.' : 'تلاش تماس فروش ثبت شد.',
      JSON.stringify({
        callId, leadId: lead.id, outcome: input.outcome, effective,
        companyId: company.id, salespersonMembershipId: context.membershipId,
        campaignReference: lead.campaign_reference, context: { ...lead.context_snapshot, ...input.context },
      }),
    ]);
    await appendAuditEntry(client, {
      workspaceId: context.workspace.id, companyId: company.id, actorUserAccountId: session.userAccountId,
      action: 'sales.call.logged', resourceType: 'sales_call_log', resourceId: callId, result: 'success',
      previousState: { leadStatus: lead.status, assigneeMembershipId: lead.current_assignee_membership_id },
      newState: {
        leadStatus: nextStatus, outcome: input.outcome, effective, relationshipId,
        assigneeMembershipId: releaseFailedAssignment ? null : lead.current_assignee_membership_id,
      }, correlationId,
    });
    return loadLeadDetail(client, lead.id);
  });
}
