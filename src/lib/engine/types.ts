// Shared domain types. Every module (UI, engine, calendar providers, native bridge)
// speaks these shapes, so keep them stable and documented.

/** Local calendar date, `YYYY-MM-DD`. */
export type ISODate = string;

/** Minutes after local midnight, 0–1439. */
export type Minutes = number;

export type CategoryId = 'focus' | 'care' | 'routine' | 'social' | 'rest' | 'learn' | 'move';

/**
 * A small RRULE subset — enough for routines people actually keep.
 * Weekday numbers follow JS: 0 = Sunday … 6 = Saturday.
 */
export interface Recurrence {
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly';
  /** Every N days/weeks/months/years. ≥ 1. */
  interval: number;
  /** Weekly only. Empty/undefined → the weekday of the task's anchor date. */
  byWeekday?: number[];
  /** Inclusive last date. */
  until?: ISODate;
  /** Total occurrences, counted from the anchor date. */
  count?: number;
}

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

/** Per-occurrence edits to a recurring task ("just this one"). */
export interface OccurrenceOverride {
  start?: Minutes | null;
  duration?: Minutes;
  title?: string;
}

export interface Task {
  id: string;
  title: string;
  /** Icon id from `lib/icons.ts`. */
  icon: string;
  category: CategoryId;
  /**
   * Anchor date. For one-off tasks, the day it happens.
   * For recurring tasks, the first occurrence.
   * `null` → in the Later tray (unscheduled).
   */
  date: ISODate | null;
  /** `null` → "anytime" that day (shown in the day's tray, not on the dial). */
  start: Minutes | null;
  /** Minutes. Always ≥ 5. */
  duration: Minutes;
  notes: string;
  subtasks: Subtask[];
  recurrence: Recurrence | null;
  /** Occurrence dates marked done. One-off tasks use their own date. */
  completions: ISODate[];
  /** When each occurrence was ticked (epoch ms) — lets the dial show only the time spent. */
  completedAt?: Record<ISODate, number>;
  /** Occurrence dates removed from a series. */
  skips: ISODate[];
  overrides: Record<ISODate, OccurrenceOverride>;
  /** Minutes before start to give a heads-up, e.g. [5]. */
  alerts: number[];
  createdAt: number;
  updatedAt: number;

  // --- backlog (tasks with no date live here) ---
  /** Which backlog list an undated task sits in. */
  list?: BacklogList;
  /** 1 = must, 2 = should, 3 = could. */
  priority?: 1 | 2 | 3 | null;
  /** Soft deadline. Undated tasks with a due date surface as it gets close. */
  due?: ISODate | null;
  /** How much energy it takes: 1 low, 2 medium, 3 high (for matching to the day). */
  energy?: 1 | 2 | 3 | null;
  /** Manual order inside its backlog list (ascending). */
  order?: number;
  /** An undated task finished from the backlog (epoch ms). */
  doneAt?: number | null;
  /** Occurrence dates the user acknowledged as "not done, and that's ok" — nudges stop. */
  acks?: ISODate[];
  /** Ring like an alarm when the block starts (null/absent = a normal block). */
  alarm?: TaskAlarm | null;
  /** Part of the sample day a first launch adds (cleared with one tap). */
  sample?: boolean;
}

/** A block that rings like an alarm. The tone and snooze come from Settings unless set here. */
export interface TaskAlarm {
  /** A tone id from lib/alarm.ts; absent = the tone chosen in Settings. */
  tone?: string;
}

export type BacklogList = 'inbox' | 'next' | 'someday';

/** Someone invited to a calendar event. */
export interface Attendee {
  name?: string;
  email?: string;
  status?: 'accepted' | 'declined' | 'tentative' | 'needsAction';
  organizer?: boolean;
  /** This is you. */
  self?: boolean;
}

/** A read-only event pulled from an external calendar. */
export interface CalendarEvent {
  /** Provider-unique id (stable across syncs). */
  id: string;
  /** 'salah': a prayer block from the Waqt addon (not from a calendar). */
  provider: 'google' | 'ics' | 'salah';
  accountId: string;
  calendarId: string;
  title: string;
  startMs: number;
  endMs: number;
  allDay: boolean;
  /** Hex colour suggested by the provider, if any. */
  color?: string;
  location?: string;
  htmlLink?: string;
  /** A video meeting to join (Google Meet, Zoom, Teams…), when the calendar says so. */
  meetUrl?: string;
  /** "Google Meet", "Zoom"… */
  meetLabel?: string;
  /** The calendar's notes, as plain text. */
  description?: string;
  /** Who is invited (not sent for very large meetings). */
  attendees?: Attendee[];
  /** The same event also appears in these other accounts (merged into this one). */
  alsoIn?: string[];
  /** Repeats of one event share this (ICS UID, Google recurringEventId); else the event's own id. */
  series?: string;
  /** Set by the calendar service: the calendar's name as shown (the user's rename, if any). */
  calendarName?: string;
  /** Set by the calendar service: the category (colour) the user picked for this calendar. */
  category?: CategoryId;
  /** Its own icon (addon events, e.g. a prayer); calendar events show the calendar glyph. */
  icon?: string;
  /** You marked it done (ms): set from Daybloom's own record (events stay read-only), or a marked salah. */
  done?: number;
  /** You're skipping it: shown softly, and its time is free for plans. */
  skipped?: boolean;
}

/**
 * One concrete block of time on one day: a task occurrence or a calendar event.
 * This is what the dial and the day rail render.
 */
export interface Block {
  /** `task:<taskId>@<date>` or `cal:<accountId>:<eventId>`. */
  key: string;
  kind: 'task' | 'event';
  taskId?: string;
  event?: CalendarEvent;
  date: ISODate;
  title: string;
  icon: string;
  category: CategoryId;
  /** Resolved display colour (category colour or provider colour). */
  color: string;
  startMs: number;
  endMs: number;
  /** True for "anytime" tasks and all-day events. */
  floating: boolean;
  done: boolean;
  /** When it was ticked, if known. */
  doneAt?: number;
  /** A calendar event you're skipping (its time is free). */
  skipped?: boolean;
  recurring: boolean;
  readOnly: boolean;
}
