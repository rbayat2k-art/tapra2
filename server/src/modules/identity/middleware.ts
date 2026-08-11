import type { RequestHandler } from 'express';
import { asyncHandler } from '../../shared/async-handler.js';
import { AppError } from '../../shared/errors.js';
import { assertMembershipAvailable } from '../organization/context-service.js';
import { assertCsrf, resolveSession } from './session-service.js';
import type { AuthenticatedSession, MembershipContext } from './types.js';

export function getAuthenticatedSession(locals: Record<string, unknown>): AuthenticatedSession {
  const session = locals.authSession as AuthenticatedSession | undefined;
  if (!session) throw new AppError(401, 'authentication_required', 'Authentication is required.');
  return session;
}

export function getActiveContext(locals: Record<string, unknown>): MembershipContext {
  const context = locals.activeContext as MembershipContext | undefined;
  if (!context) throw new AppError(409, 'active_context_required', 'Select an active Workspace and Company context.');
  return context;
}

export const requireAuthentication: RequestHandler = asyncHandler(async (request, response, next) => {
  const session = await resolveSession(request);
  if (!session) throw new AppError(401, 'authentication_required', 'Authentication is required.');
  response.locals.authSession = session;
  next();
});

export const requireCsrf: RequestHandler = (request, response, next) => {
  assertCsrf(request, getAuthenticatedSession(response.locals));
  next();
};

export const requireActiveContext: RequestHandler = asyncHandler(async (_request, response, next) => {
  const session = getAuthenticatedSession(response.locals);
  if (!session.activeMembershipId) throw new AppError(409, 'active_context_required', 'Select an active Workspace and Company context.');
  response.locals.activeContext = await assertMembershipAvailable(session.userAccountId, session.activeMembershipId);
  next();
});
