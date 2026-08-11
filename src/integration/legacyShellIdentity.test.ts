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
    user: { id: 'server-user', personId: 'person', fullName: 'کاربر سرور', email },
    memberships: [], csrfToken: 'csrf',
    activeContext: {
      membershipId: 'membership', workspace: { id: 'workspace', name: 'فضای کاری', slug: 'workspace' },
      company: { id: 'company', name: 'شرکت', code: 'COMPANY' }, permissions,
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

  it('maps server Sales permissions only to presentation navigation and actions', () => {
    const seller = resolveLegacyShellUser(session('seller@tapra.local', ['sales.queue.read', 'sales.call.create']), users);
    expect(seller.customPermissions).toEqual(expect.arrayContaining(['sales_access', 'view_sales_queue', 'log_call_outcome']));
    expect(seller.customPermissions).not.toContain('assign_sales_lead');

    const manager = resolveLegacyShellUser(session('manager@tapra.local', ['sales.lead.assign', 'sales.lead.reassign']), users);
    expect(manager.customPermissions).toEqual(expect.arrayContaining(['assign_sales_lead', 'reassign_sales_lead']));
  });
});
