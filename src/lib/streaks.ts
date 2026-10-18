// Forgiving streaks. A "rhythm" day is any day you finished something. Every 7 counted days
// earns a rest day (max 2 banked); a missed day quietly spends one instead of breaking the
// run. Routines get their own "in a row" counts, where a "let it go" is neutral, not a break.

import { categoryColor } from './engine/categories';
import { occurrencesBetween } from './engine/recurrence';
import { addDays, atMinutes, isoOf } from './engine/time';
import type { ISODate, Task } from './engine/types';

export const MILESTONES = [3, 7, 14, 21, 30, 50, 75, 100, 150, 200, 365];
const REST_EVERY = 7;
const MAX_REST = 2;

export type BeadState = 'done' | 'rest' | 'miss' | 'open';

export interface Rhythm {
  /** Counted days in the current run (rest days keep it alive but don't add). */
  current: number;
  best: number;
  /** Rest days banked right now. */
  rest: number;
  countedToday: boolean;
  /** The last 7 days, oldest first; today is last. */
  beads: { date: ISODate; state: BeadState }[];
}

/** Dates on which something was finished (task occurrences or backlog items). */
export function doneDates(tasks: Task[]): Set<ISODate> {
  const out = new Set<ISODate>();
  for (const t of tasks) {
    for (const d of t.completions) out.add(d);
    if (t.date === null && t.doneAt) out.add(isoOf(t.doneAt));
  }
  return out;
}

export function rhythm(tasks: Task[], nowMs: number): Rhythm {
  const today = isoOf(nowMs);
  const done = doneDates(tasks);
  const first = [...done].filter((d) => d <= today).sort()[0];
  const states = new Map<ISODate, BeadState>();
  let run = 0;
  let best = 0;
  let rest = 0;
  let sinceEarn = 0;

  if (first) {
    for (let d = first; d <= today; d = addDays(d, 1)) {
      if (done.has(d)) {
        run++;
        sinceEarn++;
        if (sinceEarn === REST_EVERY) {
          rest = Math.min(MAX_REST, rest + 1);
          sinceEarn = 0;
        }
        states.set(d, 'done');
      } else if (d === today) {
        states.set(d, 'open'); // still today: nothing is lost yet
      } else if (run > 0 && rest > 0) {
        rest--;
        states.set(d, 'rest');
      } else {
        run = 0;
        rest = 0;
        sinceEarn = 0;
        states.set(d, 'miss');
      }
      best = Math.max(best, run);
    }
  }

  const beads = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i - 6);
    return { date, state: states.get(date) ?? (date === today ? 'open' : 'miss') } as { date: ISODate; state: BeadState };
  });
  return { current: run, best, rest, countedToday: done.has(today), beads };
}

export interface RoutineStreak {
  taskId: string;
  title: string;
  icon: string;
  color: string;
  count: number;
}

/** Consecutive finished occurrences of a repeating task, counting back from the latest due one. */
export function routineStreak(task: Task, nowMs: number): number {
  if (!task.recurrence || !task.date) return 0;
  const today = isoOf(nowMs);
  const from = addDays(today, -400) > task.date ? addDays(today, -400) : task.date;
  const dates = occurrencesBetween(task, from, today).reverse();
  let count = 0;
  for (const d of dates) {
    if (task.completions.includes(d)) {
      count++;
      continue;
    }
    // Today's occurrence that hasn't ended yet is still open, not missed.
    const start = task.overrides[d]?.start ?? task.start;
    const end = start == null ? atMinutes(addDays(d, 1), 0) : atMinutes(d, start) + (task.overrides[d]?.duration ?? task.duration) * 60_000;
    if (d === today && nowMs < end) continue;
    if (task.acks?.includes(d)) continue; // "let it go" is neutral
    break;
  }
  return count;
}

export function routineStreaks(tasks: Task[], nowMs: number, dark = false): RoutineStreak[] {
  return tasks
    .filter((t) => t.recurrence)
    .map((t) => ({ taskId: t.id, title: t.title, icon: t.icon, color: categoryColor(t.category, dark), count: routineStreak(t, nowMs) }))
    .filter((r) => r.count >= 2)
    .sort((a, b) => b.count - a.count);
}

/** The milestone just reached, if `current` equals one. */
export function milestoneFor(current: number): number | null {
  return MILESTONES.includes(current) ? current : null;
}

export function milestoneLine(days: number): string {
  if (days === 3) return '3-day rhythm. Something is starting.';
  if (days === 7) return 'A 7-day rhythm — a whole week of showing up.';
  if (days === 14) return 'Two weeks of rhythm. This is becoming yours.';
  if (days === 30) return '30 days. A month of small, real progress.';
  if (days >= 100) return `${days} days of rhythm. Remarkable.`;
  return `${days}-day rhythm. Keep it gentle.`;
}
