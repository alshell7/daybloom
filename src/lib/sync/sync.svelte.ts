// Sync: keeps tasks, settings, progress, addon data, the Trash, the AI setup and more the
// same on every device, through a service the user owns. Two can run, alone or together:
//
//   GitHub Sync     small JSON files in a private repo (optionally sealed with the vault,
//                   in a `vault` folder beside the plain one)
//   Cloudflare D1   a table in the user's own D1 database, always sealed with the vault
//
// One master password guards both: the vault (./vault.ts) is shared, so a device unlocked
// once syncs everything, and secrets (AI keys, calendar links) travel only inside it. The
// engine (./engine.svelte.ts) does the work; this file says where each service keeps its
// data and binds the engine to the app's stores, keychain and native fetch. Only the main
// window ever syncs.

import { untrack } from 'svelte';
import { migrateAlef, alefFile } from '../addons/alef/alef.svelte';
import { crumbsFile } from '../addons/crumbs/crumbs.svelte';
import { landingsFile, migrateLandings } from '../addons/landings/pad.svelte';
import { realityFile } from '../addons/reality/reality.svelte';
import { migrateRetro, retroFile } from '../addons/retro/retro.svelte';
import { trackerFile } from '../addons/tracker/tracker.svelte';
import { waqtFile } from '../addons/waqt/waqt.svelte';
import { loadWork, workFile } from '../addons/work/work.svelte';
import { aiFile, DEFAULT_AI, migrateAi } from '../ai/hub.svelte';
import { platform, windowLabel } from '../platform';
import { eventStateFile, migrateEventStates } from '../stores/eventStates.svelte';
import { progressFile } from '../stores/progress.svelte';
import { settings } from '../stores/settings.svelte';
import { streakFile } from '../stores/streaks.svelte';
import { taskFile } from '../stores/tasks.svelte';
import { migrateTrash, trashFile } from '../stores/trash.svelte';
import type { Binding, SecretStore, Synced, SyncStores } from './codecs';
import { createD1Account, createD1Client, validAccountId, validDatabaseId, D1_DEFAULT_NAME, type D1Client, type D1Database } from './d1';
import {
  createLock,
  createSyncEngine,
  secureVaultKeeper,
  type CommonConfig,
  type SyncBackend,
  type SyncDeps,
  type TestResult,
} from './engine.svelte';
import { createGitHubClient, githubRemote, parseRepo, type GitHubClient, type RepoInfo } from './github';
import { deepEqual } from './merge';

export type { Binding, SyncStores } from './codecs';
export type { DeviceInfo, SyncStatus } from './engine.svelte';
export { SETTLE_MS, SYNC_INTERVAL_MS } from './engine.svelte';

/** Keychain account holding the GitHub personal access token. */
export const TOKEN_ACCOUNT = 'github-sync';
export const CONFIG_KEY = 'sync-config';
export const BASE_PREFIX = 'sync-base-';
export const TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new';

/** Keychain account holding the Cloudflare API token. */
export const D1_TOKEN_ACCOUNT = 'd1-sync';
export const D1_CONFIG_KEY = 'sync-d1-config';
export const D1_BASE_PREFIX = 'sync-d1-base-';

/** Keychain account holding the unlocked vault (its key and public record). */
export const VAULT_ACCOUNT = 'sync-vault';
/** The folder, inside the sync folder, where a sealed repo keeps its files. */
export const VAULT_DIR = 'vault';

export function normalizeFolder(input: string): string {
  return (input ?? '')
    .replace(/\\/g, '/')
    .split('/')
    .map((p) => p.trim())
    .filter((p) => p && p !== '.' && p !== '..')
    .join('/');
}

const joinPath = (folder: string, file: string) => (folder ? `${folder}/${file}` : file);

function defaultDeviceName(os?: string) {
  return os === 'mac' ? 'Mac' : os === 'windows' ? 'Windows PC' : os === 'android' ? 'Android phone' : os === 'linux' ? 'Linux PC' : 'This computer';
}

// -- GitHub ------------------------------------------------------------------

export interface GitHubPlace {
  /** `owner/name`. */
  repo: string;
  branch: string;
  /** Folder in the repo, without slashes at the ends ('' = repo root). */
  folder: string;
  /** From the last connection test. */
  repoPrivate: boolean | null;
}

export type SyncConfig = CommonConfig & GitHubPlace;

export const githubBackend: SyncBackend<GitHubPlace, RepoInfo> = {
  id: 'github',
  service: 'GitHub',
  configKey: CONFIG_KEY,
  basePrefix: BASE_PREFIX,
  tokenAccount: TOKEN_ACCOUNT,
  alwaysSealed: false,
  defaults: () => ({ repo: '', branch: 'main', folder: 'daybloom', repoPrivate: null }),
  normalize(c, p) {
    if (p.repo !== undefined) {
      const ref = parseRepo(p.repo);
      c.repo = ref ? `${ref.owner}/${ref.repo}` : p.repo.trim();
    }
    if (p.branch !== undefined) c.branch = p.branch.trim() || 'main';
    if (p.folder !== undefined) c.folder = normalizeFolder(p.folder);
    if (p.repo !== undefined || p.branch !== undefined || p.folder !== undefined) c.repoPrivate = c.repoPrivate ?? null;
  },
  location(c) {
    const ref = parseRepo(c.repo);
    return ref ? `${ref.owner.toLowerCase()}/${ref.repo.toLowerCase()}@${c.branch}:${normalizeFolder(c.folder)}` : '';
  },
  started: (c) => !!c.repo,
  checkToken: (v) => (/\s/.test(v) || v.length < 20 ? "That doesn't look like a GitHub token." : null),
  setupHint: (_c, hasToken) => (hasToken ? 'Enter the repo as owner/name to start syncing.' : 'Paste a token to start syncing.'),
  connect(c, token, ctx, sealed) {
    const ref = parseRepo(c.repo);
    if (!ref) return null;
    const key = `${token}\n${ref.owner}/${ref.repo}@${c.branch}`;
    let gh = ctx.cache.get(key) as GitHubClient | undefined;
    if (!gh) {
      ctx.cache.clear();
      gh = createGitHubClient({ ...ref, branch: c.branch, token, fetch: ctx.fetch, now: ctx.now });
      ctx.cache.set(key, gh);
    }
    const folder = normalizeFolder(c.folder);
    const client = gh;
    let vaultNearby = false;
    const plain = githubRemote(client, folder, ctx.message, (entries) => {
      vaultNearby = entries.some((e) => e.type === 'dir' && e.name === VAULT_DIR);
    });
    return {
      remote: sealed ? githubRemote(client, joinPath(folder, VAULT_DIR), ctx.message) : plain,
      plain: sealed ? plain : undefined,
      sealedNearby: sealed ? undefined : () => vaultNearby,
      probe: () => client.getRepo(),
    };
  },
  learned(c, info) {
    c.repoPrivate = info.private;
  },
  defaultDeviceName,
};

// -- Cloudflare D1 -------------------------------------------------------------

export interface D1Place {
  /** The 32-character account ID from the Cloudflare dashboard. */
  accountId: string;
  databaseId: string;
  /** For showing; refreshed by each connection test. */
  databaseName: string;
}

export type D1Config = CommonConfig & D1Place;

export const d1Backend: SyncBackend<D1Place, D1Database> = {
  id: 'd1',
  service: 'Cloudflare D1',
  configKey: D1_CONFIG_KEY,
  basePrefix: D1_BASE_PREFIX,
  tokenAccount: D1_TOKEN_ACCOUNT,
  alwaysSealed: true,
  defaults: () => ({ accountId: '', databaseId: '', databaseName: '' }),
  normalize(c, p) {
    if (p.accountId !== undefined) c.accountId = p.accountId.trim().toLowerCase();
    if (p.databaseId !== undefined) c.databaseId = p.databaseId.trim().toLowerCase();
    if (p.databaseName !== undefined) c.databaseName = p.databaseName.trim().slice(0, 80);
  },
  location: (c) => (validAccountId(c.accountId) && validDatabaseId(c.databaseId) ? `d1:${c.accountId}/${c.databaseId}` : ''),
  started: (c) => !!c.accountId,
  checkToken: (v) => (/\s/.test(v) || v.length < 30 ? "That doesn't look like a Cloudflare API token." : null),
  setupHint(c, hasToken) {
    if (!hasToken) return 'Paste a Cloudflare API token to start syncing.';
    if (!validAccountId(c.accountId)) return 'Enter your Cloudflare account ID (32 letters and digits).';
    return 'Pick or create a database to sync with.';
  },
  connect(c, token, ctx) {
    if (!validAccountId(c.accountId) || !validDatabaseId(c.databaseId)) return null;
    const key = `${token}\n${c.accountId}/${c.databaseId}`;
    let d = ctx.cache.get(key) as D1Client | undefined;
    if (!d) {
      ctx.cache.clear();
      d = createD1Client({ accountId: c.accountId, databaseId: c.databaseId, token, fetch: ctx.fetch, now: ctx.now, device: ctx.deviceId });
      ctx.cache.set(key, d);
    }
    const db = d;
    return { remote: db, probe: () => db.info(), prepare: () => db.ensureSchema(), erase: () => db.erase() };
  },
  learned(c, info) {
    if (info.name) c.databaseName = info.name;
  },
  defaultDeviceName,
};

// -- services ----------------------------------------------------------------

export interface GitHubTestResult extends TestResult<RepoInfo> {
  repo: RepoInfo;
}
/** What GitHub Sync's connection test reports (the name the settings already use). */
export type { GitHubTestResult as TestResult };

/** GitHub Sync. */
export function createSyncService(deps: SyncDeps) {
  const engine = createSyncEngine(githubBackend, deps);
  const test = engine.test;
  // Assigned onto the engine (not spread), so its live getters stay live.
  return Object.assign(engine, {
    /** Checks the token can see the repo; reports privacy and whether data is already there. */
    async test(): Promise<GitHubTestResult> {
      const r = await test();
      return { ...r, repo: r.info };
    },
  }) as Omit<typeof engine, 'test'> & { test(): Promise<GitHubTestResult> };
}

/** Cloudflare D1 sync, plus the account calls its settings need. */
export function createD1Service(deps: SyncDeps) {
  const engine = createSyncEngine(d1Backend, deps);
  const account = () => engine.withToken(async (token) => createD1Account({ accountId: engine.config.accountId, token, fetch: deps.fetch, now: deps.now }));
  return Object.assign(engine, {
    /** The account's databases, so one can be picked. */
    async databases(): Promise<D1Database[]> {
      if (!validAccountId(engine.config.accountId)) throw new Error('Enter your Cloudflare account ID first.');
      return (await account()).databases();
    },
    /** Creates a database for Daybloom (or reuses one with that name) and picks it. */
    async createDatabase(name = D1_DEFAULT_NAME): Promise<D1Database> {
      if (!validAccountId(engine.config.accountId)) throw new Error('Enter your Cloudflare account ID first.');
      const acc = await account();
      const existing = (await acc.databases()).find((d) => d.name === name);
      const db = existing ?? (await acc.create(name));
      await engine.configure({ databaseId: db.id, databaseName: db.name });
      return db;
    },
  });
}

export type SyncService = ReturnType<typeof createSyncService>;
export type D1Service = ReturnType<typeof createD1Service>;

// ---------------------------------------------------------------------------
// The app's instances, bound to the real stores, keychain and native fetch.

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
    const files = [taskFile, settings, progressFile, streakFile, trackerFile, crumbsFile, realityFile, waqtFile, trashFile, eventStateFile, aiFile, alefFile, retroFile, landingsFile];
    await Promise.all([...files.filter((s) => !s.ready).map((s) => s.load()), workFile.ready ? null : loadWork()]);
    const { calendarService } = await import('../calendar/service');
    const bind = <T>(s: { value: T }): Binding<T> => ({
      read: () => plain(s.value),
      write: (v) => {
        s.value = plain(v);
      },
    });
    const synced = <T>(s: { value: T }, parse: (raw: unknown) => T, unused?: (v: T) => boolean): Synced<T> => ({ ...bind(s), parse, ...(unused ? { unused } : {}) });
    const secrets: SecretStore = {
      accounts: () => [
        ...Object.keys(aiFile.value.services ?? {}).map((id) => `ai:${id}`),
        ...calendarService.getAccounts().map((a) => (a.provider === 'ics' ? `${a.id}:url` : a.id)),
      ],
      get: (a) => platform.secrets.get(a),
      set: (a, v) => platform.secrets.set(a, v),
      delete: (a) => platform.secrets.delete(a),
    };
    return {
      tasks: bind(taskFile),
      settings: bind(settings),
      progress: bind(progressFile),
      streaks: bind(streakFile),
      work: bind(workFile),
      tracker: bind(trackerFile),
      crumbs: bind(crumbsFile),
      reality: bind(realityFile),
      waqt: bind(waqtFile),
      trash: synced(trashFile, migrateTrash),
      eventStates: synced(eventStateFile, migrateEventStates),
      ai: synced(aiFile, migrateAi, (v) => deepEqual(v, migrateAi(DEFAULT_AI))),
      alef: synced(alefFile, migrateAlef),
      retro: synced(retroFile, migrateRetro),
      landings: synced(landingsFile, migrateLandings),
      secrets,
      watch(onChange, active) {
        return $effect.root(() => {
          $effect(() => {
            if (!active()) return;
            for (const f of [...files, workFile]) JSON.stringify(f.value);
            untrack(onChange);
          });
        });
      },
    };
  })());
}

const appDeps: SyncDeps = {
  fetch: (input, init) => platform.fetch(input, init),
  storage: { load: (k) => platform.load(k), save: (k, v) => platform.save(k, v) },
  secrets: platform.secrets,
  stores: bindApp,
  os: platform.os,
  canSync: () => windowLabel() === 'main',
  // One vault and one sync at a time, across both services.
  vault: secureVaultKeeper(platform.secrets, VAULT_ACCOUNT),
  lock: createLock(),
};

export const githubSync = createSyncService(appDeps);
export const d1Sync = createD1Service(appDeps);

/** Call once from the main window after the stores have loaded. Returns a stop function. */
export function startSync(): () => void {
  if (windowLabel() !== 'main') return () => {};
  const stops = [githubSync.start(), d1Sync.start()];
  return () => stops.forEach((s) => s());
}
