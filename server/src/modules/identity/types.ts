export interface AuthenticatedSession {
  sessionId: string;
  userAccountId: string;
  personId: string;
  fullName: string;
  email: string;
  csrfToken: string;
  activeMembershipId: string | null;
}

export interface MembershipContext {
  membershipId: string;
  workspace: { id: string; name: string; slug: string };
  company: { id: string; name: string; code: string } | null;
  permissions: string[];
}

export interface SessionView {
  user: { id: string; personId: string; fullName: string; email: string };
  memberships: MembershipContext[];
  activeContext: MembershipContext | null;
  csrfToken: string;
}
