// Calendar service: owns connected accounts, syncs them, and keeps an event cache
// that survives restarts so the widget can render offline. Framework-agnostic —
// wrap `subscribe` with Svelte runes in the UI layer.

import type { CalendarEvent, CategoryId } from '../engine/types';
import { CATEGORIES } from '../engine/categories';
import { platform } from '../platform';
import { createGoogleProvider, getGoogleClient, setGoogleClient as applyGoogleClient, type GoogleClientConfig } from './google';
import { createIcsProvider, icsSecretKey, redactIcsUrl, scrubUrls } from './ics';
import {
  CalendarError,
  RECONNECT,
  type CalendarAccount,
  type CalendarErrorCode,
  type CalendarInfo,
  type CalendarProvider,
  type ConnectInput,
  type ProviderKind,
  type TimeRange,
} from './types';

export const ACCOUNTS_KEY = 'calendars';
export const CACHE_KEY = 'calendar-cache';
export const GOOGLE_CLIENT_KEY = 'calendar-google-client';

const DAY_MS = 86_400_000;

export type SyncStatus = 'idle' | 'syncing' | 'error';

export interface SyncOptions {
  /** Ignore the per-account throttle (and retry accounts that need reconnecting). */
  force?: boolean;
  /** An automatic sync (timer, window shown, back online): each account's own cadence applies,
   *  and accounts set to sync only when asked are skipped. */
  auto?: boolean;
  /** For `auto`: the cadence of accounts that haven't picked one. */
  everyMs?: number;
}

/** The cadences offered for automatic sync, in minutes (0 = only when asked). */
export const SYNC_CADENCES = [5, 10, 30, 60, 360, 0] as const;
export const DEFAULT_SYNC_MIN = 10;

/** Which events go together when one is left out: every repeat of a series. */
export function seriesKey(ev: CalendarEvent): string {
  return `${ev.calendarId}:${ev.series ?? ev.id.slice(ev.calendarId.length + 1)}`;
}

/** The account's name as shown. */
export function accountName(a: Pick<CalendarAccount, 'name' | 'label'>): string {
  return a.name?.trim() || a.label;
}

/** A calendar's name as shown. */
export function calendarName(c: Pick<CalendarInfo, 'customName' | 'name'>): string {
  return c.customName?.trim() || c.name;
}

const MAX_HIDDEN = 500;
const isCategory = (x: unknown): x is CategoryId => CATEGORIES.some((c) => c.id === x);

export interface CalendarServiceOptions {
  providers?: Partial<Record<ProviderKind, CalendarProvider>>;
  /** Max provider requests in flight across all accounts. Default 4. */
  concurrency?: number;
  /** An account isn't re-fetched for the same range more often than this. Default 60 s. */
  minSyncIntervalMs?: number;
  now?: () => number;
}

export interface CalendarService {
  /** `syncing` while a sync runs; otherwise `error` if any enabled account has an error. */
  readonly status: SyncStatus;
  /** Most recent successful sync of any account (ms), or null. */
  readonly lastSyncAt: number | null;
  /** Whether a Google OAuth client id is configured (env or Settings). */
  readonly googleConfigured: boolean;
  init(): Promise<void>;
  /** Connected accounts. ICS links are never included: see `displayUrl` for a safe short form. */
  getAccounts(): readonly CalendarAccount[];
  /** Called after any change (accounts, events, status). Returns unsubscribe. */
  subscribe(listener: () => void): () => void;
  connectGoogle(): Promise<CalendarAccount>;
  /** Subscribe to an ICS/webcal link. The link is kept in the OS keychain, not in the account file. */
  addIcs(url: string, label?: string): Promise<CalendarAccount>;
  /** Forget an account, its cached events and its keychain entries. */
  removeAccount(id: string): Promise<void>;
  setAccountEnabled(id: string, on: boolean): Promise<void>;
  setCalendarEnabled(accountId: string, calendarId: string, on: boolean): Promise<void>;
  /** Rename an account, or change how often it syncs by itself (minutes; 0 = only when asked). */
  updateAccount(id: string, change: { name?: string; syncEveryMin?: number }): Promise<void>;
  /** Rename a calendar or pick the category (colour) its events take. `null` clears. */
  updateCalendar(accountId: string, calendarId: string, change: { name?: string | null; category?: CategoryId | null }): Promise<void>;
  /** Include or leave out event series (`seriesKey`) for an account. */
  setSeriesIncluded(accountId: string, keys: string[], on: boolean): Promise<void>;
  /** An account's cached events in a range, left-out ones too (for choosing what to include). */
  accountEvents(accountId: string, startMs: number, endMs: number): CalendarEvent[];
  /** Fetch enabled calendars for `range` (default: yesterday → +14 days). Never rejects for account errors. */
  sync(range?: TimeRange, options?: SyncOptions): Promise<void>;
  /** Cached events overlapping [startMs, endMs) from enabled accounts/calendars, sorted. */
  eventsBetween(startMs: number, endMs: number): CalendarEvent[];
  /** Periodic sync that pauses while the document is hidden. Returns a stop function. */
  startAutoSync(intervalMs?: number): () => void;
  /** Persisted override of the Google OAuth client (shared with other windows). `null` → `.env`. */
  setGoogleClient(config: GoogleClientConfig | null): Promise<void>;
  /** For sync: the accounts as saved — no links, no sync state. Call after `init()`. */
  exportAccounts(): CalendarAccount[];
  /**
   * For sync: take the merged account list. New accounts start syncing (their links and
   * sign-ins arrive through the vault's secrets); ones removed elsewhere are dropped here
   * without signing out, so the other devices keep their access.
   */
  applyAccounts(list: CalendarAccount[]): Promise<void>;
  dispose(): void;
}

/** Local start of yesterday → local start of the day after today + 14. */
export function defaultSyncWindow(now = Date.now()): TimeRange {
  const d = new Date(now);
  return {
    startMs: new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1).getTime(),
    endMs: new Date(d.getFullYear(), d.getMonth(), d.getDate() + 15).getTime(),
  };
}

function overlaps(ev: CalendarEvent, startMs: number, endMs: number): boolean {
  if (ev.startMs >= endMs) return false;
  return ev.endMs > startMs || (ev.endMs === ev.startMs && ev.startMs >= startMs);
}

const contains = (outer: TimeRange, inner: TimeRange) => outer.startMs <= inner.startMs && outer.endMs >= inner.endMs;

function compareEvents(a: CalendarEvent, b: CalendarEvent): number {
  return (
    a.startMs - b.startMs ||
    Number(b.allDay) - Number(a.allDay) ||
    a.endMs - b.endMs ||
    a.title.localeCompare(b.title) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/** Take the provider's fresh list but keep the user's choices (on/off, name, colour). */
function mergeCalendars(previous: CalendarInfo[], fresh: CalendarInfo[]): CalendarInfo[] {
  return fresh.map((c) => {
    const old = previous.find((p) => p.id === c.id);
    if (!old) return c;
    return {
      ...c,
      enabled: old.enabled,
      ...(old.customName ? { customName: old.customName } : {}),
      ...(old.category ? { category: old.category } : {}),
    };
  });
}

/** A message that is safe to show and to store (links inside it are shortened), plus its kind. */
function describeError(e: unknown): { error: string; errorCode: CalendarErrorCode | null } {
  if (e instanceof CalendarError) return { error: e.code === 'reconnect' ? RECONNECT : scrubUrls(e.message), errorCode: e.code };
  return { error: scrubUrls(e instanceof Error ? e.message : String(e)), errorCode: null };
}

/**
 * Whitelist persisted fields so nothing token-like can ever reach disk. ICS links live in the
 * keychain; the file keeps only their short display form. `legacyUrl` is for one case only: a
 * plain link written by an older version that the keychain refused to take, which stays where
 * it already was until a later load can move it.
 */
function storable(a: CalendarAccount, legacyUrl?: string): CalendarAccount {
  return {
    id: a.id,
    provider: a.provider,
    label: a.label,
    ...(legacyUrl ? { url: legacyUrl } : {}),
    ...(typeof a.displayUrl === 'string' && a.displayUrl ? { displayUrl: a.displayUrl } : {}),
    ...(a.urlInKeychain ? { urlInKeychain: true } : {}),
    calendars: (a.calendars ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      enabled: c.enabled !== false,
      ...(c.primary ? { primary: true } : {}),
      ...(typeof c.customName === 'string' && c.customName.trim() ? { customName: c.customName.trim().slice(0, 80) } : {}),
      ...(isCategory(c.category) ? { category: c.category } : {}),
    })),
    enabled: a.enabled !== false,
    ...(typeof a.name === 'string' && a.name.trim() ? { name: a.name.trim().slice(0, 80) } : {}),
    ...(Number.isFinite(a.syncEveryMin) && a.syncEveryMin! >= 0 ? { syncEveryMin: Math.round(a.syncEveryMin!) } : {}),
    ...(Array.isArray(a.hidden) && a.hidden.length
      ? { hidden: [...new Set(a.hidden.filter((k) => typeof k === 'string' && k))].slice(-MAX_HIDDEN) }
      : {}),
    ...(a.lastSyncAt ? { lastSyncAt: a.lastSyncAt } : {}),
    error: a.error ? scrubUrls(a.error) : null,
    errorCode: a.errorCode ?? null,
  };
}

function isAccount(x: unknown): x is CalendarAccount {
  const a = x as CalendarAccount | null;
  return typeof a?.id === 'string' && (a.provider === 'google' || a.provider === 'ics');
}

function isEvent(x: unknown): x is CalendarEvent {
  const e = x as CalendarEvent | null;
  return (
    typeof e?.id === 'string' &&
    typeof e.accountId === 'string' &&
    typeof e.calendarId === 'string' &&
    Number.isFinite(e.startMs) &&
    Number.isFinite(e.endMs)
  );
}

function parseJson(text: string | null): any {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Run at most `max` tasks at once; a finished task hands its slot straight to the next. */
function createLimiter(max: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async function run<T>(task: () => Promise<T>): Promise<T> {
    if (active < max) active++;
    else await new Promise<void>((resolve) => waiting.push(resolve));
    try {
      return await task();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
}

export function createCalendarService(options: CalendarServiceOptions = {}): CalendarService {
  const providers = options.providers ?? { google: createGoogleProvider(), ics: createIcsProvider() };
  const now = options.now ?? Date.now;
  const minInterval = options.minSyncIntervalMs ?? 60_000;
  const limit = createLimiter(Math.max(1, options.concurrency ?? 4));

  let accounts: CalendarAccount[] = [];
  /** accountId → full ICS link. Memory only: the keychain holds the lasting copy. */
  const links = new Map<string, string>();
  /** ICS accounts whose old plain link the keychain refused; see `storable`. */
  const unmigrated = new Set<string>();
  /** accountId → eventId → event */
  const cache = new Map<string, Map<string, CalendarEvent>>();
  /** Last sync attempt per account, for throttling. */
  const attempted = new Map<string, { at: number; range: TimeRange }>();
  const listeners = new Set<() => void>();
  let syncing = false;
  let queue: Promise<void> = Promise.resolve();
  let ready: Promise<void> | null = null;
  let offExternal: (() => void) | null = null;

  const notify = () => {
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch (e) {
        console.error('[calendar] listener failed', e);
      }
    }
  };

  const patch = (id: string, change: Partial<CalendarAccount>) => {
    accounts = accounts.map((a) => (a.id === id ? { ...a, ...change } : a));
  };

  // -- persistence ----------------------------------------------------------

  const persist = (key: string, value: unknown) =>
    platform.save(key, JSON.stringify(value)).catch((e) => console.warn(`[calendar] couldn't save ${key}`, e));

  const load = async (key: string) => parseJson(await platform.load(key).catch(() => null));

  const saveAccounts = () =>
    persist(ACCOUNTS_KEY, {
      version: 1,
      accounts: accounts.map((a) => storable(a, unmigrated.has(a.id) ? links.get(a.id) : undefined)),
    });

  const saveCache = () => {
    const range = defaultSyncWindow(now());
    const events: CalendarEvent[] = [];
    for (const a of accounts) {
      for (const ev of cache.get(a.id)?.values() ?? []) if (overlaps(ev, range.startMs, range.endMs)) events.push(ev);
    }
    return persist(CACHE_KEY, { version: 1, savedAt: now(), range, events });
  };

  async function loadAccounts() {
    const stored = await load(ACCOUNTS_KEY);
    const raw: CalendarAccount[] = Array.isArray(stored?.accounts) ? stored.accounts.filter(isAccount) : [];
    const legacy: string[] = [];
    accounts = raw.map((a) => {
      const plain = a.provider === 'ics' && typeof a.url === 'string' && a.url ? a.url : null;
      if (!plain) return storable(a);
      legacy.push(a.id);
      links.set(a.id, plain);
      return { ...storable(a), displayUrl: a.displayUrl || redactIcsUrl(plain) };
    });
    const known = new Set(accounts.map((a) => a.id));
    for (const id of [...cache.keys()]) {
      if (!known.has(id)) {
        cache.delete(id);
        attempted.delete(id);
      }
    }
    for (const id of [...links.keys()]) if (!known.has(id)) links.delete(id);
    for (const id of [...unmigrated]) if (!known.has(id)) unmigrated.delete(id);
    if (legacy.length) await moveLinksToKeychain(legacy);
  }

  /** Older versions kept ICS links in the plain account file. Move them to the keychain, then rewrite the file. */
  async function moveLinksToKeychain(ids: string[]) {
    let moved = 0;
    for (const id of ids) {
      const url = links.get(id);
      if (!url) continue;
      try {
        await platform.secrets.set(icsSecretKey(id), url);
        unmigrated.delete(id);
        patch(id, { urlInKeychain: true });
        moved++;
      } catch {
        unmigrated.add(id);
        console.warn('[calendar] the keychain refused a calendar link; it stays in the account file for now');
      }
    }
    if (moved) await saveAccounts();
  }

  /** The account as providers need it: with its ICS link, from memory or the keychain. */
  async function withLink(acc: CalendarAccount): Promise<CalendarAccount> {
    if (acc.provider !== 'ics') return acc;
    let url = links.get(acc.id);
    if (!url) {
      let saved: string | null;
      try {
        saved = await platform.secrets.get(icsSecretKey(acc.id));
      } catch (e) {
        throw new CalendarError('config', 'Daybloom couldn’t open the system keychain to read this calendar’s link.', { cause: e });
      }
      if (!saved) throw new CalendarError('invalid', 'Daybloom can’t find the link for this calendar. Add the link again.');
      links.set(acc.id, (url = saved));
    }
    return { ...acc, url };
  }

  async function loadCache() {
    const stored = await load(CACHE_KEY);
    const range = stored?.range as TimeRange | undefined;
    if (!Array.isArray(stored?.events) || !Number.isFinite(range?.startMs) || !Number.isFinite(range?.endMs)) return;
    const known = new Set(accounts.map((a) => a.id));
    // The stored snapshot is authoritative for its window; keep anything outside it.
    for (const bucket of cache.values()) {
      for (const [key, ev] of bucket) if (overlaps(ev, range!.startMs, range!.endMs)) bucket.delete(key);
    }
    for (const ev of stored.events) {
      if (!isEvent(ev) || !known.has(ev.accountId)) continue;
      let bucket = cache.get(ev.accountId);
      if (!bucket) cache.set(ev.accountId, (bucket = new Map()));
      bucket.set(ev.id, ev);
    }
  }

  async function loadGoogleClient(fromOtherWindow: boolean) {
    const stored = (await load(GOOGLE_CLIENT_KEY)) as GoogleClientConfig | null;
    // At startup, don't clobber a client the UI may already have set in memory.
    if (stored?.clientId) applyGoogleClient(stored);
    else if (fromOtherWindow) applyGoogleClient(null);
  }

  async function onExternalChange(key: string) {
    if (key === ACCOUNTS_KEY) await loadAccounts();
    else if (key === CACHE_KEY) await loadCache();
    else if (key === GOOGLE_CLIENT_KEY) await loadGoogleClient(true);
    else return;
    notify();
  }

  function init(): Promise<void> {
    ready ??= (async () => {
      await loadAccounts();
      await loadCache();
      await loadGoogleClient(false);
      offExternal = platform.onExternalChange((key) => void onExternalChange(key));
      notify();
    })();
    return ready;
  }

  // -- sync -----------------------------------------------------------------

  function isDue(a: CalendarAccount, range: TimeRange, t: number, every = minInterval): boolean {
    if (a.error === RECONNECT) return false;
    const last = attempted.get(a.id);
    return !last || !contains(last.range, range) || t - last.at >= every;
  }

  /** How often an account syncs by itself (ms); 0 = only when asked. */
  const cadenceOf = (a: CalendarAccount, fallbackMs: number) => (a.syncEveryMin == null ? fallbackMs : a.syncEveryMin * 60_000);

  function replaceRange(bucket: Map<string, CalendarEvent>, calendarId: string, range: TimeRange, events: CalendarEvent[]) {
    for (const [key, ev] of bucket) {
      if (ev.calendarId === calendarId && overlaps(ev, range.startMs, range.endMs)) bucket.delete(key);
    }
    for (const ev of events) bucket.set(ev.id, ev);
  }

  async function syncAccount(id: string, range: TimeRange): Promise<void> {
    const found = accounts.find((a) => a.id === id);
    const provider = found && providers[found.provider];
    if (!found || !provider) return;
    attempted.set(id, { at: now(), range });

    let acc: CalendarAccount;
    let calendars: CalendarInfo[];
    try {
      acc = await withLink(found);
      calendars = mergeCalendars(acc.calendars, await limit(() => provider.listCalendars(acc)));
    } catch (e) {
      patch(id, describeError(e)); // cached events stay as the last good copy
      return;
    }
    const wanted = calendars.filter((c) => c.enabled);
    const snapshot = { ...acc, calendars };
    const results = await Promise.allSettled(
      wanted.map((c) => limit(() => provider.fetchEvents(snapshot, c, range))),
    );

    const current = accounts.find((a) => a.id === id);
    if (!current) return; // removed while we were fetching
    const bucket = cache.get(id) ?? new Map<string, CalendarEvent>();
    let problem: ReturnType<typeof describeError> | null = null;
    let anyOk = wanted.length === 0;
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === 'fulfilled') {
        replaceRange(bucket, wanted[i].id, range, r.value);
        anyOk = true;
      } else {
        problem ??= describeError(r.reason);
      }
    }
    const known = new Set(calendars.map((c) => c.id));
    for (const [key, ev] of bucket) if (!known.has(ev.calendarId)) bucket.delete(key);
    cache.set(id, bucket);
    patch(id, {
      calendars: mergeCalendars(current.calendars, calendars), // keep toggles made mid-sync
      error: problem?.error ?? null,
      errorCode: problem?.errorCode ?? null,
      ...(anyOk ? { lastSyncAt: now() } : {}),
    });
  }

  /** Drop long-past events so a long-running session doesn't grow without bound. */
  function prune() {
    const cutoff = defaultSyncWindow(now()).startMs - 31 * DAY_MS;
    for (const bucket of cache.values()) {
      for (const [key, ev] of bucket) if (ev.endMs < cutoff) bucket.delete(key);
    }
  }

  async function runSync(range: TimeRange, { force = false, auto = false, everyMs = DEFAULT_SYNC_MIN * 60_000 }: SyncOptions): Promise<void> {
    await init();
    const t = now();
    const due = accounts.filter((a) => {
      if (!a.enabled || !providers[a.provider]) return false;
      if (!auto) return force || isDue(a, range, t);
      const every = cadenceOf(a, everyMs);
      if (every <= 0) return false;
      return force ? a.error !== RECONNECT : isDue(a, range, t, Math.max(every, minInterval));
    });
    if (!due.length) return;
    syncing = true;
    notify();
    try {
      await Promise.all(due.map((a) => syncAccount(a.id, range)));
      prune();
    } finally {
      syncing = false;
    }
    await Promise.all([saveAccounts(), saveCache()]);
    notify();
  }

  function sync(range?: TimeRange, opts: SyncOptions = {}): Promise<void> {
    const r = range ?? defaultSyncWindow(now());
    const run = queue.then(() => runSync(r, opts));
    queue = run.catch(() => {});
    return run;
  }

  const syncInBackground = () => void sync().catch((e) => console.warn('[calendar] sync failed', e));

  // -- accounts -------------------------------------------------------------

  async function connect(kind: ProviderKind, input?: ConnectInput): Promise<CalendarAccount> {
    await init();
    const provider = providers[kind];
    if (!provider) throw new CalendarError('config', 'This kind of calendar isn’t available.');
    const { url, ...incoming } = await provider.connect(input);
    if (kind === 'ics' && url) {
      // The link is the credential for an ICS feed: it goes to the keychain, never to the file.
      try {
        await platform.secrets.set(icsSecretKey(incoming.id), url);
      } catch (e) {
        throw new CalendarError('config', 'Daybloom couldn’t keep this link safe in your system keychain, so it didn’t add the calendar.', {
          cause: e,
        });
      }
      links.set(incoming.id, url);
      unmigrated.delete(incoming.id);
      Object.assign(incoming, { displayUrl: redactIcsUrl(url), urlInKeychain: true });
    }
    const existing = accounts.find((a) => a.id === incoming.id);
    const account: CalendarAccount = existing
      ? {
          ...existing,
          ...incoming,
          calendars: mergeCalendars(existing.calendars, incoming.calendars),
          lastSyncAt: existing.lastSyncAt,
          enabled: true,
          error: null,
          errorCode: null,
        }
      : { ...incoming, enabled: true, error: null, errorCode: null };
    accounts = existing ? accounts.map((a) => (a.id === account.id ? account : a)) : [...accounts, account];
    attempted.delete(account.id);
    notify();
    await saveAccounts();
    syncInBackground();
    return account;
  }

  return {
    get status(): SyncStatus {
      if (syncing) return 'syncing';
      return accounts.some((a) => a.enabled && a.error) ? 'error' : 'idle';
    },

    get lastSyncAt(): number | null {
      const times = accounts.map((a) => a.lastSyncAt ?? 0).filter((t) => t > 0);
      return times.length ? Math.max(...times) : null;
    },

    get googleConfigured(): boolean {
      return getGoogleClient() !== null;
    },

    init,

    getAccounts: () => accounts,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    connectGoogle: () => connect('google'),

    addIcs: (url, label) => connect('ics', { url, label }),

    async removeAccount(id) {
      await init();
      const acc = accounts.find((a) => a.id === id);
      if (!acc) return;
      const url = links.get(id);
      accounts = accounts.filter((a) => a.id !== id);
      cache.delete(id);
      attempted.delete(id);
      links.delete(id);
      unmigrated.delete(id);
      notify();
      await Promise.all([saveAccounts(), saveCache()]);
      let cleaned = false;
      try {
        const provider = providers[acc.provider];
        if (provider) {
          await provider.disconnect(url ? { ...acc, url } : acc);
          cleaned = true;
        }
      } catch {
        /* fall through to the direct keychain delete */
      }
      if (acc.provider === 'ics') await platform.secrets.delete(icsSecretKey(id)).catch(() => {});
      if (!cleaned) await platform.secrets.delete(id).catch(() => {});
    },

    async setAccountEnabled(id, on) {
      await init();
      if (!accounts.some((a) => a.id === id && a.enabled !== on)) return;
      patch(id, { enabled: on });
      if (on) attempted.delete(id);
      notify();
      await saveAccounts();
      if (on) syncInBackground();
    },

    async setCalendarEnabled(accountId, calendarId, on) {
      await init();
      const acc = accounts.find((a) => a.id === accountId);
      if (!acc?.calendars.some((c) => c.id === calendarId && c.enabled !== on)) return;
      patch(accountId, { calendars: acc.calendars.map((c) => (c.id === calendarId ? { ...c, enabled: on } : c)) });
      if (on) attempted.delete(accountId);
      notify();
      await saveAccounts();
      if (on) syncInBackground();
    },

    async updateAccount(id, change) {
      await init();
      const acc = accounts.find((a) => a.id === id);
      if (!acc) return;
      const next: Partial<CalendarAccount> = {};
      if (change.name !== undefined) next.name = change.name.trim().slice(0, 80) || undefined;
      if (change.syncEveryMin !== undefined) next.syncEveryMin = Math.max(0, Math.round(change.syncEveryMin));
      patch(id, next);
      notify();
      await saveAccounts();
    },

    async updateCalendar(accountId, calendarId, change) {
      await init();
      const acc = accounts.find((a) => a.id === accountId);
      if (!acc?.calendars.some((c) => c.id === calendarId)) return;
      patch(accountId, {
        calendars: acc.calendars.map((c) => {
          if (c.id !== calendarId) return c;
          const out = { ...c };
          if (change.name !== undefined) {
            const n = change.name?.trim().slice(0, 80);
            if (n && n !== c.name) out.customName = n;
            else delete out.customName;
          }
          if (change.category !== undefined) {
            if (change.category && isCategory(change.category)) out.category = change.category;
            else delete out.category;
          }
          return out;
        }),
      });
      notify();
      await saveAccounts();
    },

    async setSeriesIncluded(accountId, keys, on) {
      await init();
      const acc = accounts.find((a) => a.id === accountId);
      if (!acc || !keys.length) return;
      const hidden = new Set(acc.hidden ?? []);
      for (const k of keys) {
        if (on) hidden.delete(k);
        else hidden.add(k);
      }
      patch(accountId, { hidden: [...hidden].slice(-MAX_HIDDEN) });
      notify();
      await saveAccounts();
    },

    accountEvents(accountId, startMs, endMs) {
      const a = accounts.find((x) => x.id === accountId);
      const bucket = a && cache.get(a.id);
      if (!a || !bucket) return [];
      const shown = new Map(a.calendars.filter((c) => c.enabled).map((c) => [c.id, c]));
      const out: CalendarEvent[] = [];
      for (const ev of bucket.values()) if (shown.has(ev.calendarId) && overlaps(ev, startMs, endMs)) out.push(ev);
      return out.sort(compareEvents);
    },

    sync,

    eventsBetween(startMs, endMs) {
      const out: CalendarEvent[] = [];
      for (const a of accounts) {
        if (!a.enabled) continue;
        const bucket = cache.get(a.id);
        if (!bucket) continue;
        const shown = new Map(a.calendars.filter((c) => c.enabled).map((c) => [c.id, c]));
        const hidden = new Set(a.hidden ?? []);
        for (const ev of bucket.values()) {
          const cal = shown.get(ev.calendarId);
          if (!cal || !overlaps(ev, startMs, endMs) || (hidden.size && hidden.has(seriesKey(ev)))) continue;
          // What the user called the calendar, and the colour they gave it, travel with its events.
          out.push({ ...ev, calendarName: calendarName(cal), ...(cal.category ? { category: cal.category } : {}) });
        }
      }
      return out.sort(compareEvents);
    },

    startAutoSync(intervalMs = DEFAULT_SYNC_MIN * 60_000) {
      const doc = typeof document !== 'undefined' ? document : null;
      const win = typeof window !== 'undefined' ? window : null;
      // Each account syncs at its own cadence (`syncEveryMin`, else `intervalMs`); the check runs
      // at least once a minute so a short cadence is honoured.
      // Hidden or not: the widget and the menu bar show these events too.
      const run = (force = false) => {
        void sync(undefined, { auto: true, force, everyMs: intervalMs }).catch((e) => console.warn('[calendar] sync failed', e));
      };
      const onVisibility = () => !doc?.hidden && run();
      const onOnline = () => run(true);
      run();
      const timer = setInterval(() => run(), Math.min(intervalMs, 60_000));
      doc?.addEventListener('visibilitychange', onVisibility);
      win?.addEventListener('online', onOnline);
      return () => {
        clearInterval(timer);
        doc?.removeEventListener('visibilitychange', onVisibility);
        win?.removeEventListener('online', onOnline);
      };
    },

    async setGoogleClient(config) {
      const clientId = config?.clientId.trim();
      const stored = clientId ? { clientId, clientSecret: config?.clientSecret?.trim() || undefined } : null;
      applyGoogleClient(stored);
      await persist(GOOGLE_CLIENT_KEY, stored);
      for (const a of accounts) if (a.provider === 'google') attempted.delete(a.id);
      notify();
    },

    exportAccounts() {
      return accounts.map((a) => {
        const { lastSyncAt: _at, error: _e, errorCode: _c, url: _u, ...rest } = storable(a);
        return rest;
      });
    },

    async applyAccounts(list) {
      await init();
      const current = new Map(accounts.map((a) => [a.id, a]));
      const incoming = list.filter(isAccount).map((a) => storable(a));
      const keep = new Set(incoming.map((a) => a.id));
      let added = false;
      // The new list goes in at once, so a read straight after sees it.
      accounts = incoming.map((a) => {
        const cur = current.get(a.id);
        if (!cur) {
          added = true;
          attempted.delete(a.id);
          return { ...a, ...(a.provider === 'ics' ? { urlInKeychain: true } : {}), error: null, errorCode: null };
        }
        return { ...cur, ...a, lastSyncAt: cur.lastSyncAt, error: cur.error ?? null, errorCode: cur.errorCode ?? null };
      });
      for (const id of current.keys()) {
        if (keep.has(id)) continue;
        cache.delete(id);
        attempted.delete(id);
        links.delete(id);
        unmigrated.delete(id);
      }
      notify();
      await Promise.all([saveAccounts(), saveCache()]);
      if (added) syncInBackground();
    },

    dispose() {
      offExternal?.();
      offExternal = null;
      ready = null;
      listeners.clear();
    },
  };
}

export const calendarService = createCalendarService();
export default calendarService;
