import type {
  ApiErrorPayload,
  CreateFoundationCustomer,
  DuplicateCheckResult,
  FoundationCustomer,
  FoundationCustomerProfile,
  FoundationSession,
  CustomerImportAction,
  CustomerImportJob,
  FoundationMembership,
  OrganizationScopeType,
  OrganizationSnapshot,
} from './contracts';

export class FoundationApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly correlationId?: string,
  ) {
    super(message);
    this.name = 'FoundationApiError';
  }
}

async function request<T>(path: string, init: RequestInit = {}, csrfToken?: string): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('accept', 'application/json');
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  if (csrfToken) headers.set('x-csrf-token', csrfToken);

  const response = await fetch(`/api/v1${path}`, { ...init, headers, credentials: 'include' });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as ApiErrorPayload;
    throw new FoundationApiError(
      response.status,
      payload.error?.code ?? 'request_failed',
      payload.error?.message ?? 'درخواست با خطا مواجه شد.',
      payload.correlationId ?? payload.error?.correlationId,
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const foundationApi = {
  login: (email: string, password: string) => request<FoundationSession>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  }),
  session: () => request<FoundationSession>('/auth/session'),
  logout: (csrfToken: string) => request<void>('/auth/logout', { method: 'POST' }, csrfToken),
  changePassword: (input: { currentPassword: string; newPassword: string }, csrfToken: string) => request<FoundationSession>('/auth/password', { method: 'POST', body: JSON.stringify(input) }, csrfToken),
  selectContext: (context: Pick<FoundationMembership, 'membershipId' | 'scope'>, csrfToken: string) => request<FoundationSession>('/session/context', {
    method: 'POST',
    body: JSON.stringify({ membershipId: context.membershipId, scopeType: context.scope.type, scopeId: context.scope.id }),
  }, csrfToken),
  readOrganization: () => request<{ organization: OrganizationSnapshot }>('/organization'),
  createCompany: (input: { code: string; name: string; description?: string; isActive?: boolean }, csrfToken: string) => request<{ company: OrganizationSnapshot['companies'][number] }>('/organization/companies', { method: 'POST', body: JSON.stringify(input) }, csrfToken),
  updateCompany: (id: string, input: { code: string; name: string; description?: string; isActive?: boolean }, csrfToken: string) => request<{ company: OrganizationSnapshot['companies'][number] }>(`/organization/companies/${id}`, { method: 'PUT', body: JSON.stringify(input) }, csrfToken),
  createOrganizationUnit: (input: { companyId?: string; parentId?: string; type: OrganizationSnapshot['units'][number]['type']; code: string; name: string; description?: string; serviceKind?: 'HR' | 'DATA' | 'MIS' | 'OTHER'; isActive?: boolean }, csrfToken: string) => request<{ unit: OrganizationSnapshot['units'][number] }>('/organization/units', { method: 'POST', body: JSON.stringify(input) }, csrfToken),
  updateOrganizationUnit: (id: string, input: { companyId?: string; parentId?: string; type: OrganizationSnapshot['units'][number]['type']; code: string; name: string; description?: string; serviceKind?: 'HR' | 'DATA' | 'MIS' | 'OTHER'; isActive?: boolean }, csrfToken: string) => request<{ unit: OrganizationSnapshot['units'][number] }>(`/organization/units/${id}`, { method: 'PUT', body: JSON.stringify(input) }, csrfToken),
  createOrganizationUser: (input: { fullName: string; email: string }, csrfToken: string) => request<{ account: OrganizationSnapshot['users'][number]; temporaryPassword: string }>('/organization/users', { method: 'POST', body: JSON.stringify(input) }, csrfToken),
  updateOrganizationUserStatus: (id: string, isActive: boolean, csrfToken: string) => request<{ account: { id: string; isActive: boolean } }>(`/organization/users/${id}/status`, { method: 'PATCH', body: JSON.stringify({ isActive }) }, csrfToken),
  createMembership: (input: { personId: string; companyId?: string }, csrfToken: string) => request<{ membership: OrganizationSnapshot['memberships'][number] }>('/organization/memberships', { method: 'POST', body: JSON.stringify(input) }, csrfToken),
  updateMembershipStatus: (id: string, status: 'active' | 'suspended' | 'ended', csrfToken: string) => request<{ membership: OrganizationSnapshot['memberships'][number] }>(`/organization/memberships/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }, csrfToken),
  createRole: (input: { code: string; name: string; description?: string; permissionCodes: string[] }, csrfToken: string) => request<{ role: OrganizationSnapshot['roles'][number] }>('/organization/roles', { method: 'POST', body: JSON.stringify(input) }, csrfToken),
  assignRole: (input: { membershipId: string; roleId: string; scopeType: OrganizationScopeType; scopeId?: string; validUntil?: string }, csrfToken: string) => request<{ assignment: OrganizationSnapshot['assignments'][number] }>('/organization/role-assignments', { method: 'POST', body: JSON.stringify(input) }, csrfToken),
  revokeRole: (id: string, reason: string, csrfToken: string) => request<void>(`/organization/role-assignments/${id}`, { method: 'DELETE', body: JSON.stringify({ reason }) }, csrfToken),
  startImpersonation: (input: { targetUserAccountId: string; targetMembershipId: string; targetScopeType: OrganizationScopeType; targetScopeId: string; reason: string; durationMinutes: number }, csrfToken: string) => request<FoundationSession>('/impersonation/start', { method: 'POST', body: JSON.stringify(input) }, csrfToken),
  stopImpersonation: (reason: string, csrfToken: string) => request<FoundationSession>('/impersonation/stop', { method: 'POST', body: JSON.stringify({ reason }) }, csrfToken),
  listCustomers: () => request<{ customers: FoundationCustomer[] }>('/customers'),
  readCustomer: (customerId: string) => request<{ customer: FoundationCustomerProfile }>(`/customers/${customerId}`),
  createCustomer: (input: CreateFoundationCustomer, csrfToken: string) => request<{ customer: FoundationCustomerProfile }>('/customers', {
    method: 'POST',
    headers: { 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify(input),
  }, csrfToken),
  checkCustomerDuplicates: (input: { phone: string; fullName?: string }, csrfToken: string) => request<DuplicateCheckResult>('/customers/duplicates/check', {
    method: 'POST',
    body: JSON.stringify(input),
  }, csrfToken),
  addCustomerPhone: (customerId: string, input: { value: string; label?: string; isPrimary?: boolean }, csrfToken: string) => request<{ customer: FoundationCustomerProfile }>(`/customers/${customerId}/phones`, {
    method: 'POST',
    headers: { 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify(input),
  }, csrfToken),
  addCustomerAddress: (customerId: string, input: { province?: string; city?: string; addressText: string; postalCode?: string; label?: string; isPrimary?: boolean }, csrfToken: string) => request<{ customer: FoundationCustomerProfile }>(`/customers/${customerId}/addresses`, {
    method: 'POST',
    headers: { 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify(input),
  }, csrfToken),
  mergeCustomers: (input: { customerId: string; targetCustomerId: string; reason: string }, csrfToken: string) => request<{ operationId: string; canonicalCustomer: FoundationCustomerProfile }>('/customers/merge', {
    method: 'POST',
    headers: { 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify(input),
  }, csrfToken),
  unmergeCustomers: (operationId: string, reason: string, csrfToken: string) => request<{ canonicalCustomer: FoundationCustomerProfile; restoredCustomer: FoundationCustomerProfile }>(`/customers/merges/${operationId}/unmerge`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  }, csrfToken),
  listCustomerImports: () => request<{ imports: CustomerImportJob[] }>('/customer-imports'),
  readCustomerImport: (jobId: string) => request<{ import: CustomerImportJob }>(`/customer-imports/${jobId}`),
  stageCustomerImport: (file: File, csv: string, sourceName: string, csrfToken: string) => request<{ import: CustomerImportJob }>('/customer-imports', {
    method: 'POST',
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'idempotency-key': crypto.randomUUID(),
      'x-file-name': file.name,
      'x-import-source': encodeURIComponent(sourceName),
    },
    body: csv,
  }, csrfToken),
  applySafeCustomerImportDecisions: (jobId: string, csrfToken: string) => request<{ import: CustomerImportJob }>(`/customer-imports/${jobId}/apply-safe-decisions`, {
    method: 'POST', body: JSON.stringify({}),
  }, csrfToken),
  decideCustomerImportRecord: (
    jobId: string, recordId: string,
    decision: { action: CustomerImportAction; targetCustomerId?: string; targetRecordId?: string },
    csrfToken: string,
  ) => request<{ import: CustomerImportJob }>(`/customer-imports/${jobId}/records/${recordId}/decision`, {
    method: 'PUT', body: JSON.stringify(decision),
  }, csrfToken),
  approveCustomerImport: (jobId: string, csrfToken: string) => request<{ import: CustomerImportJob }>(`/customer-imports/${jobId}/approve`, {
    method: 'POST', body: JSON.stringify({}),
  }, csrfToken),
};
