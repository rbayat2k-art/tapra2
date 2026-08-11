import type { PoolClient } from 'pg';

export interface AuditMutation {
  workspaceId: string;
  companyId: string | null;
  actorUserAccountId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  result: 'success' | 'failure';
  reason?: string;
  previousState?: unknown;
  newState?: unknown;
  correlationId: string;
}

export async function appendAuditEntry(client: PoolClient, entry: AuditMutation): Promise<void> {
  await client.query(`
    INSERT INTO audit_entries(
      workspace_id, company_id, actor_user_account_id, action, resource_type,
      resource_id, result, reason, previous_state, new_state, correlation_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
  `, [
    entry.workspaceId,
    entry.companyId,
    entry.actorUserAccountId,
    entry.action,
    entry.resourceType,
    entry.resourceId,
    entry.result,
    entry.reason ?? null,
    entry.previousState ? JSON.stringify(entry.previousState) : null,
    entry.newState ? JSON.stringify(entry.newState) : null,
    entry.correlationId,
  ]);
}
