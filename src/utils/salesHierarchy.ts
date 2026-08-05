import { User, Customer } from '../types';
import { getJalaliNow } from './persianDate';

// Sales module helpers (گام اول: مشتری). All hierarchy here is driven purely by
// User.salesSupervisorId, which is completely independent of the treasury
// approvalChain/allowedApproverIds chain — never mix the two.

// Returns the ids of every customer visible to currentUser: customers whose
// activityLog contains at least one entry made by currentUser or by anyone
// below currentUser in the sales supervisor chain (salesSupervisorId).
// Admins see every customer.
export function getVisibleCustomerIds(currentUser: User, allUsers: User[], allCustomers: Customer[]): string[] {
  if (!currentUser) return [];
  if (currentUser.role === 'admin') return allCustomers.map((c) => c.id);

  const subordinateIds = new Set<string>([currentUser.id]);
  let added = true;
  while (added) {
    added = false;
    for (const u of allUsers) {
      if (u.salesSupervisorId && subordinateIds.has(u.salesSupervisorId) && !subordinateIds.has(u.id)) {
        subordinateIds.add(u.id);
        added = true;
      }
    }
  }

  return allCustomers
    .filter((c) => (c.activityLog || []).some((log) => subordinateIds.has(log.salespersonId)))
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
