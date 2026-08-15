export type OrganizationScopeType = 'WORKSPACE' | 'COMPANY' | 'BRANCH' | 'DEPARTMENT' | 'TEAM' | 'SELF';

export interface AuthenticatedSession {
  sessionId: string;
  userAccountId: string;
  personId: string;
  fullName: string;
  email: string;
  csrfToken: string;
  activeMembershipId: string | null;
  activeScopeType: OrganizationScopeType | null;
  activeScopeId: string | null;
}

export interface MembershipContext {
  membershipId: string;
  workspace: { id: string; name: string; slug: string };
  company: { id: string; name: string; code: string } | null;
  organizationUnit: { id: string; type: Exclude<OrganizationScopeType, 'WORKSPACE' | 'COMPANY' | 'SELF'>; name: string; code: string } | null;
  scope: { type: OrganizationScopeType; id: string };
  contextKey: string;
  roles: Array<{ id: string; code: string; name: string }>;
  permissions: string[];
}

export interface SessionView {
  user: { id: string; personId: string; fullName: string; email: string };
  memberships: MembershipContext[];
  activeContext: MembershipContext | null;
  csrfToken: string;
}
