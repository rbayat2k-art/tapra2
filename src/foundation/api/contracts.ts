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

export interface ApiErrorPayload {
  error?: { code?: string; message?: string; correlationId?: string };
  correlationId?: string;
}
