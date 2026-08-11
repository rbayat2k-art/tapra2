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
  phoneSecondary: string | null;
  address: string | null;
  province: string | null;
  city: string | null;
  postalCode: string | null;
  createdAt: string;
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

export interface ApiErrorPayload {
  error?: { code?: string; message?: string; correlationId?: string };
  correlationId?: string;
}
