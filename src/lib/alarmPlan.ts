// When alarms ring, as pure functions (the store in alarms.svelte.ts calls them each tick).
//
// An alarm rings when the wall clock *passes* its block's start while the app is running: the
// previous tick was before the start and this one is at or after it. So launching the app
// after the start rings nothing old, moving a block into the past rings nothing, and a computer
// that wakes from sleep a few minutes late still rings (up to LATE_MS late, then it lets it go).
// Snoozes ring when their time comes, also after a reload; one that is very old is dropped.

import { MINUTE } from './engine/time';
import type { CategoryId } from './engine/types';

/** The latest an alarm (or a snooze) may still ring after its time. */
export const LATE_MS = 30 * MINUTE;

/** What a ring needs to show and do, copied from the block when it rings. */
export interface AlarmInfo {
  key: string;
  taskId: string | null;
  title: string;
  icon: string;
  category: CategoryId;
  startMs: number;
  endMs: number;
  /** A tone id from lib/alarm.ts. */
  tone: string;
}

export interface Ringing extends AlarmInfo {
  /** When it began ringing (this time round). */
  since: number;
  /** Times it was snoozed before this ring. */
  snoozes: number;
}

export interface Snoozed extends AlarmInfo {
  /** When it rings again. */
  at: number;
  snoozes: number;
}

/** Left by an alarm that rang out with nobody there: "Your alarm for X rang at 7:00". */
export interface AlarmNote extends AlarmInfo {
  rangAt: number;
}

export interface AlarmFile {
  ringing: Ringing | null;
  snoozed: Snoozed[];
  note: AlarmNote | null;
}

export const EMPTY_ALARMS: AlarmFile = { ringing: null, snoozed: [], note: null };

/** Did the clock pass `at` between the last tick and this one (and not too long ago)? */
export function crossed(prev: number, now: number, at: number): boolean {
  return prev > 0 && prev < at && at <= now && now - at < LATE_MS;
}

/** Snoozes whose time has come (soonest first), and the ones still waiting. Stale ones go. */
export function dueSnoozes(list: Snoozed[], now: number): { due: Snoozed[]; waiting: Snoozed[] } {
  const due: Snoozed[] = [];
  const waiting: Snoozed[] = [];
  for (const s of list) {
    if (s.at > now) waiting.push(s);
    else if (now - s.at < LATE_MS) due.push(s);
  }
  due.sort((a, b) => a.at - b.at);
  return { due, waiting };
}

/** Ms of ringing left before it stops by itself. */
export function ringLeft(r: Ringing, ringForMin: number, now: number): number {
  return r.since + Math.max(1, ringForMin) * MINUTE - now;
}

/** Length of the focus session "Start now" begins: the rest of the block, or all of it once it is over. */
export function startMinutes(a: AlarmInfo, now: number): number {
  const ms = a.endMs > now ? a.endMs - now : a.endMs - a.startMs;
  return Math.max(5, Math.round(ms / MINUTE));
}

/** Tidy whatever was stored (older or hand-edited files). */
export function migrateAlarms(raw: any): AlarmFile {
  const info = (x: any): x is AlarmInfo => !!x && typeof x.key === 'string' && Number.isFinite(x.startMs) && Number.isFinite(x.endMs);
  const ringing = info(raw?.ringing) && Number.isFinite(raw.ringing.since) ? { ...raw.ringing, snoozes: raw.ringing.snoozes ?? 0 } : null;
  const snoozed = Array.isArray(raw?.snoozed) ? raw.snoozed.filter((s: any) => Number.isFinite(s?.at) && info(s)).map((s: any) => ({ ...s, snoozes: s.snoozes ?? 1 })) : [];
  const note = info(raw?.note) && Number.isFinite(raw.note.rangAt) ? raw.note : null;
  return { ringing, snoozed, note };
}
