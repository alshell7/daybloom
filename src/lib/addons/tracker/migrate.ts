// Turns whatever is on disk (older shapes, hand edits, half-written data) into a valid
// TrackerFile. Never throws; anything it cannot read becomes the default.

import { mergeActivity } from './entries';
import type { AppTime, Entry, EntrySource, IdleNote, RoundTo, TrackerFile, TrackerSettings } from './types';

export const TRACKER_KEY = 'addon-tracker';

export const DEFAULT_SETTINGS: TrackerSettings = {
  idleMinutes: 5,
  askOnIdle: true,
  trackApps: false,
  trackTitles: false,
  followFocus: true,
  remindWhenNotTracking: false,
  roundTo: 0,
  dailyGoalMinutes: 0,
};

export const DEFAULT_FILE: TrackerFile = { version: 1, entries: [], settings: { ...DEFAULT_SETTINGS } };

const SOURCES: EntrySource[] = ['manual', 'tracker', 'focus'];
const ROUNDS: RoundTo[] = [0, 1, 5, 6, 15];

export function newId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID().replace(/-/g, '').slice(0, 12);
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v : undefined);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);

export function normalizeSettings(raw: unknown): TrackerSettings {
  const r = isObj(raw) ? raw : {};
  const d = DEFAULT_SETTINGS;
  const idle = num(r.idleMinutes);
  const goal = num(r.dailyGoalMinutes);
  return {
    idleMinutes: idle == null ? d.idleMinutes : Math.min(240, Math.max(1, Math.round(idle))),
    askOnIdle: bool(r.askOnIdle, d.askOnIdle),
    trackApps: bool(r.trackApps, d.trackApps),
    trackTitles: bool(r.trackTitles, d.trackTitles),
    followFocus: bool(r.followFocus, d.followFocus),
    remindWhenNotTracking: bool(r.remindWhenNotTracking, d.remindWhenNotTracking),
    roundTo: ROUNDS.includes(r.roundTo as RoundTo) ? (r.roundTo as RoundTo) : d.roundTo,
    dailyGoalMinutes: goal == null ? d.dailyGoalMinutes : Math.min(24 * 60, Math.max(0, Math.round(goal))),
  };
}

function normalizeIdle(raw: unknown): IdleNote | undefined {
  if (!isObj(raw)) return undefined;
  const ms = Math.max(0, num(raw.ms) ?? 0);
  const dropped = Math.max(0, num(raw.droppedMs) ?? 0);
  if (!ms && !dropped) return undefined;
  return dropped ? { ms, droppedMs: dropped } : { ms };
}

function normalizeActivity(raw: unknown): AppTime[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const rows: AppTime[] = [];
  for (const a of raw) {
    if (!isObj(a)) continue;
    const app = str(a.app);
    const ms = num(a.ms);
    if (!app || ms == null || ms <= 0) continue;
    const title = str(a.title);
    rows.push(title ? { app, ms, title } : { app, ms });
  }
  const merged = mergeActivity([], rows);
  return merged.length ? merged : undefined;
}

/** One entry, or null when it cannot be saved (no start, end before start). */
export function normalizeEntry(raw: unknown): Entry | null {
  if (!isObj(raw)) return null;
  const startMs = num(raw.startMs);
  if (startMs == null || startMs <= 0) return null;
  const end = num(raw.endMs);
  // Anything that is not a valid end counts as "running"; the file pass keeps only one.
  const endMs = end == null ? null : end;
  if (endMs != null && endMs <= startMs) return null;
  const e: Entry = {
    id: str(raw.id) ?? newId(),
    startMs,
    endMs,
    source: SOURCES.includes(raw.source as EntrySource) ? (raw.source as EntrySource) : 'manual',
  };
  const taskId = str(raw.taskId);
  const blockKey = str(raw.blockKey);
  const projectId = str(raw.projectId);
  const note = str(raw.note);
  if (taskId) e.taskId = taskId;
  if (blockKey) e.blockKey = blockKey;
  if (projectId) e.projectId = projectId;
  if (note) e.note = note;
  const idle = normalizeIdle(raw.idle);
  if (idle) e.idle = idle;
  const activity = normalizeActivity(raw.activity);
  if (activity) e.activity = activity;
  return e;
}

/** The `migrate` for `persisted('addon-tracker', …)`. */
export function migrateTrackerFile(raw: unknown): TrackerFile {
  const r = isObj(raw) ? raw : {};
  const list = Array.isArray(r.entries) ? r.entries : [];
  const entries: Entry[] = [];
  const seen = new Set<string>();
  for (const x of list) {
    const e = normalizeEntry(x);
    if (!e) continue;
    if (seen.has(e.id)) e.id = newId();
    seen.add(e.id);
    entries.push(e);
  }
  entries.sort((a, b) => a.startMs - b.startMs);

  // Only one entry may run: the latest. Any older "running" one ends where the next begins.
  const running = entries.filter((e) => e.endMs == null);
  const keep = running.at(-1);
  const out: Entry[] = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.endMs == null && e !== keep) {
      const next = entries[i + 1];
      if (!next || next.startMs <= e.startMs) continue; // nothing to close it against
      e.endMs = next.startMs;
    }
    out.push(e);
  }
  return { version: 1, entries: out, settings: normalizeSettings(r.settings) };
}
