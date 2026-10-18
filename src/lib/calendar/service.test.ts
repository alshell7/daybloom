import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  store: new Map<string, string>(),
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
    secrets: { get: vi.fn(), set: vi.fn(), delete: vi.fn(async () => {}) },
    oauth: { listen: vi.fn(), wait: vi.fn() },
  },
}));

import type { CalendarEvent } from '../engine/types';
import { platform } from '../platform';
import { ACCOUNTS_KEY, CACHE_KEY, createCalendarService, defaultSyncWindow, type CalendarService } from './service';
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

  it('auto-syncs on an interval, pausing while the document is hidden', async () => {
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
    await vi.advanceTimersByTimeAsync(180_000);
    expect(syncs()).toBe(0);

    doc.hidden = false;
    listeners.visibilitychange();
    await vi.advanceTimersByTimeAsync(0);
    expect(syncs()).toBe(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(syncs()).toBe(2);

    stop();
    await vi.advanceTimersByTimeAsync(300_000);
    expect(syncs()).toBe(2);
    expect(doc.removeEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
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
