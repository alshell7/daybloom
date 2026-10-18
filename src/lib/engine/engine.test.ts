import { describe, expect, it } from 'vitest';
import { assignLanes, blocksInRange, freeGaps, nowState, taskBlocks } from './blocks';
import { describeRecurrence, occurrencesBetween, occursOn, toRRule } from './recurrence';
import { addDays, atMinutes, daysBetween, formatDuration, MINUTE } from './time';
import type { Task } from './types';

function task(p: Partial<Task>): Task {
  return {
    id: 't',
    title: 'T',
    icon: 'laptop',
    category: 'focus',
    date: '2026-10-19',
    start: 9 * 60,
    duration: 60,
    notes: '',
    subtasks: [],
    recurrence: null,
    completions: [],
    skips: [],
    overrides: {},
    alerts: [5],
    createdAt: 0,
    updatedAt: 0,
    ...p,
  };
}

describe('time', () => {
  it('handles day math across month and DST boundaries', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(daysBetween('2026-03-01', '2026-04-01')).toBe(31);
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
  });
  it('formats durations compactly', () => {
    expect(formatDuration(25 * MINUTE)).toBe('25m');
    expect(formatDuration(90 * MINUTE)).toBe('1h 30m');
    expect(formatDuration(120 * MINUTE)).toBe('2h');
    expect(formatDuration(24 * MINUTE + 10_000)).toBe('25m');
  });
});

describe('recurrence', () => {
  it('daily with interval', () => {
    const t = task({ recurrence: { freq: 'daily', interval: 2 } });
    expect(occurrencesBetween(t, '2026-10-19', '2026-10-25')).toEqual([
      '2026-10-19',
      '2026-10-21',
      '2026-10-23',
      '2026-10-25',
    ]);
  });

  it('weekdays only', () => {
    // 2026-10-19 is a Monday
    const t = task({ recurrence: { freq: 'weekly', interval: 1, byWeekday: [1, 2, 3, 4, 5] } });
    const dates = occurrencesBetween(t, '2026-10-19', '2026-10-26');
    expect(dates).toEqual(['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-26']);
    expect(describeRecurrence(t.recurrence, t.date)).toBe('Every weekday');
  });

  it('every other week on Mon/Thu', () => {
    const t = task({ recurrence: { freq: 'weekly', interval: 2, byWeekday: [1, 4] } });
    const dates = occurrencesBetween(t, '2026-10-19', '2026-11-08');
    expect(dates).toEqual(['2026-10-19', '2026-10-22', '2026-11-02', '2026-11-05']);
    expect(describeRecurrence(t.recurrence, t.date)).toBe('Every 2 weeks on Mon, Thu');
  });

  it('monthly on the 31st clamps to month end', () => {
    const t = task({ date: '2026-01-31', recurrence: { freq: 'monthly', interval: 1 } });
    expect(occursOn(t, '2026-02-28')).toBe(true);
    expect(occursOn(t, '2026-04-30')).toBe(true);
    expect(occursOn(t, '2026-04-29')).toBe(false);
  });

  it('respects count, until and skips', () => {
    const counted = task({ recurrence: { freq: 'daily', interval: 1, count: 3 } });
    expect(occurrencesBetween(counted, '2026-10-01', '2026-10-31')).toEqual(['2026-10-19', '2026-10-20', '2026-10-21']);
    const until = task({ recurrence: { freq: 'weekly', interval: 1, until: '2026-11-02' } });
    expect(occurrencesBetween(until, '2026-10-01', '2026-12-31')).toEqual(['2026-10-19', '2026-10-26', '2026-11-02']);
    const skipped = task({ recurrence: { freq: 'daily', interval: 1 }, skips: ['2026-10-20'] });
    expect(occursOn(skipped, '2026-10-20')).toBe(false);
    expect(occursOn(skipped, '2026-10-21')).toBe(true);
  });

  it('weekly with count walks occurrences across weeks', () => {
    const t = task({ recurrence: { freq: 'weekly', interval: 1, byWeekday: [1, 3], count: 3 } });
    expect(occurrencesBetween(t, '2026-10-19', '2026-11-30')).toEqual(['2026-10-19', '2026-10-21', '2026-10-26']);
  });

  it('serialises to RRULE', () => {
    expect(toRRule({ freq: 'weekly', interval: 2, byWeekday: [1, 4], count: 6 })).toBe(
      'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH;COUNT=6',
    );
  });
});

describe('blocks', () => {
  it('applies per-occurrence overrides and completions', () => {
    const t = task({
      recurrence: { freq: 'daily', interval: 1 },
      overrides: { '2026-10-20': { start: 14 * 60, duration: 30 } },
      completions: ['2026-10-19'],
    });
    const [a, b] = taskBlocks(t, '2026-10-19', '2026-10-20');
    expect(a.done).toBe(true);
    expect(b.done).toBe(false);
    expect(b.startMs).toBe(atMinutes('2026-10-20', 14 * 60));
    expect(b.endMs - b.startMs).toBe(30 * MINUTE);
  });

  it('carries the completion time so an early finish can be drawn as time spent', () => {
    const at = atMinutes('2026-10-19', 9 * 60 + 25);
    const t = task({ completions: ['2026-10-19'], completedAt: { '2026-10-19': at } });
    const [b] = taskBlocks(t, '2026-10-19', '2026-10-19');
    expect(b.done).toBe(true);
    expect(b.doneAt).toBe(at);
  });

  it('includes blocks spilling over midnight', () => {
    const t = task({ date: '2026-10-19', start: 23 * 60, duration: 120 });
    const from = atMinutes('2026-10-20', 0);
    const blocks = blocksInRange([t], [], from, from + 12 * 60 * MINUTE);
    expect(blocks).toHaveLength(1);
  });

  it('lanes overlapping blocks and finds now/next/gaps', () => {
    const a = task({ id: 'a', start: 9 * 60, duration: 60 });
    const b = task({ id: 'b', start: 9 * 60 + 30, duration: 60 });
    const c = task({ id: 'c', start: 12 * 60, duration: 30 });
    const day = atMinutes('2026-10-19', 0);
    const blocks = blocksInRange([a, b, c], [], day, day + 24 * 60 * MINUTE);
    const lanes = assignLanes(blocks);
    expect(lanes.get(blocks[0].key)).toBe(0);
    expect(lanes.get(blocks[1].key)).toBe(1);
    expect(lanes.get(blocks[2].key)).toBe(0);

    const now = atMinutes('2026-10-19', 9 * 60 + 45);
    const s = nowState(blocks, now);
    expect(s.current?.taskId).toBe('a');
    expect(s.remainingMs).toBe(15 * MINUTE);
    expect(s.next?.taskId).toBe('c');

    const gaps = freeGaps(blocks, atMinutes('2026-10-19', 8 * 60), atMinutes('2026-10-19', 13 * 60));
    expect(gaps.map((g) => (g.endMs - g.startMs) / MINUTE)).toEqual([60, 90, 30]);
  });
});
