import { describe, expect, it } from 'vitest';
import type { FoundationSession } from '../foundation/api/contracts';
import type { User } from '../types';
import { resolveLegacyShellUser } from './legacyShellIdentity';

const users: User[] = [{
  id: 'legacy-admin', username: 'admin', fullName: 'مدیر قدیمی', phone: '', email: 'legacy@example.test',
  role: 'admin', roleTitle: 'مدیر', isActive: true,
}];

function session(email: string, permissions: string[]): FoundationSession {
  return {
    user: { id: 'server-user', personId: 'person', fullName: 'کاربر سرور', email, requiresPasswordChange: false },
    actor: { id: 'server-user', personId: 'person', fullName: 'کاربر سرور', email },
    impersonation: null,
    memberships: [], csrfToken: 'csrf',
    activeContext: {
      membershipId: 'membership', workspace: { id: 'workspace', name: 'فضای کاری', slug: 'workspace' },
      company: { id: 'company', name: 'شرکت', code: 'COMPANY' }, permissions,
      organizationUnit: null,
      scope: { type: 'COMPANY', id: 'company' },
      contextKey: 'membership:COMPANY:company',
      roles: [],
    },
  };
}

describe('legacy shell identity adapter', () => {
  it('uses the deterministic demo account only as a presentation administrator', () => {
    expect(resolveLegacyShellUser(session('demo@tapra.local', ['customer.read']), users).role).toBe('admin');
  });

  it('does not promote an ordinary SaaS member to the legacy administrator', () => {
    const user = resolveLegacyShellUser(session('reader@tapra.local', ['customer.read']), users);
    expect(user.role).toBe('member');
    expect(user.customPermissions).toContain('view_customer_profile');
    expect(user.customPermissions).not.toContain('manage_users');
  });

  it('keeps an exact legacy profile while refreshing trusted server identity fields', () => {
    const user = resolveLegacyShellUser(session('legacy@example.test', []), users);
    expect(user.id).toBe('legacy-admin');
    expect(user.fullName).toBe('کاربر سرور');
  });

  it('routes server Organization managers to the matching shell navigation only', () => {
    const user = resolveLegacyShellUser(session('organization@tapra.local', [
      'organization.company.manage', 'organization.user.manage', 'organization.role.manage',
    ]), users);
    expect(user.customPermissions).toEqual(expect.arrayContaining(['manage_companies', 'manage_users', 'manage_roles']));
    expect(user.customPermissions).not.toContain('view_all_requests');
  });
});
