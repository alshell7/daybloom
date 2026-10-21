// A sample day for the dials on this page. It is synthetic: the same plan the app's onboarding
// shows, laid on the visitor's own clock, so the hand points at their real "now".

import { atMinutes, HOUR, MINUTE, minutesOfDay, startOfDay } from './time';
import type { CategoryId } from './themes';

export type IconName =
  | 'pill' | 'coffee' | 'footprints' | 'video' | 'laptop' | 'mail' | 'utensils' | 'phone'
  | 'book-open' | 'dumbbell' | 'cooking-pot' | 'languages' | 'moon' | 'sparkles' | 'heart'
  | 'music' | 'pen' | 'leaf' | 'sun' | 'calendar' | 'check' | 'mihrab';

export interface Block {
  key: string;
  title: string;
  category: CategoryId;
  icon: IconName;
  startMs: number;
  endMs: number;
  done?: boolean;
  /** From a calendar: glass, read-only. */
  event?: boolean;
  /** A salah (Waqt): soft light. */
  salah?: boolean;
  /** Painted by the visitor on this page. */
  mine?: boolean;
}

type Row = [start: string, minutes: number, title: string, category: CategoryId, icon: IconName, event?: boolean];

const PLAN: Row[] = [
  ['07:00', 10, 'Morning meds', 'care', 'pill'],
  ['07:30', 30, 'Breakfast', 'routine', 'coffee'],
  ['08:15', 30, 'Walk outside', 'move', 'footprints'],
  ['09:00', 15, 'Standup', 'people', 'video', true],
  ['09:30', 90, 'Deep work', 'focus', 'laptop'],
  ['11:15', 30, 'Inbox', 'focus', 'mail'],
  ['12:30', 40, 'Lunch & water', 'care', 'utensils'],
  ['13:30', 90, 'Draft the proposal', 'focus', 'laptop'],
  ['15:15', 30, 'Call with Sam', 'people', 'phone', true],
  ['16:00', 45, 'Read', 'learn', 'book-open'],
  ['17:30', 60, 'Gym', 'move', 'dumbbell'],
  ['18:45', 45, 'Cook dinner', 'routine', 'cooking-pot'],
  ['20:00', 30, 'Spanish practice', 'learn', 'languages'],
  ['21:00', 45, 'Wind down', 'rest', 'moon'],
  ['22:15', 30, 'Read in bed', 'learn', 'book-open'],
];

export const WAKE = 6 * 60 + 30;
export const SLEEP = 23 * 60;

const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));

/** Yesterday, today and tomorrow's plan around `now`; whatever ended before now is done. */
export function sampleDay(now: number): Block[] {
  const out: Block[] = [];
  const today = startOfDay(now);
  for (const offset of [-1, 0, 1]) {
    const day = today + offset * 24 * HOUR + 2 * HOUR; // a time safely inside that day, across DST
    for (const [start, minutes, title, category, icon, event] of PLAN) {
      const startMs = atMinutes(day, toMin(start));
      const endMs = startMs + minutes * MINUTE;
      out.push({ key: `${offset}:${start}`, title, category, icon, startMs, endMs, event, done: !event && endMs <= now });
    }
  }
  return out;
}

/** The 12-hour face: 12 o'clock is noon or midnight; one hour behind the hand, eleven ahead. */
export function window12(now: number) {
  const mid = startOfDay(now);
  const originMs = mid + (minutesOfDay(now) >= 720 ? 12 * HOUR : 0);
  return { originMs, spanMs: 12 * HOUR, startMs: now - HOUR, endMs: now + 11 * HOUR };
}

/** The 24-hour face: noon on top, the whole local day. */
export function window24(now: number) {
  const day = startOfDay(now);
  return { originMs: day - 12 * HOUR, spanMs: 24 * HOUR, startMs: day, endMs: day + 24 * HOUR };
}

/** The hour face: minutes of the wall clock, the next hour as a wedge. */
export function window60(now: number) {
  const d = new Date(now);
  d.setMinutes(0, 0, 0);
  return { originMs: d.getTime(), spanMs: HOUR, startMs: now - 2 * MINUTE, endMs: now + HOUR - 2 * MINUTE };
}

export interface NowState {
  current: Block | null;
  next: Block | null;
  remainingMs: number;
}

export function nowState(blocks: Block[], now: number): NowState {
  const live = blocks.filter((b) => !b.done && b.startMs <= now && b.endMs > now).sort((a, b) => a.endMs - b.endMs)[0] ?? null;
  const upcoming = blocks.filter((b) => b.startMs > now).sort((a, b) => a.startMs - b.startMs);
  const next = live ? (upcoming.find((b) => b.startMs >= live.endMs - MINUTE) ?? upcoming[0] ?? null) : (upcoming[0] ?? null);
  const remainingMs = live ? live.endMs - now : next ? next.startMs - now : 0;
  return { current: live, next, remainingMs };
}
