import { Router } from 'express';
import { z } from 'zod';
import { query } from '../../infrastructure/database/pool.js';
import { asyncHandler } from '../../shared/async-handler.js';
import { AppError } from '../../shared/errors.js';
import { assertMembershipAvailable, buildSessionView, limitContextToActor } from '../organization/context-service.js';
import { getAuthenticatedSession, requireAuthentication, requireCsrf } from './middleware.js';
import { hashPassword, verifyPassword } from './password.js';
import { createSession, destroySession } from './session-service.js';

interface AccountRow {
  id: string;
  person_id: string;
  full_name: string;
  email: string;
  password_hash: string;
  requires_password_change: boolean;
}

const loginInput = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(200),
});

const contextInput = z.object({
  membershipId: z.string().uuid(),
  scopeType: z.enum(['WORKSPACE', 'COMPANY', 'BRANCH', 'DEPARTMENT', 'TEAM', 'SELF']).optional(),
  scopeId: z.string().uuid().optional(),
}).refine((value) => Boolean(value.scopeType) === Boolean(value.scopeId), {
  message: 'scopeType and scopeId must be supplied together.',
});

const passwordChangeInput = z.object({
  currentPassword: z.string().min(8).max(200),
  newPassword: z.string().min(12).max(200)
    .regex(/[a-z]/, 'Password must contain a lowercase letter.')
    .regex(/[A-Z]/, 'Password must contain an uppercase letter.')
    .regex(/[0-9]/, 'Password must contain a number.')
    .regex(/[^A-Za-z0-9]/, 'Password must contain a symbol.'),
}).refine((value) => value.currentPassword !== value.newPassword, {
  message: 'The new password must be different from the temporary password.',
  path: ['newPassword'],
});

export function identityRoutes(): Router {
  const router = Router();

  router.post('/auth/login', asyncHandler(async (request, response) => {
    const input = loginInput.parse(request.body);
    const result = await query<AccountRow>(`
      SELECT ua.id, ua.person_id, p.full_name, ua.email, ua.password_hash, ua.requires_password_change
      FROM user_accounts ua
      JOIN persons p ON p.id = ua.person_id
      WHERE ua.email = $1 AND ua.is_active = true
    `, [input.email]);
    const account = result.rows[0];
    if (!account || !(await verifyPassword(input.password, account.password_hash))) {
      throw new AppError(401, 'invalid_credentials', 'Email or password is incorrect.');
    }
    response.status(200).json(await createSession(response, {
      id: account.id,
      personId: account.person_id,
      fullName: account.full_name,
      email: account.email,
      requiresPasswordChange: account.requires_password_change,
    }));
  }));

  router.get('/auth/session', requireAuthentication, asyncHandler(async (_request, response) => {
    response.json(await buildSessionView(getAuthenticatedSession(response.locals)));
  }));

  router.post('/auth/logout', requireAuthentication, requireCsrf, asyncHandler(async (_request, response) => {
    await destroySession(response, getAuthenticatedSession(response.locals).sessionId);
    response.status(204).send();
  }));

  router.post('/auth/password', requireAuthentication, requireCsrf, asyncHandler(async (request, response) => {
    const input = passwordChangeInput.parse(request.body);
    const session = getAuthenticatedSession(response.locals);
    if (session.impersonationId) {
      throw new AppError(403, 'impersonation_password_forbidden', 'Password changes are unavailable during impersonation.');
    }
    const accountResult = await query<{ password_hash: string }>(`
      SELECT password_hash FROM user_accounts WHERE id = $1 AND is_active = true
    `, [session.userAccountId]);
    const account = accountResult.rows[0];
    if (!account || !(await verifyPassword(input.currentPassword, account.password_hash))) {
      throw new AppError(401, 'invalid_current_password', 'The current password is incorrect.');
    }
    const passwordHash = await hashPassword(input.newPassword);
    await query(`
      UPDATE user_accounts
      SET password_hash = $1, requires_password_change = false, updated_at = now()
      WHERE id = $2
    `, [passwordHash, session.userAccountId]);
    await query('DELETE FROM sessions WHERE user_account_id = $1 AND id <> $2', [session.userAccountId, session.sessionId]);
    response.json(await buildSessionView({ ...session, requiresPasswordChange: false }));
  }));

  router.post('/session/context', requireAuthentication, requireCsrf, asyncHandler(async (request, response) => {
    const input = contextInput.parse(request.body);
    const session = getAuthenticatedSession(response.locals);
    if (session.requiresPasswordChange) {
      throw new AppError(403, 'password_change_required', 'The temporary password must be changed before selecting a context.');
    }
    const selected = await assertMembershipAvailable(
      session.userAccountId, input.membershipId, input.scopeType, input.scopeId,
    );
    if (session.impersonationId && session.actorMembershipId && session.actorScopeType && session.actorScopeId) {
      const actorContext = await assertMembershipAvailable(
        session.actorUserAccountId, session.actorMembershipId, session.actorScopeType, session.actorScopeId,
      );
      limitContextToActor(selected, actorContext);
      await query(`
        UPDATE session_impersonations
        SET target_membership_id = $1, target_scope_type = $2, target_scope_id = $3
        WHERE id = $4 AND ended_at IS NULL AND expires_at > now()
      `, [input.membershipId, selected.scope.type, selected.scope.id, session.impersonationId]);
    } else {
      await query(`
        UPDATE sessions
        SET active_membership_id = $1, active_scope_type = $2, active_scope_id = $3
        WHERE id = $4
      `, [input.membershipId, selected.scope.type, selected.scope.id, session.sessionId]);
    }
    response.json(await buildSessionView({
      ...session,
      activeMembershipId: input.membershipId,
      activeScopeType: selected.scope.type,
      activeScopeId: selected.scope.id,
    }));
  }));

  return router;
}
