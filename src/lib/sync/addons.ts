// Pure three-way merges for the addon files that sync with GitHub:
//
//   <folder>/work.json      the Work addon (clients, projects, assignments, invoices, …)
//   <folder>/tracker.json   the Time Tracker addon (entries and its settings)
//
// Same contract as merge.ts: `base` is the snapshot both sides agreed on at the last
// sync, `local` is this device and `remote` the repo. With no base (a first sync, so
// also "combine both") the addon's empty file stands in for it: a setting still at its
// default counts as unchanged, so a computer that never touched it doesn't overrule
// one that did. No I/O, no clocks, no randomness. Files are parsed, and every merge
// result is normalised, through the addon's own migrate, so a garbled or future file
// is repaired and never reaches a store as it is.

import { migrateTrackerFile } from '../addons/tracker/migrate';
import type { AppTime, Entry, TrackerFile } from '../addons/tracker/types';
import { nextInvoiceNumber, parseInvoiceNumber, yearOf } from '../addons/work/invoices';
import { migrateWork, reconcileInvoicedKeys } from '../addons/work/migrate';
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

/** True when this device holds nothing worth a file (the addon was never used here). */
export function trackerUnused(file: TrackerFile): boolean {
  return deepEqual(file, parseTrackerFile(null));
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
 * Settings merge per field. The result is in start order, as the store keeps it.
 */
export function mergeTrackerFiles(base: TrackerFile | null, local: TrackerFile, remote: TrackerFile): TrackerFile {
  const b = base ?? parseTrackerFile(null);
  const entries = mergeById(b.entries, local.entries, remote.entries, (_b, l, r) => mergeEntry(l, r));
  return migrateTrackerFile({
    version: 1,
    entries: oneRunning(entries).sort(byStart),
    settings: { ...mergeFields(b.settings, local.settings, remote.settings), ...deviceOnly(local.settings) },
  });
}

/**
 * Noting apps and window titles is an opt-in for one computer: turning it on at work must
 * not start recording on your laptop. These settings never travel between computers.
 */
export const TRACKER_DEVICE_SETTINGS = ['trackApps', 'trackTitles'] as const;

function deviceOnly(s: TrackerFile['settings']): Partial<TrackerFile['settings']> {
  return Object.fromEntries(TRACKER_DEVICE_SETTINGS.map((k) => [k, s[k]]));
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
