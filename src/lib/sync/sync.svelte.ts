// GitHub sync: keeps tasks, shared settings, progress and addon data the same on every
// computer by reading and writing small JSON files in a private repo the user owns.
//
//   <folder>/tasks.json        tasks + tombstones
//   <folder>/settings.json     the allow-listed settings (see SHARED_SETTINGS)
//   <folder>/progress.json     earned badges
//   <folder>/streaks.json      last celebrated rhythm milestone
//   <folder>/work.json         the Work addon (see ./addons.ts)
//   <folder>/tracker.json      the Time Tracker addon
//   <folder>/device-<id>.json  a heartbeat per computer (name, last sync)
//
// An addon file is only written once some computer has used that addon.
//
// Each sync lists the folder once, fetches only files whose sha moved, three-way merges
// them against the snapshot from the last sync (`sync-base-<file>`), writes back only
// what changed (with the sha, so a concurrent write from another device is detected and
// re-merged) and applies the result to the stores. Only the main window ever syncs.

import { untrack } from 'svelte';
import { platform, windowLabel } from '../platform';
import { progressFile } from '../stores/progress.svelte';
import { settings } from '../stores/settings.svelte';
import { streakFile } from '../stores/streaks.svelte';
import { taskFile } from '../stores/tasks.svelte';
import { trackerFile } from '../addons/tracker/tracker.svelte';
import type { TrackerFile } from '../addons/tracker/types';
import type { WorkData } from '../addons/work/types';
import { loadWork, workFile } from '../addons/work/work.svelte';
import type { Task } from '../engine/types';
import { mergeTrackerFiles, mergeWorkFiles, parseTrackerFile, parseWorkFile, trackerUnused, workUnused } from './addons';
import { createGitHubClient, GitHubError, parseRepo, type DirEntry, type FetchLike, type GitHubClient, type RepoInfo } from './github';
import {
  applySharedSettings,
  deepEqual,
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

/** Keychain account holding the personal access token. */
export const TOKEN_ACCOUNT = 'github-sync';
export const CONFIG_KEY = 'sync-config';
export const BASE_PREFIX = 'sync-base-';
export const TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new';

export const SYNC_INTERVAL_MS = 5 * 60_000;
/** Quiet time after the last local change before syncing it. */
export const SETTLE_MS = 20_000;
/** Focus / visibility only syncs if the last sync is at least this old. */
const FOCUS_GAP_MS = 60_000;
/** Refresh this device's heartbeat at least this often… */
const HEARTBEAT_MS = 6 * 3_600_000;
/** …or, when this sync wrote data anyway, if it's older than this. */
const HEARTBEAT_ON_WRITE_MS = 15 * 60_000;
/** Back-off before each attempt at writing one file (sha conflicts). */
const ATTEMPT_DELAYS = [0, 400, 1500];

const DATA_FILES = ['tasks.json', 'settings.json', 'progress.json', 'streaks.json', 'work.json', 'tracker.json'];
const BASE_KEYS = ['tasks', 'settings', 'progress', 'streaks', 'work', 'tracker'] as const;
type BaseKey = (typeof BASE_KEYS)[number];

export interface DeviceInfo {
  id: string;
  name: string;
  os: string;
  /** When that computer last wrote its heartbeat (ms). */
  lastSyncAt: number;
  sha?: string;
}

export interface SyncConfig {
  enabled: boolean;
  /** `owner/name`. */
  repo: string;
  branch: string;
  /** Folder in the repo, without slashes at the ends ('' = repo root). */
  folder: string;
  deviceId: string;
  deviceName: string;
  lastSyncAt: number | null;
  /** The repo@branch:folder this device last finished a sync with. Different → first sync. */
  syncedLoc: string | null;
  /** First sync with a repo that already has data: adopt the repo's copy, or combine. */
  join: 'replace' | 'merge';
  /** From the last connection test. */
  repoPrivate: boolean | null;
  devices: DeviceInfo[];
}

export type SyncStatus =
  | { state: 'idle' }
  | { state: 'syncing' }
  | { state: 'ok'; lastSyncAt: number }
  | { state: 'error'; message: string; kind: string };

export interface TestResult {
  repo: RepoInfo;
  /** The folder already holds Daybloom data. */
  hasData: boolean;
  deviceCount: number;
}

/** How the service reads and writes one store. `read` must return a plain copy. */
export interface Binding<T> {
  read(): T;
  write(value: T): void;
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
  /**
   * Calls back after any change to the synced stores, but only while `active()` is true
   * (so nothing is watched for people who never turn sync on). Returns a stop function.
   */
  watch?(onChange: () => void, active: () => boolean): () => void;
}

export interface SyncDeps {
  fetch: FetchLike;
  storage: { load(key: string): Promise<string | null>; save(key: string, value: string): Promise<void> };
  secrets: { get(account: string): Promise<string | null>; set(account: string, value: string): Promise<void>; delete(account: string): Promise<void> };
  stores(): SyncStores | Promise<SyncStores>;
  os?: string;
  /** False in windows that must never sync (the widget). */
  canSync?: () => boolean;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  newId?: () => string;
}

interface BaseRecord<T> {
  loc: string;
  sha: string | null;
  at: number;
  data: T;
}

interface Codec<T> {
  key: BaseKey;
  file: string;
  /** On a first sync that chose "use the repo's", take the repo's copy as is. */
  replaceOnJoin: boolean;
  /** For an addon: true when this device never used it, so a missing repo file stays missing. */
  unused?(v: T): boolean;
  read(): T;
  write(v: T): void;
  parse(raw: unknown): T;
  merge(base: T | null, local: T, remote: T, baseAt?: number): T;
}

function codecs(s: SyncStores): Codec<any>[] {
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
  const tracker: Codec<TrackerFile> = {
    key: 'tracker',
    file: 'tracker.json',
    replaceOnJoin: true,
    unused: trackerUnused,
    read: () => parseTrackerFile(s.tracker.read()),
    write: (v) => s.tracker.write(v),
    parse: parseTrackerFile,
    merge: mergeTrackerFiles,
  };
  return [tasks, shared, progress, streaks, work, tracker];
}

export function normalizeFolder(input: string): string {
  return (input ?? '')
    .replace(/\\/g, '/')
    .split('/')
    .map((p) => p.trim())
    .filter((p) => p && p !== '.' && p !== '..')
    .join('/');
}

const joinPath = (folder: string, file: string) => (folder ? `${folder}/${file}` : file);
const serialize = (data: unknown) => `${JSON.stringify(data, null, 2)}\n`;
const deviceIdOf = (name: string) => /^device-([A-Za-z0-9_-]{1,64})\.json$/.exec(name)?.[1] ?? null;

function defaultDeviceName(os?: string) {
  return os === 'mac' ? 'Mac' : os === 'windows' ? 'Windows PC' : os === 'linux' ? 'Linux PC' : 'This computer';
}

function randomId() {
  const c = (globalThis as any).crypto;
  if (c?.randomUUID) return (c.randomUUID() as string).replace(/-/g, '').slice(0, 12);
  return Math.random().toString(36).slice(2, 14);
}

function defaultConfig(): SyncConfig {
  return {
    enabled: false,
    repo: '',
    branch: 'main',
    folder: 'daybloom',
    deviceId: '',
    deviceName: '',
    lastSyncAt: null,
    syncedLoc: null,
    join: 'replace',
    repoPrivate: null,
    devices: [],
  };
}

/** Where a config points; base snapshots only count for the place they came from. */
function locationOf(c: SyncConfig): string {
  const ref = parseRepo(c.repo);
  return ref ? `${ref.owner.toLowerCase()}/${ref.repo.toLowerCase()}@${c.branch}:${normalizeFolder(c.folder)}` : '';
}

function formatClock(ms: number) {
  try {
    return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

/** Problems a retry won't fix on its own: wait for the user (token, repo, branch, file). */
const NEEDS_USER = new Set(['auth', 'forbidden', 'not-found', 'branch', 'invalid', 'setup']);

export type SyncService = ReturnType<typeof createSyncService>;

export function createSyncService(deps: SyncDeps) {
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const newId = deps.newId ?? randomId;
  const canSync = deps.canSync ?? (() => true);

  const state = $state({
    config: defaultConfig(),
    status: { state: 'idle' } as SyncStatus,
    hasToken: false,
    ready: false,
  });

  // The token lives in the keychain and in this closure — never in reactive state or on disk.
  let token: string | null = null;
  let client: { key: string; gh: GitHubClient } | null = null;
  let inited: Promise<void> | null = null;
  let running: Promise<void> | null = null;
  let paused = false;
  let blockedUntil = 0;
  const bases = new Map<BaseKey, BaseRecord<unknown> | null>();

  function init(): Promise<void> {
    return (inited ??= (async () => {
      let cfg = defaultConfig();
      try {
        const raw = await deps.storage.load(CONFIG_KEY);
        if (raw) cfg = { ...cfg, ...JSON.parse(raw) };
      } catch {
        /* unreadable: start over */
      }
      if (!Array.isArray(cfg.devices)) cfg.devices = [];
      // Saved with the first configure(), so nothing is written for people who never sync.
      if (!cfg.deviceId) cfg.deviceId = newId();
      if (!cfg.deviceName) cfg.deviceName = defaultDeviceName(deps.os);
      state.config = cfg;
      // No keychain access at all for people who never set sync up.
      if (cfg.repo) token = (await deps.secrets.get(TOKEN_ACCOUNT).catch(() => null)) || null;
      state.hasToken = !!token;
      if (cfg.enabled && cfg.lastSyncAt) state.status = { state: 'ok', lastSyncAt: cfg.lastSyncAt };
      state.ready = true;
    })());
  }

  async function persistConfig() {
    await deps.storage.save(CONFIG_KEY, JSON.stringify($state.snapshot(state.config))).catch(() => {});
  }

  function github(): GitHubClient | null {
    const ref = parseRepo(state.config.repo);
    if (!ref || !token) return null;
    const key = `${token}\n${ref.owner}/${ref.repo}@${state.config.branch}`;
    if (client?.key !== key) {
      client = { key, gh: createGitHubClient({ ...ref, branch: state.config.branch, token, fetch: deps.fetch, now }) };
    }
    return client.gh;
  }

  // -- base snapshots -------------------------------------------------------

  async function loadBase<T>(c: Codec<T>, loc: string): Promise<BaseRecord<T> | null> {
    if (!bases.has(c.key)) {
      let rec: BaseRecord<unknown> | null = null;
      try {
        const raw = await deps.storage.load(BASE_PREFIX + c.key);
        if (raw) rec = JSON.parse(raw);
      } catch {
        rec = null;
      }
      bases.set(c.key, rec);
    }
    const rec = bases.get(c.key);
    if (!rec || rec.loc !== loc) return null;
    return { ...rec, data: c.parse(rec.data) };
  }

  async function saveBase<T>(c: Codec<T>, rec: BaseRecord<T>) {
    const prev = bases.get(c.key);
    if (prev && prev.loc === rec.loc && prev.sha === rec.sha && deepEqual(c.parse(prev.data), rec.data)) return;
    bases.set(c.key, rec);
    await deps.storage.save(BASE_PREFIX + c.key, JSON.stringify(rec));
  }

  /** Whether anything local differs from what was last synced. */
  async function isDirty(): Promise<boolean> {
    const loc = locationOf(state.config);
    const stores = await deps.stores();
    for (const c of codecs(stores)) {
      const base = await loadBase(c, loc);
      if (!base || !deepEqual(c.read(), base.data)) return true;
    }
    return false;
  }

  // -- one sync -------------------------------------------------------------

  function commitMessage() {
    return `Daybloom sync from ${state.config.deviceName || 'a computer'}`;
  }

  function parseRemote<T>(c: Codec<T>, text: string): T {
    try {
      return c.parse(JSON.parse(text));
    } catch {
      throw new GitHubError('invalid', `${c.file} in the repo isn't valid JSON. Fix or delete it on GitHub and Daybloom will write it again.`);
    }
  }

  /** Merge one file with the repo, write it back if needed, apply it here. True if it wrote. */
  async function syncFile<T>(gh: GitHubClient, c: Codec<T>, folder: string, loc: string, listedSha: string | null, replace: boolean): Promise<boolean> {
    const path = joinPath(folder, c.file);
    const base = await loadBase(c, loc);
    let remoteSha = listedSha;
    // undefined = not fetched yet; null = not in the repo.
    let remote: T | null | undefined = listedSha === null ? null : base && base.sha === listedSha ? base.data : undefined;

    for (let attempt = 0; attempt < ATTEMPT_DELAYS.length; attempt++) {
      if (attempt > 0) {
        await sleep(ATTEMPT_DELAYS[attempt]);
        remote = undefined;
      }
      if (remote === undefined) {
        const f = await gh.getFile(path);
        remoteSha = f?.sha ?? null;
        remote = f ? parseRemote(c, f.text) : null;
      }
      const local = c.read();
      if (remote === null && c.unused?.(local)) {
        // Nothing here and nothing there: no empty file. The base records that both were empty.
        await saveBase(c, { loc, sha: null, at: now(), data: local });
        return false;
      }
      let merged: T;
      if (remote === null) merged = local;
      else if (!base && replace && c.replaceOnJoin) merged = remote;
      else merged = c.merge(base?.data ?? null, local, remote, base?.at);

      let sha = remoteSha;
      let wrote = false;
      if (remote === null || !deepEqual(merged, remote)) {
        try {
          sha = (await gh.putFile(path, serialize(merged), remoteSha, commitMessage())).sha || null;
          wrote = true;
        } catch (e) {
          if (e instanceof GitHubError && e.kind === 'conflict') continue;
          throw e;
        }
      }
      // Fold in anything changed here while we were on the network, then apply.
      const current = c.read();
      const next = deepEqual(current, local) ? merged : c.merge(local, current, merged);
      if (!deepEqual(next, current)) c.write(next);
      await saveBase(c, { loc, sha, at: now(), data: merged });
      return wrote;
    }
    throw new GitHubError('conflict', 'Another computer kept saving at the same moment. Daybloom will try again shortly.', 409);
  }

  async function syncDevices(gh: GitHubClient, folder: string, listing: DirEntry[], wrote: boolean) {
    const cfg = state.config;
    const known = new Map(cfg.devices.map((d) => [d.id, d]));
    const devices: DeviceInfo[] = [];
    let mineSha: string | null = null;
    for (const e of listing) {
      const id = e.type === 'file' ? deviceIdOf(e.name) : null;
      if (!id) continue;
      if (id === cfg.deviceId) mineSha = e.sha;
      const k = known.get(id);
      if (k && k.sha === e.sha) {
        devices.push(k);
        continue;
      }
      try {
        const f = await gh.getFile(e.path);
        if (!f) continue;
        const raw = JSON.parse(f.text);
        devices.push({
          id,
          name: typeof raw?.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 60) : 'A computer',
          os: typeof raw?.os === 'string' ? raw.os : 'other',
          lastSyncAt: Number(raw?.lastSyncAt) || 0,
          sha: f.sha,
        });
      } catch (err) {
        if (err instanceof GitHubError && (NEEDS_USER.has(err.kind) || err.kind === 'rate-limit')) throw err;
      }
    }

    const t = now();
    const i = devices.findIndex((d) => d.id === cfg.deviceId);
    const mine = i >= 0 ? devices[i] : null;
    const age = mine ? t - mine.lastSyncAt : Infinity;
    if (!mine || mine.name !== cfg.deviceName || age > HEARTBEAT_MS || (wrote && age > HEARTBEAT_ON_WRITE_MS)) {
      const info = { id: cfg.deviceId, name: cfg.deviceName, os: deps.os ?? 'other', lastSyncAt: t };
      try {
        const res = await gh.putFile(
          joinPath(folder, `device-${cfg.deviceId}.json`),
          serialize({ app: 'daybloom', ...info }),
          mineSha,
          commitMessage(),
        );
        const d = { ...info, sha: res.sha };
        if (i >= 0) devices[i] = d;
        else devices.push(d);
      } catch (err) {
        // A heartbeat can wait for the next sync; only problems the user must fix surface.
        if (err instanceof GitHubError && (NEEDS_USER.has(err.kind) || err.kind === 'rate-limit')) throw err;
      }
    }
    devices.sort((a, z) => (a.id === cfg.deviceId ? -1 : z.id === cfg.deviceId ? 1 : z.lastSyncAt - a.lastSyncAt || a.id.localeCompare(z.id)));
    cfg.devices = devices;
  }

  function setError(e: unknown) {
    if (e instanceof GitHubError) {
      let message = e.message;
      if (e.kind === 'rate-limit') {
        blockedUntil = e.retryAt ?? now() + 60_000;
        const at = formatClock(blockedUntil);
        message = `GitHub asked Daybloom to slow down. ${at ? `Trying again after ${at}.` : 'Trying again soon.'}`;
      }
      if (NEEDS_USER.has(e.kind)) paused = true;
      state.status = { state: 'error', kind: e.kind, message };
      return;
    }
    const message = e instanceof Error && e.message ? e.message : 'Something went wrong while syncing.';
    state.status = { state: 'error', kind: 'other', message };
  }

  async function syncOnce() {
    await init();
    const cfg = state.config;
    if (!cfg.enabled || !canSync()) return;
    const gh = github();
    if (!gh) {
      paused = true;
      state.status = {
        state: 'error',
        kind: 'setup',
        message: token ? 'Enter the repo as owner/name to start syncing.' : 'Paste a token to start syncing.',
      };
      return;
    }
    if (now() < blockedUntil) {
      state.status = {
        state: 'error',
        kind: 'rate-limit',
        message: `GitHub asked Daybloom to slow down. Trying again after ${formatClock(blockedUntil)}.`,
      };
      return;
    }
    state.status = { state: 'syncing' };
    try {
      const stores = await deps.stores();
      const loc = locationOf(cfg);
      const folder = normalizeFolder(cfg.folder);
      const replace = cfg.join === 'replace' && cfg.syncedLoc !== loc;
      const listing = await gh.listDir(folder);
      const shaOf = (file: string) => listing.find((e) => e.type === 'file' && e.name === file)?.sha ?? null;
      let wrote = false;
      for (const c of codecs(stores)) {
        if (await syncFile(gh, c, folder, loc, shaOf(c.file), replace)) wrote = true;
      }
      await syncDevices(gh, folder, listing, wrote);
      if (locationOf(state.config) !== loc) return; // moved to another repo meanwhile
      const at = now();
      cfg.lastSyncAt = at;
      cfg.syncedLoc = loc;
      paused = false;
      blockedUntil = 0;
      await persistConfig();
      state.status = { state: 'ok', lastSyncAt: at };
    } catch (e) {
      setError(e);
    }
  }

  function run(): Promise<void> {
    if (running) return running;
    running = (async () => {
      try {
        await syncOnce();
      } finally {
        running = null;
      }
    })();
    return running;
  }

  /** Background trigger: stays quiet while a problem waits for the user. */
  function auto() {
    if (!state.ready || !state.config.enabled || paused || now() < blockedUntil) return;
    void run();
  }

  // -- public actions -------------------------------------------------------

  async function configure(patch: Partial<Pick<SyncConfig, 'repo' | 'branch' | 'folder' | 'deviceName'>>) {
    await init();
    const c = state.config;
    const before = locationOf(c);
    if (patch.repo !== undefined) {
      const ref = parseRepo(patch.repo);
      c.repo = ref ? `${ref.owner}/${ref.repo}` : patch.repo.trim();
    }
    if (patch.branch !== undefined) c.branch = patch.branch.trim() || 'main';
    if (patch.folder !== undefined) c.folder = normalizeFolder(patch.folder);
    if (patch.deviceName !== undefined) c.deviceName = patch.deviceName.trim().slice(0, 60) || defaultDeviceName(deps.os);
    if (locationOf(c) !== before) {
      // A different place: nothing synced there yet, and it needs a fresh go-ahead.
      c.enabled = false;
      c.devices = [];
      c.lastSyncAt = null;
      c.repoPrivate = null;
      client = null;
      paused = false;
      blockedUntil = 0;
      state.status = { state: 'idle' };
    }
    await persistConfig();
  }

  async function saveToken(value: string) {
    await init();
    const v = value.trim();
    if (!v) throw new Error('Paste a token first.');
    if (/\s/.test(v) || v.length < 20) throw new Error("That doesn't look like a GitHub token.");
    await deps.secrets.set(TOKEN_ACCOUNT, v);
    token = v;
    client = null;
    paused = false;
    state.hasToken = true;
    if (state.status.state === 'error') state.status = { state: 'idle' };
  }

  /** Checks the token can see the repo; reports privacy and whether data is already there. */
  async function test(): Promise<TestResult> {
    await init();
    const gh = github();
    if (!gh) throw new Error(token ? 'Enter the repo as owner/name.' : 'Paste a token first.');
    const repo = await gh.getRepo();
    const listing = await gh.listDir(normalizeFolder(state.config.folder));
    const files = new Set(listing.filter((e) => e.type === 'file').map((e) => e.name));
    state.config.repoPrivate = repo.private;
    await persistConfig();
    paused = false;
    return {
      repo,
      hasData: DATA_FILES.some((f) => files.has(f)),
      deviceCount: listing.filter((e) => e.type === 'file' && deviceIdOf(e.name)).length,
    };
  }

  async function enable(on: boolean, join?: 'replace' | 'merge') {
    await init();
    state.config.enabled = on;
    if (join) state.config.join = join;
    paused = false;
    await persistConfig();
    if (on) await run();
    else {
      await running?.catch(() => {});
      state.status = { state: 'idle' };
    }
  }

  /** Manual "Sync now": also retries after a problem that paused background syncs. */
  function syncNow(): Promise<void> {
    paused = false;
    return run();
  }

  /** Forget the token and every sync snapshot on this computer. The repo is left as it is. */
  async function disconnect() {
    await init();
    await running?.catch(() => {});
    token = null;
    client = null;
    state.hasToken = false;
    await deps.secrets.delete(TOKEN_ACCOUNT).catch(() => {});
    bases.clear();
    for (const k of BASE_KEYS) await deps.storage.save(BASE_PREFIX + k, '').catch(() => {});
    const { deviceId, deviceName, repo, branch, folder } = state.config;
    state.config = { ...defaultConfig(), deviceId, deviceName, repo, branch, folder };
    paused = false;
    blockedUntil = 0;
    state.status = { state: 'idle' };
    await persistConfig();
  }

  /** Background syncing: on start, every 5 min, after local changes settle, on focus/online. */
  function start(): () => void {
    let stopped = false;
    let settle: ReturnType<typeof setTimeout> | null = null;
    let unwatch: (() => void) | undefined;

    const interval = setInterval(auto, SYNC_INTERVAL_MS);
    const onFocus = () => {
      if (now() - (state.config.lastSyncAt ?? 0) > FOCUS_GAP_MS) auto();
    };
    const onOnline = () => {
      if (state.status.state === 'error' && state.status.kind === 'network') state.status = { state: 'idle' };
      auto();
    };
    const onVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') onFocus();
    };
    const hasWindow = typeof window !== 'undefined' && typeof window.addEventListener === 'function';
    if (hasWindow) {
      window.addEventListener('focus', onFocus);
      window.addEventListener('online', onOnline);
      document.addEventListener('visibilitychange', onVisibility);
    }

    Promise.resolve(deps.stores())
      .then((s) => {
        if (stopped) return;
        unwatch = s.watch?.(
          () => {
            if (settle) clearTimeout(settle);
            settle = setTimeout(async () => {
              settle = null;
              if (stopped || !state.config.enabled) return;
              if (await isDirty().catch(() => true)) auto();
            }, SETTLE_MS);
          },
          () => state.ready && state.config.enabled,
        );
      })
      .catch(() => {});

    init().then(() => {
      if (!stopped) auto();
    });

    return () => {
      stopped = true;
      clearInterval(interval);
      if (settle) clearTimeout(settle);
      unwatch?.();
      if (hasWindow) {
        window.removeEventListener('focus', onFocus);
        window.removeEventListener('online', onOnline);
        document.removeEventListener('visibilitychange', onVisibility);
      }
    };
  }

  return {
    get config(): Readonly<SyncConfig> {
      return state.config;
    },
    get status(): SyncStatus {
      return state.status;
    },
    get hasToken() {
      return state.hasToken;
    },
    get ready() {
      return state.ready;
    },
    get devices(): readonly DeviceInfo[] {
      return state.config.devices;
    },
    /** True until this computer has finished one sync with the configured repo/branch/folder. */
    get firstSync() {
      return state.config.syncedLoc !== locationOf(state.config);
    },
    /** A token is saved and the repo name parses. */
    get configured() {
      return state.hasToken && !!parseRepo(state.config.repo);
    },
    init,
    configure,
    saveToken,
    test,
    enable,
    syncNow,
    disconnect,
    start,
  };
}

// ---------------------------------------------------------------------------
// The app's instance, bound to the real stores, keychain and native fetch.

function plain<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

let appStores: Promise<SyncStores> | null = null;

function bindApp(): Promise<SyncStores> {
  return (appStores ??= (async () => {
    // Read anything the planner hasn't loaded yet (streaks and the addons load lazily, and
    // an addon that is switched off is never loaded), so a sync never writes defaults over
    // data that's sitting on disk. The Work store starts its load on import; `loadWork`
    // shares that one rather than reading the file twice.
    await Promise.all([
      ...[taskFile, settings, progressFile, streakFile, trackerFile].filter((s) => !s.ready).map((s) => s.load()),
      workFile.ready ? null : loadWork(),
    ]);
    const bind = <T>(s: { value: T }): Binding<T> => ({
      read: () => plain(s.value),
      write: (v) => {
        s.value = plain(v);
      },
    });
    return {
      tasks: bind(taskFile),
      settings: bind(settings),
      progress: bind(progressFile),
      streaks: bind(streakFile),
      work: bind(workFile),
      tracker: bind(trackerFile),
      watch(onChange, active) {
        return $effect.root(() => {
          $effect(() => {
            if (!active()) return;
            JSON.stringify(taskFile.value);
            JSON.stringify(settings.value);
            JSON.stringify(progressFile.value);
            JSON.stringify(streakFile.value);
            JSON.stringify(workFile.value);
            JSON.stringify(trackerFile.value);
            untrack(onChange);
          });
        });
      },
    };
  })());
}

export const githubSync = createSyncService({
  fetch: (input, init) => platform.fetch(input, init),
  storage: { load: (k) => platform.load(k), save: (k, v) => platform.save(k, v) },
  secrets: platform.secrets,
  stores: bindApp,
  os: platform.os,
  canSync: () => windowLabel() === 'main',
});

/** Call once from the main window after the stores have loaded. Returns a stop function. */
export function startSync(): () => void {
  if (windowLabel() !== 'main') return () => {};
  return githubSync.start();
}
