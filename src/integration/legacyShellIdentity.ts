import type { FoundationSession } from '../foundation/api/contracts';
import type { SystemPermission, User } from '../types';

const serverPermissionMap: Partial<Record<string, SystemPermission[]>> = {
  'customer.read': ['sales_access', 'view_customer_profile'],
  'customer.create': ['sales_access', 'view_customer_profile', 'create_customer'],
  'customer.identity.manage': ['sales_access', 'view_customer_profile', 'edit_customer_basic_info'],
  'customer.merge': ['sales_access', 'view_customer_profile', 'request_customer_merge'],
  'customer.unmerge': ['sales_access', 'view_customer_profile', 'split_customer_merge'],
  'customer.import.read': ['data_management_access', 'view_raw_contact_pool'],
  'customer.import.create': ['data_management_access', 'view_raw_contact_pool', 'import_raw_contacts'],
  'customer.import.review': ['data_management_access', 'view_raw_contact_pool', 'review_import_conflicts'],
  'sales.queue.read': ['sales_access', 'view_sales_queue'],
  'sales.call.create': ['sales_access', 'view_sales_queue', 'log_call_outcome'],
  'sales.lead.create': ['sales_access', 'assign_sales_lead'],
  'sales.lead.read_all': ['sales_access', 'view_sales_reports'],
  'sales.lead.assign': ['sales_access', 'assign_sales_lead'],
  'sales.lead.reassign': ['sales_access', 'reassign_sales_lead'],
  'organization.company.manage': ['manage_companies'],
  'organization.user.manage': ['manage_users'],
  'organization.membership.manage': ['manage_users'],
  'organization.role.manage': ['manage_roles'],
};

function mapServerPermissions(permissions: string[]): SystemPermission[] {
  return [...new Set(permissions.flatMap((permission) => serverPermissionMap[permission] ?? []))];
}

/**
 * Supplies the mature prototype shell with presentation-only identity data.
 * API authorization continues to use FoundationSession; this adapter never grants server access.
 */
export function resolveLegacyShellUser(session: FoundationSession, legacyUsers: User[]): User {
  const email = session.user.email.trim().toLowerCase();
  const exactLegacyUser = legacyUsers.find((user) => user.email.trim().toLowerCase() === email);

  if (exactLegacyUser) {
    return { ...exactLegacyUser, fullName: session.user.fullName, email: session.user.email };
  }

  // The deterministic local demo account is the product-tour identity. This affects only
  // prototype navigation; every SaaS API call still uses the server session and permissions.
  if (email === 'demo@tapra.local') {
    const demoAdministrator = legacyUsers.find((user) => user.role === 'admin' && user.isActive);
    if (demoAdministrator) {
      return { ...demoAdministrator, fullName: session.user.fullName, email: session.user.email };
    }
  }

  return {
    id: `foundation:${session.user.id}`,
    username: email.split('@')[0] || session.user.id,
    fullName: session.user.fullName,
    phone: '',
    email: session.user.email,
    role: 'member',
    roleTitle: 'عضو SaaS',
    companyId: session.activeContext?.company?.id,
    customPermissions: mapServerPermissions(session.activeContext?.permissions ?? []),
    isActive: true,
  };
}
