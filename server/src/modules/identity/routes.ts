import { Router } from 'express';
import { z } from 'zod';
import { query } from '../../infrastructure/database/pool.js';
import { asyncHandler } from '../../shared/async-handler.js';
import { AppError } from '../../shared/errors.js';
import { assertMembershipAvailable, buildSessionView } from '../organization/context-service.js';
import { getAuthenticatedSession, requireAuthentication, requireCsrf } from './middleware.js';
import { verifyPassword } from './password.js';
import { createSession, destroySession } from './session-service.js';

interface AccountRow {
  id: string;
  person_id: string;
  full_name: string;
  email: string;
  password_hash: string;
}

const loginInput = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(200),
});

const contextInput = z.object({ membershipId: z.string().uuid() });

export function identityRoutes(): Router {
  const router = Router();

  router.post('/auth/login', asyncHandler(async (request, response) => {
    const input = loginInput.parse(request.body);
    const result = await query<AccountRow>(`
      SELECT ua.id, ua.person_id, p.full_name, ua.email, ua.password_hash
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
    }));
  }));

  router.get('/auth/session', requireAuthentication, asyncHandler(async (_request, response) => {
    response.json(await buildSessionView(getAuthenticatedSession(response.locals)));
  }));

  router.post('/auth/logout', requireAuthentication, requireCsrf, asyncHandler(async (_request, response) => {
    await destroySession(response, getAuthenticatedSession(response.locals).sessionId);
    response.status(204).send();
  }));

  router.post('/session/context', requireAuthentication, requireCsrf, asyncHandler(async (request, response) => {
    const input = contextInput.parse(request.body);
    const session = getAuthenticatedSession(response.locals);
    await assertMembershipAvailable(session.userAccountId, input.membershipId);
    await query('UPDATE sessions SET active_membership_id = $1 WHERE id = $2', [input.membershipId, session.sessionId]);
    response.json(await buildSessionView({ ...session, activeMembershipId: input.membershipId }));
  }));

  return router;
}
