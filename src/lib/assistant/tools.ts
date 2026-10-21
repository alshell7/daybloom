// The assistant's tool catalogue: what Needle sees (ToolSchema: crisp, non-overlapping
// descriptions + regex triggers for unambiguous phrasings) and what runs (small handlers that
// reuse the app's own actions and stores). Every handler returns a short, warm line (`say`)
// and a card the panel renders; anything that changes the plan returns an `undo`.
//
// Handlers receive arguments already normalised by the brain (times as minutes after
// midnight, days as ISO dates, repeats as Recurrence). The order of TOOLS is also trigger
// precedence: the first tool whose trigger matches wins.

import { adjust, suggest, toggleDone } from '../actions';
import { backlog, busyFor, dueLabel, freeSpans, itemsIn, openItems, sortItems, windowFor, type ListId } from '../backlog';
import { describeRhythm, rhythm as breathRhythm, rhythmLength } from '../breath.svelte';
import { blockKey, blocksInRange, eventBlock, floatingBlocks, freeGaps, parseBlockKey, taskBlocks } from '../engine/blocks';
import { categoryColor } from '../engine/categories';
import { describeRecurrence, occurrencesBetween } from '../engine/recurrence';
import {
  addDays,
  atMinutes,
  daysBetween,
  formatDuration,
  formatMinutes,
  formatTime,
  fromISODate,
  HOUR,
  hourOf,
  isoOf,
  MINUTE,
  minutesOfDay,
  startOfDayMs,
  systemTimeZone,
  zoneCity,
  zoneOffsetLabel,
} from '../engine/time';
import type { BacklogList, Block, CategoryId, ISODate, Recurrence, Task } from '../engine/types';
import { computeInsights, type Span } from '../insights';
import { dayReview } from '../nudges.svelte';
import { platform } from '../platform';
import { PRESETS, type PresetId } from '../presets';
import { sounds } from '../sound';
import { rhythm, routineStreaks } from '../streaks';
import { settings } from '../stores/settings.svelte';
import { taskFile, tasks, uid } from '../stores/tasks.svelte';
import { timer, timerFile } from '../stores/timer.svelte';
import { view } from '../stores/view.svelte';
import { busyBetween, freeSlot } from '../busy';
import { trash, trashOccurrence, trashTask } from '../stores/trash.svelte';
import { THEME_BY_ID, THEMES, type ThemeId } from '../themes';
import { decide, hits, rank, type Candidate, type Embedder } from './match';
import type { ToolSchema } from './types';

// ── Shapes ────────────────────────────────────────────────────────────────────

/** Normalised arguments (see brain.normalize). Every field is optional. */
export interface Args {
  title?: string | null;
  /** An exact block (chosen from a list), skips title matching. */
  key?: string;
  /** An exact backlog item. */
  id?: string;
  /** Minutes after midnight. */
  time?: number | null;
  day?: ISODate | null;
  minutes?: number | null;
  /** Move by ± minutes ("30 minutes later"). */
  shift?: number | null;
  repeat?: Recurrence | null;
  /** "later" / "someday" was said: no time. */
  later?: boolean;
  anytime?: boolean;
  /** Delete the whole series, not just this occurrence. */
  all?: boolean;
  due?: ISODate | null;
  priority?: 1 | 2 | 3 | null;
  list?: BacklogList | 'done' | 'all' | null;
  query?: string | null;
  label?: string | null;
  rounds?: number | null;
  span?: Span;
  part?: 'morning' | 'afternoon' | 'evening' | null;
  theme?: string | null;
  preset?: PresetId | null;
  city?: string | null;
  /** Resolved IANA zone; '' = this computer's own zone; undefined = couldn't resolve. */
  zone?: string;
  state?: 'show' | 'hide' | 'toggle';
  /** Already normalised (calls built by the assistant itself). */
  norm?: true;
}

export interface Call {
  tool: string;
  args: Args;
}

export interface Option {
  label: string;
  icon?: string;
  /** Category colour for the chip dot. */
  color?: string;
  call: Call;
}

export type Undo = () => void;

export type BlockVerb = 'added' | 'moved' | 'extended' | 'done' | 'already';

export type Card =
  | { kind: 'now' }
  | { kind: 'day'; date: ISODate }
  | { kind: 'summary'; date: ISODate }
  | { kind: 'block'; key: string; verb: BlockVerb; from?: string }
  | { kind: 'confirm'; key: string; title: string; recurring: boolean }
  | { kind: 'items'; mode: 'captured' | 'backlog' | 'search' | 'done'; ids: string[]; list?: ListId | 'all'; query?: string }
  | { kind: 'timer' }
  | { kind: 'plan'; date: ISODate }
  | { kind: 'free'; date: ISODate; fromMs: number; toMs: number; minutes: number }
  | { kind: 'when'; key: string }
  | { kind: 'week'; span: Span }
  | { kind: 'streaks' }
  | { kind: 'checkins' }
  | { kind: 'theme' }
  | { kind: 'dial' }
  | { kind: 'zone' }
  | { kind: 'widget' }
  | { kind: 'breathe' }
  | { kind: 'winddown' }
  | { kind: 'help' }
  | { kind: 'choice'; options: Option[] }
  | { kind: 'note'; icon: string; chips?: Option[] };

export interface ToolResult {
  /** One short, warm line. */
  say: string;
  card: Card;
  undo?: Undo;
}

export interface Ctx {
  /** What the user said (for labels and fallbacks). */
  text: string;
  now: number;
  /** Needle embeddings when the model is on this device. */
  embed: Embedder | null;
}

export interface ToolDef {
  schema: ToolSchema;
  icon: string;
  /** Example phrasings: help chips, embedding centroids and keyword scoring. */
  examples: string[];
  /** Words that hint at this tool in the deterministic fallback. */
  keywords: string[];
  /** A "Did you mean…" chip label for these arguments. */
  label(a: Args): string;
  run(a: Args, ctx: Ctx): ToolResult | Promise<ToolResult>;
}

// ── Little helpers ────────────────────────────────────────────────────────────

const R = String.raw;
const DAYW = R`(?:mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)`;
const UNIT = R`(?:m|min|mins|minute|minutes|h|hr|hrs|hour|hours)`;

const fmt = (ms: number) => formatTime(ms, view.hour12);
const fmtMin = (min: number) => formatMinutes(min, view.hour12);
const dur = (min: number) => formatDuration(min * MINUTE);
const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const ceil5 = (ms: number) => Math.ceil(ms / (5 * MINUTE)) * 5 * MINUTE;
const round5 = (min: number) => Math.round(min / 5) * 5;
const clampDur = (m: number) => Math.max(5, Math.min(12 * 60, Math.round(m)));
const quote = (t: string) => `“${t || 'Untitled'}”`;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const dark = () => view.finish.dark;

/** "today", "tomorrow", "Friday", "Mon, Oct 26". */
export function dayWord(date: ISODate | null | undefined, today: ISODate = view.today): string {
  if (!date) return 'today';
  const d = daysBetween(today, date);
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  if (d === -1) return 'yesterday';
  const f = fromISODate(date);
  if (d > 1 && d < 7) return f.toLocaleDateString(undefined, { weekday: 'long' });
  return f.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

/** "today" / "tomorrow" / "on Friday" — for the middle of a sentence. */
export function dayPhrase(date: ISODate | null | undefined, today: ISODate = view.today): string {
  const w = dayWord(date, today);
  return /^(today|tomorrow|yesterday)$/.test(w) ? w : `on ${w}`;
}

/** A block (task occurrence or calendar event) for a key, on any date. */
export function blockFor(key: string): Block | null {
  if (key.startsWith('cal:')) {
    const ev = view.events.find((e) => `cal:${e.accountId}:${e.id}` === key);
    return ev ? eventBlock(ev, dark()) : null;
  }
  const p = parseBlockKey(key);
  const t = p && tasks.get(p.taskId);
  if (!p || !t) return null;
  return taskBlocks(t, p.date, p.date, dark())[0] ?? null;
}

/** Timed blocks (tasks + calendar) overlapping a day, plus its anytime ones. */
export function dayBlocksOf(date: ISODate): { timed: Block[]; floating: Block[] } {
  const s = startOfDayMs(date);
  const e = startOfDayMs(addDays(date, 1));
  return {
    timed: blocksInRange(taskFile.value.tasks, view.events, s, e, dark()),
    floating: floatingBlocks(taskFile.value.tasks, view.events, date, dark()),
  };
}

function restoreTask(snap: Task) {
  const list = taskFile.value.tasks;
  const i = list.findIndex((t) => t.id === snap.id);
  if (i >= 0) list[i] = snap;
  else list.push(snap);
}

/** Undo for any change to one task: put the whole task back as it was. */
function snapshot(id: string): Undo {
  const t = tasks.get(id);
  if (!t) return () => {};
  const snap = clone(t);
  return () => restoreTask(snap);
}

/**
 * Start (minutes) of the first free stretch on `date` that fits `minutes`, from now or wake,
 * in waking hours; calendar events and salah are busy (lib/busy.ts). A full day falls back to
 * the first free stretch before midnight, then to now.
 */
export function firstFree(date: ISODate, minutes: number, now: number): number {
  const slot = freeSlot(date, minutes, now, { days: 1 });
  if (slot && slot.date === date) return slot.start;
  const wakeMs = atMinutes(date, settings.value.wake);
  const from = Math.max(wakeMs, date === isoOf(now) ? ceil5(now) : wakeMs);
  const end = startOfDayMs(addDays(date, 1));
  const gap = freeGaps(busyBetween(startOfDayMs(date), end), from, end, minutes * MINUTE).find((g) => g.endMs - g.startMs >= minutes * MINUTE);
  return Math.min(1435, round5(minutesOfDay(gap ? gap.startMs : from)));
}

/** Blocks that ended in the last 6 h without a tick or a "let it go". Oldest first. */
export function openCheckIns(now: number): Block[] {
  const today = isoOf(now);
  const { timed } = dayBlocksOf(today);
  return timed
    .filter((b) => b.kind === 'task' && !b.done && b.endMs <= now && b.endMs > now - 6 * HOUR)
    .filter((b) => !tasks.get(b.taskId ?? '')?.acks?.includes(b.date))
    .sort((a, b) => a.endMs - b.endMs);
}

function currentTaskBlock(now: number): Block | null {
  const c = view.now.current;
  if (c && c.kind === 'task' && !c.done && c.startMs <= now && now < c.endMs) return c;
  return null;
}

function topOrder(list: BacklogList): number {
  const xs = itemsIn(taskFile.value.tasks, list).map((t) => t.order ?? t.createdAt);
  return xs.length ? Math.min(...xs) - 1 : 0;
}

/** Move one occurrence to `date` at `start` (null = anytime). Recurring + another day → a one-off copy. */
export function placeOccurrence(key: string, date: ISODate, start: number | null): { key: string; undo: Undo } | null {
  const p = parseBlockKey(key);
  const t = p && tasks.get(p.taskId);
  if (!p || !t) return null;
  const undo = snapshot(t.id);
  if (!t.recurrence) {
    tasks.update(t.id, { date, start });
    return { key: blockKey(t.id, date), undo };
  }
  if (date === p.date) {
    tasks.editOccurrence(t.id, date, { start });
    return { key, undo };
  }
  const o = t.overrides[p.date] ?? {};
  tasks.removeOccurrence(t.id, p.date);
  const copy = tasks.create({
    title: o.title ?? t.title,
    icon: t.icon,
    category: t.category,
    notes: t.notes,
    date,
    start,
    duration: o.duration ?? t.duration,
    alerts: [...t.alerts],
    subtasks: t.subtasks.map((s) => ({ ...s, id: uid(), done: false })),
  });
  return {
    key: blockKey(copy.id, date),
    undo: () => {
      tasks.remove(copy.id);
      undo();
    },
  };
}

/** Remove a block occurrence (or the whole series with `all`), or a backlog item. Returns its undo. */
export function removeTarget(keyOrId: string, all = false): Undo | null {
  const p = parseBlockKey(keyOrId);
  const id = p ? p.taskId : keyOrId;
  const t = tasks.get(id);
  if (!t) return null;
  const before = clone(t);
  // Into the Trash for 30 days; Undo takes it back out (and clears the deletion for sync).
  const kept = p && t.recurrence && !all ? trashOccurrence(id, p.date) : trashTask(id);
  if (view.selected === keyOrId) view.selected = null;
  return () => {
    if (tasks.get(id)) restoreTask(before);
    else tasks.restore(before);
    trash.drop(kept);
  };
}

/** The plan proposal for a day (re-run with `shuffle` for another arrangement). */
export function planFor(date: ISODate, shuffle = 0) {
  return backlog.plan({ date, shuffle });
}

// ── Finding the block the user means ──────────────────────────────────────────

interface Target {
  block?: Block;
  task?: Task;
}

interface Scope {
  /** Days ahead to look (0 = today only). */
  days: number;
  done?: boolean;
  backlog?: boolean;
  events?: boolean;
  /** 'now' favours the block you're in or just left; 'upcoming' favours what's next. */
  prefer: 'now' | 'upcoming';
}

function boostFor(b: Block, now: number, today: ISODate, prefer: Scope['prefer']): number {
  let s = -0.03 * Math.max(0, daysBetween(today, b.date));
  if (b.floating) return s;
  const live = b.startMs <= now && now < b.endMs;
  if (prefer === 'now') {
    if (live) s += 0.12;
    else if (b.endMs <= now && now - b.endMs < 3 * HOUR) s += 0.08;
    else if (b.startMs > now && b.date === today) s += 0.03;
  } else if (live) s += 0.06;
  else if (b.startMs > now) s += 0.05;
  else s -= 0.05;
  return s;
}

function direct(a: Args): Target | null {
  if (a.key) {
    const b = blockFor(a.key);
    if (b) return { block: b };
  }
  if (a.id) {
    const t = tasks.get(a.id);
    if (t) return { task: t };
  }
  return null;
}

async function findTarget(query: string, ctx: Ctx, scope: Scope): Promise<{ pick: Target | null; options: Target[] }> {
  const today = isoOf(ctx.now);
  const best = new Map<string, Candidate<Target>>();
  for (const t of taskFile.value.tasks) {
    if (!t.date) continue;
    for (const b of taskBlocks(t, today, addDays(today, scope.days), dark())) {
      if (b.done && !scope.done) continue;
      const boost = boostFor(b, ctx.now, today, scope.prefer) - (b.done ? 0.08 : 0);
      const prev = best.get(t.id);
      if (prev && (prev.boost ?? 0) >= boost) continue;
      const extra = [t.notes, ...t.subtasks.map((s) => s.title)].filter(Boolean).join(' ');
      best.set(t.id, { item: { block: b }, text: b.title, extra: extra || undefined, icon: b.icon, boost });
    }
  }
  const cands = [...best.values()];
  if (scope.events) {
    const s = startOfDayMs(today);
    const e = startOfDayMs(addDays(today, scope.days + 1));
    for (const ev of view.events) {
      if (ev.endMs <= s || ev.startMs >= e) continue;
      const b = eventBlock(ev, dark());
      cands.push({ item: { block: b }, text: b.title, icon: 'calendar', boost: boostFor(b, ctx.now, today, scope.prefer) });
    }
  }
  if (scope.backlog) for (const t of openItems(taskFile.value.tasks)) cands.push({ item: { task: t }, text: t.title, icon: t.icon, boost: -0.02 });
  const d = decide(await rank(query, cands, ctx.embed));
  return { pick: d.pick?.item ?? null, options: d.options.map((o) => o.item) };
}

function targetLabel(t: Target, today: ISODate): string {
  if (t.task) return `${t.task.title} · backlog`;
  const b = t.block!;
  if (b.floating) return `${b.title} · ${dayWord(b.date, today)}`;
  const day = b.date === today ? '' : `${dayWord(b.date, today)} `;
  return `${b.title} · ${day}${fmt(b.startMs)}`;
}

function choose(tool: string, a: Args, options: Target[], question: string, now: number): ToolResult {
  const today = isoOf(now);
  return {
    say: question,
    card: {
      kind: 'choice',
      options: options.map((t) => {
        const cat = (t.block?.category ?? t.task?.category ?? 'focus') as CategoryId;
        return {
          label: targetLabel(t, today),
          icon: t.block?.icon ?? t.task?.icon,
          color: categoryColor(cat, dark()),
          call: { tool, args: { ...a, key: t.block?.key, id: t.task?.id, norm: true } },
        };
      }),
    },
  };
}

function notFound(query: string, where: string): ToolResult {
  return {
    say: `I couldn't find ${quote(query)} ${where}.`,
    card: {
      kind: 'note',
      icon: 'search',
      chips: [
        { label: `Search for ${quote(query)}`, icon: 'search', call: { tool: 'search_tasks', args: { query, norm: true } } },
        { label: 'Show today', icon: 'calendar', call: { tool: 'show_day', args: { norm: true } } },
      ],
    },
  };
}

/** Resolve the block/item a tool should act on. A result means "stop and show this". */
async function resolveTarget(tool: string, a: Args, ctx: Ctx, scope: Scope, verbQ: string): Promise<Target | ToolResult> {
  const d = direct(a);
  if (d) return d;
  const q = a.title?.trim();
  if (!q) return { say: '', card: { kind: 'note', icon: 'search' } };
  const r = await findTarget(q, ctx, scope);
  if (r.pick) return r.pick;
  if (r.options.length) return choose(tool, a, r.options, verbQ, ctx.now);
  return notFound(q, scope.days ? 'in the coming week' : 'today');
}

const isResult = (x: Target | ToolResult): x is ToolResult => 'card' in x;

// ── Time zones ────────────────────────────────────────────────────────────────

const ZONE_ALIASES: Record<string, string> = {
  'new york': 'America/New_York', nyc: 'America/New_York', boston: 'America/New_York', miami: 'America/New_York',
  'los angeles': 'America/Los_Angeles', la: 'America/Los_Angeles', 'san francisco': 'America/Los_Angeles', sf: 'America/Los_Angeles', seattle: 'America/Los_Angeles', california: 'America/Los_Angeles',
  chicago: 'America/Chicago', texas: 'America/Chicago', austin: 'America/Chicago', denver: 'America/Denver', toronto: 'America/Toronto', vancouver: 'America/Vancouver', 'mexico city': 'America/Mexico_City', 'sao paulo': 'America/Sao_Paulo',
  london: 'Europe/London', uk: 'Europe/London', england: 'Europe/London', dublin: 'Europe/Dublin', lisbon: 'Europe/Lisbon', paris: 'Europe/Paris', france: 'Europe/Paris', berlin: 'Europe/Berlin', germany: 'Europe/Berlin', amsterdam: 'Europe/Amsterdam', madrid: 'Europe/Madrid', rome: 'Europe/Rome', stockholm: 'Europe/Stockholm', istanbul: 'Europe/Istanbul', moscow: 'Europe/Moscow',
  dubai: 'Asia/Dubai', karachi: 'Asia/Karachi', pakistan: 'Asia/Karachi', lahore: 'Asia/Karachi', india: 'Asia/Kolkata', mumbai: 'Asia/Kolkata', delhi: 'Asia/Kolkata', 'new delhi': 'Asia/Kolkata', bangalore: 'Asia/Kolkata', bengaluru: 'Asia/Kolkata',
  singapore: 'Asia/Singapore', 'hong kong': 'Asia/Hong_Kong', beijing: 'Asia/Shanghai', shanghai: 'Asia/Shanghai', china: 'Asia/Shanghai', seoul: 'Asia/Seoul', korea: 'Asia/Seoul', tokyo: 'Asia/Tokyo', japan: 'Asia/Tokyo', bangkok: 'Asia/Bangkok', jakarta: 'Asia/Jakarta', manila: 'Asia/Manila',
  sydney: 'Australia/Sydney', melbourne: 'Australia/Melbourne', brisbane: 'Australia/Brisbane', perth: 'Australia/Perth', auckland: 'Pacific/Auckland', 'new zealand': 'Pacific/Auckland', honolulu: 'Pacific/Honolulu', hawaii: 'Pacific/Honolulu',
  cairo: 'Africa/Cairo', lagos: 'Africa/Lagos', nairobi: 'Africa/Nairobi', johannesburg: 'Africa/Johannesburg',
  utc: 'UTC', gmt: 'UTC',
};
const HOME_WORDS = /^(?:local|home|my|my own|normal|usual|this computer|computer|back|system|default)$/;

function allZones(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf('timeZone');
  } catch {
    return [];
  }
}

/** City/country words → IANA zone. '' = this computer's own zone. undefined = no idea. */
export function resolveZone(city: string | null | undefined): string | undefined {
  const c = (city ?? '').toLowerCase().replace(/[.'’]/g, '').replace(/\s+/g, ' ').trim();
  if (!c) return undefined;
  if (HOME_WORDS.test(c)) return '';
  if (ZONE_ALIASES[c]) return ZONE_ALIASES[c];
  const zones = allZones();
  const under = c.replace(/ /g, '_');
  const exact = zones.find((z) => z.toLowerCase() === under || zoneCity(z).toLowerCase() === c);
  if (exact) return exact;
  if (c.length >= 4) {
    const part = zones.find((z) => zoneCity(z).toLowerCase().startsWith(c));
    if (part) return part;
  }
  return undefined;
}

// ── Help ──────────────────────────────────────────────────────────────────────

export const HELP_GROUPS: { title: string; icon: string; examples: string[] }[] = [
  { title: 'Now and today', icon: 'clock', examples: ["What's now?", 'Show tomorrow', 'What did I do today?'] },
  { title: 'Plan', icon: 'calendar', examples: ['Add gym at 5pm for 45 minutes', 'Meds every day at 8am', 'Remember to buy milk sometime', 'Plan my day', 'When am I free tomorrow?'] },
  { title: 'Change', icon: 'wand', examples: ['Move lunch to 2pm', 'I finished lunch', '15 more minutes', 'When is lunch?', 'Delete the walk'] },
  { title: 'Focus', icon: 'timer', examples: ['Start a 25 minute focus', 'Start 4 focus rounds', 'Stop the timer', 'Breathe'] },
  { title: 'Look back', icon: 'chart', examples: ['How was my week?', 'My rhythm', 'Check-ins', 'Wind down'] },
  { title: 'Look and feel', icon: 'palette', examples: ['Switch to the black theme', 'Use the 24 hour dial', "I'm in Tokyo", 'Show the widget'] },
];

// ── The catalogue ─────────────────────────────────────────────────────────────

function schema(
  name: string,
  description: string,
  properties: ToolSchema['parameters']['properties'] = {},
  triggers: string[] = [],
  required: string[] = [],
): ToolSchema {
  return { name, description, parameters: { type: 'object', properties, ...(required.length ? { required } : {}) }, triggers };
}

const S = (description: string, extra: { enum?: string[] } = {}) => ({ type: 'string', description, ...extra });
const N = (description: string) => ({ type: 'number', description });

export const TOOLS: ToolDef[] = [
  // ── About the assistant ──
  {
    schema: schema('help', 'Explain what the assistant can do, with examples to tap.', {}, [
      R`^(?:help|commands|\?)$`,
      R`^what (?:can|do) (?:you|i) (?:do|say|ask)\b`,
      R`^how (?:do i|does this|do you) (?:use|work)\b`,
      R`^(?:show )?(?:some )?examples?$`,
    ]),
    icon: 'sparkles',
    examples: ['help', 'what can you do', 'how does this work'],
    keywords: ['help', 'can you', 'how do', 'examples', 'commands'],
    label: () => 'What can you do?',
    run: () => ({ say: "Here's what I can do. Tap one to try it.", card: { kind: 'help' } }),
  },
  {
    schema: schema('stop_timer', 'Stop the countdown timer or focus rounds that are running now.', {}, [
      R`^(?:stop|end|cancel|kill|quit|finish|clear|reset)(?: the| my| this)? (?:timer|countdown|focus|pomodoros?|cycles?|rounds?|session)\b`,
      R`^(?:stop|end) (?:it|that)$`,
      R`^stop$`,
    ]),
    icon: 'pause',
    examples: ['stop the timer', 'cancel the countdown', 'end focus'],
    keywords: ['stop', 'end', 'cancel timer'],
    label: () => 'Stop the timer',
    run: () => {
      const a = timerFile.value.active;
      if (!a) {
        return {
          say: 'No timer is running.',
          card: { kind: 'note', icon: 'timer', chips: [{ label: 'Start a 25 minute focus', icon: 'timer', call: { tool: 'start_timer', args: { minutes: 25, norm: true } } }] },
        };
      }
      const prev = clone(a);
      timer.stop();
      return { say: `Stopped ${a.kind === 'cycles' ? 'the focus rounds' : `the ${a.label.toLowerCase() === 'timer' ? '' : `${a.label} `}timer`}.`, card: { kind: 'timer' }, undo: () => (timerFile.value.active = prev) };
    },
  },
  // ── Acting on a named block (start-anchored verbs win over content words in titles) ──
  {
    schema: schema('extend_block', "Give the block you're in (or a named one) more minutes. For '15 more minutes', 'I need more time', 'extend deep work'.", { title: S('Which block (optional)'), minutes: N('Extra minutes') }, [
      R`^(?:extend|lengthen|prolong)\b`,
      R`\b(?:\d+|a few|few|couple of) more ${UNIT}\b`,
      R`\bmore time\b`,
      R`^(?:add|give(?: me)?|another) (?:\d+ ?${UNIT}|an? (?:few )?(?:more )?minutes?|an? hour|half an hour) (?:to|on|onto|for)\b`,
      R`\b(?:not|isn'?t|i'?m not|am not) (?:done|finished)(?: yet)?\b`,
      R`\bstill (?:going|working on it|at it)\b`,
      R`\b(?:running|run|going) (?:long|over)\b`,
      R`^another \d+`,
    ]),
    icon: 'hourglass',
    examples: ['15 more minutes', 'I need more time', 'extend deep work by 10 minutes'],
    keywords: ['more', 'extend', 'longer', 'extra', 'give'],
    label: (a) => `${a.minutes ?? 15} more minutes${a.title ? ` for ${quote(a.title)}` : ''}`,
    run: async (a, ctx) => {
      const minutes = Math.max(5, Math.min(240, Math.round(a.minutes ?? 15)));
      // A running timer and no block named: the timer gets the time.
      const ts = timer.active ? timer.status(ctx.now) : null;
      if (!a.title && !a.key && ts && !ts.finished) {
        timer.addMinutes(minutes);
        return { say: `${minutes} more minutes on the timer.`, card: { kind: 'timer' }, undo: () => timer.addMinutes(-minutes) };
      }
      let b: Block | null = null;
      if (a.title || a.key) {
        const t = await resolveTarget('extend_block', a, ctx, { days: 0, prefer: 'now' }, 'Which one needs more time?');
        if (isResult(t)) return t;
        b = t.block ?? null;
      } else b = currentTaskBlock(ctx.now) ?? openCheckIns(ctx.now).at(-1) ?? null;
      if (!b || b.kind !== 'task' || b.readOnly) {
        return { say: "You're not in a block right now. Want a timer instead?", card: { kind: 'note', icon: 'hourglass', chips: [{ label: `Start a ${minutes}m timer`, icon: 'timer', call: { tool: 'start_timer', args: { minutes, norm: true } } }] } };
      }
      const undo = snapshot(b.taskId!);
      const end = Math.max(b.endMs, ceil5(ctx.now)) + minutes * MINUTE;
      adjust(b.key, b.startMs, end);
      return { say: `${minutes} more minutes for ${quote(b.title)} — until ${fmt(end)}.`, card: { kind: 'block', key: b.key, verb: 'extended' }, undo };
    },
  },
  {
    schema: schema('delete_block', 'Remove a block or task from the plan (the user confirms first). For delete, remove, cancel, skip.', { title: S('Which block') }, [
      R`^(?:delete|remove|cancel|erase|scrap|trash|bin|drop|get rid of|unschedule|skip)\b`,
    ], ['title']),
    icon: 'trash-ui',
    examples: ['delete the walk', 'remove call a friend', 'cancel gym'],
    keywords: ['delete', 'remove', 'cancel', 'drop'],
    label: (a) => `Remove ${quote(a.title ?? '')}`,
    run: async (a, ctx) => {
      if (!a.title && !a.key && !a.id) return { say: 'Which block should go? Say “delete” and its name.', card: { kind: 'day', date: isoOf(ctx.now) } };
      const t = await resolveTarget('delete_block', a, ctx, { days: 7, backlog: true, prefer: 'upcoming' }, 'Which one should go?');
      if (isResult(t)) return t;
      if (t.task) return { say: `Remove ${quote(t.task.title)} from your backlog?`, card: { kind: 'confirm', key: t.task.id, title: t.task.title, recurring: false } };
      const b = t.block!;
      if (b.readOnly) return { say: `${quote(b.title)} comes from your calendar — remove it there.`, card: { kind: 'when', key: b.key } };
      const when = b.floating ? dayWord(b.date, isoOf(ctx.now)) : `${dayPhrase(b.date, isoOf(ctx.now))} at ${fmt(b.startMs)}`;
      return { say: `Remove ${quote(b.title)} ${when}?`, card: { kind: 'confirm', key: b.key, title: b.title, recurring: b.recurring } };
    },
  },
  {
    schema: schema('move_block', "Move an existing block to another time or day. For 'move lunch to 2pm', 'push the walk to tomorrow'.", { title: S('Which block'), time: S('New start time, e.g. 2pm'), day: S('New day, e.g. tomorrow') }, [
      R`^(?:move|push|shift|reschedule|postpone|bump|slide|delay|put off|bring forward)\b`,
      R`^(?:can|could) (?:i |we |you )?(?:move|push|shift)\b`,
      R`^bring\b.*\b(?:forward|earlier|back)\b`,
      R`^(?:make|have|let)\b.*\b(?:later|earlier|sooner)$`,
    ], ['title']),
    icon: 'move-later',
    examples: ['move lunch to 2pm', 'push the walk to tomorrow', 'reschedule the call to friday'],
    keywords: ['move', 'later', 'push', 'reschedule', 'earlier', 'postpone'],
    label: (a) => `Move ${quote(a.title ?? 'it')}${a.time != null ? ` to ${fmtMin(a.time)}` : ''}${a.day ? ` ${dayPhrase(a.day)}` : ''}`,
    run: async (a, ctx) => {
      const today = isoOf(ctx.now);
      let t: Target | ToolResult;
      if (!a.title && !a.key && !a.id) {
        const cur = currentTaskBlock(ctx.now) ?? view.now.next;
        if (!cur || cur.kind !== 'task') return { say: 'Which block should move? Try “move lunch to 2pm”.', card: { kind: 'day', date: today } };
        t = { block: cur };
      } else t = await resolveTarget('move_block', a, ctx, { days: 7, backlog: true, prefer: 'upcoming' }, 'Which one should move?');
      if (isResult(t)) return t;

      if (t.task) {
        const date = a.day ?? today;
        const start = a.time ?? firstFree(date, t.task.duration, ctx.now);
        const undo = snapshot(t.task.id);
        tasks.schedule(t.task.id, date, start);
        return { say: `Placed ${quote(t.task.title)} ${dayPhrase(date, today)} at ${fmtMin(start)}.`, card: { kind: 'block', key: blockKey(t.task.id, date), verb: 'moved', from: 'backlog' }, undo };
      }
      const b = t.block!;
      if (b.readOnly) return { say: `${quote(b.title)} comes from your calendar — move it there.`, card: { kind: 'when', key: b.key } };
      const len = Math.round((b.endMs - b.startMs) / MINUTE);
      const from = b.floating ? dayWord(b.date, today) : `${b.date === today ? '' : `${dayWord(b.date, today)} `}${fmt(b.startMs)}`;
      let date = a.day ?? b.date;
      let start: number | null;
      if (a.time != null) start = a.time;
      else if (a.shift && !b.floating) {
        const ms = b.startMs + a.shift * MINUTE;
        date = isoOf(ms);
        start = round5(minutesOfDay(ms));
      } else if (a.day && a.day !== b.date) start = b.floating ? null : round5(minutesOfDay(b.startMs));
      else {
        // "move it later" / nothing said: the next free gap today that fits it.
        const gap = freeGaps(busyBetween(startOfDayMs(today), startOfDayMs(addDays(today, 1)), { except: b.key }), ceil5(Math.max(ctx.now, b.startMs + MINUTE)), startOfDayMs(addDays(today, 1)), len * MINUTE).find((g) => g.endMs - g.startMs >= len * MINUTE);
        if (!gap) {
          return { say: `No free gap left today for ${quote(b.title)}. Tomorrow?`, card: { kind: 'note', icon: 'calendar', chips: [{ label: 'Move to tomorrow', icon: 'move-later', call: { tool: 'move_block', args: { key: b.key, day: addDays(b.date, 1), norm: true } } }] } };
        }
        date = today;
        start = round5(minutesOfDay(gap.startMs));
      }
      const r = placeOccurrence(b.key, date, start);
      if (!r) return notFound(b.title, 'today');
      const where = start === null ? dayPhrase(date, today) : `${date === b.date ? '' : `${dayPhrase(date, today)} `}${fmtMin(start)}`;
      return { say: `Moved ${quote(b.title)} to ${where.replace(/^on /, '')}.`, card: { kind: 'block', key: r.key, verb: 'moved', from }, undo: r.undo };
    },
  },
  {
    schema: schema('complete_block', "Mark an existing block or task as done. For 'I finished lunch', 'done with the walk', 'took my meds'.", { title: S('Which block or task') }, [
      R`^(?:i )?(?:just |already |have |'ve )?(?:finished|completed|did|done with|am done with|ticked off|checked off|wrapped up|ate|had|took|knocked out)\b`,
      R`^(?:mark|tick)\b`,
      R`^check off\b`,
      R`^check\b.*\b(?:done|off)$`,
      R`\b(?:is|are|was|'s) (?:done|finished|complete|completed)$`,
      R`^(?:done|finished|completed)(?: with)?\b`,
      R`\b(?:i'?m|i am|i'?ve|i have) (?:just |now |finally )?(?:done with|finished(?: with)?|completed)\b`,
      R`\b(?:done|finished)$`,
      R`^i'?m done$`,
    ]),
    icon: 'circle-check',
    examples: ['I finished lunch', 'done with the walk', 'mark meds done'],
    keywords: ['done', 'finished', 'completed', 'tick', 'did'],
    label: (a) => (a.title ? `Mark ${quote(a.title)} done` : 'Mark the current block done'),
    run: async (a, ctx) => {
      const today = isoOf(ctx.now);
      let t: Target | ToolResult;
      if (!a.title && !a.key && !a.id) {
        const b = currentTaskBlock(ctx.now) ?? openCheckIns(ctx.now).at(-1);
        if (!b) return { say: "You're not in a block right now. Which one did you finish?", card: { kind: 'checkins' } };
        t = { block: b };
      } else t = await resolveTarget('complete_block', a, ctx, { days: 0, done: true, backlog: true, prefer: 'now' }, 'Which one did you finish?');
      if (isResult(t)) return t;

      if (t.task) {
        const id = t.task.id;
        backlog.complete(id, ctx.now);
        sounds.done();
        return { say: `Done: ${quote(t.task.title)}. One less thing to hold.`, card: { kind: 'items', mode: 'done', ids: [id] }, undo: () => backlog.restore(id) };
      }
      const b = t.block!;
      if (b.readOnly) return { say: `${quote(b.title)} comes from your calendar, so there's nothing to tick.`, card: { kind: 'when', key: b.key } };
      if (b.done) return { say: `${quote(b.title)} is already done. Nice.`, card: { kind: 'block', key: b.key, verb: 'already' } };
      toggleDone(b.key);
      const n = dayReview(today).done.length;
      return {
        say: `${quote(b.title)} — done. ${n === 1 ? 'Your first one today.' : `${n} finished today.`}`,
        card: { kind: 'block', key: b.key, verb: 'done' },
        undo: () => {
          const p = parseBlockKey(b.key);
          const task = p && tasks.get(p.taskId);
          if (p && task?.completions.includes(p.date)) tasks.toggleDone(p.taskId, p.date);
        },
      };
    },
  },
  {
    schema: schema('when_is', "Tell when a named block happens and how long until it starts. For 'when is lunch', 'how long until my walk'.", { title: S('Which block') }, [
      R`^when(?:'s| is| does| do| will)\b`,
      R`\bhow (?:long|much time|many minutes|many hours) (?:is it )?(?:until|till|til|before)\b`,
      R`^what time (?:is|does|do|will)(?: my| the)? [a-z]`,
    ], ['title']),
    icon: 'alarm',
    examples: ['when is lunch', 'how long until my walk', 'what time is the call'],
    keywords: ['when', 'until', 'long', 'what time'],
    label: (a) => `When is ${quote(a.title ?? '')}?`,
    run: async (a, ctx) => {
      const today = isoOf(ctx.now);
      if (!a.title && !a.key) return { say: 'When is what? Try “when is lunch”.', card: { kind: 'now' } };
      const t = await resolveTarget('when_is', a, ctx, { days: 7, done: true, events: true, backlog: true, prefer: 'upcoming' }, 'Which one do you mean?');
      if (isResult(t)) return t;
      if (t.task) {
        return {
          say: `${quote(t.task.title)} is in your backlog — not on the dial yet.`,
          card: { kind: 'items', mode: 'backlog', ids: [t.task.id], list: 'all' },
        };
      }
      const b = t.block!;
      let say: string;
      if (b.floating) say = `${quote(b.title)} is ${dayWord(b.date, today)}, any time${b.done ? ' — done' : ''}.`;
      else if (b.startMs <= ctx.now && ctx.now < b.endMs && !b.done) say = `You're in ${quote(b.title)} now — ${formatDuration(b.endMs - ctx.now)} left.`;
      else if (b.startMs > ctx.now) say = `${quote(b.title)} is ${b.date === today ? '' : `${dayPhrase(b.date, today)} `}at ${fmt(b.startMs)} — in ${formatDuration(b.startMs - ctx.now)}.`;
      else say = `${quote(b.title)} was at ${fmt(b.startMs)}${b.done ? ' — done.' : '.'}`;
      return { say, card: { kind: 'when', key: b.key } };
    },
  },
  // ── Timers, look and feel, calm ──
  {
    schema: schema('toggle_widget', 'Show or hide the small dial that floats on the desktop (the widget).', { state: S('show, hide or toggle', { enum: ['show', 'hide', 'toggle'] }) }, [
      R`\bwidgets?\b`,
      R`\b(?:desktop|floating|mini) (?:dial|clock)\b`,
    ]),
    icon: 'dial',
    examples: ['show the widget', 'hide the desktop dial', 'toggle widget'],
    keywords: ['widget', 'desktop', 'floating'],
    label: (a) => (a.state === 'hide' ? 'Hide the desktop dial' : 'Show the desktop dial'),
    run: async (a) => {
      const was = settings.value.widget.visible;
      const want = a.state === 'show' ? true : a.state === 'hide' ? false : !was;
      const set = async (v: boolean) => {
        let vis = v;
        try {
          vis = await platform.showWidget(v);
        } catch {
          /* browser without a window: keep the wish */
        }
        settings.value.widget.visible = vis;
        return vis;
      };
      const vis = await set(want);
      return { say: vis ? 'The desktop dial is on.' : 'The desktop dial is hidden.', card: { kind: 'widget' }, undo: () => void set(was) };
    },
  },
  {
    schema: schema('start_focus_cycles', 'Start focus rounds with short breaks in between (pomodoro).', { rounds: N('How many focus rounds'), minutes: N('Minutes per focus round') }, [
      R`\bpomodoros?\b`,
      R`\b(?:focus|work) (?:cycles?|rounds?|sprints?)\b`,
      R`^(?:start|begin|do|run)(?: \d+)? (?:cycles|rounds|sprints)\b`,
      R`^\d+ (?:cycles|rounds|sprints)\b`,
    ]),
    icon: 'target',
    examples: ['start 4 focus rounds', 'pomodoro', 'do 3 focus cycles'],
    keywords: ['pomodoro', 'cycles', 'rounds', 'sprints'],
    label: (a) => `${a.rounds ?? settings.value.cycles.rounds} focus rounds`,
    run: (a, ctx) => {
      const c = settings.value.cycles;
      const rounds = Math.max(1, Math.min(12, Math.round(a.rounds ?? c.rounds)));
      const focus = Math.max(5, Math.min(120, Math.round(a.minutes ?? c.focus)));
      const prev = { active: clone(timerFile.value.active), preset: settings.value.preset };
      const cur = currentTaskBlock(ctx.now);
      timer.startCycles({ ...c, rounds, focus }, cur?.title || 'Focus');
      settings.value.preset = 'chrono';
      sounds.begin();
      return {
        say: `${rounds} × ${focus}m focus, with ${c.short}m breaks between. Go gently.`,
        card: { kind: 'timer' },
        undo: () => {
          timerFile.value.active = prev.active;
          settings.value.preset = prev.preset;
        },
      };
    },
  },
  {
    schema: schema(
      'start_timer',
      'Start a countdown timer right now, e.g. "start a 25 minute focus", "set a timer for 10 minutes", "I need a break". Not for planning something at a clock time.',
      { minutes: N('Length in minutes'), label: S('What the timer is for, e.g. Focus or Break') },
      [
        R`\b(?:timer|countdown)\b(?! (?:face|dial|view))`,
        R`^(?:start|begin|set|run)(?: a| an| my)? (?:\d+|an?|half an?) ?-?${UNIT}\b`,
        R`^focus (?:for )?\d+`,
        R`^\d+ ?${UNIT} (?:of )?(?:focus|work|break|sprint)\b`,
        R`\b(?:take|need|have|want) a (?:short |quick |little |small |\d+ ?${UNIT} )?break\b`,
        R`^(?:start|begin) (?:a |my )?(?:focus|focus session|break)$`,
      R`\b(?:do|start|begin|get into) (?:some )?(?:deep work|focus(?:ed)? work|a focus session)\b`,
      ],
    ),
    icon: 'timer',
    examples: ['start a 25 minute focus', 'set a timer for 10 minutes', 'I need a break'],
    keywords: ['timer', 'focus', 'countdown', 'break', 'start'],
    label: (a) => `Start a ${a.minutes ?? 25}m ${(a.label ?? 'timer').toLowerCase()}`,
    run: (a, ctx) => {
      const isBreak = /break|rest/i.test(a.label ?? '');
      const minutes = Math.max(1, Math.min(600, Math.round(a.minutes ?? (isBreak ? 10 : 25))));
      const cur = currentTaskBlock(ctx.now);
      const label = a.label || (cur?.title ?? 'Focus');
      const category: CategoryId = isBreak ? 'rest' : (cur?.category ?? 'focus');
      const icon = isBreak ? 'coffee' : (cur?.icon ?? 'timer');
      const prev = { active: clone(timerFile.value.active), preset: settings.value.preset };
      timer.startCountdown(minutes, label, category, icon);
      settings.value.preset = 'timer60';
      sounds.begin();
      return {
        say: isBreak ? `A ${minutes}-minute break. Step away — I'll keep time.` : `${minutes} minutes of ${label === 'Focus' ? 'focus' : quote(label)}. Go gently.`,
        card: { kind: 'timer' },
        undo: () => {
          timerFile.value.active = prev.active;
          settings.value.preset = prev.preset;
        },
      };
    },
  },
  {
    schema: schema(
      'set_theme',
      'Change the colour theme of the app, or switch between dark and light mode.',
      { theme: S('Theme name, or dark / light / system', { enum: [...THEMES.map((t) => t.id), 'dark', 'light', 'system'] }) },
      [
        R`\b(?:theme|dark mode|light mode|night mode|day mode)\b`,
        R`^(?:switch|change|go|turn|use|make it|set|make)(?: it| the app| everything)?(?: to| on)?(?: the)? (?:fog|linen|mist|sage|midnight|black|graphite|forest|plum|cocoa|dark|light)\b`,
        R`^(?:fog|linen|mist|sage|midnight|graphite|forest|plum|cocoa)$`,
        R`\btoo (?:bright|dark)\b`,
      ],
    ),
    icon: 'palette',
    examples: ['switch to the black theme', 'dark mode', 'use the linen theme'],
    keywords: ['theme', 'dark', 'light', 'colour', 'color', 'bright'],
    label: (a) => (a.theme && THEME_BY_ID[a.theme as ThemeId] ? `${THEME_BY_ID[a.theme as ThemeId].name} theme` : a.theme === 'dark' ? 'Dark mode' : a.theme === 'light' ? 'Light mode' : 'Change the theme'),
    run: (a) => {
      const s = settings.value;
      const prev = { theme: s.theme, lightTheme: s.lightTheme, darkTheme: s.darkTheme };
      const undo = () => Object.assign(settings.value, prev);
      const want = a.theme ?? (view.dark ? 'light' : 'dark');
      const t = THEME_BY_ID[want as ThemeId];
      let say: string;
      if (t) {
        if (t.mode === 'light') s.lightTheme = t.id;
        else s.darkTheme = t.id;
        if (view.dark !== (t.mode === 'dark')) s.theme = t.mode;
        say = `${t.name} theme on.`;
      } else if (want === 'dark' || want === 'light') {
        s.theme = want;
        say = `${cap(want)} mode on — ${THEME_BY_ID[want === 'dark' ? s.darkTheme : s.lightTheme]?.name ?? cap(want)}.`;
      } else if (want === 'system') {
        s.theme = 'system';
        say = "Following your system's light and dark.";
      } else {
        return { say: "I don't know that theme — here are the ones I have.", card: { kind: 'theme' } };
      }
      return { say, card: { kind: 'theme' }, undo };
    },
  },
  {
    schema: schema(
      'set_dial',
      'Change the dial face: 12 hours, 24 hours, a one-hour timer, or focus cycles.',
      { preset: S('Which face', { enum: ['12h', '24h', 'hour', 'cycles'] }) },
      [
        R`\b(?:12|24)[- ]?(?:h|hrs?|hours?) (?:dial|view|clock|face|mode)\b`,
        R`^(?:12|24)[- ]?(?:h|hrs?|hours?)(?: (?:dial|view|clock|face|mode))?$`,
        R`^(?:switch|change|go|set|use|show)(?: it| me)?(?: to| the)? (?:a |the )?(?:12|24)[- ]?(?:h|hrs?|hours?)\b`,
        R`\b(?:dial|clock face|watch face)\b`,
        R`\b(?:hour|timer|cycles?|focus) (?:dial|face|view)\b`,
      ],
    ),
    icon: 'dial',
    examples: ['use the 24 hour dial', 'switch to the 12h dial', 'show the hour timer face'],
    keywords: ['dial', 'face', '24', '12', 'clock'],
    label: (a) => (a.preset ? `${PRESETS[a.preset].name} dial` : 'Change the dial'),
    run: (a) => {
      const prev = settings.value.preset;
      if (!a.preset) return { say: 'Here are the dial faces.', card: { kind: 'dial' } };
      settings.value.preset = a.preset;
      return { say: `${PRESETS[a.preset].name} dial — ${PRESETS[a.preset].hint.toLowerCase()}.`, card: { kind: 'dial' }, undo: () => (settings.value.preset = prev) };
    },
  },
  {
    schema: schema('set_timezone', "Show the whole day in another city's time zone, or go back to local time.", { city: S('City or place, or "local"') }, [
      R`\btime ?zones?\b`,
      R`^(?:i'?m|i am|we'?re|we are)(?: now| currently)? (?:in|at|visiting) [a-z]`,
      R`\b(?:local|home|my own|normal) time\b`,
      R`^(?:switch|change|go|set|show)(?: me| it| my day| the day)?(?: back)? (?:to|in) [a-z .'-]+ time$`,
      R`\bin [a-z .'-]+ time$`,
    ]),
    icon: 'globe',
    examples: ["I'm in Tokyo", 'switch to London time', 'back to local time'],
    keywords: ['timezone', 'zone', 'travel', 'city', 'abroad'],
    label: (a) => (a.zone ? `${zoneCity(a.zone)} time` : a.zone === '' ? 'Back to local time' : 'Time zone'),
    run: (a) => {
      if (a.zone === undefined) {
        return { say: a.city ? `I couldn't find a time zone for ${quote(a.city)}. Try a big city nearby.` : 'Which city? Try “I’m in Tokyo”.', card: { kind: 'zone' } };
      }
      const s = settings.value;
      const prev = { timeZone: s.timeZone, recentZones: [...s.recentZones] };
      const system = systemTimeZone();
      const z = a.zone || system;
      s.timeZone = z === system ? '' : z;
      if (z !== system) s.recentZones = [z, ...s.recentZones.filter((x) => x !== z)].slice(0, 5);
      return {
        say: z === system ? `Back on this computer's time · ${zoneCity(system)}.` : `Showing your day in ${zoneCity(z)} time · ${zoneOffsetLabel(z)}.`,
        card: { kind: 'zone' },
        undo: () => Object.assign(settings.value, prev),
      };
    },
  },
  {
    schema: schema('breathe', 'Start a one-minute breathing guide on the dial, for when the user feels anxious, stressed or overwhelmed.', {}, [
      R`\b(?:breathe|breathing|calm down|calm me|anxious|anxiety|overwhelm(?:ed|ing)?|panic(?:king|ky)?|stressed|stressing|freaking out)\b`,
    ]),
    icon: 'wind',
    examples: ['breathe', 'I feel overwhelmed', 'help me calm down'],
    keywords: ['breathe', 'calm', 'anxious', 'stress', 'relax', 'overwhelmed', 'panic'],
    label: () => 'Breathe for a minute',
    run: (_a, ctx) => {
      view.breatheAt = ctx.now;
      return { say: `Breathe with the dial for ${rhythmLength(breathRhythm())}: ${describeRhythm(breathRhythm())}.`, card: { kind: 'breathe' }, undo: () => (view.breatheAt = 0) };
    },
  },
  {
    schema: schema('wind_down', "Close the day: what got done, and a kind decision for what's still open. For 'wind down', 'goodnight', 'I'm done for today'.", {}, [
      R`\bwind(?:ing)?[ -]?down\b`,
      R`\bclose (?:out )?(?:the|my) day\b`,
      R`\b(?:end|finish|wrap up|wrap) (?:the|my) day\b`,
      R`\bgood ?night\b`,
      R`\bdone for (?:the day|today|tonight)\b`,
      R`\b(?:going|off|heading|time) to (?:bed|sleep)\b`,
      R`^(?:bedtime|wrap up|end of day)$`,
    ]),
    icon: 'moon',
    examples: ['wind down', 'close the day', "I'm done for today"],
    keywords: ['night', 'bed', 'sleep', 'wind', 'close'],
    label: () => 'Close the day',
    run: (_a, ctx) => {
      const r = dayReview(isoOf(ctx.now));
      const done = r.done.length;
      const open = r.open.filter((b) => b.endMs <= ctx.now || b.floating).length;
      return {
        say: done ? `${done} done today${open ? `, ${open} still open` : ''}. Ready to close the day?` : `A quiet day${open ? `, ${open} still open` : ''}. Rest is part of the plan.`,
        card: { kind: 'winddown' },
      };
    },
  },
  // ── The backlog and free time ──
  {
    schema: schema('show_backlog', 'List the tasks waiting in the backlog: inbox, next, someday or done.', { list: S('Which list', { enum: ['inbox', 'next', 'someday', 'done', 'all'] }) }, [
      R`^(?:show|open|see|view|list|display|check)(?: me)?(?: my| the)? (?:backlog|inbox|someday(?: list)?|next list|later(?: list)?|to-?do(?: list)?|todos|list)\b`,
      R`^(?:my )?(?:backlog|inbox|to-?dos?|to-?do list|someday list)$`,
      R`^what(?:'s| is) (?:in|on) (?:my |the )?(?:backlog|inbox|someday|later|to-?do|list)`,
    ]),
    icon: 'inbox',
    examples: ['show my backlog', "what's in my inbox", 'show the someday list'],
    keywords: ['backlog', 'inbox', 'list', 'todos', 'todo'],
    label: () => 'Show your backlog',
    run: (a, ctx) => {
      const all = taskFile.value.tasks;
      const list = (a.list ?? 'all') as ListId | 'all';
      const items = list === 'all' ? openItems(all) : itemsIn(all, list);
      const sorted = list === 'done' ? sortItems(items, 'manual', 'done') : sortItems(items, 'priority', list === 'all' ? 'inbox' : list);
      const today = isoOf(ctx.now);
      const soon = items.filter((t) => t.due && daysBetween(today, t.due) <= 2 && !t.doneAt).length;
      const n = items.length;
      const say =
        n === 0
          ? list === 'done'
            ? 'Nothing finished from the backlog yet.'
            : 'Your backlog is clear. Nice and light.'
          : list === 'done'
            ? `${n} finished from your backlog.`
            : `${n} ${plural(n, 'thing')} waiting${soon ? ` · ${soon} due soon` : ''}.`;
      return { say, card: { kind: 'items', mode: 'backlog', ids: sorted.slice(0, 8).map((t) => t.id), list } };
    },
  },
  {
    schema: schema(
      'add_to_backlog',
      "Save a task for later, with no time on the dial (the backlog). For 'remember to…', 'sometime', 'someday', 'add X to my list'.",
      { title: S('The task'), minutes: N('Rough length in minutes'), due: S('Day it is due, if any'), priority: S('How important', { enum: ['must', 'should', 'could'] }) },
      [
        R`\b(?:to|in|into|on|onto) (?:my |the )?(?:backlog|inbox|someday(?: list)?|later list|to-?do(?: list)?|list)\b`,
        R`^(?:remember|don'?t forget|do not forget|remind me)\b`,
        R`\b(?:sometime|someday|some day|eventually|at some point|no rush|one day)\b`,
        R`^(?:capture|note|jot(?: down)?|brain ?dump|todo|to-?do|later|park)\b[: ]`,
      ],
      ['title'],
    ),
    icon: 'inbox',
    examples: ['remember to buy milk sometime', 'add call the bank to my backlog', 'someday learn guitar'],
    keywords: ['remember', 'later', 'backlog', 'someday', 'note', 'idea', 'save', 'forget'],
    label: (a) => (a.title ? `Save ${quote(a.title)} for later` : 'Save it for later'),
    run: (a, ctx) => {
      const title = (a.title ?? '').trim();
      if (!title) return { say: 'What should I save? Try “remember to call the bank”.', card: { kind: 'note', icon: 'inbox' } };
      const list: BacklogList = a.list === 'next' || a.list === 'someday' ? a.list : 'inbox';
      const hint = suggest(title);
      const t = tasks.create({
        title,
        icon: hint?.icon,
        category: hint?.category,
        date: null,
        start: null,
        duration: clampDur(a.minutes ?? 30),
        due: a.due ?? null,
        priority: a.priority ?? null,
        list,
        order: topOrder(list),
        alerts: [5],
      });
      const due = a.due ? `, due ${dueLabel(a.due, isoOf(ctx.now)).toLowerCase()}` : '';
      return {
        say: `Saved ${quote(title)} to your ${list === 'someday' ? 'Someday list' : 'backlog'}${due}.`,
        card: { kind: 'items', mode: 'captured', ids: [t.id] },
        undo: () => tasks.remove(t.id),
      };
    },
  },
  {
    schema: schema('find_free_time', "Find free, unplanned stretches on a day. For 'when am I free tomorrow', 'find me an hour', 'any gaps this afternoon'.", {
      day: S('Which day'),
      minutes: N('Shortest stretch worth showing, in minutes'),
      part: S('Part of the day', { enum: ['morning', 'afternoon', 'evening'] }),
    }, [
      R`\bfree\b`,
      R`\b(?:gaps?|open slots?|availability|available|spare time|downtime)\b`,
      R`^find (?:me )?(?:some |an? |\d+ ?${UNIT} )?(?:time|hour|slot|gap|window|minutes|break)\b`,
      R`\bwhen (?:can|could|do) i (?:fit|squeeze|have)\b`,
      R`\broom for\b`,
    ]),
    icon: 'circle-dashed',
    examples: ['when am I free tomorrow', 'find me an hour this afternoon', 'any gaps today'],
    keywords: ['free', 'gap', 'available', 'spare', 'slot', 'room'],
    label: (a) => `Free time ${dayWord(a.day)}${a.part ? ` ${a.part}` : ''}`,
    run: (a, ctx) => {
      const today = isoOf(ctx.now);
      const date = a.day ?? today;
      const minutes = Math.max(5, Math.round(a.minutes ?? 15));
      const win = windowFor(date, ctx.now);
      let { fromMs, toMs } = win;
      if (a.part) {
        const [s, e] = a.part === 'morning' ? [0, 12 * 60] : a.part === 'afternoon' ? [12 * 60, 17 * 60] : [17 * 60, 24 * 60];
        fromMs = Math.max(fromMs, atMinutes(date, s));
        toMs = Math.min(toMs, atMinutes(date, e));
      }
      const when = `${a.part ? `${date === today ? 'this' : dayWord(date, today)} ${a.part}` : dayWord(date, today)}`;
      if (toMs <= fromMs) {
        return {
          say: `${cap(when)} is already over.`,
          card: { kind: 'note', icon: 'moon', chips: [{ label: 'Free time tomorrow', icon: 'circle-dashed', call: { tool: 'find_free_time', args: { day: addDays(today, 1), minutes, norm: true } } }] },
        };
      }
      const gaps = freeSpans(busyFor(date), fromMs, toMs).filter((g) => g.endMs - g.startMs >= minutes * MINUTE);
      const total = gaps.reduce((s, g) => s + g.endMs - g.startMs, 0);
      let say: string;
      if (!gaps.length) say = `No ${minutes >= 30 ? `${dur(minutes)} ` : ''}free stretch ${when}.`;
      else if (gaps.length <= 3) {
        const parts = gaps.map((g) => `${fmt(g.startMs)}–${fmt(g.endMs)}`);
        const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
        say = `${cap(when)} you're free ${list}.`;
      } else {
        const longest = gaps.reduce((m, g) => (g.endMs - g.startMs > m.endMs - m.startMs ? g : m));
        say = `${formatDuration(total)} free ${when}, the longest ${formatDuration(longest.endMs - longest.startMs)} from ${fmt(longest.startMs)}.`;
      }
      return { say, card: { kind: 'free', date, fromMs, toMs, minutes } };
    },
  },
  {
    schema: schema('search_tasks', "Find existing tasks or blocks by name or meaning. For 'find…', 'where is…', 'do I have anything about…'.", { query: S('What to look for') }, [
      R`^(?:find|search|look for|look up|lookup|locate)\b`,
      R`^where(?:'s| is| are| did i put)\b`,
      R`\bdo i have (?:anything|something|a task|a block|any tasks?) (?:about|for|with|called|named|on)\b`,
    ], ['query']),
    icon: 'search',
    examples: ['find dentist', 'search for groceries', 'do I have anything about taxes'],
    keywords: ['find', 'search', 'where', 'about', 'look'],
    label: (a) => `Search for ${quote(a.query ?? '')}`,
    run: async (a, ctx) => {
      const q = (a.query ?? '').trim();
      if (!q) return { say: 'What should I look for?', card: { kind: 'note', icon: 'search' } };
      const cands: Candidate<string>[] = [];
      for (const t of taskFile.value.tasks) {
        if (t.date === null && t.doneAt) continue;
        const extra = [t.notes, ...t.subtasks.map((s) => s.title)].filter(Boolean).join(' ');
        cands.push({ item: t.id, text: t.title, extra: extra || undefined, icon: t.icon });
      }
      const found = hits(await rank(q, cands, ctx.embed));
      if (!found.length) {
        return {
          say: `Nothing matches ${quote(q)} yet.`,
          card: {
            kind: 'note',
            icon: 'search',
            chips: [
              { label: `Add ${quote(cap(q))} today`, icon: 'plus', call: { tool: 'create_block', args: { title: cap(q), norm: true } } },
              { label: 'Save it for later', icon: 'inbox', call: { tool: 'add_to_backlog', args: { title: cap(q), norm: true } } },
            ],
          },
        };
      }
      return { say: `Found ${found.length} for ${quote(q)}.`, card: { kind: 'items', mode: 'search', ids: found.map((h) => h.item), query: q } };
    },
  },
  {
    schema: schema('plan_my_day', "Suggest times for backlog tasks in a day's free gaps, to place with one tap. For 'plan my day', 'fill my afternoon'.", { day: S('Which day, usually today') }, [
      R`\bplan (?:my|the|out|today|tomorrow|this|it)\b`,
      R`^(?:help me )?plan$`,
      R`^help me plan\b`,
      R`\bfill (?:up )?(?:my|the) (?:day|morning|afternoon|evening|gaps?)\b`,
      R`\bschedule (?:my )?(?:backlog|tasks|todos?|to-?dos?)\b`,
      R`\bwhat should i (?:do|work on|tackle) (?:today|this (?:morning|afternoon|evening))\b`,
      R`\borgani[sz]e (?:my|the) day\b`,
      R`\bfit (?:my |the |some )?(?:saved|backlog|tasks?|stuff|things|todos?|to-?dos?)\b`,
    ]),
    icon: 'wand-sparkles',
    examples: ['plan my day', 'fill my afternoon', 'plan tomorrow'],
    keywords: ['plan', 'organise', 'organize', 'fill', 'arrange'],
    label: (a) => `Plan ${a.day && a.day !== view.today ? dayWord(a.day) : 'my day'}`,
    run: (a, ctx) => {
      const today = isoOf(ctx.now);
      const date = a.day ?? today;
      const open = openItems(taskFile.value.tasks).length;
      const plan = planFor(date);
      const n = plan.items.length;
      const say = !open
        ? 'Your backlog is empty, so there is nothing to place. Save things with “remember to…”.'
        : !n
          ? `No room ${dayPhrase(date, today)} for your backlog items — the day is full.`
          : `Here's a plan: ${n} ${plural(n, 'thing')} from your backlog, placed in free time ${dayPhrase(date, today)}${plan.skipped.length ? ` (${plan.skipped.length} didn't fit)` : ''}.`;
      return { say, card: open ? { kind: 'plan', date } : { kind: 'items', mode: 'backlog', ids: [], list: 'all' } };
    },
  },
  // ── Now, today and looking back ──
  {
    schema: schema('whats_now', "Tell the user what is happening now: the current block, time left, and what's next. For 'what now', 'what's next', 'what should I be doing'.", {}, [
      R`^what(?:'s| is) (?:happening |on )?(?:right )?now\b`,
      R`^what(?:'s| is)(?: up)? next\b`,
      R`^(?:now|next|right now)$`,
      R`\bwhat (?:am i|should i be) (?:doing|on|working on)\b`,
      R`\bwhat (?:should|do|can) i do (?:now|next|right now)\b`,
      R`\bwhere am i\b`,
      R`\b(?:how much time|how long|time) (?:do i have )?(?:is )?left\b`,
      R`^what time is it\b`,
      R`^what(?:'s| is) (?:the )?time$`,
      R`\b(?:coming up|up next)(?: soon| now| next)?$`,
    ]),
    icon: 'clock',
    examples: ["what's now", "what's next", 'what should I be doing'],
    keywords: ['now', 'next', 'current', 'left', 'doing', 'right now'],
    label: () => "What's happening now",
    run: (_a, ctx) => {
      const s = view.now;
      const ts = timer.active ? timer.status(ctx.now) : null;
      let say: string;
      if (ts && !ts.finished) say = `${ts.segment.label} — ${formatDuration(ts.remainingMs)} left on the timer.`;
      else if (s.current) say = `You're in ${quote(s.current.title)} — ${formatDuration(s.current.endMs - ctx.now)} left.${s.next ? ` Then ${s.next.title} at ${fmt(s.next.startMs)}.` : ''}`;
      else if (s.next) say = `Free until ${s.next.title} at ${fmt(s.next.startMs)} — ${formatDuration(s.next.startMs - ctx.now)} from now.`;
      else say = 'Nothing else is planned today. The rest of the day is yours.';
      return { say, card: { kind: 'now' } };
    },
  },
  {
    schema: schema('week_review', "Review the past week (or 4 weeks): finished blocks, time well spent, gentle highlights. For 'how was my week'.", { span: S('week or month', { enum: ['week', 'month'] }) }, [
      R`\bhow (?:was|is|did|has|have|am)(?: my| this| the| last)? (?:week|month|weeks|been doing|i been doing|i doing|doing)\b`,
      R`\b(?:week|weekly|month|monthly) (?:review|recap|summary|stats|insights|report|in review)\b`,
      R`\b(?:summar(?:y|ise|ize)|recap|review)\b.*\b(?:week|month)\b`,
      R`\b(?:insights|my progress|my stats|statistics|badges?|achievements?)\b`,
      R`^(?:my|this|last|the|past) (?:week|month|4 weeks)$`,
      R`\blast (?:week|month|4 weeks|28 days|7 days)\b`,
      R`\bhow\b.*\b(?:these|the last|last|past) (?:few |\d+ )?days\b`,
    ]),
    icon: 'chart',
    examples: ['how was my week', 'weekly review', 'how am I doing'],
    keywords: ['week', 'month', 'insights', 'progress', 'doing', 'review'],
    label: (a) => (a.span === 28 ? 'The last 4 weeks' : 'How was my week'),
    run: (a, ctx) => {
      const span: Span = a.span === 28 ? 28 : 7;
      const s = computeInsights(taskFile.value.tasks, ctx.now, span);
      const n = s.finished + s.backlogDone;
      const period = span === 7 ? 'this week' : 'in the last 4 weeks';
      const say = n
        ? `${n} ${plural(n, 'thing')} finished ${period}${s.spentTotal >= MINUTE ? ` · ${formatDuration(s.spentTotal)} well spent` : ''}.`
        : span === 7
          ? 'A quiet week. Nothing to catch up on — the dial is ready when you are.'
          : 'A quiet few weeks. Nothing to catch up on.';
      return { say, card: { kind: 'week', span } };
    },
  },
  {
    schema: schema('streaks', "Show the user's rhythm (days in a row with something finished) and their routine streaks.", {}, [R`\b(?:streaks?|rhythm|in a row|consistency|consecutive)\b`]),
    icon: 'flame',
    examples: ['my rhythm', "how's my streak", 'how many days in a row'],
    keywords: ['streak', 'rhythm', 'row', 'days'],
    label: () => 'Your rhythm',
    run: (_a, ctx) => {
      const r = rhythm(taskFile.value.tasks, ctx.now);
      const rs = routineStreaks(taskFile.value.tasks, ctx.now, dark());
      const say = r.current
        ? `${r.current}-day rhythm${r.best > r.current ? ` · best ${r.best}` : ''}${r.rest ? ` · ${r.rest} rest ${plural(r.rest, 'day')} banked` : ''}.${rs[0] ? ` ${rs[0].title}: ${rs[0].count} in a row.` : ''}`
        : 'No rhythm yet — finishing one small thing today starts it.';
      return { say, card: { kind: 'streaks' } };
    },
  },
  {
    schema: schema('check_ins', 'List blocks that ended without being ticked, to answer: done, more time, later or let go.', {}, [
      R`\bcheck[ -]?ins?\b`,
      R`\bwhat did i (?:miss|skip|forget)\b`,
      R`\b(?:unfinished|unticked|left open|still open|overdue)\b`,
      R`^(?:what(?:'s| is)|anything) (?:still )?waiting\b`,
      R`\bdid i (?:miss|forget)\b`,
      R`\b(?:didn'?t|did not|haven'?t) (?:tick|finish|check off)\b`,
      R`\b(?:anything|something) i (?:forgot|missed|didn'?t do)\b`,
    ]),
    icon: 'bell',
    examples: ['check-ins', "anything I didn't tick", "what's waiting"],
    keywords: ['check', 'missed', 'waiting', 'unfinished', 'overdue'],
    label: () => 'Check-ins',
    run: (_a, ctx) => {
      const n = openCheckIns(ctx.now).length;
      return { say: n ? `${n} ${n === 1 ? 'block is' : 'blocks are'} waiting for a check-in.` : 'All caught up — nothing waiting.', card: { kind: 'checkins' } };
    },
  },
  {
    schema: schema('summarize_today', "Summarize what the user already finished today and the time it took. For 'what did I do today', 'how was my day'.", {}, [
      R`\bwhat (?:did|have) i (?:do|done|get done|got done|finish|finished|complete|completed|accomplish|accomplished|achieve|achieved)\b`,
      R`\bwhat i(?:'ve| have)? (?:done|finished|got done)\b`,
      R`\b(?:summar(?:y|ise|ize)|recap)\b`,
      R`\bhow (?:was|is|did|has) (?:my |the )?(?:day|today)\b`,
      R`^what(?:'s| is| has been) (?:been )?(?:done|finished)\b`,
      R`\bwhat got done\b`,
      R`\bhow (?:did|has|have) (?:things|it|stuff|today|the day) (?:go|gone|been)\b`,
    ]),
    icon: 'circle-check',
    examples: ['what did I do today', 'how was my day', 'summarize today'],
    keywords: ['summary', 'done', 'accomplished', 'did', 'got done', 'so far'],
    label: () => "Today's summary",
    run: (_a, ctx) => {
      const today = isoOf(ctx.now);
      const r = dayReview(today);
      const fromBacklog = taskFile.value.tasks.filter((t) => t.date === null && t.doneAt && isoOf(t.doneAt) === today).length;
      const n = r.done.length;
      const open = r.open.filter((b) => b.endMs <= ctx.now && !b.floating).length;
      let say: string;
      if (n || fromBacklog) {
        say = `${n} done today${r.spentMs >= MINUTE ? ` · ${formatDuration(r.spentMs)} well spent` : ''}${fromBacklog ? `, plus ${fromBacklog} from your backlog` : ''}.`;
        if (open) say += ` ${open} still open — no rush.`;
      } else say = `Nothing ticked yet today${hourOf(ctx.now) < 12 ? ' — the day is young' : ''}. Rest counts too.`;
      return { say, card: { kind: 'summary', date: today } };
    },
  },
  {
    schema: schema('show_day', "Show the plan for one day: its blocks and times. For 'show tomorrow', 'what's on Friday', 'my schedule'.", { day: S('today, tomorrow, a weekday, or YYYY-MM-DD') }, [
      R`^(?:show|open|see|view|go to|display|check)(?: me)?(?: my| the)? (?:day|today|tomorrow|yesterday|schedule|agenda|calendar|plan|${DAYW}|next ${DAYW}|this ${DAYW})\b`,
      R`\bwhat(?:'s| is| do i have) (?:on|planned|happening|scheduled|coming up|going on)(?: for| on)? (?:today|tomorrow|tonight|yesterday|this (?:morning|afternoon|evening)|${DAYW}|next ${DAYW}|this ${DAYW})\b`,
      R`\bwhat does (?:my |the )?(?:day|today|tomorrow|${DAYW}) look like\b`,
      R`\b(?:my|the) (?:day|today|tomorrow|${DAYW}) looks? like\b`,
      R`^(?:my )?(?:schedule|agenda|day)(?: for| on)?(?: today| tomorrow| ${DAYW})?$`,
      R`\bwhat do i have (?:on |planned |going on )?(?:today|tomorrow|tonight|on ${DAYW}|${DAYW})\b`,
      R`^(?:today|tomorrow|yesterday|${DAYW})$`,
      R`\bwhat(?:'s| is) (?:on )?(?:my )?(?:schedule|agenda|calendar)\b`,
    ]),
    icon: 'calendar',
    examples: ['show tomorrow', "what's on friday", 'my schedule today'],
    keywords: ['schedule', 'agenda', 'day', 'today', 'tomorrow', 'calendar', 'look like', 'planned', 'tonight', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
    label: (a) => `Show ${dayWord(a.day)}`,
    run: (a, ctx) => {
      const today = isoOf(ctx.now);
      const date = a.day ?? today;
      const { timed, floating } = dayBlocksOf(date);
      const own = timed.filter((b) => b.date === date || b.startMs >= startOfDayMs(date));
      const n = own.length + floating.length;
      const word = dayWord(date, today);
      let say: string;
      if (!n) say = `Nothing planned ${dayPhrase(date, today)} yet — a fresh dial.`;
      else {
        const next = date === today ? own.find((b) => b.endMs > ctx.now && !b.done) : own[0];
        const lead = date === today ? 'next up' : 'first';
        say = `${cap(word)}: ${n} ${plural(n, 'block')}${next ? `, ${lead} ${next.title} at ${fmt(next.startMs)}` : date === today ? ', the rest is done' : ''}.`;
      }
      return { say, card: { kind: 'day', date } };
    },
  },
  // ── Creating (last: the broadest triggers) ──
  {
    schema: schema(
      'create_block',
      "Put a new block on the dial at a clock time or on a day, optionally repeating. For an activity said with a time, day or repeat: 'add gym at 5pm for 45 minutes', 'meds every day at 8am'. Not for timers.",
      {
        title: S('What the block is'),
        time: S('Start time, e.g. 5pm or 17:00'),
        day: S('Which day, e.g. tomorrow or friday'),
        minutes: N('Length in minutes'),
        repeat: S('How it repeats, e.g. daily, weekdays, every monday'),
      },
      [
        R`^(?:add|schedule|put|book|block(?: out| off)?|create|set up|pencil(?: in)?|plan in|slot(?: in)?|insert|new|pop|stick|squeeze(?: in)?|fit(?: in)?|remind me|i have|i've got|i need to|i have to|i gotta|gotta)\b`,
        R`\b(?:at|@) ?\d{1,2}(?::\d{2})? ?(?:am|pm)?\b`,
        R`\b\d{1,2}(?::\d{2})? ?(?:am|pm)\b`,
        R`\b\d{1,2}:\d{2}\b`,
        R`\bevery (?:day|morning|evening|night|week|weekday|other|\d+|${DAYW})`,
        R`\b(?:daily|weekly|weekdays|weekends)\b`,
        R`\b(?:tomorrow|tonight|this (?:morning|afternoon|evening))\b`,
      ],
      ['title'],
    ),
    icon: 'plus',
    examples: ['add gym at 5pm for 45 minutes', 'meds every day at 8am', 'dentist tomorrow at 10am'],
    keywords: ['add', 'schedule', 'new', 'block', 'book', 'appointment', 'meeting'],
    label: (a) => {
      const t = a.title ? quote(a.title) : 'a block';
      const when = a.time != null ? ` at ${fmtMin(a.time)}` : '';
      const day = a.day && a.day !== view.today ? ` ${dayPhrase(a.day)}` : a.time == null ? ' today' : '';
      return `Add ${t}${day}${when}`;
    },
    run: (a, ctx) => {
      if (a.later && a.time == null) return toolByName('add_to_backlog')!.run({ ...a, norm: true }, ctx);
      const today = isoOf(ctx.now);
      const minutes = clampDur(a.minutes ?? 30);
      const guessed = a.time == null && !a.anytime && !a.repeat;
      // No time said: the first free stretch that fits, on a later day if this one is full.
      const slot = guessed ? freeSlot(a.day ?? today, minutes, ctx.now) : null;
      const date = slot?.date ?? a.day ?? today;
      const start = a.anytime ? null : (a.time ?? slot?.start ?? firstFree(date, minutes, ctx.now));
      const title = (a.title ?? '').trim();
      const hint = suggest(title);
      const t = tasks.create({ title, date, start, duration: minutes, recurrence: a.repeat ?? null, icon: hint?.icon, category: hint?.category, alerts: [5] });
      const first = occurrencesBetween(t, date, addDays(date, 400))[0] ?? date;
      const key = blockKey(t.id, first);
      const name = title ? quote(title) : 'a block';
      let say: string;
      if (t.recurrence) say = `Added ${name} · ${describeRecurrence(t.recurrence, t.date).toLowerCase()}${start !== null ? ` at ${fmtMin(start)}` : ''}.`;
      else if (start === null) say = `Added ${name} ${dayPhrase(date, today)}, any time.`;
      else if (slot?.moved) say = `${cap(dayWord(a.day ?? today, today))} is full, so I put ${name} in the first free time ${dayPhrase(date, today)}, ${fmtMin(start)}–${fmtMin(start + minutes)}.`;
      else if (guessed) say = `Added ${name} in your next free time ${dayPhrase(date, today)}, ${fmtMin(start)}–${fmtMin(start + minutes)}.`;
      else say = `Added ${name} ${dayPhrase(date, today)}, ${fmtMin(start)}–${fmtMin(start + minutes)}.`;
      if (!title) say += ' Give it a name?';
      else if (!t.recurrence && date === today && start !== null && atMinutes(date, start + minutes) <= ctx.now) say += ' That time has already passed today.';
      return { say, card: { kind: 'block', key, verb: 'added' }, undo: () => tasks.remove(t.id) };
    },
  },
];

export const TOOL_SCHEMAS: ToolSchema[] = TOOLS.map((t) => t.schema);
const BY_NAME = new Map(TOOLS.map((t) => [t.schema.name, t]));

export function toolByName(name: string): ToolDef | undefined {
  return BY_NAME.get(name);
}

/** Run a tool by name with normalised arguments. */
export async function runTool(call: Call, ctx: Ctx): Promise<ToolResult> {
  const t = toolByName(call.tool);
  if (!t) return { say: "I can't do that yet.", card: { kind: 'help' } };
  const r = await t.run(call.args, ctx);
  // A bare "which one?" from target resolution: ask with the day in view.
  if (!r.say && r.card.kind === 'note') return { say: 'Which one do you mean?', card: { kind: 'day', date: isoOf(ctx.now) } };
  return r;
}
