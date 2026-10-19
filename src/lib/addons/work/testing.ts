// Test fixtures for the Work addon (imported by the colocated *.test.ts files only).

import { atMinutes } from '../../engine/time';
import type { ISODate, Task } from '../../engine/types';
import { migrateWork } from './migrate';
import type { TrackedEntry, WorkContext, WorkData } from './types';

/** Monday 19 October 2026. */
export const TODAY: ISODate = '2026-10-19';

let seq = 0;
export function task(p: Partial<Task> = {}): Task {
  return {
    id: `t${++seq}`,
    title: 'Block',
    icon: 'laptop',
    category: 'focus',
    date: TODAY,
    start: 9 * 60,
    duration: 60,
    notes: '',
    subtasks: [],
    recurrence: null,
    completions: [],
    completedAt: {},
    skips: [],
    overrides: {},
    alerts: [],
    createdAt: 0,
    updatedAt: 0,
    ...p,
  };
}

/** A done task: ticked at the end of its block unless `doneAtMin` says otherwise. */
export function doneTask(p: Partial<Task> = {}, doneAtMin?: number): Task {
  const t = task(p);
  const date = t.date!;
  t.completions = [date];
  t.completedAt = { [date]: atMinutes(date, doneAtMin ?? (t.start ?? 0) + t.duration) };
  return t;
}

/** Epoch ms for hh:mm on a date. */
export const at = (date: ISODate, h: number, m = 0) => atMinutes(date, h * 60 + m);

export function entry(date: ISODate, from: [number, number], to: [number, number], p: Partial<TrackedEntry> = {}): TrackedEntry {
  return { startMs: at(date, ...from), endMs: at(date, ...to), ...p };
}

export function workData(raw: Record<string, unknown> = {}): WorkData {
  return migrateWork(raw);
}

export function ctx(tasks: Task[], data: WorkData, entries: TrackedEntry[] = [], extra: Partial<WorkContext> = {}): WorkContext {
  return { tasks, data, entries, now: at(TODAY, 23, 0), ...extra };
}
