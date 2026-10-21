// Three-way merges for the rest of what syncs: the Trash, what you did with calendar events,
// the AI setup (services and routes, never keys), and the Alef, Retro and Landings addons.
// Same rules as the task merge: a side that changed something wins over one that didn't; an
// item removed on one side stays removed unless the other side edited it; when both changed
// the same thing, the newer timestamp wins. Pure, so tests can drive it.

import type { AlefFile } from '../addons/alef/alef.svelte';
import type { LandingsFile } from '../addons/landings/pad.svelte';
import type { RetroFile } from '../addons/retro/retro.svelte';
import type { AiFile } from '../ai/hub.svelte';
import type { CalendarAccount } from '../calendar/types';
import type { TrashItem } from '../stores/trash.svelte';
import { clone, deepEqual, mergeSet, mergeValue } from './merge';

/**
 * Lists of records with ids, three ways. `stamp` (e.g. a time) breaks ties when both sides
 * changed one record; the result keeps remote order, with local-only records after.
 */
export function mergeRecords<T>(
  base: readonly T[] | null,
  local: readonly T[],
  remote: readonly T[],
  key: (x: T) => string,
  stamp: (x: T) => number = () => 0,
  /** Both sides changed one record: combine them (default: the newer stamp wins). */
  both?: (b: T | undefined, l: T, r: T) => T,
): T[] {
  const B = new Map((base ?? []).map((x) => [key(x), x]));
  const L = new Map(local.map((x) => [key(x), x]));
  const R = new Map(remote.map((x) => [key(x), x]));
  const out: T[] = [];
  for (const k of new Set([...R.keys(), ...L.keys()])) {
    const b = B.get(k);
    const l = L.get(k);
    const r = R.get(k);
    if (l && r) {
      if (deepEqual(l, r) || (b && deepEqual(l, b))) out.push(clone(r));
      else if (b && deepEqual(r, b)) out.push(clone(l));
      else out.push(clone(both ? both(b, l, r) : stamp(l) > stamp(r) ? l : r));
    } else if (l) {
      // Not in the remote: new here (keep), or removed there (keep only if edited here).
      if (!b || !deepEqual(l, b)) out.push(clone(l));
    } else if (r) {
      if (!b || !deepEqual(r, b)) out.push(clone(r));
    }
  }
  return out;
}

/** Records keyed by name (`{ [key]: value }`), three ways, the same rules. */
export function mergeKeyed<V>(base: Record<string, V> | null, local: Record<string, V>, remote: Record<string, V>, stamp: (v: V) => number = () => 0): Record<string, V> {
  const toList = (o: Record<string, V>) => Object.entries(o).map(([k, v]) => ({ k, v }));
  const merged = mergeRecords(base ? toList(base) : null, toList(local), toList(remote), (x) => x.k, (x) => stamp(x.v));
  return Object.fromEntries(merged.map((x) => [x.k, x.v]));
}

/** A settings-like object: per key, nested objects per key too; remote wins a true tie. */
export function mergeObject<T extends object>(base: T | null, local: T, remote: T): T {
  return mergeValue(base ?? undefined, local, remote, !!base, false) as T;
}

/** An append-only log (no ids): the union of both sides, by `key`, in `order`. */
export function unionLog<T>(local: readonly T[], remote: readonly T[], key: (x: T) => string, order: (x: T) => number): T[] {
  const seen = new Map<string, T>();
  for (const x of [...remote, ...local]) if (!seen.has(key(x))) seen.set(key(x), clone(x));
  return [...seen.values()].sort((a, z) => order(a) - order(z));
}

// -- the Trash ---------------------------------------------------------------

export interface TrashData {
  version: 1;
  items: TrashItem[];
}

export function mergeTrashFiles(base: TrashData | null, local: TrashData, remote: TrashData): TrashData {
  const items = mergeRecords(base?.items ?? null, local.items, remote.items, (x) => x.id, (x) => x.at).sort((a, z) => a.at - z.at);
  return { version: 1, items: items.slice(-1000) };
}

export const trashUnused = (f: TrashData) => f.items.length === 0;

// -- calendar events you finished or skipped --------------------------------

export interface EventStateData {
  version: 1;
  states: Record<string, { at: number }>;
}

export function mergeEventStateFiles(base: EventStateData | null, local: EventStateData, remote: EventStateData): EventStateData {
  return { version: 1, states: mergeKeyed(base?.states ?? null, local.states, remote.states, (v) => v.at) };
}

export const eventStatesUnused = (f: EventStateData) => Object.keys(f.states).length === 0;

// -- the AI setup -------------------------------------------------------------
// Services (address, model) and which one each feature uses. Keys live in the keychain and,
// with the vault on, sync separately in secrets.json.

export function mergeAiFiles(base: AiFile | null, local: AiFile, remote: AiFile): AiFile {
  return mergeObject(base, local, remote);
}

// -- Alef -------------------------------------------------------------------
// Its look and your words to it are shared; how loud it is and whether it sits on the desktop
// widget stay with each device. Friendship is a union: every day spent together counts once,
// pets and chats keep the highest count, and the conversation keeps both sides' lines.

export const ALEF_DEVICE_SETTINGS = ['volume', 'inWidget'] as const;

export type SharedAlefFile = Omit<AlefFile, 'settings'> & { settings: Omit<AlefFile['settings'], (typeof ALEF_DEVICE_SETTINGS)[number]> };

export function pickSharedAlef(f: AlefFile): SharedAlefFile {
  const settings: Record<string, unknown> = { ...f.settings };
  for (const k of ALEF_DEVICE_SETTINGS) delete settings[k];
  return { ...clone(f), settings: settings as SharedAlefFile['settings'] };
}

export function applySharedAlef(full: AlefFile, shared: SharedAlefFile): AlefFile {
  const keep = Object.fromEntries(ALEF_DEVICE_SETTINGS.map((k) => [k, full.settings[k]]));
  return { ...clone(shared), settings: { ...clone(shared.settings), ...keep } as AlefFile['settings'] };
}

export function mergeAlefFiles(base: SharedAlefFile | null, local: SharedAlefFile, remote: SharedAlefFile): SharedAlefFile {
  const met = [local.met, remote.met].filter((d): d is string => !!d).sort()[0] ?? null;
  const days = [...new Set([...remote.bond.days, ...local.bond.days])].sort();
  const recent = unionLog(local.recent ?? [], remote.recent ?? [], (m) => `${m.at}|${m.who}|${m.text.slice(0, 80)}`, (m) => m.at).slice(-40);
  return {
    version: 1,
    met,
    bond: {
      days: days.slice(-400),
      pets: Math.max(local.bond.pets, remote.bond.pets),
      chats: Math.max(local.bond.chats, remote.bond.chats),
      celebrated: Math.max(local.bond.celebrated ?? 0, remote.bond.celebrated ?? 0),
    },
    recent,
    settings: mergeObject(base?.settings ?? null, local.settings, remote.settings),
  };
}

export const alefUnused = (f: SharedAlefFile) => !f.met && f.bond.days.length === 0 && !(f.recent?.length);

// -- Retro ------------------------------------------------------------------

export function mergeRetroFiles(base: RetroFile | null, local: RetroFile, remote: RetroFile): RetroFile {
  return {
    version: 1,
    journal: unionLog(local.journal, remote.journal, (j) => `${j.at}|${j.taskId}|${j.kind}`, (j) => j.at).slice(-1500),
    notes: mergeObject(base?.notes ?? null, local.notes, remote.notes),
    tries: mergeRecords(base?.tries ?? null, local.tries, remote.tries, (t) => t.id, (t) => t.at).slice(-40),
    offered: [local.offered, remote.offered].sort().pop() ?? '',
  };
}

export const retroUnused = (f: RetroFile) => f.journal.length === 0 && Object.keys(f.notes).length === 0 && f.tries.length === 0;

// -- Landings ---------------------------------------------------------------
// Settings and the log are shared; which stepping stones were offered lately stays here.

export type SharedLandingsFile = Omit<LandingsFile, 'recent'>;

export const pickSharedLandings = (f: LandingsFile): SharedLandingsFile => ({ version: 1, settings: clone(f.settings), log: clone(f.log) });

export const applySharedLandings = (full: LandingsFile, shared: SharedLandingsFile): LandingsFile => ({ ...clone(shared), recent: [...full.recent] });

export function mergeLandingsFiles(base: SharedLandingsFile | null, local: SharedLandingsFile, remote: SharedLandingsFile): SharedLandingsFile {
  const settings = mergeObject(base?.settings ?? null, local.settings, remote.settings);
  const stones = mergeSet(base?.settings.stones, local.settings.stones, remote.settings.stones) as string[] | undefined;
  return {
    version: 1,
    settings: { ...settings, stones: stones?.length ? stones : settings.stones },
    log: unionLog(local.log, remote.log, (x) => `${x.at}|${x.run}|${x.stone}`, (x) => x.at).slice(-400),
  };
}

export const landingsUnused = (f: SharedLandingsFile) => f.log.length === 0;

// -- calendar subscriptions -----------------------------------------------------
// Which calendars you follow and how they look. The links and sign-ins are secrets: they
// travel only inside the vault (secrets.json), so a plain repo never sees them.

export interface CalendarsData {
  version: 1;
  accounts: CalendarAccount[];
}

export function parseCalendars(raw: unknown): CalendarsData {
  const list = Array.isArray((raw as CalendarsData)?.accounts) ? (raw as CalendarsData).accounts : [];
  const accounts = list
    .filter((a) => typeof a?.id === 'string' && (a.provider === 'google' || a.provider === 'ics'))
    .map((a) => {
      const { url: _u, lastSyncAt: _t, error: _e, errorCode: _c, ...rest } = a;
      return { ...clone(rest), calendars: Array.isArray(rest.calendars) ? clone(rest.calendars).filter((c) => typeof c?.id === 'string') : [], enabled: rest.enabled !== false };
    });
  return { version: 1, accounts };
}

export function mergeCalendarFiles(base: CalendarsData | null, local: CalendarsData, remote: CalendarsData): CalendarsData {
  const accounts = mergeRecords(base?.accounts ?? null, local.accounts, remote.accounts, (a) => a.id, () => 0, (b, l, r) => {
    const merged = mergeObject(b ?? null, { ...l, calendars: [] }, { ...r, calendars: [] });
    return { ...merged, calendars: mergeRecords(b?.calendars ?? null, l.calendars, r.calendars, (c) => c.id) };
  });
  return { version: 1, accounts };
}

export const calendarsUnused = (f: CalendarsData) => f.accounts.length === 0;
