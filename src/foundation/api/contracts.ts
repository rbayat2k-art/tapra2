export interface FoundationMembership {
  membershipId: string;
  workspace: { id: string; name: string; slug: string };
  company: { id: string; name: string; code: string } | null;
  permissions: string[];
}

export interface FoundationSession {
  user: { id: string; personId: string; fullName: string; email: string };
  memberships: FoundationMembership[];
  activeContext: FoundationMembership | null;
  csrfToken: string;
}

export interface FoundationCustomer {
  id: string;
  fullName: string;
  phonePrimary: string;
  status: 'active' | 'merged';
  mergedIntoCustomerId: string | null;
  createdAt: string;
}

export interface FoundationCustomerProfile extends FoundationCustomer {
  phones: Array<{
    id: string;
    originalCustomerId: string;
    value: string;
    normalizedValue: string;
    label: string;
    isPrimary: boolean;
    verificationStatus: string;
    sourceId: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  addresses: Array<{
    id: string;
    originalCustomerId: string;
    province: string | null;
    city: string | null;
    addressText: string;
    postalCode: string | null;
    label: string;
    isPrimary: boolean;
    sourceId: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  sources: Array<{
    id: string;
    originalCustomerId: string;
    sourceType: string;
    sourceName: string;
    sourceReference: string | null;
    importReference: string | null;
    observedAt: string | null;
    ingestedAt: string;
    rawSourceReference: string | null;
    confidence: number | null;
    verificationStatus: string;
    metadata: Record<string, unknown>;
  }>;
  timeline: Array<{
    id: string;
    originalCustomerId: string;
    eventType: string;
    summary: string;
    metadata: Record<string, unknown>;
    occurredAt: string;
  }>;
  merges: Array<{
    id: string;
    canonicalCustomerId: string;
    mergedCustomerId: string;
    status: 'active' | 'reversed';
    reason: string;
    mergedAt: string;
    reversedAt: string | null;
    reversalReason: string | null;
  }>;
}

export interface CreateFoundationCustomer {
  fullName: string;
  phonePrimary: string;
  phoneSecondary?: string;
  address?: string;
  province?: string;
  city?: string;
  postalCode?: string;
}

export interface DuplicateCheckResult {
  match: 'EXACT_MATCH' | 'POSSIBLE_DUPLICATE' | 'NO_MATCH';
  candidates: FoundationCustomer[];
}

export type CustomerImportClassification = 'VALID' | 'INVALID' | 'EXACT_MATCH' | 'POSSIBLE_DUPLICATE' | 'REVIEW_REQUIRED';
export type CustomerImportAction = 'CREATE_NEW' | 'LINK_TO_EXISTING' | 'LINK_TO_STAGED' | 'REJECT' | 'KEEP_FOR_REVIEW';

export interface CustomerImportRecord {
  id: string;
  rowNumber: number;
  rawData: Record<string, string>;
  fullName: string | null;
  phone: string | null;
  normalizedPhone: string | null;
  purchasedItem: string | null;
  classification: CustomerImportClassification;
  reasons: string[];
  candidateCustomerIds: string[];
  duplicateOfRecordId: string | null;
  proposedAction: CustomerImportAction;
  decidedAction: CustomerImportAction | null;
  targetCustomerId: string | null;
  targetRecordId: string | null;
  appliedCustomerId: string | null;
}

export interface CustomerImportJob {
  id: string;
  fileName: string;
  sourceName: string;
  fileSha256?: string;
  schemaVersion: string;
  status: 'staged' | 'in_review' | 'approved' | 'failed';
  counts: { total: number; valid: number; invalid: number; exactMatch: number; possibleDuplicate: number; reviewRequired: number; approved: number; rejected: number };
  createdAt: string;
  approvedAt: string | null;
  completedAt: string | null;
  records?: CustomerImportRecord[];
  candidates?: Array<{ id: string; fullName: string; phonePrimary: string }>;
}

export interface ApiErrorPayload {
  error?: { code?: string; message?: string; correlationId?: string };
  correlationId?: string;
}

export type SalesLeadStatus =
  | 'new' | 'pending_action' | 'callback_scheduled' | 'overdue' | 'in_negotiation'
  | 'ready_for_invoice' | 'closed_won' | 'closed_lost' | 'wrong_number' | 'complaint_blocked';

export type SalesCallOutcome =
  | 'not_dialed' | 'could_not_connect' | 'switched_off' | 'no_answer' | 'wrong_number'
  | 'connected_no_time' | 'real_conversation' | 'callback_requested' | 'interested'
  | 'ready_for_invoice' | 'cancelled' | 'complaint';

export interface SalesLead {
  id: string;
  trackingCode: string;
  customerId: string;
  customerIdentityId: string;
  customerName: string;
  company: { id: string; name: string };
  source: string;
  declaredInterest: string;
  priority: 'low' | 'normal' | 'high';
  status: SalesLeadStatus;
  campaignReference: string | null;
  context: Record<string, unknown>;
  currentAssignee: { membershipId: string; name: string } | null;
  firstAttemptAt: string | null;
  firstEffectiveContactAt: string | null;
  lastCallOutcome: SalesCallOutcome | null;
  actionDeadline: string | null;
  createdAt: string;
  updatedAt: string;
  callCount: number;
}

export interface SalesLeadDetail extends SalesLead {
  timeline: Array<{ id: string; type: string; summary: string; metadata: Record<string, unknown>; actorName: string; occurredAt: string }>;
  assignments: Array<{ id: string; type: 'assigned' | 'reassigned'; previousAssigneeName: string | null; assigneeName: string; assignedByName: string; reason: string | null; assignedAt: string }>;
  calls: Array<{ id: string; salespersonName: string; companyName: string; campaignReference: string | null; context: Record<string, unknown>; startedAt: string; endedAt: string; outcome: SalesCallOutcome; effective: boolean; note: string | null; callbackAt: string | null }>;
  relationship: null | { id: string; status: 'active' | 'released'; lockMode: 'none' | 'until_reassigned' | 'duration'; ownerMembershipId: string | null; ownerName: string | null; lockAcquiredAt: string | null; lockExpiresAt: string | null; updatedAt: string };
}

export interface SalesAssignee {
  membershipId: string;
  userAccountId: string;
  fullName: string;
}
