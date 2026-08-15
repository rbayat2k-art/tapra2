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
  requires_password_change: boolean;
  csrf_token: string;
  active_membership_id: string | null;
  active_scope_type: OrganizationScopeType | null;
  active_scope_id: string | null;
}

interface ImpersonationRow {
  impersonation_id: string;
  workspace_id: string;
  target_user_account_id: string;
  target_person_id: string;
  target_full_name: string;
  target_email: string;
  target_membership_id: string;
  target_scope_type: OrganizationScopeType;
  target_scope_id: string;
  actor_membership_id: string;
  actor_scope_type: OrganizationScopeType;
  actor_scope_id: string;
  reason: string;
  expires_at: Date;
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
  requiresPasswordChange: boolean;
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
    requiresPasswordChange: account.requiresPasswordChange,
    csrfToken,
    activeMembershipId: null,
    activeScopeType: null,
    activeScopeId: null,
    actorUserAccountId: account.id,
    actorPersonId: account.personId,
    actorFullName: account.fullName,
    actorEmail: account.email,
    actorMembershipId: null,
    actorScopeType: null,
    actorScopeId: null,
    impersonationId: null,
    impersonationReason: null,
    impersonationExpiresAt: null,
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
      ua.requires_password_change,
      s.csrf_token,
      s.active_membership_id
      , s.active_scope_type
      , s.active_scope_id
  `, [hashToken(rawToken)]);
  const row = result.rows[0];
  if (!row) return null;
  const impersonationResult = await query<ImpersonationRow>(`
    SELECT impersonation.id AS impersonation_id, impersonation.workspace_id,
      target.id AS target_user_account_id, target.person_id AS target_person_id,
      person.full_name AS target_full_name, target.email AS target_email,
      impersonation.target_membership_id, impersonation.target_scope_type, impersonation.target_scope_id,
      impersonation.actor_membership_id, impersonation.actor_scope_type, impersonation.actor_scope_id,
      impersonation.reason, impersonation.expires_at
    FROM session_impersonations impersonation
    JOIN user_accounts target ON target.id = impersonation.target_user_account_id AND target.is_active = true
    JOIN persons person ON person.id = target.person_id
    WHERE impersonation.session_id = $1 AND impersonation.ended_at IS NULL
      AND impersonation.expires_at > now()
    ORDER BY impersonation.started_at DESC LIMIT 1
  `, [row.session_id]);
  const impersonation = impersonationResult.rows[0];
  return {
    sessionId: row.session_id,
    userAccountId: impersonation?.target_user_account_id ?? row.user_account_id,
    personId: impersonation?.target_person_id ?? row.person_id,
    fullName: impersonation?.target_full_name ?? row.full_name,
    email: impersonation?.target_email ?? row.email,
    requiresPasswordChange: impersonation ? false : row.requires_password_change,
    csrfToken: row.csrf_token,
    activeMembershipId: impersonation?.target_membership_id ?? row.active_membership_id,
    activeScopeType: impersonation?.target_scope_type ?? row.active_scope_type,
    activeScopeId: impersonation?.target_scope_id ?? row.active_scope_id,
    actorUserAccountId: row.user_account_id,
    actorPersonId: row.person_id,
    actorFullName: row.full_name,
    actorEmail: row.email,
    actorMembershipId: impersonation?.actor_membership_id ?? row.active_membership_id,
    actorScopeType: impersonation?.actor_scope_type ?? row.active_scope_type,
    actorScopeId: impersonation?.actor_scope_id ?? row.active_scope_id,
    impersonationId: impersonation?.impersonation_id ?? null,
    impersonationReason: impersonation?.reason ?? null,
    impersonationExpiresAt: impersonation?.expires_at.toISOString() ?? null,
  };
}

export async function destroySession(response: Response, sessionId: string): Promise<void> {
  await query(`
    UPDATE session_impersonations
    SET ended_at = now(), ended_by_user_account_id = actor_user_account_id, end_reason = 'session_logout'
    WHERE session_id = $1 AND ended_at IS NULL
  `, [sessionId]);
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
