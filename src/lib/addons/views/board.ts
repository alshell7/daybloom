// Timeline views, the board: which column each block sits in, and what a drop means. Pure (no
// stores): the live side (views.svelte.ts) passes in the day's blocks, the tasks and the clock,
// plus a `fit` that finds the first free time on a day, and runs the Drop that comes back.
//
// Grouped by day the columns are Later (the open backlog), Today (the day's plan, timed and
// anytime), Now (what runs) and Done (finished that day). Grouped by week they are Later and the
// next seven days. Calendar events and salah ride along, locked: they show, but never move.

import { addDays, atMinutes, formatDayShort, formatDuration, formatMinutes, MINUTE, minutesOfDay, startOfDayMs } from '../../engine/time';
import type { Block, CategoryId, ISODate, Task } from '../../engine/types';

export type StatusCol = 'later' | 'today' | 'now' | 'done';
export type ColumnId = StatusCol | `day:${string}`;

export interface Card {
  /** Unique on the board: the block key, or `later:<taskId>` for a backlog item. */
  id: string;
  /** The same for one task wherever it shows, so its card flies from column to column. */
  fly: string;
  col: ColumnId;
  /** A dated block (a task occurrence or an event). */
  key: string | null;
  block: Block | null;
  /** The task behind it (a backlog item has only this). */
  taskId: string | null;
  title: string;
  icon: string;
  category: CategoryId;
  minutes: number;
  startMs: number | null;
  endMs: number | null;
  date: ISODate | null;
  /** Calendar events and salah: shown, never dragged. */
  locked: boolean;
  done: boolean;
  /** Its time went by without a tick. Shown quietly (never as a warning), and still movable. */
  earlier: boolean;
  live: boolean;
  anytime: boolean;
  /** When it was finished (the Done column shows the newest first). */
  doneAt: number | null;
  /** Manual backlog order (where a block sent back to Later lands). */
  order: number;
  /** A backlog list ('inbox' | 'next' | 'someday'), for Later cards. */
  list: string | null;
}

export interface Column {
  id: ColumnId;
  cards: Card[];
}

const byOrder = (a: Task, b: Task) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt) || a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Minutes a block lasts (anytime blocks keep their task's length). */
function minutesOf(b: Block, t: Task | undefined): number {
  if (!b.floating) return Math.max(5, Math.round((b.endMs - b.startMs) / MINUTE));
  if (b.kind === 'event') return 0;
  return t ? (t.overrides[b.date]?.duration ?? t.duration) : 30;
}

export function blockCard(b: Block, col: ColumnId, now: number, today: ISODate, t?: Task): Card {
  const own = b.kind === 'task' && !b.readOnly;
  const live = !b.floating && !b.done && b.startMs <= now && now < b.endMs;
  const earlier = own && !b.done && (b.floating ? b.date < today : b.endMs <= now);
  return {
    id: b.key,
    fly: own && !b.recurring && b.taskId ? `t:${b.taskId}` : b.key,
    col,
    key: b.key,
    block: b,
    taskId: b.taskId ?? null,
    title: b.title,
    icon: b.icon,
    category: b.category,
    minutes: minutesOf(b, t),
    startMs: b.floating ? null : b.startMs,
    endMs: b.floating ? null : b.endMs,
    date: b.date,
    locked: !own,
    done: b.done,
    earlier,
    live,
    anytime: b.floating,
    doneAt: b.done ? (b.doneAt ?? b.endMs) : null,
    order: t?.order ?? Number.MAX_SAFE_INTEGER,
    list: null,
  };
}

export function laterCard(t: Task, col: ColumnId): Card {
  return {
    id: `later:${t.id}`,
    fly: `t:${t.id}`,
    col,
    key: null,
    block: null,
    taskId: t.id,
    title: t.title,
    icon: t.icon,
    category: t.category,
    minutes: t.duration,
    startMs: null,
    endMs: null,
    date: null,
    locked: false,
    done: !!t.doneAt,
    earlier: false,
    live: false,
    anytime: false,
    doneAt: t.doneAt ?? null,
    order: t.order ?? t.createdAt,
    list: t.list ?? 'inbox',
  };
}

/** Timed first, by start; anytime after them. */
const byTime = (a: Card, b: Card) => (a.startMs ?? Infinity) - (b.startMs ?? Infinity) || (a.endMs ?? 0) - (b.endMs ?? 0) || (a.id < b.id ? -1 : 1);

export interface StatusInput {
  date: ISODate;
  today: ISODate;
  now: number;
  /** Timed blocks on the day (view.dayBlocks). */
  timed: Block[];
  /** Anytime tasks and all-day events (view.floating). */
  floating: Block[];
  /** Every task: the backlog, and backlog items finished that day, come from here. */
  tasks: Task[];
}

/** The board grouped by status. Now is empty on any day but today. */
export function statusBoard(i: StatusInput): Record<StatusCol, Card[]> {
  const isToday = i.date === i.today;
  const byId = new Map(i.tasks.map((t) => [t.id, t]));
  const out: Record<StatusCol, Card[]> = { later: [], today: [], now: [], done: [] };
  out.later = i.tasks.filter((t) => t.date === null && !t.doneAt).sort(byOrder).map((t) => laterCard(t, 'later'));
  for (const b of i.timed) {
    const t = b.taskId ? byId.get(b.taskId) : undefined;
    const live = isToday && !b.done && b.startMs <= i.now && i.now < b.endMs;
    if (b.kind === 'event' || b.readOnly) {
      // An event that is over needs nothing from you today.
      if (isToday && b.endMs <= i.now) continue;
      out[live ? 'now' : 'today'].push(blockCard(b, live ? 'now' : 'today', i.now, i.today, t));
    } else if (b.done) out.done.push(blockCard(b, 'done', i.now, i.today, t));
    else if (live) out.now.push(blockCard(b, 'now', i.now, i.today, t));
    else out.today.push(blockCard(b, 'today', i.now, i.today, t));
  }
  for (const b of i.floating) {
    const t = b.taskId ? byId.get(b.taskId) : undefined;
    if (b.kind === 'task' && b.done) out.done.push(blockCard(b, 'done', i.now, i.today, t));
    else out.today.push(blockCard(b, 'today', i.now, i.today, t));
  }
  // Backlog items finished that day (from the backlog itself) are done that day too.
  const s = startOfDayMs(i.date);
  const e = startOfDayMs(addDays(i.date, 1));
  for (const t of i.tasks) if (t.date === null && t.doneAt && t.doneAt >= s && t.doneAt < e) out.done.push(laterCard(t, 'done'));
  out.today.sort(byTime);
  out.now.sort((a, b) => (a.locked ? 1 : 0) - (b.locked ? 1 : 0) || (a.endMs ?? 0) - (b.endMs ?? 0));
  out.done.sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0) || byTime(a, b));
  if (!isToday) out.now = [];
  return out;
}

export interface WeekInput {
  dates: ISODate[];
  today: ISODate;
  now: number;
  /** Each day's timed and anytime blocks. */
  days: Record<ISODate, { timed: Block[]; floating: Block[] }>;
  tasks: Task[];
}

/** The board grouped by week: Later, then one column per day. */
export function weekBoard(i: WeekInput): Column[] {
  const byId = new Map(i.tasks.map((t) => [t.id, t]));
  const later: Column = { id: 'later', cards: i.tasks.filter((t) => t.date === null && !t.doneAt).sort(byOrder).map((t) => laterCard(t, 'later')) };
  const days = i.dates.map((date): Column => {
    const id = `day:${date}` as ColumnId;
    const d = i.days[date] ?? { timed: [], floating: [] };
    const cards: Card[] = [];
    for (const b of d.timed) {
      // A block that spills in from last night belongs to its own day's column.
      if (b.date !== date) continue;
      if ((b.kind === 'event' || b.readOnly) && date === i.today && b.endMs <= i.now) continue;
      cards.push(blockCard(b, id, i.now, i.today, b.taskId ? byId.get(b.taskId) : undefined));
    }
    for (const b of d.floating) cards.push(blockCard(b, id, i.now, i.today, b.taskId ? byId.get(b.taskId) : undefined));
    return { id, cards: cards.sort(byTime) };
  });
  return [later, ...days];
}

// ── Drops ─────────────────────────────────────────────────────────────────────

export type Drop =
  /** A backlog item onto a day, at `start` (minutes). `reopen`: it was finished from the backlog. */
  | { kind: 'schedule'; taskId: string; date: ISODate; start: number; minutes: number; reopen?: boolean; now?: boolean }
  /** A block to another time or day (start null: it stays anytime; `kept`: at its own time of day). */
  | { kind: 'move'; key: string; date: ISODate; start: number | null; minutes: number; sameDay: boolean; kept?: boolean }
  /** Start it now (today). */
  | { kind: 'start'; key: string; start: number; minutes: number }
  | { kind: 'unschedule'; key: string }
  | { kind: 'tick'; key: string }
  | { kind: 'untick'; key: string }
  /** A backlog item finished straight from Later. */
  | { kind: 'finish'; taskId: string }
  /** A backlog item finished today goes back to Later. */
  | { kind: 'restore'; taskId: string }
  | { kind: 'reorder'; ids: string[] }
  | { kind: 'none'; why: 'same' | 'full' | 'locked' | 'not'; minutes?: number; date?: ISODate };

export interface DropContext {
  today: ISODate;
  /** The day the status board shows. */
  date: ISODate;
  now: number;
  /** Start (minutes) of the first free stretch on `date` that fits `minutes`, or null. `key`: the block being moved. */
  fit: (date: ISODate, minutes: number, key: string | null) => number | null;
  /** Is `start`–`start + minutes` on `date` free (and still ahead)? A block moved to another day keeps its time then. */
  free?: (date: ISODate, start: number, minutes: number, key: string | null) => boolean;
  /** Later's card ids in order, and where in it the card was dropped (a reorder). */
  laterIds?: string[];
  index?: number;
}

const dayOf = (col: ColumnId): ISODate | null => (col.startsWith('day:') ? col.slice(4) : null);
const none = (why: 'same' | 'full' | 'locked' | 'not', extra: { minutes?: number; date?: ISODate } = {}): Drop => ({ kind: 'none', why, ...extra });

/** Into the first free time on `date`, or "full" when nothing fits. */
function fitInto(card: Card, date: ISODate, ctx: DropContext, sameDay = false): Drop {
  if (card.key && card.anytime && !sameDay) return { kind: 'move', key: card.key, date, start: null, minutes: card.minutes, sameDay };
  // To another day: the same time of day when it is free there.
  if (card.key && !sameDay && card.startMs !== null && ctx.free) {
    const own = Math.round(minutesOfDay(card.startMs));
    if (own + card.minutes <= 1440 && ctx.free(date, own, card.minutes, card.key)) return { kind: 'move', key: card.key, date, start: own, minutes: card.minutes, sameDay, kept: true };
  }
  const start = ctx.fit(date, card.minutes, card.key);
  if (start === null) return none('full', { minutes: card.minutes, date });
  if (card.key) return { kind: 'move', key: card.key, date, start, minutes: card.minutes, sameDay };
  return { kind: 'schedule', taskId: card.taskId!, date, start, minutes: card.minutes, reopen: card.done };
}

/** What dropping `card` on column `to` does. Pure; the live side runs it. */
export function dropFor(card: Card, to: ColumnId, ctx: DropContext): Drop {
  if (card.locked) return none('locked');
  const from = card.col;
  const nowMin = Math.floor(minutesOfDay(ctx.now));
  const backlogItem = !card.key && !!card.taskId;

  if (to === from) {
    if (from === 'later' && ctx.laterIds && ctx.index !== undefined) {
      const rest = ctx.laterIds.filter((x) => x !== card.id);
      const at = Math.max(0, Math.min(rest.length, ctx.index));
      const ids = [...rest.slice(0, at), card.id, ...rest.slice(at)];
      return ids.every((x, k) => x === ctx.laterIds![k]) ? none('same') : { kind: 'reorder', ids };
    }
    // A block whose time went by slides into the next free time when dropped back on its day.
    if (from === 'today' && card.earlier && !card.anytime && card.key && ctx.date === ctx.today) return fitInto(card, ctx.today, ctx, true);
    return none('same');
  }

  const toDay = dayOf(to);
  if (toDay) {
    if (backlogItem) return card.done ? none('not') : fitInto(card, toDay, ctx);
    if (card.done) return none('not');
    if (dayOf(from) === toDay) return none('same');
    return fitInto(card, toDay, ctx);
  }

  switch (to) {
    case 'later':
      if (backlogItem) return card.done ? { kind: 'restore', taskId: card.taskId! } : none('same');
      return card.key ? { kind: 'unschedule', key: card.key } : none('not');
    case 'today':
      if (backlogItem) return fitInto(card, ctx.date, ctx);
      if (from === 'done') return { kind: 'untick', key: card.key! };
      if (from === 'now') return fitInto(card, ctx.today, ctx, true);
      return none('same');
    case 'now':
      if (ctx.date !== ctx.today || card.done) return none('not');
      if (backlogItem) return { kind: 'schedule', taskId: card.taskId!, date: ctx.today, start: nowMin, minutes: card.minutes, now: true };
      return { kind: 'start', key: card.key!, start: nowMin, minutes: card.minutes };
    case 'done':
      if (card.done) return none('same');
      if (backlogItem) return { kind: 'finish', taskId: card.taskId! };
      return { kind: 'tick', key: card.key! };
  }
  return none('not');
}

/** Where the card will sit in the target column once the drop lands (for the drop preview). */
export function landingIndex(cards: Card[], drop: Drop, card: Card, index = 0): number {
  const others = cards.filter((c) => c.id !== card.id);
  const before = (ms: number | null) => (ms === null ? others.length : others.filter((c) => c.startMs !== null && c.startMs <= ms).length);
  switch (drop.kind) {
    case 'reorder':
      return Math.max(0, Math.min(others.length, index));
    case 'schedule':
    case 'move':
      return before(drop.start === null ? null : atMinutes(drop.date, drop.start));
    case 'untick':
      return before(card.startMs);
    case 'unschedule':
      return others.filter((c) => c.order <= card.order).length;
    default:
      return 0;
  }
}

/** A few words for the drop preview: where it will land, or why it can't. */
export function describeDrop(drop: Drop, today: ISODate, hour12: boolean): string {
  const day = (d: ISODate) => (d === today ? 'Today' : d === addDays(today, 1) ? 'Tomorrow' : (({ dow, day: n }) => `${dow} ${n}`)(formatDayShort(d)));
  switch (drop.kind) {
    case 'schedule':
      return drop.now ? 'Start now' : `${formatMinutes(drop.start, hour12)} · first free time`;
    case 'move':
      if (drop.start === null) return `${day(drop.date)} · anytime`;
      if (drop.sameDay) return `${formatMinutes(drop.start, hour12)} · next free time`;
      return `${day(drop.date)} · ${formatMinutes(drop.start, hour12)}${drop.kept ? ' · same time' : ' · first free time'}`;
    case 'start':
      return 'Start now';
    case 'unschedule':
    case 'restore':
      return 'Back to the backlog';
    case 'tick':
    case 'finish':
      return 'Done';
    case 'untick':
      return 'Not done yet';
    case 'reorder':
      return '';
    case 'none':
      if (drop.why === 'full') return `No ${formatDuration((drop.minutes ?? 30) * MINUTE)} gap left${drop.date && drop.date !== today ? ` on ${day(drop.date)}` : ' today'}`;
      return '';
  }
}

/** The column next to `from` (for the keyboard), or null at the edge. */
export function neighbour(cols: ColumnId[], from: ColumnId, dir: 1 | -1): ColumnId | null {
  const i = cols.indexOf(from);
  const j = i + dir;
  return i < 0 || j < 0 || j >= cols.length ? null : cols[j];
}
