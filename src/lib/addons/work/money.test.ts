import { describe, expect, it } from 'vitest';
import {
  currencyDigits,
  formatMoney,
  fromMinor,
  hourlyAmount,
  hoursOf,
  lineAmount,
  minorToDecimal,
  mulDiv,
  normalizeCurrency,
  percentOf,
  toMinor,
} from './money';

describe('integer money maths', () => {
  it('rounds half away from zero, exactly', () => {
    expect(mulDiv(1, 1, 2)).toBe(1);
    expect(mulDiv(3, 1, 2)).toBe(2);
    expect(mulDiv(-1, 1, 2)).toBe(-1);
    expect(mulDiv(-3, 1, 2)).toBe(-2);
    expect(mulDiv(10, 1, 3)).toBe(3);
    expect(mulDiv(0, 5, 7)).toBe(0);
    expect(Object.is(mulDiv(-1, 1, 3), -0)).toBe(false);
  });

  it('stays exact beyond the safe-integer range', () => {
    // 9e15 × 3 overflows a double's integers; the BigInt path keeps every digit.
    expect(mulDiv(9_000_000_000_000_001, 3, 3)).toBe(9_000_000_000_000_000 + 1);
    expect(mulDiv(2 ** 52, 1000, 1000)).toBe(2 ** 52);
  });

  it('takes percentages to four decimals', () => {
    expect(percentOf(10_000, 7.25)).toBe(725);
    expect(percentOf(7050, 7.25)).toBe(511); // 511.125
    expect(percentOf(1005, 10)).toBe(101); // 100.5 rounds up
    expect(percentOf(999, 0)).toBe(0);
  });

  it('prices time on hours rounded to 0.01', () => {
    expect(hoursOf(25)).toBe(0.42);
    expect(hoursOf(90)).toBe(1.5);
    expect(hourlyAmount(25, 10_000)).toBe(4200); // 0.42 h × $100
    expect(hourlyAmount(60, 3333)).toBe(3333);
    expect(hourlyAmount(50, 3333)).toBe(2766); // 0.83 × 33.33 = 27.6639
    expect(lineAmount(1.5, 3333)).toBe(5000); // 49.995 → 50.00
  });
});

describe('currencies', () => {
  it('knows minor-unit precision', () => {
    expect(currencyDigits('USD')).toBe(2);
    expect(currencyDigits('JPY')).toBe(0);
    expect(currencyDigits('BHD')).toBe(3);
    expect(currencyDigits('???')).toBe(2);
  });

  it('normalises codes', () => {
    expect(normalizeCurrency('eur')).toBe('EUR');
    expect(normalizeCurrency(' gbp ')).toBe('GBP');
    expect(normalizeCurrency('EURO')).toBeNull();
    expect(normalizeCurrency(42)).toBeNull();
  });

  it('parses typed amounts to minor units', () => {
    expect(toMinor(12.5, 'USD')).toBe(1250);
    expect(toMinor(1.005, 'USD')).toBe(101);
    expect(toMinor('1,234.56', 'USD')).toBe(123_456);
    expect(toMinor('-0.015', 'USD')).toBe(-2);
    expect(toMinor(1234.5, 'JPY')).toBe(1235);
    expect(toMinor('1.2345', 'BHD')).toBe(1235);
    expect(toMinor('abc', 'USD')).toBe(0);
    expect(fromMinor(1250, 'USD')).toBe(12.5);
    expect(fromMinor(1250, 'JPY')).toBe(1250);
  });

  it('writes exact decimals for CSV', () => {
    expect(minorToDecimal(1250, 'USD')).toBe('12.50');
    expect(minorToDecimal(5, 'USD')).toBe('0.05');
    expect(minorToDecimal(-5, 'USD')).toBe('-0.05');
    expect(minorToDecimal(1200, 'JPY')).toBe('1200');
    expect(minorToDecimal(1, 'BHD')).toBe('0.001');
  });

  it('formats with Intl at the currency precision', () => {
    expect(formatMoney(123_450, 'USD', 'en-US')).toBe('$1,234.50');
    expect(formatMoney(1540, 'JPY', 'en-US')).toBe('¥1,540');
    expect(formatMoney(123_450, 'EUR', 'de-DE')).toMatch(/^1\.234,50\s€$/);
  });
});
