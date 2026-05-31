/**
 * Parse boolean values from .bax instrument properties.
 * The parser stores `key=value` pairs as strings (e.g. tone_mix='true').
 */
export function parseBaxBool(value: unknown, defaultValue = false): boolean {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const s = String(value).toLowerCase().trim();
  if (s === 'true' || s === '1' || s === 'yes') return true;
  if (s === 'false' || s === '0' || s === 'no' || s === '') return false;
  return defaultValue;
}

/** Parse a numeric .bax property (string or number). */
export function parseBaxNumber(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}
