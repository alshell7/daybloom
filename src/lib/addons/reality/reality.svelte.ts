// Reality check, the live side: notices how long finished blocks really took and keeps it in
// its own file on this computer. Focus time per task and day comes from focus sessions; tracked
// time comes from the Time Tracker when it's on; else the moment a block was ticked.

import { untrack } from 'svelte';
import { blockKey, parseBlockKey } from '../../engine/blocks';
import { addDays, atMinutes, isoOf, MINUTE } from '../../engine/time';
import type { ISODate, Task } from '../../engine/types';
import { clock } from '../../stores/clock.svelte';
import { persisted } from '../../stores/persisted.svelte';
import { taskFile } from '../../stores/tasks.svelte';
import { timer, timerFile } from '../../stores/timer.svelte';
import { isOn } from '../registry';
import { trackerFile } from '../tracker/tracker.svelte';
import { estimate, suggest, tickMinutes, type Estimate, type Sample, type SampleSource } from './reality';

export interface RealityFile {
  version: 1;
  samples: Sample[];
  /** Focus time (ms) per `taskId@date`. */
  focus: Record<string, number>;
  /** When past ticks were read in (0 = not yet). */
  backfilledAt: number;
}

const MAX_SAMPLES = 1500;
const MIN_REAL = 3;

export function migrateReality(raw: any): RealityFile {
  const samples: Sample[] = Array.isArray(raw?.samples)
    ? raw.samples.filter((s: any) => typeof s?.id === 'string' && typeof s?.taskId === 'string' && s.planned > 0 && s.actual > 0 && Number.isFinite(s.at))
    : [];
  const focus: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw?.focus ?? {})) if (typeof v === 'number' && v > 0) focus[k] = v;
  return { version: 1, samples: samples.slice(-MAX_SAMPLES), focus, backfilledAt: Number.isFinite(raw?.backfilledAt) ? raw.backfilledAt : 0 };
}

export const realityFile = persisted<RealityFile>('addon-reality', { version: 1, samples: [], focus: {}, backfilledAt: 0 }, migrateReality);

function planned(task: Task, date: ISODate): number {
  return task.overrides?.[date]?.duration ?? task.duration;
}
function startOf(task: Task, date: ISODate): number | null {
  const start = task.overrides?.[date]?.start ?? task.start;
  return start == null ? null : atMinutes(date, start);
}

/** How long one finished occurrence really took, and how we know; null if we can't tell. */
export function measure(task: Task, date: ISODate, doneAt: number, focusMs: number, trackedMs: number): { actual: number; source: SampleSource } | null {
  if (trackedMs >= MIN_REAL * MINUTE) return { actual: Math.round(trackedMs / MINUTE), source: 'tracked' };
  if (focusMs >= MIN_REAL * MINUTE) return { actual: Math.round(focusMs / MINUTE), source: 'focus' };
  const start = task.date === null ? null : startOf(task, date);
  if (start == null) return null;
  const m = tickMinutes(start, planned(task, date), doneAt);
  return m == null ? null : { actual: m, source: 'tick' };
}

function trackedMsFor(taskId: string, date: ISODate): number {
  if (!isOn('tracker')) return 0;
  const key = blockKey(taskId, date);
  return trackerFile.value.entries.filter((e) => e.endMs != null && (e.blockKey === key || (!e.blockKey && e.taskId === taskId && isoOf(e.startMs) === date))).reduce((a, e) => a + (e.endMs! - e.startMs), 0);
}

function record(task: Task, date: ISODate, doneAt: number) {
  const id = `${task.id}@${date}`;
  const m = measure(task, date, doneAt, realityFile.value.focus[id] ?? 0, trackedMsFor(task.id, date));
  if (!m) return;
  const s: Sample = { id, taskId: task.id, title: task.title, category: task.category, icon: task.icon, planned: planned(task, date), actual: m.actual, source: m.source, at: doneAt };
  realityFile.value.samples = [...realityFile.value.samples.filter((x) => x.id !== id), s].slice(-MAX_SAMPLES);
}

/** Every finished occurrence, as `taskId@date` → when it was ticked. */
function finished(tasks: Task[]): Map<string, { task: Task; date: ISODate; at: number }> {
  const out = new Map<string, { task: Task; date: ISODate; at: number }>();
  for (const t of tasks) {
    if (t.date === null) {
      if (t.doneAt) out.set(`${t.id}@${isoOf(t.doneAt)}`, { task: t, date: isoOf(t.doneAt), at: t.doneAt });
      continue;
    }
    for (const [date, at] of Object.entries(t.completedAt ?? {})) out.set(`${t.id}@${date}`, { task: t, date, at });
  }
  return out;
}

/** Focus time of the session in `a` up to `end` (breaks don't count). */
function focusMsOf(a: NonNullable<typeof timerFile.value.active>, end: number): number {
  const elapsed = Math.max(0, (a.pausedAt ?? end) - a.startedAt - a.pausedMs);
  let t = 0;
  let ms = 0;
  for (const seg of a.segments) {
    const take = Math.max(0, Math.min(seg.ms, elapsed - t));
    if (seg.kind === 'focus') ms += take;
    t += seg.ms;
    if (t >= elapsed) break;
  }
  return ms;
}

/** Read in past ticks (the last 60 days) once, so there's something to see on day one. */
function backfill() {
  const since = Date.parse(addDays(isoOf(Date.now()), -60));
  for (const { task, date, at } of finished(taskFile.value.tasks).values()) if (at >= since) record(task, date, at);
  realityFile.value.backfilledAt = Date.now();
}

/** Main window, while the addon is on. */
export function startReality(): () => void {
  return $effect.root(() => {
    if (!realityFile.value.backfilledAt) untrack(backfill);
    let seen = new Set(finished(taskFile.value.tasks).keys());
    let session = timerFile.value.active ? { ...timerFile.value.active, segments: timerFile.value.active.segments.map((s) => ({ ...s })) } : null;

    // A focus session for a task ends (or is replaced): add its focus time to that task's day.
    $effect(() => {
      const a = timer.active;
      const key = a ? `${a.startedAt}:${a.pausedMs}:${a.pausedAt}:${a.segments.map((s) => s.ms).join(',')}` : '';
      void key;
      untrack(() => {
        if (session && (!a || a.startedAt !== session.startedAt)) {
          const target = session.target;
          const taskId = target?.taskId ?? (target?.key ? parseBlockKey(target.key)?.taskId : undefined);
          if (taskId) {
            const ms = focusMsOf(session, clock.now);
            const id = `${taskId}@${isoOf(session.startedAt)}`;
            if (ms > 0) realityFile.value.focus = { ...realityFile.value.focus, [id]: (realityFile.value.focus[id] ?? 0) + ms };
          }
        }
        session = a ? { ...a, segments: a.segments.map((s) => ({ ...s })) } : null;
      });
    });

    // A block is ticked: note how long it really took.
    $effect(() => {
      const now = finished(taskFile.value.tasks);
      untrack(() => {
        for (const [k, f] of now) if (!seen.has(k)) record(f.task, f.date, f.at);
        seen = new Set(now.keys());
      });
    });
  });
}

/** "Usually ~45m" for a task, or null. */
export function realityHint(o: { title: string; category: Task['category']; minutes: number }): { minutes: number; est: Estimate } | null {
  const est = estimate(realityFile.value.samples, { title: o.title, category: o.category });
  const m = suggest(o.minutes, est);
  return m && est ? { minutes: m, est } : null;
}
