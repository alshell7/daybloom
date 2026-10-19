import { describe, expect, it } from 'vitest';
import { normalizeSpoken, wordsToNumber } from './spoken';

describe('wordsToNumber', () => {
  it('reads number words', () => {
    expect(wordsToNumber('seven')).toBe(7);
    expect(wordsToNumber('forty five')).toBe(45);
    expect(wordsToNumber('twenty-five')).toBe(25);
    expect(wordsToNumber('45')).toBe(45);
    expect(wordsToNumber('lunch')).toBeNull();
  });
});

describe('normalizeSpoken', () => {
  const cases: [string, string][] = [
    ['add gym at five p m for forty five minutes', 'add gym at 5pm for 45 minutes'],
    ['Add gym at 5 p.m. for 45 minutes.', 'Add gym at 5pm for 45 minutes'],
    ['Ad Yoga Tomorrow would seven at M for thirty minutes', 'Add Yoga Tomorrow at 7am for 30 minutes'],
    ['move lunch to two o’clock', 'move lunch to two o’clock'],
    ["move lunch to two o'clock", 'move lunch to 2:00'],
    ['start a twenty five minute focus', 'start a 25 minute focus'],
    ['remind me in two hours', 'remind me in 2 hours'],
    ['meeting at seven thirty am', 'meeting at 7:30am'],
    ['dinner at half past seven', 'dinner at 7:30'],
    ['standup at quarter to ten', 'standup at 9:45'],
    ['read for half an hour', 'read for 30 minutes'],
    ['um so add call one friend tomorrow', 'add call one friend tomorrow'],
    ['Hey Daybloom, what is next?', 'what is next?'],
    ['walk for an hour and a half', 'walk for 90 minutes'],
    ['Add yoga tomorrow at 7 and a half for 30 minutes', 'Add yoga tomorrow at 7:30 for 30 minutes'],
    ['tea at half four', 'tea at 4:30'],
  ];
  for (const [said, want] of cases) it(`“${said}”`, () => expect(normalizeSpoken(said)).toBe(want));
});
