// The month calendar's arithmetic, pure so it tests fast: each day's load (a small ring in the
// colours of its blocks), keyboard moves between days, weeks and months, and the gesture gate
// that turns a trackpad swipe on the week strip into exactly one week.

import { addDays, daysBetween, fromISODate, toISODate, weekday } from '../../lib/engine/time';
import type { ISODate } from '../../lib/engine/types';

/** One arc of a day's ring: where it starts and how long it is, as shares of the circle. */
export interface Arc {
  start: number;
  length: number;
  color: string;
  done: boolean;
  /** A calendar event or a salah block (not one of your tasks): drawn quieter. */
  quiet: boolean;
}

export interface DayLoad {
  arcs: Arc[];
  /** Your tasks that day, and how many are done. */
  tasks: number;
  done: number;
  /** Minutes of your tasks; events from calendars and addons are counted apart. */
  minutes: number;
  events: number;
  /** Every task done (and at least one): the day glows softly. */
  complete: boolean;
}

export interface LoadBlock {
  date: ISODate;
  kind: 'task' | 'event';
  done: boolean;
  color: string;
  startMs: number;
  endMs: number;
  skipped?: boolean;
}

/** The gap between two arcs, as a share of the circle. */
export const ARC_GAP = 0.025;

/**
 * Each day's ring: its blocks in time order, laid end to end from the top, a full turn being
 * the whole waking day (`wakingMin`). A day planned past full is scaled to fit, so the ring
 * closes instead of wrapping. Skipped events take no room.
 */
export function dayLoads(blocks: LoadBlock[], wakingMin: number): Map<ISODate, DayLoad> {
  const by = new Map<ISODate, LoadBlock[]>();
  for (const b of blocks) {
    if (b.skipped || b.endMs <= b.startMs) continue;
    const list = by.get(b.date);
    if (list) list.push(b);
    else by.set(b.date, [b]);
  }
  const out = new Map<ISODate, DayLoad>();
  const waking = Math.max(60, wakingMin);
  for (const [date, list] of by) {
    list.sort((a, b) => a.startMs - b.startMs);
    const shares = list.map((b) => (b.endMs - b.startMs) / 60_000 / waking);
    const gaps = Math.max(0, list.length - 1) * ARC_GAP;
    const total = shares.reduce((s, x) => s + x, 0);
    // Room for the arcs once the gaps are taken (a closed ring keeps one gap at the top too).
    const room = Math.max(0, 1 - gaps - (total + gaps >= 1 ? ARC_GAP : 0));
    const k = total > room ? room / total : 1;
    let at = 0;
    const arcs: Arc[] = list.map((b, i) => {
      const length = Math.max(0.012, shares[i] * k);
      const arc = { start: at, length, color: b.color, done: b.done, quiet: b.kind !== 'task' };
      at += length + ARC_GAP;
      return arc;
    });
    const tasks = list.filter((b) => b.kind === 'task');
    const done = tasks.filter((b) => b.done).length;
    out.set(date, {
      arcs,
      tasks: tasks.length,
      done,
      minutes: Math.round(tasks.reduce((s, b) => s + (b.endMs - b.startMs) / 60_000, 0)),
      events: list.length - tasks.length,
      complete: tasks.length > 0 && done === tasks.length,
    });
  }
  return out;
}

/** Monday of a date's week. */
export function weekStartOf(d: ISODate): ISODate {
  return addDays(d, -((weekday(d) + 6) % 7));
}

/** The same day of the month `n` months away, kept inside that month (31 Jan + 1 → 28 Feb). */
export function addMonths(d: ISODate, n: number): ISODate {
  const t = fromISODate(d);
  const first = new Date(t.getFullYear(), t.getMonth() + n, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return toISODate(new Date(first.getFullYear(), first.getMonth(), Math.min(t.getDate(), last)));
}

/**
 * Where a key moves the focused day: arrows by a day and a week, Home/End to the week's
 * Monday/Sunday, Page Up/Down by a month (by a year with Shift). Null for any other key.
 */
export function moveDay(d: ISODate, key: string, shift = false): ISODate | null {
  switch (key) {
    case 'ArrowLeft':
      return addDays(d, -1);
    case 'ArrowRight':
      return addDays(d, 1);
    case 'ArrowUp':
      return addDays(d, -7);
    case 'ArrowDown':
      return addDays(d, 7);
    case 'Home':
      return weekStartOf(d);
    case 'End':
      return addDays(weekStartOf(d), 6);
    case 'PageUp':
      return addMonths(d, shift ? -12 : -1);
    case 'PageDown':
      return addMonths(d, shift ? 12 : 1);
    default:
      return null;
  }
}

/** Which way a day lies from a week: -1 before it, 1 after it, 0 inside it. */
export function sideOf(day: ISODate, weekStart: ISODate): -1 | 0 | 1 {
  const n = daysBetween(weekStart, day);
  return n < 0 ? -1 : n > 6 ? 1 : 0;
}

/** "Oct" for the month most of a week falls in (its Thursday), for the week strip. */
export function weekMonth(weekStart: ISODate): number {
  return fromISODate(addDays(weekStart, 3)).getMonth();
}

/**
 * A trackpad swipe (wheel events with a momentum tail) or a touch drag → one step at a time.
 * Deltas add up until they pass `threshold`; then it steps once and ignores the rest of that
 * gesture, until `quietMs` pass with no events.
 */
export class SwipeGate {
  private acc = 0;
  private last = -Infinity;
  private spent = false;
  constructor(
    private threshold = 48,
    private quietMs = 220,
  ) {}

  /** Feed a delta (px, positive = toward later); returns the step to take, if any. */
  push(delta: number, now: number): -1 | 0 | 1 {
    if (now - this.last > this.quietMs) {
      this.acc = 0;
      this.spent = false;
    }
    this.last = now;
    if (this.spent) return 0;
    this.acc += delta;
    if (Math.abs(this.acc) < this.threshold) return 0;
    this.spent = true;
    const step = this.acc > 0 ? 1 : -1;
    this.acc = 0;
    return step;
  }
}
