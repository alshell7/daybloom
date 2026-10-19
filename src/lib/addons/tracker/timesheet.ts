// Timesheets: tracked time per day and week in the app's time zone (engine/time.ts), with
// totals per task, project and block, daily goals, and app activity shares. Pure.

import { addDays, isoOf, MINUTE, startOfDayMs, weekday } from '../../engine/time';
import type { ISODate } from '../../engine/types';
import { endOf, mergeActivity } from './entries';
import type { AppTime, Entry } from './types';

/** Time for one key; `id` is null for entries without that field. */
export interface Total {
  id: string | null;
  ms: number;
}

/** The part of an entry that falls on one calendar day. */
export interface Piece {
  entry: Entry;
  date: ISODate;
  startMs: number;
  endMs: number;
}

export interface Goal {
  ms: number;
  met: boolean;
  /** 0..1, capped. */
  progress: number;
  remainingMs: number;
}

export interface DaySheet {
  date: ISODate;
  ms: number;
  byTask: Total[];
  byProject: Total[];
  byBlock: Total[];
  /** Null when there is no daily goal. */
  goal: Goal | null;
  /** In start order. */
  pieces: Piece[];
}

export interface Timesheet {
  from: ISODate;
  to: ISODate;
  ms: number;
  days: DaySheet[];
  byTask: Total[];
  byProject: Total[];
  byBlock: Total[];
  /** Days that reached the daily goal (0 when there is no goal). */
  daysMet: number;
}

export interface SheetOptions {
  now: number;
  /** Daily goal in minutes; 0 or absent = none. */
  goalMinutes?: number;
}

/** Cut an entry at each local midnight (DST-correct: such days last 23 or 25 hours). */
export function splitByDay(e: Entry, now: number): Piece[] {
  const end = endOf(e, now);
  const out: Piece[] = [];
  let s = e.startMs;
  let date = isoOf(s);
  // The cap guards against bad data: no entry spans thousands of days.
  for (let i = 0; s < end && i < 4000; i++) {
    const next = addDays(date, 1);
    const dayEnd = startOfDayMs(next);
    if (dayEnd > s) {
      const pieceEnd = Math.min(end, dayEnd);
      out.push({ entry: e, date, startMs: s, endMs: pieceEnd });
      s = pieceEnd;
    }
    date = next;
  }
  return out;
}

export function goalFor(ms: number, goalMinutes = 0): Goal | null {
  if (!(goalMinutes > 0)) return null;
  const goal = goalMinutes * MINUTE;
  return { ms: goal, met: ms >= goal, progress: Math.min(1, ms / goal), remainingMs: Math.max(0, goal - ms) };
}

function totals(pieces: Piece[], pick: (e: Entry) => string | undefined): Total[] {
  const m = new Map<string | null, number>();
  for (const p of pieces) {
    const k = pick(p.entry) ?? null;
    m.set(k, (m.get(k) ?? 0) + (p.endMs - p.startMs));
  }
  return [...m].map(([id, ms]) => ({ id, ms })).sort((a, b) => b.ms - a.ms);
}

function daySheet(date: ISODate, pieces: Piece[], goalMinutes?: number): DaySheet {
  const ms = pieces.reduce((s, p) => s + p.endMs - p.startMs, 0);
  return {
    date,
    ms,
    byTask: totals(pieces, (e) => e.taskId),
    byProject: totals(pieces, (e) => e.projectId),
    byBlock: totals(pieces, (e) => e.blockKey),
    goal: goalFor(ms, goalMinutes),
    pieces: pieces.sort((a, b) => a.startMs - b.startMs),
  };
}

/** Every day from `from` to `to` (inclusive), each with its totals, plus totals for the span. */
export function timesheet(entries: Entry[], from: ISODate, to: ISODate, { now, goalMinutes }: SheetOptions): Timesheet {
  const lo = startOfDayMs(from);
  const hi = startOfDayMs(addDays(to, 1));
  const byDate = new Map<ISODate, Piece[]>();
  for (let d = from, i = 0; d <= to && i < 4000; d = addDays(d, 1), i++) byDate.set(d, []);
  for (const e of entries) {
    if (e.startMs >= hi || endOf(e, now) <= lo) continue;
    for (const p of splitByDay(e, now)) byDate.get(p.date)?.push(p);
  }
  const days = [...byDate].map(([date, pieces]) => daySheet(date, pieces, goalMinutes));
  const all = days.flatMap((d) => d.pieces);
  return {
    from,
    to,
    ms: days.reduce((s, d) => s + d.ms, 0),
    days,
    byTask: totals(all, (e) => e.taskId),
    byProject: totals(all, (e) => e.projectId),
    byBlock: totals(all, (e) => e.blockKey),
    daysMet: days.filter((d) => d.goal?.met).length,
  };
}

/** First day of the week holding `date`. Monday by default, as on the planner's week strip. */
export function weekStartOf(date: ISODate, weekStartsOn: 0 | 1 = 1): ISODate {
  return addDays(date, -((weekday(date) - weekStartsOn + 7) % 7));
}

export function weekSheet(entries: Entry[], date: ISODate, opts: SheetOptions & { weekStartsOn?: 0 | 1 }): Timesheet {
  const from = weekStartOf(date, opts.weekStartsOn);
  return timesheet(entries, from, addDays(from, 6), opts);
}

export interface TodaySummary extends DaySheet {
  running: Entry | null;
  /** How long the running entry has run (all of it, not only today's part). */
  runningMs: number;
}

export function todaySummary(entries: Entry[], now: number, goalMinutes = 0): TodaySummary {
  const today = isoOf(now);
  const day = timesheet(entries, today, today, { now, goalMinutes }).days[0];
  const running = entries.find((e) => e.endMs == null) ?? null;
  return { ...day, running, runningMs: running ? Math.max(0, now - running.startMs) : 0 };
}

export interface WeekSummary extends Timesheet {
  /** Mean per day over the days so far this week (today included). */
  averageMs: number;
}

export function weekSummary(entries: Entry[], now: number, { goalMinutes = 0, weekStartsOn = 1 }: { goalMinutes?: number; weekStartsOn?: 0 | 1 } = {}): WeekSummary {
  const sheet = weekSheet(entries, isoOf(now), { now, goalMinutes, weekStartsOn });
  const today = isoOf(now);
  const sofar = sheet.days.filter((d) => d.date <= today).length || 1;
  return { ...sheet, averageMs: sheet.ms / sofar };
}

export interface AppShare extends AppTime {
  /** Share of all app time, 0–100, one decimal. */
  pct: number;
}

/**
 * Top apps across entries with their share of the sampled time. With `limit`, the rest are
 * gathered under `other` (default "Other").
 */
export function activitySummary(entries: Entry[], { limit, other = 'Other' }: { limit?: number; other?: string } = {}): AppShare[] {
  let all: AppTime[] = [];
  for (const e of entries) if (e.activity?.length) all = mergeActivity(all, e.activity);
  const total = all.reduce((s, a) => s + a.ms, 0);
  if (!total) return [];
  let rows = all;
  if (limit != null && limit >= 0 && rows.length > limit) {
    const rest = rows.slice(limit).reduce((s, a) => s + a.ms, 0);
    rows = [...rows.slice(0, limit), { app: other, ms: rest }];
  }
  return rows.map((a) => ({ ...a, pct: Math.round((a.ms / total) * 1000) / 10 }));
}
