// Pure three-way merges for the addon files that sync with GitHub:
//
//   <folder>/work.json      the Work addon (clients, projects, assignments, invoices, …)
//   <folder>/tracker.json   the Time Tracker addon (entries and its settings)
//   <folder>/crumbs.json    Breadcrumbs (notes left on tasks, parked thoughts, its settings)
//   <folder>/reality.json   Reality check (how long finished blocks really took)
//   <folder>/waqt.json      Waqt (its settings and the prayers you marked)
//
// The MCP addon never syncs: its key and its activity list belong to one computer.
//
// Same contract as merge.ts: `base` is the snapshot both sides agreed on at the last
// sync, `local` is this device and `remote` the repo. With no base (a first sync, so
// also "combine both") the addon's empty file stands in for it: a setting still at its
// default counts as unchanged, so a computer that never touched it doesn't overrule
// one that did. No I/O, no clocks, no randomness. Files are parsed, and every merge
// result is normalised, through the addon's own migrate, so a garbled or future file
// is repaired and never reaches a store as it is.

import { migrateCrumbs, trim, type CrumbsFile } from '../addons/crumbs/migrate';
import { MAX_SAMPLES, migrateReality, type RealityFile, type Sample, type SampleSource } from '../addons/reality/reality';
import { migrateTrackerFile } from '../addons/tracker/migrate';
import type { AppTime, Entry, TrackerFile, TrackerSettings } from '../addons/tracker/types';
import { nextInvoiceNumber, parseInvoiceNumber, yearOf } from '../addons/work/invoices';
import { migrateWork, reconcileInvoicedKeys } from '../addons/work/migrate';
import { migrateWaqt } from '../addons/waqt/defaults';
import { PRAYERS, type Marked, type PrayerId, type WaqtFile } from '../addons/waqt/types';
import type { Invoice, WorkData } from '../addons/work/types';
import { byId, clone, deepEqual, pick, unionKeys } from './merge';

type Obj = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Shared rules

/**
 * Records by id. New on either side → kept. Gone on one side and untouched on the other
 * → gone; gone on one side but edited on the other → the edit wins. Changed on one side
 * only → that side. Changed on both → `both`. Order: the repo's, then this device's new ones.
 */
function mergeById<T extends { id: string }>(
  base: readonly T[],
  local: readonly T[],
  remote: readonly T[],
  both: (b: T | null, l: T, r: T) => T,
): T[] {
  const B = byId(base);
  const L = byId(local);
  const R = byId(remote);
  const out: T[] = [];
  for (const id of unionKeys(R, L)) {
    const b = B.get(id) ?? null;
    const l = L.get(id);
    const r = R.get(id);
    let v: T | null = null;
    if (l && r) {
      if (deepEqual(l, r) || (b && deepEqual(l, b))) v = r;
      else if (b && deepEqual(r, b)) v = l;
      else v = both(b, l, r);
    } else if (l) v = b && deepEqual(l, b) ? null : l;
    else if (r) v = b && deepEqual(r, b) ? null : r;
    if (v) out.push(clone(v));
  }
  return out;
}

/**
 * Field by field (or key by key, for a map): the side that changed a value wins; both
 * changed it → this device's. Each value is taken whole, so a rate or a budget is never
 * stitched together from both sides. Without a base (a record both sides added under
 * the same id), a value only one side has is kept and a clash keeps this device's.
 */
function mergeFields<T extends object>(base: T | null | undefined, local: T, remote: T): T {
  const hasBase = base != null;
  const b = (base ?? {}) as Obj;
  const l = local as Obj;
  const r = remote as Obj;
  const out: Obj = {};
  for (const k of unionKeys(l, r)) {
    const v = pick(b[k], l[k], r[k], hasBase, true);
    if (v !== undefined) out[k] = clone(v);
  }
  return out as T;
}

const compareIds = (a: string, z: string) => (a < z ? -1 : a > z ? 1 : 0);

// ---------------------------------------------------------------------------
// Time Tracker

/** Anything (a repo file, a store snapshot) → a valid tracker file. */
export function parseTrackerFile(raw: unknown): TrackerFile {
  return migrateTrackerFile(raw);
}

/**
 * Noting apps and window titles is an opt-in for one computer: turning it on at work must
 * not start recording on your laptop. These settings never travel between computers:
 * tracker.json leaves them out, and each computer keeps its own.
 */
export const TRACKER_DEVICE_SETTINGS = ['trackApps', 'trackTitles'] as const;
type DeviceSetting = (typeof TRACKER_DEVICE_SETTINGS)[number];

const deviceOnly = (s: Partial<TrackerSettings>): Partial<TrackerSettings> =>
  Object.fromEntries(TRACKER_DEVICE_SETTINGS.filter((k) => s[k] !== undefined).map((k) => [k, s[k]]));

/** What tracker.json holds: a tracker file without the settings that stay on each computer. */
export type SharedTrackerFile = Omit<TrackerFile, 'settings'> & { settings: Omit<TrackerSettings, DeviceSetting> };

/** The part of a tracker file (or of anything claiming to be one) that travels. */
export function pickSharedTracker(raw: unknown): SharedTrackerFile {
  const file = parseTrackerFile(raw);
  const settings: Partial<TrackerSettings> = { ...file.settings };
  for (const k of TRACKER_DEVICE_SETTINGS) delete settings[k];
  return { ...file, settings: settings as SharedTrackerFile['settings'] };
}

/** This computer's tracker file with a shared one applied. Its own settings are never touched. */
export function applySharedTracker(full: TrackerFile, shared: SharedTrackerFile): TrackerFile {
  return parseTrackerFile({ ...shared, settings: { ...shared.settings, ...deviceOnly(full.settings) } });
}

/** True when this device holds nothing worth a file (the addon was never used here). */
export function trackerUnused(file: SharedTrackerFile): boolean {
  return deepEqual(pickSharedTracker(file), pickSharedTracker(null));
}

const endKey = (e: Entry) => e.endMs ?? Infinity;
const byStart = (a: Entry, z: Entry) => a.startMs - z.startMs || compareIds(a.id, z.id);

/** App time only grows, so each app keeps the larger time either side saw (and its title). */
function maxActivity(winner: AppTime[] = [], other: AppTime[] = []): AppTime[] {
  const rows = new Map<string, AppTime>();
  for (const a of winner) rows.set(a.app, { ...a });
  for (const a of other) {
    const w = rows.get(a.app);
    if (!w) rows.set(a.app, { ...a });
    else if (a.ms > w.ms) rows.set(a.app, a.title || !w.title ? { ...a } : { ...a, title: w.title });
    else if (!w.title && a.title) w.title = a.title;
  }
  return [...rows.values()].sort((x, y) => y.ms - x.ms);
}

/** Both sides changed an entry: the later end wins (running counts as latest; a tie keeps local). */
function mergeEntry(local: Entry, remote: Entry): Entry {
  const [winner, other] = endKey(remote) > endKey(local) ? [remote, local] : [local, remote];
  const out = clone(winner);
  const activity = maxActivity(winner.activity, other.activity);
  if (activity.length) out.activity = activity;
  else delete out.activity;
  return out;
}

/**
 * At most one entry runs: the most recently started. Each older running entry ends where
 * the next running one starts (a switch, not an overlap); one that started at the same
 * instant has nothing left and goes. Mutates the entries it is given.
 */
function oneRunning(entries: Entry[]): Entry[] {
  const running = entries.filter((e) => e.endMs == null).sort(byStart);
  if (running.length < 2) return entries;
  const gone = new Set<Entry>();
  for (let i = 0; i < running.length - 1; i++) {
    const e = running[i];
    const next = running[i + 1];
    if (next.startMs > e.startMs) e.endMs = next.startMs;
    else gone.add(e);
  }
  return entries.filter((e) => !gone.has(e));
}

/**
 * Entries by id (see `mergeById`; both changed → `mergeEntry`), then the one-running rule.
 * Settings merge per field, except this computer's own (TRACKER_DEVICE_SETTINGS): those stay
 * as `local` has them, or at their defaults for shared files, which leave them out. The
 * result is in start order, as the store keeps it.
 */
export function mergeTrackerFiles(base: SharedTrackerFile | null, local: SharedTrackerFile, remote: SharedTrackerFile): TrackerFile {
  const b = base ?? parseTrackerFile(null);
  const entries = mergeById(b.entries, local.entries, remote.entries, (_b, l, r) => mergeEntry(l, r));
  return migrateTrackerFile({
    version: 1,
    entries: oneRunning(entries).sort(byStart),
    settings: { ...mergeFields(b.settings, local.settings, remote.settings), ...deviceOnly(local.settings) },
  });
}

// ---------------------------------------------------------------------------
// Work

/** Anything (a repo file, a store snapshot) → valid Work data. */
export function parseWorkFile(raw: unknown): WorkData {
  return migrateWork(raw);
}

/** True when this device holds nothing worth a file (the addon was never used here). */
export function workUnused(data: WorkData): boolean {
  return deepEqual(data, parseWorkFile(null));
}

/** What stands before `<year>-<seq>` in an invoice number, e.g. 'INV' in INV-2026-0003. */
function prefixOf(number: string, fallback: string): string {
  const n = number.trim();
  return parseInvoiceNumber(n) ? n.replace(/-?\d{4}-\d+$/, '') : fallback;
}

/**
 * Two computers can each issue the same number while apart. The older-created invoice
 * keeps it; each newer one takes the next free number for that year, keeping its prefix.
 * Mutates the invoices it is given.
 */
function renumberClashes(invoices: Invoice[], fallbackPrefix: string) {
  const taken = new Set<string>();
  const byAge = [...invoices].sort((a, z) => a.createdAt - z.createdAt || compareIds(a.id, z.id));
  for (const inv of byAge) {
    if (!inv.number) continue;
    if (taken.has(inv.number)) {
      const year = parseInvoiceNumber(inv.number)?.year ?? yearOf(inv.issueDate);
      inv.number = nextInvoiceNumber(invoices, year, prefixOf(inv.number, fallbackPrefix));
    }
    taken.add(inv.number);
  }
}

/**
 * Clients and projects by id (both changed → field by field, this device's on a clash),
 * invoices by id (both changed → the newer `updatedAt`, a tie keeps local), assignments
 * key by key, settings and profile field by field. Clashing invoice numbers are fixed,
 * and `invoicedKeys` is rebuilt from the merged invoices' lines — never merged — so no
 * work is billed twice and none is lost. Anything left pointing at a removed record is
 * cleaned up by the addon's migrate.
 */
export function mergeWorkFiles(base: WorkData | null, local: WorkData, remote: WorkData): WorkData {
  const b = base ?? parseWorkFile(null);
  const invoices = mergeById(b.invoices, local.invoices, remote.invoices, (_b, l, r) => (r.updatedAt > l.updatedAt ? r : l));
  const profile = mergeFields(b.profile, local.profile, remote.profile);
  renumberClashes(invoices, profile.invoicePrefix);
  return migrateWork({
    version: 1,
    clients: mergeById(b.clients, local.clients, remote.clients, mergeFields),
    projects: mergeById(b.projects, local.projects, remote.projects, mergeFields),
    assignments: mergeFields(b.assignments, local.assignments, remote.assignments),
    invoices,
    invoicedKeys: reconcileInvoicedKeys(invoices, {}),
    settings: mergeFields(b.settings, local.settings, remote.settings),
    profile,
  });
}

// ---------------------------------------------------------------------------
// Breadcrumbs

const byTime = <T extends { id: string; at: number }>(a: T, z: T) => a.at - z.at || compareIds(a.id, z.id);
const newer = <T extends { at: number }>(l: T, r: T) => (r.at > l.at ? r : l);

/** Anything (a repo file, a store snapshot) → a valid Breadcrumbs file, both lists in time order. */
export function parseCrumbsFile(raw: unknown): CrumbsFile {
  const f = migrateCrumbs(raw);
  return { ...f, crumbs: trim(f.crumbs.sort(byTime)), parked: f.parked.sort(byTime) };
}

/** True when this device holds nothing worth a file (the addon was never used here). */
export function crumbsUnused(file: CrumbsFile): boolean {
  return deepEqual(file, parseCrumbsFile(null));
}

/**
 * Notes and parked thoughts by id (see `mergeById`; both changed → the newer `at`, a tie
 * keeps local), so a thought let go or sent to the backlog on one computer goes on the
 * other too. Both lists in time order; notes then keep the addon's limits (the newest 20 a
 * task, 600 in all). Settings merge per field.
 */
export function mergeCrumbsFiles(base: CrumbsFile | null, local: CrumbsFile, remote: CrumbsFile): CrumbsFile {
  const b = base ?? parseCrumbsFile(null);
  return parseCrumbsFile({
    version: 1,
    crumbs: mergeById(b.crumbs, local.crumbs, remote.crumbs, (_b, l, r) => newer(l, r)),
    parked: mergeById(b.parked, local.parked, remote.parked, (_b, l, r) => newer(l, r)),
    settings: mergeFields(b.settings, local.settings, remote.settings),
  });
}

// ---------------------------------------------------------------------------
// Reality check

/** Anything (a repo file, a store snapshot) → a valid Reality check file, samples in time order. */
export function parseRealityFile(raw: unknown): RealityFile {
  const f = migrateReality(raw);
  return { ...f, samples: f.samples.sort(byTime) };
}

/** True when this device holds nothing worth a file (the addon was never used here). */
export function realityUnused(file: RealityFile): boolean {
  return deepEqual(file, parseRealityFile(null));
}

/** Measured time beats tick timing. */
const SOURCE_RANK: Record<SampleSource, number> = { tick: 0, focus: 1, tracked: 2 };

/**
 * Both sides hold a different sample for one finished block (often both computers saw the
 * same tick arrive, but only one had the focus session): the better source wins, then the
 * later tick, then this device's.
 */
function mergeSample(l: Sample, r: Sample): Sample {
  return (SOURCE_RANK[r.source] - SOURCE_RANK[l.source] || r.at - l.at) > 0 ? r : l;
}

/**
 * Focus time per `taskId@date` only grows, and each computer adds its own sessions. Changed
 * on one side → that side; on both → the base plus what each side added. With no base
 * (a first sync) the two may share history, so the larger value, never the sum.
 */
function mergeFocus(base: Record<string, number> | null, local: Record<string, number>, remote: Record<string, number>): Record<string, number> {
  const b = base ?? {};
  const out: Record<string, number> = {};
  for (const k of unionKeys(remote, local)) {
    const bv = b[k] ?? 0;
    const lv = local[k] ?? 0;
    const rv = remote[k] ?? 0;
    const v = lv === rv || rv === bv ? lv : lv === bv ? rv : base ? Math.max(lv, rv, lv + rv - bv) : Math.max(lv, rv);
    if (v > 0) out[k] = v;
  }
  return out;
}

/**
 * Samples by id (`taskId@date`; see `mergeById`, both changed → `mergeSample`), in time order,
 * keeping the newest 1500. Focus time adds up per task and day (`mergeFocus`). Past ticks
 * count as read in once either computer has read them.
 */
export function mergeRealityFiles(base: RealityFile | null, local: RealityFile, remote: RealityFile): RealityFile {
  const b = base ?? parseRealityFile(null);
  const samples = mergeById(b.samples, local.samples, remote.samples, (_b, l, r) => mergeSample(l, r)).sort(byTime);
  return parseRealityFile({
    version: 1,
    samples: samples.slice(-MAX_SAMPLES),
    focus: mergeFocus(base?.focus ?? null, local.focus, remote.focus),
    backfilledAt: Math.max(local.backfilledAt, remote.backfilledAt),
  });
}

// ---------------------------------------------------------------------------
// Waqt

/** Anything (a repo file, a store snapshot) → a valid Waqt file. */
export function parseWaqtFile(raw: unknown): WaqtFile {
  return migrateWaqt(raw);
}

/** True when this device holds nothing worth a file (the addon was never used here). */
export function waqtUnused(file: WaqtFile): boolean {
  return deepEqual(file, parseWaqtFile(null));
}

/** A jamaat mark says more than a plain one, and a plain one more than none. */
const MARK_RANK: Record<Marked, number> = { prayed: 1, jamaat: 2 };
const fuller = (l: Marked | undefined, r: Marked | undefined) => ((r ? MARK_RANK[r] : 0) > (l ? MARK_RANK[l] : 0) ? r : l);

/** Per day and prayer: the side that changed a mark wins; both changed → the fuller mark. */
function mergeMarks(base: WaqtFile['prayed'], local: WaqtFile['prayed'], remote: WaqtFile['prayed']): WaqtFile['prayed'] {
  const out: WaqtFile['prayed'] = {};
  for (const date of unionKeys(remote, local).sort()) {
    const day: Partial<Record<PrayerId, Marked>> = {};
    for (const id of PRAYERS) {
      const bv = base[date]?.[id];
      const lv = local[date]?.[id];
      const rv = remote[date]?.[id];
      const v = lv === rv || rv === bv ? lv : lv === bv ? rv : fuller(lv, rv);
      if (v) day[id] = v;
    }
    if (Object.keys(day).length) out[date] = day;
  }
  return out;
}

/**
 * Settings are one unit, so a place never ends up with another place's method or mosque
 * times: the side that changed them wins whole, and if both did, this device's (it writes
 * last). With no base, settings still at the defaults give way to the other side's.
 * Prayed marks merge per day and prayer (`mergeMarks`).
 */
export function mergeWaqtFiles(base: WaqtFile | null, local: WaqtFile, remote: WaqtFile): WaqtFile {
  const b = base ?? parseWaqtFile(null);
  return migrateWaqt({
    version: 1,
    settings: clone(pick(b.settings, local.settings, remote.settings, true, true)),
    prayed: mergeMarks(b.prayed, local.prayed, remote.prayed),
    detail: mergeDetail(b.detail ?? {}, local.detail ?? {}, remote.detail ?? {}),
  });
}

/** Per day and prayer: the side that changed it wins; both → the one marked last. */
function mergeDetail(base: WaqtFile['detail'], local: WaqtFile['detail'], remote: WaqtFile['detail']): WaqtFile['detail'] {
  const out: WaqtFile['detail'] = {};
  for (const date of unionKeys(remote, local).sort()) {
    const day: NonNullable<WaqtFile['detail'][string]> = {};
    for (const id of PRAYERS) {
      const [bv, lv, rv] = [base[date]?.[id], local[date]?.[id], remote[date]?.[id]];
      const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
      const v = same(lv, rv) || same(rv, bv) ? lv : same(lv, bv) ? rv : (rv?.at ?? 0) > (lv?.at ?? 0) ? rv : lv;
      if (v) day[id] = v;
    }
    if (Object.keys(day).length) out[date] = day;
  }
  return out;
}
