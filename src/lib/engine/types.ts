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
}

/** A read-only event pulled from an external calendar. */
export interface CalendarEvent {
  /** Provider-unique id (stable across syncs). */
  id: string;
  provider: 'google' | 'ics';
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
  recurring: boolean;
  readOnly: boolean;
}
