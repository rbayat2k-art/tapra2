import { withWorkspaceTransaction } from '../../infrastructure/database/pool.js';
import { AppError } from '../../shared/errors.js';
import { appendAuditEntry } from '../audit/audit-service.js';
import type { AuthenticatedSession, MembershipContext, OrganizationScopeType } from '../identity/types.js';
import { assertMembershipAvailable, limitContextToActor } from './context-service.js';

export async function startImpersonation(input: {
  session: AuthenticatedSession;
  actorContext: MembershipContext;
  targetUserAccountId: string;
  targetMembershipId: string;
  targetScopeType: OrganizationScopeType;
  targetScopeId: string;
  reason: string;
  durationMinutes: number;
  correlationId: string;
}): Promise<string> {
  if (input.session.impersonationId) throw new AppError(409, 'nested_impersonation_forbidden', 'Nested impersonation is forbidden.');
  if (!input.session.activeMembershipId || !input.session.activeScopeType || !input.session.activeScopeId) {
    throw new AppError(409, 'active_context_required', 'Administrator context is required.');
  }
  if (input.targetUserAccountId === input.session.actorUserAccountId) {
    throw new AppError(409, 'impersonation_self_forbidden', 'An administrator cannot impersonate the same account.');
  }
  const target = await assertMembershipAvailable(
    input.targetUserAccountId, input.targetMembershipId, input.targetScopeType, input.targetScopeId,
  );
  const cappedTarget = limitContextToActor(target, input.actorContext);
  if (cappedTarget.permissions.length === 0) {
    throw new AppError(403, 'impersonation_no_shared_permissions', 'Administrator and target have no shared permissions in this context.');
  }

  return withWorkspaceTransaction({
    workspaceId: input.actorContext.workspace.id,
    companyId: input.actorContext.company?.id ?? null,
  }, async (client) => {
    await client.query(`
      UPDATE session_impersonations
      SET ended_at = now(), ended_by_user_account_id = actor_user_account_id, end_reason = 'expired'
      WHERE session_id = $1 AND ended_at IS NULL AND expires_at <= now()
    `, [input.session.sessionId]);
    const result = await client.query<{ id: string }>(`
      INSERT INTO session_impersonations(
        session_id, workspace_id, actor_user_account_id, actor_membership_id, actor_scope_type, actor_scope_id,
        target_user_account_id, target_membership_id, target_scope_type, target_scope_id, reason, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now() + ($12 * interval '1 minute'))
      RETURNING id
    `, [
      input.session.sessionId, input.actorContext.workspace.id, input.session.actorUserAccountId,
      input.session.activeMembershipId, input.session.activeScopeType, input.session.activeScopeId,
      input.targetUserAccountId, input.targetMembershipId, input.targetScopeType, input.targetScopeId,
      input.reason, input.durationMinutes,
    ]);
    const impersonationId = result.rows[0]!.id;
    await appendAuditEntry(client, {
      workspaceId: input.actorContext.workspace.id,
      companyId: input.actorContext.scope.type === 'WORKSPACE' ? null : input.actorContext.company?.id ?? null,
      actorUserAccountId: input.session.actorUserAccountId,
      effectiveUserAccountId: input.targetUserAccountId,
      impersonationId,
      action: 'security.impersonation.started',
      resourceType: 'session_impersonation',
      resourceId: impersonationId,
      result: 'success',
      reason: input.reason,
      newState: {
        targetUserAccountId: input.targetUserAccountId,
        targetScopeType: input.targetScopeType,
        targetScopeId: input.targetScopeId,
        durationMinutes: input.durationMinutes,
      },
      correlationId: input.correlationId,
    });
    return impersonationId;
  });
}

export async function stopImpersonation(input: {
  session: AuthenticatedSession;
  activeContext: MembershipContext;
  reason: string;
  correlationId: string;
}): Promise<void> {
  if (!input.session.impersonationId) throw new AppError(409, 'impersonation_not_active', 'No active impersonation session exists.');
  const impersonationId = input.session.impersonationId;
  await withWorkspaceTransaction({
    workspaceId: input.activeContext.workspace.id,
    companyId: input.activeContext.company?.id ?? null,
  }, async (client) => {
    const result = await client.query(`
      UPDATE session_impersonations
      SET ended_at = now(), ended_by_user_account_id = $2, end_reason = $3
      WHERE id = $1 AND actor_user_account_id = $2 AND ended_at IS NULL
      RETURNING id
    `, [impersonationId, input.session.actorUserAccountId, input.reason]);
    if (!result.rowCount) throw new AppError(409, 'impersonation_not_active', 'No active impersonation session exists.');
    await appendAuditEntry(client, {
      workspaceId: input.activeContext.workspace.id,
      companyId: input.activeContext.company?.id ?? null,
      actorUserAccountId: input.session.actorUserAccountId,
      effectiveUserAccountId: input.session.userAccountId,
      impersonationId,
      action: 'security.impersonation.ended',
      resourceType: 'session_impersonation',
      resourceId: impersonationId,
      result: 'success',
      reason: input.reason,
      correlationId: input.correlationId,
    });
  });
}
