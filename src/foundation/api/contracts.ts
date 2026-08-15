export interface FoundationMembership {
  membershipId: string;
  workspace: { id: string; name: string; slug: string };
  company: { id: string; name: string; code: string } | null;
  organizationUnit: { id: string; type: 'BRANCH' | 'DEPARTMENT' | 'TEAM'; name: string; code: string } | null;
  scope: { type: OrganizationScopeType; id: string };
  contextKey: string;
  roles: Array<{ id: string; code: string; name: string }>;
  permissions: string[];
}

export type OrganizationScopeType = 'WORKSPACE' | 'COMPANY' | 'BRANCH' | 'DEPARTMENT' | 'TEAM' | 'SELF';

export interface FoundationSession {
  user: { id: string; personId: string; fullName: string; email: string; requiresPasswordChange: boolean };
  actor: { id: string; personId: string; fullName: string; email: string };
  impersonation: null | { id: string; reason: string; expiresAt: string };
  memberships: FoundationMembership[];
  activeContext: FoundationMembership | null;
  csrfToken: string;
}

export interface OrganizationSnapshot {
  workspace: { id: string; name: string; slug: string };
  activeScope: { type: OrganizationScopeType; id: string };
  companies: Array<{ id: string; code: string; name: string; description: string | null; isActive: boolean }>;
  units: Array<{ id: string; companyId: string | null; parentId: string | null; type: 'BRANCH' | 'DEPARTMENT' | 'TEAM' | 'SHARED_SERVICE'; code: string; name: string; description: string | null; serviceKind: 'HR' | 'DATA' | 'MIS' | 'OTHER' | null; isActive: boolean }>;
  users: Array<{ id: string; personId: string; fullName: string; email: string; isActive: boolean; requiresPasswordChange: boolean }>;
  memberships: Array<{ id: string; companyId: string | null; personId: string; status: 'active' | 'suspended' | 'ended'; validFrom: string; validUntil: string | null }>;
  roles: Array<{ id: string; code: string; name: string; description: string | null; isSystem: boolean; isActive: boolean; permissions: string[] }>;
  assignments: Array<{ id: string; membershipId: string; roleId: string; scopeType: OrganizationScopeType; companyId: string | null; organizationUnitId: string | null; validUntil: string | null; assignedAt: string }>;
  permissions: Array<{ code: string; description: string }>;
  legacyRoleMappings: Array<{ legacyRoleCode: string; roleId: string | null; migrationStatus: 'UNMAPPED' | 'PARTIAL' | 'MAPPED' | 'REVIEW_REQUIRED'; notes: string | null }>;
}

export interface FoundationCustomer {
  id: string;
  identityId: string;
  canonicalIdentityId: string;
  fullName: string;
  phonePrimary: string;
  status: 'active' | 'merged';
  mergedIntoCustomerId: string | null;
  createdAt: string;
}

export interface CustomerIdentityMergeOperation {
  id: string;
  canonicalIdentityId: string;
  mergedIdentityId: string;
  status: 'active' | 'reversed';
  reason: string;
  mergedAt: string;
  reversedAt: string | null;
  reversalReason: string | null;
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

export type SalesMarketingLinkType = 'campaign' | 'promotion';

export interface SalesMarketingLink {
  id: string;
  type: SalesMarketingLinkType;
  referenceCode: string;
  displayName: string | null;
  context: Record<string, unknown>;
  linkedByName: string;
  linkedAt: string;
  relationshipId: string | null;
}

export interface SalesLead {
  id: string;
  trackingCode: string;
  customerId: string;
  canonicalIdentityId: string;
  customerName: string;
  company: { id: string; name: string };
  source: string;
  declaredInterest: string;
  priority: 'low' | 'normal' | 'high';
  status: SalesLeadStatus;
  campaignReference: string | null;
  promotionReference: string | null;
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
  calls: Array<{ id: string; salespersonName: string; companyName: string; campaignReference: string | null; marketingSnapshot: SalesMarketingLink[]; context: Record<string, unknown>; startedAt: string; endedAt: string; outcome: SalesCallOutcome; effective: boolean; note: string | null; callbackAt: string | null }>;
  marketingLinks: SalesMarketingLink[];
  relationship: null | { id: string; status: 'active' | 'released'; lockMode: 'none' | 'until_reassigned' | 'duration'; ownerMembershipId: string | null; ownerName: string | null; lockAcquiredAt: string | null; lockExpiresAt: string | null; updatedAt: string };
}

export interface SalesAssignee {
  membershipId: string;
  userAccountId: string;
  fullName: string;
}

export type SaleEntryMode = 'direct' | 'paper_entry';
export type InvoiceItemType = 'goods' | 'service';
export type InvoiceLineSourceType = 'promotion_core' | 'cross_sell' | 'upsell' | 'manual_addition';
export type SalesPaymentMethod = 'card_to_card' | 'bank_transfer' | 'payment_gateway' | 'cash' | 'cheque' | 'cod';
export type SalesInvoiceStatus =
  | 'awaiting_supervisor_approval' | 'awaiting_payment' | 'awaiting_financial_review'
  | 'partially_paid' | 'payment_correction_required' | 'overpayment_hold'
  | 'financially_approved' | 'cancellation_requested' | 'cancelled';
export type SalesPaymentStatus = 'declared' | 'approved' | 'needs_correction' | 'rejected' | 'superseded' | 'reversed';

export interface SalesInvoiceLineInput {
  itemType: InvoiceItemType;
  catalogReference?: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  discountAmount?: number;
  sourceType?: InvoiceLineSourceType;
  snapshot?: Record<string, unknown>;
}

export interface FoundationSalesInvoice {
  id: string;
  code: string;
  revision: number;
  status: SalesInvoiceStatus;
  paymentStatus: 'unpaid' | 'declared' | 'partial' | 'paid' | 'overpaid' | 'correction_required';
  currency: 'IRR';
  subtotalAmount: number;
  discountAmount: number;
  finalAmount: number;
  approvedPaymentAmount: number;
  supervisorApproval: null | { userAccountId: string; at: string };
  sale: {
    id: string;
    entryMode: SaleEntryMode;
    seller: { membershipId: string; name: string };
    actor: { userAccountId: string; name: string };
    customer: { id: string; canonicalIdentityId: string; name: string };
    leadId: string | null;
  };
  lines: Array<{
    id: string;
    lineNumber: number;
    itemType: InvoiceItemType;
    catalogReference: string | null;
    itemName: string;
    quantity: number;
    unitPrice: number;
    discountAmount: number;
    lineTotal: number;
    sourceType: InvoiceLineSourceType;
    fulfillmentStatus: string;
    snapshot: Record<string, unknown>;
  }>;
  payments: Array<{
    id: string;
    amount: number;
    method: SalesPaymentMethod;
    occurredAt: string;
    lastFourDigits: string | null;
    destinationAccountId: string | null;
    destinationAccountName: string | null;
    trackingNumber: string | null;
    receiptReference: string | null;
    status: SalesPaymentStatus;
    recorderName: string;
    reviewerName: string | null;
    reviewedAt: string | null;
    reviewReason: string | null;
    correctsPaymentId: string | null;
    supersededByPaymentId: string | null;
  }>;
  history: Array<{ id: string; type: string; reason: string | null; actorName: string; occurredAt: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface SalesPaymentInfrastructure {
  accounts: Array<{ id: string; name: string; bankName: string; cardLastFour: string | null }>;
  gateways: Array<{ id: string; name: string; providerCode: string; settlementAccountId: string }>;
  policies: Array<{ method: SalesPaymentMethod; enabled: boolean; manualReviewRequired: boolean }>;
}
