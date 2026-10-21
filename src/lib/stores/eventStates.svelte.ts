// Calendar events are read-only, but what you did with them is yours: Daybloom remembers which
// events you finished (a meeting attended, an appointment kept) and which you skipped, by the
// event's block key (`cal:<account>:<event id>`, one per occurrence). Done counts like a ticked
// block; a skipped event frees its time for planning. Kept for a year.

import { persisted } from './persisted.svelte';

export interface EventState {
  /** When you marked it done (ms). */
  done?: number;
  /** You're not going (its time is free for plans). */
  skipped?: boolean;
  /** What it was, kept with a done mark so your history still has it after the calendar's cache moves on. */
  was?: { title: string; startMs: number; endMs: number; category?: string; icon?: string; calendarName?: string };
}

interface EventStateFile {
  version: 1;
  states: Record<string, EventState & { at: number }>;
}

const YEAR = 370 * 86_400_000;

export function migrateEventStates(raw: any): EventStateFile {
  const states: EventStateFile['states'] = {};
  for (const [k, v] of Object.entries(raw?.states ?? {})) {
    if (!k.startsWith('cal:') || !v || typeof v !== 'object') continue;
    const s = v as Record<string, unknown>;
    const at = Number.isFinite(s.at) ? (s.at as number) : Date.now();
    if (!Number.isFinite(s.done) && s.skipped !== true) continue;
    const w = s.was as Record<string, unknown> | undefined;
    const was =
      w && typeof w.title === 'string' && Number.isFinite(w.startMs) && Number.isFinite(w.endMs)
        ? { title: w.title.slice(0, 300), startMs: w.startMs as number, endMs: w.endMs as number, ...(typeof w.category === 'string' ? { category: w.category } : {}), ...(typeof w.icon === 'string' ? { icon: w.icon } : {}), ...(typeof w.calendarName === 'string' ? { calendarName: w.calendarName.slice(0, 120) } : {}) }
        : undefined;
    states[k] = { at, ...(Number.isFinite(s.done) ? { done: s.done as number } : {}), ...(s.skipped === true ? { skipped: true } : {}), ...(was ? { was } : {}) };
  }
  return { version: 1, states };
}

export const eventStateFile = persisted<EventStateFile>('event-states', { version: 1, states: {} }, migrateEventStates);

function write(key: string, s: EventState | null) {
  const all = { ...eventStateFile.value.states };
  if (s && (s.done || s.skipped)) all[key] = { ...s, at: Date.now() };
  else delete all[key];
  const cutoff = Date.now() - YEAR;
  for (const [k, v] of Object.entries(all)) if (v.at < cutoff) delete all[k];
  eventStateFile.value.states = all;
}

export const eventStates = {
  of(key: string): EventState | undefined {
    return eventStateFile.value.states[key];
  },

  /** Done ⇄ not done; returns the new done state. Done clears a skip. `was` keeps what the event was. */
  toggleDone(key: string, at = Date.now(), was?: EventState['was']): boolean {
    const done = !this.of(key)?.done;
    write(key, done ? { done: at, ...(was ? { was } : {}) } : null);
    return done;
  },

  /** Skipped ⇄ not skipped; returns the new state. Skipping clears done. */
  toggleSkip(key: string): boolean {
    const skipped = !this.of(key)?.skipped;
    write(key, skipped ? { skipped: true } : null);
    return skipped;
  },

  set(key: string, s: EventState | null) {
    write(key, s);
  },
};
