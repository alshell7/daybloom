// The sync engine, whichever service holds the data. A backend (./backends.ts) says where
// the data lives and how to reach it; the engine does the rest, the same for each:
//
//   <name>.json        one file per store (see ./codecs.ts)
//   secrets.json       keys and links, only when the vault is on
//   device-<id>.json   a heartbeat per device (name, last sync)
//   vault.json         the vault's public record, only when the vault is on
//
// Each sync lists the space once, fetches only files whose version moved, three-way merges
// them against the snapshot from the last sync (`<basePrefix><file>`), writes back only what
// changed (with the version, so a concurrent write from another device is detected and
// re-merged) and applies the result to the stores. With the vault on, every file except
// vault.json is sealed on the way out and opened on the way in (./remote.ts), and the vault
// key is kept in the OS secure store so background syncs never ask for the password.
// Only the main window ever syncs, and two services never sync at the same moment.

import { BASE_KEYS, codecs, DATA_FILES, type Codec, type SecretStore, type SyncStores } from './codecs';
import { deepEqual } from './merge';
import { sealedRemote, SyncError, VAULT_FILE, type FetchLike, type RemoteEntry, type SyncRemote } from './remote';
import {
  changePassword as rewrap,
  createVault,
  exportVault,
  importVault,
  newRecovery,
  parseRecord,
  unlock as unlockVault,
  unlockWithRecovery,
  VaultError,
  type Vault,
  type VaultRecord,
} from './vault';

export const SYNC_INTERVAL_MS = 5 * 60_000;
/** Quiet time after the last local change before syncing it. */
export const SETTLE_MS = 20_000;
/** Focus / visibility only syncs if the last sync is at least this old. */
const FOCUS_GAP_MS = 60_000;
/** Refresh this device's heartbeat at least this often… */
const HEARTBEAT_MS = 6 * 3_600_000;
/** …or, when this sync wrote data anyway, if it's older than this. */
const HEARTBEAT_ON_WRITE_MS = 15 * 60_000;
/** Back-off before each attempt at writing one file (version conflicts). */
const ATTEMPT_DELAYS = [0, 400, 1500];

/** Keychain accounts that may travel in secrets.json. Sync tokens and the vault never do. */
export const SYNCABLE_SECRET = /^(ai:[a-z0-9-]{1,40}|google:[^\s]{1,200}|ics:[^\s:]{1,200}:url)$/;

export interface DeviceInfo {
  id: string;
  name: string;
  os: string;
  /** When that device last wrote its heartbeat (ms). */
  lastSyncAt: number;
  sha?: string;
}

/** What every service's config has; each backend adds where its data lives. */
export interface CommonConfig {
  enabled: boolean;
  deviceId: string;
  deviceName: string;
  lastSyncAt: number | null;
  /** The place this device last finished a sync with. Different → first sync. */
  syncedLoc: string | null;
  /** First sync with a place that already has data: adopt its copy, or combine. */
  join: 'replace' | 'merge';
  devices: DeviceInfo[];
  /** Seal everything with the vault (always on for services that require it). */
  encrypted: boolean;
}

export type SyncStatus =
  | { state: 'idle' }
  | { state: 'syncing' }
  | { state: 'ok'; lastSyncAt: number }
  | { state: 'error'; message: string; kind: string };

export interface Connection<I> {
  /** The sync space: for a sealed GitHub repo, its vault folder. */
  remote: SyncRemote;
  /** Sealed GitHub: the plain folder beside it, whose old files are folded in and removed. */
  plain?: SyncRemote;
  /** Plain GitHub: whether another device has turned the vault on (known after `list`). */
  sealedNearby?(): boolean;
  /** Proves the token reaches the place; returns what the settings show. */
  probe(): Promise<I>;
  /** Makes the place ready to hold files (D1: the table). */
  prepare?(): Promise<void>;
  /** Removes everything Daybloom stored there. */
  erase?(): Promise<void>;
}

export interface SyncBackend<P extends object, I> {
  id: string;
  /** "GitHub", "Cloudflare D1": for messages. */
  service: string;
  configKey: string;
  basePrefix: string;
  tokenAccount: string;
  /** D1 is always sealed; GitHub only when the user turns the vault on. */
  alwaysSealed: boolean;
  defaults(): P;
  /** Applies a settings change in place (trimmed, normalised). */
  normalize(cfg: P, patch: Partial<P>): void;
  /** Where the config points ('' = not complete yet); base snapshots only count there. */
  location(cfg: P): string;
  /** Why a pasted token can't be right, or null. */
  checkToken(token: string): string | null;
  /** What's still missing before syncing can start. */
  setupHint(cfg: P, hasToken: boolean): string;
  connect(cfg: P & CommonConfig, token: string, ctx: ConnectContext, sealed: boolean): Connection<I> | null;
  /** The user has started setting this service up (so its token may be read). */
  started(cfg: P): boolean;
  /** Remember what a connection test learned (GitHub: whether the repo is private). */
  learned?(cfg: P, info: I): void;
  defaultDeviceName(os?: string): string;
}

export interface ConnectContext {
  fetch: FetchLike;
  now: () => number;
  /** A per-engine cache, so a client (and its conditional-request memory) is reused. */
  cache: Map<string, unknown>;
  /** GitHub commit message. */
  message: () => string;
  deviceId: string;
}

export interface TestResult<I> {
  info: I;
  /** The place already holds Daybloom data (in the mode this device is set to). */
  hasData: boolean;
  deviceCount: number;
  /** The vault record stored there, if the data there is sealed. */
  vault: VaultRecord | null;
}

/** The unlocked vault on this device, shared by every service. */
export interface VaultKeeper {
  readonly open: boolean;
  readonly kid: string | null;
  get(): Promise<Vault | null>;
  set(v: Vault | null): Promise<void>;
}

/** Runs syncs one at a time across services. */
export type Lock = <T>(fn: () => Promise<T>) => Promise<T>;

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
  vault?: VaultKeeper;
  lock?: Lock;
}

interface BaseRecord<T> {
  loc: string;
  sha: string | null;
  at: number;
  data: T;
}

const serialize = (data: unknown) => `${JSON.stringify(data, null, 2)}\n`;
const deviceIdOf = (name: string) => /^device-([A-Za-z0-9_-]{1,64})\.json$/.exec(name)?.[1] ?? null;

function randomId() {
  const c = (globalThis as any).crypto;
  if (c?.randomUUID) return (c.randomUUID() as string).replace(/-/g, '').slice(0, 12);
  return Math.random().toString(36).slice(2, 14);
}

function formatClock(ms: number) {
  try {
    return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

async function sha256(text: string): Promise<string> {
  const d = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Problems a retry won't fix on its own: wait for the user (token, place, password…). */
const NEEDS_USER = new Set(['auth', 'forbidden', 'not-found', 'branch', 'invalid', 'setup', 'locked', 'vault']);

/** A vault kept only in memory (tests, and services created without a keeper). */
export function memoryVaultKeeper(): VaultKeeper {
  const s = $state<{ v: Vault | null }>({ v: null });
  return {
    get open() {
      return !!s.v;
    },
    get kid() {
      return s.v?.kid ?? null;
    },
    get: async () => s.v,
    set: async (v) => {
      s.v = v;
    },
  };
}

/** The vault kept in the OS secure store under `account`, so it survives a restart. */
export function secureVaultKeeper(secrets: SyncDeps['secrets'], account: string): VaultKeeper {
  const s = $state<{ v: Vault | null; kid: string | null }>({ v: null, kid: null });
  let loaded: Promise<void> | null = null;
  const load = () =>
    (loaded ??= (async () => {
      s.v = await importVault(await secrets.get(account).catch(() => null));
      s.kid = s.v?.kid ?? null;
    })());
  return {
    get open() {
      void load();
      return !!s.kid;
    },
    get kid() {
      void load();
      return s.kid;
    },
    async get() {
      await load();
      return s.v;
    },
    async set(v) {
      await load();
      if (v) await secrets.set(account, exportVault(v));
      else await secrets.delete(account).catch(() => {});
      s.v = v;
      s.kid = v?.kid ?? null;
    },
  };
}

export function createLock(): Lock {
  let chain: Promise<unknown> = Promise.resolve();
  return <T>(fn: () => Promise<T>) => {
    const next = chain.then(fn, fn);
    chain = next.catch(() => {});
    return next;
  };
}

export type SyncEngine<P extends object, I> = ReturnType<typeof createSyncEngine<P, I>>;

export function createSyncEngine<P extends object, I>(backend: SyncBackend<P, I>, deps: SyncDeps) {
  type Config = CommonConfig & P;
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const newId = deps.newId ?? randomId;
  const canSync = deps.canSync ?? (() => true);
  const keeper = deps.vault ?? memoryVaultKeeper();
  const lock = deps.lock ?? ((fn) => fn());
  const BASE_PREFIX = backend.basePrefix;

  function defaultConfig(): Config {
    return {
      ...backend.defaults(),
      enabled: false,
      deviceId: '',
      deviceName: '',
      lastSyncAt: null,
      syncedLoc: null,
      join: 'replace',
      devices: [],
      encrypted: backend.alwaysSealed,
    } as Config;
  }

  const state = $state({
    config: defaultConfig(),
    status: { state: 'idle' } as SyncStatus,
    hasToken: false,
    ready: false,
  });

  // The token lives in the keychain and in this closure — never in reactive state or on disk.
  let token: string | null = null;
  const cache = new Map<string, unknown>();
  let inited: Promise<void> | null = null;
  let running: Promise<void> | null = null;
  let paused = false;
  let blockedUntil = 0;
  const bases = new Map<string, BaseRecord<unknown> | null>();

  const sealed = (c: Config = state.config) => backend.alwaysSealed || c.encrypted;
  /** Where the config points, and in which mode: plain and sealed data are separate places. */
  const locationOf = (c: Config = state.config) => {
    const loc = backend.location(c);
    return loc && sealed(c) ? `${loc}#vault` : loc;
  };

  function init(): Promise<void> {
    return (inited ??= (async () => {
      let cfg = defaultConfig();
      try {
        const raw = await deps.storage.load(backend.configKey);
        if (raw) cfg = { ...cfg, ...JSON.parse(raw) };
      } catch {
        /* unreadable: start over */
      }
      if (!Array.isArray(cfg.devices)) cfg.devices = [];
      if (backend.alwaysSealed) cfg.encrypted = true;
      cfg.encrypted = !!cfg.encrypted;
      // Saved with the first configure(), so nothing is written for people who never sync.
      if (!cfg.deviceId) cfg.deviceId = newId();
      if (!cfg.deviceName) cfg.deviceName = backend.defaultDeviceName(deps.os);
      state.config = cfg;
      // No keychain access at all for people who never set sync up.
      if (backend.started(cfg)) token = (await deps.secrets.get(backend.tokenAccount).catch(() => null)) || null;
      state.hasToken = !!token;
      if (cfg.enabled && cfg.lastSyncAt) state.status = { state: 'ok', lastSyncAt: cfg.lastSyncAt };
      state.ready = true;
    })());
  }

  async function persistConfig() {
    await deps.storage.save(backend.configKey, JSON.stringify($state.snapshot(state.config))).catch(() => {});
  }

  function connection(asSealed = sealed()): Connection<I> | null {
    if (!token || !backend.location(state.config)) return null;
    return backend.connect(state.config, token, { fetch: deps.fetch, now, cache, message: commitMessage, deviceId: state.config.deviceId }, asSealed);
  }

  // -- base snapshots -------------------------------------------------------

  async function loadRaw(key: string): Promise<BaseRecord<unknown> | null> {
    if (!bases.has(key)) {
      let rec: BaseRecord<unknown> | null = null;
      try {
        const raw = await deps.storage.load(BASE_PREFIX + key);
        if (raw) rec = JSON.parse(raw);
      } catch {
        rec = null;
      }
      bases.set(key, rec);
    }
    return bases.get(key) ?? null;
  }

  async function loadBase<T>(c: Codec<T>, loc: string): Promise<BaseRecord<T> | null> {
    const rec = await loadRaw(c.key);
    if (!rec || rec.loc !== loc) return null;
    return { ...rec, data: c.parse(rec.data) };
  }

  async function saveBase<T>(c: { key: string; parse?: (raw: unknown) => T }, rec: BaseRecord<T>) {
    const prev = bases.get(c.key);
    if (prev && prev.loc === rec.loc && prev.sha === rec.sha && deepEqual(c.parse ? c.parse(prev.data) : prev.data, rec.data)) return;
    bases.set(c.key, rec);
    await deps.storage.save(BASE_PREFIX + c.key, JSON.stringify(rec));
  }

  /** Whether anything local differs from what was last synced. */
  async function isDirty(): Promise<boolean> {
    const loc = locationOf();
    const stores = await deps.stores();
    for (const c of codecs(stores)) {
      const base = await loadBase(c, loc);
      if (!base || !deepEqual(c.read(), base.data)) return true;
    }
    return false;
  }

  // -- one sync -------------------------------------------------------------

  function commitMessage() {
    return `Daybloom sync from ${state.config.deviceName || 'a device'}`;
  }

  function parseRemote<T>(c: Codec<T>, text: string): T {
    try {
      return c.parse(JSON.parse(text));
    } catch {
      throw new SyncError('invalid', `${c.file} on ${backend.service} isn't valid JSON. Delete it there and Daybloom will write it again.`);
    }
  }

  /** Merge one file with the remote, write it back if needed, apply it here. True if it wrote. */
  async function syncFile<T>(remote: SyncRemote, c: Codec<T>, loc: string, listed: string | null, replace: boolean): Promise<boolean> {
    const base = await loadBase(c, loc);
    let version = listed;
    // undefined = not fetched yet; null = not there.
    let theirs: T | null | undefined = listed === null ? null : base && base.sha === listed ? base.data : undefined;

    for (let attempt = 0; attempt < ATTEMPT_DELAYS.length; attempt++) {
      if (attempt > 0) {
        await sleep(ATTEMPT_DELAYS[attempt]);
        theirs = undefined;
      }
      if (theirs === undefined) {
        const f = await remote.get(c.file);
        version = f?.version ?? null;
        theirs = f ? parseRemote(c, f.text) : null;
      }
      const local = c.read();
      if (theirs === null && c.unused?.(local)) {
        // Nothing here and nothing there: no empty file. The base records that both were empty.
        await saveBase(c, { loc, sha: null, at: now(), data: local });
        return false;
      }
      let merged: T;
      if (theirs === null) merged = local;
      else if (!base && replace && c.replaceOnJoin) merged = theirs;
      else merged = c.merge(base?.data ?? null, local, theirs, base?.at);

      let sha = version;
      let wrote = false;
      if (theirs === null || !deepEqual(merged, theirs)) {
        try {
          sha = (await remote.put(c.file, serialize(merged), version)).version || null;
          wrote = true;
        } catch (e) {
          if (e instanceof SyncError && e.kind === 'conflict') continue;
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
    throw new SyncError('conflict', 'Another device kept saving at the same moment. Daybloom will try again shortly.', 409);
  }

  // -- secrets (vault only) ---------------------------------------------------
  // The base holds hashes, never values, so no key ever lands on disk outside the keychain.

  interface SecretsFile {
    version: 1;
    items: Record<string, { v: string; at: number }>;
  }
  type SecretsBase = Record<string, string>;

  function parseSecrets(raw: any): SecretsFile {
    const items: SecretsFile['items'] = {};
    for (const [k, x] of Object.entries(raw?.items ?? {})) {
      const it = x as { v?: unknown; at?: unknown };
      if (SYNCABLE_SECRET.test(k) && typeof it?.v === 'string' && it.v) items[k] = { v: it.v, at: Number(it.at) || 0 };
    }
    return { version: 1, items };
  }

  async function syncSecrets(remote: SyncRemote, store: SecretStore, loc: string, listed: string | null) {
    const rec = await loadRaw('secrets');
    const base: SecretsBase | null = rec && rec.loc === loc ? (rec.data as SecretsBase) : null;
    const accounts = new Set([...store.accounts(), ...Object.keys(base ?? {})].filter((a) => SYNCABLE_SECRET.test(a)));
    const mine = new Map<string, string>();
    for (const a of accounts) {
      const v = await store.get(a).catch(() => null);
      if (v) mine.set(a, v);
    }
    if (!base && !listed && mine.size === 0) return;

    for (let attempt = 0; attempt < ATTEMPT_DELAYS.length; attempt++) {
      if (attempt > 0) await sleep(ATTEMPT_DELAYS[attempt]);
      const f = listed === null && attempt === 0 ? null : await remote.get('secrets.json');
      let theirs: SecretsFile;
      try {
        theirs = f ? parseSecrets(JSON.parse(f.text)) : { version: 1, items: {} };
      } catch {
        theirs = { version: 1, items: {} };
      }
      const out: SecretsFile = { version: 1, items: {} };
      const apply = new Map<string, string | null>();
      for (const a of new Set([...mine.keys(), ...Object.keys(theirs.items), ...Object.keys(base ?? {})])) {
        const l = mine.get(a) ?? null;
        const r = theirs.items[a] ?? null;
        const lh = l ? await sha256(l) : null;
        const rh = r ? await sha256(r.v) : null;
        const bh = base?.[a] ?? null;
        const localChanged = base ? lh !== bh : false;
        const remoteChanged = base ? rh !== bh : false;
        let v: string | null;
        if (!base) v = r?.v ?? l; // first time: what's there wins, else what's here
        else if (localChanged && !remoteChanged) v = l;
        else if (remoteChanged && !localChanged) v = r?.v ?? null;
        else if (localChanged && remoteChanged) v = l; // both changed one key: this device's newer word
        else v = l;
        if (v) out.items[a] = { v, at: v === r?.v ? r.at : now() };
        if (v !== l) apply.set(a, v);
      }
      if (!deepEqual(out, theirs)) {
        try {
          await remote.put('secrets.json', serialize(out), f?.version ?? null);
        } catch (e) {
          if (e instanceof SyncError && e.kind === 'conflict') {
            listed = 'moved';
            continue;
          }
          throw e;
        }
      }
      for (const [a, v] of apply) {
        if (v) await store.set(a, v).catch(() => {});
        else await store.delete(a).catch(() => {});
      }
      const hashes: SecretsBase = {};
      for (const [a, x] of Object.entries(out.items)) hashes[a] = await sha256(x.v);
      await saveBase({ key: 'secrets' }, { loc, sha: null, at: now(), data: hashes });
      return;
    }
    throw new SyncError('conflict', 'Another device kept saving at the same moment. Daybloom will try again shortly.', 409);
  }

  // -- the vault --------------------------------------------------------------

  /** Make sure the place holds this vault's record. 'off' = the vault was turned off elsewhere. */
  async function checkVault(raw: SyncRemote, vault: Vault, loc: string): Promise<'ok' | 'off'> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const f = await raw.get(VAULT_FILE);
      if (!f) {
        if (!backend.alwaysSealed && state.config.syncedLoc === loc) return 'off';
        try {
          await raw.put(VAULT_FILE, serialize(vault.record), null);
          return 'ok';
        } catch (e) {
          if (e instanceof SyncError && e.kind === 'conflict') continue;
          throw e;
        }
      }
      let rec: VaultRecord | null = null;
      try {
        rec = parseRecord(JSON.parse(f.text));
      } catch {
        rec = null;
      }
      if (!rec) throw new SyncError('vault', `The vault record on ${backend.service} can't be read. Turn encryption off and on again on a device that still syncs.`);
      if (rec.kid !== vault.kid) throw new SyncError('vault', `Your Daybloom data on ${backend.service} is locked with a different master password. Enter that password to keep syncing.`);
      if (rec.at > vault.record.at) await keeper.set({ ...vault, record: rec });
      else if (rec.at < vault.record.at) await raw.put(VAULT_FILE, serialize(vault.record), f.version).catch(() => {});
      return 'ok';
    }
    return 'ok';
  }

  /** Sealed GitHub: fold any plain data files (older devices, or before the switch) in, then remove them. */
  async function absorbPlain(plain: SyncRemote, list: Codec<any>[]) {
    const entries = await plain.list();
    for (const e of entries) {
      const c = list.find((x) => x.file === e.name);
      if (c) {
        const f = await plain.get(e.name);
        if (f) {
          const theirs = parseRemote(c, f.text);
          const local = c.read();
          const merged = c.merge(null, local, theirs);
          if (!deepEqual(merged, local)) c.write(merged);
        }
      }
      if (c || deviceIdOf(e.name) || DATA_FILES.includes(e.name)) await plain.remove(e.name, e.version).catch(() => {});
    }
  }

  async function syncDevices(remote: SyncRemote, listing: RemoteEntry[], wrote: boolean) {
    const cfg = state.config;
    const known = new Map(cfg.devices.map((d) => [d.id, d]));
    const devices: DeviceInfo[] = [];
    let mineVersion: string | null = null;
    for (const e of listing) {
      const id = deviceIdOf(e.name);
      if (!id) continue;
      if (id === cfg.deviceId) mineVersion = e.version;
      const k = known.get(id);
      if (k && k.sha === e.version) {
        devices.push(k);
        continue;
      }
      try {
        const f = await remote.get(e.name);
        if (!f) continue;
        const raw = JSON.parse(f.text);
        devices.push({
          id,
          name: typeof raw?.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 60) : 'A device',
          os: typeof raw?.os === 'string' ? raw.os : 'other',
          lastSyncAt: Number(raw?.lastSyncAt) || 0,
          sha: f.version,
        });
      } catch (err) {
        if (err instanceof SyncError && (NEEDS_USER.has(err.kind) || err.kind === 'rate-limit')) throw err;
      }
    }

    const t = now();
    const i = devices.findIndex((d) => d.id === cfg.deviceId);
    const mine = i >= 0 ? devices[i] : null;
    const age = mine ? t - mine.lastSyncAt : Infinity;
    if (!mine || mine.name !== cfg.deviceName || age > HEARTBEAT_MS || (wrote && age > HEARTBEAT_ON_WRITE_MS)) {
      const info = { id: cfg.deviceId, name: cfg.deviceName, os: deps.os ?? 'other', lastSyncAt: t };
      try {
        const res = await remote.put(`device-${cfg.deviceId}.json`, serialize({ app: 'daybloom', ...info }), mineVersion);
        const d = { ...info, sha: res.version };
        if (i >= 0) devices[i] = d;
        else devices.push(d);
      } catch (err) {
        // A heartbeat can wait for the next sync; only problems the user must fix surface.
        if (err instanceof SyncError && (NEEDS_USER.has(err.kind) || err.kind === 'rate-limit')) throw err;
      }
    }
    devices.sort((a, z) => (a.id === cfg.deviceId ? -1 : z.id === cfg.deviceId ? 1 : z.lastSyncAt - a.lastSyncAt || a.id.localeCompare(z.id)));
    cfg.devices = devices;
  }

  function slowDown(at: number) {
    const clock = formatClock(at);
    return `${backend.service} asked Daybloom to slow down. ${clock ? `Trying again after ${clock}.` : 'Trying again soon.'}`;
  }

  function setError(e: unknown) {
    if (e instanceof SyncError) {
      let message = e.message;
      if (e.kind === 'rate-limit') {
        blockedUntil = e.retryAt ?? now() + 60_000;
        message = slowDown(blockedUntil);
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
    const conn = connection();
    if (!conn) {
      paused = true;
      state.status = { state: 'error', kind: 'setup', message: backend.setupHint(cfg, !!token) };
      return;
    }
    if (now() < blockedUntil) {
      state.status = { state: 'error', kind: 'rate-limit', message: slowDown(blockedUntil) };
      return;
    }
    let vault: Vault | null = null;
    if (sealed(cfg)) {
      vault = await keeper.get();
      if (!vault) {
        paused = true;
        state.status = { state: 'error', kind: 'locked', message: 'Enter your master password to keep syncing.' };
        return;
      }
    }
    state.status = { state: 'syncing' };
    try {
      const stores = await deps.stores();
      const loc = locationOf(cfg);
      const list = codecs(stores);
      await conn.prepare?.();
      if (vault) {
        if ((await checkVault(conn.remote, vault, loc)) === 'off') {
          // Another device turned the vault off for this place: follow it.
          cfg.encrypted = false;
          await persistConfig();
          state.status = { state: 'idle' };
          return syncOnce();
        }
      }
      const remote = vault ? sealedRemote(conn.remote, vault) : conn.remote;
      if (vault && conn.plain) await absorbPlain(conn.plain, list);
      const replace = cfg.join === 'replace' && cfg.syncedLoc !== loc;
      const listing = (await remote.list()).filter((e) => e.name !== VAULT_FILE);
      if (!vault && conn.sealedNearby?.()) {
        paused = true;
        state.status = { state: 'error', kind: 'locked', message: `Your Daybloom data on ${backend.service} is now encrypted. Turn on encryption here and enter your master password to keep syncing.` };
        return;
      }
      const versionOf = (file: string) => listing.find((e) => e.name === file)?.version ?? null;
      let wrote = false;
      for (const c of list) {
        if (await syncFile(remote, c, loc, versionOf(c.file), replace)) wrote = true;
      }
      if (vault && stores.secrets) await syncSecrets(remote, stores.secrets, loc, versionOf('secrets.json'));
      await syncDevices(remote, listing, wrote);
      if (locationOf(state.config) !== loc) return; // moved to another place meanwhile
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
        await lock(syncOnce);
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

  /** Points the service somewhere else (or renames this device). */
  async function configure(patch: Partial<P & { deviceName: string }>) {
    await init();
    const c = state.config;
    const before = locationOf(c);
    const { deviceName, ...place } = patch as Partial<P> & { deviceName?: string };
    backend.normalize(c, place as Partial<P>);
    if (deviceName !== undefined) c.deviceName = deviceName.trim().slice(0, 60) || backend.defaultDeviceName(deps.os);
    if (locationOf(c) !== before) {
      // A different place: nothing synced there yet, and it needs a fresh go-ahead.
      c.enabled = false;
      c.devices = [];
      c.lastSyncAt = null;
      cache.clear();
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
    const problem = backend.checkToken(v);
    if (problem) throw new Error(problem);
    await deps.secrets.set(backend.tokenAccount, v);
    token = v;
    cache.clear();
    paused = false;
    state.hasToken = true;
    if (state.status.state === 'error') state.status = { state: 'idle' };
  }

  async function readRecord(conn: Connection<I>): Promise<VaultRecord | null> {
    const f = await conn.remote.get(VAULT_FILE);
    if (!f) return null;
    try {
      return parseRecord(JSON.parse(f.text));
    } catch {
      return null;
    }
  }

  /** Checks the token reaches the place; reports what's there already, and its vault. */
  async function test(): Promise<TestResult<I>> {
    await init();
    const conn = connection();
    if (!conn) throw new Error(backend.setupHint(state.config, !!token));
    const info = await conn.probe();
    await conn.prepare?.();
    const sealedConn = sealed() ? conn : connection(true)!;
    const listing = await conn.remote.list();
    const names = new Set(listing.map((e) => e.name));
    backend.learned?.(state.config, info);
    await persistConfig();
    paused = false;
    return {
      info,
      hasData: DATA_FILES.some((f) => names.has(f)),
      deviceCount: listing.filter((e) => deviceIdOf(e.name)).length,
      vault: await readRecord(sealedConn),
    };
  }

  async function enable(on: boolean, join?: 'replace' | 'merge') {
    await init();
    if (on && sealed() && !(await keeper.get())) throw new VaultError('wrong-password', 'Set or enter your master password first.');
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

  /** Forget the token and every sync snapshot here. With `erase`, also delete the data there. */
  async function disconnect(opts: { erase?: boolean } = {}) {
    await init();
    await running?.catch(() => {});
    if (opts.erase) {
      const conn = connection();
      if (conn?.erase) await conn.erase();
      else if (conn) for (const e of await conn.remote.list()) await conn.remote.remove(e.name, e.version).catch(() => {});
    }
    token = null;
    cache.clear();
    state.hasToken = false;
    await deps.secrets.delete(backend.tokenAccount).catch(() => {});
    bases.clear();
    for (const k of BASE_KEYS) await deps.storage.save(BASE_PREFIX + k, '').catch(() => {});
    const keep = Object.fromEntries(Object.keys(backend.defaults()).map((k) => [k, (state.config as Record<string, unknown>)[k]]));
    const { deviceId, deviceName } = state.config;
    state.config = { ...defaultConfig(), ...keep, deviceId, deviceName } as Config;
    paused = false;
    blockedUntil = 0;
    state.status = { state: 'idle' };
    await persistConfig();
  }

  // -- the master password ----------------------------------------------------

  /** The vault record stored at the place (null when its data isn't sealed yet). */
  async function remoteVault(): Promise<VaultRecord | null> {
    await init();
    const conn = connection(true);
    return conn ? readRecord(conn) : null;
  }

  /**
   * Sets the master password for a new vault and returns its recovery key, to show once.
   * If this device already has a vault (from the other service), the password must match
   * it and null comes back: the same vault, password and recovery key serve both.
   */
  async function createPassword(password: string): Promise<string | null> {
    const have = await keeper.get();
    if (have) {
      await unlockVault(have.record, password);
      return null;
    }
    const { vault, recovery } = await createVault(password, now());
    await keeper.set(vault);
    return recovery;
  }

  /** Opens the vault stored at the place with its password or recovery key. */
  async function unlock(secret: string, how: 'password' | 'recovery' = 'password'): Promise<void> {
    const record = (await remoteVault()) ?? (await keeper.get())?.record ?? null;
    if (!record) throw new VaultError('damaged', `There's no encrypted Daybloom data on ${backend.service} yet.`);
    const vault = how === 'password' ? await unlockVault(record, secret) : await unlockWithRecovery(record, secret);
    await keeper.set(vault);
    if (state.status.state === 'error' && (state.status.kind === 'locked' || state.status.kind === 'vault')) state.status = { state: 'idle' };
    paused = false;
  }

  /** True when `password` opens this device's vault. */
  async function checkPassword(password: string): Promise<boolean> {
    const v = await keeper.get();
    const record = v?.record ?? (await remoteVault());
    if (!record) return false;
    try {
      await unlockVault(record, password);
      return true;
    } catch {
      return false;
    }
  }

  /** New password (after the current one, or right after a recovery-key unlock). */
  async function changePassword(next: string, current?: string): Promise<void> {
    const v = await keeper.get();
    if (!v) throw new VaultError('wrong-password', 'Unlock with your password or recovery key first.');
    if (current !== undefined) await unlockVault(v.record, current);
    await keeper.set(await rewrap(v, next, now()));
    if (state.config.enabled) void syncNow();
  }

  /** A fresh recovery key (the old one stops working). Returns it, to show once. */
  async function replaceRecovery(password: string): Promise<string> {
    const v = await keeper.get();
    if (!v) throw new VaultError('wrong-password', 'Unlock with your password first.');
    await unlockVault(v.record, password);
    const next = await newRecovery(v, now());
    await keeper.set(next.vault);
    if (state.config.enabled) void syncNow();
    return next.recovery;
  }

  /**
   * GitHub: turn the vault on (files move, sealed, to a `vault` folder; the plain ones are
   * removed) or off (needs the password; the files go back in the clear).
   */
  async function setEncrypted(on: boolean, password?: string) {
    await init();
    if (backend.alwaysSealed || on === state.config.encrypted) return;
    if (on && !(await keeper.get())) throw new VaultError('wrong-password', 'Set your master password first.');
    if (!on) {
      if (!password || !(await checkPassword(password))) throw new VaultError('wrong-password', "That password doesn't open your vault.");
      const conn = connection(true);
      if (conn) for (const e of await conn.remote.list()) await conn.remote.remove(e.name, e.version).catch(() => {});
    }
    await running?.catch(() => {});
    state.config.encrypted = on;
    // The data is already here: combine with whatever the new place holds.
    state.config.join = 'merge';
    await persistConfig();
    if (state.config.enabled) await run();
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
    get service() {
      return backend.service;
    },
    get config(): Readonly<Config> {
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
    /** True until this device has finished one sync with the configured place. */
    get firstSync() {
      return state.config.syncedLoc !== locationOf(state.config);
    },
    /** A token is saved and the place is complete. */
    get configured() {
      return state.hasToken && !!backend.location(state.config);
    },
    /** Whether this service seals its data, and whether this device holds the key. */
    get sealed() {
      return sealed(state.config);
    },
    get unlocked() {
      return keeper.open;
    },
    /** Runs `fn` with the saved token (for account calls, such as listing databases). */
    async withToken<T>(fn: (token: string) => Promise<T>): Promise<T> {
      await init();
      if (!token) throw new Error('Paste a token first.');
      return fn(token);
    },
    init,
    configure,
    saveToken,
    test,
    enable,
    syncNow,
    disconnect,
    start,
    remoteVault,
    createPassword,
    unlock,
    checkPassword,
    changePassword,
    replaceRecovery,
    setEncrypted,
  };
}
