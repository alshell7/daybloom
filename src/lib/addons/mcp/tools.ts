// MCP addon: the tools an AI app (Claude, Codex, Cursor, …) can use. Each one reads or changes
// your day through the app's own stores and helpers, so a change shows at once, syncs like any
// other edit and can be undone from the toast. Times go out and come in as 24-hour "HH:MM" in
// the app's time zone, days as "YYYY-MM-DD" (or "today", "tomorrow", "yesterday").

import { suggest } from '../../actions';
import { blockFor, dayBlocksOf, firstFree, placeOccurrence, removeTarget } from '../../assistant/tools';
import { backlog, itemsIn, openItems, PRIORITY_LABEL, type ListId } from '../../backlog';
import { blockKey, blocksInRange, freeGaps, parseBlockKey } from '../../engine/blocks';
import { CATEGORIES, CATEGORY_BY_ID } from '../../engine/categories';
import { describeRecurrence } from '../../engine/recurrence';
import { activeTimeZone, addDays, atMinutes, daysBetween, fromISODate, isoOf, MINUTE, minutesOfDay, startOfDayMs } from '../../engine/time';
import type { BacklogList, Block, CategoryId, ISODate, Recurrence, Task } from '../../engine/types';
import { computeInsights, highlights } from '../../insights';
import { rhythm } from '../../streaks';
import { settings } from '../../stores/settings.svelte';
import { taskFile, tasks, uid } from '../../stores/tasks.svelte';
import { view } from '../../stores/view.svelte';
import { isOn, type AddonId } from '../registry';
import { METHODS } from '../waqt/types';
import { waqt } from '../waqt/waqt.svelte';

/** A tool's input, as JSON Schema. */
type Schema = Record<string, unknown>;

export interface McpTool {
  name: string;
  title: string;
  description: string;
  inputSchema: Schema;
  /** Changes your plans: hidden and refused while AI apps may only read. */
  writes?: boolean;
  /** Removes something (undo is still offered). */
  destructive?: boolean;
  /** Only while this addon is on. */
  needs?: AddonId;
  /** Lucide-style icon id for the panel. */
  icon: string;
  /** For the activity list, after the app's name: "read your day". Changes say their own. */
  did?: string;
  run(args: any, ctx: RunCtx): unknown;
}

export interface RunCtx {
  now: number;
  /** Show a toast with an Undo, and note the change in the activity list. */
  changed(text: string, undo: () => void): void;
}

/** A refusal or a bad argument: goes back to the AI app as a tool error it can read. */
export class ToolError extends Error {}

// ── Small helpers ─────────────────────────────────────────────────────────────

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const dark = () => view.finish.dark;
const pad = (n: number) => String(n).padStart(2, '0');

/** Minutes after midnight → "HH:MM". */
export function hm(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}
const hmOf = (ms: number) => hm(minutesOfDay(ms));

/** "today" / "tomorrow" / "yesterday" / "YYYY-MM-DD" → ISO date. */
export function dayArg(v: unknown, today: ISODate, name = 'date'): ISODate {
  if (v === undefined || v === null || v === '') return today;
  const s = String(v).trim().toLowerCase();
  if (s === 'today') return today;
  if (s === 'tomorrow') return addDays(today, 1);
  if (s === 'yesterday') return addDays(today, -1);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(fromISODate(s).getTime())) return s;
  throw new ToolError(`${name} must be "YYYY-MM-DD", "today", "tomorrow" or "yesterday" (got "${v}").`);
}

/** "14:30", "9:05", "9am", "2:30 pm" → minutes after midnight. */
export function timeArg(v: unknown, name = 'start'): number {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(String(v ?? '').trim());
  if (m) {
    let h = Number(m[1]);
    const min = Number(m[2] ?? 0);
    const ap = m[3]?.toLowerCase();
    if (ap) h = (h % 12) + (ap === 'pm' ? 12 : 0);
    if (h <= 23 && min <= 59 && (m[2] !== undefined || ap)) return h * 60 + min;
  }
  throw new ToolError(`${name} must be a time like "14:30" (got "${v}").`);
}

function minutesArg(v: unknown, name = 'minutes'): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 5 || n > 24 * 60) throw new ToolError(`${name} must be a number of minutes from 5 to 1440.`);
  return Math.round(n);
}

function categoryArg(v: unknown): CategoryId {
  const s = String(v).toLowerCase();
  const c = CATEGORIES.find((c) => c.id === s || c.label.toLowerCase() === s);
  if (!c) throw new ToolError(`category must be one of: ${CATEGORIES.map((c) => c.id).join(', ')}.`);
  return c.id;
}

function text(v: unknown, name: string, max = 200): string {
  const s = String(v ?? '').trim();
  if (!s) throw new ToolError(`${name} must not be empty.`);
  return s.slice(0, max);
}

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const FREQ: Record<string, Recurrence['freq']> = { day: 'daily', daily: 'daily', week: 'weekly', weekly: 'weekly', month: 'monthly', monthly: 'monthly', year: 'yearly', yearly: 'yearly' };

function repeatArg(v: any, today: ISODate): Recurrence | null {
  if (!v) return null;
  const freq = FREQ[String(v.every ?? '').toLowerCase()];
  if (!freq) throw new ToolError('repeat.every must be "day", "week", "month" or "year".');
  const r: Recurrence = { freq, interval: Math.max(1, Math.min(52, Math.round(Number(v.interval) || 1))) };
  if (Array.isArray(v.weekdays) && v.weekdays.length) {
    const days = v.weekdays.map((d: unknown) => WEEKDAYS.indexOf(String(d).slice(0, 3).toLowerCase()));
    if (days.some((d: number) => d < 0)) throw new ToolError('repeat.weekdays takes names like "mon", "wed".');
    r.freq = 'weekly';
    r.byWeekday = [...new Set<number>(days)].sort();
  }
  if (v.until) r.until = dayArg(v.until, today, 'repeat.until');
  return r;
}

const TITLE_MAX = 120;

/** What the AI app sees of a block. */
export function blockOut(b: Block, withNotes = false) {
  const t = b.taskId ? tasks.get(b.taskId) : undefined;
  const out: Record<string, unknown> = {
    key: b.key,
    title: b.title,
    date: b.date,
  };
  if (b.floating) out.anytime = true;
  else {
    out.start = hmOf(b.startMs);
    out.end = hmOf(b.endMs);
    out.minutes = Math.round((b.endMs - b.startMs) / MINUTE);
    if (isoOf(b.endMs - 1) !== b.date) out.ends_next_day = true;
  }
  out.category = b.category;
  if (b.kind === 'task') {
    out.done = b.done;
    if (b.recurring && t) out.repeats = describeRecurrence(t.recurrence, t.date);
    if (withNotes && t?.notes) out.notes = t.notes.slice(0, 600);
    if (withNotes && t?.subtasks.length) out.steps = t.subtasks.map((s) => ({ title: s.title, done: s.done }));
  } else {
    out.source = b.event?.provider === 'salah' ? 'prayer' : 'calendar';
    if (b.event?.calendarName) out.calendar = b.event.calendarName;
    out.read_only = true;
  }
  return out;
}

function itemOut(t: Task) {
  const out: Record<string, unknown> = { id: t.id, title: t.title, list: t.doneAt ? 'done' : (t.list ?? 'inbox'), minutes: t.duration, category: t.category };
  if (t.priority) out.priority = PRIORITY_LABEL[t.priority].toLowerCase();
  if (t.due) out.due = t.due;
  if (t.energy) out.energy = ['low', 'medium', 'high'][t.energy - 1];
  if (t.notes) out.notes = t.notes.slice(0, 400);
  return out;
}

/** Free stretches on a day between two minutes-of-day, from now if it is today. */
function freeOn(date: ISODate, now: number, minMinutes: number, fromMin = settings.value.wake, toMin = settings.value.sleep) {
  const s = atMinutes(date, fromMin);
  let e = atMinutes(toMin <= fromMin ? addDays(date, 1) : date, toMin);
  const from = date === isoOf(now) ? Math.max(s, Math.ceil(now / (5 * MINUTE)) * 5 * MINUTE) : s;
  if (e <= from) return [];
  const busy = blocksInRange(taskFile.value.tasks, view.events, startOfDayMs(date), e, dark());
  return freeGaps(busy, from, e, minMinutes * MINUTE).map((g) => ({ start: hmOf(g.startMs), end: hmOf(g.endMs), minutes: Math.round((g.endMs - g.startMs) / MINUTE) }));
}

function taskOf(key: unknown): { task: Task; date: ISODate; key: string } {
  const k = String(key ?? '');
  if (k.startsWith('cal:')) throw new ToolError('That block comes from a calendar or an addon and is read-only here.');
  const p = parseBlockKey(k);
  const t = p && tasks.get(p.taskId);
  if (!p || !t) throw new ToolError(`No block with key "${k}". Use get_day or list_blocks to find keys.`);
  return { task: t, date: p.date, key: k };
}

/** Run a change to some tasks and return an undo that puts them (and only them) back. */
function undoable(ids: string[], fn: () => void): () => void {
  const before = new Map(ids.map((id) => [id, tasks.get(id) ? clone(tasks.get(id)!) : null]));
  const had = new Set(taskFile.value.tasks.map((t) => t.id));
  fn();
  const made = taskFile.value.tasks.filter((t) => !had.has(t.id)).map((t) => t.id);
  return () => {
    for (const id of made) tasks.remove(id);
    for (const [id, snap] of before) {
      if (!snap) continue;
      const list = taskFile.value.tasks;
      const i = list.findIndex((t) => t.id === id);
      if (i >= 0) list[i] = snap;
      else tasks.restore(snap);
    }
  };
}

function overlaps(date: ISODate, startMs: number, endMs: number, except: string) {
  return blocksInRange(taskFile.value.tasks, view.events, startOfDayMs(date), startOfDayMs(addDays(date, 1)), dark())
    .filter((b) => b.key !== except && b.startMs < endMs && b.endMs > startMs)
    .map((b) => `${b.title} (${hmOf(b.startMs)}–${hmOf(b.endMs)})`);
}

const quote = (s: string) => `“${s || 'Untitled'}”`;

// ── Schemas ───────────────────────────────────────────────────────────────────

const obj = (properties: Record<string, Schema>, required: string[] = []): Schema => ({ type: 'object', properties, required, additionalProperties: false });
const DATE: Schema = { type: 'string', description: '"YYYY-MM-DD", "today", "tomorrow" or "yesterday". Default: today.' };
const TIME: Schema = { type: 'string', description: '24-hour "HH:MM" in the app\'s time zone.' };
const CATEGORY: Schema = { type: 'string', enum: CATEGORIES.map((c) => c.id), description: `Kind of block (its colour): ${CATEGORIES.map((c) => `${c.id} = ${c.label}`).join(', ')}.` };
const KEY: Schema = { type: 'string', description: 'Block key from get_day or list_blocks, e.g. "task:abc123@2026-10-20".' };
const LIST: Schema = { type: 'string', enum: ['inbox', 'next', 'someday'] };

// ── The tools ─────────────────────────────────────────────────────────────────

export const MCP_TOOLS: McpTool[] = [
  {
    name: 'get_day',
    did: 'read your day',
    title: 'Read a day',
    icon: 'dial',
    description:
      'The plan for one day: timed blocks in order (tasks, calendar events, prayers), anytime tasks, what is happening now, and the free time left between waking and sleeping hours. Start here before planning.',
    inputSchema: obj({ date: DATE }),
    run(a, { now }) {
      const today = isoOf(now);
      const date = dayArg(a.date, today);
      const { timed, floating } = dayBlocksOf(date);
      const own = timed.filter((b) => b.date === date || b.startMs >= startOfDayMs(date));
      const tasksOnly = [...own, ...floating].filter((b) => b.kind === 'task');
      const out: Record<string, unknown> = {
        date,
        weekday: fromISODate(date).toLocaleDateString('en', { weekday: 'long' }),
        time_zone: activeTimeZone(),
        waking_hours: { from: hm(settings.value.wake), to: hm(settings.value.sleep) },
      };
      if (date === today) {
        out.now = hmOf(now);
        const cur = own.find((b) => b.startMs <= now && now < b.endMs);
        if (cur) out.current = cur.key;
      }
      out.blocks = own.map((b) => blockOut(b, true));
      out.anytime = floating.map((b) => blockOut(b, true));
      out.free = freeOn(date, now, 15);
      out.summary = {
        tasks: tasksOnly.length,
        done: tasksOnly.filter((b) => b.done).length,
        planned_minutes: own.filter((b) => b.kind === 'task').reduce((s, b) => s + Math.round((b.endMs - b.startMs) / MINUTE), 0),
      };
      return out;
    },
  },
  {
    name: 'list_blocks',
    did: 'looked through your blocks',
    title: 'List blocks over days',
    icon: 'calendar',
    description: 'Blocks across a range of days (up to 62), oldest first. Filter by words in the title, by category or by done state. Good for reviews ("what did I do this week?") and for finding a block\'s key.',
    inputSchema: obj({
      from: DATE,
      to: { type: 'string', description: 'Last day, inclusive. Default: the same as from.' },
      query: { type: 'string', description: 'Only blocks whose title contains these words.' },
      category: CATEGORY,
      done: { type: 'boolean', description: 'Only finished (true) or unfinished (false) tasks.' },
      include_calendar: { type: 'boolean', description: 'Include calendar events and prayers. Default true.' },
    }),
    run(a, { now }) {
      const today = isoOf(now);
      const from = dayArg(a.from, today, 'from');
      const to = a.to ? dayArg(a.to, today, 'to') : from;
      const span = daysBetween(from, to);
      if (span < 0) throw new ToolError('to must not be before from.');
      if (span > 61) throw new ToolError('Ask for 62 days or fewer at a time.');
      const words = String(a.query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
      const out: ReturnType<typeof blockOut>[] = [];
      for (let i = 0; i <= span; i++) {
        const d = addDays(from, i);
        const { timed, floating } = dayBlocksOf(d);
        for (const b of [...timed.filter((b) => b.date === d || b.startMs >= startOfDayMs(d)), ...floating]) {
          if (b.kind === 'event' && a.include_calendar === false) continue;
          if (a.category && b.category !== categoryArg(a.category)) continue;
          if (typeof a.done === 'boolean' && (b.kind !== 'task' || b.done !== a.done)) continue;
          if (words.length && !words.every((w) => b.title.toLowerCase().includes(w))) continue;
          if (!out.some((o) => o.key === b.key)) out.push(blockOut(b));
        }
      }
      const total = out.length;
      return { from, to, count: total, blocks: out.slice(0, 400), ...(total > 400 ? { note: 'Only the first 400 are listed; narrow the range.' } : {}) };
    },
  },
  {
    name: 'find_free_time',
    did: 'looked for free time',
    title: 'Find free time',
    icon: 'clock',
    description: 'Free stretches on a day that are at least `minutes` long, between waking and sleeping hours (or between `after` and `before`). On today it starts from now.',
    inputSchema: obj({ date: DATE, minutes: { type: 'number', description: 'Shortest stretch to list. Default 15.' }, after: TIME, before: TIME }),
    run(a, { now }) {
      const date = dayArg(a.date, isoOf(now));
      const min = a.minutes === undefined ? 15 : minutesArg(a.minutes);
      const from = a.after ? timeArg(a.after, 'after') : settings.value.wake;
      const to = a.before ? timeArg(a.before, 'before') : settings.value.sleep;
      const free = freeOn(date, now, min, from, to);
      return { date, free, total_minutes: free.reduce((s, g) => s + g.minutes, 0) };
    },
  },
  {
    name: 'list_backlog',
    did: 'read your backlog',
    title: 'Read the backlog',
    icon: 'inbox',
    description: 'Tasks that have no day yet: inbox (new), next (soon) and someday. Each has an id, a length, and maybe a priority (must/should/could), a due date and an energy level.',
    inputSchema: obj({ list: { type: 'string', enum: ['inbox', 'next', 'someday', 'done', 'open'], description: 'Default: open (all three lists).' }, query: { type: 'string' } }),
    run(a) {
      const which = (a.list ?? 'open') as ListId | 'open';
      const all = taskFile.value.tasks;
      let items = which === 'open' ? openItems(all) : itemsIn(all, which);
      const words = String(a.query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
      if (words.length) items = items.filter((t) => words.every((w) => t.title.toLowerCase().includes(w)));
      return { list: which, count: items.length, items: items.slice(0, 300).map(itemOut) };
    },
  },
  {
    name: 'get_settings',
    did: 'read your settings',
    title: 'Read settings',
    icon: 'settings',
    description: 'How the planner is set up: time zone, waking hours, clock style, theme, focus lengths, reminders, the categories (block colours) and which addons are on. Never includes keys or secrets.',
    inputSchema: obj({}),
    run() {
      const s = settings.value;
      return {
        time_zone: activeTimeZone(),
        waking_hours: { from: hm(s.wake), to: hm(s.sleep) },
        clock: s.clock,
        theme: s.theme,
        motion: s.motion,
        sound: s.sound,
        notifications: s.notify,
        heads_up_minutes: s.headsUp,
        focus: { minutes: s.focus.minutes, presets: s.focus.presets, rhythm: s.focus.rhythm, cycles: s.cycles },
        nudges: { check_in: s.nudges.checkIn, overrun: s.nudges.overrun, time_anchors: s.nudges.anchors, gap_ideas: s.nudges.gapIdeas },
        categories: CATEGORIES.map((c) => ({ id: c.id, name: c.label })),
        addons_on: Object.keys(s.addons).filter((k) => s.addons[k]),
      };
    },
  },
  {
    name: 'get_insights',
    did: 'read your insights',
    title: 'Read insights',
    icon: 'chart-column',
    description: 'How the last 7 or 28 days went: blocks finished, plans kept, time by category, the best hour, the daily rhythm (streak), and short highlights in plain words, with the period before for comparison.',
    inputSchema: obj({ days: { type: 'number', enum: [7, 28], description: 'Default 7.' } }),
    run(a, { now }) {
      const span = Number(a.days) === 28 ? 28 : 7;
      const all = taskFile.value.tasks;
      const s = computeInsights(all, now, span);
      const r = rhythm(all, now);
      const mins = (ms: number) => Math.round(ms / MINUTE);
      const cats = Object.fromEntries(Object.entries(s.spent).filter(([, ms]) => ms > 0).map(([k, ms]) => [k, mins(ms)]));
      return {
        from: s.from,
        to: s.to,
        finished: s.finished,
        planned: s.planned,
        kept: s.kept,
        backlog_done: s.backlogDone,
        minutes_by_category: cats,
        minutes_total: mins(s.spentTotal),
        best_hour: s.bestHour === null ? null : hm(s.bestHour * 60),
        best_part_of_day: s.bestPart?.id ?? null,
        active_days: s.activeDays,
        rhythm: { current_days: r.current, best_days: r.best },
        highlights: highlights(s, { hour12: false }).map((h) => h.text),
        previous: { from: s.previous.from, to: s.previous.to, finished: s.previous.finished, kept: s.previous.kept, planned: s.previous.planned },
      };
    },
  },
  {
    name: 'get_prayer_times',
    did: 'read the salah times',
    title: 'Read salah times',
    icon: 'moon',
    needs: 'waqt',
    description: 'The five salah times for a day from the Waqt addon: adhan, jamaat (when set) and when each prayer\'s time ends, sunrise, the Hijri date, the next prayer, and which ones are marked as prayed. Plan around these.',
    inputSchema: obj({ date: DATE }),
    run(a, { now }) {
      if (!waqt.ready) throw new ToolError('Waqt has no place set yet. The person can choose one in the Waqt addon.');
      const date = dayArg(a.date, isoOf(now));
      const d = waqt.day(date);
      if (!d) throw new ToolError('No salah times for that day.');
      const marks = waqt.marks(date);
      const next = waqt.next(now);
      const h = waqt.hijri(startOfDayMs(date) + 12 * 60 * MINUTE);
      const s = waqt.settings;
      return {
        date,
        place: s.place ? [s.place.name, s.place.country].filter(Boolean).join(', ') : null,
        method: METHODS.find((m) => m.id === s.method)?.label ?? s.method,
        hijri: h ? `${h.day} ${h.name} ${h.year}` : null,
        sunrise: hmOf(d.sunrise),
        prayers: d.prayers.map((p) => ({
          name: p.name,
          adhan: hmOf(p.at),
          ...(p.jamaat ? { jamaat: hmOf(p.jamaat) } : {}),
          ends: hmOf(p.end),
          ...(marks[p.id] ? { marked: waqt.howOf(date, p.id) === 'late' ? 'late' : waqt.howOf(date, p.id) === 'jamaat' ? 'jamaat' : 'on time', ...(waqt.detailOf(date, p.id).qasr ? { qasr: true } : {}) } : {}),
        })),
        ...(next ? { next: { name: next.name, date: isoOf(next.at), adhan: hmOf(next.at) } } : {}),
      };
    },
  },

  // ── Changes ──
  {
    name: 'create_block',
    title: 'Add a block',
    icon: 'plus',
    writes: true,
    description:
      'Add a task to a day. Without `start` it goes into the first free stretch that fits (from now on today); use start "anytime" for a task with no set time. Category and icon are guessed from the title when left out. Returns the new block and anything it overlaps.',
    inputSchema: obj(
      {
        title: { type: 'string', description: 'Short, plain title, e.g. "Write the report".' },
        date: DATE,
        start: { type: 'string', description: '"HH:MM" (24-hour), or "anytime". Default: first free time.' },
        minutes: { type: 'number', description: 'Length, 5–1440. Default 30.' },
        category: CATEGORY,
        notes: { type: 'string' },
        steps: { type: 'array', items: { type: 'string' }, description: 'Small steps (a checklist inside the block).' },
        repeat: {
          type: 'object',
          properties: {
            every: { type: 'string', enum: ['day', 'week', 'month', 'year'] },
            interval: { type: 'number', description: 'Every N days/weeks/…; default 1.' },
            weekdays: { type: 'array', items: { type: 'string', enum: WEEKDAYS } },
            until: { type: 'string', description: 'Last day, "YYYY-MM-DD".' },
          },
          required: ['every'],
          additionalProperties: false,
        },
      },
      ['title'],
    ),
    run(a, { now, changed }) {
      const today = isoOf(now);
      const title = text(a.title, 'title', TITLE_MAX);
      const date = dayArg(a.date, today);
      const minutes = a.minutes === undefined ? 30 : minutesArg(a.minutes);
      const anytime = String(a.start ?? '').toLowerCase() === 'anytime';
      const start = anytime ? null : a.start ? timeArg(a.start) : firstFree(date, minutes, now);
      const guess = suggest(title);
      const category = a.category ? categoryArg(a.category) : (guess?.category ?? 'focus');
      const icon = guess && guess.category === category ? guess.icon : CATEGORY_BY_ID[category].icon;
      let t!: Task;
      const undo = undoable([], () => {
        t = tasks.create({
          title,
          date,
          start,
          duration: minutes,
          category,
          icon,
          notes: a.notes ? String(a.notes).slice(0, 4000) : '',
          subtasks: Array.isArray(a.steps) ? a.steps.slice(0, 20).map((s: unknown) => ({ id: uid(), title: String(s).slice(0, TITLE_MAX), done: false })) : [],
          recurrence: repeatArg(a.repeat, today),
          alerts: [5],
        });
      });
      const key = blockKey(t.id, date);
      const b = blockFor(key);
      changed(`added ${quote(title)}${start === null ? '' : ` at ${hm(start)}`}`, undo);
      const clash = b && !b.floating ? overlaps(date, b.startMs, b.endMs, key) : [];
      return { created: b ? blockOut(b, true) : { key }, ...(clash.length ? { overlaps: clash } : {}) };
    },
  },
  {
    name: 'update_block',
    title: 'Change a block',
    icon: 'pen',
    writes: true,
    description:
      'Move, resize or rename one block. For a repeating block, time, length and title change only this day (set all_repeats to rename the whole series); category and notes always apply to the whole series. Moving a repeat to another day makes a one-off copy there.',
    inputSchema: obj(
      { key: KEY, date: DATE, start: { type: 'string', description: '"HH:MM", or "anytime".' }, minutes: { type: 'number' }, title: { type: 'string' }, category: CATEGORY, notes: { type: 'string' }, all_repeats: { type: 'boolean' } },
      ['key'],
    ),
    run(a, { now, changed }) {
      let { task: t, date, key } = taskOf(a.key);
      const before = blockFor(key);
      // Read every argument first, so a bad one changes nothing.
      const moving = a.date !== undefined || a.start !== undefined;
      const newDate = a.date !== undefined ? dayArg(a.date, isoOf(now)) : date;
      const anytime = String(a.start ?? '').toLowerCase() === 'anytime';
      const start = anytime ? null : a.start !== undefined ? timeArg(a.start) : before && !before.floating ? Math.round(minutesOfDay(before.startMs)) : null;
      const minutes = a.minutes !== undefined ? minutesArg(a.minutes) : null;
      const title = a.title !== undefined ? text(a.title, 'title', TITLE_MAX) : null;
      const category = a.category !== undefined ? categoryArg(a.category) : null;
      const undo = undoable([t.id], () => {
        if (moving) {
          const placed = placeOccurrence(key, newDate, start);
          if (placed) {
            key = placed.key;
            date = newDate;
            t = tasks.get(parseBlockKey(key)!.taskId)!;
          }
        }
        if (minutes !== null) tasks.editOccurrence(t.id, date, { duration: minutes });
        if (title !== null) {
          if (t.recurrence && !a.all_repeats) tasks.editOccurrence(t.id, date, { title });
          else tasks.update(t.id, { title });
        }
        const patch: Partial<Task> = {};
        if (category) {
          const guess = suggest(t.title);
          patch.category = category;
          patch.icon = guess?.category === category ? guess.icon : CATEGORY_BY_ID[category].icon;
        }
        if (a.notes !== undefined) patch.notes = String(a.notes).slice(0, 4000);
        if (Object.keys(patch).length) tasks.update(t.id, patch);
      });
      const b = blockFor(key);
      changed(`changed ${quote(b?.title ?? t.title)}`, undo);
      const clash = b && !b.floating ? overlaps(date, b.startMs, b.endMs, key) : [];
      return { updated: b ? blockOut(b, true) : { key }, ...(clash.length ? { overlaps: clash } : {}) };
    },
  },
  {
    name: 'complete_block',
    title: 'Finish a block',
    icon: 'check',
    writes: true,
    description: 'Mark a block done (or not done with done: false). Also takes a backlog item id.',
    inputSchema: obj({ key: { type: 'string', description: 'Block key, or a backlog item id.' }, done: { type: 'boolean', description: 'Default true.' } }, ['key']),
    run(a, { now, changed }) {
      const want = a.done !== false;
      const k = String(a.key ?? '');
      if (!parseBlockKey(k) && !k.startsWith('cal:')) {
        const t = tasks.get(k);
        if (!t || t.date) throw new ToolError(`No block or backlog item "${k}". Use get_day, list_blocks or list_backlog.`);
        if (!!t.doneAt === want) return { id: t.id, done: want, unchanged: true };
        const undo = undoable([t.id], () => (want ? backlog.complete(t.id, now) : backlog.restore(t.id)));
        changed(`${want ? 'finished' : 'reopened'} ${quote(t.title)}`, undo);
        return { id: t.id, done: want };
      }
      const { task: t, date, key } = taskOf(k);
      if (t.completions.includes(date) === want) return { key, done: want, unchanged: true };
      const undo = undoable([t.id], () => tasks.toggleDone(t.id, date, now));
      changed(`${want ? 'finished' : 'reopened'} ${quote(blockFor(key)?.title ?? t.title)}`, undo);
      return { key, done: want };
    },
  },
  {
    name: 'delete_block',
    title: 'Remove a block',
    icon: 'trash',
    writes: true,
    destructive: true,
    description: 'Remove a block. For a repeating block only this day is skipped, unless all_repeats is true. Also takes a backlog item id. The person can undo it from the app for a few seconds.',
    inputSchema: obj({ key: { type: 'string', description: 'Block key, or a backlog item id.' }, all_repeats: { type: 'boolean' } }, ['key']),
    run(a, { changed }) {
      const k = String(a.key ?? '');
      const p = parseBlockKey(k);
      if (p || k.startsWith('cal:')) taskOf(k);
      const t = tasks.get(p ? p.taskId : k);
      if (!t) throw new ToolError(`Nothing with key or id "${k}".`);
      const title = (p && blockFor(k)?.title) || t.title;
      const undo = removeTarget(k, a.all_repeats === true);
      if (!undo) throw new ToolError(`Nothing with key or id "${k}".`);
      changed(`removed ${quote(title)}`, undo);
      return { removed: k, ...(p && t.recurrence && !a.all_repeats ? { only: p.date } : {}) };
    },
  },
  {
    name: 'add_to_backlog',
    title: 'Add to the backlog',
    icon: 'inbox',
    writes: true,
    description: 'Put tasks in the backlog (no day yet). Titles may carry plain hints the app understands, like "30m", "!" for must, or "by Friday".',
    inputSchema: obj(
      {
        items: {
          type: 'array',
          minItems: 1,
          maxItems: 50,
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              minutes: { type: 'number' },
              priority: { type: 'string', enum: ['must', 'should', 'could'] },
              due: { type: 'string', description: '"YYYY-MM-DD".' },
              notes: { type: 'string' },
              category: CATEGORY,
            },
            required: ['title'],
            additionalProperties: false,
          },
        },
        list: { ...LIST, description: 'Default: inbox.' },
      },
      ['items'],
    ),
    run(a, { now, changed }) {
      if (!Array.isArray(a.items) || !a.items.length) throw new ToolError('items must list at least one task.');
      const list: BacklogList = ['inbox', 'next', 'someday'].includes(a.list) ? a.list : 'inbox';
      // Check every item first, so a bad one changes nothing.
      const wanted = a.items.slice(0, 50).map((it: any) => {
        const title = text(typeof it === 'string' ? it : it?.title, 'title', TITLE_MAX).replace(/\s*\n\s*/g, ' ');
        const patch: Partial<Task> = {};
        if (it?.minutes !== undefined) patch.duration = minutesArg(it.minutes);
        if (it?.priority) patch.priority = ({ must: 1, should: 2, could: 3 } as const)[String(it.priority) as 'must'] ?? null;
        if (it?.due) patch.due = dayArg(it.due, isoOf(now), 'due');
        if (it?.notes) patch.notes = String(it.notes).slice(0, 4000);
        if (it?.category) patch.category = categoryArg(it.category);
        return { title, patch };
      });
      const made: Task[] = [];
      const undo = undoable([], () => {
        for (const { title, patch } of wanted) {
          const [t] = backlog.capture(title, list, now);
          if (!t) continue;
          if (Object.keys(patch).length) tasks.update(t.id, patch);
          made.push(t);
        }
      });
      changed(made.length === 1 ? `put ${quote(made[0].title)} in the backlog` : `put ${made.length} tasks in the backlog`, undo);
      return { added: made.map((t) => itemOut(tasks.get(t.id) ?? t)) };
    },
  },
  {
    name: 'schedule_backlog_item',
    title: 'Plan a backlog task',
    icon: 'calendar-plus',
    writes: true,
    description: 'Give a backlog task a day and a time. Without `start` it goes into the first free stretch that fits its length.',
    inputSchema: obj({ id: { type: 'string', description: 'Backlog item id from list_backlog.' }, date: DATE, start: TIME }, ['id']),
    run(a, { now, changed }) {
      const t = tasks.get(String(a.id ?? ''));
      if (!t || t.date) throw new ToolError(`No backlog item with id "${a.id}". Use list_backlog.`);
      const date = dayArg(a.date, isoOf(now));
      const start = a.start ? timeArg(a.start) : firstFree(date, t.duration, now);
      const undo = undoable([t.id], () => tasks.update(t.id, { date, start, doneAt: null }));
      changed(`planned ${quote(t.title)} at ${hm(start)}`, undo);
      const key = blockKey(t.id, date);
      const b = blockFor(key);
      const clash = b ? overlaps(date, b.startMs, b.endMs, key) : [];
      return { scheduled: b ? blockOut(b) : { key }, ...(clash.length ? { overlaps: clash } : {}) };
    },
  },
  {
    name: 'update_settings',
    title: 'Change settings',
    icon: 'sliders',
    writes: true,
    description: 'Change a few everyday settings: waking hours, clock style, theme, motion, sounds, the heads-up before a block ends, and the default focus length.',
    inputSchema: obj({
      wake: TIME,
      sleep: TIME,
      clock: { type: 'string', enum: ['auto', '12', '24'] },
      theme: { type: 'string', enum: ['system', 'light', 'dark'] },
      motion: { type: 'string', enum: ['system', 'full', 'calm'] },
      sound: { type: 'boolean' },
      heads_up_minutes: { type: 'number', description: '0 (off) to 30.' },
      focus_minutes: { type: 'number', description: '5 to 180.' },
    }),
    run(a, { changed }) {
      const s = settings.value;
      const prev = clone({ wake: s.wake, sleep: s.sleep, clock: s.clock, theme: s.theme, motion: s.motion, sound: s.sound, headsUp: s.headsUp, focus: s.focus });
      const next: Partial<typeof prev> = {};
      if (a.wake !== undefined) next.wake = timeArg(a.wake, 'wake');
      if (a.sleep !== undefined) next.sleep = timeArg(a.sleep, 'sleep');
      const pick = <T extends string>(v: unknown, ok: readonly T[], name: string): T => {
        if (!ok.includes(v as T)) throw new ToolError(`${name} must be one of: ${ok.join(', ')}.`);
        return v as T;
      };
      if (a.clock !== undefined) next.clock = pick(String(a.clock), ['auto', '12', '24'] as const, 'clock');
      if (a.theme !== undefined) next.theme = pick(a.theme, ['system', 'light', 'dark'] as const, 'theme');
      if (a.motion !== undefined) next.motion = pick(a.motion, ['system', 'full', 'calm'] as const, 'motion');
      if (a.sound !== undefined) next.sound = a.sound === true;
      if (a.heads_up_minutes !== undefined) {
        const n = Number(a.heads_up_minutes);
        if (!Number.isFinite(n) || n < 0 || n > 30) throw new ToolError('heads_up_minutes must be 0 to 30.');
        next.headsUp = Math.round(n);
      }
      if (a.focus_minutes !== undefined) {
        const n = Number(a.focus_minutes);
        if (!Number.isFinite(n) || n < 5 || n > 180) throw new ToolError('focus_minutes must be 5 to 180.');
        next.focus = { ...s.focus, minutes: Math.round(n) };
      }
      const names = Object.keys(next);
      if (!names.length) throw new ToolError('Nothing to change.');
      Object.assign(settings.value, next);
      changed(`changed ${names.length === 1 ? 'a setting' : `${names.length} settings`}`, () => Object.assign(settings.value, prev));
      return { changed: names };
    },
  },
];

/** The tools to offer right now. */
export function availableTools(canWrite: boolean): McpTool[] {
  return MCP_TOOLS.filter((t) => (canWrite || !t.writes) && (!t.needs || isOn(t.needs)));
}

/** The MCP shape of a tool (tools/list). */
export function wireTool(t: McpTool) {
  return {
    name: t.name,
    title: t.title,
    description: t.description,
    inputSchema: t.inputSchema,
    annotations: { title: t.title, readOnlyHint: !t.writes, destructiveHint: !!t.destructive, idempotentHint: !t.writes, openWorldHint: false },
  };
}

/** Run one tool call; errors come back as a readable tool result, as MCP asks. */
export function callTool(tools: McpTool[], name: string, args: unknown, ctx: RunCtx): { content: { type: 'text'; text: string }[]; isError?: boolean } {
  const tool = tools.find((t) => t.name === name);
  try {
    if (!tool) throw new ToolError(MCP_TOOLS.some((t) => t.name === name && t.writes) ? 'Daybloom is set to read-only for AI apps. The person can allow changes in the MCP addon.' : `Unknown tool "${name}".`);
    const out = tool.run(args && typeof args === 'object' ? args : {}, ctx);
    return { content: [{ type: 'text', text: JSON.stringify(out) }] };
  } catch (e) {
    const msg = e instanceof ToolError ? e.message : `Something went wrong: ${e instanceof Error ? e.message : String(e)}`;
    return { content: [{ type: 'text', text: msg }], isError: true };
  }
}
