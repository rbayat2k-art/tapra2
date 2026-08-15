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
  user: { id: string; personId: string; fullName: string; email: string };
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
