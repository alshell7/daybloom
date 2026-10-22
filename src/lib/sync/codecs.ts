// What syncs, one file per store: how to read the store, parse the file, merge three ways and
// write the result back. The first nine are what GitHub Sync has always kept; the rest
// (the Trash, calendar marks, the AI setup, Alef, Retro, Landings) join when the app hands
// their stores over. Device-only parts (tracker app names, Alef's volume…) never leave.

import type { AlefFile } from '../addons/alef/alef.svelte';
import type { CrumbsFile } from '../addons/crumbs/migrate';
import type { LandingsFile } from '../addons/landings/pad.svelte';
import type { RealityFile } from '../addons/reality/reality';
import type { RetroFile } from '../addons/retro/retro.svelte';
import type { TrackerFile } from '../addons/tracker/types';
import type { WaqtFile } from '../addons/waqt/types';
import type { WorkData } from '../addons/work/types';
import type { AiFile } from '../ai/hub.svelte';
import type { Task } from '../engine/types';
import {
  applySharedTracker,
  crumbsUnused,
  mergeCrumbsFiles,
  mergeRealityFiles,
  mergeTrackerFiles,
  mergeWaqtFiles,
  mergeWorkFiles,
  parseCrumbsFile,
  parseRealityFile,
  parseWaqtFile,
  parseWorkFile,
  pickSharedTracker,
  realityUnused,
  trackerUnused,
  waqtUnused,
  workUnused,
  type SharedTrackerFile,
} from './addons';
import {
  alefUnused,
  applySharedAlef,
  applySharedLandings,
  calendarsUnused,
  mergeCalendarFiles,
  eventStatesUnused,
  landingsUnused,
  mergeAiFiles,
  mergeAlefFiles,
  mergeEventStateFiles,
  mergeLandingsFiles,
  mergeRetroFiles,
  mergeTrashFiles,
  pickSharedAlef,
  pickSharedLandings,
  retroUnused,
  trashUnused,
  type CalendarsData,
  type EventStateData,
  type SharedAlefFile,
  type SharedLandingsFile,
  type TrashData,
} from './extra';
import {
  applySharedSettings,
  mergeProgressFiles,
  mergeSettingsFiles,
  mergeStreakFiles,
  mergeTaskFiles,
  parseProgressFile,
  parseSettingsFile,
  parseStreakFile,
  parseTaskFile,
  pickSharedSettings,
  type ProgressFileData,
  type StreakFileData,
  type Tombstone,
} from './merge';

/** How the service reads and writes one store. `read` must return a plain copy. */
export interface Binding<T> {
  read(): T;
  write(value: T): void;
}

/** A store that brings its own parser (its `migrate`), for the files added later. */
export interface Synced<T> extends Binding<T> {
  parse(raw: unknown): T;
  /** True while this device has nothing worth writing (so no empty file appears). */
  unused?(value: T): boolean;
}

/** The keychain entries that may sync (with the vault on), and access to them. */
export interface SecretStore {
  /** Accounts this device knows about (AI services, calendar links). */
  accounts(): string[];
  get(account: string): Promise<string | null>;
  set(account: string, value: string): Promise<void>;
  delete(account: string): Promise<void>;
}

export interface SyncStores {
  tasks: Binding<{ version: 1; tasks: Task[]; deleted?: Tombstone[] }>;
  settings: Binding<object>;
  progress: Binding<{ version: 1; unlocked: { id: string; at: number }[]; viewedAt: number }>;
  streaks: Binding<{ celebrated: number }>;
  /** The Work addon's whole file ('addon-work'). */
  work: Binding<WorkData>;
  /** The Time Tracker addon's whole file ('addon-tracker'). */
  tracker: Binding<TrackerFile>;
  /** The Breadcrumbs addon's whole file ('addon-crumbs'). */
  crumbs: Binding<CrumbsFile>;
  /** The Reality check addon's whole file ('addon-reality'). */
  reality: Binding<RealityFile>;
  /** The Waqt addon's whole file ('addon-waqt'). */
  waqt: Binding<WaqtFile>;
  trash?: Synced<TrashData>;
  eventStates?: Synced<EventStateData>;
  ai?: Synced<AiFile>;
  alef?: Synced<AlefFile>;
  retro?: Synced<RetroFile>;
  landings?: Synced<LandingsFile>;
  /** Calendar subscriptions: only with the vault on, since their links sync as secrets. */
  calendars?: Synced<CalendarsData>;
  /** Only used when the vault is on: keys and links never sync in the clear. */
  secrets?: SecretStore;
  /**
   * Calls back after any change to the synced stores, but only while `active()` is true
   * (so nothing is watched for people who never turn sync on). Returns a stop function.
   */
  watch?(onChange: () => void, active: () => boolean): () => void;
}

export interface Codec<T> {
  key: string;
  file: string;
  /** On a first sync that chose "use the repo's", take the repo's copy as is. */
  replaceOnJoin: boolean;
  /** For an addon: true when this device never used it, so a missing remote file stays missing. */
  unused?(v: T): boolean;
  read(): T;
  write(v: T): void;
  parse(raw: unknown): T;
  merge(base: T | null, local: T, remote: T, baseAt?: number): T;
}

/** Every data file sync may write, for "does this place already have Daybloom data?". */
export const DATA_FILES = [
  'tasks.json',
  'settings.json',
  'progress.json',
  'streaks.json',
  'work.json',
  'tracker.json',
  'crumbs.json',
  'reality.json',
  'waqt.json',
  'trash.json',
  'event-states.json',
  'ai.json',
  'alef.json',
  'retro.json',
  'landings.json',
  'calendars.json',
  'secrets.json',
];

/** What a service can leave out (Settings › Sync). Your day and backlog always travel. */
export type SyncGroup = 'settings' | 'addons' | 'ai' | 'calendars' | 'keys';
export const SYNC_GROUPS: { id: SyncGroup; label: string; files: string[] }[] = [
  { id: 'settings', label: 'Settings and look', files: ['settings.json'] },
  { id: 'addons', label: 'Addons’ data', files: ['work.json', 'tracker.json', 'crumbs.json', 'reality.json', 'waqt.json', 'alef.json', 'retro.json', 'landings.json'] },
  { id: 'ai', label: 'AI setup', files: ['ai.json'] },
  { id: 'calendars', label: 'Calendar links', files: ['calendars.json'] },
  { id: 'keys', label: 'AI keys and calendar sign-ins', files: ['secrets.json'] },
];

/** Whether a file is left out by the service's choices. */
export function skippedFile(file: string, skip: readonly SyncGroup[]): boolean {
  return skip.some((g) => SYNC_GROUPS.find((x) => x.id === g)?.files.includes(file));
}

/** Keys of every base snapshot, for forgetting them all. */
export const BASE_KEYS = DATA_FILES.map((f) => f.replace(/\.json$/, ''));

/** A file whose store keeps its own shape: read, parse and write go straight through. */
function plainCodec<T>(key: string, b: Synced<T>, merge: Codec<T>['merge']): Codec<T> {
  return { key, file: `${key}.json`, replaceOnJoin: true, unused: b.unused, read: () => b.parse(b.read()), write: (v) => b.write(v), parse: (raw) => b.parse(raw), merge };
}

/** The files to sync. `sealed`: the vault is on, so calendar subscriptions join. */
export function codecs(s: SyncStores, opts: { sealed?: boolean } = {}): Codec<any>[] {
  const tasks: Codec<ReturnType<typeof parseTaskFile>> = {
    key: 'tasks',
    file: 'tasks.json',
    replaceOnJoin: true,
    read: () => parseTaskFile(s.tasks.read()),
    write: (v) => s.tasks.write(v),
    parse: parseTaskFile,
    merge: (b, l, r, at) => mergeTaskFiles(b, l, r, { baseAt: at }),
  };
  const shared: Codec<ReturnType<typeof parseSettingsFile>> = {
    key: 'settings',
    file: 'settings.json',
    replaceOnJoin: true,
    read: () => ({ version: 1, settings: pickSharedSettings(s.settings.read()) }),
    write: (v) => s.settings.write(applySharedSettings(s.settings.read(), v.settings)),
    parse: parseSettingsFile,
    merge: mergeSettingsFiles,
  };
  const progress: Codec<ProgressFileData> = {
    key: 'progress',
    file: 'progress.json',
    replaceOnJoin: false,
    read: () => parseProgressFile(s.progress.read()),
    write: (v) => s.progress.write({ ...s.progress.read(), unlocked: v.unlocked }),
    parse: parseProgressFile,
    merge: mergeProgressFiles,
  };
  const streaks: Codec<StreakFileData> = {
    key: 'streaks',
    file: 'streaks.json',
    replaceOnJoin: false,
    read: () => parseStreakFile(s.streaks.read()),
    write: (v) => s.streaks.write({ ...s.streaks.read(), celebrated: v.celebrated }),
    parse: parseStreakFile,
    merge: mergeStreakFiles,
  };
  const work: Codec<WorkData> = {
    key: 'work',
    file: 'work.json',
    replaceOnJoin: true,
    unused: workUnused,
    read: () => parseWorkFile(s.work.read()),
    write: (v) => s.work.write(v),
    parse: parseWorkFile,
    merge: mergeWorkFiles,
  };
  // App and title tracking stay out of tracker.json, so computers that differ never rewrite it.
  const tracker: Codec<SharedTrackerFile> = {
    key: 'tracker',
    file: 'tracker.json',
    replaceOnJoin: true,
    unused: trackerUnused,
    read: () => pickSharedTracker(s.tracker.read()),
    write: (v) => s.tracker.write(applySharedTracker(s.tracker.read(), v)),
    parse: pickSharedTracker,
    merge: (b, l, r) => pickSharedTracker(mergeTrackerFiles(b, l, r)),
  };
  const crumbs: Codec<CrumbsFile> = {
    key: 'crumbs',
    file: 'crumbs.json',
    replaceOnJoin: true,
    unused: crumbsUnused,
    read: () => parseCrumbsFile(s.crumbs.read()),
    write: (v) => s.crumbs.write(v),
    parse: parseCrumbsFile,
    merge: mergeCrumbsFiles,
  };
  const reality: Codec<RealityFile> = {
    key: 'reality',
    file: 'reality.json',
    replaceOnJoin: true,
    unused: realityUnused,
    read: () => parseRealityFile(s.reality.read()),
    write: (v) => s.reality.write(v),
    parse: parseRealityFile,
    merge: mergeRealityFiles,
  };
  const waqt: Codec<WaqtFile> = {
    key: 'waqt',
    file: 'waqt.json',
    replaceOnJoin: true,
    unused: waqtUnused,
    read: () => parseWaqtFile(s.waqt.read()),
    write: (v) => s.waqt.write(v),
    parse: parseWaqtFile,
    merge: mergeWaqtFiles,
  };
  const list: Codec<any>[] = [tasks, shared, progress, streaks, work, tracker, crumbs, reality, waqt];

  if (s.trash) list.push(plainCodec('trash', { unused: trashUnused, ...s.trash }, mergeTrashFiles));
  if (s.eventStates) list.push(plainCodec('event-states', { unused: eventStatesUnused, ...s.eventStates }, mergeEventStateFiles));
  if (s.ai) list.push(plainCodec('ai', s.ai, mergeAiFiles));
  if (s.alef) {
    const a = s.alef;
    const alef: Codec<SharedAlefFile> = {
      key: 'alef',
      file: 'alef.json',
      replaceOnJoin: true,
      unused: alefUnused,
      read: () => pickSharedAlef(a.parse(a.read())),
      write: (v) => a.write(applySharedAlef(a.read(), v)),
      parse: (raw) => pickSharedAlef(a.parse(raw)),
      merge: mergeAlefFiles,
    };
    list.push(alef);
  }
  if (s.retro) list.push(plainCodec('retro', { unused: retroUnused, ...s.retro }, mergeRetroFiles));
  if (s.landings) {
    const l = s.landings;
    const landings: Codec<SharedLandingsFile> = {
      key: 'landings',
      file: 'landings.json',
      replaceOnJoin: true,
      unused: landingsUnused,
      read: () => pickSharedLandings(l.parse(l.read())),
      write: (v) => l.write(applySharedLandings(l.read(), v)),
      parse: (raw) => pickSharedLandings(l.parse(raw)),
      merge: mergeLandingsFiles,
    };
    list.push(landings);
  }
  if (s.calendars && opts.sealed) list.push(plainCodec('calendars', { unused: calendarsUnused, ...s.calendars }, mergeCalendarFiles));
  return list;
}
