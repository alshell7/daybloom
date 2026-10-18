// The backlog: everything without a date. Inbox (unsorted capture), Next, Someday,
// and Done (finished straight from the backlog).
//
// The top half of this file is pure (no stores, no clock): sorting, filtering,
// brain-dump parsing and the "Plan my day" planner. Tests cover it with a fixed now.
// The bottom half is a thin layer of store helpers the panel calls; they mutate
// `taskFile.value.tasks` through `tasks.*` and speak through `view.say`.

import { suggest } from './actions';
import { blocksInRange } from './engine/blocks';
import { addDays, atMinutes, daysBetween, DAY, formatDayShort, formatDuration, formatTime, isoOf, MINUTE, minutesOfDay, startOfDayMs, weekday } from './engine/time';
import type { BacklogList, CategoryId, ISODate, Minutes, Task } from './engine/types';
import { parseQuick } from './quickadd';
import { sounds } from './sound';
import { clock } from './stores/clock.svelte';
import { settings } from './stores/settings.svelte';
import { taskFile, tasks } from './stores/tasks.svelte';
import { view } from './stores/view.svelte';

export type Level = 1 | 2 | 3;
export type ListId = BacklogList | 'done';
export type SortMode = 'manual' | 'priority' | 'due' | 'shortest' | 'oldest';

export const LISTS: { id: ListId; label: string; icon: string }[] = [
  { id: 'inbox', label: 'Inbox', icon: 'inbox' },
  { id: 'next', label: 'Next', icon: 'arrow-right' },
  { id: 'someday', label: 'Someday', icon: 'sunrise' },
  { id: 'done', label: 'Done', icon: 'circle-check' },
];

export const SORTS: { id: SortMode; label: string }[] = [
  { id: 'manual', label: 'Manual' },
  { id: 'priority', label: 'Priority' },
  { id: 'due', label: 'Due date' },
  { id: 'shortest', label: 'Shortest first' },
  { id: 'oldest', label: 'Oldest' },
];

export const PRIORITY_LABEL: Record<Level, string> = { 1: 'Must', 2: 'Should', 3: 'Could' };
export const ENERGY_LABEL: Record<Level, string> = { 1: 'Low energy', 2: 'Some energy', 3: 'High energy' };
export const ENERGY_ICON: Record<Level, string> = { 1: 'battery-low', 2: 'battery-medium', 3: 'battery-full' };
export const DURATIONS: Minutes[] = [15, 30, 45, 60, 90];

// ── Membership ────────────────────────────────────────────────────────────────

export function isBacklog(t: Task): boolean {
  return t.date === null;
}

/** Which tab an undated task shows in. No `list` → Inbox. */
export function listOf(t: Task): ListId {
  if (t.doneAt) return 'done';
  return t.list ?? 'inbox';
}

/** Undated, unfinished tasks — what "Later" should show everywhere. */
export function openItems(all: Task[]): Task[] {
  return all.filter((t) => t.date === null && !t.doneAt);
}

export function itemsIn(all: Task[], list: ListId): Task[] {
  return all.filter((t) => t.date === null && listOf(t) === list);
}

export function counts(all: Task[]): Record<ListId, number> {
  const out: Record<ListId, number> = { inbox: 0, next: 0, someday: 0, done: 0 };
  for (const t of all) if (t.date === null) out[listOf(t)]++;
  return out;
}

// ── Find & sort ───────────────────────────────────────────────────────────────

export interface Filter {
  query: string;
  categories: CategoryId[];
  energy: Level[];
  priority: Level[];
}

export const EMPTY_FILTER: Filter = { query: '', categories: [], energy: [], priority: [] };

export function filterActive(f: Filter): boolean {
  return !!f.query.trim() || f.categories.length > 0 || f.energy.length > 0 || f.priority.length > 0;
}

export function matches(t: Task, f: Filter): boolean {
  const words = f.query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length) {
    const hay = `${t.title} ${t.notes}`.toLowerCase();
    if (!words.every((w) => hay.includes(w))) return false;
  }
  if (f.categories.length && !f.categories.includes(t.category)) return false;
  if (f.energy.length && !(t.energy && f.energy.includes(t.energy))) return false;
  if (f.priority.length && !(t.priority && f.priority.includes(t.priority))) return false;
  return true;
}

export function filterItems(items: Task[], f: Filter): Task[] {
  return items.filter((t) => matches(t, f));
}

const byOrder = (a: Task, b: Task) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt) || a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const prio = (t: Task) => t.priority ?? 9;
const dueKey = (t: Task) => t.due ?? '9999-12-31';

/** Done items are always newest first; the open lists follow `mode`. */
export function sortItems(items: Task[], mode: SortMode, list: ListId = 'inbox'): Task[] {
  const out = [...items];
  if (list === 'done') return out.sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0) || byOrder(a, b));
  switch (mode) {
    case 'priority':
      return out.sort((a, b) => prio(a) - prio(b) || dueKey(a).localeCompare(dueKey(b)) || byOrder(a, b));
    case 'due':
      return out.sort((a, b) => dueKey(a).localeCompare(dueKey(b)) || prio(a) - prio(b) || byOrder(a, b));
    case 'shortest':
      return out.sort((a, b) => a.duration - b.duration || byOrder(a, b));
    case 'oldest':
      return out.sort((a, b) => a.createdAt - b.createdAt || byOrder(a, b));
    default:
      return out.sort(byOrder);
  }
}

/**
 * New manual order after dropping `id` before `beforeId` (null → after `afterId`, or the end).
 * `ordered` is the whole list in its current manual order; returns ids in their new order.
 */
export function reorderIds(ordered: string[], id: string, beforeId: string | null, afterId: string | null = null): string[] {
  const rest = ordered.filter((x) => x !== id);
  let i = rest.length;
  if (beforeId && rest.includes(beforeId)) i = rest.indexOf(beforeId);
  else if (afterId && rest.includes(afterId)) i = rest.indexOf(afterId) + 1;
  rest.splice(i, 0, id);
  return rest;
}

// ── Little cycles for the row chips ───────────────────────────────────────────

export function nextDuration(d: Minutes, back = false): Minutes {
  if (back) {
    const smaller = [...DURATIONS].reverse().find((x) => x < d);
    return smaller ?? DURATIONS[DURATIONS.length - 1];
  }
  return DURATIONS.find((x) => x > d) ?? DURATIONS[0];
}

/** null → 1 → 2 → 3 → null. */
export function nextLevel(v: Level | null | undefined): Level | null {
  if (!v) return 1;
  return v === 3 ? null : ((v + 1) as Level);
}

// ── Dates, said kindly ────────────────────────────────────────────────────────

export type DueState = 'overdue' | 'today' | 'soon' | 'later';

export function dueState(due: ISODate | null | undefined, today: ISODate): DueState | null {
  if (!due) return null;
  const d = daysBetween(today, due);
  if (d < 0) return 'overdue';
  if (d === 0) return 'today';
  if (d <= 2) return 'soon';
  return 'later';
}

export function dueLabel(due: ISODate, today: ISODate): string {
  const d = daysBetween(today, due);
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  if (d === -1) return 'Yesterday';
  const { dow, day } = formatDayShort(due);
  if (d > 1 && d < 7) return dow;
  return `${dow} ${day}`;
}

/** "2 weeks" for inbox items that have sat a while; null when still fresh (< 7 days). */
export function ageLabel(createdAt: number, nowMs: number): string | null {
  const days = Math.floor((nowMs - createdAt) / DAY);
  if (days < 7) return null;
  if (days < 30) {
    const w = Math.floor(days / 7);
    return `${w} ${w === 1 ? 'week' : 'weeks'}`;
  }
  if (days < 365) {
    const m = Math.floor(days / 30);
    return `${m} ${m === 1 ? 'month' : 'months'}`;
  }
  return 'a year+';
}

/** "just now", "2h ago", "Mon", "Oct 3" — when something was finished. */
export function doneLabel(doneAt: number, nowMs: number): string {
  const mins = Math.floor((nowMs - doneAt) / MINUTE);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const d = daysBetween(isoOf(doneAt), isoOf(nowMs));
  if (d === 0) return `${Math.floor(mins / 60)}h ago`;
  if (d === 1) return 'yesterday';
  const { dow, day } = formatDayShort(isoOf(doneAt));
  return d < 7 ? dow : `${dow} ${day}`;
}

// ── Brain-dump capture ────────────────────────────────────────────────────────

export interface CaptureItem {
  title: string;
  duration: Minutes;
  due: ISODate | null;
  priority: Level | null;
  energy: Level | null;
  /** Only set when the line asked for it ("someday"); otherwise the target list. */
  list: BacklogList | null;
  icon?: string;
  category?: CategoryId;
}

const WD_WORD = String.raw`(sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?)`;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MON_WORD = String.raw`(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)`;
const NUM_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5 };

const DUE_KEY = /\b(?:due(?:\s+(?:by|on|before))?|by|before|deadline:?)\s+/gi;

/** A date phrase at the very start of `s` → [length consumed, date]. */
function duePhrase(s: string, today: ISODate): [number, ISODate] | null {
  const cur = weekday(today);
  const tries: [RegExp, (m: RegExpExecArray) => ISODate | null][] = [
    [/^(?:today|tonight|eod)\b/i, () => today],
    [/^(?:tomm?orr?ow|tmrw?|tmw)\b/i, () => addDays(today, 1)],
    [new RegExp(String.raw`^(?:(next|this)\s+)?${WD_WORD}\b`, 'i'), (m) => {
      const wd = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(m[2].slice(0, 3).toLowerCase());
      if (m[1]?.toLowerCase() === 'next') return addDays(today, 7 - ((cur + 6) % 7) + ((wd + 6) % 7));
      return addDays(today, (wd - cur + 7) % 7);
    }],
    [/^(?:the\s+)?(?:end\s+of\s+(?:the\s+)?(week|month)|eo(w|m))\b/i, (m) => {
      if ((m[1] ?? m[2]).toLowerCase().startsWith('w')) {
        // Friday of this week; on the weekend, Sunday.
        const toFri = (5 - cur + 7) % 7;
        return cur === 6 || cur === 0 ? addDays(today, (7 - cur) % 7) : addDays(today, toFri);
      }
      const [y, mo] = today.split('-').map(Number);
      const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
      return `${y}-${String(mo).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
    }],
    [/^next\s+week\b/i, () => addDays(today, 7 - ((cur + 6) % 7))],
    [/^next\s+month\b/i, () => {
      const [y, mo] = today.split('-').map(Number);
      return mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, '0')}-01`;
    }],
    [/^in\s+(\d+|an?|one|two|three|four|five)\s+(days?|weeks?)\b/i, (m) => {
      const n = /\d/.test(m[1]) ? Number(m[1]) : NUM_WORDS[m[1].toLowerCase()];
      return addDays(today, n * (/^w/i.test(m[2]) ? 7 : 1));
    }],
    [/^(\d{4})-(\d{2})-(\d{2})\b/, (m) => `${m[1]}-${m[2]}-${m[3]}`],
    [new RegExp(String.raw`^${MON_WORD}\s+(\d{1,2})(?:st|nd|rd|th)?\b`, 'i'), (m) => monthDay(today, m[1], Number(m[2]))],
    [new RegExp(String.raw`^(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?${MON_WORD}\b`, 'i'), (m) => monthDay(today, m[2], Number(m[1]))],
  ];
  for (const [re, fn] of tries) {
    const m = re.exec(s);
    if (!m) continue;
    const d = fn(m);
    if (d) return [m[0].length, d];
  }
  return null;
}

/** "oct 30" → this year's date, or next year's if it has passed. */
function monthDay(today: ISODate, mon: string, day: number): ISODate | null {
  const mo = MONTHS.indexOf(mon.slice(0, 3).toLowerCase()) + 1;
  if (mo < 1 || day < 1 || day > 31) return null;
  let y = Number(today.slice(0, 4));
  const iso = (yy: number) => `${yy}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  if (iso(y) < today) y++;
  return iso(y);
}

const ENERGY_RE = /\b(?:(low|lo|little|medium|med|mid|some|high|hi|lots\s+of)[\s-]*energy|energy\s*[:=]?\s*(low|medium|med|mid|high))\b/i;
// No lookbehind: older macOS WebKit (Safari < 16.4) can't parse it.
const PRIO_P_RE = /(^|\s)p([123])\b/i;
/** A standalone "!"/"!!", or one glued to the end or start of the line → [start, end, bangs]. */
function bangs(s: string): [number, number, string] | null {
  let m = /(^|\s)(!{1,3})(?=\s|$)/.exec(s);
  if (m) return [m.index + m[1].length, m.index + m[0].length, m[2]];
  m = /\w(!{1,3})\s*$/.exec(s);
  if (m) return [m.index + 1, m.index + m[0].length, m[1]];
  m = /^(!{1,3})(?=\w)/.exec(s);
  if (m) return [0, m[0].length, m[1]];
  return null;
}

const levelOfEnergy = (w: string): Level => (/^(low|lo|little)/i.test(w) ? 1 : /^(high|hi|lots)/i.test(w) ? 3 : 2);

function cut(s: string, a: number, b: number) {
  return `${s.slice(0, a)} ${s.slice(b)}`;
}

function tidyTitle(s: string): string {
  const t = s
    .replace(/\(\s*\)|\[\s*\]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/ ([,;])/g, '$1')
    .replace(/^[\s,.;:\-–—/&+@~]+|[\s,.;:\-–—/&+@~]+$/g, '');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** One brain-dump line → a backlog item, or null for an empty line. */
export function parseCaptureLine(line: string, nowMs: number, nowMinutes = Math.floor(minutesOfDay(nowMs))): CaptureItem | null {
  const today = isoOf(nowMs);
  // Bullets and checkboxes from pasted lists.
  let s = line.replace(/^\s*(?:[-*•–·>]+|\d{1,3}[.)]|\[[ xX]?\])\s*/, '').trim();
  if (!s) return null;

  // Due: "by fri", "due tomorrow", "before oct 30".
  let due: ISODate | null = null;
  DUE_KEY.lastIndex = 0;
  for (let m = DUE_KEY.exec(s); m; m = DUE_KEY.exec(s)) {
    const at = m.index + m[0].length;
    const hit = duePhrase(s.slice(at), today);
    if (hit) {
      due = hit[1];
      s = cut(s, m.index, at + hit[0]);
      break;
    }
  }

  // Energy: "low energy", "high-energy", "energy: low".
  let energy: Level | null = null;
  const em = ENERGY_RE.exec(s);
  if (em) {
    energy = levelOfEnergy(em[1] ?? em[2]);
    s = cut(s, em.index, em.index + em[0].length);
  }

  // Priority: "!!" (must) / "!" (should), or p1–p3.
  let priority: Level | null = null;
  const pm = PRIO_P_RE.exec(s);
  if (pm) {
    priority = Number(pm[2]) as Level;
    s = cut(s, pm.index + pm[1].length, pm.index + pm[0].length);
  } else {
    const bm = bangs(s);
    if (bm) {
      priority = bm[2].length >= 2 ? 1 : 2;
      s = cut(s, bm[0], bm[1]);
    }
  }

  // Duration (and anything else quick-add understands). A named date becomes the
  // due date when none was given; times stay in the title — this is a dump, not a schedule.
  const q = parseQuick(s, nowMs, nowMinutes);
  let list: BacklogList | null = null;
  const drop: [number, number][] = [];
  for (const [a, b, kind] of q.tokens) {
    if (kind === 'duration') drop.push([a, b]);
    else if (kind === 'later') {
      if (/some\s?day/i.test(s.slice(a, b))) list = 'someday';
      drop.push([a, b]);
    } else if (kind === 'date' && !due && q.date && q.date >= today) {
      due = q.date;
      drop.push([a, b]);
    }
  }
  let rest = '';
  let pos = 0;
  for (const [a, b] of drop.sort((x, y) => x[0] - y[0])) {
    rest += `${s.slice(pos, a)} `;
    pos = b;
  }
  rest += s.slice(pos);
  const title = tidyTitle(rest);
  if (!title) return null;

  const hint = suggest(title);
  return {
    title,
    duration: Math.max(5, Math.min(12 * 60, q.duration ?? 30)),
    due,
    priority,
    energy,
    list,
    ...(hint ?? {}),
  };
}

/** A whole brain dump, one item per non-empty line. */
export function parseCapture(text: string, nowMs: number, nowMinutes?: number): CaptureItem[] {
  const out: CaptureItem[] = [];
  for (const line of text.split(/\r?\n/)) {
    const item = parseCaptureLine(line, nowMs, nowMinutes);
    if (item) out.push(item);
  }
  return out;
}

// ── Plan my day ───────────────────────────────────────────────────────────────

export interface Span {
  startMs: number;
  endMs: number;
  floating?: boolean;
}

export interface PlanOptions {
  /** Plan from here (usually now); rounded up to 5 minutes. */
  fromMs: number;
  /** …until here (usually the user's sleep time). */
  toMs: number;
  /** The calendar day "due soon" is measured from. Defaults to the day of `fromMs`. */
  today?: ISODate;
  /** High-energy work fits before this, low-energy after. Defaults to 13:00 that day. */
  peakEndMs?: number;
  /** Transition room around every block, minutes. Default 5. */
  bufferMin?: number;
  /** Never fill more than this share of the free time. Default 0.8. */
  fill?: number;
  /** 0 = best guess; each click of Shuffle tries a different (repeatable) order. */
  shuffle?: number;
  /** Only consider these task ids (e.g. the ones due today). */
  only?: string[];
}

export interface PlannedItem {
  taskId: string;
  title: string;
  icon: string;
  category: CategoryId;
  startMs: number;
  endMs: number;
  duration: Minutes;
  /** A short, kind reason for the slot ("Due today", "High energy · morning"). */
  why: string | null;
}

export interface Plan {
  items: PlannedItem[];
  /** Free time in the window, before buffers. */
  freeMs: number;
  /** The most the plan may fill (fill × free). */
  budgetMs: number;
  usedMs: number;
  /** Candidates left out, and why. */
  skipped: { taskId: string; reason: 'too-long' | 'no-room' }[];
  fromMs: number;
  toMs: number;
}

const STEP = 5 * MINUTE;
const up5 = (ms: number) => Math.ceil(ms / STEP) * STEP;
const down5 = (ms: number) => Math.floor(ms / STEP) * STEP;

/** Free stretches in [from, to) between busy spans, with no buffers. */
export function freeSpans(busy: Span[], fromMs: number, toMs: number): Span[] {
  const out: Span[] = [];
  let cursor = fromMs;
  for (const b of busy.filter((b) => !b.floating && b.endMs > fromMs && b.startMs < toMs).sort((a, b) => a.startMs - b.startMs)) {
    if (b.startMs > cursor) out.push({ startMs: cursor, endMs: Math.min(b.startMs, toMs) });
    cursor = Math.max(cursor, b.endMs);
    if (cursor >= toMs) break;
  }
  if (toMs > cursor) out.push({ startMs: cursor, endMs: toMs });
  return out;
}

export function freeTime(busy: Span[], fromMs: number, toMs: number): number {
  return freeSpans(busy, fromMs, toMs).reduce((s, g) => s + g.endMs - g.startMs, 0);
}

/** Free stretches shrunk by a transition buffer next to every busy block, on a 5-minute grid. */
function usableSpans(busy: Span[], fromMs: number, toMs: number, buffer: number): Span[] {
  const out: Span[] = [];
  const from = up5(fromMs);
  let lastEnd = -Infinity;
  const push = (s: number, e: number) => {
    const a = up5(Math.max(s, from));
    const b = down5(Math.min(e, toMs));
    if (b - a >= STEP) out.push({ startMs: a, endMs: b });
  };
  for (const b of busy.filter((b) => !b.floating && b.endMs > from - buffer && b.startMs < toMs).sort((a, b) => a.startMs - b.startMs)) {
    push(Math.max(from, lastEnd + buffer), b.startMs - buffer);
    lastEnd = Math.max(lastEnd, b.endMs);
  }
  push(Math.max(from, lastEnd + buffer), toMs);
  return out;
}

const LIST_RANK: Record<BacklogList, number> = { next: 0, inbox: 1, someday: 2 };

function dueRank(t: Task, today: ISODate): number {
  if (!t.due) return 4;
  const d = daysBetween(today, t.due);
  return d <= 0 ? 0 : d === 1 ? 1 : d <= 3 ? 2 : 3;
}

/** Deterministic 0..1 from a string (FNV-1a + a mix). */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/** Candidates in the order the planner tries them. */
export function planOrder(all: Task[], today: ISODate, shuffle = 0, only?: string[]): Task[] {
  const pool = openItems(all).filter((t) => !only || only.includes(t.id));
  const ranked = pool.sort(
    (a, b) =>
      dueRank(a, today) - dueRank(b, today) ||
      (a.priority ?? 2.5) - (b.priority ?? 2.5) ||
      LIST_RANK[a.list ?? 'inbox'] - LIST_RANK[b.list ?? 'inbox'] ||
      byOrder(a, b),
  );
  if (!shuffle) return ranked;
  // Shuffle keeps what's due today up front and jitters the rest by a few places.
  const pinned = ranked.filter((t) => dueRank(t, today) === 0);
  const rest = ranked
    .filter((t) => dueRank(t, today) !== 0)
    .map((t, i) => ({ t, k: i + hash01(`${t.id}:${shuffle}`) * 4 }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.t);
  return [...pinned, ...rest];
}

/**
 * Propose start times for backlog items in the free gaps between `fromMs` and `toMs`.
 * Due-soon first, then priority, then list (Next → Inbox → Someday). High-energy work
 * prefers the morning (before `peakEndMs`), low-energy work the rest of the day. Every
 * block keeps a transition buffer, at most `fill` of the free time is used, and an item
 * longer than every gap is skipped.
 */
export function planDay(all: Task[], busy: Span[], opts: PlanOptions): Plan {
  const buffer = (opts.bufferMin ?? 5) * MINUTE;
  const today = opts.today ?? isoOf(opts.fromMs);
  const peakEnd = opts.peakEndMs ?? atMinutes(isoOf(opts.fromMs), 13 * 60);
  const freeMs = Math.max(0, freeTime(busy, opts.fromMs, opts.toMs));
  const budgetMs = Math.floor((freeMs * (opts.fill ?? 0.8)) / MINUTE) * MINUTE;
  let segs = usableSpans(busy, opts.fromMs, opts.toMs, buffer);
  const longest = segs.reduce((m, g) => Math.max(m, g.endMs - g.startMs), 0);

  const items: PlannedItem[] = [];
  const skipped: Plan['skipped'] = [];
  let usedMs = 0;

  for (const t of planOrder(all, today, opts.shuffle ?? 0, opts.only)) {
    const len = t.duration * MINUTE;
    if (len > longest) {
      skipped.push({ taskId: t.id, reason: 'too-long' });
      continue;
    }
    if (usedMs + len > budgetMs) {
      skipped.push({ taskId: t.id, reason: 'no-room' });
      continue;
    }
    // Every place it could start: the start of each roomy gap, and 13:00 inside one.
    const spots: number[] = [];
    for (const g of segs) {
      if (g.endMs - g.startMs < len) continue;
      spots.push(g.startMs);
      const p = up5(peakEnd);
      if (p > g.startMs && p + len <= g.endMs) spots.push(p);
    }
    if (!spots.length) {
      skipped.push({ taskId: t.id, reason: 'no-room' });
      continue;
    }
    spots.sort((a, b) => a - b);
    let at = spots[0];
    let why: string | null = null;
    if (t.energy === 3) {
      const morning = spots.find((s) => s < peakEnd);
      if (morning !== undefined) {
        at = morning;
        why = 'High energy · early';
      }
    } else if (t.energy === 1) {
      const later = spots.find((s) => s >= peakEnd);
      if (later !== undefined) {
        at = later;
        why = 'Low energy · later';
      }
    }
    const dr = dueRank(t, today);
    if (dr === 0) why = 'Due today';
    else if (dr === 1) why = 'Due tomorrow';
    else if (!why && t.priority === 1) why = 'Must';
    else if (!why && t.list === 'next') why = 'Next up';

    // Carve the slot out of its gap, keeping a buffer either side.
    const g = segs.find((s) => s.startMs <= at && at + len <= s.endMs)!;
    const pieces: Span[] = [];
    const leftEnd = down5(at - buffer);
    if (leftEnd - g.startMs >= STEP) pieces.push({ startMs: g.startMs, endMs: leftEnd });
    const rightStart = up5(at + len + buffer);
    if (g.endMs - rightStart >= STEP) pieces.push({ startMs: rightStart, endMs: g.endMs });
    segs = segs.flatMap((s) => (s === g ? pieces : [s]));

    usedMs += len;
    items.push({ taskId: t.id, title: t.title, icon: t.icon, category: t.category, startMs: at, endMs: at + len, duration: t.duration, why });
  }

  items.sort((a, b) => a.startMs - b.startMs);
  return { items, freeMs, budgetMs, usedMs, skipped, fromMs: opts.fromMs, toMs: opts.toMs };
}

/** The waking window left on `date`: from max(now, wake) to sleep (after midnight if sleep ≤ wake). */
export function dayWindow(date: ISODate, nowMs: number, wake: Minutes, sleep: Minutes): { fromMs: number; toMs: number } {
  const wakeMs = atMinutes(date, wake);
  const toMs = sleep > wake ? atMinutes(date, sleep) : atMinutes(addDays(date, 1), sleep);
  return { fromMs: Math.max(nowMs, wakeMs), toMs };
}

/** Undated, unfinished items due today or earlier. */
export function dueNow(all: Task[], today: ISODate): Task[] {
  return openItems(all).filter((t) => t.due && t.due <= today);
}

// ══ Store helpers (the panel calls these) ═════════════════════════════════════

function find(id: string) {
  return taskFile.value.tasks.find((t) => t.id === id);
}

function snapshot(t: Task): Task {
  return JSON.parse(JSON.stringify(t));
}

/** Manual order of one list, ids only. */
function orderedIds(list: BacklogList): string[] {
  return sortItems(itemsIn(taskFile.value.tasks, list), 'manual', list).map((t) => t.id);
}

function edgeOrder(list: BacklogList, edge: 'top' | 'bottom'): number {
  const xs = itemsIn(taskFile.value.tasks, list).map((t) => t.order ?? t.createdAt);
  if (!xs.length) return 0;
  return edge === 'top' ? Math.min(...xs) - 1 : Math.max(...xs) + 1;
}

/** Live plan window for a date (today by default) using the user's wake/sleep. */
export function windowFor(date: ISODate = view.today, nowMs = clock.now) {
  return dayWindow(date, nowMs, settings.value.wake, settings.value.sleep);
}

/** Every timed block (tasks + calendar) that could collide with a plan for `date`. */
export function busyFor(date: ISODate = view.today): Span[] {
  return blocksInRange(taskFile.value.tasks, view.events, startOfDayMs(date), startOfDayMs(addDays(date, 2)), view.finish.dark);
}

export const backlog = {
  /** Add every line of a brain dump. New items land at the top of `list`, in the order typed. */
  capture(text: string, list: BacklogList = 'inbox', nowMs = clock.now): Task[] {
    const items = parseCapture(text, nowMs);
    if (!items.length) return [];
    let top = edgeOrder(list, 'top') - items.length;
    const now = Date.now();
    return items.map((it, i) =>
      tasks.create({
        title: it.title,
        icon: it.icon,
        category: it.category,
        date: null,
        start: null,
        duration: it.duration,
        due: it.due,
        priority: it.priority,
        energy: it.energy,
        list: it.list ?? list,
        order: top++,
        // Keep "oldest" sorting stable inside one dump.
        createdAt: now + i,
        updatedAt: now + i,
        alerts: [5],
      }),
    );
  },

  update(id: string, patch: Partial<Task>) {
    tasks.update(id, patch);
  },

  complete(id: string, at = clock.now) {
    tasks.update(id, { doneAt: at });
  },

  restore(id: string) {
    const t = find(id);
    if (!t) return;
    tasks.update(id, { doneAt: null, order: edgeOrder(t.list ?? 'inbox', 'top') });
  },

  moveTo(id: string, list: BacklogList) {
    const t = find(id);
    if (!t || (t.list === list && !t.doneAt)) return;
    tasks.update(id, { list, doneAt: null, order: edgeOrder(list, 'bottom') });
  },

  /** Drop `id` before `beforeId` (or after `afterId`) inside its list. */
  reorder(id: string, beforeId: string | null, afterId: string | null = null) {
    const t = find(id);
    if (!t) return;
    const list = t.list ?? 'inbox';
    const ids = reorderIds(orderedIds(list), id, beforeId, afterId);
    ids.forEach((x, i) => {
      const it = find(x);
      if (it && it.order !== i) it.order = i;
    });
  },

  /** Remove with an undo toast. */
  remove(id: string) {
    const t = find(id);
    if (!t) return;
    const snap = snapshot(t);
    tasks.remove(id);
    view.say(`Removed “${snap.title || 'item'}”`, {
      label: 'Undo',
      run: () => tasks.restore(snap),
    });
  },

  /** Let go of everything in Done, with one undo. */
  clearDone() {
    const done = itemsIn(taskFile.value.tasks, 'done').map(snapshot);
    if (!done.length) return;
    for (const t of done) tasks.remove(t.id);
    view.say(`Cleared ${done.length} finished ${done.length === 1 ? 'item' : 'items'}`, {
      label: 'Undo',
      run: () => done.forEach((t) => tasks.restore(t)),
    });
  },

  /** Schedule on `date` at `start` and say so, with an undo back to the backlog. */
  schedule(id: string, date: ISODate, start: Minutes, quiet = false) {
    const t = find(id);
    if (!t) return;
    const prev = { list: t.list, order: t.order };
    tasks.schedule(id, date, start);
    if (quiet) return;
    sounds.tick();
    const when = formatTime(atMinutes(date, start), view.hour12);
    view.say(`“${t.title || 'Item'}” is on ${date === view.today ? 'today' : dueLabel(date, view.today)} at ${when}`, {
      label: 'Undo',
      run: () => tasks.update(id, { date: null, start: null, ...prev }),
    });
  },

  /** Start of the next free gap today that fits it (with a transition buffer), or null. */
  suggestSlot(id: string, date: ISODate = view.today): number | null {
    const t = find(id);
    if (!t) return null;
    const { fromMs, toMs } = windowFor(date);
    const one: Task = { ...snapshot(t), date: null, doneAt: null, due: null, energy: null };
    return planDay([one], busyFor(date), { fromMs, toMs, fill: 1 }).items[0]?.startMs ?? null;
  },

  /** Put it in the next free gap today. Returns the start, or null when nothing fits. */
  fitToday(id: string): number | null {
    const t = find(id);
    if (!t) return null;
    const at = this.suggestSlot(id);
    if (at === null) {
      view.say(`No ${formatDuration(t.duration * MINUTE)} gap left today. Pick a time, or try tomorrow.`);
      return null;
    }
    this.schedule(id, isoOf(at), Math.round(minutesOfDay(at)));
    return at;
  },

  /** The current proposal for today (or another date). */
  plan(opts: { date?: ISODate; shuffle?: number; only?: string[] } = {}): Plan {
    const date = opts.date ?? view.today;
    const { fromMs, toMs } = windowFor(date);
    return planDay(taskFile.value.tasks, busyFor(date), {
      fromMs,
      toMs,
      today: view.today,
      peakEndMs: atMinutes(date, 13 * 60),
      shuffle: opts.shuffle,
      only: opts.only,
    });
  },

  /**
   * Place proposed blocks one after another so each draws onto the dial in turn.
   * `onEach(i)` fires as each lands. Resolves when all are placed.
   */
  place(items: PlannedItem[], { stagger = 140, onEach }: { stagger?: number; onEach?: (i: number) => void } = {}): Promise<void> {
    const prev = items.map((it) => {
      const t = find(it.taskId);
      return { id: it.taskId, list: t?.list, order: t?.order };
    });
    const step = view.reducedMotion ? 0 : stagger;
    return new Promise((resolve) => {
      items.forEach((it, i) => {
        setTimeout(() => {
          tasks.schedule(it.taskId, isoOf(it.startMs), Math.round(minutesOfDay(it.startMs)));
          sounds.tick();
          onEach?.(i);
          if (i === items.length - 1) {
            const first = items[0];
            const last = items[items.length - 1];
            if (isoOf(first.startMs) !== view.date) view.setDate(isoOf(first.startMs));
            sounds.done();
            view.say(
              items.length === 1
                ? `Placed “${first.title}” at ${formatTime(first.startMs, view.hour12)}`
                : `Placed ${items.length} blocks, ${formatTime(first.startMs, view.hour12)}–${formatTime(last.endMs, view.hour12)}`,
              {
                label: 'Undo',
                run: () => {
                  for (const p of prev) tasks.update(p.id, { date: null, start: null, list: p.list, order: p.order });
                },
              },
              7000,
            );
            resolve();
          }
        }, i * step);
      });
      if (!items.length) resolve();
    });
  },
};
