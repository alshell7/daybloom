// Calendar service: owns connected accounts, syncs them, and keeps an event cache
// that survives restarts so the widget can render offline. Framework-agnostic —
// wrap `subscribe` with Svelte runes in the UI layer.

import type { CalendarEvent } from '../engine/types';
import { platform } from '../platform';
import { createGoogleProvider, getGoogleClient, setGoogleClient as applyGoogleClient, type GoogleClientConfig } from './google';
import { createIcsProvider } from './ics';
import {
  CalendarError,
  RECONNECT,
  type CalendarAccount,
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
}

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
  getAccounts(): readonly CalendarAccount[];
  /** Called after any change (accounts, events, status). Returns unsubscribe. */
  subscribe(listener: () => void): () => void;
  connectGoogle(): Promise<CalendarAccount>;
  addIcs(url: string, label?: string): Promise<CalendarAccount>;
  removeAccount(id: string): Promise<void>;
  setAccountEnabled(id: string, on: boolean): Promise<void>;
  setCalendarEnabled(accountId: string, calendarId: string, on: boolean): Promise<void>;
  /** Fetch enabled calendars for `range` (default: yesterday → +14 days). Never rejects for account errors. */
  sync(range?: TimeRange, options?: SyncOptions): Promise<void>;
  /** Cached events overlapping [startMs, endMs) from enabled accounts/calendars, sorted. */
  eventsBetween(startMs: number, endMs: number): CalendarEvent[];
  /** Periodic sync that pauses while the document is hidden. Returns a stop function. */
  startAutoSync(intervalMs?: number): () => void;
  /** Persisted override of the Google OAuth client (shared with other windows). `null` → `.env`. */
  setGoogleClient(config: GoogleClientConfig | null): Promise<void>;
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

/** Take the provider's fresh list but keep the user's on/off choices. */
function mergeCalendars(previous: CalendarInfo[], fresh: CalendarInfo[]): CalendarInfo[] {
  return fresh.map((c) => {
    const old = previous.find((p) => p.id === c.id);
    return old ? { ...c, enabled: old.enabled } : c;
  });
}

function describeError(e: unknown): string {
  if (e instanceof CalendarError) return e.code === 'reconnect' ? RECONNECT : e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}

/** Whitelist persisted fields so nothing token-like can ever reach disk. */
function storable(a: CalendarAccount): CalendarAccount {
  return {
    id: a.id,
    provider: a.provider,
    label: a.label,
    ...(a.url ? { url: a.url } : {}),
    calendars: (a.calendars ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      enabled: c.enabled !== false,
      ...(c.primary ? { primary: true } : {}),
    })),
    enabled: a.enabled !== false,
    ...(a.lastSyncAt ? { lastSyncAt: a.lastSyncAt } : {}),
    error: a.error ?? null,
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

  const saveAccounts = () => persist(ACCOUNTS_KEY, { version: 1, accounts: accounts.map(storable) });

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
    accounts = Array.isArray(stored?.accounts) ? stored.accounts.filter(isAccount).map(storable) : [];
    for (const id of [...cache.keys()]) {
      if (!accounts.some((a) => a.id === id)) {
        cache.delete(id);
        attempted.delete(id);
      }
    }
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

  function isDue(a: CalendarAccount, range: TimeRange, t: number): boolean {
    if (a.error === RECONNECT) return false;
    const last = attempted.get(a.id);
    return !last || !contains(last.range, range) || t - last.at >= minInterval;
  }

  function replaceRange(bucket: Map<string, CalendarEvent>, calendarId: string, range: TimeRange, events: CalendarEvent[]) {
    for (const [key, ev] of bucket) {
      if (ev.calendarId === calendarId && overlaps(ev, range.startMs, range.endMs)) bucket.delete(key);
    }
    for (const ev of events) bucket.set(ev.id, ev);
  }

  async function syncAccount(id: string, range: TimeRange): Promise<void> {
    const acc = accounts.find((a) => a.id === id);
    const provider = acc && providers[acc.provider];
    if (!acc || !provider) return;
    attempted.set(id, { at: now(), range });

    let calendars: CalendarInfo[];
    try {
      calendars = mergeCalendars(acc.calendars, await limit(() => provider.listCalendars(acc)));
    } catch (e) {
      patch(id, { error: describeError(e) }); // cached events stay as the last good copy
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
    let error: string | null = null;
    let anyOk = wanted.length === 0;
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === 'fulfilled') {
        replaceRange(bucket, wanted[i].id, range, r.value);
        anyOk = true;
      } else {
        error ??= describeError(r.reason);
      }
    }
    const known = new Set(calendars.map((c) => c.id));
    for (const [key, ev] of bucket) if (!known.has(ev.calendarId)) bucket.delete(key);
    cache.set(id, bucket);
    patch(id, {
      calendars: mergeCalendars(current.calendars, calendars), // keep toggles made mid-sync
      error,
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

  async function runSync(range: TimeRange, { force = false }: SyncOptions): Promise<void> {
    await init();
    const t = now();
    const due = accounts.filter((a) => a.enabled && providers[a.provider] && (force || isDue(a, range, t)));
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
    const incoming = await provider.connect(input);
    const existing = accounts.find((a) => a.id === incoming.id);
    const account: CalendarAccount = existing
      ? {
          ...existing,
          ...incoming,
          calendars: mergeCalendars(existing.calendars, incoming.calendars),
          lastSyncAt: existing.lastSyncAt,
          enabled: true,
          error: null,
        }
      : { ...incoming, enabled: true, error: null };
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
      accounts = accounts.filter((a) => a.id !== id);
      cache.delete(id);
      attempted.delete(id);
      notify();
      await Promise.all([saveAccounts(), saveCache()]);
      let cleaned = false;
      try {
        const provider = providers[acc.provider];
        if (provider) {
          await provider.disconnect(acc);
          cleaned = true;
        }
      } catch {
        /* fall through to the direct keychain delete */
      }
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

    sync,

    eventsBetween(startMs, endMs) {
      const out: CalendarEvent[] = [];
      for (const a of accounts) {
        if (!a.enabled) continue;
        const bucket = cache.get(a.id);
        if (!bucket) continue;
        const shown = new Set(a.calendars.filter((c) => c.enabled).map((c) => c.id));
        for (const ev of bucket.values()) if (shown.has(ev.calendarId) && overlaps(ev, startMs, endMs)) out.push(ev);
      }
      return out.sort(compareEvents);
    },

    startAutoSync(intervalMs = 10 * 60_000) {
      const doc = typeof document !== 'undefined' ? document : null;
      const win = typeof window !== 'undefined' ? window : null;
      const run = (force = false) => {
        if (!doc?.hidden) void sync(undefined, { force }).catch((e) => console.warn('[calendar] sync failed', e));
      };
      const onVisibility = () => run();
      const onOnline = () => run(true);
      run();
      const timer = setInterval(() => run(), intervalMs);
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
