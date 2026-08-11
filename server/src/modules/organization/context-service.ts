import { query } from '../../infrastructure/database/pool.js';
import { AppError } from '../../shared/errors.js';
import type { MembershipContext, SessionView } from '../identity/types.js';

interface ContextRow {
  membership_id: string;
  workspace_id: string;
  workspace_name: string;
  workspace_slug: string;
  company_id: string | null;
  company_name: string | null;
  company_code: string | null;
  permissions: string[] | null;
}

export async function getMembershipContexts(userAccountId: string): Promise<MembershipContext[]> {
  const result = await query<ContextRow>(`
    SELECT
      m.id AS membership_id,
      w.id AS workspace_id,
      w.name AS workspace_name,
      w.slug AS workspace_slug,
      c.id AS company_id,
      c.name AS company_name,
      c.code AS company_code,
      COALESCE(array_agg(DISTINCT p.code) FILTER (WHERE p.code IS NOT NULL), '{}') AS permissions
    FROM user_accounts ua
    JOIN memberships m ON m.person_id = ua.person_id
    JOIN workspaces w ON w.id = m.workspace_id
    LEFT JOIN companies c ON c.id = m.company_id AND c.workspace_id = m.workspace_id
    LEFT JOIN role_assignments ra ON ra.membership_id = m.id AND ra.workspace_id = m.workspace_id
    LEFT JOIN role_permissions rp ON rp.role_id = ra.role_id
    LEFT JOIN permissions p ON p.code = rp.permission_code
    WHERE ua.id = $1
      AND ua.is_active = true
      AND m.status = 'active'
      AND m.valid_from <= now()
      AND (m.valid_until IS NULL OR m.valid_until > now())
    GROUP BY m.id, w.id, w.name, w.slug, c.id, c.name, c.code
    ORDER BY w.name, c.name NULLS FIRST
  `, [userAccountId]);

  return result.rows.map((row) => ({
    membershipId: row.membership_id,
    workspace: { id: row.workspace_id, name: row.workspace_name, slug: row.workspace_slug },
    company: row.company_id && row.company_name && row.company_code
      ? { id: row.company_id, name: row.company_name, code: row.company_code }
      : null,
    permissions: [...(row.permissions ?? [])].sort(),
  }));
}

export async function buildSessionView(session: {
  userAccountId: string;
  personId: string;
  fullName: string;
  email: string;
  csrfToken: string;
  activeMembershipId: string | null;
}): Promise<SessionView> {
  const memberships = await getMembershipContexts(session.userAccountId);
  return {
    user: {
      id: session.userAccountId,
      personId: session.personId,
      fullName: session.fullName,
      email: session.email,
    },
    memberships,
    activeContext: memberships.find((membership) => membership.membershipId === session.activeMembershipId) ?? null,
    csrfToken: session.csrfToken,
  };
}

export async function assertMembershipAvailable(userAccountId: string, membershipId: string): Promise<MembershipContext> {
  const membership = (await getMembershipContexts(userAccountId)).find((item) => item.membershipId === membershipId);
  if (!membership) throw new AppError(403, 'membership_forbidden', 'The selected organizational context is not available.');
  if (!membership.company) throw new AppError(409, 'company_context_required', 'A Company context is required for this operation.');
  return membership;
}
