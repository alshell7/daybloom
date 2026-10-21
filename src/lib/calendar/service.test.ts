import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  store: new Map<string, string>(),
  secrets: new Map<string, string>(),
  external: new Set<(key: string) => void>(),
}));

vi.mock('../platform', () => ({
  platform: {
    load: vi.fn(async (key: string) => h.store.get(key) ?? null),
    save: vi.fn(async (key: string, value: string) => void h.store.set(key, value)),
    onExternalChange: vi.fn((cb: (key: string) => void) => {
      h.external.add(cb);
      return () => h.external.delete(cb);
    }),
    fetch: vi.fn(),
    openExternal: vi.fn(),
    secrets: {
      get: vi.fn(async (account: string) => h.secrets.get(account) ?? null),
      set: vi.fn(async (account: string, value: string) => void h.secrets.set(account, value)),
      delete: vi.fn(async (account: string) => void h.secrets.delete(account)),
    },
    oauth: { listen: vi.fn(), wait: vi.fn() },
  },
}));

import type { CalendarEvent } from '../engine/types';
import { platform } from '../platform';
import { icsAccountId, icsSecretKey, normalizeIcsUrl } from './ics';
import { ACCOUNTS_KEY, CACHE_KEY, createCalendarService, defaultSyncWindow, seriesKey, type CalendarService } from './service';
import {
  CalendarError,
  RECONNECT,
  type CalendarAccount,
  type CalendarInfo,
  type CalendarProvider,
  type TimeRange,
} from './types';

const HOUR = 3_600_000;
const NOW = new Date(2026, 9, 19, 10, 0).getTime();
const at = (dayOffset: number, hour: number) => new Date(2026, 9, 19 + dayOffset, hour).getTime();

interface FakeRemote {
  label: string;
  calendars: CalendarInfo[];
  events: Record<string, CalendarEvent[]>;
  failList?: Error;
  failCalendar?: Record<string, Error>;
}

function event(accountId: string, calendarId: string, id: string, startMs: number, hours = 1, extra: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: `${calendarId}:${id}`,
    provider: 'google',
    accountId,
    calendarId,
    title: id,
    startMs,
    endMs: startMs + hours * HOUR,
    allDay: false,
    ...extra,
  };
}

/** A fake Google provider backed by an in-memory "server". */
function fakeGoogle() {
  const remote = new Map<string, FakeRemote>();
  const connectQueue: string[] = [];
  const provider: CalendarProvider = {
    kind: 'google',
    connect: vi.fn(async (): Promise<CalendarAccount> => {
      const id = connectQueue.shift()!;
      const r = remote.get(id)!;
      return { id, provider: 'google', label: r.label, calendars: r.calendars.map((c) => ({ ...c })), enabled: true, error: null };
    }),
    listCalendars: vi.fn(async (acc: CalendarAccount) => {
      const r = remote.get(acc.id)!;
      if (r.failList) throw r.failList;
      return r.calendars.map((c) => ({ ...c }));
    }),
    fetchEvents: vi.fn(async (acc: CalendarAccount, cal: CalendarInfo, range: TimeRange) => {
      const r = remote.get(acc.id)!;
      const fail = r.failCalendar?.[cal.id];
      if (fail) throw fail;
      return (r.events[cal.id] ?? []).filter((e) => e.startMs < range.endMs && e.endMs > range.startMs);
    }),
    disconnect: vi.fn(async () => {}),
  };
  return { provider, remote, connectQueue };
}

let services: CalendarService[] = [];
function makeService(provider: CalendarProvider, opts: { concurrency?: number } = {}) {
  const s = createCalendarService({ providers: { google: provider }, now: () => NOW, ...opts });
  services.push(s);
  return s;
}

async function setupTwoAccounts() {
  const g = fakeGoogle();
  g.remote.set('google:work', {
    label: 'me@work.com',
    calendars: [
      { id: 'work-main', name: 'Work', color: '#3366ff', enabled: true, primary: true },
      { id: 'work-team', name: 'Team', color: '#22aa66', enabled: true },
    ],
    events: {
      'work-main': [event('google:work', 'work-main', 'standup', at(0, 9), 0.25), event('google:work', 'work-main', 'later', at(30, 9))],
      'work-team': [event('google:work', 'work-team', 'retro', at(1, 15))],
    },
  });
  g.remote.set('google:home', {
    label: 'me@home.com',
    calendars: [{ id: 'home-main', name: 'Home', color: '#ff8800', enabled: true, primary: true }],
    events: {
      'home-main': [
        event('google:home', 'home-main', 'dentist', at(0, 14)),
        event('google:home', 'home-main', 'birthday', at(0, 0), 24, { allDay: true }),
      ],
    },
  });
  g.connectQueue.push('google:work', 'google:home');
  const service = makeService(g.provider);
  await service.connectGoogle();
  await service.connectGoogle();
  await service.sync();
  return { g, service };
}

const today = () => [at(0, 0), at(1, 0)] as const;
const titles = (events: CalendarEvent[]) => events.map((e) => e.title);

beforeEach(() => {
  h.store.clear();
  h.secrets.clear();
  h.external.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  services.forEach((s) => s.dispose());
  services = [];
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('calendar service: multiple accounts', () => {
  it('merges events from every account, sorted with all-day first', async () => {
    const { service } = await setupTwoAccounts();
    expect(service.getAccounts().map((a) => a.label)).toEqual(['me@work.com', 'me@home.com']);
    expect(titles(service.eventsBetween(...today()))).toEqual(['birthday', 'standup', 'dentist']);
    expect(titles(service.eventsBetween(at(0, 0), at(2, 0)))).toEqual(['birthday', 'standup', 'dentist', 'retro']);
    expect(service.status).toBe('idle');
    expect(service.lastSyncAt).toBe(NOW);
  });

  it('keeps an account’s last good events when its sync fails, without touching other accounts', async () => {
    const { g, service } = await setupTwoAccounts();
    const work = g.remote.get('google:work')!;
    work.events['work-main'].push(event('google:work', 'work-main', 'new meeting', at(0, 11)));
    g.remote.get('google:home')!.failList = new CalendarError('network', 'Couldn’t reach Google.');

    await service.sync(undefined, { force: true });

    const [workAcc, homeAcc] = service.getAccounts();
    expect(workAcc.error).toBeNull();
    expect(homeAcc.error).toBe('Couldn’t reach Google.');
    expect(service.status).toBe('error');
    expect(titles(service.eventsBetween(...today()))).toEqual(['birthday', 'standup', 'new meeting', 'dentist']);
  });

  it('keeps a failing calendar’s events while refreshing the account’s other calendars', async () => {
    const { g, service } = await setupTwoAccounts();
    const work = g.remote.get('google:work')!;
    work.failCalendar = { 'work-team': new CalendarError('http', 'Google Calendar error 500.') };
    work.events['work-main'] = [event('google:work', 'work-main', 'moved standup', at(0, 10))];

    await service.sync(undefined, { force: true });

    expect(service.getAccounts()[0].error).toBe('Google Calendar error 500.');
    const events = titles(service.eventsBetween(at(0, 0), at(2, 0)));
    expect(events).toContain('moved standup');
    expect(events).not.toContain('standup');
    expect(events).toContain('retro');
  });

  it('marks revoked accounts for reconnection and stops retrying them until forced', async () => {
    const { g, service } = await setupTwoAccounts();
    g.remote.get('google:home')!.failList = new CalendarError('reconnect', 'Google needs you to sign in again.');
    await service.sync(undefined, { force: true });
    expect(service.getAccounts()[1].error).toBe(RECONNECT);
    expect(titles(service.eventsBetween(...today()))).toContain('dentist');

    vi.mocked(g.provider.listCalendars).mockClear();
    await service.sync({ startMs: at(20, 0), endMs: at(21, 0) });
    expect(vi.mocked(g.provider.listCalendars).mock.calls.map(([a]) => a.id)).toEqual(['google:work']);
  });

  it('re-connecting the same account updates it in place and keeps calendar toggles', async () => {
    const { g, service } = await setupTwoAccounts();
    await service.setCalendarEnabled('google:work', 'work-team', false);
    g.remote.get('google:work')!.label = 'renamed@work.com';
    g.connectQueue.push('google:work');
    await service.connectGoogle();

    const accounts = service.getAccounts();
    expect(accounts).toHaveLength(2);
    expect(accounts[0].label).toBe('renamed@work.com');
    expect(accounts[0].calendars.find((c) => c.id === 'work-team')?.enabled).toBe(false);
  });

  it('hides disabled calendars and accounts', async () => {
    const { service } = await setupTwoAccounts();
    const listener = vi.fn();
    service.subscribe(listener);

    await service.setCalendarEnabled('google:work', 'work-main', false);
    expect(titles(service.eventsBetween(...today()))).toEqual(['birthday', 'dentist']);
    await service.setAccountEnabled('google:home', false);
    expect(service.eventsBetween(...today())).toEqual([]);
    expect(listener).toHaveBeenCalled();

    await service.setCalendarEnabled('google:work', 'work-main', true);
    await service.sync();
    expect(titles(service.eventsBetween(...today()))).toEqual(['standup']);
  });

  it('removes an account, its events and its credentials', async () => {
    const { g, service } = await setupTwoAccounts();
    await service.removeAccount('google:home');
    expect(g.provider.disconnect).toHaveBeenCalledWith(expect.objectContaining({ id: 'google:home' }));
    expect(service.getAccounts().map((a) => a.id)).toEqual(['google:work']);
    expect(titles(service.eventsBetween(...today()))).toEqual(['standup']);
    expect(h.store.get(CACHE_KEY)).not.toContain('dentist');
  });

  it('takes another device’s account list without signing anyone out', async () => {
    const { g, service } = await setupTwoAccounts();
    const exported = service.exportAccounts();
    expect(exported.map((a) => a.id)).toEqual(['google:work', 'google:home']);
    expect(JSON.stringify(exported)).not.toMatch(/lastSyncAt|"url"/);
    // Another device removed "home", renamed "work" and added a new account.
    g.remote.set('google:new', { label: 'me@new.com', calendars: [{ id: 'new-main', name: 'New', color: '#aa3366', enabled: true }], events: { 'new-main': [] } });
    const next = [{ ...exported[0], name: 'Office' }, { id: 'google:new', provider: 'google' as const, label: 'me@new.com', calendars: [{ id: 'new-main', name: 'New', color: '#aa3366', enabled: true }], enabled: true }];
    await service.applyAccounts(next);
    expect(service.getAccounts().map((a) => [a.id, a.name ?? a.label])).toEqual([
      ['google:work', 'Office'],
      ['google:new', 'me@new.com'],
    ]);
    expect(g.provider.disconnect).not.toHaveBeenCalled();
    expect(titles(service.eventsBetween(...today()))).not.toContain('dentist');
  });

  it('falls back to deleting the keychain entry when disconnect fails', async () => {
    const { g, service } = await setupTwoAccounts();
    vi.mocked(g.provider.disconnect).mockRejectedValueOnce(new Error('offline'));
    await service.removeAccount('google:work');
    expect(platform.secrets.delete).toHaveBeenCalledWith('google:work');
  });
});

describe('calendar service: sync scheduling', () => {
  it('throttles repeat syncs of the same range but honours force and new ranges', async () => {
    const { g, service } = await setupTwoAccounts();
    const calls = () => vi.mocked(g.provider.listCalendars).mock.calls.length;
    const before = calls();
    await service.sync();
    expect(calls()).toBe(before);
    await service.sync(undefined, { force: true });
    expect(calls()).toBe(before + 2);
    await service.sync({ startMs: at(20, 0), endMs: at(40, 0) });
    expect(calls()).toBe(before + 4);
    // The wider range brought in an event outside the default window.
    expect(titles(service.eventsBetween(at(29, 0), at(31, 0)))).toEqual(['later']);
  });

  it('caps concurrent provider requests', async () => {
    const g = fakeGoogle();
    const calendars = Array.from({ length: 6 }, (_, i) => ({ id: `c${i}`, name: `C${i}`, color: '#000000', enabled: true }));
    g.remote.set('google:many', { label: 'many', calendars, events: {} });
    let inFlight = 0;
    let peak = 0;
    vi.mocked(g.provider.fetchEvents).mockImplementation(async () => {
      peak = Math.max(peak, ++inFlight);
      await new Promise((r) => setTimeout(r, 2));
      inFlight--;
      return [];
    });
    g.connectQueue.push('google:many');
    const service = makeService(g.provider, { concurrency: 2 });
    await service.connectGoogle();
    await service.sync(undefined, { force: true });
    expect(peak).toBe(2);
    expect(g.provider.fetchEvents).toHaveBeenCalledTimes(12);
  });

  it('auto-syncs on an interval, also while the planner is hidden (the widget and menu bar show events)', async () => {
    vi.useFakeTimers();
    const listeners: Record<string, () => void> = {};
    const doc = {
      hidden: true,
      addEventListener: (type: string, fn: () => void) => (listeners[type] = fn),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal('document', doc);
    const g = fakeGoogle();
    g.remote.set('google:a', { label: 'a', calendars: [{ id: 'c', name: 'C', color: '#000000', enabled: true }], events: {} });
    h.store.set(ACCOUNTS_KEY, JSON.stringify({ version: 1, accounts: [{ id: 'google:a', provider: 'google', label: 'a', calendars: [], enabled: true }] }));
    const service = createCalendarService({ providers: { google: g.provider }, minSyncIntervalMs: 0 });
    services.push(service);
    await service.init();
    const syncs = () => vi.mocked(g.provider.listCalendars).mock.calls.length;

    const stop = service.startAutoSync(60_000);
    await vi.advanceTimersByTimeAsync(0);
    expect(syncs()).toBe(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(syncs()).toBe(2);

    // Coming back into view checks, but a sync from moments ago is fresh enough.
    doc.hidden = false;
    listeners.visibilitychange();
    await vi.advanceTimersByTimeAsync(0);
    expect(syncs()).toBe(2);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(syncs()).toBe(3);

    stop();
    await vi.advanceTimersByTimeAsync(300_000);
    expect(syncs()).toBe(3);
    expect(doc.removeEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  });
});

describe('calendar service: your names, colours and choices', () => {
  it('renames accounts and calendars, picks a colour, and keeps it all across syncs and restarts', async () => {
    const { g, service } = await setupTwoAccounts();
    await service.updateAccount('google:work', { name: '  Office  ' });
    await service.updateCalendar('google:work', 'work-team', { name: 'Squad', category: 'social' });
    await service.sync(undefined, { force: true });
    const work = service.getAccounts().find((a) => a.id === 'google:work')!;
    expect(work.name).toBe('Office');
    const team = work.calendars.find((c) => c.id === 'work-team')!;
    expect(team).toMatchObject({ name: 'Team', customName: 'Squad', category: 'social' });
    // Events carry the calendar's shown name and the picked category.
    const retro = service.eventsBetween(at(1, 0), at(2, 0)).find((e) => e.title === 'retro')!;
    expect(retro).toMatchObject({ calendarName: 'Squad', category: 'social' });

    // Restart: the choices were saved.
    const again = makeService(g.provider);
    await again.init();
    const saved = again.getAccounts().find((a) => a.id === 'google:work')!;
    expect(saved.name).toBe('Office');
    expect(saved.calendars.find((c) => c.id === 'work-team')).toMatchObject({ customName: 'Squad', category: 'social' });

    // Clearing goes back to the provider's name and colour.
    await service.updateCalendar('google:work', 'work-team', { name: null, category: null });
    const cleared = service.getAccounts().find((a) => a.id === 'google:work')!.calendars.find((c) => c.id === 'work-team')!;
    expect(cleared.customName).toBeUndefined();
    expect(cleared.category).toBeUndefined();
  });

  it('leaves out every repeat of a series, and brings it back', async () => {
    const g = fakeGoogle();
    const standup = (day: number) => event('google:a', 'c', `standup_${day}`, at(day, 9), 0.25, { series: 'standup' });
    g.remote.set('google:a', {
      label: 'a',
      calendars: [{ id: 'c', name: 'C', color: '#000000', enabled: true }],
      events: { c: [standup(0), standup(1), event('google:a', 'c', 'lunch', at(0, 12))] },
    });
    g.connectQueue.push('google:a');
    const service = makeService(g.provider);
    await service.connectGoogle();
    await service.sync(undefined, { force: true });
    const range = [at(0, 0), at(2, 0)] as const;
    expect(titles(service.eventsBetween(...range)).sort()).toEqual(['lunch', 'standup_0', 'standup_1']);

    const key = seriesKey(service.eventsBetween(...range).find((e) => e.title === 'standup_0')!);
    await service.setSeriesIncluded('google:a', [key], false);
    expect(titles(service.eventsBetween(...range))).toEqual(['lunch']);
    // Still listed for choosing.
    expect(service.accountEvents('google:a', ...range)).toHaveLength(3);

    await service.setSeriesIncluded('google:a', [key], true);
    expect(titles(service.eventsBetween(...range))).toHaveLength(3);
  });

  it('syncs each account at its own cadence, and never by itself when set to only when asked', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const g = fakeGoogle();
    for (const id of ['google:fast', 'google:manual']) g.remote.set(id, { label: id, calendars: [{ id: 'c', name: 'C', color: '#000000', enabled: true }], events: {} });
    h.store.set(
      ACCOUNTS_KEY,
      JSON.stringify({
        version: 1,
        accounts: [
          { id: 'google:fast', provider: 'google', label: 'fast', calendars: [], enabled: true, syncEveryMin: 5 },
          { id: 'google:manual', provider: 'google', label: 'manual', calendars: [], enabled: true, syncEveryMin: 0 },
        ],
      }),
    );
    const service = createCalendarService({ providers: { google: g.provider } });
    services.push(service);
    await service.init();
    const syncsOf = (id: string) => vi.mocked(g.provider.listCalendars).mock.calls.filter(([a]) => a.id === id).length;

    const stop = service.startAutoSync();
    await vi.advanceTimersByTimeAsync(0);
    expect(syncsOf('google:fast')).toBe(1);
    expect(syncsOf('google:manual')).toBe(0);
    await vi.advanceTimersByTimeAsync(4 * 60_000);
    expect(syncsOf('google:fast')).toBe(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(syncsOf('google:fast')).toBe(2);
    expect(syncsOf('google:manual')).toBe(0);

    // Sync now still reaches it.
    await service.sync(undefined, { force: true });
    expect(syncsOf('google:manual')).toBe(1);
    stop();
  });
});

describe('calendar service: persistence', () => {
  it('persists accounts without tokens and a cache of yesterday → +14 days', async () => {
    await setupTwoAccounts();
    const stored = JSON.parse(h.store.get(ACCOUNTS_KEY)!);
    expect(stored.accounts.map((a: CalendarAccount) => a.id)).toEqual(['google:work', 'google:home']);
    expect(h.store.get(ACCOUNTS_KEY)).not.toMatch(/token|secret/i);

    const cache = JSON.parse(h.store.get(CACHE_KEY)!);
    expect(cache.range).toEqual(defaultSyncWindow(NOW));
    const ids = cache.events.map((e: CalendarEvent) => e.title);
    expect(ids).toEqual(expect.arrayContaining(['standup', 'retro', 'dentist', 'birthday']));
    expect(ids).not.toContain('later'); // +30 days is outside the cached window
  });

  it('renders cached events offline after a restart', async () => {
    await setupTwoAccounts();
    const offline = fakeGoogle();
    vi.mocked(offline.provider.listCalendars).mockRejectedValue(new CalendarError('network', 'offline'));
    const restarted = makeService(offline.provider);
    await restarted.init();
    expect(restarted.getAccounts()).toHaveLength(2);
    expect(titles(restarted.eventsBetween(...today()))).toEqual(['birthday', 'standup', 'dentist']);

    await restarted.sync();
    expect(restarted.getAccounts().every((a) => a.error === 'offline')).toBe(true);
    expect(titles(restarted.eventsBetween(...today()))).toEqual(['birthday', 'standup', 'dentist']);
  });

  it('reloads when another window saves accounts or the cache', async () => {
    const { service } = await setupTwoAccounts();
    const other = JSON.parse(h.store.get(ACCOUNTS_KEY)!);
    other.accounts = other.accounts.filter((a: CalendarAccount) => a.id === 'google:work');
    h.store.set(ACCOUNTS_KEY, JSON.stringify(other));
    const listener = vi.fn();
    service.subscribe(listener);

    h.external.forEach((cb) => cb(ACCOUNTS_KEY));
    await vi.waitFor(() => expect(listener).toHaveBeenCalled());
    expect(service.getAccounts().map((a) => a.id)).toEqual(['google:work']);
    expect(titles(service.eventsBetween(...today()))).toEqual(['standup']);

    const cache = JSON.parse(h.store.get(CACHE_KEY)!);
    cache.events = cache.events.filter((e: CalendarEvent) => e.title !== 'standup');
    h.store.set(CACHE_KEY, JSON.stringify(cache));
    listener.mockClear();
    h.external.forEach((cb) => cb(CACHE_KEY));
    await vi.waitFor(() => expect(listener).toHaveBeenCalled());
    expect(service.eventsBetween(...today())).toEqual([]);
  });
});

// -- ICS links are credentials ---------------------------------------------------

/** Synthetic link with a token in the path and the query, like real secret feeds. */
const SECRET = 'private-0f0f0f0f0f0f0f0f';
const FEED_URL = `https://calendar.example.test/ical/someone%40example.test/${SECRET}/basic.ics?key=${SECRET}`;
const FEED_ID = icsAccountId(normalizeIcsUrl(FEED_URL));

/** A fake ICS provider that records the link each call receives. */
function fakeIcs() {
  const seenUrls: (string | undefined)[] = [];
  const feed: CalendarInfo = { id: 'feed', name: 'Team feed', color: '#3fa66b', enabled: true, primary: true };
  const provider: CalendarProvider = {
    kind: 'ics',
    connect: vi.fn(async (input?: { url?: string; label?: string }): Promise<CalendarAccount> => {
      const url = normalizeIcsUrl(input?.url ?? '');
      return { id: icsAccountId(url), provider: 'ics', label: input?.label ?? 'Team feed', url, calendars: [{ ...feed }], enabled: true, error: null };
    }),
    listCalendars: vi.fn(async (acc: CalendarAccount) => {
      seenUrls.push(acc.url);
      if (!acc.url) throw new CalendarError('invalid', 'no link');
      return [{ ...feed }];
    }),
    fetchEvents: vi.fn(async (acc: CalendarAccount, cal: CalendarInfo) => {
      seenUrls.push(acc.url);
      return [event(acc.id, cal.id, 'feed standup', at(0, 9), 1, { provider: 'ics' })];
    }),
    disconnect: vi.fn(async () => {}),
  };
  return { provider, seenUrls };
}

function makeIcsService(provider: CalendarProvider) {
  const s = createCalendarService({ providers: { ics: provider }, now: () => NOW });
  services.push(s);
  return s;
}

/** Everything the app wrote to plain storage, as one string. */
const everythingOnDisk = () => [...h.store.values()].join('\n');

describe('calendar service: ICS links stay in the keychain', () => {
  it('stores the link in the keychain and only a short form on disk', async () => {
    const ics = fakeIcs();
    const service = makeIcsService(ics.provider);
    const account = await service.addIcs(`  webcal://${FEED_URL.slice('https://'.length)}  `, 'Team');
    await service.sync(undefined, { force: true });

    expect(h.secrets.get(icsSecretKey(FEED_ID))).toBe(normalizeIcsUrl(FEED_URL));
    expect(everythingOnDisk()).not.toContain(SECRET);
    expect(everythingOnDisk()).not.toContain('someone%40example.test');
    const stored = JSON.parse(h.store.get(ACCOUNTS_KEY)!).accounts[0];
    expect(stored).not.toHaveProperty('url');
    expect(stored).toMatchObject({ id: FEED_ID, displayUrl: 'calendar.example.test/…/basic.ics?…', urlInKeychain: true });

    // The UI never sees the link either; providers do.
    expect(account).not.toHaveProperty('url');
    expect(service.getAccounts().every((a) => !('url' in a))).toBe(true);
    expect(ics.seenUrls.at(-1)).toBe(normalizeIcsUrl(FEED_URL));
    expect(titles(service.eventsBetween(...today()))).toEqual(['feed standup']);
  });

  it('reads the link back from the keychain when a restarted app syncs', async () => {
    await makeIcsService(fakeIcs().provider).addIcs(FEED_URL);
    const ics = fakeIcs();
    const restarted = makeIcsService(ics.provider);
    await restarted.init();
    expect(platform.secrets.get).not.toHaveBeenCalled(); // only when it is needed

    await restarted.sync(undefined, { force: true });
    expect(platform.secrets.get).toHaveBeenCalledWith(icsSecretKey(FEED_ID));
    expect(ics.seenUrls).toEqual([normalizeIcsUrl(FEED_URL), normalizeIcsUrl(FEED_URL)]);
    expect(restarted.getAccounts()[0].error).toBeNull();
  });

  it('moves a plain link from an older version into the keychain, then rewrites the file', async () => {
    const url = normalizeIcsUrl(FEED_URL);
    h.store.set(
      ACCOUNTS_KEY,
      JSON.stringify({
        version: 1,
        accounts: [
          { id: FEED_ID, provider: 'ics', label: 'Team', url, calendars: [{ id: 'feed', name: 'Team feed', color: '#3fa66b', enabled: true }], enabled: true, error: null },
        ],
      }),
    );
    const ics = fakeIcs();
    const service = makeIcsService(ics.provider);
    await service.init();

    expect(h.secrets.get(icsSecretKey(FEED_ID))).toBe(url);
    expect(everythingOnDisk()).not.toContain(SECRET);
    expect(JSON.parse(h.store.get(ACCOUNTS_KEY)!).accounts[0]).toMatchObject({
      id: FEED_ID,
      label: 'Team',
      displayUrl: 'calendar.example.test/…/basic.ics?…',
      urlInKeychain: true,
    });
    await service.sync(undefined, { force: true });
    expect(ics.seenUrls[0]).toBe(url);
    expect(titles(service.eventsBetween(...today()))).toEqual(['feed standup']);
  });

  it('leaves an old plain link where it was while the keychain refuses it, and moves it later', async () => {
    const url = normalizeIcsUrl(FEED_URL);
    const legacy = JSON.stringify({ version: 1, accounts: [{ id: FEED_ID, provider: 'ics', label: 'Team', url, calendars: [], enabled: true }] });
    h.store.set(ACCOUNTS_KEY, legacy);
    vi.mocked(platform.secrets.set).mockRejectedValueOnce(new Error('keychain locked'));

    const first = makeIcsService(fakeIcs().provider);
    await first.init();
    await first.sync(undefined, { force: true }); // saves the account file again
    expect(h.secrets.has(icsSecretKey(FEED_ID))).toBe(false);
    expect(JSON.parse(h.store.get(ACCOUNTS_KEY)!).accounts[0].url).toBe(url); // not lost

    const second = makeIcsService(fakeIcs().provider);
    await second.init();
    expect(h.secrets.get(icsSecretKey(FEED_ID))).toBe(url);
    expect(everythingOnDisk()).not.toContain(SECRET);
  });

  it('refuses to add a link when the keychain fails, so it never falls back to the file', async () => {
    vi.mocked(platform.secrets.set).mockRejectedValueOnce(new Error('no keychain'));
    const service = makeIcsService(fakeIcs().provider);
    await expect(service.addIcs(FEED_URL)).rejects.toMatchObject({ code: 'config' });
    expect(service.getAccounts()).toEqual([]);
    expect(everythingOnDisk()).not.toContain(SECRET);
  });

  it('removing the account deletes its keychain entry', async () => {
    const ics = fakeIcs();
    const service = makeIcsService(ics.provider);
    await service.addIcs(FEED_URL);
    await service.removeAccount(FEED_ID);

    expect(h.secrets.has(icsSecretKey(FEED_ID))).toBe(false);
    expect(ics.provider.disconnect).toHaveBeenCalledWith(expect.objectContaining({ id: FEED_ID, url: normalizeIcsUrl(FEED_URL) }));
    expect(JSON.parse(h.store.get(ACCOUNTS_KEY)!).accounts).toEqual([]);
  });

  it('asks for the link again when its keychain entry is gone', async () => {
    await makeIcsService(fakeIcs().provider).addIcs(FEED_URL);
    h.secrets.clear();
    const restarted = makeIcsService(fakeIcs().provider);
    await restarted.sync(undefined, { force: true });
    const [acc] = restarted.getAccounts();
    expect(acc.error).toMatch(/Add the link again/);
    expect(acc.errorCode).toBe('invalid');
  });

  it('never stores a link that appears inside an error message', async () => {
    const ics = fakeIcs();
    vi.mocked(ics.provider.listCalendars).mockRejectedValue(new Error(`request failed for url (${normalizeIcsUrl(FEED_URL)})`));
    const service = makeIcsService(ics.provider);
    await service.addIcs(FEED_URL);
    await service.sync(undefined, { force: true });
    expect(service.getAccounts()[0].error).toBe('request failed for url (calendar.example.test/…/basic.ics?…)');
    expect(everythingOnDisk()).not.toContain(SECRET);
  });
});
