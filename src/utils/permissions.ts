import { useMemo } from 'react';
import { User, SystemRole, SystemPermission } from '../types';
import { DEFAULT_ROLE_ID_MAP } from './storage';

// Resolves the full, deduplicated set of permissions a user effectively has under the
// multi-role access model: base role (role/roleId) + every additionalRoleIds entry,
// with roleAccessOverrides fully replacing (not merging) a given role's permission
// list for this user only, plus any individual customPermissions on top — then
// user.deniedPermissions is subtracted last. Deny always wins over any allow, no matter
// which role/override/customPermission granted it.
export function getEffectiveUserPermissions(user: User, roles: SystemRole[]): SystemPermission[] {
  const baseRoleId = user.roleId || DEFAULT_ROLE_ID_MAP[user.role];
  const roleIds = Array.from(new Set([baseRoleId, ...(user.additionalRoleIds || [])].filter(Boolean)));

  const permissionsFromRoles = roleIds.flatMap((roleId) => {
    const override = user.roleAccessOverrides?.find((o) => o.roleId === roleId);
    if (override) return override.permissions;
    const role = roles.find((r) => r.id === roleId);
    return role?.permissions || [];
  });

  const customPermissions = user.customPermissions || [];
  const allowed = Array.from(new Set([...permissionsFromRoles, ...customPermissions]));

  const denied = new Set(user.deniedPermissions || []);
  if (denied.size === 0) return allowed;
  return allowed.filter((p) => !denied.has(p));
}

// Which of the user's currently-active roles is granting a specific permission — used for
// "effective role used for this operation" display/audit (admin can see WHY a user has a
// permission). Returns null if the permission comes only from customPermissions, or is denied.
export function getGrantingRoleId(user: User, roles: SystemRole[], permission: SystemPermission): string | null {
  if ((user.deniedPermissions || []).includes(permission)) return null;
  const baseRoleId = user.roleId || DEFAULT_ROLE_ID_MAP[user.role];
  const roleIds = [baseRoleId, ...(user.additionalRoleIds || [])].filter(Boolean);
  for (const roleId of roleIds) {
    const override = user.roleAccessOverrides?.find((o) => o.roleId === roleId);
    const perms = override ? override.permissions : roles.find((r) => r.id === roleId)?.permissions || [];
    if (perms.includes(permission)) return roleId;
  }
  return null;
}

// Single source of truth for "does this user have any of the required permissions" — admins
// always bypass (null sentinel), everyone else is checked against getEffectiveUserPermissions.
export function hasPermission(effectivePermissions: SystemPermission[] | null, required?: SystemPermission[]): boolean {
  if (!required || required.length === 0) return true;
  if (effectivePermissions === null) return true; // admin bypass
  return required.some((p) => effectivePermissions.includes(p));
}

// Memoized effective-permissions hook — null for admins (unrestricted), else the resolved
// permission list. Reuse this everywhere instead of re-deriving effectivePermissions locally.
export function useEffectivePermissions(currentUser: User | null, roles: SystemRole[]): SystemPermission[] | null {
  return useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === 'admin') return null;
    return getEffectiveUserPermissions(currentUser, roles);
  }, [currentUser, roles]);
}

// Single source of truth for "can this user access a nav item / tab / operation gated by
// `required`" — encodes every special-case override that already existed inline in
// Sidebar.tsx's hasAccess (canCreateRequests, isDualRole for approval/payment permissions,
// the three-way manage_assigned_tasks check) on top of the plain effective-permission check.
// Both the Sidebar menu AND the App.tsx tab-render guard call this so a permission unlocks
// menu + page + data + operations consistently — never just the menu item.
export function canAccessNavItem(
  currentUser: User | null,
  effectivePermissions: SystemPermission[] | null,
  required?: SystemPermission[]
): boolean {
  if (!required || required.length === 0) return true;
  if (effectivePermissions === null) return true; // admin bypass

  if (required.includes('create_request') && currentUser?.canCreateRequests !== undefined) {
    return currentUser.canCreateRequests;
  }

  if (
    (required.includes('approve_branch_request') || required.includes('approve_treasury') || required.includes('execute_payment')) &&
    currentUser?.isDualRole === true
  ) {
    return true;
  }

  if (required.includes('manage_assigned_tasks')) {
    const canIssue = currentUser?.canIssueTasks === true;
    const canExecute = currentUser?.canExecuteTasks === true;
    const hasCustom = !!currentUser?.customPermissions?.includes('manage_assigned_tasks');
    return canIssue || canExecute || hasCustom;
  }

  return required.some((p) => effectivePermissions.includes(p));
}
