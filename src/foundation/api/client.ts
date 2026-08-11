import type {
  ApiErrorPayload,
  CreateFoundationCustomer,
  DuplicateCheckResult,
  FoundationCustomer,
  FoundationCustomerProfile,
  FoundationSession,
  CustomerImportAction,
  CustomerImportJob,
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
  selectContext: (membershipId: string, csrfToken: string) => request<FoundationSession>('/session/context', {
    method: 'POST',
    body: JSON.stringify({ membershipId }),
  }, csrfToken),
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
