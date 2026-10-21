// What you finished, as one list: every ticked block (timed and anytime) per occurrence,
// every backlog item you cleared, every calendar event you marked done and, when given, every
// prayer you marked in Waqt — each with when it was done and how long it took.
//
// Pure. The History tab lists it, and "Your week", the badges, the rhythm and Retrospection
// count it, so a block done in one is a block done in all. The stores are read elsewhere
// (components/history/sources.ts), which also tells this module where done calendar events
// come from: callers that only have the task list still count those events.

import { eventBlock, taskBlocks } from './engine/blocks';
import { isoOf, minutesOfDay, MINUTE, DAY, startOfDayMs } from './engine/time';
import type { Block, CalendarEvent, CategoryId, ISODate, Task } from './engine/types';

/** Where a finished thing came from. */
export type DoneSource = 'task' | 'backlog' | 'event' | 'salah';

/** How a prayer went (Waqt). */
export type PrayedHow = 'jamaat' | 'ontime' | 'late';

/** One finished thing. */
export interface DoneItem {
  /** Block key (`task:<id>@<date>`, `cal:<account>:<event>`), or `later:<id>` for a backlog item. */
  key: string;
  source: DoneSource;
  /** Its shape: on the dial (timed), on the day without a time (anytime), or from the backlog. */
  kind: 'timed' | 'anytime' | 'backlog';
  /** The task behind it ('' for events and prayers). */
  taskId: string;
  /** The day it counts on. */
  date: ISODate;
  title: string;
  icon: string;
  category: CategoryId;
  /** Timed only: block start and planned end. */
  startMs: number | null;
  endMs: number | null;
  /** Timed only: where the spent part ends (the tick, if it landed inside the block). */
  spentEndMs: number | null;
  spentMs: number;
  /** When it happened: a timed block's start, otherwise when it was ticked (if known). */
  atMs: number | null;
  /** When it was ticked, if known. */
  doneAt: number | null;
  recurring: boolean;
  /** A calendar event's calendar. */
  note?: string;
  /** A prayer: how it went. */
  how?: PrayedHow;
  qasr?: boolean;
}

/** A prayer marked in Waqt, with its time that day (null when the times aren't known). */
export interface PrayerDone {
  /** The prayer block's event id: `salah:<prayer>:<date>`. */
  id: string;
  date: ISODate;
  name: string;
  icon: string;
  startMs: number | null;
  endMs: number | null;
  how: PrayedHow;
  qasr?: boolean;
  /** When it was marked. */
  markedAt?: number;
}

/** Everything a history can be drawn from. */
export interface DoneSources {
  tasks: Task[];
  /** Events with `done` set count; the rest are ignored. */
  events?: CalendarEvent[];
  prayers?: PrayerDone[];
}

/** One finished timed block on its day's 24-hour dial. */
export interface DayArc {
  key: string;
  /** Minutes after that day's midnight; `end` may run past 1440 for a block that spills over. */
  start: number;
  end: number;
  category: CategoryId;
  title: string;
}

// ---------------------------------------------------------------------------
// Where done events come from, for callers that only pass the tasks

type Ambient = (from: ISODate | null, to: ISODate) => Omit<DoneSources, 'tasks'>;
let ambient: Ambient | null = null;

/** The app says where finished calendar events (and anything else not in the tasks) come from. */
export function provideDoneSources(f: Ambient | null) {
  ambient = f;
}

/**
 * The sources for a range. A task list gets the app's own done events added (so every count
 * agrees with the history); a full `DoneSources` is taken as it is (tests, or a caller that
 * already has them). `extra` adds more (e.g. events a caller holds) on top of the app's.
 */
export function sourcesFor(src: Task[] | DoneSources, from: ISODate | null, to: ISODate, extra?: Omit<DoneSources, 'tasks'>): DoneSources {
  if (!Array.isArray(src)) return src;
  const a = ambient?.(from, to) ?? {};
  return {
    tasks: src,
    events: [...(a.events ?? []), ...(extra?.events ?? [])],
    prayers: [...(a.prayers ?? []), ...(extra?.prayers ?? [])],
  };
}

// ---------------------------------------------------------------------------
// Items

/** A finished block as an item. Spent = min(end, tick) − start; a tick before the start counts the whole block (done early). */
export function itemFromBlock(b: Block): DoneItem {
  const ev = b.kind === 'event' ? b.event : undefined;
  const base = {
    key: b.key,
    source: (ev ? (ev.provider === 'salah' ? 'salah' : 'event') : 'task') as DoneSource,
    taskId: b.taskId ?? '',
    date: b.date,
    title: b.title,
    icon: b.icon,
    category: b.category,
    recurring: b.recurring,
    doneAt: b.doneAt ?? null,
    ...(ev?.calendarName ? { note: ev.calendarName } : {}),
  };
  if (b.floating) {
    return { ...base, kind: 'anytime', startMs: null, endMs: null, spentEndMs: null, spentMs: 0, atMs: b.doneAt ?? null };
  }
  const end = b.doneAt && b.doneAt > b.startMs && b.doneAt < b.endMs ? b.doneAt : b.endMs;
  return { ...base, kind: 'timed', startMs: b.startMs, endMs: b.endMs, spentEndMs: end, spentMs: Math.max(0, end - b.startMs), atMs: b.startMs };
}

function backlogItem(t: Task): DoneItem {
  return {
    key: `later:${t.id}`,
    source: 'backlog',
    kind: 'backlog',
    taskId: t.id,
    date: isoOf(t.doneAt!),
    title: t.title,
    icon: t.icon,
    category: t.category,
    startMs: null,
    endMs: null,
    spentEndMs: null,
    spentMs: 0,
    atMs: t.doneAt!,
    doneAt: t.doneAt!,
    recurring: false,
  };
}

function prayerItem(p: PrayerDone): DoneItem {
  const timed = p.startMs != null && p.endMs != null;
  return {
    key: `cal:salah:${p.id}`,
    source: 'salah',
    kind: timed ? 'timed' : 'anytime',
    taskId: '',
    date: p.date,
    title: p.name,
    icon: p.icon,
    category: 'care',
    startMs: timed ? p.startMs : null,
    endMs: timed ? p.endMs : null,
    spentEndMs: timed ? p.endMs : null,
    spentMs: timed ? Math.max(0, p.endMs! - p.startMs!) : 0,
    atMs: timed ? p.startMs : (p.markedAt ?? null),
    doneAt: p.markedAt ?? null,
    recurring: true,
    how: p.how,
    ...(p.qasr ? { qasr: true } : {}),
  };
}

/** When it was done, for ordering: the tick, else the end of what was spent, else its day. */
export function doneTime(i: DoneItem): number {
  return i.doneAt ?? i.spentEndMs ?? i.atMs ?? startOfDayMs(i.date);
}

const inRange = (d: ISODate, from: ISODate | null, to: ISODate) => (from == null || d >= from) && d <= to;

/**
 * Every finished thing on the days [from, to] (from = null: since the beginning), newest first:
 * by day, then by when it was done. Backlog items count on the day they were finished and only
 * once `nowMs` has reached them. A prayer and its block are one item.
 */
export function completedItems(src: DoneSources, from: ISODate | null, to: ISODate, nowMs = Number.POSITIVE_INFINITY): DoneItem[] {
  const out: DoneItem[] = [];
  const seen = new Set<string>();
  const add = (i: DoneItem) => {
    if (seen.has(i.key) || !inRange(i.date, from, to)) return;
    seen.add(i.key);
    out.push(i);
  };

  for (const t of src.tasks) {
    if (t.date) {
      // Walk the ticks, not the calendar: a long history costs what was finished, not its length.
      for (const d of new Set(t.completions)) {
        if (!inRange(d, from, to)) continue;
        for (const b of taskBlocks(t, d, d)) if (b.done) add(itemFromBlock(b));
      }
    } else if (t.doneAt != null && t.doneAt <= nowMs) add(backlogItem(t));
  }
  for (const p of src.prayers ?? []) add(prayerItem(p));
  for (const ev of src.events ?? []) {
    if (!ev.done || ev.skipped) continue;
    add(itemFromBlock(eventBlock(ev)));
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : doneTime(b) - doneTime(a)));
}

/**
 * What the counts count: everything but prayers, which Waqt counts in its own way (in jamaat,
 * on time) and which would otherwise outnumber the plans they sit between.
 */
export function counts(i: DoneItem): boolean {
  return i.source !== 'salah';
}

// ---------------------------------------------------------------------------
// Filters and days

export type HistoryKind = 'all' | 'tasks' | 'events' | 'salah';

export interface HistoryFilter {
  kind: HistoryKind;
  /** Only this category (null: every one). */
  category: CategoryId | null;
  query: string;
}

export const NO_FILTER: HistoryFilter = { kind: 'all', category: null, query: '' };

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

export function filterActive(f: HistoryFilter): boolean {
  return f.kind !== 'all' || f.category != null || fold(f.query) !== '';
}

/** Items that pass the filter. Search matches every word, in the title or the calendar's name. */
export function filterDone(items: DoneItem[], f: HistoryFilter): DoneItem[] {
  const words = fold(f.query).split(' ').filter(Boolean);
  return items.filter((i) => {
    if (f.kind === 'tasks' && i.source !== 'task' && i.source !== 'backlog') return false;
    if (f.kind === 'events' && i.source !== 'event') return false;
    if (f.kind === 'salah' && i.source !== 'salah') return false;
    if (f.category && i.category !== f.category) return false;
    if (!words.length) return true;
    const hay = fold(`${i.title} ${i.note ?? ''}`);
    return words.every((w) => hay.includes(w));
  });
}

export interface DoneDay {
  date: ISODate;
  /** Newest first. */
  items: DoneItem[];
  /** Counted items (everything but prayers), as "Your week" counts them. */
  done: number;
  /** Of `done`, backlog items. */
  backlog: number;
  /** Time spent on counted timed items. */
  spentMs: number;
  /** Prayers marked. */
  salah: number;
  /** Counted timed items, for the day's tiny dial (by start). */
  arcs: DayArc[];
}

/** The arc a finished timed item draws on its day's dial. */
export function arcOf(i: DoneItem): DayArc | null {
  if (i.kind !== 'timed' || i.startMs == null) return null;
  const start = minutesOfDay(i.startMs);
  return { key: i.key, start, end: start + Math.min(i.spentMs, DAY) / MINUTE, category: i.category, title: i.title };
}

/** Items (newest first) grouped by the day they count on, newest day first. */
export function groupByDay(items: DoneItem[]): DoneDay[] {
  const days: DoneDay[] = [];
  let cur: DoneDay | null = null;
  for (const i of items) {
    if (!cur || cur.date !== i.date) {
      cur = days.find((d) => d.date === i.date) ?? null;
      if (!cur) days.push((cur = { date: i.date, items: [], done: 0, backlog: 0, spentMs: 0, salah: 0, arcs: [] }));
    }
    cur.items.push(i);
    if (!counts(i)) {
      cur.salah++;
      continue;
    }
    cur.done++;
    if (i.kind === 'backlog') cur.backlog++;
    cur.spentMs += i.spentMs;
    const a = arcOf(i);
    if (a) cur.arcs.push(a);
  }
  for (const d of days) d.arcs.sort((a, b) => a.start - b.start);
  return days.sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** The earliest day with anything finished, or null. */
export function firstDoneDate(src: DoneSources): ISODate | null {
  let first: ISODate | null = null;
  const see = (d: ISODate) => {
    if (!first || d < first) first = d;
  };
  for (const t of src.tasks) {
    if (t.date) for (const d of t.completions) see(d);
    else if (t.doneAt != null) see(isoOf(t.doneAt));
  }
  for (const p of src.prayers ?? []) see(p.date);
  for (const ev of src.events ?? []) if (ev.done && !ev.skipped) see(isoOf(ev.startMs));
  return first;
}
