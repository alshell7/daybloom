import { describe, expect, it } from 'vitest';
import { atMinutes, addDays } from './engine/time';
import type { Task } from './engine/types';
import { milestoneFor, rhythm, routineStreak } from './streaks';

const TODAY = '2026-10-19';
const NOW = atMinutes(TODAY, 20 * 60);

function task(p: Partial<Task>): Task {
  return {
    id: Math.random().toString(36).slice(2),
    title: 'T',
    icon: 'laptop',
    category: 'focus',
    date: TODAY,
    start: 9 * 60,
    duration: 30,
    notes: '',
    subtasks: [],
    recurrence: null,
    completions: [],
    skips: [],
    overrides: {},
    alerts: [],
    createdAt: 0,
    updatedAt: 0,
    ...p,
  };
}

/** One one-off finished task per listed day offset (0 = today). */
const finishedOn = (...offsets: number[]) =>
  offsets.map((o) => task({ date: addDays(TODAY, o), completions: [addDays(TODAY, o)] }));

describe('rhythm', () => {
  it('counts consecutive days and keeps today open until it ends', () => {
    const r = rhythm(finishedOn(-3, -2, -1), NOW);
    expect(r.current).toBe(3);
    expect(r.countedToday).toBe(false);
    expect(r.beads.at(-1)!.state).toBe('open');
    expect(rhythm(finishedOn(-3, -2, -1, 0), NOW).current).toBe(4);
  });

  it('breaks on a missed day when no rest day is banked', () => {
    const r = rhythm(finishedOn(-5, -4, -2, -1), NOW);
    expect(r.current).toBe(2);
    expect(r.best).toBe(2);
    expect(r.beads.find((b) => b.date === addDays(TODAY, -3))!.state).toBe('miss');
  });

  it('a week earns a rest day that quietly covers one miss', () => {
    // 7 days in a row, one missed day, then 2 more
    const r = rhythm(finishedOn(-10, -9, -8, -7, -6, -5, -4, -2, -1), NOW);
    expect(r.current).toBe(9);
    expect(r.rest).toBe(0);
    expect(r.beads.find((b) => b.date === addDays(TODAY, -3))!.state).toBe('rest');
  });

  it('backlog items finished on a day count too', () => {
    const t = task({ date: null, start: null, doneAt: atMinutes(addDays(TODAY, -1), 18 * 60) });
    expect(rhythm([t], NOW).current).toBe(1);
  });
});

describe('routine streaks', () => {
  it('counts back over finished occurrences; "let go" is neutral', () => {
    const t = task({
      date: addDays(TODAY, -6),
      recurrence: { freq: 'daily', interval: 1 },
      completions: [-6, -5, -4, -2, -1].map((o) => addDays(TODAY, o)),
      acks: [addDays(TODAY, -3)],
    });
    // today 09:00–09:30 already passed and isn't done → streak broken at today
    expect(routineStreak(t, NOW)).toBe(0);
    // earlier in the morning, today's block is still open → 5 in a row (−3 was let go)
    expect(routineStreak(t, atMinutes(TODAY, 8 * 60))).toBe(5);
  });
});

describe('milestones', () => {
  it('only fires on milestone days', () => {
    expect(milestoneFor(7)).toBe(7);
    expect(milestoneFor(8)).toBeNull();
  });
});
