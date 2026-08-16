import { AppError } from '../../shared/errors.js';

const SCALE = 1_000_000n;
const QUANTITY_PATTERN = /^(0|[1-9][0-9]{0,13})(?:\.([0-9]{1,6}))?$/;

export function parseQuantity(value: string, options: { positive?: boolean } = {}): bigint {
  const match = QUANTITY_PATTERN.exec(value);
  if (!match) throw new AppError(400, 'invalid_inventory_quantity', 'Inventory quantity must be a decimal string with at most 6 decimal places.');
  const whole = BigInt(match[1]!);
  const fractional = BigInt((match[2] ?? '').padEnd(6, '0'));
  const scaled = whole * SCALE + fractional;
  if (options.positive && scaled <= 0n) {
    throw new AppError(400, 'invalid_inventory_quantity', 'Inventory quantity must be positive.');
  }
  return scaled;
}

export function formatQuantity(value: bigint): string {
  const sign = value < 0n ? '-' : '';
  const absolute = value < 0n ? -value : value;
  const whole = absolute / SCALE;
  const fractional = (absolute % SCALE).toString().padStart(6, '0');
  return `${sign}${whole}.${fractional}`;
}

export function normalizeQuantity(value: string, options: { positive?: boolean } = {}): string {
  return formatQuantity(parseQuantity(value, options));
}

export function addQuantities(values: readonly string[]): string {
  return formatQuantity(values.reduce((sum, value) => sum + parseQuantity(value), 0n));
}
