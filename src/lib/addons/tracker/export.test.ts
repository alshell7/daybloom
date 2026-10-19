import { afterEach, describe, expect, it } from 'vitest';
import { MINUTE, setTimeZone } from '../../engine/time';
import { csvField, entriesCsv, roundedMinutes, roundMs, topAppsLabel } from './export';
import type { Entry } from './types';

afterEach(() => setTimeZone(null));

describe('rounding', () => {
  it('rounds to the nearest step, halves up', () => {
    expect(roundMs(7.5 * MINUTE, 15)).toBe(15 * MINUTE);
    expect(roundMs(7.4 * MINUTE, 15)).toBe(0);
    expect(roundMs(22.5 * MINUTE, 15)).toBe(30 * MINUTE);
    expect(roundMs(10 * MINUTE, 6)).toBe(12 * MINUTE);
    expect(roundMs(8 * MINUTE, 5)).toBe(10 * MINUTE);
    expect(roundMs(90_000, 1)).toBe(2 * MINUTE);
    expect(roundMs(89_999, 1)).toBe(MINUTE);
  });

  it('rounds up or down on request', () => {
    expect(roundMs(1 * MINUTE, 15, 'up')).toBe(15 * MINUTE);
    expect(roundMs(15 * MINUTE, 15, 'up')).toBe(15 * MINUTE);
    expect(roundMs(14.9 * MINUTE, 15, 'down')).toBe(0);
    expect(roundMs(30 * MINUTE, 15, 'down')).toBe(30 * MINUTE);
  });

  it('roundTo 0 keeps the exact time; minutes get two decimals', () => {
    expect(roundMs(12_345, 0)).toBe(12_345);
    expect(roundedMinutes(90_600, 0)).toBe(1.51);
    expect(roundedMinutes(25 * MINUTE + 20_000, 5)).toBe(25);
    expect(roundedMinutes(-5, 15)).toBe(0);
  });
});

describe('CSV', () => {
  it('quotes per RFC 4180', () => {
    expect(csvField('plain')).toBe('plain');
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('two\nlines')).toBe('"two\nlines"');
    expect(csvField('cr\rhere')).toBe('"cr\rhere"');
    expect(csvField('')).toBe('');
  });

  it('writes a header and one CRLF row per entry in start order', () => {
    setTimeZone('UTC');
    const d = (h: number, m = 0) => Date.UTC(2026, 9, 19, h, m);
    const entries: Entry[] = [
      {
        id: 'b',
        startMs: d(13),
        endMs: d(13, 52),
        taskId: 't2',
        note: 'Call with "Ana", re: budget\nfollow-up',
        source: 'manual',
      },
      {
        id: 'a',
        startMs: d(9),
        endMs: d(10, 7),
        taskId: 't1',
        projectId: 'p1',
        source: 'tracker',
        activity: [
          { app: 'Code', ms: 40 * MINUTE },
          { app: 'Safari', ms: 15 * MINUTE },
          { app: 'Slack', ms: 4 * MINUTE },
          { app: 'Mail', ms: 1 * MINUTE },
        ],
      },
      { id: 'c', startMs: d(15), endMs: null, note: '=HYPERLINK("x")', source: 'focus' },
    ];
    const csv = entriesCsv(entries, {
      now: d(15, 20),
      roundTo: 15,
      taskName: (e) => (e.taskId === 't1' ? 'Write, edit' : undefined),
      projectName: (e) => (e.projectId ? 'Book' : undefined),
    });
    expect(csv.endsWith('\r\n')).toBe(true);
    const rows = csv.split('\r\n');
    expect(rows[0]).toBe('date,start,end,minutes,task,project,note,source,top apps');
    expect(rows[1]).toBe('2026-10-19,09:00,10:07,60,"Write, edit",Book,,tracker,Code 67%; Safari 25%; Slack 7%');
    expect(rows[2]).toBe('2026-10-19,13:00,13:52,45,t2,,"Call with ""Ana"", re: budget\nfollow-up",manual,');
    // Running: no end, minutes so far; a formula-looking note is defused.
    expect(rows[3]).toBe(`2026-10-19,15:00,,15,,,"'=HYPERLINK(""x"")",focus,`);
    expect(rows).toHaveLength(5);
  });

  it('can skip running entries, keep formulas and use exact minutes', () => {
    setTimeZone('UTC');
    const entries: Entry[] = [
      { id: 'a', startMs: Date.UTC(2026, 9, 19, 9), endMs: Date.UTC(2026, 9, 19, 9, 0, 30), note: '+1', source: 'manual' },
      { id: 'b', startMs: Date.UTC(2026, 9, 19, 10), endMs: null, source: 'tracker' },
    ];
    const rows = entriesCsv(entries, { now: Date.UTC(2026, 9, 19, 11), includeRunning: false, guardFormulas: false }).split('\r\n');
    expect(rows[1]).toBe('2026-10-19,09:00,09:00,0.5,,,+1,manual,');
    expect(rows).toHaveLength(3);
  });

  it('labels an entry with its top apps', () => {
    const e: Entry = { id: 'a', startMs: 1, endMs: 2, source: 'tracker', activity: [{ app: 'B', ms: 1 }, { app: 'A', ms: 3 }] };
    expect(topAppsLabel(e)).toBe('A 75%; B 25%');
    expect(topAppsLabel(e, 1)).toBe('A 75%');
    expect(topAppsLabel({ ...e, activity: undefined })).toBe('');
  });
});
