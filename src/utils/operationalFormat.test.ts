import { describe, expect, it } from 'vitest';
import {
  combinePortalDateTime,
  formatPortalAmount,
  formatPortalDate,
  formatPortalMoney,
  formatPortalTime,
  getPortalNowTimestamp,
  getPortalToday,
  splitPortalTimestamp,
  toLatinDigits
} from './operationalFormat';

describe('operational presentation contract', () => {
  it('formats monetary values with Latin digits and thousands separators', () => {
    expect(formatPortalAmount(10000000)).toBe('10,000,000');
    expect(formatPortalMoney('۱۲۳۴۵۶')).toBe('123,456 ریال');
  });

  it('normalizes Persian and Arabic digits without changing other text', () => {
    expect(toLatinDigits('۱۴۰۵/۰۵/۱۷')).toBe('1405/05/17');
    expect(toLatinDigits('١٢:٣٤')).toBe('12:34');
  });

  it('normalizes Jalali date and always emits seconds in time', () => {
    expect(formatPortalDate('۱۴۰۵/۵/۷')).toBe('1405/05/07');
    expect(formatPortalTime('۹:۳:۲')).toBe('09:03:02');
    expect(formatPortalTime('14:08')).toBe('14:08:00');
  });

  it('splits legacy display timestamps into adjacent report fields', () => {
    expect(splitPortalTimestamp('۱۴۰۵/۰۵/۱۷ - ۱۴:۲۹')).toEqual({
      date: '1405/05/17', time: '14:29:00', display: '1405/05/17 - 14:29:00'
    });
  });

  it('fills a missing legacy payment time from its recorded timestamp', () => {
    expect(combinePortalDateTime('1403/05/07', undefined, '1403/05/07 - 09:12')).toEqual({
      date: '1403/05/07', time: '09:12:00', display: '1403/05/07 - 09:12:00'
    });
  });

  it('formats ISO timestamps in Tehran-local Jalali form with seconds', () => {
    const result = splitPortalTimestamp('2026-08-09T10:20:30.000Z');
    expect(result).toEqual({ date: '1405/05/18', time: '13:50:30', display: '1405/05/18 - 13:50:30' });
    expect(getPortalToday(new Date('2026-08-09T10:20:30.000Z'))).toBe('1405/05/18');
    expect(getPortalNowTimestamp(new Date('2026-08-09T10:20:30.000Z'))).toBe('1405/05/18 - 13:50:30');
  });

  it('uses a safe placeholder for missing values', () => {
    expect(splitPortalTimestamp(undefined)).toEqual({ date: '—', time: '—', display: '—' });
  });
});
