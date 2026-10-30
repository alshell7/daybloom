// Jot: the fastest way to get things out of your head. One line per thing; each line is read by
// the rules (quickadd.ts for times and days, backlog.ts for "by fri", "!!", energy) and, with the
// Decision addon on, by TinyDecide for what's only implied. Every line shows where it will go
// before anything is added (components/jot/JotSheet.svelte), and you can move it with a tap.

import { CATEGORY_BY_ID } from './engine/categories';
import { addDays, isoOf, minutesOfDay } from './engine/time';
import type { CategoryId, ISODate, Minutes, Task } from './engine/types';
import type { Destination, RuleHints } from './addons/decision/questions';
import { parseCaptureLine, type CaptureItem } from './backlog';
import { parseQuick, type QuickParse } from './quickadd';
import { suggest } from './actions';

export interface JotLine {
  raw: string;
  quick: QuickParse;
  item: CaptureItem | null;
  hints: RuleHints;
  /** The day written in the line ("fri"), if any. */
  writtenDate: ISODate | null;
}

/** Reads one line with the rules alone (instant; the model's view comes after). */
export function readLine(raw: string, nowMs: number): JotLine | null {
  const line = raw.trim();
  if (!line) return null;
  const nowMin = Math.floor(minutesOfDay(nowMs));
  const today = isoOf(nowMs);
  const tomorrow = addDays(today, 1);
  const quick = parseQuick(line, nowMs, nowMin);
  const item = parseCaptureLine(line, nowMs, nowMin);
  if (!item && !quick.title) return null;
  const said = (k: string) => quick.tokens.some(([, , kind]) => kind === k);
  const writtenDate = said('date') && quick.date ? quick.date : null;
  const due = item?.due ?? null;
  const dayOf = (d: ISODate | null) => (!d ? null : d === today ? 'today' : d === tomorrow ? 'tomorrow' : 'later');
  const hasTime = quick.hasTime && quick.start != null && quick.date !== null;
  return {
    raw: line,
    quick,
    item,
    writtenDate,
    hints: {
      hasTime,
      day: dayOf(writtenDate) ?? dayOf(due),
      later: said('later') && item?.list !== 'someday',
      someday: item?.list === 'someday',
      priority: item?.priority ?? null,
      energy: item?.energy ?? null,
      category: item?.category ?? suggest(quick.title)?.category ?? null,
    },
  };
}

/** Where a line goes when nothing smarter is known: the rules' own answer. */
export function ruleDestination(l: JotLine): Destination {
  const h = l.hints;
  if (h.someday) return 'someday';
  // A time puts it on the dial: on the day it names, else today.
  if (h.hasTime) return h.day === 'tomorrow' ? 'tomorrow' : 'today';
  if (h.day === 'today' || h.day === 'tomorrow') return h.day;
  return h.later || h.day === 'later' ? 'next' : 'inbox';
}

export interface JotPlan {
  dest: Destination;
  category: CategoryId | null;
  priority: 1 | 2 | 3 | null;
  energy: 1 | 2 | 3 | null;
}

/** The task a line becomes. `slot` finds a free time on a day (busy.ts freeSlot). */
export function taskFor(
  l: JotLine,
  p: JotPlan,
  nowMs: number,
  slot: (date: ISODate, minutes: Minutes) => { date: ISODate; start: Minutes } | null,
  order: number,
): Partial<Task> {
  const today = isoOf(nowMs);
  const category = p.category ?? l.item?.category ?? 'focus';
  const icon = (p.category && p.category !== l.item?.category ? undefined : l.item?.icon) ?? suggest(l.quick.title)?.icon ?? CATEGORY_BY_ID[category].icon;
  const title = (p.dest === 'today' || p.dest === 'tomorrow' ? l.quick.title.replace(/\s*!{1,3}\s*$/, '') : l.item?.title) || l.quick.title || l.raw;
  const base = { title, icon, category, priority: p.priority, energy: p.energy, alerts: [5], order };
  if (p.dest === 'today' || p.dest === 'tomorrow') {
    const day = l.writtenDate && l.writtenDate >= today ? l.writtenDate : p.dest === 'today' ? today : addDays(today, 1);
    const date = p.dest === 'tomorrow' && day === today ? addDays(today, 1) : day;
    const duration = l.quick.duration ?? l.item?.duration ?? 30;
    if (l.hints.hasTime && l.quick.start != null) {
      return { ...base, date, start: l.quick.start, duration, recurrence: l.quick.recurrence, ...(l.quick.alarm ? { alarm: {} } : {}) };
    }
    // No time written: the first free time that day that fits, else anytime that day.
    const s = slot(date, duration);
    return { ...base, date: s?.date === date ? date : date, start: s && s.date === date ? s.start : null, duration };
  }
  return {
    ...base,
    date: null,
    start: null,
    duration: l.item?.duration ?? l.quick.duration ?? 30,
    due: l.item?.due ?? null,
    list: p.dest,
  };
}
