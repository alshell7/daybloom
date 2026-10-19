import { afterEach, describe, expect, it } from 'vitest';
import { atMinutes, HOUR, MINUTE, setTimeZone } from '../../engine/time';
import { activitySummary, splitByDay, timesheet, todaySummary, weekSheet, weekStartOf, weekSummary } from './timesheet';
import type { Entry } from './types';

afterEach(() => setTimeZone(null));

let n = 0;
const entry = (startMs: number, endMs: number | null, extra: Partial<Entry> = {}): Entry => ({ id: `e${++n}`, startMs, endMs, source: 'tracker', ...extra });
const hours = (ms: number) => ms / HOUR;

describe('days', () => {
  it('cuts an entry at local midnight', () => {
    setTimeZone('Asia/Tokyo');
    const e = entry(atMinutes('2026-10-19', 23 * 60 + 30), atMinutes('2026-10-20', 45));
    const pieces = splitByDay(e, 0);
    expect(pieces.map((p) => [p.date, (p.endMs - p.startMs) / MINUTE])).toEqual([
      ['2026-10-19', 30],
      ['2026-10-20', 45],
    ]);
    const sheet = timesheet([e], '2026-10-19', '2026-10-20', { now: 0 });
    expect(sheet.days.map((d) => d.ms / MINUTE)).toEqual([30, 45]);
    expect(sheet.ms).toBe(75 * MINUTE);
  });

  it('counts the short spring day in Europe/Berlin as 23 hours', () => {
    setTimeZone('Europe/Berlin');
    // 2026-03-29: clocks jump 02:00 → 03:00.
    const e = entry(atMinutes('2026-03-28', 22 * 60), atMinutes('2026-03-30', 60));
    expect(e.startMs).toBe(Date.UTC(2026, 2, 28, 21, 0)); // 22:00 CET
    const sheet = timesheet([e], '2026-03-28', '2026-03-30', { now: 0 });
    expect(sheet.days.map((d) => [d.date, hours(d.ms)])).toEqual([
      ['2026-03-28', 2],
      ['2026-03-29', 23],
      ['2026-03-30', 1],
    ]);
    expect(hours(sheet.ms)).toBe(26);
    // 01:30 → 03:30 on the wall clock is one real hour.
    const short = entry(atMinutes('2026-03-29', 90), atMinutes('2026-03-29', 210));
    expect(timesheet([short], '2026-03-29', '2026-03-29', { now: 0 }).ms).toBe(HOUR);
  });

  it('counts the long autumn day in Europe/Berlin as 25 hours', () => {
    setTimeZone('Europe/Berlin');
    // 2026-10-25: clocks fall back 03:00 → 02:00.
    const e = entry(atMinutes('2026-10-25', 0), atMinutes('2026-10-26', 0));
    const sheet = timesheet([e], '2026-10-24', '2026-10-26', { now: 0 });
    expect(sheet.days.map((d) => hours(d.ms))).toEqual([0, 25, 0]);
  });

  it('includes empty days and clips entries to the range', () => {
    setTimeZone('UTC');
    const e = entry(Date.UTC(2026, 9, 18, 22), Date.UTC(2026, 9, 19, 2));
    const sheet = timesheet([e], '2026-10-19', '2026-10-21', { now: 0 });
    expect(sheet.days.map((d) => [d.date, hours(d.ms)])).toEqual([
      ['2026-10-19', 2],
      ['2026-10-20', 0],
      ['2026-10-21', 0],
    ]);
  });

  it('a running entry counts up to now', () => {
    setTimeZone('UTC');
    const now = Date.UTC(2026, 9, 19, 11);
    const sheet = timesheet([entry(Date.UTC(2026, 9, 19, 9), null)], '2026-10-19', '2026-10-19', { now });
    expect(hours(sheet.ms)).toBe(2);
  });
});

describe('totals and goals', () => {
  it('totals per task, project and block, largest first', () => {
    setTimeZone('UTC');
    const d = (h: number) => Date.UTC(2026, 9, 19, h);
    const list = [
      entry(d(8), d(9), { taskId: 'a', projectId: 'p', blockKey: 'task:a@2026-10-19' }),
      entry(d(9), d(11), { taskId: 'b', projectId: 'p' }),
      entry(d(11), d(12), { taskId: 'a' }),
      entry(d(13), d(13) + 30 * MINUTE),
    ];
    const s = timesheet(list, '2026-10-19', '2026-10-19', { now: 0, goalMinutes: 240 });
    expect(s.byTask).toEqual([
      { id: 'a', ms: 2 * HOUR },
      { id: 'b', ms: 2 * HOUR },
      { id: null, ms: 30 * MINUTE },
    ]);
    expect(s.byProject).toEqual([
      { id: 'p', ms: 3 * HOUR },
      { id: null, ms: 1.5 * HOUR },
    ]);
    expect(s.byBlock[1]).toEqual({ id: 'task:a@2026-10-19', ms: HOUR });
    expect(s.days[0].goal).toEqual({ ms: 4 * HOUR, met: true, progress: 1, remainingMs: 0 });
    expect(s.daysMet).toBe(1);
    const half = timesheet(list, '2026-10-19', '2026-10-19', { now: 0, goalMinutes: 540 }).days[0].goal!;
    expect(half).toMatchObject({ met: false, progress: 0.5, remainingMs: 4.5 * HOUR });
    expect(timesheet(list, '2026-10-19', '2026-10-19', { now: 0 }).days[0].goal).toBeNull();
  });

  it('weeks start on Monday by default', () => {
    expect(weekStartOf('2026-10-21')).toBe('2026-10-19');
    expect(weekStartOf('2026-10-19')).toBe('2026-10-19');
    expect(weekStartOf('2026-10-25')).toBe('2026-10-19');
    expect(weekStartOf('2026-10-21', 0)).toBe('2026-10-18');
  });

  it('a week sheet holds seven days and counts goal days', () => {
    setTimeZone('UTC');
    const list = [
      entry(Date.UTC(2026, 9, 19, 9), Date.UTC(2026, 9, 19, 10)),
      entry(Date.UTC(2026, 9, 20, 9), Date.UTC(2026, 9, 20, 9, 30)),
      entry(Date.UTC(2026, 9, 26, 9), Date.UTC(2026, 9, 26, 10)), // next week
    ];
    const w = weekSheet(list, '2026-10-22', { now: 0, goalMinutes: 60 });
    expect(w.days.map((d) => d.date)).toEqual(['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']);
    expect(hours(w.ms)).toBe(1.5);
    expect(w.daysMet).toBe(1);
  });

  it('summarises today and this week', () => {
    setTimeZone('UTC');
    const now = Date.UTC(2026, 9, 20, 12); // Tuesday
    const run = entry(Date.UTC(2026, 9, 20, 11), null, { taskId: 'x' });
    const list = [entry(Date.UTC(2026, 9, 19, 9), Date.UTC(2026, 9, 19, 12)), entry(Date.UTC(2026, 9, 20, 9), Date.UTC(2026, 9, 20, 10)), run];
    const today = todaySummary(list, now, 120);
    expect(today.date).toBe('2026-10-20');
    expect(hours(today.ms)).toBe(2);
    expect(today.running?.id).toBe(run.id);
    expect(today.runningMs).toBe(HOUR);
    expect(today.goal?.met).toBe(true);
    const week = weekSummary(list, now);
    expect(week.from).toBe('2026-10-19');
    expect(hours(week.ms)).toBe(5);
    expect(hours(week.averageMs)).toBe(2.5);
  });
});

describe('activity summary', () => {
  it('top apps across entries with percentages, the rest as Other', () => {
    const list = [
      entry(1, 2, { activity: [{ app: 'Code', ms: 600 }, { app: 'Safari', ms: 200 }] }),
      entry(3, 4, { activity: [{ app: 'Code', ms: 100 }, { app: 'Slack', ms: 50 }, { app: 'Mail', ms: 50 }] }),
      entry(5, 6),
    ];
    expect(activitySummary(list)).toEqual([
      { app: 'Code', ms: 700, pct: 70 },
      { app: 'Safari', ms: 200, pct: 20 },
      { app: 'Slack', ms: 50, pct: 5 },
      { app: 'Mail', ms: 50, pct: 5 },
    ]);
    expect(activitySummary(list, { limit: 2 })).toEqual([
      { app: 'Code', ms: 700, pct: 70 },
      { app: 'Safari', ms: 200, pct: 20 },
      { app: 'Other', ms: 100, pct: 10 },
    ]);
    expect(activitySummary([entry(1, 2)])).toEqual([]);
  });
});
