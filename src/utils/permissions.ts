import { User, SystemRole, SystemPermission } from '../types';
import { DEFAULT_ROLE_ID_MAP } from './storage';

// Resolves the full, deduplicated set of permissions a user effectively has under the
// multi-role access model: base role (role/roleId) + every additionalRoleIds entry,
// with roleAccessOverrides fully replacing (not merging into) a given role's permission
// list for this user only, plus any individual customPermissions on top.
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

  return Array.from(new Set([...permissionsFromRoles, ...customPermissions]));
}
