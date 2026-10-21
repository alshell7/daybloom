// The Trash: what you delete — a block, a backlog item, one day of a repeating block — waits
// here for 30 days, so a delete is never final by accident. Restore puts it back exactly as it
// was; after 30 days (or "Delete forever") it is gone for good. This computer only: deleting
// still syncs as a deletion, and restoring syncs as the task coming back.

import type { ISODate, Task } from '../engine/types';
import { persisted } from './persisted.svelte';
import { taskFile, tasks } from './tasks.svelte';

export const TRASH_DAYS = 30;
const DAY = 86_400_000;

export interface TrashItem {
  /** Its own id (a task can be in the Trash more than once: two skipped days). */
  id: string;
  /** When it was deleted (ms). */
  at: number;
  /** The task as it was. */
  task: Task;
  /** Only this day of a repeating block was deleted; the rest of the series stayed. */
  date?: ISODate;
}

interface TrashFile {
  version: 1;
  items: TrashItem[];
}

export function migrateTrash(raw: any): TrashFile {
  const items = Array.isArray(raw?.items)
    ? raw.items.filter((x: any) => x && typeof x.id === 'string' && Number.isFinite(x.at) && x.task && typeof x.task.id === 'string')
    : [];
  return { version: 1, items: items.slice(-1000) };
}

export const trashFile = persisted<TrashFile>('trash', { version: 1, items: [] }, migrateTrash);

const tid = () => Math.random().toString(36).slice(2, 10);

export const trash = {
  get items(): TrashItem[] {
    return trashFile.value.items;
  },

  /** Keep a copy of what is being deleted; returns its Trash id (for an Undo). */
  put(task: Task, date?: ISODate, at = Date.now()): string {
    const id = tid();
    const copy: Task = JSON.parse(JSON.stringify(task));
    trashFile.value.items = [...trashFile.value.items, { id, at, task: copy, ...(date ? { date } : {}) }];
    return id;
  },

  /** Take an item out without restoring it (its delete was undone some other way). */
  drop(id: string | null | undefined) {
    if (id) trashFile.value.items = trashFile.value.items.filter((x) => x.id !== id);
  },

  /** Put it back: the whole task, or that one day of its series. Returns the task. */
  restore(id: string): Task | null {
    const it = trashFile.value.items.find((x) => x.id === id);
    if (!it) return null;
    if (it.date) {
      const live = tasks.get(it.task.id);
      if (live) {
        live.skips = live.skips.filter((d) => d !== it.date);
        live.updatedAt = Date.now();
      } else tasks.restore({ ...it.task, skips: it.task.skips.filter((d) => d !== it.date) });
    } else if (!tasks.get(it.task.id)) tasks.restore(it.task);
    this.drop(id);
    return tasks.get(it.task.id) ?? null;
  },

  /** Gone for good. */
  forget(id: string) {
    this.drop(id);
  },

  empty() {
    trashFile.value.items = [];
  },

  /** Days before an item leaves the Trash by itself (at least 0). */
  daysLeft(it: TrashItem, now = Date.now()): number {
    return Math.max(0, Math.ceil((it.at + TRASH_DAYS * DAY - now) / DAY));
  },

  /** Let go of what has waited 30 days. */
  purge(now = Date.now()) {
    const keep = trashFile.value.items.filter((x) => now - x.at < TRASH_DAYS * DAY);
    if (keep.length !== trashFile.value.items.length) trashFile.value.items = keep;
  },
};

/** Delete a whole task into the Trash; returns its Trash id. */
export function trashTask(id: string): string | null {
  const t = tasks.get(id);
  if (!t) return null;
  const tidOf = trash.put(t);
  tasks.remove(id);
  return tidOf;
}

/** Delete one day of a task (a repeating block skips it; a one-off goes whole). Returns its Trash id. */
export function trashOccurrence(id: string, date: ISODate): string | null {
  const t = tasks.get(id);
  if (!t) return null;
  const tidOf = trash.put(t, t.recurrence ? date : undefined);
  tasks.removeOccurrence(id, date);
  return tidOf;
}

/** Everything at once (Settings › Clear all), each into the Trash, with tombstones for sync. */
export function trashAll(): string[] {
  return [...taskFile.value.tasks].map((t) => trashTask(t.id)).filter((x): x is string => !!x);
}

if (import.meta.env.DEV) (globalThis as { __trash?: typeof trash }).__trash = trash;
