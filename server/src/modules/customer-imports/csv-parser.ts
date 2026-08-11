import { AppError } from '../../shared/errors.js';

export const CUSTOMER_IMPORT_HEADERS = [
  'full_name', 'phone', 'phone_secondary', 'province', 'city', 'address', 'postal_code',
  'purchase_reference', 'purchase_date', 'purchase_amount', 'source_reference',
] as const;

export type CustomerImportHeader = typeof CUSTOMER_IMPORT_HEADERS[number];
export type ParsedCustomerImportRow = Record<CustomerImportHeader, string> & { rowNumber: number };

function parseCells(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]!;
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
      continue;
    }
    if (character === '"') {
      if (cell.length) throw new AppError(400, 'customer_import_csv_invalid', 'CSV quoting is invalid.');
      quoted = true;
    } else if (character === ',') {
      row.push(cell);
      cell = '';
    } else if (character === '\n') {
      row.push(cell.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }
  if (quoted) throw new AppError(400, 'customer_import_csv_invalid', 'CSV contains an unclosed quoted value.');
  if (cell.length || row.length) {
    row.push(cell.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows.filter((item) => item.some((value) => value.trim() !== ''));
}

export function parseCustomerImportCsv(input: string): ParsedCustomerImportRow[] {
  const rows = parseCells(input.replace(/^\uFEFF/, ''));
  if (rows.length < 2) throw new AppError(400, 'customer_import_csv_empty', 'CSV must contain a header and at least one data row.');
  if (rows.length > 501) throw new AppError(413, 'customer_import_row_limit', 'CSV may contain at most 500 data rows.');

  const headers = rows[0]!.map((value) => value.trim().toLowerCase());
  const duplicateHeaders = headers.filter((value, index) => headers.indexOf(value) !== index);
  if (duplicateHeaders.length) throw new AppError(400, 'customer_import_headers_invalid', 'CSV contains duplicate headers.');
  const unknown = headers.filter((value) => !CUSTOMER_IMPORT_HEADERS.includes(value as CustomerImportHeader));
  if (unknown.length || !headers.includes('full_name') || !headers.includes('phone')) {
    throw new AppError(400, 'customer_import_headers_invalid', 'CSV headers do not match customer-import-v1.');
  }

  return rows.slice(1).map((cells, index) => {
    if (cells.length !== headers.length) {
      throw new AppError(400, 'customer_import_columns_invalid', `CSV row ${index + 2} has an unexpected column count.`);
    }
    const record = Object.fromEntries(CUSTOMER_IMPORT_HEADERS.map((header) => [header, ''])) as Record<CustomerImportHeader, string>;
    headers.forEach((header, cellIndex) => { record[header as CustomerImportHeader] = cells[cellIndex]!.trim(); });
    return { ...record, rowNumber: index + 2 };
  });
}

const digitMap: Record<string, string> = {
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
};

export function normalizeDigits(value: string): string {
  return [...value].map((character) => digitMap[character] ?? character).join('');
}

export function normalizePhone(value: string): string {
  const digits = normalizeDigits(value).replace(/[^0-9]/g, '');
  if (digits.startsWith('0098')) return `0${digits.slice(4)}`;
  if (digits.startsWith('98')) return `0${digits.slice(2)}`;
  if (digits.startsWith('9') && digits.length === 10) return `0${digits}`;
  return digits;
}

export function normalizeText(value: string): string {
  return normalizeDigits(value)
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeIdentityText(value: string): string {
  return normalizeText(value).toLocaleLowerCase('fa-IR');
}
