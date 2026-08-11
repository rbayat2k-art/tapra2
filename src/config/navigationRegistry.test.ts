import { describe, it, expect } from 'vitest';
import {
  getVisibleGroupedNavItems, getEligiblePrimaryActions,
  NAV_ITEM_BY_ID, type NavVisibilityContext
} from './navigationRegistry';
import { getEffectiveUserPermissions, isSystemAdmin } from '../utils/permissions';
import type { User, SystemRole } from '../types';

// این تست‌ها ۴ مورد از ۱۰ مورد تست الزامی مأموریت بازطراحی UI Foundation را پوشش می‌دهند —
// آن‌هایی که منطق خالص (بدون رندر DOM) هستند: گروه خالی هرگز نمایش داده نمی‌شود، کاربر فقط
// آیتم‌های مجاز را می‌بیند، اتحاد Permission چندنقشی حفظ می‌شود، Deny صریح همچنان اولویت دارد،
// و اقدام اصلی غیرمجاز هرگز نمایش داده نمی‌شود. باقی ۵ مورد (Escape در Drawer موبایل، Tooltip
// حالت جمع‌شده، تغییر واقعی متغیرهای CSS با انتخاب Accent، پاک‌شدن تب‌ها هنگام Impersonation،
// و «Registry تنها منبع» به‌عنوان یک قاعدهٔ معماری) نیازمند رندر کامپوننت/DOM هستند که این
// پروژه هنوز زیرساخت آن (jsdom/@testing-library/react) را ندارد — به‌صورت شفاف در گزارش نهایی
// به‌عنوان بدهی باقی‌مانده ذکر شده‌اند، نه ادعای «پوشش داده شده».

function makeRole(id: string, permissions: SystemRole['permissions']): SystemRole {
  return { id, code: id, name: id, description: '', permissions };
}

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'u1', username: 'u1', password: 'x', fullName: 'کاربر تست', phone: '', email: '',
    role: 'member', roleId: 'role_zero_perms', roleTitle: 'کاربر تست', isActive: true,
    ...overrides
  };
}

function ctxFor(user: User, roles: SystemRole[]): NavVisibilityContext {
  return {
    currentUser: user,
    effectivePermissions: isSystemAdmin(user, roles) ? null : getEffectiveUserPermissions(user, roles),
    isAdmin: user.role === 'admin'
  };
}

describe('mandated test 1 — an empty Sidebar group is never shown', () => {
  it('a user with zero granted permissions sees no group whose every item requires a permission', () => {
    const zeroRole = makeRole('role_zero_perms', []);
    const user = makeUser();
    const grouped = getVisibleGroupedNavItems(ctxFor(user, [zeroRole]));

    for (const g of grouped) {
      expect(g.items.length).toBeGreaterThan(0);
    }
    // گروه «کارتابل من» هیچ آیتم بدون-Permission ندارد — باید کاملاً حذف شود، نه با آرایهٔ خالی نمایش داده شود
    expect(grouped.find((g) => g.group === 'inbox')).toBeUndefined();
  });
});

describe('mandated test 2 — a user sees only permitted groups and items', () => {
  it('granting exactly one permission reveals only the items whose OR-list includes it, nothing else', () => {
    const role = makeRole('role_sales_only', ['sales_access']);
    const user = makeUser({ roleId: 'role_sales_only' });
    const visibleIds = getVisibleGroupedNavItems(ctxFor(user, [role]))
      .flatMap((g) => g.items.map((i) => i.id));

    // آیتم‌های عملیاتی فروش دیده می‌شوند؛ صفحات مدیریتی کاتالوگ مجوز مستقل می‌خواهند.
    expect(visibleIds).toContain('customers');
    expect(visibleIds).toContain('sales_organization');
    expect(visibleIds).not.toContain('products');
    expect(visibleIds).not.toContain('services');
    expect(visibleIds).not.toContain('promotions');
    // آیتمی که به مجوز کاملاً نامرتبط نیاز دارد نباید دیده شود
    expect(visibleIds).not.toContain('vendors');
    expect(NAV_ITEM_BY_ID['vendors'].requires).toEqual(['manage_vendors']);
  });

  it('each catalog management permission reveals only its own page', () => {
    const role = makeRole('role_product_manager', ['manage_products']);
    const user = makeUser({ roleId: role.id });
    const visibleIds = getVisibleGroupedNavItems(ctxFor(user, [role]))
      .flatMap((g) => g.items.map((i) => i.id));

    expect(visibleIds).toContain('products');
    expect(visibleIds).not.toContain('services');
    expect(visibleIds).not.toContain('promotions');
  });
});

describe('mandated test 3 — the union of Permissions across multiple roles is preserved', () => {
  it('a second additionalRoleIds role unlocks its own nav items on top of the base role\'s, not instead of them', () => {
    const roleA = makeRole('role_a', ['manage_vendors']);
    const roleB = makeRole('role_b', ['manage_companies']);
    const user = makeUser({ roleId: 'role_a', additionalRoleIds: ['role_b'] });
    const visibleIds = getVisibleGroupedNavItems(ctxFor(user, [roleA, roleB]))
      .flatMap((g) => g.items.map((i) => i.id));

    expect(visibleIds).toContain('vendors');   // از role_a
    expect(visibleIds).toContain('companies'); // از role_b
  });
});

describe('mandated test 4 — an explicit Deny still takes priority', () => {
  it('deniedPermissions hides a nav item even though the assigned role grants the required permission', () => {
    const role = makeRole('role_vendors', ['manage_vendors']);
    const user = makeUser({ roleId: 'role_vendors', deniedPermissions: ['manage_vendors'] });
    const visibleIds = getVisibleGroupedNavItems(ctxFor(user, [role]))
      .flatMap((g) => g.items.map((i) => i.id));

    expect(visibleIds).not.toContain('vendors');
    expect(visibleIds).not.toContain('vendor_categories');
  });
});

describe('mandated test 7 — an unauthorized Primary Action is never shown', () => {
  it('a user with no eligible permission gets an empty action list, not a fallback default', () => {
    const zeroRole = makeRole('role_zero_perms', []);
    const user = makeUser();
    expect(getEligiblePrimaryActions(ctxFor(user, [zeroRole]))).toEqual([]);
  });

  it('a user is only offered the primary actions their own permissions actually unlock', () => {
    const role = makeRole('role_requestor_only', ['create_request']);
    const user = makeUser({ roleId: 'role_requestor_only' });
    const eligible = getEligiblePrimaryActions(ctxFor(user, [role]));

    expect(eligible.map((a) => a.id)).toEqual(['create_request']);
    expect(eligible.map((a) => a.id)).not.toContain('create_sales_invoice');
  });

  it('getEligiblePrimaryActions returns nothing for a logged-out context', () => {
    expect(getEligiblePrimaryActions({ currentUser: null, effectivePermissions: [], isAdmin: false })).toEqual([]);
  });
});
