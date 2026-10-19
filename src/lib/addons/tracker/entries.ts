// Pure operations on time entries: durations, matching, overlaps, split and merge.
// Nothing here reads the clock; callers pass `now` for running entries.

import { parseBlockKey } from '../../engine/blocks';
import type { AppTime, Entry, EntrySource, IdleNote, Result, TargetRef } from './types';

/** End of an entry, with a running entry ending `now`. */
export function endOf(e: Entry, now: number): number {
  return e.endMs ?? Math.max(e.startMs, now);
}

export function durationMs(e: Entry, now: number): number {
  return Math.max(0, endOf(e, now) - e.startMs);
}

/** The target of an entry; a task block key also names its task. */
export function targetOf(t: TargetRef): TargetRef {
  const out: TargetRef = {};
  const fromKey = t.blockKey ? parseBlockKey(t.blockKey)?.taskId : undefined;
  if (t.taskId || fromKey) out.taskId = t.taskId || fromKey;
  if (t.blockKey) out.blockKey = t.blockKey;
  if (t.projectId) out.projectId = t.projectId;
  return out;
}

/** True when every field given in `ref` matches the entry. An empty ref matches anything. */
export function matchesTarget(e: Entry, ref: TargetRef = {}): boolean {
  if (ref.taskId && e.taskId !== ref.taskId) return false;
  if (ref.blockKey && e.blockKey !== ref.blockKey) return false;
  if (ref.projectId && e.projectId !== ref.projectId) return false;
  return true;
}

/** True when both refer to the same thing (same task, block and project). */
export function sameTarget(a: TargetRef, b: TargetRef): boolean {
  const x = targetOf(a);
  const y = targetOf(b);
  return x.taskId === y.taskId && x.blockKey === y.blockKey && x.projectId === y.projectId;
}

/** Entries that share time with [startMs, endMs). Touching ends do not overlap. */
export function overlapping(entries: Entry[], startMs: number, endMs: number, now: number, ignore: string[] = []): Entry[] {
  return entries.filter((e) => !ignore.includes(e.id) && e.startMs < endMs && endOf(e, now) > startMs);
}

export interface Overlap {
  a: Entry;
  b: Entry;
  ms: number;
}

/** Every pair of entries that share time, with how much they share. */
export function findOverlaps(entries: Entry[], now: number): Overlap[] {
  const sorted = [...entries].sort((x, y) => x.startMs - y.startMs);
  const out: Overlap[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    const aEnd = endOf(a, now);
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j];
      if (b.startMs >= aEnd) break;
      const ms = Math.min(aEnd, endOf(b, now)) - b.startMs;
      if (ms > 0) out.push({ a, b, ms });
    }
  }
  return out;
}

/** Check a span before saving it: end after start, and no overlap unless forced. */
export function validateSpan(
  entries: Entry[],
  startMs: number,
  endMs: number,
  now: number,
  { ignore = [], force = false }: { ignore?: string[]; force?: boolean } = {},
): Result<null> {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return { ok: false, error: 'invalid-range', conflicts: [] };
  }
  if (!force) {
    const conflicts = overlapping(entries, startMs, endMs, now, ignore);
    if (conflicts.length) return { ok: false, error: 'overlap', conflicts };
  }
  return { ok: true, value: null };
}

/** Add app time, merging by app name. The newest non-empty title wins. Returns a new array. */
export function mergeActivity(base: AppTime[], add: AppTime[]): AppTime[] {
  const out = base.map((a) => ({ ...a }));
  for (const a of add) {
    if (!a.app || !(a.ms > 0)) continue;
    const hit = out.find((x) => x.app === a.app);
    if (hit) {
      hit.ms += a.ms;
      if (a.title) hit.title = a.title;
    } else out.push(a.title ? { app: a.app, ms: a.ms, title: a.title } : { app: a.app, ms: a.ms });
  }
  return out.sort((x, y) => y.ms - x.ms);
}

function scaleActivity(list: AppTime[] | undefined, f: number): [AppTime[], AppTime[]] {
  const a: AppTime[] = [];
  const b: AppTime[] = [];
  for (const x of list ?? []) {
    const first = Math.round(x.ms * f);
    if (first > 0) a.push({ ...x, ms: first });
    if (x.ms - first > 0) b.push({ ...x, ms: x.ms - first });
  }
  return [a, b];
}

function withOptional(e: Entry, idle: IdleNote | undefined, activity: AppTime[]): Entry {
  const out: Entry = { ...e };
  delete out.idle;
  delete out.activity;
  if (idle && (idle.ms > 0 || (idle.droppedMs ?? 0) > 0)) out.idle = idle.droppedMs ? idle : { ms: idle.ms };
  if (activity.length) out.activity = activity;
  return out;
}

/**
 * Cut an entry in two at `atMs`, which must fall strictly inside it. App time and kept
 * idle time are shared out by length (entries do not record when each was spent);
 * dropped idle time stays with the second part, where it was cut off.
 */
export function splitEntry(e: Entry, atMs: number, now: number, id: string): [Entry, Entry] | null {
  const end = endOf(e, now);
  if (!(atMs > e.startMs && atMs < end)) return null;
  const f = (atMs - e.startMs) / (end - e.startMs);
  const [actA, actB] = scaleActivity(e.activity, f);
  const keptA = Math.round((e.idle?.ms ?? 0) * f);
  const first = withOptional({ ...e, endMs: atMs }, { ms: keptA }, actA);
  const second = withOptional(
    { ...e, id, startMs: atMs },
    { ms: (e.idle?.ms ?? 0) - keptA, droppedMs: e.idle?.droppedMs },
    actB,
  );
  return [first, second];
}

/**
 * One entry covering several: from the earliest start to the latest end (running if any
 * of them is). It keeps the earliest entry's id and target; notes are joined, app and idle
 * time summed. The source stays when all agree, else becomes 'manual'.
 */
export function mergeEntries(list: Entry[]): Entry | null {
  if (list.length < 2) return null;
  const sorted = [...list].sort((a, b) => a.startMs - b.startMs);
  const first = sorted[0];
  const running = sorted.some((e) => e.endMs == null);
  const endMs = running ? null : Math.max(...sorted.map((e) => e.endMs as number));
  const notes = [...new Set(sorted.map((e) => e.note?.trim()).filter((n): n is string => !!n))];
  const sources = new Set(sorted.map((e) => e.source));
  const source: EntrySource = sources.size === 1 ? first.source : 'manual';
  let activity: AppTime[] = [];
  for (const e of sorted) activity = mergeActivity(activity, e.activity ?? []);
  const idle: IdleNote = {
    ms: sorted.reduce((s, e) => s + (e.idle?.ms ?? 0), 0),
    droppedMs: sorted.reduce((s, e) => s + (e.idle?.droppedMs ?? 0), 0),
  };
  const merged: Entry = { ...first, startMs: first.startMs, endMs, source };
  delete merged.note;
  if (notes.length) merged.note = notes.join(' · ');
  return withOptional(merged, idle, activity);
}
