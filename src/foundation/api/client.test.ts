import { describe, expect, it } from 'vitest';
import { localizedFoundationError } from './client';

describe('Foundation API error localization', () => {
  it('never exposes raw validation wording', () => {
    const message = localizedFoundationError(400, 'validation_failed');
    expect(message).toBe('اطلاعات واردشده معتبر نیست؛ موارد فرم را بررسی کنید.');
    expect(message).not.toMatch(/Request|validation failed/i);
  });

  it('localizes permission, company context, not-found, conflict and duplicate categories', () => {
    expect(localizedFoundationError(403, 'permission_denied')).toContain('دسترسی');
    expect(localizedFoundationError(409, 'company_context_required')).toContain('شرکت');
    expect(localizedFoundationError(404, 'warehouse_not_found')).toContain('یافت نشد');
    expect(localizedFoundationError(409, 'organization_conflict')).toContain('تداخل');
    expect(localizedFoundationError(409, 'idempotency_key_reused')).toContain('قبلاً');
  });
});
