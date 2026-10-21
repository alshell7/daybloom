// What the generative-UI components read and do. Reading: a block by the key a model wrote
// (null when there is no such block, so a card never shows one that doesn't exist), days and
// times in the forms the tools use, and free time from lib/busy.ts (blocks, calendar events,
// salah), so nothing lands on a meeting or a prayer. Doing: each button acts through the app's
// own stores and helpers (it shows on the dial at once and syncs like any edit) and says what
// happened in a toast with Undo.

import { dayArg, timeArg } from '../../addons/mcp/tools';
import { extendBlock, suggest, toggleDone } from '../../actions';
import { blockFor, dayWord, placeOccurrence } from '../../assistant/tools';
import { busyBetween, wakingSpan } from '../../busy';
import { blockKey, freeGaps, parseBlockKey } from '../../engine/blocks';
import { CATEGORY_BY_ID } from '../../engine/categories';
import { addDays, atMinutes, formatTime, MINUTE, minutesOfDay, startOfDayMs } from '../../engine/time';
import type { Block, CategoryId, ISODate, Task } from '../../engine/types';
import { dayReview } from '../../nudges.svelte';
import { sounds } from '../../sound';
import { clock } from '../../stores/clock.svelte';
import { settings } from '../../stores/settings.svelte';
import { taskFile, tasks, uid } from '../../stores/tasks.svelte';
import { timer } from '../../stores/timer.svelte';
import { view } from '../../stores/view.svelte';

export interface Span {
  startMs: number;
  endMs: number;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const ceil5 = (ms: number) => Math.ceil(ms / (5 * MINUTE)) * 5 * MINUTE;
const quote = (t: string) => `“${t || 'Untitled'}”`;
const lenOf = (b: Span) => Math.max(5, Math.round((b.endMs - b.startMs) / MINUTE));
export const fmt = (ms: number) => formatTime(ms, view.hour12);
/** "at 3:30pm", "tomorrow at 9:00am". */
const when = (date: ISODate, ms: number) => `${date === view.today ? '' : `${dayWord(date)} `}at ${fmt(ms)}`;

// ── Reading ──────────────────────────────────────────────────────────────────

/** The block a model's key names ("task:…@…", "cal:…", even "key=task:…"), or null. */
export function blockOf(key: unknown): Block | null {
  if (typeof key !== 'string') return null;
  const k = key.trim().replace(/^key\s*[=:]\s*/i, '');
  if (!k) return null;
  return view.blockByKey(k) ?? blockFor(k);
}

/** "today" / "tomorrow" / "YYYY-MM-DD" → a date; today when it can't tell. */
export function dateOf(v: unknown, today: ISODate = view.today): ISODate {
  try {
    return dayArg(v, today);
  } catch {
    return today;
  }
}

/** "HH:MM" → minutes after midnight, or null. */
export function minutesOf(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  try {
    return timeArg(v);
  } catch {
    return null;
  }
}

/** The part of a day to look at: waking hours (from now on today), or from–to when given. */
export function windowOf(date: ISODate, o: { from?: unknown; to?: unknown; fromNow?: boolean } = {}): Span {
  const w = wakingSpan(date);
  const f = minutesOf(o.from);
  const t = minutesOf(o.to);
  let startMs = f === null ? w.fromMs : atMinutes(date, f);
  const endMs = t === null ? w.toMs : atMinutes(date, t) > startMs ? atMinutes(date, t) : w.toMs;
  if (o.fromNow && date === view.today) startMs = Math.max(startMs, ceil5(clock.now));
  return { startMs, endMs: Math.max(startMs, endMs) };
}

/** Taken time on a day (blocks, events, salah), plus `extra` spans not placed yet. */
function busyOn(date: ISODate, toMs: number, o: { except?: string; extra?: Span[] } = {}): Block[] {
  const own = busyBetween(startOfDayMs(date), Math.max(toMs, startOfDayMs(addDays(date, 1))), { except: o.except });
  return [...own, ...((o.extra ?? []) as Block[])].sort((a, b) => a.startMs - b.startMs);
}

/** Free stretches of at least `minutes` in a window. */
export function gapsIn(date: ISODate, win: Span, minutes: number, o: { except?: string; extra?: Span[] } = {}): Span[] {
  if (win.endMs - win.startMs < minutes * MINUTE) return [];
  return freeGaps(busyOn(date, win.endMs, o), win.startMs, win.endMs, Math.max(5, minutes) * MINUTE);
}

/** Is [startMs, endMs) free of everything taken? */
export function isFree(date: ISODate, s: Span, o: { except?: string; extra?: Span[] } = {}): boolean {
  return !busyOn(date, s.endMs, o).some((b) => !b.floating && b.startMs < s.endMs && b.endMs > s.startMs);
}

/** Where `minutes` fit on `date`: at `wantMs` when that is free, else the first free time after it (from now on today). Null: no room that day. */
export function fit(date: ISODate, minutes: number, o: { wantMs?: number | null; except?: string; extra?: Span[] } = {}): number | null {
  const len = minutes * MINUTE;
  const w = wakingSpan(date);
  const earliest = date === view.today ? ceil5(clock.now) : startOfDayMs(date);
  if (o.wantMs != null && o.wantMs >= earliest && isFree(date, { startMs: o.wantMs, endMs: o.wantMs + len }, o)) return o.wantMs;
  const from = ceil5(Math.max(w.fromMs, earliest, o.wantMs ?? -Infinity));
  const gap = gapsIn(date, { startMs: from, endMs: w.toMs }, minutes, o)[0];
  if (gap) return gap.startMs;
  // Asked for a time that is taken late in the day: try from the start of the day instead.
  if (o.wantMs != null) return fit(date, minutes, { ...o, wantMs: null });
  return null;
}

/** A proposed item, laid out: where it would go, or null when it doesn't fit. */
export interface Laid<T> {
  item: T;
  startMs: number | null;
}

/** Lay proposals out in order: each at its asked time when free, else in the next free time after the one before. */
export function layout<T extends { minutes: number; startMin: number | null }>(items: T[], date: ISODate): Laid<T>[] {
  const extra: Span[] = [];
  let cursor: number | null = null;
  return items.map((item) => {
    const want = item.startMin !== null ? atMinutes(date, item.startMin) : cursor;
    const s = fit(date, item.minutes, { wantMs: want, extra });
    if (s === null) return { item, startMs: null };
    const span = { startMs: s, endMs: s + item.minutes * MINUTE };
    extra.push(span);
    cursor = span.endMs;
    return { item, startMs: s };
  });
}

/** A block with this title made on `date` since `sinceMs` (so a card shown again after it acted doesn't add it twice). */
export function onDay(title: string, date: ISODate, sinceMs: number): Block | null {
  const t = title.trim().toLowerCase();
  if (!t) return null;
  return (
    busyBetween(startOfDayMs(date), startOfDayMs(addDays(date, 1)), { land: false }).find(
      (b) => b.kind === 'task' && b.date === date && b.title.trim().toLowerCase() === t && (tasks.get(b.taskId ?? '')?.createdAt ?? 0) >= sinceMs,
    ) ?? null
  );
}

// ── Doing ────────────────────────────────────────────────────────────────────

function toast(text: string, run?: () => void, label = 'Undo') {
  view.say(text, run ? { label, run } : undefined, run ? 7000 : 5000);
}

/** Snapshot tasks; the undo puts them back as they were. */
function keep(ids: (string | undefined)[]): () => void {
  const snaps = ids.map((id) => (id ? tasks.get(id) : undefined)).filter((t): t is Task => !!t).map(clone);
  return () => {
    const list = taskFile.value.tasks;
    for (const s of snaps) {
      const i = list.findIndex((t) => t.id === s.id);
      if (i >= 0) list[i] = { ...s, updatedAt: Date.now() };
      else tasks.restore(s);
    }
  };
}

export function styleOf(title: string, category?: CategoryId | null): { category: CategoryId; icon: string } {
  const guess = suggest(title);
  const c = category ?? guess?.category ?? 'focus';
  return { category: c, icon: guess && guess.category === c ? guess.icon : CATEGORY_BY_ID[c].icon };
}

/** What a button did: the block's key after (it can change day), and how to take it back. */
export interface Did {
  key?: string;
  keys?: string[];
  undo: () => void;
}

export interface ToPlace {
  title: string;
  minutes: number;
  date: ISODate;
  startMs: number;
  category?: CategoryId | null;
  /** A backlog task to schedule instead of a new block. */
  id?: string | null;
}

export const act = {
  /** Tick a block (it celebrates like a tick on the dial). */
  done(key: string, origin?: { x: number; y: number }): Did | null {
    const b = blockOf(key);
    const p = b ? parseBlockKey(b.key) : null;
    if (!b || !p || b.readOnly || b.done) return null;
    toggleDone(b.key, origin);
    const undo = () => {
      if (tasks.get(p.taskId)?.completions.includes(p.date)) tasks.toggleDone(p.taskId, p.date);
    };
    toast(`Done · ${quote(b.title)}`, undo);
    return { key: b.key, undo };
  },

  /** Two minutes on a block (or a step of it), starting now. */
  start(key: string | null, o: { minutes?: number; label?: string } = {}): Did {
    const b = key ? blockOf(key) : null;
    const minutes = o.minutes ?? 2;
    const label = o.label?.trim() || b?.title || 'Two minutes';
    timer.startSession({
      minutes,
      rhythm: 'single',
      label,
      icon: b?.icon ?? 'play',
      category: b?.category ?? 'focus',
      target: b?.kind === 'task' ? { key: b.key, taskId: b.taskId } : null,
    });
    const undo = () => timer.stop();
    toast(`${minutes === 2 ? 'Two minutes' : `${minutes} minutes`} on ${quote(label)}, starting now.`, undo, 'Stop');
    return { key: b?.key, undo };
  },

  /** A focus session of their usual length. */
  focus(): Did {
    const minutes = settings.value.focus.minutes || 25;
    timer.startSession({ minutes, rhythm: 'single', label: 'Focus', icon: 'target', category: 'focus' });
    const undo = () => timer.stop();
    toast(`${minutes} minutes of focus, starting now.`, undo, 'Stop');
    return { undo };
  },

  /** The one-minute breathing guide on the dial. */
  breathe(): Did {
    view.breatheAt = clock.now;
    return { undo: () => (view.breatheAt = 0) };
  },

  /** Slide a block into the next free time (from now, or after itself). */
  move(key: string): Did | null {
    const b = blockOf(key);
    if (!b || b.readOnly || b.kind !== 'task') return null;
    const len = lenOf(b);
    for (let i = 0; i < 7; i++) {
      const date = addDays(b.date < view.today ? view.today : b.date, i);
      let s = fit(date, len, { wantMs: i === 0 && b.date === date && !b.floating ? b.startMs : null, except: b.key });
      // Already in free time: "the next free time" is after it.
      if (s !== null && s === b.startMs && date === b.date) s = fit(date, len, { wantMs: b.endMs, except: b.key });
      if (s === null || (s === b.startMs && date === b.date)) continue;
      const r = placeOccurrence(b.key, date, Math.round(minutesOfDay(s)));
      if (!r) return null;
      toast(`Moved ${quote(b.title)} ${when(date, s)}`, r.undo);
      return { key: r.key, undo: r.undo };
    }
    toast('No free time that fits in the next week.');
    return null;
  },

  /** To tomorrow, at the same time when it's free there. */
  tomorrow(key: string): Did | null {
    const b = blockOf(key);
    if (!b || b.readOnly || b.kind !== 'task') return null;
    const date = addDays(b.date < view.today ? view.today : b.date, 1);
    const same = atMinutes(date, Math.round(minutesOfDay(b.startMs)));
    const start = b.floating ? null : (fit(date, lenOf(b), { wantMs: same, except: b.key }) ?? same);
    const r = placeOccurrence(b.key, date, start === null ? null : Math.round(minutesOfDay(start)));
    if (!r) return null;
    toast(start === null ? `${quote(b.title)} moves to ${dayWord(date)}` : `${quote(b.title)} moves to ${dayWord(date)} at ${fmt(start)}`, r.undo);
    return { key: r.key, undo: r.undo };
  },

  /** More time for a block (it stays where it is and grows). */
  more(key: string, minutes = 15): Did | null {
    const b = blockOf(key);
    if (!b || b.readOnly || b.kind !== 'task') return null;
    const undo = keep([b.taskId]);
    extendBlock(b.key, minutes);
    toast(`${minutes} more minutes for ${quote(b.title)}`, undo);
    return { key: b.key, undo };
  },

  /** Open a block in the editor. */
  open(key: string) {
    const b = blockOf(key);
    if (!b) return;
    view.setDate(b.date);
    view.selected = b.key;
    if (b.kind === 'task') view.sheet = { kind: 'edit', key: b.key };
  },

  /** Show a block on the dial (its day, selected). */
  show(key: string) {
    const b = blockOf(key);
    if (!b) return;
    view.setDate(b.date);
    view.selected = b.key;
  },

  /** New blocks (or backlog tasks scheduled) at free times already found; one toast and one Undo for all. */
  place(items: ToPlace[]): Did | null {
    const undos: (() => void)[] = [];
    const keys: string[] = [];
    const placed: { title: string; date: ISODate; startMs: number; endMs: number }[] = [];
    for (const it of items) {
      const start = Math.round(minutesOfDay(it.startMs));
      const own = it.id ? tasks.get(it.id) : undefined;
      if (own && !own.doneAt) {
        undos.push(keep([own.id]));
        tasks.schedule(own.id, it.date, start);
        keys.push(blockKey(own.id, it.date));
        placed.push({ title: own.title, date: it.date, startMs: it.startMs, endMs: it.startMs + own.duration * MINUTE });
      } else {
        const t = tasks.create({ title: it.title.trim().slice(0, 120), date: it.date, start, duration: Math.max(5, Math.round(it.minutes)), ...styleOf(it.title, it.category), alerts: [5] });
        undos.push(() => tasks.remove(t.id));
        keys.push(blockKey(t.id, it.date));
        placed.push({ title: t.title, date: it.date, startMs: it.startMs, endMs: it.startMs + t.duration * MINUTE });
      }
    }
    if (!placed.length) return null;
    const first = placed[0];
    const last = placed[placed.length - 1];
    if (first.date !== view.date) view.setDate(first.date);
    if (placed.length === 1) view.selected = keys[0];
    sounds.done();
    const undo = () => [...undos].reverse().forEach((u) => u());
    toast(placed.length === 1 ? `Added ${quote(first.title)} ${when(first.date, first.startMs)}` : `Placed ${placed.length} blocks, ${fmt(first.startMs)}–${fmt(last.endMs)}`, undo);
    return { key: keys[0], keys, undo };
  },

  /** Today's unfinished blocks (not the one running now) to tomorrow. */
  restToTomorrow(): Did | null {
    const tomorrow = addDays(view.today, 1);
    const undos: (() => void)[] = [];
    for (const b of restOfToday()) {
      const want = atMinutes(tomorrow, Math.round(minutesOfDay(b.startMs)));
      const s = fit(tomorrow, lenOf(b), { wantMs: want, except: b.key }) ?? want;
      const r = placeOccurrence(b.key, tomorrow, Math.round(minutesOfDay(s)));
      if (r) undos.push(r.undo);
    }
    if (!undos.length) {
      toast('Nothing to move. Today is already light.');
      return null;
    }
    const undo = () => [...undos].reverse().forEach((u) => u());
    toast(`Moved ${undos.length} to tomorrow. Today is lighter now.`, undo);
    return { undo };
  },

  /** Steps into a block's checklist. */
  saveSteps(key: string, steps: string[]): Did | null {
    const b = blockOf(key);
    const t = b?.taskId ? tasks.get(b.taskId) : undefined;
    if (!b || !t || !steps.length) return null;
    const undo = keep([t.id]);
    tasks.update(t.id, { subtasks: [...t.subtasks, ...steps.map((s) => ({ id: uid(), title: s.slice(0, 120), done: false }))] });
    toast(`Saved ${steps.length} ${steps.length === 1 ? 'step' : 'steps'} to ${quote(b.title)}`, undo);
    return { key: b.key, undo };
  },

  /** A backlog task into the first free time that fits (today, or the next day with room). */
  schedule(taskId: string): Did | null {
    const t = tasks.get(taskId);
    if (!t) return null;
    for (let i = 0; i < 7; i++) {
      const date = addDays(view.today, i);
      const s = fit(date, t.duration);
      if (s === null) continue;
      return this.place([{ title: t.title, minutes: t.duration, date, startMs: s, id: t.id }]);
    }
    toast('No free time that fits in the next week.');
    return null;
  },
};

/** What "the rest of today" means: your unfinished one-off blocks, except the one running now (routines come back tomorrow on their own). */
export function restOfToday(): Block[] {
  const now = clock.now;
  return dayReview().open.filter((b) => !(b.startMs <= now && now < b.endMs) && !b.readOnly && !b.recurring);
}
