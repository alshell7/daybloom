// Pure three-way merges for GitHub sync.
//
// Every merge takes the snapshot both sides agreed on at the last sync (`base`, or
// null on a first sync), this device's state (`local`) and the repo's state
// (`remote`), and returns the one result every device converges on. "Changed" always
// means "differs from base", so an edit counts even when it didn't bump `updatedAt`.
// No I/O, no clocks, no randomness: the same inputs give the same output, and a
// merge of a value with itself is that value.

import type { Subtask, Task } from '../engine/types';
import type { Settings } from '../stores/settings.svelte';

export interface Tombstone {
  id: string;
  at: number;
}

export interface TaskFileData {
  version: 1;
  tasks: Task[];
  deleted: Tombstone[];
}

/** Only the allow-listed settings, nested the same way as `Settings`. */
export type SharedSettings = Record<string, unknown>;

export interface SettingsFileData {
  version: 1;
  settings: SharedSettings;
}

export interface Unlock {
  id: string;
  at: number;
}

/** Badges only. `viewedAt` stays on each device so a new badge glints once per screen. */
export interface ProgressFileData {
  version: 1;
  unlocked: Unlock[];
}

export interface StreakFileData {
  celebrated: number;
}

// ---------------------------------------------------------------------------
// Settings allow-list

type SettingsPath = {
  [K in keyof Settings & string]:
    | K
    | (Settings[K] extends unknown[] ? never : Settings[K] extends object ? `${K}.${keyof Settings[K] & string}` : never);
}[keyof Settings & string];

/** Settings that follow you to every computer. Anything not listed never leaves this one. */
export const SHARED_SETTINGS = [
  'preset',
  'finish',
  'theme',
  'lightTheme',
  'darkTheme',
  'clock',
  'motion',
  'font',
  'showSeconds',
  'sound',
  'headsUp',
  'wake',
  'sleep',
  'cycles',
  'nudges',
  'widget.preset',
  'widget.finish',
] as const satisfies readonly SettingsPath[];

/** Settings that belong to one computer (documented so every key is a conscious choice). */
export const DEVICE_SETTINGS = [
  'volume',
  'notify',
  'launchAtLogin',
  'menuBarTimer',
  'widget.visible',
  'widget.layer',
  'google',
  'onboarded',
  'lastGreeted',
  'timeZone',
  'recentZones',
  'autoUpdate',
] as const satisfies readonly SettingsPath[];

// ---------------------------------------------------------------------------
// Small JSON helpers

type Obj = Record<string, unknown>;

export function isPlainObject(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Structural equality with JSON semantics (key order and `undefined` members don't matter). */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  const ao = a as Obj;
  const bo = b as Obj;
  const ka = Object.keys(ao).filter((k) => ao[k] !== undefined);
  const kb = Object.keys(bo).filter((k) => bo[k] !== undefined);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!deepEqual(ao[k], bo[k])) return false;
  return true;
}

export function clone<T>(v: T): T {
  return v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T);
}

const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Keys of `first` in order, then keys only `second` has. */
function unionKeys(first: Obj | Map<string, unknown>, second: Obj | Map<string, unknown>): string[] {
  const a = first instanceof Map ? [...first.keys()] : Object.keys(first);
  const b = second instanceof Map ? [...second.keys()] : Object.keys(second);
  const seen = new Set(a);
  return [...a, ...b.filter((k) => !seen.has(k))];
}

function byId<T extends { id: string }>(list: readonly T[]): Map<string, T> {
  const m = new Map<string, T>();
  for (const x of list) if (!m.has(x.id)) m.set(x.id, x);
  return m;
}

/**
 * One value, three ways: the side that changed wins; if both changed the same way
 * either does; if both changed differently, `preferLocal` decides. Without a base
 * there is no "changed", so a value only one side has is kept.
 */
function pick(b: unknown, l: unknown, r: unknown, hasBase: boolean, preferLocal: boolean): unknown {
  if (deepEqual(l, r)) return r;
  if (hasBase) {
    if (deepEqual(l, b)) return r;
    if (deepEqual(r, b)) return l;
  } else {
    if (l === undefined) return r;
    if (r === undefined) return l;
  }
  return preferLocal ? l : r;
}

/** Per-key three-way merge of plain objects; nested plain objects merge per key too. */
function mergeRecord(b: Obj | undefined, l: Obj | undefined, r: Obj | undefined, hasBase: boolean, preferLocal: boolean): Obj | undefined {
  if (l === undefined && r === undefined) return undefined;
  const B = b ?? {};
  const L = l ?? {};
  const R = r ?? {};
  const out: Obj = {};
  for (const k of unionKeys(R, L)) {
    const v = mergeValue(B[k], L[k], R[k], hasBase, preferLocal);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function mergeValue(b: unknown, l: unknown, r: unknown, hasBase: boolean, preferLocal: boolean): unknown {
  if (deepEqual(l, r)) return clone(r);
  if (isPlainObject(l) && isPlainObject(r)) return mergeRecord(isPlainObject(b) ? b : undefined, l, r, hasBase, preferLocal);
  return clone(pick(b, l, r, hasBase, preferLocal));
}

/** Union of both sides, minus anything either side removed since the base. Remote order first. */
function mergeSet(b: unknown, l: unknown, r: unknown): unknown[] | undefined {
  if (l === undefined && r === undefined) return undefined;
  const B = new Set(arr(b));
  const L = new Set(arr(l));
  const R = new Set(arr(r));
  const out: unknown[] = [];
  const seen = new Set<unknown>();
  for (const x of [...arr(r), ...arr(l)]) {
    if (seen.has(x)) continue;
    seen.add(x);
    if (B.has(x) && (!L.has(x) || !R.has(x))) continue;
    out.push(x);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Tasks

const SET_FIELDS = new Set(['completions', 'skips', 'acks']);
const RECORD_FIELDS = new Set(['completedAt', 'overrides']);

function mergeSubtasks(b: unknown, l: unknown, r: unknown, hasBase: boolean, preferLocal: boolean): Subtask[] | undefined {
  if (l === undefined && r === undefined) return undefined;
  const valid = (v: unknown) => arr(v).filter((s): s is Subtask => isPlainObject(s) && typeof s.id === 'string');
  const bl = valid(b);
  const ll = valid(l);
  const rl = valid(r);
  const B = byId(bl);
  const L = byId(ll);
  const R = byId(rl);

  const merged = new Map<string, Subtask>();
  for (const id of unionKeys(R, L)) {
    const bs = B.get(id);
    const ls = L.get(id);
    const rs = R.get(id);
    if (ls && rs) merged.set(id, mergeRecord(bs as Obj | undefined, ls as unknown as Obj, rs as unknown as Obj, hasBase, preferLocal) as unknown as Subtask);
    // Missing on one side: new on the other (keep), or removed there (keep only if edited here).
    else if (ls) {
      if (!bs || !deepEqual(ls, bs)) merged.set(id, clone(ls));
    } else if (rs) {
      if (!bs || !deepEqual(rs, bs)) merged.set(id, clone(rs));
    }
  }

  // Order: the side that reordered (or, if both did, the preferred side) leads; the
  // other side's additions slot in after their nearest surviving predecessor.
  const ids = (list: Subtask[]) => list.map((s) => s.id);
  const lIds = ids(ll);
  const rIds = ids(rl);
  let primary: string[];
  let secondary: string[];
  if (hasBase && deepEqual(lIds, ids(bl))) [primary, secondary] = [rIds, lIds];
  else if (hasBase && deepEqual(rIds, ids(bl))) [primary, secondary] = [lIds, rIds];
  else [primary, secondary] = preferLocal ? [lIds, rIds] : [rIds, lIds];

  const order: string[] = [];
  for (const id of primary) if (merged.has(id) && !order.includes(id)) order.push(id);
  let prev: string | null = null;
  for (const id of secondary) {
    if (!merged.has(id)) continue;
    if (!order.includes(id)) order.splice(prev === null ? 0 : order.indexOf(prev) + 1, 0, id);
    prev = id;
  }
  return order.map((id) => merged.get(id)!);
}

/**
 * Field-level merge of one task both sides still have. Arrays of dates are sets,
 * `completedAt`/`overrides` merge per date, subtasks per id, and any other field goes
 * to the side that changed it — or, if both did, to the newer `updatedAt` (ties: remote).
 */
export function mergeTask(base: Task | null, local: Task, remote: Task): Task {
  if (deepEqual(local, remote)) return clone(remote);
  if (base) {
    if (deepEqual(local, base)) return clone(remote);
    if (deepEqual(remote, base)) return clone(local);
  }
  const hasBase = base !== null;
  const preferLocal = num(local.updatedAt) > num(remote.updatedAt);
  const b = (base ?? {}) as unknown as Obj;
  const l = local as unknown as Obj;
  const r = remote as unknown as Obj;
  const out: Obj = {};
  for (const k of unionKeys(r, l)) {
    let v: unknown;
    if (k === 'id') v = remote.id;
    else if (k === 'updatedAt') v = Math.max(num(l.updatedAt), num(r.updatedAt));
    else if (k === 'createdAt') {
      const xs = [l.createdAt, r.createdAt].filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
      v = xs.length ? Math.min(...xs) : r.createdAt;
    } else if (SET_FIELDS.has(k)) v = mergeSet(b[k], l[k], r[k]);
    else if (RECORD_FIELDS.has(k)) {
      const rec = (x: unknown) => (isPlainObject(x) ? x : undefined);
      v = mergeRecord(hasBase ? (rec(b[k]) ?? {}) : undefined, rec(l[k]), rec(r[k]), hasBase, preferLocal);
    } else if (k === 'subtasks') v = mergeSubtasks(b[k], l[k], r[k], hasBase, preferLocal);
    else v = clone(pick(b[k], l[k], r[k], hasBase, preferLocal));
    if (v !== undefined) out[k] = v;
  }
  // A finish time only means something for a date that is still ticked.
  if (Array.isArray(out.completions) && isPlainObject(out.completedAt)) {
    const done = new Set(out.completions);
    for (const d of Object.keys(out.completedAt)) if (!done.has(d)) delete out.completedAt[d];
  }
  return out as unknown as Task;
}

export interface TaskMergeOptions {
  /**
   * When the base snapshot was taken (ms). Anything that differs from the base changed
   * after this moment, which bounds an edit's time when `updatedAt` wasn't bumped.
   */
  baseAt?: number;
}

/** Keep the newest tombstones if the list ever grows huge. */
export const MAX_TOMBSTONES = 2000;

/**
 * Tasks by id. New on either side → kept. Deleted on either side → gone, unless the
 * other side edited it after the deletion (then the edit wins and the tombstone goes).
 * Both still have it → `mergeTask`. Order follows the repo, then this device's new ones.
 */
export function mergeTaskFiles(base: TaskFileData | null, local: TaskFileData, remote: TaskFileData, opts: TaskMergeOptions = {}): TaskFileData {
  const B = byId(base?.tasks ?? []);
  const L = byId(local.tasks);
  const R = byId(remote.tasks);
  const tombs = (list: Tombstone[]) => {
    const m = new Map<string, number>();
    for (const d of list) m.set(d.id, Math.max(m.get(d.id) ?? -Infinity, d.at));
    return m;
  };
  const localTomb = tombs(local.deleted);
  const remoteTomb = tombs(remote.deleted);
  const floor = base ? num(opts.baseAt) : 0;
  const editedAt = (t: Task) => Math.max(num(t.updatedAt), floor);

  /** `t` exists on one side only; `deletedAt` is the other side's tombstone, if any. */
  const survives = (t: Task, b: Task | null, deletedAt: number | undefined) => {
    // It was there at the last sync and is untouched here: the other side's delete wins.
    if (b && deepEqual(t, b)) return false;
    // New or edited here: it stays unless the other side deleted it afterwards.
    return deletedAt === undefined || editedAt(t) > deletedAt;
  };

  const tasks: Task[] = [];
  for (const id of unionKeys(R, L)) {
    const l = L.get(id);
    const r = R.get(id);
    const b = B.get(id) ?? null;
    let t: Task | null = null;
    if (l && r) t = mergeTask(b, l, r);
    else if (l) t = survives(l, b, remoteTomb.get(id)) ? clone(l) : null;
    else if (r) t = survives(r, b, localTomb.get(id)) ? clone(r) : null;
    if (t) tasks.push(t);
  }

  const kept = new Set(tasks.map((t) => t.id));
  let deleted: Tombstone[] = [];
  const seen = new Map<string, Tombstone>();
  for (const d of [...remote.deleted, ...local.deleted]) {
    if (kept.has(d.id)) continue;
    const prev = seen.get(d.id);
    if (prev) prev.at = Math.max(prev.at, d.at);
    else {
      const c = { id: d.id, at: d.at };
      seen.set(d.id, c);
      deleted.push(c);
    }
  }
  if (deleted.length > MAX_TOMBSTONES) {
    const newest = new Set(
      [...deleted].sort((a, z) => z.at - a.at || (a.id < z.id ? -1 : a.id > z.id ? 1 : 0)).slice(0, MAX_TOMBSTONES),
    );
    deleted = deleted.filter((d) => newest.has(d));
  }
  return { version: 1, tasks, deleted };
}

/** Coerce anything (a repo file, a store snapshot) into a well-formed task file. */
export function parseTaskFile(raw: unknown): TaskFileData {
  const o = isPlainObject(raw) ? raw : {};
  const tasks: Task[] = [];
  const ids = new Set<string>();
  for (const t of arr(o.tasks)) {
    if (!isPlainObject(t) || typeof t.id !== 'string' || !t.id || ids.has(t.id)) continue;
    ids.add(t.id);
    const x: Obj = { ...t };
    for (const k of ['completions', 'skips', 'alerts']) if (!Array.isArray(x[k])) x[k] = [];
    x.subtasks = arr(x.subtasks).filter((s) => isPlainObject(s) && typeof s.id === 'string');
    if (!isPlainObject(x.overrides)) x.overrides = {};
    if (x.completedAt !== undefined && !isPlainObject(x.completedAt)) x.completedAt = {};
    if (x.acks !== undefined && !Array.isArray(x.acks)) x.acks = [];
    if (typeof x.title !== 'string') x.title = '';
    if (typeof x.updatedAt !== 'number' || !Number.isFinite(x.updatedAt)) x.updatedAt = 0;
    if (typeof x.createdAt !== 'number' || !Number.isFinite(x.createdAt)) x.createdAt = 0;
    tasks.push(x as unknown as Task);
  }
  const deleted = arr(o.deleted)
    .filter((d): d is Obj => isPlainObject(d) && typeof d.id === 'string' && typeof d.at === 'number' && Number.isFinite(d.at))
    .map((d) => ({ id: d.id as string, at: d.at as number }));
  return { version: 1, tasks, deleted };
}

// ---------------------------------------------------------------------------
// Settings

function getPath(o: unknown, path: string): unknown {
  let cur = o;
  for (const p of path.split('.')) {
    if (!isPlainObject(cur)) return undefined;
    cur = cur[p];
  }
  return cur;
}

function setPath(o: Obj, path: string, v: unknown) {
  const parts = path.split('.');
  let cur = o;
  for (const p of parts.slice(0, -1)) {
    if (!isPlainObject(cur[p])) cur[p] = {};
    cur = cur[p] as Obj;
  }
  cur[parts[parts.length - 1]] = v;
}

/** The allow-listed part of a full settings object (or of anything claiming to be one). */
export function pickSharedSettings(full: unknown): SharedSettings {
  const out: Obj = {};
  for (const path of SHARED_SETTINGS) {
    const v = getPath(full, path);
    if (v !== undefined) setPath(out, path, clone(v));
  }
  return out;
}

/** Lay `v` over `cur`, refusing values of the wrong shape (a garbled or future file). */
function overlay(cur: unknown, v: unknown): unknown {
  if (cur === undefined) return clone(v);
  if (isPlainObject(cur)) {
    if (!isPlainObject(v)) return undefined;
    const o: Obj = { ...cur };
    for (const k of Object.keys(v)) {
      const n = overlay(cur[k], v[k]);
      if (n !== undefined) o[k] = n;
    }
    return o;
  }
  if (Array.isArray(cur)) return Array.isArray(v) ? clone(v) : undefined;
  if (v === null || typeof v !== typeof cur) return undefined;
  if (typeof v === 'number' && !Number.isFinite(v)) return undefined;
  return v;
}

/** A copy of `full` with the shared settings applied. Device-specific keys are never touched. */
export function applySharedSettings<T extends object>(full: T, shared: SharedSettings): T {
  const out = clone(full) as unknown as Obj;
  for (const path of SHARED_SETTINGS) {
    const v = getPath(shared, path);
    if (v === undefined) continue;
    const next = overlay(getPath(out, path), v);
    if (next !== undefined) setPath(out, path, next);
  }
  return out as unknown as T;
}

/** Per allow-listed key (nested objects per sub-key): the changed side wins; both changed → remote. */
export function mergeSettingsFiles(base: SettingsFileData | null, local: SettingsFileData, remote: SettingsFileData): SettingsFileData {
  return {
    version: 1,
    settings: mergeRecord(base?.settings, local.settings, remote.settings, base !== null, false) ?? {},
  };
}

export function parseSettingsFile(raw: unknown): SettingsFileData {
  const o = isPlainObject(raw) ? raw : {};
  return { version: 1, settings: pickSharedSettings(isPlainObject(o.settings) ? o.settings : {}) };
}

// ---------------------------------------------------------------------------
// Progress and streaks

/** Badges are never taken back: union by id, keeping the earliest time each was earned. */
export function mergeProgressFiles(_base: ProgressFileData | null, local: ProgressFileData, remote: ProgressFileData): ProgressFileData {
  const out: Unlock[] = [];
  const seen = new Map<string, Unlock>();
  for (const u of [...remote.unlocked, ...local.unlocked]) {
    const prev = seen.get(u.id);
    if (prev) prev.at = Math.min(prev.at, u.at);
    else {
      const c = { id: u.id, at: u.at };
      seen.set(u.id, c);
      out.push(c);
    }
  }
  return { version: 1, unlocked: out };
}

export function parseProgressFile(raw: unknown): ProgressFileData {
  const o = isPlainObject(raw) ? raw : {};
  return {
    version: 1,
    unlocked: arr(o.unlocked)
      .filter((u): u is Obj => isPlainObject(u) && typeof u.id === 'string')
      .map((u) => ({ id: u.id as string, at: num(u.at) })),
  };
}

/** The changed side wins (a broken rhythm resets to 0); if both changed, the larger value. */
export function mergeStreakFiles(base: StreakFileData | null, local: StreakFileData, remote: StreakFileData): StreakFileData {
  const l = local.celebrated;
  const r = remote.celebrated;
  if (l === r) return { celebrated: r };
  if (base) {
    if (l === base.celebrated) return { celebrated: r };
    if (r === base.celebrated) return { celebrated: l };
  }
  return { celebrated: Math.max(l, r) };
}

export function parseStreakFile(raw: unknown): StreakFileData {
  const o = isPlainObject(raw) ? raw : {};
  return { celebrated: Math.max(0, num(o.celebrated)) };
}
