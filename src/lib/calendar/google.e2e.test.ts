// End-to-end: two Google accounts through the real service + provider code, over real
// HTTP, against a local stand-in for Google's OAuth and Calendar endpoints. Only the
// network host is swapped; PKCE, state, token exchange, refresh, pagination, mapping
// and per-account isolation all run exactly as in the app. The loopback redirect
// listener mirrors src-tauri/src/oauth.rs (which has its own Rust tests).

import { createHash, randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  base: '',
  store: new Map<string, string>(),
  secrets: new Map<string, string>(),
  listeners: new Map<number, { server: import('node:http').Server; result: Promise<{ code: string | null; state: string | null; error: string | null }> }>(),
}));

/** Google's hosts → the local fake. */
const rewrite = (url: string) =>
  url.replace(/^https:\/\/(accounts\.google\.com|oauth2\.googleapis\.com|openidconnect\.googleapis\.com|www\.googleapis\.com)/, h.base);

vi.mock('../platform', async () => {
  const http = await import('node:http');
  return {
    platform: {
      isNative: true,
      load: async (k: string) => h.store.get(k) ?? null,
      save: async (k: string, v: string) => void h.store.set(k, v),
      onExternalChange: () => () => {},
      fetch: (url: string, init?: RequestInit) => fetch(rewrite(url), init),
      secrets: {
        get: async (a: string) => h.secrets.get(a) ?? null,
        set: async (a: string, v: string) => void h.secrets.set(a, v),
        delete: async (a: string) => void h.secrets.delete(a),
      },
      oauth: {
        // Same contract as the Rust loopback: bind 127.0.0.1:0, serve exactly one redirect.
        async listen() {
          let resolve!: (r: { code: string | null; state: string | null; error: string | null }) => void;
          const result = new Promise<{ code: string | null; state: string | null; error: string | null }>((r) => (resolve = r));
          const server = http.createServer((req, res) => {
            const q = new URL(req.url ?? '/', 'http://127.0.0.1').searchParams;
            if (!q.get('code') && !q.get('error')) {
              res.writeHead(404).end();
              return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html' }).end('<p>You’re connected.</p>');
            resolve({ code: q.get('code'), state: q.get('state'), error: q.get('error') });
            server.close();
          });
          await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
          const port = (server.address() as { port: number }).port;
          h.listeners.set(port, { server, result });
          return port;
        },
        async wait(port: number) {
          return h.listeners.get(port)!.result;
        },
      },
      // The "browser": load Google's consent page, which redirects to the loopback.
      async openExternal(url: string) {
        const consent = await fetch(rewrite(url), { redirect: 'manual' });
        const location = consent.headers.get('location');
        if (!location) throw new Error(`no redirect from consent: ${consent.status}`);
        await fetch(location);
      },
    },
  };
});

import { _resetGoogleTokens } from './google';
import { createCalendarService } from './service';

// ---------------------------------------------------------------------------
// The fake Google

interface User {
  sub: string;
  email: string;
  calendars: { id: string; summary: string; primary?: boolean; backgroundColor: string; selected?: boolean }[];
  events: Record<string, object[]>;
}

const CLIENT_ID = 'test-client.apps.googleusercontent.com';
const CLIENT_SECRET = 'GOCSPX-test';
const day = (h: number, m = 0) => new Date(2026, 9, 19, h, m).toISOString();

const USERS: Record<string, User> = {
  work: {
    sub: '1001',
    email: 'sam@work.example',
    calendars: [
      { id: 'sam@work.example', summary: 'Work', primary: true, backgroundColor: '#4285f4', selected: true },
      { id: 'team-standups', summary: 'Team', backgroundColor: '#0b8043', selected: true },
    ],
    events: {
      'sam@work.example': [
        { id: 'w1', status: 'confirmed', summary: 'Design review', start: { dateTime: day(14) }, end: { dateTime: day(15) } },
        { id: 'w2', status: 'cancelled', summary: 'Cancelled sync', start: { dateTime: day(16) }, end: { dateTime: day(16, 30) } },
        {
          id: 'w3',
          status: 'confirmed',
          summary: 'Optional all-hands',
          start: { dateTime: day(17) },
          end: { dateTime: day(18) },
          attendees: [{ self: true, responseStatus: 'declined' }],
        },
      ],
      'team-standups': [{ id: 't1', status: 'confirmed', summary: 'Standup', colorId: '11', start: { dateTime: day(9, 30) }, end: { dateTime: day(9, 45) } }],
    },
  },
  personal: {
    sub: '2002',
    email: 'sam.personal@gmail.example',
    calendars: [{ id: 'sam.personal@gmail.example', summary: 'Personal', primary: true, backgroundColor: '#e67c73' }],
    events: {
      'sam.personal@gmail.example': [
        { id: 'p1', status: 'confirmed', summary: 'Dinner with Ana', start: { dateTime: day(19) }, end: { dateTime: day(20, 30) } },
        { id: 'p2', status: 'confirmed', summary: 'Mum’s birthday', start: { date: '2026-10-19' }, end: { date: '2026-10-20' } },
      ],
    },
  },
};

const google = {
  nextUser: 'work',
  codes: new Map<string, { user: string; challenge: string; redirect: string }>(),
  refresh: new Map<string, string>(), // refresh token → user
  access: new Map<string, { user: string; exp: number }>(),
  revoked: new Set<string>(),
  calls: [] as string[],
};

const b64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const json = (res: ServerResponse, status: number, body: unknown) =>
  res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));

async function readForm(req: IncomingMessage) {
  let body = '';
  for await (const chunk of req) body += chunk;
  return new URLSearchParams(body);
}

function issueAccess(user: string, seconds: number) {
  const token = `ya29.${b64url(randomBytes(12))}`;
  google.access.set(token, { user, exp: Date.now() + seconds * 1000 });
  return token;
}

function bearerUser(req: IncomingMessage): string | null {
  const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
  const a = google.access.get(token);
  return a && a.exp > Date.now() ? a.user : null;
}

let server: Server;

async function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', h.base);
  google.calls.push(`${req.method} ${url.pathname}`);

  if (url.pathname === '/o/oauth2/v2/auth') {
    const q = url.searchParams;
    if (q.get('client_id') !== CLIENT_ID) return json(res, 400, { error: 'invalid_client' });
    if (q.get('code_challenge_method') !== 'S256' || !q.get('code_challenge')) return json(res, 400, { error: 'invalid_request' });
    if (!q.get('scope')?.includes('https://www.googleapis.com/auth/calendar.readonly')) return json(res, 400, { error: 'invalid_scope' });
    if (q.get('access_type') !== 'offline') return json(res, 400, { error: 'invalid_request' });
    const code = `4/${b64url(randomBytes(9))}`;
    google.codes.set(code, { user: google.nextUser, challenge: q.get('code_challenge')!, redirect: q.get('redirect_uri')! });
    const back = new URL(q.get('redirect_uri')!);
    back.searchParams.set('code', code);
    back.searchParams.set('state', q.get('state')!);
    res.writeHead(302, { Location: back.toString() }).end();
    return;
  }

  if (url.pathname === '/token' && req.method === 'POST') {
    const f = await readForm(req);
    if (f.get('client_id') !== CLIENT_ID || f.get('client_secret') !== CLIENT_SECRET) return json(res, 401, { error: 'invalid_client' });
    if (f.get('grant_type') === 'authorization_code') {
      const c = google.codes.get(f.get('code') ?? '');
      if (!c || c.redirect !== f.get('redirect_uri')) return json(res, 400, { error: 'invalid_grant' });
      // PKCE: the verifier must hash to the challenge sent with the consent request.
      if (b64url(createHash('sha256').update(f.get('code_verifier') ?? '').digest()) !== c.challenge) {
        return json(res, 400, { error: 'invalid_grant', error_description: 'code_verifier mismatch' });
      }
      google.codes.delete(f.get('code')!);
      const refresh = `1//${b64url(randomBytes(12))}`;
      google.refresh.set(refresh, c.user);
      // The work account gets a token that's already inside the refresh margin.
      const ttl = c.user === 'work' ? 30 : 3600;
      return json(res, 200, {
        access_token: issueAccess(c.user, ttl),
        expires_in: ttl,
        refresh_token: refresh,
        scope: 'openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/calendar.readonly',
        token_type: 'Bearer',
      });
    }
    if (f.get('grant_type') === 'refresh_token') {
      const t = f.get('refresh_token') ?? '';
      const user = google.refresh.get(t);
      if (!user || google.revoked.has(t)) return json(res, 400, { error: 'invalid_grant' });
      return json(res, 200, { access_token: issueAccess(user, 3600), expires_in: 3600, token_type: 'Bearer' });
    }
    return json(res, 400, { error: 'unsupported_grant_type' });
  }

  if (url.pathname === '/revoke' && req.method === 'POST') {
    google.revoked.add((await readForm(req)).get('token') ?? '');
    return json(res, 200, {});
  }

  const user = bearerUser(req);
  if (url.pathname.startsWith('/v1/userinfo') || url.pathname.startsWith('/calendar/v3/')) {
    if (!user) return json(res, 401, { error: { code: 401, message: 'Invalid Credentials' } });
  }
  const u = user ? USERS[user] : null;

  if (url.pathname === '/v1/userinfo') return json(res, 200, { sub: u!.sub, email: u!.email });

  if (url.pathname === '/calendar/v3/users/me/calendarList') {
    // One calendar per page, to exercise pagination.
    const i = Number(url.searchParams.get('pageToken') ?? 0);
    const items = u!.calendars.slice(i, i + 1);
    return json(res, 200, { items, ...(i + 1 < u!.calendars.length ? { nextPageToken: String(i + 1) } : {}) });
  }

  const m = /^\/calendar\/v3\/calendars\/([^/]+)\/events$/.exec(url.pathname);
  if (m) {
    const calId = decodeURIComponent(m[1]);
    if (!u!.calendars.some((c) => c.id === calId)) return json(res, 404, { error: { code: 404, message: 'Not Found' } });
    if (url.searchParams.get('singleEvents') !== 'true') return json(res, 400, { error: { message: 'expected singleEvents' } });
    return json(res, 200, { items: u!.events[calId] ?? [] });
  }

  json(res, 404, { error: 'not found' });
}

beforeAll(async () => {
  server = createServer((req, res) => {
    handle(req, res).catch((e) => json(res, 500, { error: String(e) }));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  h.base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
  _resetGoogleTokens();
});

// ---------------------------------------------------------------------------

describe('Google Calendar, two accounts, end to end', () => {
  const range = { startMs: new Date(2026, 9, 19).getTime(), endMs: new Date(2026, 9, 21).getTime() };
  const svc = createCalendarService({ minSyncIntervalMs: 0 });

  it('connects a work and a personal account side by side', async () => {
    await svc.init();
    await svc.setGoogleClient({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET });

    google.nextUser = 'work';
    const work = await svc.connectGoogle();
    google.nextUser = 'personal';
    const personal = await svc.connectGoogle();

    expect(work.id).toBe('google:1001');
    expect(work.label).toBe('sam@work.example');
    expect(work.calendars.map((c) => c.name)).toEqual(['Work', 'Team']); // two pages
    expect(personal.id).toBe('google:2002');
    expect(personal.calendars.map((c) => c.name)).toEqual(['Personal']);
    expect(svc.getAccounts().map((a) => a.id)).toEqual(['google:1001', 'google:2002']);

    // Refresh tokens live only in the keychain, one per account — never in saved state.
    expect([...h.secrets.keys()].sort()).toEqual(['google:1001', 'google:2002']);
    expect(h.store.get('calendars')).not.toMatch(/1\/\/|ya29\./);
  });

  it('syncs both accounts and merges their events', async () => {
    await svc.sync(range, { force: true });
    const titles = svc.eventsBetween(range.startMs, range.endMs).map((e) => `${e.accountId}|${e.title}`);
    expect(titles).toEqual(
      expect.arrayContaining([
        'google:1001|Standup',
        'google:1001|Design review',
        'google:2002|Dinner with Ana',
        'google:2002|Mum’s birthday',
      ]),
    );
    // Cancelled and declined events stay off the dial.
    expect(titles.some((t) => /Cancelled sync|Optional all-hands/.test(t))).toBe(false);
    const birthday = svc.eventsBetween(range.startMs, range.endMs).find((e) => e.title === 'Mum’s birthday')!;
    expect(birthday.allDay).toBe(true);
    // The work account's first token was inside the refresh margin, so it was refreshed.
    expect(google.calls.filter((c) => c === 'POST /token').length).toBeGreaterThanOrEqual(3);
    expect(svc.getAccounts().every((a) => !a.error)).toBe(true);
  });

  it('reconnecting the same Google account updates it instead of duplicating', async () => {
    google.nextUser = 'personal';
    await svc.connectGoogle();
    expect(svc.getAccounts().filter((a) => a.id === 'google:2002')).toHaveLength(1);
  });

  it('one account losing access never takes the other one down', async () => {
    // The work grant is revoked at Google (e.g. password change).
    const workRefresh = h.secrets.get('google:1001')!;
    google.revoked.add(workRefresh);
    _resetGoogleTokens();
    await svc.sync(range, { force: true });

    const work = svc.getAccounts().find((a) => a.id === 'google:1001')!;
    const personal = svc.getAccounts().find((a) => a.id === 'google:2002')!;
    expect(work.error).toBe('reconnect');
    expect(personal.error ?? null).toBeNull();
    const ids = new Set(svc.eventsBetween(range.startMs, range.endMs).map((e) => e.accountId));
    expect(ids.has('google:2002')).toBe(true);
    // The work account keeps its last good events while it waits to be reconnected.
    expect(ids.has('google:1001')).toBe(true);
  });

  it('removing an account revokes it and forgets only that account', async () => {
    await svc.removeAccount('google:2002');
    expect(svc.getAccounts().map((a) => a.id)).toEqual(['google:1001']);
    expect(h.secrets.has('google:2002')).toBe(false);
    expect(google.calls).toContain('POST /revoke');
    expect(svc.eventsBetween(range.startMs, range.endMs).some((e) => e.accountId === 'google:2002')).toBe(false);
    svc.dispose();
  });
});
