// Time Tracker addon: the store. Entries and settings persist under `addon-tracker`; the
// engine (idle, app activity, reminders) runs in one window only, started by the UI with
// `startTracker()`, and `startFollowingFocus()` ties tracking to focus sessions.
//
// Every outside dependency (clock, idle source, frontmost app, ids, timers, heartbeat) is
// injectable through `createTracker(deps)`, so tests drive it with a fake clock.

import { untrack } from 'svelte';
import { MINUTE } from '../../engine/time';
import { clock } from '../../stores/clock.svelte';
import { persisted } from '../../stores/persisted.svelte';
import { timer, timerFile } from '../../stores/timer.svelte';
import { endOf, matchesTarget, mergeActivity, mergeEntries, sameTarget, splitEntry, targetOf, validateSpan } from './entries';
import { DEFAULT_FILE, migrateTrackerFile, newId, normalizeSettings, TRACKER_KEY } from './migrate';
import { foreground, idleSeconds } from './native';
import type {
  AppTime,
  Entry,
  EntrySource,
  Foreground,
  IdleChoice,
  IdlePrompt,
  NotTrackingReminder,
  Result,
  StartInput,
  TargetRef,
  TrackerFile,
  TrackerSettings,
} from './types';

/** How often idle time is read while tracking. */
export const IDLE_POLL_MS = 15_000;
/** How often the frontmost app is sampled while tracking (when trackApps is on). */
export const ACTIVITY_POLL_MS = 30_000;
/** Sampled app time is written to the entry in batches of at least this much. */
export const ACTIVITY_COMMIT_MS = 2 * MINUTE;
/** How often "not tracking" is checked (when remindWhenNotTracking is on). */
export const REMIND_POLL_MS = 60_000;
/** Remind after this long in use with nothing tracked, and at most this often. */
export const REMIND_AFTER_MS = 10 * MINUTE;
/** Input within this long counts as "the computer is in use" for reminders. */
const IN_USE_MS = 2 * MINUTE;

export const trackerFile = persisted<TrackerFile>(TRACKER_KEY, DEFAULT_FILE, migrateTrackerFile);

/** The bits of a focus session the tracker follows (`timer.active`). */
export interface FocusLike {
  startedAt?: number;
  target?: { key?: string; taskId?: string } | null;
}

export interface TrackerDeps {
  /** Holder of the file; `persisted` in the app, a plain object in tests. */
  file: { value: TrackerFile; readonly ready?: boolean; load?: () => Promise<void>; flush?: () => void };
  now: () => number;
  idleSeconds: () => Promise<number>;
  foreground: (withTitle: boolean) => Promise<Foreground | null>;
  newId: () => string;
  /** Last instant the engine saw while tracking; survives a restart (sleep and quit gaps). */
  heartbeat: { read: () => number | null; write: (ms: number) => void };
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (handle: unknown) => void;
}

export interface ManualInput extends StartInput {
  startMs: number;
  endMs: number;
  activity?: AppTime[];
}

/** Fields `update` may change. Setting `endMs` on a running entry stops it. */
export type EntryPatch = Partial<Pick<Entry, 'startMs' | 'taskId' | 'blockKey' | 'projectId' | 'note' | 'source'>> & {
  endMs?: number;
};

export interface IdleResolution {
  /** The entry the idle time was cut from (or kept in); null if it was all idle and removed. */
  stopped: Entry | null;
  /** The new entry for 'drop', starting now. */
  started: Entry | null;
}

const BEAT_KEY = 'daybloom:addon-tracker:beat';

function localHeartbeat(): TrackerDeps['heartbeat'] {
  // Browser storage on purpose: a write every 15 s must not go through the synced state
  // files, which would wake every window.
  return {
    read() {
      try {
        const v = Number(globalThis.localStorage?.getItem(BEAT_KEY));
        return Number.isFinite(v) && v > 0 ? v : null;
      } catch {
        return null;
      }
    },
    write(ms) {
      try {
        globalThis.localStorage?.setItem(BEAT_KEY, String(ms));
      } catch {
        /* private mode: the gap rule still covers sleep while running */
      }
    },
  };
}

function defaultDeps(): TrackerDeps {
  return {
    file: trackerFile,
    // Reads clock.now so getters such as elapsedMs update each tick; the value itself is
    // fresh, not the last tick (the clock honours the dev preview offset).
    now: () => {
      void clock.now;
      return Date.now() + clock.offset;
    },
    idleSeconds,
    foreground,
    newId,
    heartbeat: localHeartbeat(),
    setInterval: (fn, ms) => setInterval(fn, ms),
    clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>),
  };
}

const fail = <T>(error: 'not-found' | 'invalid-range' | 'too-few', conflicts: Entry[] = []): Result<T> => ({ ok: false, error, conflicts });

export function createTracker(overrides: Partial<TrackerDeps> = {}) {
  const d: TrackerDeps = { ...defaultDeps(), ...overrides };

  const ui = $state<{ idlePrompt: IdlePrompt | null; reminder: NotTrackingReminder | null }>({ idlePrompt: null, reminder: null });

  // Engine memory (not persisted, not reactive).
  let lastPollAt: number | null = null;
  let lastIdleMs = 0;
  /** Idle stretches never reach back before this (set when an idle prompt is answered). */
  let ignoreIdleBefore = 0;
  /** askOnIdle off: an idle stretch being noted on the entry. */
  let quietIdle: { since: number; entryId: string } | null = null;
  let lastSampleAt: number | null = null;
  let sampleEntryId: string | null = null;
  let pending: { entryId: string; rows: AppTime[]; ms: number } | null = null;
  const startedAt = d.now();
  let lastRemindAt = 0;

  const list = () => d.file.value.entries;
  const settings = () => d.file.value.settings;
  const byId = (id: string) => list().find((e) => e.id === id);

  function running(): Entry | null {
    const l = list();
    for (let i = l.length - 1; i >= 0; i--) if (l[i].endMs == null) return l[i];
    return null;
  }

  function insert(e: Entry): Entry {
    const l = list();
    let i = l.length;
    while (i > 0 && l[i - 1].startMs > e.startMs) i--;
    l.splice(i, 0, e);
    return l[i];
  }

  function removeAt(id: string): boolean {
    const l = list();
    const i = l.findIndex((e) => e.id === id);
    if (i < 0) return false;
    l.splice(i, 1);
    if (ui.idlePrompt?.entryId === id) ui.idlePrompt = null;
    if (quietIdle?.entryId === id) quietIdle = null;
    if (pending?.entryId === id) pending = null;
    return true;
  }

  function build(input: StartInput, startMs: number, endMs: number | null, source: EntrySource): Entry {
    const e: Entry = { id: d.newId(), startMs, endMs, source, ...targetOf(input) };
    const note = input.note?.trim();
    if (note) e.note = note;
    return e;
  }

  function addIdle(e: Entry, kept: number, dropped = 0) {
    if (kept <= 0 && dropped <= 0) return;
    const ms = (e.idle?.ms ?? 0) + Math.max(0, kept);
    const droppedMs = (e.idle?.droppedMs ?? 0) + Math.max(0, dropped);
    e.idle = droppedMs ? { ms, droppedMs } : { ms };
  }

  /** Write buffered app time onto its entry. */
  function flushActivity() {
    if (!pending) return;
    const e = byId(pending.entryId);
    if (e && pending.rows.length) e.activity = mergeActivity(e.activity ?? [], pending.rows);
    pending = null;
  }

  /** End the running entry at `at` (it is removed if nothing is left of it). */
  function endRunning(at: number): Entry | null {
    const r = running();
    if (!r) return null;
    flushActivity();
    if (quietIdle?.entryId === r.id) {
      addIdle(r, Math.max(0, at - quietIdle.since));
      quietIdle = null;
    }
    lastPollAt = null;
    lastSampleAt = null;
    if (at <= r.startMs) {
      removeAt(r.id);
      return null;
    }
    r.endMs = at;
    return r;
  }

  function start(input: StartInput = {}): Entry {
    const t = d.now();
    endRunning(t);
    const e = insert(build(input, t, null, input.source ?? 'tracker'));
    lastPollAt = t;
    lastIdleMs = 0;
    ignoreIdleBefore = t;
    lastSampleAt = t;
    sampleEntryId = e.id;
    ui.reminder = null;
    d.heartbeat.write(t);
    return e;
  }

  function stop(): Entry | null {
    return endRunning(d.now());
  }

  function isTracking(ref: TargetRef = {}): boolean {
    const r = running();
    return !!r && matchesTarget(r, targetOf(ref));
  }

  function toggle(target: StartInput = {}): Entry | null {
    if (isTracking(target)) {
      stop();
      return null;
    }
    return start(target);
  }

  function addManual(input: ManualInput, { force = false } = {}): Result<Entry> {
    const now = d.now();
    const v = validateSpan(list(), input.startMs, input.endMs, now, { force });
    if (!v.ok) return v;
    const e = build(input, input.startMs, input.endMs, input.source ?? 'manual');
    const activity = mergeActivity([], input.activity ?? []);
    if (activity.length) e.activity = activity;
    return { ok: true, value: insert(e) };
  }

  function update(id: string, patch: EntryPatch, { force = false } = {}): Result<Entry> {
    const e = byId(id);
    if (!e) return fail('not-found');
    const now = d.now();
    const next: Entry = { ...e, ...patch };
    if ('blockKey' in patch && !('taskId' in patch)) next.taskId = targetOf({ blockKey: patch.blockKey }).taskId;
    if (patch.endMs !== undefined && !Number.isFinite(patch.endMs)) return fail('invalid-range');
    // A running entry's end is now; a start in the future makes it an empty span.
    const end = next.endMs ?? now;
    const v = validateSpan(list(), next.startMs, end, now, { ignore: [id], force });
    if (!v.ok) return v;
    for (const k of ['taskId', 'blockKey', 'projectId', 'note'] as const) {
      const val = next[k]?.trim();
      if (val) next[k] = val;
      else delete next[k];
    }
    const startChanged = next.startMs !== e.startMs;
    if (e.endMs == null && next.endMs != null) endRunning(next.endMs);
    for (const k of Object.keys(e) as (keyof Entry)[]) if (!(k in next)) delete e[k];
    Object.assign(e, next);
    if (startChanged) {
      // Keep the list in start order.
      const l = list();
      l.splice(l.indexOf(e), 1);
      return { ok: true, value: insert($state.snapshot(e) as Entry) };
    }
    return { ok: true, value: e };
  }

  function remove(id: string): boolean {
    if (running()?.id === id) {
      lastPollAt = null;
      lastSampleAt = null;
    }
    return removeAt(id);
  }

  function split(id: string, atMs: number): Result<[Entry, Entry]> {
    const e = byId(id);
    if (!e) return fail('not-found');
    if (pending?.entryId === id) flushActivity();
    const parts = splitEntry($state.snapshot(e) as Entry, atMs, d.now(), d.newId());
    if (!parts) return fail('invalid-range');
    const l = list();
    const i = l.indexOf(e);
    l.splice(i, 1, parts[0], parts[1]);
    const p = ui.idlePrompt;
    if (p?.entryId === id && p.since >= atMs) ui.idlePrompt = { ...p, entryId: parts[1].id };
    if (quietIdle?.entryId === id && quietIdle.since >= atMs) quietIdle = { ...quietIdle, entryId: parts[1].id };
    if (sampleEntryId === id) sampleEntryId = parts[1].id;
    return { ok: true, value: [l[i], l[i + 1]] };
  }

  function merge(ids: string[], { force = false } = {}): Result<Entry> {
    const unique = [...new Set(ids)];
    const found = unique.map(byId);
    if (found.some((e) => !e)) return fail('not-found');
    if (unique.length < 2) return fail('too-few');
    if (pending && unique.includes(pending.entryId)) flushActivity();
    const merged = mergeEntries(found.map((e) => $state.snapshot(e) as Entry));
    if (!merged) return fail('too-few');
    const now = d.now();
    const v = validateSpan(list(), merged.startMs, endOf(merged, now), now, { ignore: unique, force });
    if (!v.ok) return v;
    const keepPrompt = ui.idlePrompt && unique.includes(ui.idlePrompt.entryId) ? ui.idlePrompt : null;
    for (const id of unique) removeAt(id);
    const out = insert(merged);
    if (keepPrompt) ui.idlePrompt = { ...keepPrompt, entryId: out.id };
    if (sampleEntryId && unique.includes(sampleEntryId)) sampleEntryId = out.id;
    return { ok: true, value: out };
  }

  function setSettings(patch: Partial<TrackerSettings>) {
    d.file.value.settings = normalizeSettings({ ...settings(), ...patch });
  }

  // ---- Idle ------------------------------------------------------------------------------

  /**
   * One idle reading (every IDLE_POLL_MS while tracking). Raises `idlePrompt` once the user
   * has been away for idleMinutes. A gap of more than two polls between readings (sleep,
   * or the app was closed) counts as idle from the last input seen before it.
   */
  async function pollIdle(): Promise<IdlePrompt | null> {
    const r = running();
    if (!r) {
      lastPollAt = null;
      return null;
    }
    const secs = await d.idleSeconds();
    const idleMs = Number.isFinite(secs) && secs > 0 ? secs * 1000 : 0;
    const t = d.now();
    const cur = running();
    if (!cur || cur.id !== r.id) return null;

    // After a restart the heartbeat stands in for the last poll.
    let prev = lastPollAt;
    if (prev == null) {
      const beat = d.heartbeat.read();
      if (beat != null && beat >= cur.startMs && beat <= t) prev = beat;
    }
    let since = t - idleMs;
    if (prev != null && t - prev > 2 * IDLE_POLL_MS) since = Math.min(since, prev - (lastPollAt == null ? 0 : lastIdleMs));
    lastPollAt = t;
    lastIdleMs = idleMs;
    d.heartbeat.write(t);
    since = Math.max(since, cur.startMs, ignoreIdleBefore);

    const away = t - since;
    const limit = settings().idleMinutes * MINUTE;
    if (ui.idlePrompt) return ui.idlePrompt;
    if (!settings().askOnIdle) {
      // Not asking: the time stays, and the stretch is noted on the entry once input returns.
      if (away >= limit && !quietIdle) quietIdle = { since, entryId: cur.id };
      else if (quietIdle && idleMs < limit) {
        addIdle(cur, Math.max(0, t - idleMs - quietIdle.since));
        quietIdle = null;
        ignoreIdleBefore = t - idleMs;
      }
      return null;
    }
    if (away < limit) return null;
    ui.idlePrompt = { since, entryId: cur.id };
    return ui.idlePrompt;
  }

  /**
   * Answer the idle prompt. 'keep' keeps the time and notes it; 'drop' ends the entry where
   * the idle time began and starts a new one now for the same target; 'drop-stop' ends it
   * there and stops. If the entry was stopped meanwhile, the idle time is still cut off it.
   */
  function resolveIdle(choice: IdleChoice): IdleResolution {
    const p = ui.idlePrompt;
    ui.idlePrompt = null;
    const none: IdleResolution = { stopped: null, started: null };
    if (!p) return none;
    const now = d.now();
    ignoreIdleBefore = now;
    lastIdleMs = 0;
    if (lastPollAt != null) lastPollAt = now;
    const e = byId(p.entryId);
    if (!e) return none;
    const end = endOf(e, now);
    const idleMs = Math.max(0, end - Math.max(p.since, e.startMs));
    if (choice === 'keep') {
      addIdle(e, idleMs);
      return { stopped: e, started: null };
    }
    const wasRunning = e.endMs == null;
    const target: StartInput = { taskId: e.taskId, blockKey: e.blockKey, projectId: e.projectId, note: e.note, source: e.source };
    let stopped: Entry | null;
    if (wasRunning) {
      stopped = endRunning(Math.max(p.since, e.startMs));
    } else {
      if (p.since <= e.startMs) {
        removeAt(e.id);
        stopped = null;
      } else {
        e.endMs = Math.min(end, p.since);
        stopped = e;
      }
    }
    if (stopped) addIdle(stopped, 0, idleMs);
    const started = choice === 'drop' && wasRunning ? start(target) : null;
    return { stopped, started };
  }

  // ---- App activity ----------------------------------------------------------------------

  /**
   * One sample of the frontmost app (every ACTIVITY_POLL_MS while tracking, when trackApps is
   * on). The time since the last sample, less any idle part, goes to that app.
   */
  async function pollActivity(): Promise<AppTime | null> {
    const s = settings();
    const r = running();
    if (!s.trackApps || !r) {
      lastSampleAt = null;
      return null;
    }
    const [front, secs] = await Promise.all([d.foreground(s.trackTitles), d.idleSeconds()]);
    const t = d.now();
    const cur = running();
    if (!cur || cur.id !== r.id) return null;
    const prev = sampleEntryId === cur.id && lastSampleAt != null ? lastSampleAt : Math.max(cur.startMs, t - ACTIVITY_POLL_MS);
    sampleEntryId = cur.id;
    lastSampleAt = t;
    const span = t - prev;
    // A long gap is sleep: nobody used any app. An open idle prompt means the same.
    if (span <= 0 || span > 2 * ACTIVITY_POLL_MS || ui.idlePrompt || !front) return null;
    const idleMs = Number.isFinite(secs) && secs > 0 ? secs * 1000 : 0;
    const ms = Math.round(span - Math.min(span, idleMs));
    if (ms <= 0) return null;
    const row: AppTime = front.title ? { app: front.app, ms, title: front.title } : { app: front.app, ms };
    if (pending && pending.entryId !== cur.id) flushActivity();
    pending ??= { entryId: cur.id, rows: [], ms: 0 };
    pending.rows = mergeActivity(pending.rows, [row]);
    pending.ms += ms;
    if (pending.ms >= ACTIVITY_COMMIT_MS) flushActivity();
    return row;
  }

  // ---- Not-tracking reminder -------------------------------------------------------------

  async function pollReminder(): Promise<NotTrackingReminder | null> {
    if (!settings().remindWhenNotTracking || running()) return null;
    const t = d.now();
    const lastEnd = list().reduce((m, e) => Math.max(m, e.endMs ?? 0), 0);
    const quietSince = Math.max(lastEnd, startedAt);
    if (t - Math.max(quietSince, lastRemindAt) < REMIND_AFTER_MS) return null;
    const secs = await d.idleSeconds();
    if (!(secs * 1000 < IN_USE_MS) || running()) return null;
    lastRemindAt = t;
    ui.reminder = { since: quietSince, at: t };
    return ui.reminder;
  }

  // ---- Focus sessions --------------------------------------------------------------------

  /**
   * Apply the followFocus rule to a focus session (or none): a session with a target tracks
   * that target (source 'focus'); with no session, a 'focus' entry stops. Time already being
   * tracked for the same target is left alone.
   */
  function syncFocus(active: FocusLike | null): Entry | null {
    if (!settings().followFocus) return null;
    const t = active?.target;
    const want = t && (t.key || t.taskId) ? targetOf({ blockKey: t.key, taskId: t.taskId }) : null;
    const r = running();
    if (want) {
      if (r && (isTracking(want) || (r.source === 'focus' && sameTarget(r, want)))) return r;
      return start({ ...want, source: 'focus' });
    }
    if (r?.source === 'focus') stop();
    return null;
  }

  let focusSeen: string | null | undefined;
  let focusWasOn = false;

  /**
   * Called with `timer.active` whenever it may have changed. Acts only on a change of
   * session (or followFocus being turned on), so stopping the tracker by hand during a
   * session sticks. The first call after launch only stops a 'focus' entry left without
   * a session; a session still running keeps the entry it already has.
   */
  function observeFocus(active: FocusLike | null): Entry | null {
    const on = settings().followFocus;
    const key = active ? `${active.startedAt ?? ''}|${active.target?.key ?? ''}|${active.target?.taskId ?? ''}` : null;
    const first = focusSeen === undefined;
    const changed = key !== focusSeen || (on && !focusWasOn);
    focusSeen = key;
    focusWasOn = on;
    if (!on || (!first && !changed)) return null;
    if (first) return active ? running() : syncFocus(null);
    return syncFocus(active);
  }

  // ---- Engine ----------------------------------------------------------------------------

  /** Run the idle, activity and reminder loops while they are needed. Returns a stop function. */
  function run(): () => void {
    const handles: Record<'idle' | 'apps' | 'remind', unknown> = { idle: null, apps: null, remind: null };
    const set = (k: keyof typeof handles, on: boolean, ms: number, fn: () => Promise<unknown>) => {
      if (on && handles[k] == null) handles[k] = d.setInterval(() => void fn().catch(() => {}), ms);
      else if (!on && handles[k] != null) {
        d.clearInterval(handles[k]);
        handles[k] = null;
      }
    };
    let lastId: string | null = null;
    const stopRoot = $effect.root(() => {
      $effect(() => {
        if (d.file.ready === false) return;
        const id = running()?.id ?? null;
        const s = d.file.value.settings;
        const apps = s.trackApps;
        const remind = s.remindWhenNotTracking;
        untrack(() => {
          set('idle', !!id, IDLE_POLL_MS, pollIdle);
          set('apps', !!id && apps, ACTIVITY_POLL_MS, pollActivity);
          set('remind', !id && remind, REMIND_POLL_MS, pollReminder);
          // Tracking found running at launch: check the gap since the app last saw it.
          if (id && id !== lastId) void pollIdle().catch(() => {});
          lastId = id;
        });
      });
    });
    return () => {
      stopRoot();
      for (const k of Object.keys(handles) as (keyof typeof handles)[]) set(k, false, 0, async () => {});
      flushActivity();
    };
  }

  /** Follow focus sessions (when followFocus is on). Returns a stop function. */
  function followFocus(source: { readonly active: FocusLike | null; readonly ready?: boolean } = focusSource): () => void {
    return $effect.root(() => {
      $effect(() => {
        if (d.file.ready === false || source.ready === false) return;
        // Read only what identifies the session, so pausing or extending it does not re-run this.
        const active = source.active;
        void active?.startedAt;
        void active?.target?.key;
        void active?.target?.taskId;
        void d.file.value.settings.followFocus;
        untrack(() => observeFocus(active));
      });
    });
  }

  return {
    get entries(): Entry[] {
      return list();
    },
    get settings(): TrackerSettings {
      return settings();
    },
    get running(): Entry | null {
      return running();
    },
    /** How long the running entry has run (0 when none). Updates with the clock. */
    get elapsedMs(): number {
      const r = running();
      return r ? Math.max(0, d.now() - r.startMs) : 0;
    },
    get idlePrompt(): IdlePrompt | null {
      return ui.idlePrompt;
    },
    get reminder(): NotTrackingReminder | null {
      return ui.reminder;
    },
    get ready(): boolean {
      return d.file.ready ?? true;
    },
    load: () => d.file.load?.() ?? Promise.resolve(),
    start,
    stop,
    toggle,
    isTracking,
    addManual,
    update,
    remove,
    split,
    merge,
    setSettings,
    resolveIdle,
    dismissReminder() {
      ui.reminder = null;
    },
    pollIdle,
    pollActivity,
    pollReminder,
    flushActivity,
    syncFocus,
    observeFocus,
    run,
    followFocus,
  };
}

export type Tracker = ReturnType<typeof createTracker>;

const focusSource = {
  get active(): FocusLike | null {
    return timer.active;
  },
  get ready() {
    return timerFile.ready;
  },
};

/** The app's tracker. */
export const tracker = createTracker();

/**
 * Start the engine (idle checks, app sampling, reminders). Call once, in the main window,
 * after `tracker.load()`. Returns a stop function.
 */
export function startTracker(): () => void {
  return tracker.run();
}

/** Start and stop tracking with focus sessions (when followFocus is on). Main window only. */
export function startFollowingFocus(): () => void {
  return tracker.followFocus();
}
