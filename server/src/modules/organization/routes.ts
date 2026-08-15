import { Router } from 'express';
import { z } from 'zod';
import { requirePermission } from '../access/authorization.js';
import { getActiveContext, getAuthenticatedSession, requireActiveContext, requireAuthentication, requireCsrf } from '../identity/middleware.js';
import { asyncHandler } from '../../shared/async-handler.js';
import {
  assignRole, createCompany, createMembership, createRole, createUnit, createUser, readOrganization,
  revokeRoleAssignment, updateCompany, updateMembershipStatus, updateUnit, updateUserStatus,
} from './organization-service.js';

const uuid = z.string().uuid();
const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(''));
const companyInput = z.object({
  code: z.string().trim().min(1).max(50).regex(/^[A-Za-z0-9_-]+$/),
  name: z.string().trim().min(2).max(200),
  description: optionalText(500),
  isActive: z.boolean().optional(),
});
const unitInput = z.object({
  companyId: uuid.optional(), parentId: uuid.optional(),
  type: z.enum(['BRANCH', 'DEPARTMENT', 'TEAM', 'SHARED_SERVICE']),
  code: z.string().trim().min(1).max(50).regex(/^[A-Za-z0-9_-]+$/),
  name: z.string().trim().min(2).max(200), description: optionalText(500),
  serviceKind: z.enum(['HR', 'DATA', 'MIS', 'OTHER']).optional(), isActive: z.boolean().optional(),
});
const mutation = (response: { locals: Record<string, unknown> }) => ({
  context: getActiveContext(response.locals),
  session: getAuthenticatedSession(response.locals),
  correlationId: response.locals.correlationId as string,
});

export function organizationRoutes(): Router {
  const router = Router();
  router.use(requireAuthentication, requireActiveContext);
  router.get('/organization', requirePermission('organization.read'), asyncHandler(async (_request, response) => {
    const session = getAuthenticatedSession(response.locals);
    response.json({ organization: await readOrganization(getActiveContext(response.locals), session.userAccountId) });
  }));
  router.post('/organization/companies', requireCsrf, requirePermission('organization.company.manage'), asyncHandler(async (request, response) => {
    response.status(201).json({ company: await createCompany(mutation(response), companyInput.parse(request.body)) });
  }));
  router.put('/organization/companies/:companyId', requireCsrf, requirePermission('organization.company.manage'), asyncHandler(async (request, response) => {
    response.json({ company: await updateCompany(mutation(response), uuid.parse(request.params.companyId), companyInput.parse(request.body)) });
  }));
  router.post('/organization/units', requireCsrf, requirePermission('organization.unit.manage'), asyncHandler(async (request, response) => {
    response.status(201).json({ unit: await createUnit(mutation(response), unitInput.parse(request.body)) });
  }));
  router.put('/organization/units/:unitId', requireCsrf, requirePermission('organization.unit.manage'), asyncHandler(async (request, response) => {
    response.json({ unit: await updateUnit(mutation(response), uuid.parse(request.params.unitId), unitInput.parse(request.body)) });
  }));
  router.post('/organization/users', requireCsrf, requirePermission('organization.user.manage'), asyncHandler(async (request, response) => {
    const input = z.object({ fullName: z.string().trim().min(2).max(200), email: z.string().trim().email().transform((value) => value.toLowerCase()) }).parse(request.body);
    response.status(201).json(await createUser(mutation(response), input));
  }));
  router.patch('/organization/users/:userAccountId/status', requireCsrf, requirePermission('organization.user.manage'), asyncHandler(async (request, response) => {
    const input = z.object({ isActive: z.boolean() }).parse(request.body);
    response.json({ account: await updateUserStatus(mutation(response), uuid.parse(request.params.userAccountId), input.isActive) });
  }));
  router.post('/organization/memberships', requireCsrf, requirePermission('organization.membership.manage'), asyncHandler(async (request, response) => {
    const input = z.object({ personId: uuid, companyId: uuid.optional() }).parse(request.body);
    response.status(201).json({ membership: await createMembership(mutation(response), input) });
  }));
  router.patch('/organization/memberships/:membershipId/status', requireCsrf, requirePermission('organization.membership.manage'), asyncHandler(async (request, response) => {
    const input = z.object({ status: z.enum(['active', 'suspended', 'ended']) }).parse(request.body);
    response.json({ membership: await updateMembershipStatus(mutation(response), uuid.parse(request.params.membershipId), input.status) });
  }));
  router.post('/organization/roles', requireCsrf, requirePermission('organization.role.manage'), asyncHandler(async (request, response) => {
    const input = z.object({ code: z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9_.-]+$/), name: z.string().trim().min(2).max(200), description: optionalText(500), permissionCodes: z.array(z.string().min(1).max(100)).max(200) }).parse(request.body);
    response.status(201).json({ role: await createRole(mutation(response), input) });
  }));
  router.post('/organization/role-assignments', requireCsrf, requirePermission('organization.role.manage'), asyncHandler(async (request, response) => {
    const input = z.object({ membershipId: uuid, roleId: uuid, scopeType: z.enum(['WORKSPACE', 'COMPANY', 'BRANCH', 'DEPARTMENT', 'TEAM', 'SELF']), scopeId: uuid.optional(), validUntil: z.iso.datetime({ offset: true }).optional() }).parse(request.body);
    response.status(201).json({ assignment: await assignRole(mutation(response), input) });
  }));
  router.delete('/organization/role-assignments/:assignmentId', requireCsrf, requirePermission('organization.role.manage'), asyncHandler(async (request, response) => {
    const input = z.object({ reason: z.string().trim().min(3).max(500) }).parse(request.body);
    await revokeRoleAssignment(mutation(response), uuid.parse(request.params.assignmentId), input.reason);
    response.status(204).send();
  }));
  return router;
}
