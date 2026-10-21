import { CATEGORY_BY_ID } from '../engine/categories';
import { addDays, minutesOfDay, snap, todayISO } from '../engine/time';
import type { ISODate, Minutes, OccurrenceOverride, Task } from '../engine/types';
import { persisted } from './persisted.svelte';

interface TaskFile {
  version: 1;
  tasks: Task[];
  /** Tombstones, so a deletion on one device survives a sync with another. */
  deleted?: { id: string; at: number }[];
  /** The sample day was added once; it never comes back by itself after you clear it. */
  seeded?: boolean;
  /** You chose to keep the sample blocks (Daybloom stops offering to clear them). */
  sampleKept?: boolean;
}

export const taskFile = persisted<TaskFile>('tasks', { version: 1, tasks: [] }, (raw) => ({
  version: 1,
  tasks: Array.isArray(raw?.tasks) ? raw.tasks.map(normalize) : [],
  deleted: Array.isArray(raw?.deleted) ? raw.deleted : [],
  ...(raw?.seeded ? { seeded: true } : {}),
  ...(raw?.sampleKept ? { sampleKept: true } : {}),
}));

function normalize(t: Partial<Task>): Task {
  const now = Date.now();
  return {
    id: t.id ?? uid(),
    title: t.title ?? '',
    icon: t.icon ?? CATEGORY_BY_ID[t.category ?? 'focus']?.icon ?? 'laptop',
    category: t.category ?? 'focus',
    date: t.date === undefined ? todayISO() : t.date,
    start: t.start === undefined ? null : t.start,
    duration: Math.max(5, t.duration ?? 30),
    notes: t.notes ?? '',
    subtasks: t.subtasks ?? [],
    recurrence: t.recurrence ?? null,
    completions: t.completions ?? [],
    completedAt: t.completedAt ?? {},
    skips: t.skips ?? [],
    overrides: t.overrides ?? {},
    alerts: t.alerts ?? [],
    createdAt: t.createdAt ?? now,
    updatedAt: t.updatedAt ?? now,
    list: t.list ?? 'inbox',
    priority: t.priority ?? null,
    due: t.due ?? null,
    energy: t.energy ?? null,
    order: t.order ?? now,
    doneAt: t.doneAt ?? null,
    acks: t.acks ?? [],
    ...(t.alarm ? { alarm: { ...(typeof t.alarm.tone === 'string' ? { tone: t.alarm.tone } : {}) } } : {}),
    ...(t.sample ? { sample: true } : {}),
  };
}

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function find(id: string) {
  return taskFile.value.tasks.find((t) => t.id === id);
}

export const tasks = {
  get list() {
    return taskFile.value.tasks;
  },
  get(id: string) {
    return find(id);
  },

  create(partial: Partial<Task>): Task {
    const t = normalize(partial);
    taskFile.value.tasks.push(t);
    return t;
  },

  update(id: string, patch: Partial<Task>) {
    const t = find(id);
    if (!t) return;
    Object.assign(t, patch, { updatedAt: Date.now() });
  },

  remove(id: string) {
    const i = taskFile.value.tasks.findIndex((t) => t.id === id);
    if (i >= 0) taskFile.value.tasks.splice(i, 1);
    const tomb = (taskFile.value.deleted ??= []);
    if (!tomb.some((d) => d.id === id)) tomb.push({ id, at: Date.now() });
    // Keep tombstones bounded: 90 days is plenty for any device to catch up.
    const cutoff = Date.now() - 90 * 86_400_000;
    if (tomb.length > 500) taskFile.value.deleted = tomb.filter((d) => d.at > cutoff).slice(-2000);
  },

  /** Restore a task removed moments ago (undo). */
  restore(task: Task) {
    if (!find(task.id)) taskFile.value.tasks.push({ ...task, updatedAt: Date.now() });
    if (taskFile.value.deleted) taskFile.value.deleted = taskFile.value.deleted.filter((d) => d.id !== task.id);
  },

  /** Returns the new done state. `at` is when it was finished. */
  toggleDone(id: string, date: ISODate, at = Date.now()): boolean {
    const t = find(id);
    if (!t) return false;
    const i = t.completions.indexOf(date);
    t.completedAt ??= {};
    if (i >= 0) {
      t.completions.splice(i, 1);
      delete t.completedAt[date];
    } else {
      t.completions.push(date);
      t.completedAt[date] = at;
    }
    t.updatedAt = Date.now();
    return i < 0;
  },

  toggleSubtask(id: string, subId: string) {
    const s = find(id)?.subtasks.find((s) => s.id === subId);
    if (s) s.done = !s.done;
  },

  /** Edit one occurrence of a series (or the task itself when it doesn't repeat). */
  editOccurrence(id: string, date: ISODate, o: OccurrenceOverride) {
    const t = find(id);
    if (!t) return;
    if (!t.recurrence) {
      if (o.start !== undefined) t.start = o.start;
      if (o.duration !== undefined) t.duration = Math.max(5, o.duration);
      if (o.title !== undefined) t.title = o.title;
    } else {
      t.overrides[date] = { ...(t.overrides[date] ?? {}), ...o };
    }
    t.updatedAt = Date.now();
  },

  /** Remove one occurrence (series) or the whole task (one-off). */
  removeOccurrence(id: string, date: ISODate) {
    const t = find(id);
    if (!t) return;
    if (t.recurrence) {
      if (!t.skips.includes(date)) t.skips.push(date);
      t.updatedAt = Date.now();
    } else this.remove(id);
  },

  /** Move a block to a new start time on its date, keeping duration. */
  reschedule(id: string, date: ISODate, start: Minutes) {
    this.editOccurrence(id, date, { start });
  },

  /** Park a one-off block in the Later tray. */
  moveToLater(id: string) {
    this.update(id, { date: null, start: null });
  },

  /** Put a Later item on a day at a time. */
  schedule(id: string, date: ISODate, start: Minutes | null) {
    this.update(id, { date, start });
  },
};

/** A believable first day so the dial is alive on first launch. Every block is editable. */
export function seedSampleDay(now = Date.now()) {
  taskFile.value.seeded = true;
  const today = todayISO(now);
  const m = snap(minutesOfDay(now), 5);
  const at = (offset: number) => Math.max(0, Math.min(1435, m + offset));
  const base = [
    { title: 'Morning meds', icon: 'pill', category: 'care', start: 8 * 60, duration: 10, recurrence: { freq: 'daily', interval: 1 } },
    { title: 'Deep work', icon: 'laptop', category: 'focus', start: at(-25), duration: 75, subtasks: [
      { id: uid(), title: 'Open the doc', done: true },
      { id: uid(), title: 'Write the first rough paragraph', done: false },
      { id: uid(), title: 'Stop, stretch, re-read', done: false },
    ] },
    { title: 'Lunch & water', icon: 'utensils', category: 'care', start: at(60), duration: 40 },
    { title: 'Walk outside', icon: 'footprints', category: 'move', start: at(110), duration: 25 },
    { title: 'Reply to messages', icon: 'mail', category: 'focus', start: at(150), duration: 30 },
    { title: 'Call a friend', icon: 'phone', category: 'social', start: at(210), duration: 30 },
    { title: 'Wind down', icon: 'moon', category: 'rest', start: 22 * 60, duration: 45, recurrence: { freq: 'daily', interval: 1 } },
    { title: 'Water the plants', icon: 'plant', category: 'routine', start: null, duration: 10 },
  ] as Partial<Task>[];
  for (const b of base) tasks.create({ ...b, date: today, alerts: [5], sample: true });
  tasks.create({ title: 'Book dentist', icon: 'stethoscope', category: 'care', date: null, start: null, duration: 15, sample: true });
  tasks.create({ title: 'Return the parcel', icon: 'package', category: 'routine', date: null, start: null, duration: 20, sample: true });
  taskFile.value.sampleKept = false;
  return addDays(today, 0);
}
