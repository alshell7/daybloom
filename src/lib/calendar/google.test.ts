import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../platform', () => ({
  platform: {
    fetch: vi.fn(),
    openExternal: vi.fn(),
    secrets: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
    oauth: { listen: vi.fn(), wait: vi.fn() },
  },
}));

import { platform } from '../platform';
import {
  GOOGLE_EVENT_COLORS,
  _resetGoogleTokens,
  createGoogleProvider,
  mapCalendarListEntry,
  mapGoogleEvent,
  pkceChallenge,
  setGoogleClient,
  type GoogleEvent,
} from './google';
import { CalendarError, type CalendarAccount, type CalendarInfo } from './types';

const fetchMock = vi.mocked(platform.fetch);
const local = (y: number, m: number, d: number) => new Date(y, m - 1, d).getTime();
const utc = (y: number, m: number, d: number, h = 0, mi = 0) => Date.UTC(y, m - 1, d, h, mi);

const calendar: CalendarInfo = { id: 'team@group.calendar.google.com', name: 'Team', color: '#9fc6e7', enabled: true };
const account: CalendarAccount = {
  id: 'google:42',
  provider: 'google',
  label: 'me@example.com',
  calendars: [calendar],
  enabled: true,
};

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

type Route = (url: URL, init: RequestInit | undefined) => Response | Promise<Response>;
function route(handler: Route) {
  fetchMock.mockImplementation(async (input, init) => handler(new URL(String(input)), init));
}
const formOf = (init: RequestInit | undefined) => new URLSearchParams(String(init?.body ?? ''));
const authOf = (init: RequestInit | undefined) => (init?.headers as Record<string, string>)?.Authorization;

beforeEach(() => {
  vi.clearAllMocks();
  _resetGoogleTokens();
  setGoogleClient({ clientId: 'cid.apps.googleusercontent.com', clientSecret: 'desktop-secret' });
  vi.mocked(platform.secrets.get).mockResolvedValue('refresh-1');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('mapGoogleEvent', () => {
  const base: GoogleEvent = { id: 'evt1', status: 'confirmed', summary: 'Design review' };

  it('maps timed events with offsets to epoch ms', () => {
    const e = mapGoogleEvent(
      {
        ...base,
        start: { dateTime: '2026-10-20T09:00:00-04:00' },
        end: { dateTime: '2026-10-20T10:30:00-04:00' },
        location: 'Room 4',
        htmlLink: 'https://calendar.google.com/event?eid=x',
      },
      account.id,
      calendar,
    );
    expect(e).toEqual({
      id: 'team@group.calendar.google.com:evt1',
      provider: 'google',
      accountId: 'google:42',
      calendarId: calendar.id,
      title: 'Design review',
      startMs: utc(2026, 10, 20, 13),
      endMs: utc(2026, 10, 20, 14, 30),
      allDay: false,
      color: calendar.color,
      location: 'Room 4',
      htmlLink: 'https://calendar.google.com/event?eid=x',
    });
  });

  it('maps all-day events to local midnights with an exclusive end', () => {
    const e = mapGoogleEvent({ ...base, start: { date: '2026-10-20' }, end: { date: '2026-10-22' } }, account.id, calendar);
    expect(e).toMatchObject({ allDay: true, startMs: local(2026, 10, 20), endMs: local(2026, 10, 22) });
  });

  it('drops cancelled events and ones the user declined', () => {
    const times = { start: { dateTime: '2026-10-20T09:00:00Z' }, end: { dateTime: '2026-10-20T10:00:00Z' } };
    expect(mapGoogleEvent({ ...base, ...times, status: 'cancelled' }, account.id, calendar)).toBeNull();
    expect(
      mapGoogleEvent({ ...base, ...times, attendees: [{ self: true, responseStatus: 'declined' }] }, account.id, calendar),
    ).toBeNull();
    // Someone else declining doesn't hide it.
    expect(
      mapGoogleEvent(
        { ...base, ...times, attendees: [{ responseStatus: 'declined' }, { self: true, responseStatus: 'accepted' }] },
        account.id,
        calendar,
      ),
    ).not.toBeNull();
  });

  it('uses the event colour palette, falling back to the calendar colour', () => {
    const times = { start: { dateTime: '2026-10-20T09:00:00Z' }, end: { dateTime: '2026-10-20T10:00:00Z' } };
    expect(mapGoogleEvent({ ...base, ...times, colorId: '11' }, account.id, calendar)?.color).toBe('#d50000');
    expect(mapGoogleEvent({ ...base, ...times, colorId: '7' }, account.id, calendar)?.color).toBe(GOOGLE_EVENT_COLORS['7']);
    expect(mapGoogleEvent({ ...base, ...times, colorId: '99' }, account.id, calendar)?.color).toBe(calendar.color);
    expect(mapGoogleEvent({ ...base, ...times }, account.id, calendar)?.color).toBe(calendar.color);
    expect(Object.keys(GOOGLE_EVENT_COLORS)).toHaveLength(11);
  });

  it('titles untitled events', () => {
    const e = mapGoogleEvent({ id: 'x', start: { dateTime: '2026-10-20T09:00:00Z' }, end: { dateTime: '2026-10-20T10:00:00Z' } }, account.id, calendar);
    expect(e?.title).toBe('(No title)');
  });
});

describe('mapCalendarListEntry', () => {
  it('defaults enabled to selected ?? primary', () => {
    expect(mapCalendarListEntry({ id: 'me@x.com', summary: 'Me', primary: true, backgroundColor: '#123456' })).toEqual({
      id: 'me@x.com',
      name: 'Me',
      color: '#123456',
      enabled: true,
      primary: true,
    });
    expect(mapCalendarListEntry({ id: 'a', primary: true, selected: false }).enabled).toBe(false);
    expect(mapCalendarListEntry({ id: 'b', selected: true }).enabled).toBe(true);
    expect(mapCalendarListEntry({ id: 'c' }).enabled).toBe(false);
    expect(mapCalendarListEntry({ id: 'd', summary: 'Team', summaryOverride: 'My team' }).name).toBe('My team');
  });
});

describe('pkceChallenge', () => {
  it('matches the RFC 7636 S256 example', async () => {
    expect(await pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });
});

describe('Google provider', () => {
  it('connects with PKCE + loopback and identifies the account by sub', async () => {
    let authUrl!: URL;
    let deliver!: (r: { code: string | null; state: string | null; error: string | null }) => void;
    vi.mocked(platform.oauth.listen).mockResolvedValue(49152);
    vi.mocked(platform.oauth.wait).mockReturnValue(new Promise((r) => (deliver = r)));
    vi.mocked(platform.openExternal).mockImplementation(async (u) => {
      authUrl = new URL(u);
      deliver({ code: 'auth-code', state: authUrl.searchParams.get('state'), error: null });
    });

    let tokenForm!: URLSearchParams;
    route((url, init) => {
      if (url.href === 'https://oauth2.googleapis.com/token') {
        tokenForm = formOf(init);
        return json({
          access_token: 'access-1',
          expires_in: 3600,
          refresh_token: 'refresh-new',
          scope: 'openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/calendar.readonly',
        });
      }
      if (url.pathname === '/v1/userinfo') return json({ sub: '42', email: 'me@example.com' });
      if (url.pathname === '/calendar/v3/users/me/calendarList') {
        expect(authOf(init)).toBe('Bearer access-1');
        return url.searchParams.get('pageToken') === 'next'
          ? json({ items: [{ id: 'team', summary: 'Team', backgroundColor: '#abcdef', selected: true }] })
          : json({ items: [{ id: 'me@example.com', summary: 'me@example.com', primary: true }], nextPageToken: 'next' });
      }
      throw new Error(`unexpected ${url}`);
    });

    const acc = await createGoogleProvider().connect();

    const q = authUrl.searchParams;
    expect(authUrl.origin + authUrl.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(q.get('redirect_uri')).toBe('http://127.0.0.1:49152');
    expect(q.get('code_challenge_method')).toBe('S256');
    expect(q.get('access_type')).toBe('offline');
    expect(q.get('prompt')).toBe('select_account consent');
    expect(q.get('include_granted_scopes')).toBe('true');
    expect(q.get('scope')).toBe('openid email https://www.googleapis.com/auth/calendar.readonly');
    expect(q.get('state')?.length).toBeGreaterThanOrEqual(22);
    expect(await pkceChallenge(tokenForm.get('code_verifier')!)).toBe(q.get('code_challenge'));
    expect(tokenForm.get('grant_type')).toBe('authorization_code');
    expect(tokenForm.get('code')).toBe('auth-code');
    expect(tokenForm.get('client_secret')).toBe('desktop-secret');
    expect(tokenForm.get('redirect_uri')).toBe('http://127.0.0.1:49152');

    expect(platform.secrets.set).toHaveBeenCalledWith('google:42', 'refresh-new');
    expect(acc).toMatchObject({ id: 'google:42', provider: 'google', label: 'me@example.com', enabled: true, error: null });
    expect(acc.calendars.map((c) => [c.id, c.enabled])).toEqual([
      ['me@example.com', true],
      ['team', true],
    ]);
    expect(JSON.stringify(acc)).not.toMatch(/refresh-new|access-1/);
  });

  it('rejects a redirect whose state does not match', async () => {
    vi.mocked(platform.oauth.listen).mockResolvedValue(1234);
    vi.mocked(platform.oauth.wait).mockResolvedValue({ code: 'c', state: 'forged', error: null });
    await expect(createGoogleProvider().connect()).rejects.toMatchObject({ code: 'auth' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports a cancelled consent screen', async () => {
    vi.mocked(platform.oauth.listen).mockResolvedValue(1234);
    vi.mocked(platform.oauth.wait).mockResolvedValue({ code: null, state: null, error: 'access_denied' });
    await expect(createGoogleProvider().connect()).rejects.toMatchObject({ code: 'cancelled' });
  });

  it('explains what is missing when no client id is configured', async () => {
    setGoogleClient(null);
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '');
    const err = await createGoogleProvider().connect().catch((e) => e);
    expect(err).toBeInstanceOf(CalendarError);
    expect(err.code).toBe('config');
    expect(err.message).toMatch(/client ID/);
    expect(platform.oauth.listen).not.toHaveBeenCalled();
  });

  it('fetches events with pagination, refreshing on 401 and retrying on 429', async () => {
    vi.useFakeTimers();
    const tokens = ['tok-a', 'tok-b'];
    const eventCalls: { auth: string; url: URL }[] = [];
    let rateLimited = false;
    route((url, init) => {
      if (url.href === 'https://oauth2.googleapis.com/token') {
        expect(formOf(init).get('grant_type')).toBe('refresh_token');
        expect(formOf(init).get('refresh_token')).toBe('refresh-1');
        return json({ access_token: tokens.shift(), expires_in: 3600 });
      }
      eventCalls.push({ auth: authOf(init), url });
      if (authOf(init) === 'Bearer tok-a') return json({ error: { code: 401 } }, 401);
      if (!rateLimited) {
        rateLimited = true;
        return json({ error: { code: 429 } }, 429);
      }
      if (url.searchParams.get('pageToken') === 'p2') {
        return json({
          items: [
            { id: 'allday', summary: 'Offsite', start: { date: '2026-10-21' }, end: { date: '2026-10-22' } },
            {
              id: 'declined',
              summary: 'Nope',
              start: { dateTime: '2026-10-21T09:00:00Z' },
              end: { dateTime: '2026-10-21T10:00:00Z' },
              attendees: [{ self: true, responseStatus: 'declined' }],
            },
          ],
        });
      }
      return json({
        items: [
          { id: 'timed', summary: 'Standup', colorId: '2', start: { dateTime: '2026-10-20T09:00:00Z' }, end: { dateTime: '2026-10-20T09:15:00Z' } },
          { id: 'gone', status: 'cancelled' },
        ],
        nextPageToken: 'p2',
      });
    });

    const range = { startMs: utc(2026, 10, 19), endMs: utc(2026, 11, 3) };
    const pending = createGoogleProvider().fetchEvents(account, calendar, range);
    await vi.runAllTimersAsync();
    const events = await pending;

    expect(events.map((e) => [e.id, e.allDay, e.color])).toEqual([
      ['team@group.calendar.google.com:timed', false, GOOGLE_EVENT_COLORS['2']],
      ['team@group.calendar.google.com:allday', true, calendar.color],
    ]);
    expect(eventCalls.map((c) => c.auth)).toEqual(['Bearer tok-a', 'Bearer tok-b', 'Bearer tok-b', 'Bearer tok-b']);
    const first = eventCalls[0].url;
    expect(first.pathname).toBe('/calendar/v3/calendars/team%40group.calendar.google.com/events');
    expect(Object.fromEntries(first.searchParams)).toMatchObject({
      singleEvents: 'true',
      orderBy: 'startTime',
      timeMin: '2026-10-19T00:00:00.000Z',
      timeMax: '2026-11-03T00:00:00.000Z',
      maxResults: '2500',
      showDeleted: 'false',
    });
  });

  it('refreshes once for concurrent requests on the same account', async () => {
    let tokenCalls = 0;
    route(async (url) => {
      if (url.href === 'https://oauth2.googleapis.com/token') {
        tokenCalls++;
        await new Promise((r) => setTimeout(r, 5));
        return json({ access_token: 'shared', expires_in: 3600 });
      }
      return json({ items: [] });
    });
    const p = createGoogleProvider();
    const range = { startMs: utc(2026, 10, 19), endMs: utc(2026, 10, 20) };
    await Promise.all([p.fetchEvents(account, calendar, range), p.fetchEvents(account, calendar, range), p.listCalendars(account)]);
    expect(tokenCalls).toBe(1);
  });

  it('turns invalid_grant into a reconnect error', async () => {
    route(() => json({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }, 400));
    await expect(
      createGoogleProvider().fetchEvents(account, calendar, { startMs: 0, endMs: 1 }),
    ).rejects.toMatchObject({ code: 'reconnect' });
  });

  it('revokes and forgets the refresh token on disconnect', async () => {
    route(() => new Response('', { status: 200 }));
    await createGoogleProvider().disconnect(account);
    expect(fetchMock.mock.calls[0][0]).toBe('https://oauth2.googleapis.com/revoke');
    expect(platform.secrets.delete).toHaveBeenCalledWith('google:42');
  });
});
