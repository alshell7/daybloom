// Integer money maths. Every amount is a whole number of the currency's minor unit, and
// every division rounds half away from zero, exactly (BigInt when a product would leave
// the safe-integer range). Floats only appear when formatting for display.

import type { Minor } from './types';

const digitsCache = new Map<string, number>();

/** Decimal places of a currency's minor unit: USD 2, JPY 0, BHD 3. Unknown codes → 2. */
export function currencyDigits(currency: string): number {
  const code = (currency || '').toUpperCase();
  const hit = digitsCache.get(code);
  if (hit !== undefined) return hit;
  let d = 2;
  try {
    d = new Intl.NumberFormat('en', { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    d = 2;
  }
  digitsCache.set(code, d);
  return d;
}

/** Well-formed ISO 4217 code (three letters), upper-cased; otherwise null. */
export function normalizeCurrency(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) return null;
  try {
    new Intl.NumberFormat('en', { style: 'currency', currency: code });
  } catch {
    return null;
  }
  return code;
}

function roundDivSafe(n: number, d: number): number {
  const neg = n < 0 !== d < 0;
  const a = Math.abs(n);
  const b = Math.abs(d);
  const r = a % b;
  let q = (a - r) / b;
  if (r * 2 >= b) q += 1;
  return neg && q !== 0 ? -q : q;
}

function roundDivBig(n: bigint, d: bigint): number {
  const neg = n < 0n !== d < 0n;
  const a = n < 0n ? -n : n;
  const b = d < 0n ? -d : d;
  let q = a / b;
  if ((a % b) * 2n >= b) q += 1n;
  return Number(neg ? -q : q);
}

/** round(a × b ÷ c), half away from zero, exact for integer inputs. Non-integers are rounded first. */
export function mulDiv(a: number, b: number, c: number): number {
  a = Math.round(a);
  b = Math.round(b);
  c = Math.round(c);
  if (c === 0 || !Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) return 0;
  const p = a * b;
  if (Number.isSafeInteger(p) && Number.isSafeInteger(c)) return roundDivSafe(p, c);
  return roundDivBig(BigInt(a) * BigInt(b), BigInt(c));
}

/** A percentage of an amount, rounded: 4 decimal places of the percentage are honoured. */
export function percentOf(amount: Minor, pct: number): Minor {
  if (!Number.isFinite(pct) || pct === 0) return 0;
  return mulDiv(amount, Math.round(pct * 10_000), 1_000_000);
}

/** Minutes → hundredths of an hour, rounded (25 min → 42, i.e. 0.42 h). */
export function hundredthsOfHour(minutes: number): number {
  return mulDiv(minutes, 100, 60);
}

/** Minutes → hours rounded to two decimals (the quantity an invoice shows). */
export function hoursOf(minutes: number): number {
  return hundredthsOfHour(minutes) / 100;
}

/** Price of `minutes` at an hourly rate: round(hours₂ × rate), with hours rounded to 0.01 first. */
export function hourlyAmount(minutes: number, hourlyRate: Minor): Minor {
  return mulDiv(hundredthsOfHour(minutes), hourlyRate, 100);
}

/** round(quantity × unitPrice), with the quantity taken to two decimals. */
export function lineAmount(quantity: number, unitPrice: Minor): Minor {
  return mulDiv(Math.round((Number.isFinite(quantity) ? quantity : 0) * 100), unitPrice, 100);
}

/**
 * A major-unit amount (what a person types: 12.5, "1234.56") → minor units, rounded half up
 * on the decimal digits so 1.005 USD is 101 cents. Grouping commas, spaces and _ are ignored.
 */
export function toMinor(major: number | string, currency: string): Minor {
  const d = currencyDigits(currency);
  let s: string;
  if (typeof major === 'number') {
    if (!Number.isFinite(major)) return 0;
    s = major.toFixed(Math.min(20, d + 4));
  } else s = String(major).replace(/[\s,_]/g, '');
  const m = /^([+-])?(\d*)(?:\.(\d*))?$/.exec(s);
  if (!m || (!m[2] && !m[3])) {
    const n = Number(major);
    return Number.isFinite(n) ? Math.round(n * 10 ** d) : 0;
  }
  const neg = m[1] === '-';
  const frac = m[3] ?? '';
  const head = frac.slice(0, d).padEnd(d, '0');
  let v = Number(m[2] || '0') * 10 ** d + Number(head || '0');
  if (frac.length > d && frac.charCodeAt(d) - 48 >= 5) v += 1;
  return neg && v !== 0 ? -v : v;
}

/** Minor units → a major-unit number (for charts and inputs; not for further maths). */
export function fromMinor(minor: Minor, currency: string): number {
  return minor / 10 ** currencyDigits(currency);
}

/** Minor units → an exact plain decimal string: 1250 USD → "12.50", 1200 JPY → "1200", -5 → "-0.05". */
export function minorToDecimal(minor: Minor, currency: string): string {
  const d = currencyDigits(currency);
  const neg = minor < 0;
  const abs = String(Math.abs(Math.round(minor)));
  if (d === 0) return (neg ? '-' : '') + abs;
  const padded = abs.padStart(d + 1, '0');
  return `${neg ? '-' : ''}${padded.slice(0, -d)}.${padded.slice(-d)}`;
}

const fmtCache = new Map<string, Intl.NumberFormat>();

/** "$1,234.50", "¥1,235", "1.234,50 €" — Intl currency formatting at the currency's own precision. */
export function formatMoney(minor: Minor, currency: string, locale?: string): string {
  const code = (currency || 'USD').toUpperCase();
  const d = currencyDigits(code);
  const k = `${locale ?? ''}|${code}`;
  let fmt = fmtCache.get(k);
  if (!fmt) {
    try {
      fmt = new Intl.NumberFormat(locale, { style: 'currency', currency: code, minimumFractionDigits: d, maximumFractionDigits: d });
    } catch {
      return `${minorToDecimal(minor, code)} ${code}`;
    }
    fmtCache.set(k, fmt);
  }
  return fmt.format(minor / 10 ** d);
}

/** "12.5", "7.25" — a plain localised number (quantities, percentages). */
export function formatNumber(n: number, maxDigits = 2, locale?: string): string {
  try {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: maxDigits }).format(n);
  } catch {
    return String(n);
  }
}
