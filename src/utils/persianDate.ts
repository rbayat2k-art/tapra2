// Persian Date utility & Unique Tracking Code Generator

export function getJalaliNow(): string {
  const date = new Date();
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    calendar: 'persian',
  };
  
  try {
    const formatter = new Intl.DateTimeFormat('fa-IR-u-nu-latn', options);
    const parts = formatter.formatToParts(date);
    const year = parts.find(p => p.type === 'year')?.value || '1403';
    const month = parts.find(p => p.type === 'month')?.value || '05';
    const day = parts.find(p => p.type === 'day')?.value || '10';
    const hour = parts.find(p => p.type === 'hour')?.value || '12';
    const minute = parts.find(p => p.type === 'minute')?.value || '00';
    return `${year}/${month}/${day} - ${hour}:${minute}`;
  } catch {
    return '1403/05/10 - 12:00';
  }
}

/**
 * Same as getJalaliNow but includes seconds - used where the exact second of
 * registration matters (e.g. after-sales support call logging).
 */
export function getJalaliNowWithSeconds(): string {
  const date = new Date();
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    calendar: 'persian',
  };

  try {
    const formatter = new Intl.DateTimeFormat('fa-IR-u-nu-latn', options);
    const parts = formatter.formatToParts(date);
    const year = parts.find(p => p.type === 'year')?.value || '1403';
    const month = parts.find(p => p.type === 'month')?.value || '05';
    const day = parts.find(p => p.type === 'day')?.value || '10';
    const hour = parts.find(p => p.type === 'hour')?.value || '12';
    const minute = parts.find(p => p.type === 'minute')?.value || '00';
    const second = parts.find(p => p.type === 'second')?.value || '00';
    return `${year}/${month}/${day} - ${hour}:${minute}:${second}`;
  } catch {
    return '1403/05/10 - 12:00:00';
  }
}

/**
 * Generates unique tracking code: 5 digits with 1 Capital letter prefix
 * e.g. K50001, K50002
 */
export function getJalaliToday(): string {
  const date = new Date();
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    calendar: 'persian',
  };
  
  try {
    const formatter = new Intl.DateTimeFormat('fa-IR-u-nu-latn', options);
    const parts = formatter.formatToParts(date);
    const year = parts.find(p => p.type === 'year')?.value || '1403';
    const month = parts.find(p => p.type === 'month')?.value || '05';
    const day = parts.find(p => p.type === 'day')?.value || '10';
    return `${year}/${month}/${day}`;
  } catch {
    return '1403/05/10';
  }
}

export function generateAutoLetterNumber(seqCounter: number = 101): string {
  const date = new Date();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const today = getJalaliToday();
  const year = today.split('/')[0] || '1403';
  return `${seqCounter}/${year}/ب-${hours}:${minutes}`;
}
export function generateTrackingCode(counter: number): string {
  const prefixes = ['K', 'P', 'A', 'M', 'S', 'T'];
  const prefix = prefixes[counter % prefixes.length];
  const numberPart = (50000 + counter).toString();
  return `${prefix}${numberPart}`;
}
