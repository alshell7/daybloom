import { untrack } from 'svelte';
import { blocksInRange, floatingBlocks, nowState, parseBlockKey } from '../engine/blocks';
import { addDays, DAY, HOUR, startOfDayMs, todayISO } from '../engine/time';
import type { Block, CalendarEvent, ISODate, Minutes, Task } from '../engine/types';
import { PRESETS, resolveFinish, type PresetId } from '../presets';
import { THEME_BY_ID } from '../themes';
import { openItems } from '../backlog';
import { clock } from './clock.svelte';
import { BREATH_MS } from '../breath.svelte';
import { settings } from './settings.svelte';
import { taskFile } from './tasks.svelte';
import { timer } from './timer.svelte';

export type Sheet =
  | null
  | { kind: 'edit'; key: string; smaller?: boolean }
  | { kind: 'new'; date: ISODate | null; start: Minutes | null; duration: Minutes }
  | { kind: 'settings'; section?: string }
  | { kind: 'insights' }
  | { kind: 'backlog' }
  | { kind: 'winddown' }
  | { kind: 'assistant'; query?: string }
  | { kind: 'focus'; key?: string; taskId?: string }
  | { kind: 'calendars'; add?: 'ics' | 'google' }
  | { kind: 'addons'; id?: string }
  | { kind: 'work'; tab?: string }
  | { kind: 'tracker'; tab?: string }
  | { kind: 'crumbs' }
  | { kind: 'reality' }
  | { kind: 'waqt' }
  | { kind: 'mcp' }
  | { kind: 'whatsnew'; version?: string };

const DOCK_ORDER = ['crumb', 'waqt'];

export interface Spark {
  id: number;
  x: number;
  y: number;
  color: string;
  big?: boolean;
  label?: string;
}

function media(q: string) {
  return typeof matchMedia !== 'undefined' ? matchMedia(q) : null;
}

class View {
  date = $state<ISODate>(todayISO());
  selected = $state<string | null>(null);
  sheet = $state<Sheet>(null);
  focus = $state(false);
  /** Events from your calendars (set by the calendar bridge). */
  calendarEvents = $state<CalendarEvent[]>([]);
  /** Events an addon adds to the day (e.g. prayer blocks), by addon. */
  addonEvents = $state<Record<string, CalendarEvent[]>>({});
  /** Everything with a time that isn't a task: calendars and addons. */
  events = $derived.by(() => {
    const extra = Object.values(this.addonEvents).flat();
    return extra.length ? [...this.calendarEvents, ...extra].sort((a, b) => a.startMs - b.startMs) : this.calendarEvents;
  });
  sparks = $state<Spark[]>([]);
  toast = $state<null | { id: number; text: string; ms: number; action?: { label: string; run: () => void } }>(null);
  /** Key of the block currently in its heads-up window (drives the dial pulse). */
  /** The block ending within the heads-up window (the dial pulses it), in every window. */
  headsUpKey = $derived.by(() => {
    const s = this.now;
    const cur = s.current;
    const ms = settings.value.headsUp * 60_000;
    return cur && !cur.done && ms > 0 && s.remainingMs <= ms && cur.endMs - cur.startMs > ms * 1.5 ? cur.key : null;
  });
  /** Bumped when the whole day completes — the dial plays its lume sweep. */
  dayCompleteAt = $state(0);
  /** A block being dragged in the rail: the dial previews it live. */
  railPreview = $state<null | { key: string; startMs: number; endMs: number }>(null);
  /** A block is being dragged over a backlog drop zone (it lights up). */
  backlogDrop = $state(false);
  /** Direction of the last day change (for the dial's turn animation). */
  dayDir = $state<1 | -1>(1);
  /** Cards at the foot of the rail (e.g. a breadcrumb prompt, the adhan's moment), by id, with
   *  their heights. They stack in DOCK_ORDER; toasts rise above them all. */
  dock = $state<Record<string, number>>({});
  dockLift = $derived(Object.values(this.dock).reduce((a, h) => (h > 0 ? a + h + 10 : a), 0));
  /** How far up a dock card sits: the heights of the cards before it. */
  dockBelow(id: string): number {
    let y = 0;
    for (const k of DOCK_ORDER) {
      if (k === id) break;
      const h = this.dock[k] ?? 0;
      if (h > 0) y += h + 10;
    }
    return y;
  }
  setDock(id: string, h: number) {
    // Read without tracking: callers are effects that would otherwise re-run on their own write.
    untrack(() => {
      if ((this.dock[id] ?? 0) !== h) this.dock = { ...this.dock, [id]: h };
    });
  }
  /** Breathing guide start time (0 = off). Four 16-second cycles (see breath.svelte.ts). */
  breatheAt = $state(0);
  breathing = $derived(this.breatheAt > 0 && clock.now - this.breatheAt < BREATH_MS);

  systemDark = $state(media('(prefers-color-scheme: dark)')?.matches ?? false);
  systemReduced = $state(media('(prefers-reduced-motion: reduce)')?.matches ?? false);

  constructor() {
    media('(prefers-color-scheme: dark)')?.addEventListener('change', (e) => (this.systemDark = e.matches));
    media('(prefers-reduced-motion: reduce)')?.addEventListener('change', (e) => (this.systemReduced = e.matches));
  }

  today = $derived.by(() => {
    clock.zone;
    return todayISO(clock.minute);
  });
  isToday = $derived(this.date === this.today);

  dark = $derived(
    settings.value.theme === 'system' ? this.systemDark : settings.value.theme === 'dark',
  );
  reducedMotion = $derived(
    settings.value.motion === 'system' ? this.systemReduced : settings.value.motion === 'calm',
  );
  /** The computer's own 12/24-hour setting (null until known, or in a browser). */
  systemHour12 = $state<boolean | null>(null);
  hour12 = $derived(
    settings.value.clock === 'auto'
      ? (this.systemHour12 ?? (() => {
          try {
            return new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12 ?? false;
          } catch {
            return false;
          }
        })())
      : settings.value.clock === '12',
  );

  theme = $derived(this.dark ? (THEME_BY_ID[settings.value.darkTheme] ?? THEME_BY_ID.midnight) : (THEME_BY_ID[settings.value.lightTheme] ?? THEME_BY_ID.fog));
  finish = $derived(resolveFinish(settings.value.finish, this.theme));

  /** Every timed block from yesterday to +2 days around the selected date: enough for any dial window. */
  pool = $derived.by(() => {
    clock.zone;
    const anchor = this.isToday ? this.today : this.date;
    const from = startOfDayMs(addDays(anchor, -1));
    const to = startOfDayMs(addDays(anchor, 2));
    return blocksInRange(taskFile.value.tasks, this.events, from, to, this.finish.dark);
  });

  /** Timed blocks that belong to the selected day (shown in the rail). */
  dayBlocks = $derived.by(() => {
    const s = startOfDayMs(this.date);
    const e = startOfDayMs(addDays(this.date, 1));
    // Starts today, or spills in from last night.
    return this.pool.filter((b) => b.startMs < e && b.endMs > s);
  });

  floating = $derived.by(() => {
    clock.zone;
    return floatingBlocks(taskFile.value.tasks, this.events, this.date, this.finish.dark);
  });

  later = $derived(openItems(taskFile.value.tasks));

  /** Today's blocks for now/next — independent of which day is being browsed. */
  todayBlocks = $derived.by(() => {
    clock.zone;
    if (this.isToday) return this.pool;
    const from = startOfDayMs(addDays(this.today, -1));
    return blocksInRange(taskFile.value.tasks, this.events, from, from + 3 * DAY, this.finish.dark);
  });

  now = $derived(nowState(this.todayBlocks, clock.now));

  timerBlocks = $derived(timer.active ? timer.blocks(clock.minute, this.finish.dark) : []);

  /** Day tallies for the selected date (timed + anytime tasks; calendar events don't count). */
  tally = $derived.by(() => {
    const own = [...this.dayBlocks, ...this.floating].filter((b) => b.kind === 'task' && b.date === this.date);
    return { done: own.filter((b) => b.done).length, total: own.length };
  });

  dialFor(presetId: PresetId) {
    const p = PRESETS[presetId];
    return p.window(clock.now, this.date, this.isToday);
  }

  blockByKey(key: string | null): Block | null {
    if (!key) return null;
    return (
      this.pool.find((b) => b.key === key) ??
      this.floating.find((b) => b.key === key) ??
      this.timerBlocks.find((b) => b.key === key) ??
      null
    );
  }

  taskForKey(key: string | null): { task: Task; date: ISODate } | null {
    const p = key ? parseBlockKey(key) : null;
    if (!p) return null;
    const task = taskFile.value.tasks.find((t) => t.id === p.taskId);
    return task ? { task, date: p.date } : null;
  }

  goToday() {
    this.setDate(this.today);
  }

  shiftDay(n: number) {
    this.setDate(addDays(this.date, n));
  }

  setDate(d: ISODate) {
    if (d === this.date) return;
    this.dayDir = d > this.date ? 1 : -1;
    this.date = d;
  }

  spark(x: number, y: number, color: string, big = false, label?: string) {
    const id = Math.random();
    this.sparks.push({ id, x, y, color, big, label });
    setTimeout(() => {
      const i = this.sparks.findIndex((s) => s.id === id);
      if (i >= 0) this.sparks.splice(i, 1);
    }, 1400);
  }

  say(text: string, action?: { label: string; run: () => void }, ms = 5000) {
    const id = Math.random();
    this.toast = { id, text, ms, action };
    setTimeout(() => {
      if (this.toast?.id === id) this.toast = null;
    }, ms);
  }
}

export const view = new View();
