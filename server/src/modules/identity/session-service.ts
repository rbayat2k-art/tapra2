import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { getEnvironment } from '../../config/env.js';
import { query } from '../../infrastructure/database/pool.js';
import { AppError } from '../../shared/errors.js';
import { buildSessionView } from '../organization/context-service.js';
import type { AuthenticatedSession, SessionView } from './types.js';
import type { OrganizationScopeType } from './types.js';

const cookieName = 'tapra2_session';

interface SessionRow {
  session_id: string;
  user_account_id: string;
  person_id: string;
  full_name: string;
  email: string;
  csrf_token: string;
  active_membership_id: string | null;
  active_scope_type: OrganizationScopeType | null;
  active_scope_id: string | null;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function parseCookie(request: Request, name: string): string | undefined {
  const header = request.header('cookie');
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return undefined;
}

function cookieAttributes(maxAgeSeconds: number): string {
  const secure = getEnvironment().SESSION_COOKIE_SECURE ? '; Secure' : '';
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

export async function createSession(response: Response, account: {
  id: string;
  personId: string;
  fullName: string;
  email: string;
}): Promise<SessionView> {
  const environment = getEnvironment();
  const rawToken = randomBytes(32).toString('hex');
  const csrfToken = randomBytes(32).toString('hex');
  const maxAgeSeconds = environment.SESSION_TTL_HOURS * 60 * 60;
  const result = await query<{ id: string }>(`
    INSERT INTO sessions(token_hash, csrf_token, user_account_id, expires_at)
    VALUES ($1, $2, $3, now() + ($4 * interval '1 second'))
    RETURNING id
  `, [hashToken(rawToken), csrfToken, account.id, maxAgeSeconds]);
  response.setHeader('Set-Cookie', `${cookieName}=${rawToken}; ${cookieAttributes(maxAgeSeconds)}`);
  return buildSessionView({
    userAccountId: account.id,
    personId: account.personId,
    fullName: account.fullName,
    email: account.email,
    csrfToken,
    activeMembershipId: null,
    activeScopeType: null,
    activeScopeId: null,
  });
}

export async function resolveSession(request: Request): Promise<AuthenticatedSession | null> {
  const rawToken = parseCookie(request, cookieName);
  if (!rawToken) return null;
  const result = await query<SessionRow>(`
    UPDATE sessions s
    SET last_seen_at = now()
    FROM user_accounts ua
    JOIN persons p ON p.id = ua.person_id
    WHERE s.token_hash = $1
      AND s.user_account_id = ua.id
      AND s.expires_at > now()
      AND ua.is_active = true
    RETURNING
      s.id AS session_id,
      ua.id AS user_account_id,
      p.id AS person_id,
      p.full_name,
      ua.email,
      s.csrf_token,
      s.active_membership_id
      , s.active_scope_type
      , s.active_scope_id
  `, [hashToken(rawToken)]);
  const row = result.rows[0];
  return row ? {
    sessionId: row.session_id,
    userAccountId: row.user_account_id,
    personId: row.person_id,
    fullName: row.full_name,
    email: row.email,
    csrfToken: row.csrf_token,
    activeMembershipId: row.active_membership_id,
    activeScopeType: row.active_scope_type,
    activeScopeId: row.active_scope_id,
  } : null;
}

export async function destroySession(response: Response, sessionId: string): Promise<void> {
  await query('DELETE FROM sessions WHERE id = $1', [sessionId]);
  response.setHeader('Set-Cookie', `${cookieName}=; ${cookieAttributes(0)}`);
}

export function assertCsrf(request: Request, session: AuthenticatedSession): void {
  const supplied = request.header('x-csrf-token');
  if (!supplied) throw new AppError(403, 'csrf_required', 'A valid CSRF token is required.');
  const expectedBuffer = Buffer.from(session.csrfToken);
  const suppliedBuffer = Buffer.from(supplied);
  if (expectedBuffer.length !== suppliedBuffer.length || !timingSafeEqual(expectedBuffer, suppliedBuffer)) {
    throw new AppError(403, 'csrf_invalid', 'A valid CSRF token is required.');
  }
}
