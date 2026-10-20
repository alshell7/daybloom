import { describe, expect, it } from 'vitest';
import { normalize, numberWords, SYMBOLS, toIds } from './g2p';

describe('alef voice: text', () => {
  it('spells out numbers, times and lengths', () => {
    expect(numberWords(0)).toBe('zero');
    expect(numberWords(45)).toBe('forty five');
    expect(numberWords(1230)).toBe('one thousand two hundred thirty');
    expect(normalize('A walk at 3:30pm for 45m.')).toBe('A walk at three thirty p m for forty five minutes.');
    expect(normalize('Lunch at 12:05')).toBe('Lunch at twelve oh five');
    expect(normalize('1h 30m left, 80% done')).toBe('one hour thirty minutes left, eighty percent done');
    expect(normalize('See https://example.com now')).toBe('See a link now');
  });

  it('makes ids with blanks between phonemes, padded at both ends', () => {
    const cmu = { HI: ['HH', 'AY1'] };
    const { x, tone, lang } = toIds('Hi!', cmu, null);
    // _ hh ay ! _  → 5 phonemes, 11 ids with blanks.
    expect(x).toHaveLength(11);
    expect(x.filter((_, i) => i % 2 === 0).every((v) => v === 0)).toBe(true);
    expect(x[1]).toBe(SYMBOLS.indexOf('_'));
    expect(x[3]).toBe(SYMBOLS.indexOf('hh'));
    expect(x[5]).toBe(SYMBOLS.indexOf('ay'));
    expect(tone[5]).toBe(2 + 7);
    expect(lang[3]).toBe(2);
  });
});
