import type { ApiErrorPayload, CreateFoundationCustomer, FoundationCustomer, FoundationSession } from './contracts';

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
  if (init.body) headers.set('content-type', 'application/json');
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
  createCustomer: (input: CreateFoundationCustomer, csrfToken: string) => request<{ customer: FoundationCustomer }>('/customers', {
    method: 'POST',
    headers: { 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify(input),
  }, csrfToken),
};
