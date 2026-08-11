const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

export interface PortalDateTimeParts {
  date: string;
  time: string;
  display: string;
}

/** Presentation-only normalization; stored monetary values remain numeric. */
export function toLatinDigits(value: string): string {
  return value.replace(/[۰-۹٠-٩]/g, (digit) => {
    const persianIndex = PERSIAN_DIGITS.indexOf(digit);
    return String(persianIndex >= 0 ? persianIndex : ARABIC_DIGITS.indexOf(digit));
  });
}

export function formatPortalAmount(value: number | string | null | undefined): string {
  const numeric = typeof value === 'string' ? Number(toLatinDigits(value).replace(/,/g, '')) : Number(value);
  if (!Number.isFinite(numeric)) return '0';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(numeric);
}

export function formatPortalMoney(value: number | string | null | undefined, unit = 'ریال'): string {
  return `${formatPortalAmount(value)} ${unit}`;
}

function pad(value: string | undefined, width = 2): string {
  return String(Number(value || 0)).padStart(width, '0');
}

function formatIsoInTehran(iso: string): string {
  const formatter = new Intl.DateTimeFormat('fa-IR-u-ca-persian-nu-latn', {
    timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });
  const parts = formatter.formatToParts(new Date(iso));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  return `${get('year')}/${get('month')}/${get('day')} - ${get('hour')}:${get('minute')}:${get('second')}`;
}

export function formatPortalDate(value?: string | null): string {
  if (!value) return '—';
  const normalized = toLatinDigits(value.trim());
  const match = normalized.match(/(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
  if (!match) return '—';
  return `${match[1]}/${pad(match[2])}/${pad(match[3])}`;
}

export function formatPortalTime(value?: string | null): string {
  if (!value) return '—';
  const normalized = toLatinDigits(value.trim());
  const match = normalized.match(/(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
  if (!match) return '—';
  return `${pad(match[1])}:${pad(match[2])}:${pad(match[3])}`;
}

/**
 * Accepts the current prototype's ISO timestamps and legacy Jalali display strings,
 * but always emits the portal contract: YYYY/MM/DD and HH:mm:ss with Latin digits.
 */
export function splitPortalTimestamp(value?: string | null): PortalDateTimeParts {
  if (!value) return { date: '—', time: '—', display: '—' };
  const normalized = toLatinDigits(value.trim());
  const isoLike = /^\d{4}-\d{2}-\d{2}T/.test(normalized);
  const source = isoLike && !Number.isNaN(Date.parse(normalized))
    ? formatIsoInTehran(normalized)
    : normalized;
  const date = formatPortalDate(source);
  const time = formatPortalTime(source);
  return { date, time, display: time === '—' ? date : `${date} - ${time}` };
}

export function formatPortalTimestamp(value?: string | null): string {
  return splitPortalTimestamp(value).display;
}

export function combinePortalDateTime(
  date?: string | null,
  time?: string | null,
  fallbackTimestamp?: string | null
): PortalDateTimeParts {
  const fallback = splitPortalTimestamp(fallbackTimestamp);
  const normalizedDate = formatPortalDate(date);
  const normalizedTime = formatPortalTime(time);
  const finalDate = normalizedDate === '—' ? fallback.date : normalizedDate;
  const finalTime = normalizedTime === '—' ? fallback.time : normalizedTime;
  return {
    date: finalDate,
    time: finalTime,
    display: finalTime === '—' ? finalDate : `${finalDate} - ${finalTime}`
  };
}

export function getPortalNowTimestamp(now = new Date()): string {
  return splitPortalTimestamp(now.toISOString()).display;
}

export function getPortalToday(now = new Date()): string {
  return splitPortalTimestamp(now.toISOString()).date;
}
