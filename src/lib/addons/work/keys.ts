// Work-item keys. Occurrences reuse the app's block keys so the Time Tracker, the dial
// and this addon all name one block the same way.

import { blockKey, parseBlockKey } from '../../engine/blocks';
import type { ISODate } from '../../engine/types';

export { blockKey, parseBlockKey };

/** Key of one occurrence of a task: `task:<taskId>@<date>`. */
export const occurrenceKey = blockKey;

/** Key of tracked project time with no task on one day: `project:<projectId>@<date>`. */
export function projectTimeKey(projectId: string, date: ISODate): string {
  return `project:${projectId}@${date}`;
}

export function parseProjectTimeKey(key: string): { projectId: string; date: ISODate } | null {
  const m = /^project:(.+)@(\d{4}-\d{2}-\d{2})$/.exec(key);
  return m ? { projectId: m[1], date: m[2] } : null;
}

export function isEventKey(key: string): boolean {
  return key.startsWith('cal:');
}

/**
 * Canonical form of an assignment key. A short occurrence key `<taskId>:<date>` becomes
 * the block key `task:<taskId>@<date>`; everything else is returned as is.
 */
export function normalizeKey(key: string): string {
  const m = /^([^:@]+):(\d{4}-\d{2}-\d{2})$/.exec(key);
  return m && m[1] !== 'task' && m[1] !== 'cal' && m[1] !== 'project' ? blockKey(m[1], m[2]) : key;
}

/** The task a key belongs to: the task id itself, or the task of a block key. */
export function taskIdOf(key: string): string | undefined {
  const b = parseBlockKey(key);
  if (b) return b.taskId;
  if (isEventKey(key) || key.startsWith('project:') || key.includes(':') || key.includes('@')) return undefined;
  return key || undefined;
}
