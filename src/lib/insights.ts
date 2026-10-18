// "Your week": gentle, specific insights and badges drawn from the user's own tasks.
// Pure (no Svelte): every function takes the task list and a fixed `now`, so the
// panel, the celebration hook and the tests all agree. Calendar events never count.
//
// Rules of the voice: name real progress, never count failures out loud, and let
// time that is still to come stay out of every denominator.

import { taskBlocks } from './engine/blocks';
import { CATEGORIES, CATEGORY_BY_ID } from './engine/categories';
import { addDays, daysBetween, DAY, formatDuration, hourOf, isoOf, MINUTE, minutesOfDay, startOfDayMs } from './engine/time';
import type { Block, CategoryId, ISODate, Task } from './engine/types';

export type Span = 7 | 28;

export type PartOfDay = 'morning' | 'midday' | 'afternoon' | 'evening' | 'night';

/** Parts of the day, by start hour (night wraps past midnight). */
export const PARTS: { id: PartOfDay; from: number; to: number }[] = [
  { id: 'morning', from: 5, to: 11 },
  { id: 'midday', from: 11, to: 14 },
  { id: 'afternoon', from: 14, to: 17 },
  { id: 'evening', from: 17, to: 21 },
  { id: 'night', from: 21, to: 5 },
];

export function partOfHour(h: number): PartOfDay {
  for (const p of PARTS) {
    if (p.from < p.to ? h >= p.from && h < p.to : h >= p.from || h < p.to) return p.id;
  }
  return 'night';
}

/** One finished thing: a timed block, an anytime block, or a backlog item. */
export interface DoneItem {
  key: string;
  taskId: string;
  /** The day it counts on. */
  date: ISODate;
  title: string;
  icon: string;
  category: CategoryId;
  kind: 'timed' | 'anytime' | 'backlog';
  /** Timed only: block start. */
  startMs: number | null;
  /** Timed only: where the spent part ends (the tick, if it landed inside the block). */
  spentEndMs: number | null;
  spentMs: number;
  /** When it happened: a timed block's start, otherwise when it was ticked (if known). */
  atMs: number | null;
  recurring: boolean;
}

export interface DayArc {
  key: string;
  /** Minutes after that day's midnight; `end` may run past 1440 for a block that spills over. */
  start: number;
  end: number;
  category: CategoryId;
  title: string;
}

export interface DayStat {
  date: ISODate;
  /** Finished blocks (timed + anytime). */
  done: number;
  /** Blocks that were due: finished, or their time has fully passed. */
  planned: number;
  /** Backlog items finished that day. */
  backlog: number;
  spentMs: number;
  focusMs: number;
  categories: CategoryId[];
  /** Finished timed blocks, for the tiny dial. */
  arcs: DayArc[];
}

export interface RoutineStat {
  taskId: string;
  title: string;
  icon: string;
  category: CategoryId;
  done: number;
  total: number;
}

export interface PeriodStats {
  from: ISODate;
  to: ISODate;
  days: DayStat[];
  /** Blocks finished (timed + anytime). */
  finished: number;
  /** Blocks that were due (date ≤ today, time passed or finished, not waved off). */
  planned: number;
  /** Of `planned`, the ones finished. */
  kept: number;
  backlogDone: number;
  /** Time well spent per category (ms). */
  spent: Record<CategoryId, number>;
  spentTotal: number;
  /** Finished blocks by the hour they happened in (24 buckets). */
  byHour: number[];
  bestHour: number | null;
  bestPart: { id: PartOfDay; count: number; category: CategoryId } | null;
  routine: RoutineStat | null;
  /** Days with anything finished. */
  activeDays: number;
}

export interface Insights extends PeriodStats {
  span: Span;
  today: ISODate;
  previous: PeriodStats;
}

const emptySpent = (): Record<CategoryId, number> =>
  Object.fromEntries(CATEGORIES.map((c) => [c.id, 0])) as Record<CategoryId, number>;

/**
 * Whether an occurrence belongs in "planned". Finished always counts. An unfinished
 * block counts only once its time has fully passed, and not when the user waved it
 * off ("not done, and that's ok") — time still to come is never held against you.
 */
function isDue(b: Block, task: Task, nowMs: number): boolean {
  if (b.done) return true;
  if (task.acks?.includes(b.date)) return false;
  if (b.floating) return startOfDayMs(addDays(b.date, 1)) <= nowMs;
  return b.endMs <= nowMs;
}

/** A finished block as an item. Spent = min(end, tick) − start; a tick before the start counts the whole block (done early). */
export function itemFromBlock(b: Block): DoneItem {
  const base = {
    key: b.key,
    taskId: b.taskId ?? '',
    date: b.date,
    title: b.title,
    icon: b.icon,
    category: b.category,
    recurring: b.recurring,
  };
  if (b.floating) {
    return { ...base, kind: 'anytime', startMs: null, spentEndMs: null, spentMs: 0, atMs: b.doneAt ?? null };
  }
  const end = b.doneAt && b.doneAt > b.startMs && b.doneAt < b.endMs ? b.doneAt : b.endMs;
  return { ...base, kind: 'timed', startMs: b.startMs, spentEndMs: end, spentMs: Math.max(0, end - b.startMs), atMs: b.startMs };
}

function backlogItem(t: Task): DoneItem {
  return {
    key: `backlog:${t.id}`,
    taskId: t.id,
    date: isoOf(t.doneAt!),
    title: t.title,
    icon: t.icon,
    category: t.category,
    kind: 'backlog',
    startMs: null,
    spentEndMs: null,
    spentMs: 0,
    atMs: t.doneAt!,
    recurring: false,
  };
}

const isBacklogDone = (t: Task, nowMs: number) => t.date === null && t.doneAt != null && t.doneAt <= nowMs;

/** Stats for the days [from, to] inclusive, as of `nowMs`. */
export function periodStats(tasks: Task[], from: ISODate, to: ISODate, nowMs: number): PeriodStats {
  const n = daysBetween(from, to) + 1;
  const days: DayStat[] = Array.from({ length: n }, (_, i) => ({
    date: addDays(from, i),
    done: 0,
    planned: 0,
    backlog: 0,
    spentMs: 0,
    focusMs: 0,
    categories: [],
    arcs: [],
  }));
  const dayOf = (d: ISODate) => days[daysBetween(from, d)];
  const items: DoneItem[] = [];
  const routines: RoutineStat[] = [];
  let planned = 0;

  for (const t of tasks) {
    if (t.date) {
      const r: RoutineStat | null = t.recurrence
        ? { taskId: t.id, title: t.title, icon: t.icon, category: t.category, done: 0, total: 0 }
        : null;
      for (const b of taskBlocks(t, from, to)) {
        if (!isDue(b, t, nowMs)) continue;
        const day = dayOf(b.date);
        day.planned++;
        planned++;
        if (r) r.total++;
        if (!b.done) continue;
        if (r) r.done++;
        day.done++;
        const item = itemFromBlock(b);
        items.push(item);
        if (item.kind === 'timed') {
          const start = minutesOfDay(b.startMs);
          day.arcs.push({
            key: b.key,
            start,
            end: start + Math.min(item.spentMs, DAY) / MINUTE,
            category: b.category,
            title: b.title,
          });
        }
      }
      if (r && r.total) routines.push(r);
    } else if (isBacklogDone(t, nowMs)) {
      const d = isoOf(t.doneAt!);
      if (d < from || d > to) continue;
      dayOf(d).backlog++;
      items.push(backlogItem(t));
    }
  }

  const spent = emptySpent();
  const byHour = new Array<number>(24).fill(0);
  const partCats = new Map<PartOfDay, Map<CategoryId, number>>();
  let finished = 0;
  let backlogDone = 0;
  for (const it of items) {
    const day = dayOf(it.date);
    if (!day.categories.includes(it.category)) day.categories.push(it.category);
    if (it.kind === 'backlog') {
      backlogDone++;
      continue;
    }
    finished++;
    spent[it.category] += it.spentMs;
    day.spentMs += it.spentMs;
    if (it.category === 'focus') day.focusMs += it.spentMs;
    if (it.atMs != null) {
      const h = hourOf(it.atMs);
      byHour[h]++;
      const p = partOfHour(h);
      const m = partCats.get(p) ?? new Map<CategoryId, number>();
      m.set(it.category, (m.get(it.category) ?? 0) + 1);
      partCats.set(p, m);
    }
  }
  for (const d of days) d.arcs.sort((a, b) => a.start - b.start);

  let bestHour: number | null = null;
  for (let h = 0; h < 24; h++) if (byHour[h] > 0 && (bestHour === null || byHour[h] > byHour[bestHour])) bestHour = h;

  let bestPart: PeriodStats['bestPart'] = null;
  for (const p of PARTS) {
    const cats = partCats.get(p.id);
    if (!cats) continue;
    let count = 0;
    let category: CategoryId = 'focus';
    let top = 0;
    // Map iteration follows insertion; break ties by the palette order so it stays deterministic.
    for (const c of CATEGORIES) {
      const v = cats.get(c.id) ?? 0;
      count += v;
      if (v > top) {
        top = v;
        category = c.id;
      }
    }
    if (!bestPart || count > bestPart.count) bestPart = { id: p.id, count, category };
  }

  // The steadiest routine: highest share kept, then most kept, then by title.
  const routine =
    routines
      .filter((r) => r.total >= 3)
      .sort((a, b) => b.done / b.total - a.done / a.total || b.done - a.done || a.title.localeCompare(b.title))[0] ?? null;

  return {
    from,
    to,
    days,
    finished,
    planned,
    kept: finished,
    backlogDone,
    spent,
    spentTotal: Object.values(spent).reduce((a, b) => a + b, 0),
    byHour,
    bestHour,
    bestPart,
    routine,
    activeDays: days.filter((d) => d.done + d.backlog > 0).length,
  };
}

/** The last `span` days (ending today, in the active zone) and the `span` days before. */
export function computeInsights(tasks: Task[], nowMs: number, span: Span = 7): Insights {
  const today = isoOf(nowMs);
  const from = addDays(today, -(span - 1));
  const current = periodStats(tasks, from, today, nowMs);
  const previous = periodStats(tasks, addDays(from, -span), addDays(from, -1), nowMs);
  return { ...current, span, today, previous };
}

// ---------------------------------------------------------------------------
// Encouragement
// ---------------------------------------------------------------------------

export interface Highlight {
  icon: string;
  text: string;
  /** Tint for the icon: a category, or lume for finished-time lines. */
  tone: CategoryId | 'lume' | 'ink';
}

/** "11am" / "11:00" — an hour mark in the user's clock style. */
export function hourLabel(h: number, hour12 = false): string {
  const hh = ((h % 24) + 24) % 24;
  if (!hour12) return `${String(hh).padStart(2, '0')}:00`;
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}${hh < 12 ? 'am' : 'pm'}`;
}

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

const TIME_PHRASE: Record<CategoryId, string> = {
  focus: 'focused work',
  care: 'looking after yourself',
  routine: 'home and routine',
  social: 'time with people',
  rest: 'rest',
  learn: 'learning',
  move: 'movement',
};

function partLine(id: PartOfDay, n: number, hour12: boolean): { icon: string; text: string } {
  const h = (x: number) => hourLabel(x, hour12);
  const blocks = `${n} ${plural(n, 'block')}`;
  switch (id) {
    case 'morning':
      return { icon: 'sunrise', text: `Mornings work for you: ${blocks} finished before ${h(11)}.` };
    case 'midday':
      return { icon: 'sun', text: `Middays are your stride: ${blocks} finished between ${h(11)} and ${h(14)}.` };
    case 'afternoon':
      return { icon: 'sun', text: `Afternoons suit you: ${blocks} finished between ${h(14)} and ${h(17)}.` };
    case 'evening':
      return { icon: 'sunset', text: `Evenings are your time: ${blocks} finished after ${h(17)}.` };
    case 'night':
      return { icon: 'moon', text: `You find your rhythm late: ${blocks} finished after ${h(21)}.` };
  }
}

/** Is this period on the light side? (Then it opens with a kind reframe, never a comparison.) */
export function isLight(s: PeriodStats & { span: Span }): boolean {
  const k = s.span / 7;
  return s.finished + s.backlogDone < 6 * k || s.activeDays < 3 * k;
}

/**
 * Two to four short, specific, warm lines. Deterministic: the same stats always say
 * the same thing, in the same order.
 */
export function highlights(s: Insights, { hour12 = false }: { hour12?: boolean } = {}): Highlight[] {
  const week = s.span === 7;
  const period = week ? 'this week' : 'in the last 4 weeks';
  const total = s.finished + s.backlogDone;
  const out: Highlight[] = [];

  if (total === 0) {
    out.push({
      icon: 'plant',
      tone: 'care',
      text: week
        ? 'A quiet week. Nothing to catch up on — the dial is ready when you are.'
        : 'A quiet few weeks. Nothing to catch up on — the dial is ready when you are.',
    });
    out.push({ icon: 'timer', tone: 'focus', text: 'One small block is a great start. Even ten minutes counts.' });
    return out;
  }

  const light = isLight(s);
  const lines: (Highlight | null)[] = [];

  const kept = (min: number): Highlight | null =>
    s.planned >= 3 && s.kept / s.planned >= min
      ? {
          icon: 'circle-check',
          tone: 'lume',
          text: s.kept === s.planned ? `You kept all ${s.planned} plans ${period}.` : `You kept ${s.kept} of ${s.planned} plans ${period}.`,
        }
      : null;

  const part = (min: number): Highlight | null => {
    if (!s.bestPart || s.bestPart.count < min) return null;
    return { ...partLine(s.bestPart.id, s.bestPart.count, hour12), tone: s.bestPart.category };
  };

  const routine = (): Highlight | null => {
    const r = s.routine;
    if (!r || r.done < 2 || r.done / r.total < 0.5) return null;
    const name = r.title.trim() || 'Your routine';
    return {
      icon: r.icon,
      tone: r.category,
      text: r.done === r.total ? `${name}: all ${r.total} days.` : `${name}: ${r.done} of ${r.total} days.`,
    };
  };

  const backlog = (): Highlight | null =>
    s.backlogDone > 0
      ? {
          icon: 'inbox',
          tone: 'lume',
          text: s.backlogDone === 1 ? 'You cleared one thing from your backlog.' : `You cleared ${s.backlogDone} things from your backlog.`,
        }
      : null;

  const topTime = (): Highlight | null => {
    if (s.spentTotal < 60 * MINUTE) return null;
    let top: CategoryId = 'focus';
    for (const c of CATEGORIES) if (s.spent[c.id] > s.spent[top]) top = c.id;
    return { icon: CATEGORY_BY_ID[top].icon, tone: top, text: `${formatDuration(s.spent[top])} went to ${TIME_PHRASE[top]}.` };
  };

  const trend = (): Highlight | null => {
    const prev = s.previous.finished;
    const diff = s.finished - prev;
    if (prev === 0 || diff <= 0) return null;
    return {
      icon: 'trend-up',
      tone: 'lume',
      text: `${diff} more ${plural(diff, 'block')} finished than ${week ? 'last week' : 'the 4 weeks before'}.`,
    };
  };

  if (light) {
    const n = s.activeDays;
    const opener = week ? 'A lighter week.' : 'A lighter few weeks.';
    lines.push({
      icon: 'leaf',
      tone: 'care',
      text:
        n <= 1
          ? `${opener} You still showed up — and one day counts. Small blocks are a great restart.`
          : `${opener} You still showed up on ${n} days — small blocks are a great restart.`,
    });
    lines.push(backlog(), routine(), part(2), kept(0.8), topTime());
  } else {
    lines.push(kept(0.6), part(3), routine(), backlog(), topTime(), trend());
  }

  for (const l of lines) if (l && out.length < 4) out.push(l);
  if (out.length < 2) out.push({ icon: 'sparkles', tone: 'lume', text: 'Every finished block glows on your dial.' });
  return out;
}

// ---------------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------------

export interface HistoryDay {
  date: ISODate;
  /** Every block that day (timed + anytime). */
  planned: number;
  /** Finished blocks that day. */
  done: number;
  focusMs: number;
  categories: Set<CategoryId>;
}

/** Everything ever finished, up to now — the ground the badges stand on. */
export interface History {
  nowMs: number;
  today: ISODate;
  tasks: Task[];
  items: DoneItem[];
  days: Map<ISODate, HistoryDay>;
  /** Days with anything finished, ascending. */
  activeDates: ISODate[];
}

export function buildHistory(tasks: Task[], nowMs: number): History {
  const today = isoOf(nowMs);
  const dates = new Set<ISODate>();
  for (const t of tasks) {
    if (t.date) for (const d of t.completions) if (d <= today) dates.add(d);
    if (isBacklogDone(t, nowMs)) dates.add(isoOf(t.doneAt!));
  }
  const items: DoneItem[] = [];
  const days = new Map<ISODate, HistoryDay>();
  for (const date of [...dates].sort()) {
    const day: HistoryDay = { date, planned: 0, done: 0, focusMs: 0, categories: new Set() };
    for (const t of tasks) {
      if (!t.date || t.date > date) continue;
      for (const b of taskBlocks(t, date, date)) {
        day.planned++;
        if (!b.done) continue;
        const it = itemFromBlock(b);
        items.push(it);
        day.done++;
        day.categories.add(it.category);
        if (it.category === 'focus') day.focusMs += it.spentMs;
      }
    }
    days.set(date, day);
  }
  for (const t of tasks) {
    if (!isBacklogDone(t, nowMs)) continue;
    const it = backlogItem(t);
    items.push(it);
    days.get(it.date)?.categories.add(it.category);
  }
  const activeDates = [...new Set(items.map((i) => i.date))].sort();
  return { nowMs, today, tasks, items, days, activeDates };
}

export interface Achievement {
  id: string;
  title: string;
  /** Shown once it is earned. */
  description: string;
  /** One quiet line while it is still ahead. */
  hint: string;
  icon: string;
  /** Medallion tint: a category, lume (finished time itself) or the whole palette. */
  tone: CategoryId | 'lume' | 'spectrum';
  test: (h: History) => boolean;
}

const anyDay = (h: History, f: (d: HistoryDay) => boolean) => [...h.days.values()].some(f);
const minuteOf = (i: DoneItem) => (i.atMs == null ? null : minutesOfDay(i.atMs));

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first-bloom',
    title: 'First bloom',
    description: 'Your first finished block. The dial started to glow.',
    hint: 'Finish any block.',
    icon: 'plant',
    tone: 'care',
    test: (h) => h.items.length > 0,
  },
  {
    id: 'full-day',
    title: 'A full day',
    description: 'Every block on a day of three or more, done.',
    hint: 'Tick every block on a day with three or more.',
    icon: 'sun',
    tone: 'routine',
    test: (h) => anyDay(h, (d) => d.planned >= 3 && d.done === d.planned),
  },
  {
    id: 'early-bird',
    title: 'Early bird',
    description: 'Finished something that began before 9 in the morning.',
    hint: 'Finish a block that starts before 9 in the morning.',
    icon: 'sunrise',
    tone: 'routine',
    test: (h) =>
      h.items.some((i) => {
        const m = minuteOf(i);
        return m != null && m >= 4 * 60 && m < 9 * 60;
      }),
  },
  {
    id: 'night-owl',
    title: 'Night owl',
    description: 'Finished something after 9 at night.',
    hint: 'Finish a block that starts after 9 at night.',
    icon: 'moon',
    tone: 'rest',
    test: (h) =>
      h.items.some((i) => {
        const m = minuteOf(i);
        return m != null && (m >= 21 * 60 || m < 4 * 60);
      }),
  },
  {
    id: 'focus-hour',
    title: 'Focus hour',
    description: 'A full hour of focus in one day.',
    hint: 'Spend an hour on focus blocks in a day.',
    icon: 'timer',
    tone: 'focus',
    test: (h) => anyDay(h, (d) => d.focusMs >= 60 * MINUTE),
  },
  {
    id: 'deep-diver',
    title: 'Deep diver',
    description: 'Two hours of focus in one day.',
    hint: 'Spend two hours on focus blocks in a day.',
    icon: 'brain',
    tone: 'focus',
    test: (h) => anyDay(h, (d) => d.focusMs >= 120 * MINUTE),
  },
  {
    id: 'routine-keeper',
    title: 'Routine keeper',
    description: 'Kept a repeating block five times.',
    hint: 'Finish a repeating block five times.',
    icon: 'repeat',
    tone: 'care',
    test: (h) => h.tasks.some((t) => t.recurrence && t.completions.filter((d) => d <= h.today).length >= 5),
  },
  {
    id: 'backlog-bulldozer',
    title: 'Backlog bulldozer',
    description: 'Cleared five things from your backlog.',
    hint: 'Finish five things from your backlog.',
    icon: 'archive',
    tone: 'move',
    test: (h) => h.items.filter((i) => i.kind === 'backlog').length >= 5,
  },
  {
    id: 'planner',
    title: 'Planner',
    description: 'Planned two blocks for a day before it began.',
    hint: 'Plan two blocks for tomorrow before today ends.',
    icon: 'calendar-clock',
    tone: 'learn',
    test: (h) => {
      const ahead = new Map<ISODate, number>();
      const horizon = addDays(h.today, 1);
      for (const t of h.tasks) {
        if (!t.date || t.recurrence || t.date > horizon || t.createdAt > h.nowMs) continue;
        if (t.createdAt < startOfDayMs(t.date)) ahead.set(t.date, (ahead.get(t.date) ?? 0) + 1);
      }
      return [...ahead.values()].some((n) => n >= 2);
    },
  },
  {
    id: 'comeback',
    title: 'Welcome back',
    description: 'Picked things up again after a few days away. Coming back counts.',
    hint: 'Return after a few days away — coming back counts.',
    icon: 'hand',
    tone: 'social',
    test: (h) => h.activeDates.some((d, i) => i > 0 && daysBetween(h.activeDates[i - 1], d) >= 4),
  },
  {
    id: 'week-of-light',
    title: 'Week of light',
    description: 'Finished something on five days out of seven.',
    hint: 'Finish something on five days out of seven.',
    icon: 'sparkles',
    tone: 'lume',
    test: (h) =>
      h.activeDates.some((d, i) => {
        let n = 0;
        for (let j = i; j < h.activeDates.length && daysBetween(d, h.activeDates[j]) < 7; j++) n++;
        return n >= 5;
      }),
  },
  {
    id: 'balanced-day',
    title: 'Balanced day',
    description: 'Three different kinds of time in one day.',
    hint: 'Finish blocks from three categories in a day.',
    icon: 'palette',
    tone: 'spectrum',
    test: (h) => anyDay(h, (d) => d.categories.size >= 3),
  },
  {
    id: 'steps-taker',
    title: 'Step by step',
    description: 'Finished a block with every step ticked.',
    hint: 'Tick every step in a block that has steps.',
    icon: 'list',
    tone: 'learn',
    test: (h) => {
      const finished = new Set(h.items.map((i) => i.taskId));
      return h.tasks.some((t) => t.subtasks.length >= 2 && t.subtasks.every((s) => s.done) && finished.has(t.id));
    },
  },
  {
    id: 'marathon',
    title: 'Marathon',
    description: 'Six blocks finished in one day.',
    hint: 'Finish six blocks in a day.',
    icon: 'trophy',
    tone: 'move',
    test: (h) => anyDay(h, (d) => d.done >= 6),
  },
];

export const ACHIEVEMENT_BY_ID: Record<string, Achievement> = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

/** Badges satisfied now that aren't in `unlockedIds` yet, in list order. */
export function evaluateAchievements(tasks: Task[], nowMs: number, unlockedIds: Iterable<string> = []): Achievement[] {
  const have = new Set(unlockedIds);
  const todo = ACHIEVEMENTS.filter((a) => !have.has(a.id));
  if (!todo.length) return [];
  const h = buildHistory(tasks, nowMs);
  return todo.filter((a) => a.test(h));
}
