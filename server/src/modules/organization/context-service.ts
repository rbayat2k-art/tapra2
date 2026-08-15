import { query } from '../../infrastructure/database/pool.js';
import { AppError } from '../../shared/errors.js';
import type { MembershipContext, OrganizationScopeType, SessionView } from '../identity/types.js';

interface MembershipRow {
  membership_id: string;
  person_id: string;
  workspace_id: string;
  workspace_name: string;
  workspace_slug: string;
  company_id: string | null;
  company_name: string | null;
  company_code: string | null;
}

interface CompanyRow {
  workspace_id: string;
  id: string;
  name: string;
  code: string;
}

interface AssignmentRow {
  membership_id: string;
  role_id: string;
  role_code: string;
  role_name: string;
  scope_type: OrganizationScopeType;
  company_id: string | null;
  organization_unit_id: string | null;
  unit_type: 'BRANCH' | 'DEPARTMENT' | 'TEAM' | null;
  unit_name: string | null;
  unit_code: string | null;
  permissions: string[] | null;
}

interface ContextCandidate {
  membership: MembershipRow;
  scopeType: OrganizationScopeType;
  scopeId: string;
  company: CompanyRow | null;
  unit: AssignmentRow | null;
}

function contextKey(membershipId: string, scopeType: OrganizationScopeType, scopeId: string): string {
  return `${membershipId}:${scopeType}:${scopeId}`;
}

function assignmentApplies(assignment: AssignmentRow, candidate: ContextCandidate): boolean {
  if (assignment.scope_type === 'WORKSPACE') return true;
  if (assignment.scope_type === 'COMPANY') return assignment.company_id === candidate.company?.id;
  if (assignment.scope_type === 'SELF') return candidate.scopeType === 'SELF';
  return assignment.organization_unit_id === candidate.unit?.organization_unit_id;
}

export async function getMembershipContexts(userAccountId: string): Promise<MembershipContext[]> {
  const membershipsResult = await query<MembershipRow>(`
    SELECT m.id AS membership_id, m.person_id, w.id AS workspace_id, w.name AS workspace_name,
      w.slug AS workspace_slug, c.id AS company_id, c.name AS company_name, c.code AS company_code
    FROM user_accounts account
    JOIN memberships m ON m.person_id = account.person_id
    JOIN workspaces w ON w.id = m.workspace_id
    LEFT JOIN companies c ON c.id = m.company_id AND c.workspace_id = m.workspace_id AND c.is_active = true
    WHERE account.id = $1 AND account.is_active = true AND m.status = 'active'
      AND m.valid_from <= now() AND (m.valid_until IS NULL OR m.valid_until > now())
    ORDER BY w.name, c.name NULLS FIRST, m.id
  `, [userAccountId]);

  if (membershipsResult.rows.length === 0) return [];

  const companiesResult = await query<CompanyRow>(`
    SELECT DISTINCT company.workspace_id, company.id, company.name, company.code
    FROM companies company
    JOIN memberships membership ON membership.workspace_id = company.workspace_id
    JOIN user_accounts account ON account.person_id = membership.person_id
    WHERE account.id = $1 AND company.is_active = true
    ORDER BY company.name, company.id
  `, [userAccountId]);

  const assignmentsResult = await query<AssignmentRow>(`
    SELECT assignment.membership_id, role.id AS role_id, role.code AS role_code, role.name AS role_name,
      assignment.scope_type, assignment.company_id, assignment.organization_unit_id,
      unit.unit_type, unit.name AS unit_name, unit.code AS unit_code,
      COALESCE(array_agg(DISTINCT permission.code) FILTER (WHERE permission.code IS NOT NULL), '{}') AS permissions
    FROM user_accounts account
    JOIN memberships membership ON membership.person_id = account.person_id
    JOIN role_assignments assignment ON assignment.membership_id = membership.id
      AND assignment.workspace_id = membership.workspace_id
    JOIN roles role ON role.id = assignment.role_id AND role.workspace_id = assignment.workspace_id
    LEFT JOIN role_permissions role_permission ON role_permission.role_id = role.id
    LEFT JOIN permissions permission ON permission.code = role_permission.permission_code
    LEFT JOIN organization_units unit ON unit.id = assignment.organization_unit_id
      AND unit.workspace_id = assignment.workspace_id AND unit.is_active = true
    WHERE account.id = $1 AND membership.status = 'active' AND role.is_active = true
      AND (assignment.valid_until IS NULL OR assignment.valid_until > now())
    GROUP BY assignment.membership_id, role.id, role.code, role.name, assignment.scope_type,
      assignment.company_id, assignment.organization_unit_id, unit.unit_type, unit.name, unit.code
  `, [userAccountId]);

  const companiesByWorkspace = new Map<string, CompanyRow[]>();
  for (const company of companiesResult.rows) {
    companiesByWorkspace.set(company.workspace_id, [...(companiesByWorkspace.get(company.workspace_id) ?? []), company]);
  }
  const assignmentsByMembership = new Map<string, AssignmentRow[]>();
  for (const assignment of assignmentsResult.rows) {
    assignmentsByMembership.set(assignment.membership_id, [
      ...(assignmentsByMembership.get(assignment.membership_id) ?? []), assignment,
    ]);
  }

  const candidates = new Map<string, ContextCandidate>();
  const addCandidate = (candidate: ContextCandidate) => {
    candidates.set(contextKey(candidate.membership.membership_id, candidate.scopeType, candidate.scopeId), candidate);
  };

  for (const membership of membershipsResult.rows) {
    const workspaceCompanies = companiesByWorkspace.get(membership.workspace_id) ?? [];
    const membershipCompany = membership.company_id
      ? workspaceCompanies.find((company) => company.id === membership.company_id) ?? null
      : null;
    const assignments = assignmentsByMembership.get(membership.membership_id) ?? [];

    if (membershipCompany) {
      addCandidate({ membership, scopeType: 'COMPANY', scopeId: membershipCompany.id, company: membershipCompany, unit: null });
    }

    for (const assignment of assignments) {
      if (assignment.scope_type === 'WORKSPACE') {
        addCandidate({ membership, scopeType: 'WORKSPACE', scopeId: membership.workspace_id, company: null, unit: null });
        for (const company of workspaceCompanies) {
          addCandidate({ membership, scopeType: 'COMPANY', scopeId: company.id, company, unit: null });
        }
      } else if (assignment.scope_type === 'COMPANY' && assignment.company_id) {
        const company = workspaceCompanies.find((item) => item.id === assignment.company_id);
        if (company) addCandidate({ membership, scopeType: 'COMPANY', scopeId: company.id, company, unit: null });
      } else if (['BRANCH', 'DEPARTMENT', 'TEAM'].includes(assignment.scope_type)
        && assignment.organization_unit_id && assignment.company_id && assignment.unit_type) {
        const company = workspaceCompanies.find((item) => item.id === assignment.company_id);
        if (company) addCandidate({
          membership, scopeType: assignment.scope_type, scopeId: assignment.organization_unit_id,
          company, unit: assignment,
        });
      } else if (assignment.scope_type === 'SELF') {
        const company = assignment.company_id
          ? workspaceCompanies.find((item) => item.id === assignment.company_id) ?? null
          : membershipCompany;
        addCandidate({ membership, scopeType: 'SELF', scopeId: membership.person_id, company, unit: null });
      }
    }

    if (!membershipCompany && assignments.length === 0) {
      addCandidate({ membership, scopeType: 'WORKSPACE', scopeId: membership.workspace_id, company: null, unit: null });
    }
  }

  return [...candidates.values()].map((candidate) => {
    const applicable = (assignmentsByMembership.get(candidate.membership.membership_id) ?? [])
      .filter((assignment) => assignmentApplies(assignment, candidate));
    return {
      contextKey: contextKey(candidate.membership.membership_id, candidate.scopeType, candidate.scopeId),
      membershipId: candidate.membership.membership_id,
      workspace: {
        id: candidate.membership.workspace_id,
        name: candidate.membership.workspace_name,
        slug: candidate.membership.workspace_slug,
      },
      company: candidate.company ? { id: candidate.company.id, name: candidate.company.name, code: candidate.company.code } : null,
      organizationUnit: candidate.unit?.organization_unit_id && candidate.unit.unit_type
        && candidate.unit.unit_name && candidate.unit.unit_code
        ? {
          id: candidate.unit.organization_unit_id,
          type: candidate.unit.unit_type,
          name: candidate.unit.unit_name,
          code: candidate.unit.unit_code,
        }
        : null,
      scope: { type: candidate.scopeType, id: candidate.scopeId },
      roles: applicable.map((assignment) => ({
        id: assignment.role_id, code: assignment.role_code, name: assignment.role_name,
      })).filter((role, index, roles) => roles.findIndex((item) => item.id === role.id) === index),
      permissions: [...new Set(applicable.flatMap((assignment) => assignment.permissions ?? []))].sort(),
    };
  }).sort((left, right) => left.workspace.name.localeCompare(right.workspace.name)
    || (left.company ? 0 : 1) - (right.company ? 0 : 1)
    || (left.company?.name ?? '').localeCompare(right.company?.name ?? '')
    || left.scope.type.localeCompare(right.scope.type));
}

export async function buildSessionView(session: {
  userAccountId: string;
  personId: string;
  fullName: string;
  email: string;
  csrfToken: string;
  activeMembershipId: string | null;
  activeScopeType: OrganizationScopeType | null;
  activeScopeId: string | null;
  actorUserAccountId: string;
  actorPersonId: string;
  actorFullName: string;
  actorEmail: string;
  actorMembershipId: string | null;
  actorScopeType: OrganizationScopeType | null;
  actorScopeId: string | null;
  impersonationId: string | null;
  impersonationReason: string | null;
  impersonationExpiresAt: string | null;
}): Promise<SessionView> {
  let memberships = await getMembershipContexts(session.userAccountId);
  if (session.impersonationId) {
    const actorContexts = await getMembershipContexts(session.actorUserAccountId);
    const actorContext = actorContexts.find((context) => context.membershipId === session.actorMembershipId
      && context.scope.type === session.actorScopeType && context.scope.id === session.actorScopeId);
    memberships = actorContext
      ? memberships.flatMap((context) => {
        try { return [limitContextToActor(context, actorContext)]; } catch { return []; }
      })
      : [];
  }
  return {
    user: {
      id: session.userAccountId,
      personId: session.personId,
      fullName: session.fullName,
      email: session.email,
    },
    actor: {
      id: session.actorUserAccountId,
      personId: session.actorPersonId,
      fullName: session.actorFullName,
      email: session.actorEmail,
    },
    impersonation: session.impersonationId && session.impersonationReason && session.impersonationExpiresAt
      ? { id: session.impersonationId, reason: session.impersonationReason, expiresAt: session.impersonationExpiresAt }
      : null,
    memberships,
    activeContext: memberships.find((membership) => membership.membershipId === session.activeMembershipId
      && membership.scope.type === session.activeScopeType && membership.scope.id === session.activeScopeId) ?? null,
    csrfToken: session.csrfToken,
  };
}

export function limitContextToActor(target: MembershipContext, actor: MembershipContext): MembershipContext {
  if (target.workspace.id !== actor.workspace.id) {
    throw new AppError(403, 'impersonation_scope_forbidden', 'Target context is outside the administrator Workspace.');
  }
  if (actor.scope.type === 'SELF') {
    throw new AppError(403, 'impersonation_scope_forbidden', 'SELF scope cannot impersonate another UserAccount.');
  }
  if (actor.scope.type === 'COMPANY' && target.company?.id !== actor.company?.id) {
    throw new AppError(403, 'impersonation_scope_forbidden', 'Target context is outside the administrator Company.');
  }
  if (['BRANCH', 'DEPARTMENT', 'TEAM'].includes(actor.scope.type)
    && (target.scope.type !== actor.scope.type || target.scope.id !== actor.scope.id)) {
    throw new AppError(403, 'impersonation_scope_forbidden', 'Target context is outside the administrator Organization unit.');
  }
  const actorPermissions = new Set(actor.permissions);
  return { ...target, permissions: target.permissions.filter((permission) => actorPermissions.has(permission)) };
}

export async function assertMembershipAvailable(
  userAccountId: string,
  membershipId: string,
  scopeType?: OrganizationScopeType,
  scopeId?: string,
): Promise<MembershipContext> {
  const contexts = (await getMembershipContexts(userAccountId))
    .filter((item) => item.membershipId === membershipId);
  const exact = scopeType && scopeId
    ? contexts.find((item) => item.scope.type === scopeType && item.scope.id === scopeId)
    : undefined;
  const compatible = exact ?? (contexts.length === 1 ? contexts[0] : undefined)
    ?? contexts.find((item) => item.scope.type === 'COMPANY');
  if (!compatible) {
    throw new AppError(403, 'membership_forbidden', 'The selected organizational context is not available.');
  }
  return compatible;
}
