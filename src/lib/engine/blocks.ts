import { categoryColor, nearestCategory } from './categories';
import { occurrencesBetween } from './recurrence';
import { addDays, atMinutes, isoOf, MINUTE, startOfDayMs } from './time';
import type { Block, CalendarEvent, ISODate, Task } from './types';

export function blockKey(taskId: string, date: ISODate) {
  return `task:${taskId}@${date}`;
}

export function parseBlockKey(key: string): { taskId: string; date: ISODate } | null {
  const m = /^task:(.+)@(\d{4}-\d{2}-\d{2})$/.exec(key);
  return m ? { taskId: m[1], date: m[2] } : null;
}

export function isDone(task: Task, date: ISODate) {
  return task.completions.includes(date);
}

/** Concrete blocks for a task between two dates (inclusive), honouring per-occurrence overrides. */
export function taskBlocks(task: Task, from: ISODate, to: ISODate, dark = false): Block[] {
  return occurrencesBetween(task, from, to).map((date) => {
    const o = task.overrides[date] ?? {};
    const start = o.start !== undefined ? o.start : task.start;
    const duration = o.duration ?? task.duration;
    const floating = start == null;
    const startMs = floating ? startOfDayMs(date) : atMinutes(date, start);
    return {
      key: blockKey(task.id, date),
      kind: 'task',
      taskId: task.id,
      date,
      title: o.title ?? task.title,
      icon: task.icon,
      category: task.category,
      color: categoryColor(task.category, dark),
      startMs,
      endMs: floating ? startMs : startMs + duration * MINUTE,
      floating,
      done: isDone(task, date),
      doneAt: task.completedAt?.[date],
      recurring: !!task.recurrence,
      readOnly: false,
    } satisfies Block;
  });
}

export function eventBlock(ev: CalendarEvent, dark = false): Block {
  const category = ev.color ? nearestCategory(ev.color) : 'focus';
  return {
    key: `cal:${ev.accountId}:${ev.id}`,
    kind: 'event',
    event: ev,
    date: isoOf(ev.startMs),
    title: ev.title || '(busy)',
    icon: 'calendar',
    category,
    // Provider colours snap to the nearest category so colour keeps one meaning everywhere.
    color: categoryColor(category, dark),
    startMs: ev.startMs,
    endMs: ev.endMs,
    floating: ev.allDay,
    done: false,
    recurring: false,
    readOnly: true,
  };
}

/** Timed blocks overlapping [startMs, endMs), sorted by start. */
export function blocksInRange(
  tasks: Task[],
  events: CalendarEvent[],
  startMs: number,
  endMs: number,
  dark = false,
): Block[] {
  // A task can start the day before and spill past midnight, so look one day back.
  const from = addDays(isoOf(startMs), -1);
  const to = isoOf(endMs);
  const out: Block[] = [];
  for (const t of tasks) {
    if (!t.date) continue;
    for (const b of taskBlocks(t, from, to, dark)) {
      if (!b.floating && b.endMs > startMs && b.startMs < endMs) out.push(b);
    }
  }
  for (const ev of events) {
    if (!ev.allDay && ev.endMs > startMs && ev.startMs < endMs) out.push(eventBlock(ev, dark));
  }
  return out.sort((a, b) => a.startMs - b.startMs || b.endMs - a.endMs);
}

/** Untimed ("anytime") tasks and all-day events for one date. */
export function floatingBlocks(tasks: Task[], events: CalendarEvent[], date: ISODate, dark = false): Block[] {
  const out: Block[] = [];
  for (const t of tasks) {
    if (!t.date) continue;
    for (const b of taskBlocks(t, date, date, dark)) if (b.floating) out.push(b);
  }
  const s = startOfDayMs(date);
  const e = startOfDayMs(addDays(date, 1));
  for (const ev of events) if (ev.allDay && ev.startMs < e && ev.endMs > s) out.push(eventBlock(ev, dark));
  return out;
}

/**
 * Assign concentric lanes so overlapping blocks never hide each other.
 * Lane 0 is the outer bezel; overlaps step inward.
 */
export function assignLanes(blocks: Block[]): Map<string, number> {
  const lanes: number[] = []; // lane -> endMs of last block in it
  const out = new Map<string, number>();
  for (const b of blocks) {
    let lane = lanes.findIndex((end) => end <= b.startMs);
    if (lane === -1) {
      lane = lanes.length;
      lanes.push(b.endMs);
    } else lanes[lane] = b.endMs;
    out.set(b.key, lane);
  }
  return out;
}

export interface NowState {
  current: Block | null;
  next: Block | null;
  /** ms until current ends, or until next starts when idle. */
  remainingMs: number;
  /** 0..1 progress through the current block. */
  progress: number;
}

export function nowState(blocks: Block[], now: number): NowState {
  const timed = blocks.filter((b) => !b.floating);
  // The unfinished block under the hand; if several overlap, the one ending soonest.
  // A block finished early stops being "now" — the time left over is free.
  const live = timed.filter((b) => b.startMs <= now && b.endMs > now && !b.done);
  const current = live.sort((a, b) => a.endMs - b.endMs)[0] ?? null;
  const next = timed.filter((b) => b.startMs > now && b.key !== current?.key)[0] ?? null;
  if (current) {
    const span = current.endMs - current.startMs;
    return {
      current,
      next,
      remainingMs: current.endMs - now,
      progress: span > 0 ? (now - current.startMs) / span : 1,
    };
  }
  return { current: null, next, remainingMs: next ? next.startMs - now : 0, progress: 0 };
}

/** Free gaps between timed blocks within a window (for "free time" rows and smart rescheduling). */
export function freeGaps(blocks: Block[], startMs: number, endMs: number, minMs = 5 * MINUTE) {
  const gaps: { startMs: number; endMs: number }[] = [];
  let cursor = startMs;
  for (const b of blocks.filter((b) => !b.floating).sort((a, b) => a.startMs - b.startMs)) {
    if (b.startMs - cursor >= minMs) gaps.push({ startMs: cursor, endMs: Math.min(b.startMs, endMs) });
    cursor = Math.max(cursor, b.endMs);
    if (cursor >= endMs) break;
  }
  if (endMs - cursor >= minMs) gaps.push({ startMs: cursor, endMs });
  return gaps;
}
