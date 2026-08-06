import { User, Customer, SystemPermission } from '../types';
import { getJalaliNow } from './persianDate';

// Sales module helpers. All hierarchy here is driven purely by User.salesSupervisorId,
// which is completely independent of the treasury approvalChain/allowedApproverIds chain
// — never mix the two.

// Full subtree (self + every descendant, at any depth) under userId in the
// salesSupervisorId chain. Shared by customer-visibility scoping and Lead assignment.
export function getSalesSubordinateIds(userId: string, allUsers: User[]): Set<string> {
  const ids = new Set<string>([userId]);
  let added = true;
  while (added) {
    added = false;
    for (const u of allUsers) {
      if (u.salesSupervisorId && ids.has(u.salesSupervisorId) && !ids.has(u.id)) {
        ids.add(u.id);
        added = true;
      }
    }
  }
  return ids;
}

// Self + only the direct reports (one level down) — narrower than the full subtree.
export function getDirectSalesReportIds(userId: string, allUsers: User[]): Set<string> {
  const ids = new Set<string>([userId]);
  for (const u of allUsers) {
    if (u.salesSupervisorId === userId) ids.add(u.id);
  }
  return ids;
}

// Returns the ids of every customer visible to currentUser, with the SCOPE WIDTH
// determined by which granular view_*_customers permission the user's effective
// permissions grant — narrowest wins is not the rule here; widest granted scope applies:
//   view_descendant_customers -> full subtree (self + all levels below)
//   view_team_customers       -> self + direct reports only
//   view_own_customers        -> self only
// If none of the three are present, the user sees nothing (not even their own — they'd
// need at least view_own_customers). effectivePermissions === null means admin (sees all).
// This is deliberately NOT "any sales permission -> see everything": each permission maps
// to an explicit, bounded scope so a second active role can only widen visibility by the
// amount that role's own permission actually grants, never further.
export function getVisibleCustomerIds(
  currentUser: User,
  allUsers: User[],
  allCustomers: Customer[],
  effectivePermissions: SystemPermission[] | null
): string[] {
  if (!currentUser) return [];
  if (effectivePermissions === null) return allCustomers.map((c) => c.id); // admin bypass

  let scopeIds: Set<string>;
  if (effectivePermissions.includes('view_descendant_customers')) {
    scopeIds = getSalesSubordinateIds(currentUser.id, allUsers);
  } else if (effectivePermissions.includes('view_team_customers')) {
    scopeIds = getDirectSalesReportIds(currentUser.id, allUsers);
  } else if (effectivePermissions.includes('view_own_customers')) {
    scopeIds = new Set([currentUser.id]);
  } else {
    return [];
  }

  return allCustomers
    .filter((c) => (c.activityLog || []).some((log) => scopeIds.has(log.salespersonId)))
    .map((c) => c.id);
}

// Global lookup by phone (phone1 or phone2) — intentionally NOT restricted by hierarchy
// visibility, since the whole point of the dynamic ownership lock is to let ANY
// salesperson discover that a phone number already belongs to an in-progress customer,
// even one they otherwise couldn't see in their own customer list.
export function findCustomerByPhone(phone: string, allCustomers: Customer[]): Customer | undefined {
  const trimmed = phone.trim();
  if (!trimmed) return undefined;
  return allCustomers.find((c) => c.phone1 === trimmed || c.phone2 === trimmed);
}

// currentActiveSalespersonId is deliberately not a stored field (per the design) — it's
// always derived from activityLog at read time, so it can never drift out of sync.
export function getCurrentActiveSalespersonId(customer: Customer): string | null {
  const activeEntry = (customer.activityLog || []).find((log) => log.status === 'active');
  return activeEntry ? activeEntry.salespersonId : null;
}

// A customer is free to start a new sale cycle only when no 'active' entry exists yet.
export function canStartNewSale(customer: Customer): boolean {
  return getCurrentActiveSalespersonId(customer) === null;
}

// Appends a new 'active' activityLog entry for salespersonId. No-ops (returns the
// customer unchanged) if a cycle is already active — callers must check
// canStartNewSale first and surface the ownership-lock message instead of calling this.
export function startNewSaleCycle(customer: Customer, salespersonId: string): Customer {
  if (!canStartNewSale(customer)) return customer;
  return {
    ...customer,
    activityLog: [
      ...(customer.activityLog || []),
      { salespersonId, startedAt: getJalaliNow(), status: 'active' as const }
    ]
  };
}

// Manual/test-only closing of the currently active cycle (real "invoice completed" logic
// arrives in the next phase). Only the owning salesperson should be allowed to call this —
// enforced by the caller (CustomersView) checking getCurrentActiveSalespersonId first.
export function closeSaleCycle(customer: Customer, salespersonId: string): Customer {
  const activeId = getCurrentActiveSalespersonId(customer);
  if (activeId !== salespersonId) return customer;
  return {
    ...customer,
    activityLog: (customer.activityLog || []).map((log) =>
      log.status === 'active' && log.salespersonId === salespersonId ? { ...log, status: 'completed' as const } : log
    )
  };
}

// True if fromUser is allowed to assign/refer a Lead directly to toUserId — i.e. toUserId
// is fromUser themself or anywhere in fromUser's sales-org subtree. Callers must still check
// the assign_sales_lead/reassign_sales_lead permission separately; this only answers the
// organizational-scope question ("is this target within my authority"), not the permission
// question ("am I allowed to assign Leads at all").
export function canAssignLeadTo(fromUser: User, toUserId: string, allUsers: User[]): boolean {
  return getSalesSubordinateIds(fromUser.id, allUsers).has(toUserId);
}
