import { describe, expect, it } from 'vitest';
import { dayLabel, fromHHMM, monthGrid, parseDayText, parseTimeText, quickDays, toHHMM } from './pickers';

const T = '2026-10-20'; // a Tuesday
const NOW = new Date(2026, 9, 20, 11, 40).getTime();

describe('typed times', () => {
  const t24 = (s: string) => parseTimeText(s, { hour12: false, nowMinutes: 700 });
  const t12 = (s: string, near?: number) => parseTimeText(s, { hour12: true, near });

  it('reads the usual ways of writing a time', () => {
    expect(t24('930')).toBe(570);
    expect(t24('0930')).toBe(570);
    expect(t24('9:30')).toBe(570);
    expect(t24('9.30')).toBe(570);
    expect(t24('9h30')).toBe(570);
    expect(t24('1430')).toBe(870);
    expect(t24('21')).toBe(1260);
    expect(t24('9')).toBe(540);
    expect(t24('9p')).toBe(1260);
    expect(t24('2:30 pm')).toBe(870);
    expect(t24('12am')).toBe(0);
    expect(t24('12pm')).toBe(720);
    expect(t24('noon')).toBe(720);
    expect(t24('midnight')).toBe(0);
    expect(t24('now')).toBe(700);
  });

  it('refuses what is not a time', () => {
    for (const s of ['', '25:00', '9:75', '13pm', 'soon', '12345']) expect(t24(s)).toBeNull();
  });

  it('places a bare hour near the time being changed, in 12-hour style', () => {
    expect(t12('6', 7 * 60)).toBe(6 * 60); // a wake-up
    expect(t12('3', 14 * 60)).toBe(15 * 60); // an afternoon block
    expect(t12('11', 22 * 60)).toBe(23 * 60);
    expect(t12('9:30', 8 * 60)).toBe(570);
    expect(t12('12', 13 * 60)).toBe(720);
    // A block: the waking-hours one wins; a tie leans to the afternoon.
    expect(parseTimeText('3', { hour12: true, near: 9 * 60, awake: { from: 420, to: 1380 } })).toBe(15 * 60);
    expect(parseTimeText('8', { hour12: true, near: 14 * 60, awake: { from: 420, to: 1380 } })).toBe(20 * 60);
    expect(parseTimeText('3', { hour12: true, near: 9 * 60 })).toBe(15 * 60);
  });

  it('converts HH:MM', () => {
    expect(toHHMM(65)).toBe('01:05');
    expect(toHHMM(1440 + 30)).toBe('00:30');
    expect(fromHHMM('07:30')).toBe(450);
    expect(fromHHMM('')).toBeNull();
    expect(fromHHMM('24:00')).toBeNull();
  });
});

describe('typed days', () => {
  const d = (s: string) => parseDayText(s, T, NOW);

  it('reads words, offsets and dates', () => {
    expect(d('today')).toBe(T);
    expect(d('tmr')).toBe('2026-10-21');
    expect(d('yesterday')).toBe('2026-10-19');
    expect(d('fri')).toBe('2026-10-23');
    expect(d('next tue')).toBe('2026-10-27');
    expect(d('in 3 days')).toBe('2026-10-23');
    expect(d('+3')).toBe('2026-10-23');
    expect(d('+2w')).toBe('2026-11-03');
    expect(d('+1m')).toBe('2026-11-20');
    expect(d('next week')).toBe('2026-10-26');
    expect(d('weekend')).toBe('2026-10-24');
    expect(d('2026-11-02')).toBe('2026-11-02');
  });

  it('picks the nearest year for a day and month', () => {
    expect(d('30 oct')).toBe('2026-10-30');
    expect(d('oct 30')).toBe('2026-10-30');
    expect(d('1st oct')).toBe('2026-10-01');
    expect(d('5 jan')).toBe('2027-01-05');
    expect(d('30/10')).toBe('2026-10-30');
    expect(d('30.10.2027')).toBe('2027-10-30');
    expect(d('dec 1, 2026')).toBe('2026-12-01');
  });

  it('reads a bare day as the next one', () => {
    expect(d('25')).toBe('2026-10-25');
    expect(d('5th')).toBe('2026-11-05');
    expect(d('31')).toBe('2026-10-31');
  });

  it('refuses what is not a day', () => {
    for (const s of ['', 'soon', '31/2', '45', 'feb 30']) expect(d(s)).toBeNull();
  });
});

describe('labels and the grid', () => {
  it('names days kindly', () => {
    expect(dayLabel(T, T)).toBe('Today');
    expect(dayLabel('2026-10-21', T)).toBe('Tomorrow');
    expect(dayLabel('2026-10-23', T)).toBe('Fri 23 Oct');
    expect(dayLabel('2027-01-05', T)).toBe('Tue 5 Jan 2027');
  });

  it('offers the days people pick most', () => {
    expect(quickDays(T).map((q) => `${q.label} ${q.date}`)).toEqual(['Today 2026-10-20', 'Tomorrow 2026-10-21', 'This weekend 2026-10-24', 'Next week 2026-10-26', 'In a week 2026-10-27']);
    expect(quickDays('2026-10-24').map((q) => q.label)).toEqual(['Today', 'Tomorrow', 'Next week', 'In a week']);
  });

  it('lays out six Monday-first weeks', () => {
    const g = monthGrid(2026, 9);
    expect(g).toHaveLength(42);
    expect(g[0]).toBe('2026-09-28');
    expect(g[3]).toBe('2026-10-01');
  });
});
