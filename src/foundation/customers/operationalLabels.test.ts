import { describe, expect, it } from 'vitest';
import { customerImportReasonLabel } from './CustomerImportView';
import { customerEventLabel, customerSourceLabel } from './SaasCustomersView';

describe('customer operational labels', () => {
  it('does not expose unknown backend event or source codes', () => {
    expect(customerEventLabel('future_internal_event')).toBe('رویداد مشتری');
    expect(customerSourceLabel('future_internal_source')).toBe('منبع ثبت‌شده');
  });

  it('does not expose unknown import classifier codes', () => {
    expect(customerImportReasonLabel('internal_classifier_code')).toBe('نیازمند بررسی دستی');
  });
});
