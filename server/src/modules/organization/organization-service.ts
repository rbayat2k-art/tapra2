import { randomBytes } from 'node:crypto';
import type { PoolClient } from 'pg';
import { withWorkspaceTransaction } from '../../infrastructure/database/pool.js';
import { AppError } from '../../shared/errors.js';
import { appendAuditEntry } from '../audit/audit-service.js';
import { hashPassword } from '../identity/password.js';
import type { AuthenticatedSession, MembershipContext, OrganizationScopeType } from '../identity/types.js';

interface MutationContext {
  context: MembershipContext;
  session: AuthenticatedSession;
  correlationId: string;
}

interface CompanyInput { code: string; name: string; description?: string; isActive?: boolean }
interface UnitInput {
  companyId?: string;
  parentId?: string;
  type: 'BRANCH' | 'DEPARTMENT' | 'TEAM' | 'SHARED_SERVICE';
  code: string;
  name: string;
  description?: string;
  serviceKind?: 'HR' | 'DATA' | 'MIS' | 'OTHER';
  isActive?: boolean;
}

function isWorkspaceScope(context: MembershipContext): boolean {
  return context.scope.type === 'WORKSPACE';
}

function assertCompanyScope(context: MembershipContext, companyId: string): void {
  if (isWorkspaceScope(context)) return;
  if (context.company?.id !== companyId) {
    throw new AppError(403, 'organization_scope_forbidden', 'The target Company is outside the active access scope.');
  }
}

function assertWorkspaceScope(context: MembershipContext): void {
  if (!isWorkspaceScope(context)) {
    throw new AppError(403, 'workspace_scope_required', 'A Workspace-level context is required.');
  }
}

function auditCompany(context: MembershipContext, companyId: string | null): string | null {
  return isWorkspaceScope(context) ? null : companyId;
}

async function audit(
  client: PoolClient,
  mutation: MutationContext,
  entry: { action: string; resourceType: string; resourceId: string; companyId?: string | null; previousState?: unknown; newState?: unknown; reason?: string },
): Promise<void> {
  await appendAuditEntry(client, {
    workspaceId: mutation.context.workspace.id,
    companyId: auditCompany(mutation.context, entry.companyId ?? null),
    actorUserAccountId: mutation.session.userAccountId,
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId,
    result: 'success',
    reason: entry.reason,
    previousState: entry.previousState,
    newState: entry.newState,
    correlationId: mutation.correlationId,
  });
}

function translateConflict(error: unknown): never {
  if ((error as { code?: string }).code === '23505') {
    throw new AppError(409, 'organization_conflict', 'An Organization record with the same unique value already exists.');
  }
  throw error;
}

export async function readOrganization(context: MembershipContext, userAccountId: string) {
  const workspaceId = context.workspace.id;
  const companyId = context.company?.id ?? null;
  return withWorkspaceTransaction({ workspaceId, companyId }, async (client) => {
    const workspaceWide = isWorkspaceScope(context);
    const unitScoped = ['BRANCH', 'DEPARTMENT', 'TEAM'].includes(context.scope.type);
    const companies = await client.query(`
      SELECT id, code, name, description, is_active AS "isActive", created_at AS "createdAt", updated_at AS "updatedAt"
      FROM companies
      WHERE workspace_id = $1 AND ($2::boolean OR id = $3::uuid)
      ORDER BY name, id
    `, [workspaceId, workspaceWide, companyId]);
    const units = await client.query(`
      SELECT id, company_id AS "companyId", parent_id AS "parentId", unit_type AS type,
        code, name, description, service_kind AS "serviceKind", is_active AS "isActive",
        created_at AS "createdAt", updated_at AS "updatedAt"
      FROM organization_units
      WHERE workspace_id = $1 AND (
        $2::boolean
        OR ($4::boolean AND id = $5::uuid)
        OR (NOT $4::boolean AND company_id = $3::uuid)
      )
      ORDER BY unit_type, name, id
    `, [workspaceId, workspaceWide, companyId, unitScoped, unitScoped ? context.scope.id : null]);

    const memberships = await client.query(`
      SELECT membership.id, membership.company_id AS "companyId", membership.person_id AS "personId",
        membership.status, membership.valid_from AS "validFrom", membership.valid_until AS "validUntil"
      FROM memberships membership
      WHERE membership.workspace_id = $1 AND (
        $2::boolean
        OR membership.person_id = (SELECT person_id FROM user_accounts WHERE id = $4)
        OR membership.company_id = $3::uuid
        OR EXISTS (
          SELECT 1 FROM role_assignments assignment
          WHERE assignment.membership_id = membership.id
            AND (assignment.scope_type = 'WORKSPACE' OR assignment.company_id = $3::uuid
              OR assignment.organization_unit_id = $5::uuid)
        )
      )
      ORDER BY membership.created_at, membership.id
    `, [workspaceId, workspaceWide, companyId, userAccountId, unitScoped ? context.scope.id : null]);
    const visiblePersonIds = memberships.rows.map((membership) => membership.personId as string);
    const users = visiblePersonIds.length === 0 ? { rows: [] } : await client.query(`
      SELECT account.id, account.person_id AS "personId", person.full_name AS "fullName", account.email,
        account.is_active AS "isActive", account.requires_password_change AS "requiresPasswordChange",
        account.created_at AS "createdAt", account.updated_at AS "updatedAt"
      FROM user_accounts account JOIN persons person ON person.id = account.person_id
      WHERE account.person_id = ANY($1::uuid[])
      ORDER BY person.full_name, account.id
    `, [visiblePersonIds]);
    const visibleMembershipIds = memberships.rows.map((membership) => membership.id as string);
    const assignments = visibleMembershipIds.length === 0 ? { rows: [] } : await client.query(`
      SELECT assignment.id, assignment.membership_id AS "membershipId", assignment.role_id AS "roleId",
        assignment.scope_type AS "scopeType", assignment.company_id AS "companyId",
        assignment.organization_unit_id AS "organizationUnitId", assignment.valid_until AS "validUntil",
        assignment.assigned_at AS "assignedAt"
      FROM role_assignments assignment
      WHERE assignment.workspace_id = $1 AND assignment.membership_id = ANY($2::uuid[])
        AND ($3::boolean OR assignment.scope_type = 'WORKSPACE' OR assignment.company_id = $4::uuid
          OR assignment.organization_unit_id = $5::uuid)
      ORDER BY assignment.assigned_at, assignment.id
    `, [workspaceId, visibleMembershipIds, workspaceWide, companyId, unitScoped ? context.scope.id : null]);
    const roles = await client.query(`
      SELECT role.id, role.code, role.name, role.description, role.is_system AS "isSystem",
        role.is_active AS "isActive", COALESCE(array_agg(permission.code ORDER BY permission.code)
          FILTER (WHERE permission.code IS NOT NULL), '{}') AS permissions
      FROM roles role
      LEFT JOIN role_permissions role_permission ON role_permission.role_id = role.id
      LEFT JOIN permissions permission ON permission.code = role_permission.permission_code
      WHERE role.workspace_id = $1
      GROUP BY role.id ORDER BY role.name, role.id
    `, [workspaceId]);
    const permissions = await client.query('SELECT code, description FROM permissions ORDER BY code');
    const legacyMappings = await client.query(`
      SELECT legacy_role_code AS "legacyRoleCode", role_id AS "roleId",
        migration_status AS "migrationStatus", notes
      FROM legacy_role_mappings WHERE workspace_id = $1 ORDER BY legacy_role_code
    `, [workspaceId]);
    return {
      workspace: context.workspace,
      activeScope: context.scope,
      companies: companies.rows,
      units: units.rows,
      users: users.rows,
      memberships: memberships.rows,
      roles: roles.rows,
      assignments: assignments.rows,
      permissions: permissions.rows,
      legacyRoleMappings: legacyMappings.rows,
    };
  });
}

export async function createCompany(mutation: MutationContext, input: CompanyInput) {
  assertWorkspaceScope(mutation.context);
  try {
    return await withWorkspaceTransaction({ workspaceId: mutation.context.workspace.id, companyId: null }, async (client) => {
      const result = await client.query(`
        INSERT INTO companies(workspace_id, code, name, description, is_active)
        VALUES ($1, upper($2), $3, $4, $5) RETURNING id, code, name, description, is_active AS "isActive"
      `, [mutation.context.workspace.id, input.code, input.name, input.description ?? null, input.isActive ?? true]);
      const company = result.rows[0];
      await audit(client, mutation, { action: 'organization.company.created', resourceType: 'company', resourceId: company.id, newState: company });
      return company;
    });
  } catch (error) { return translateConflict(error); }
}

export async function updateCompany(mutation: MutationContext, companyId: string, input: CompanyInput) {
  assertCompanyScope(mutation.context, companyId);
  try {
    return await withWorkspaceTransaction({ workspaceId: mutation.context.workspace.id, companyId: mutation.context.company?.id ?? null }, async (client) => {
      const previous = await client.query('SELECT code, name, description, is_active AS "isActive" FROM companies WHERE workspace_id = $1 AND id = $2', [mutation.context.workspace.id, companyId]);
      if (!previous.rowCount) throw new AppError(404, 'company_not_found', 'Company was not found.');
      const result = await client.query(`
        UPDATE companies SET code = upper($3), name = $4, description = $5, is_active = $6, updated_at = now()
        WHERE workspace_id = $1 AND id = $2
        RETURNING id, code, name, description, is_active AS "isActive"
      `, [mutation.context.workspace.id, companyId, input.code, input.name, input.description ?? null, input.isActive ?? true]);
      await audit(client, mutation, { action: 'organization.company.updated', resourceType: 'company', resourceId: companyId, companyId, previousState: previous.rows[0], newState: result.rows[0] });
      return result.rows[0];
    });
  } catch (error) { return translateConflict(error); }
}

async function validateUnitTarget(client: PoolClient, mutation: MutationContext, input: UnitInput): Promise<void> {
  if (input.type === 'SHARED_SERVICE') {
    assertWorkspaceScope(mutation.context);
    if (input.companyId || !input.serviceKind) throw new AppError(400, 'shared_service_scope_invalid', 'Shared Services belong to the Workspace and require serviceKind.');
  } else {
    if (!input.companyId) throw new AppError(400, 'company_required', 'Company is required for this Organization unit.');
    assertCompanyScope(mutation.context, input.companyId);
    const company = await client.query('SELECT 1 FROM companies WHERE workspace_id = $1 AND id = $2', [mutation.context.workspace.id, input.companyId]);
    if (!company.rowCount) throw new AppError(404, 'company_not_found', 'Company was not found.');
  }
  if (input.parentId) {
    const parent = await client.query<{ company_id: string | null }>('SELECT company_id FROM organization_units WHERE workspace_id = $1 AND id = $2', [mutation.context.workspace.id, input.parentId]);
    if (!parent.rowCount || parent.rows[0]?.company_id !== (input.companyId ?? null)) {
      throw new AppError(400, 'organization_parent_invalid', 'Parent unit must belong to the same Workspace/Company scope.');
    }
  }
}

export async function createUnit(mutation: MutationContext, input: UnitInput) {
  try {
    return await withWorkspaceTransaction({ workspaceId: mutation.context.workspace.id, companyId: mutation.context.company?.id ?? null }, async (client) => {
      await validateUnitTarget(client, mutation, input);
      const result = await client.query(`
        INSERT INTO organization_units(workspace_id, company_id, parent_id, unit_type, code, name, description, service_kind, is_active)
        VALUES ($1, $2, $3, $4, upper($5), $6, $7, $8, $9)
        RETURNING id, company_id AS "companyId", parent_id AS "parentId", unit_type AS type,
          code, name, description, service_kind AS "serviceKind", is_active AS "isActive"
      `, [mutation.context.workspace.id, input.companyId ?? null, input.parentId ?? null, input.type,
        input.code, input.name, input.description ?? null, input.serviceKind ?? null, input.isActive ?? true]);
      const unit = result.rows[0];
      await audit(client, mutation, { action: 'organization.unit.created', resourceType: 'organization_unit', resourceId: unit.id, companyId: input.companyId ?? null, newState: unit });
      return unit;
    });
  } catch (error) { return translateConflict(error); }
}

export async function updateUnit(mutation: MutationContext, unitId: string, input: UnitInput) {
  try {
    return await withWorkspaceTransaction({ workspaceId: mutation.context.workspace.id, companyId: mutation.context.company?.id ?? null }, async (client) => {
      await validateUnitTarget(client, mutation, input);
      const previous = await client.query('SELECT * FROM organization_units WHERE workspace_id = $1 AND id = $2', [mutation.context.workspace.id, unitId]);
      if (!previous.rowCount) throw new AppError(404, 'organization_unit_not_found', 'Organization unit was not found.');
      assertCompanyScope(mutation.context, previous.rows[0]?.company_id ?? input.companyId ?? '');
      const result = await client.query(`
        UPDATE organization_units SET company_id = $3, parent_id = $4, unit_type = $5, code = upper($6),
          name = $7, description = $8, service_kind = $9, is_active = $10, updated_at = now()
        WHERE workspace_id = $1 AND id = $2
        RETURNING id, company_id AS "companyId", parent_id AS "parentId", unit_type AS type,
          code, name, description, service_kind AS "serviceKind", is_active AS "isActive"
      `, [mutation.context.workspace.id, unitId, input.companyId ?? null, input.parentId ?? null, input.type,
        input.code, input.name, input.description ?? null, input.serviceKind ?? null, input.isActive ?? true]);
      await audit(client, mutation, { action: 'organization.unit.updated', resourceType: 'organization_unit', resourceId: unitId, companyId: input.companyId ?? null, previousState: previous.rows[0], newState: result.rows[0] });
      return result.rows[0];
    });
  } catch (error) { return translateConflict(error); }
}

export async function createUser(mutation: MutationContext, input: { fullName: string; email: string }) {
  assertWorkspaceScope(mutation.context);
  const temporaryPassword = randomBytes(24).toString('base64url');
  const passwordHash = await hashPassword(temporaryPassword);
  try {
    const account = await withWorkspaceTransaction({ workspaceId: mutation.context.workspace.id, companyId: null }, async (client) => {
      const person = await client.query<{ id: string }>('INSERT INTO persons(full_name) VALUES ($1) RETURNING id', [input.fullName]);
      const result = await client.query(`
        INSERT INTO user_accounts(person_id, email, password_hash, requires_password_change)
        VALUES ($1, $2, $3, true)
        RETURNING id, person_id AS "personId", email, is_active AS "isActive", requires_password_change AS "requiresPasswordChange"
      `, [person.rows[0]?.id, input.email, passwordHash]);
      await audit(client, mutation, { action: 'organization.user.created', resourceType: 'user_account', resourceId: result.rows[0]?.id, newState: { ...result.rows[0], fullName: input.fullName } });
      return { ...result.rows[0], fullName: input.fullName };
    });
    return { account, temporaryPassword };
  } catch (error) { return translateConflict(error); }
}

export async function updateUserStatus(mutation: MutationContext, userAccountId: string, isActive: boolean) {
  assertWorkspaceScope(mutation.context);
  if (userAccountId === mutation.session.userAccountId && !isActive) {
    throw new AppError(409, 'self_deactivation_forbidden', 'An administrator cannot deactivate the current account.');
  }
  return withWorkspaceTransaction({ workspaceId: mutation.context.workspace.id, companyId: null }, async (client) => {
    const previous = await client.query(`
      SELECT account.is_active AS "isActive" FROM user_accounts account
      WHERE account.id = $1 AND EXISTS (
        SELECT 1 FROM memberships membership WHERE membership.person_id = account.person_id AND membership.workspace_id = $2
      )
    `, [userAccountId, mutation.context.workspace.id]);
    if (!previous.rowCount) throw new AppError(404, 'user_account_not_found', 'UserAccount was not found in this Workspace.');
    const result = await client.query('UPDATE user_accounts SET is_active = $2, updated_at = now() WHERE id = $1 RETURNING id, is_active AS "isActive"', [userAccountId, isActive]);
    if (!isActive) await client.query('DELETE FROM sessions WHERE user_account_id = $1', [userAccountId]);
    await audit(client, mutation, { action: 'organization.user.status_changed', resourceType: 'user_account', resourceId: userAccountId, previousState: previous.rows[0], newState: result.rows[0] });
    return result.rows[0];
  });
}

export async function createMembership(mutation: MutationContext, input: { personId: string; companyId?: string }) {
  if (input.companyId) assertCompanyScope(mutation.context, input.companyId);
  else assertWorkspaceScope(mutation.context);
  try {
    return await withWorkspaceTransaction({ workspaceId: mutation.context.workspace.id, companyId: mutation.context.company?.id ?? null }, async (client) => {
      const person = await client.query('SELECT 1 FROM persons WHERE id = $1', [input.personId]);
      if (!person.rowCount) throw new AppError(404, 'person_not_found', 'Person was not found.');
      const result = await client.query(`
        INSERT INTO memberships(workspace_id, company_id, person_id)
        VALUES ($1, $2, $3)
        ON CONFLICT (workspace_id, company_id, person_id) DO UPDATE
          SET status = 'active', valid_until = NULL, updated_at = now()
        RETURNING id, company_id AS "companyId", person_id AS "personId", status
      `, [mutation.context.workspace.id, input.companyId ?? null, input.personId]);
      await audit(client, mutation, { action: 'organization.membership.upserted', resourceType: 'membership', resourceId: result.rows[0]?.id, companyId: input.companyId ?? null, newState: result.rows[0] });
      return result.rows[0];
    });
  } catch (error) { return translateConflict(error); }
}

export async function updateMembershipStatus(mutation: MutationContext, membershipId: string, status: 'active' | 'suspended' | 'ended') {
  return withWorkspaceTransaction({ workspaceId: mutation.context.workspace.id, companyId: mutation.context.company?.id ?? null }, async (client) => {
    const previous = await client.query('SELECT company_id, status FROM memberships WHERE workspace_id = $1 AND id = $2', [mutation.context.workspace.id, membershipId]);
    if (!previous.rowCount) throw new AppError(404, 'membership_not_found', 'Membership was not found.');
    const companyId = previous.rows[0]?.company_id as string | null;
    if (companyId) assertCompanyScope(mutation.context, companyId); else assertWorkspaceScope(mutation.context);
    const result = await client.query(`
      UPDATE memberships SET status = $3, updated_at = now(), valid_until = CASE WHEN $3 = 'ended' THEN now() ELSE valid_until END
      WHERE workspace_id = $1 AND id = $2 RETURNING id, company_id AS "companyId", person_id AS "personId", status
    `, [mutation.context.workspace.id, membershipId, status]);
    await audit(client, mutation, { action: 'organization.membership.status_changed', resourceType: 'membership', resourceId: membershipId, companyId, previousState: previous.rows[0], newState: result.rows[0] });
    return result.rows[0];
  });
}

export async function createRole(mutation: MutationContext, input: { code: string; name: string; description?: string; permissionCodes: string[] }) {
  assertWorkspaceScope(mutation.context);
  try {
    return await withWorkspaceTransaction({ workspaceId: mutation.context.workspace.id, companyId: null }, async (client) => {
      const role = await client.query(`
        INSERT INTO roles(workspace_id, code, name, description) VALUES ($1, lower($2), $3, $4)
        RETURNING id, code, name, description
      `, [mutation.context.workspace.id, input.code, input.name, input.description ?? null]);
      if (input.permissionCodes.length) {
        await client.query(`
          INSERT INTO role_permissions(role_id, permission_code)
          SELECT $1, code FROM permissions WHERE code = ANY($2::text[])
        `, [role.rows[0]?.id, input.permissionCodes]);
      }
      await audit(client, mutation, { action: 'organization.role.created', resourceType: 'role', resourceId: role.rows[0]?.id, newState: { ...role.rows[0], permissions: input.permissionCodes } });
      return { ...role.rows[0], permissions: input.permissionCodes };
    });
  } catch (error) { return translateConflict(error); }
}

function assignmentTarget(
  input: { scopeType: OrganizationScopeType; scopeId?: string },
  membershipCompanyId: string | null,
): { companyId: string | null; organizationUnitId: string | null } {
  if (input.scopeType === 'WORKSPACE') return { companyId: null, organizationUnitId: null };
  if (input.scopeType === 'COMPANY') return { companyId: input.scopeId ?? membershipCompanyId, organizationUnitId: null };
  if (['BRANCH', 'DEPARTMENT', 'TEAM'].includes(input.scopeType)) return { companyId: null, organizationUnitId: input.scopeId ?? null };
  return { companyId: membershipCompanyId, organizationUnitId: null };
}

export async function assignRole(mutation: MutationContext, input: { membershipId: string; roleId: string; scopeType: OrganizationScopeType; scopeId?: string; validUntil?: string }) {
  return withWorkspaceTransaction({ workspaceId: mutation.context.workspace.id, companyId: mutation.context.company?.id ?? null }, async (client) => {
    const membership = await client.query<{ company_id: string | null }>('SELECT company_id FROM memberships WHERE workspace_id = $1 AND id = $2', [mutation.context.workspace.id, input.membershipId]);
    if (!membership.rowCount) throw new AppError(404, 'membership_not_found', 'Membership was not found.');
    const role = await client.query('SELECT 1 FROM roles WHERE workspace_id = $1 AND id = $2 AND is_active = true', [mutation.context.workspace.id, input.roleId]);
    if (!role.rowCount) throw new AppError(404, 'role_not_found', 'Role was not found.');
    let target = assignmentTarget(input, membership.rows[0]?.company_id ?? null);
    if (['BRANCH', 'DEPARTMENT', 'TEAM'].includes(input.scopeType)) {
      const unit = await client.query<{ company_id: string; unit_type: string }>('SELECT company_id, unit_type FROM organization_units WHERE workspace_id = $1 AND id = $2 AND is_active = true', [mutation.context.workspace.id, target.organizationUnitId]);
      if (!unit.rowCount || unit.rows[0]?.unit_type !== input.scopeType) throw new AppError(400, 'assignment_scope_invalid', 'Organization unit does not match the requested Scope type.');
      target = { companyId: unit.rows[0]?.company_id, organizationUnitId: target.organizationUnitId };
    }
    if (input.scopeType === 'WORKSPACE') assertWorkspaceScope(mutation.context);
    else if (target.companyId) assertCompanyScope(mutation.context, target.companyId);
    else if (input.scopeType !== 'SELF') throw new AppError(400, 'assignment_scope_invalid', 'Scope target is required.');
    try {
      const result = await client.query(`
        INSERT INTO role_assignments(workspace_id, membership_id, role_id, scope_type, company_id,
          organization_unit_id, assigned_by_user_account_id, valid_until)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, membership_id AS "membershipId", role_id AS "roleId", scope_type AS "scopeType",
          company_id AS "companyId", organization_unit_id AS "organizationUnitId", valid_until AS "validUntil"
      `, [mutation.context.workspace.id, input.membershipId, input.roleId, input.scopeType,
        target.companyId, target.organizationUnitId, mutation.session.userAccountId, input.validUntil ?? null]);
      await audit(client, mutation, { action: 'organization.role.assigned', resourceType: 'role_assignment', resourceId: result.rows[0]?.id, companyId: target.companyId, newState: result.rows[0] });
      return result.rows[0];
    } catch (error) { return translateConflict(error); }
  });
}

export async function revokeRoleAssignment(mutation: MutationContext, assignmentId: string, reason: string) {
  return withWorkspaceTransaction({ workspaceId: mutation.context.workspace.id, companyId: mutation.context.company?.id ?? null }, async (client) => {
    const previous = await client.query('SELECT * FROM role_assignments WHERE workspace_id = $1 AND id = $2', [mutation.context.workspace.id, assignmentId]);
    if (!previous.rowCount) throw new AppError(404, 'role_assignment_not_found', 'Role assignment was not found.');
    const companyId = previous.rows[0]?.company_id as string | null;
    if (previous.rows[0]?.scope_type === 'WORKSPACE') assertWorkspaceScope(mutation.context);
    else if (companyId) assertCompanyScope(mutation.context, companyId);
    await client.query('DELETE FROM role_assignments WHERE workspace_id = $1 AND id = $2', [mutation.context.workspace.id, assignmentId]);
    await audit(client, mutation, { action: 'organization.role.revoked', resourceType: 'role_assignment', resourceId: assignmentId, companyId, previousState: previous.rows[0], reason });
  });
}
