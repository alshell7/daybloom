// Timeline views (addon), the live side. Which view the timeline shows (List, Board or Gantt)
// lives in the addon's own small file, per computer like the rail's width. Board drops and Gantt
// drags turn into the same actions the rail and the dial use (adjust, toggleDone, toBacklog,
// backlog.schedule, placeOccurrence), so recurring blocks, undo and celebrations match everywhere.

import { adjust, createFromRange, toBacklog, toggleDone } from '../../actions';
import { firstFree, placeOccurrence } from '../../assistant/tools';
import { backlog } from '../../backlog';
import { busyBetween } from '../../busy';
import { blockKey } from '../../engine/blocks';
import { CATEGORY_BY_ID, categoryColor } from '../../engine/categories';
import { addDays, atMinutes, formatDayShort, formatTime, MINUTE } from '../../engine/time';
import type { CategoryId, ISODate, Task } from '../../engine/types';
import { sounds } from '../../sound';
import { clock } from '../../stores/clock.svelte';
import { railDrag } from '../../stores/layout.svelte';
import { persisted } from '../../stores/persisted.svelte';
import { taskFile, tasks } from '../../stores/tasks.svelte';
import { view } from '../../stores/view.svelte';
import { isOn } from '../registry';
import type { Drop } from './board';
import { clampPxh, DAY_MIN } from './gantt';

export type TimelineMode = 'list' | 'board' | 'gantt';
export type BoardGroup = 'day' | 'week';
export type GanttDays = 1 | 3 | 7;

export interface ViewsFile {
  version: 1;
  mode: TimelineMode;
  board: { group: BoardGroup };
  /** `pxh`: px per hour; 0 = fit the waking day to the width. */
  gantt: { days: GanttDays; pxh: number };
}

export function migrateViews(raw: any): ViewsFile {
  const mode = raw?.mode === 'board' || raw?.mode === 'gantt' ? raw.mode : 'list';
  const days = raw?.gantt?.days === 3 || raw?.gantt?.days === 7 ? raw.gantt.days : 1;
  const pxh = Number(raw?.gantt?.pxh);
  return {
    version: 1,
    mode,
    board: { group: raw?.board?.group === 'week' ? 'week' : 'day' },
    gantt: { days, pxh: Number.isFinite(pxh) && pxh > 0 ? clampPxh(pxh) : 0 },
  };
}

export const viewsFile = persisted<ViewsFile>('addon-views', migrateViews(null), migrateViews);

/** What the timeline shows: always the list while the addon is off. */
export function timelineMode(): TimelineMode {
  return isOn('views') && viewsFile.ready ? viewsFile.value.mode : 'list';
}

/** Board and Gantt need width: the stage gives the timeline most of it (MainView). */
export function timelineWide(): boolean {
  return timelineMode() !== 'list';
}

let glideTimer: ReturnType<typeof setTimeout> | undefined;
/** The stage's columns glide to their new widths (the rail's own settle transition). */
function glide() {
  clearTimeout(glideTimer);
  if (view.reducedMotion) return;
  railDrag.settling = true;
  glideTimer = setTimeout(() => (railDrag.settling = false), 460);
}

export function setMode(m: TimelineMode) {
  if (viewsFile.value.mode === m) return;
  const wide = m !== 'list';
  const was = viewsFile.value.mode !== 'list';
  viewsFile.value.mode = m;
  if (wide !== was) glide();
}

/** Between the toolbar and the Gantt chart: `jump` asks it to scroll to now; `pxh` is its scale now. */
export const ganttCmd = $state({ jump: 0, pxh: 0 });

// ── Free time ─────────────────────────────────────────────────────────────────

/**
 * The first free start (minutes) on `date` that fits, or null when nothing does. firstFree
 * already keeps calendar events and salah busy; when a day is full it falls back to the
 * earliest time, which this turns into "no room" rather than land on top of something.
 */
export function fitFree(date: ISODate, minutes: number, key: string | null): number | null {
  const start = firstFree(date, minutes, clock.now);
  if (start + minutes > DAY_MIN) return null;
  const s = atMinutes(date, start);
  const e = s + minutes * MINUTE;
  const slack = 4 * MINUTE;
  const clash = busyBetween(s, e, { except: key ?? undefined, land: false }).some((b) => !b.floating && b.startMs < e - slack && b.endMs > s + slack);
  return clash ? null : start;
}

/** Is `start`–`start + minutes` on `date` still ahead and clear of everything else (calendar and salah too)? */
export function spanFree(date: ISODate, start: number, minutes: number, key: string | null): boolean {
  const s = atMinutes(date, start);
  const e = s + minutes * MINUTE;
  if (s < clock.now) return false;
  return !busyBetween(s, e, { except: key ?? undefined }).some((b) => !b.floating && b.startMs < e && b.endMs > s);
}

// ── Running a drop ────────────────────────────────────────────────────────────

/** Put a task back exactly as it was (undo). */
function keep(id: string): () => void {
  const t = tasks.get(id);
  if (!t) return () => {};
  const snap: Task = JSON.parse(JSON.stringify(t));
  return () => {
    const list = taskFile.value.tasks;
    const i = list.findIndex((x) => x.id === id);
    if (i >= 0) list[i] = snap;
    else tasks.restore(snap);
  };
}

const dayWord = (d: ISODate) => (d === view.today ? 'today' : d === addDays(view.today, 1) ? 'tomorrow' : (({ dow, day }) => `${dow} ${day}`)(formatDayShort(d)));
const taskOf = (key: string) => view.taskForKey(key)?.task ?? null;

/** Run a board drop. Returns the id the card has afterwards (to keep keyboard focus on it). */
export function applyDrop(d: Drop, origin?: { x: number; y: number }): string | null {
  switch (d.kind) {
    case 'schedule': {
      if (d.reopen) tasks.update(d.taskId, { doneAt: null });
      backlog.schedule(d.taskId, d.date, d.start, d.now);
      if (d.now) sounds.begin();
      return blockKey(d.taskId, d.date);
    }
    case 'move': {
      const t = taskOf(d.key);
      if (!t) return null;
      if (d.sameDay && d.start !== null) {
        const undo = keep(t.id);
        const s = atMinutes(d.date, d.start);
        adjust(d.key, s, s + d.minutes * MINUTE);
        sounds.tick();
        view.say(`Moved to ${formatTime(s, view.hour12)}`, { label: 'Undo', run: undo });
        return d.key;
      }
      const placed = placeOccurrence(d.key, d.date, d.start);
      if (!placed) return null;
      sounds.tick();
      const when = d.start === null ? 'anytime' : `at ${formatTime(atMinutes(d.date, d.start), view.hour12)}`;
      view.say(`“${t.title || 'Block'}” moved to ${dayWord(d.date)} ${when}`, { label: 'Undo', run: placed.undo });
      if (view.selected === d.key) view.selected = placed.key;
      return placed.key;
    }
    case 'start': {
      const s = atMinutes(view.today, d.start);
      adjust(d.key, s, s + d.minutes * MINUTE);
      sounds.begin();
      return d.key;
    }
    case 'unschedule': {
      const t = taskOf(d.key);
      const b = view.blockByKey(d.key);
      const was = t && b ? (t.overrides[b.date]?.duration ?? t.duration) : 30;
      toBacklog(d.key);
      // toBacklog measures the block's span, and an anytime block has none: keep its length.
      if (t && b?.floating && !t.recurrence && t.duration < 5) tasks.update(t.id, { duration: Math.max(5, was) });
      return t ? `later:${t.id}` : null;
    }
    case 'tick':
    case 'untick':
      toggleDone(d.key, d.kind === 'tick' ? origin : undefined);
      return d.key;
    case 'finish': {
      const t = tasks.get(d.taskId);
      backlog.complete(d.taskId);
      sounds.done();
      if (origin && t) view.spark(origin.x, origin.y, categoryColor(t.category, view.finish.dark), false, 'Done');
      return `later:${d.taskId}`;
    }
    case 'restore':
      backlog.restore(d.taskId);
      return `later:${d.taskId}`;
    case 'reorder':
      d.ids.forEach((id, i) => {
        const t = tasks.get(id.replace(/^later:/, ''));
        if (t && t.order !== i) t.order = i;
      });
      return null;
    case 'none':
      return null;
  }
}

// ── Gantt edits ───────────────────────────────────────────────────────────────

/**
 * A bar dragged to `date`, `s`–`e` (wall-clock minutes). Like a rail drag (adjust); a repeating
 * block dragged onto another day becomes a one-off there, like "move to tomorrow".
 */
export function moveBar(key: string, date: ISODate, s: number, e: number): string {
  const hit = view.taskForKey(key);
  if (!hit) return key;
  const { task: t, date: from } = hit;
  if (date !== from && t.recurrence) {
    const placed = placeOccurrence(key, date, s);
    if (!placed) return key;
    view.say(`“${t.title || 'Block'}” moved to ${dayWord(date)}`, { label: 'Undo', run: placed.undo });
    if (view.selected === key) view.selected = placed.key;
    return placed.key;
  }
  const undo = date !== from ? keep(t.id) : null;
  adjust(key, atMinutes(date, s), atMinutes(date, e));
  if (undo) view.say(`“${t.title || 'Block'}” moved to ${dayWord(date)}`, { label: 'Undo', run: undo });
  return blockKey(t.id, date);
}

/** A block painted across empty hours; painted in a kind's row, it takes that kind. */
export function paintBar(startMs: number, endMs: number, category: CategoryId | null) {
  const t = createFromRange(startMs, endMs);
  if (category && category !== t.category) tasks.update(t.id, { category, icon: CATEGORY_BY_ID[category].icon });
  return t;
}
