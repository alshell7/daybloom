// Google Calendar provider (read-only). Any number of Google accounts can be
// connected at once; each is keyed by its OpenID `sub`, with its refresh token in
// the OS keychain under the account id and its access token only in memory.

import type { CalendarEvent } from '../engine/types';
import { meetingLabel, plainText, rsvp } from './meeting';
import { platform } from '../platform';
import {
  CalendarError,
  type CalendarAccount,
  type CalendarInfo,
  type CalendarProvider,
  type TimeRange,
} from './types';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const API = 'https://www.googleapis.com/calendar/v3';
export const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
const SCOPES = ['openid', 'email', GOOGLE_CALENDAR_SCOPE];

const REFRESH_EARLY_MS = 60_000;
const MAX_RETRIES = 2;
const MAX_PAGES = 50;
const NO_TITLE = '(No title)';

// ---------------------------------------------------------------------------
// Client configuration

export interface GoogleClientConfig {
  clientId: string;
  /** Google "Desktop app" clients issue a secret that isn't confidential; send it if present. */
  clientSecret?: string;
}

let clientOverride: GoogleClientConfig | null = null;

/** Override the build-time client (e.g. pasted in Settings). `null` reverts to `.env`. */
export function setGoogleClient(config: GoogleClientConfig | null): void {
  const clientId = config?.clientId.trim();
  clientOverride = clientId ? { clientId, clientSecret: config?.clientSecret?.trim() || undefined } : null;
}

export function getGoogleClient(): GoogleClientConfig | null {
  if (clientOverride) return clientOverride;
  const env: Record<string, unknown> = import.meta.env ?? {};
  const clientId = (env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim();
  if (!clientId) return null;
  return { clientId, clientSecret: (env.VITE_GOOGLE_CLIENT_SECRET as string | undefined)?.trim() || undefined };
}

function requireClient(): GoogleClientConfig {
  const client = getGoogleClient();
  if (!client) {
    throw new CalendarError(
      'config',
      'Google Calendar isn’t set up yet. Daybloom needs a Google OAuth client ID (a “Desktop app” client ' +
        'from Google Cloud Console with the Calendar API enabled). Paste it in Settings → Calendars, ' +
        'or set VITE_GOOGLE_CLIENT_ID in .env.local.',
    );
  }
  return client;
}

// ---------------------------------------------------------------------------
// Google API shapes (only the fields we read)

export interface GoogleEventTime {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}

export interface GoogleEvent {
  id: string;
  status?: 'confirmed' | 'tentative' | 'cancelled' | string;
  summary?: string;
  location?: string;
  htmlLink?: string;
  colorId?: string;
  eventType?: string;
  start?: GoogleEventTime;
  end?: GoogleEventTime;
  attendees?: { self?: boolean; responseStatus?: string; email?: string; displayName?: string; organizer?: boolean; resource?: boolean }[];
  description?: string;
  hangoutLink?: string;
  conferenceData?: {
    conferenceSolution?: { name?: string };
    entryPoints?: { entryPointType?: string; uri?: string; label?: string }[];
  };
  /** Instances of a repeating event (singleEvents=true) name the series they belong to. */
  recurringEventId?: string;
}

export interface GoogleCalendarListEntry {
  id: string;
  summary?: string;
  summaryOverride?: string;
  backgroundColor?: string;
  primary?: boolean;
  selected?: boolean;
  deleted?: boolean;
}

interface Page<T> {
  items?: T[];
  nextPageToken?: string;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

// ---------------------------------------------------------------------------
// Mapping (pure; exported for tests)

/** Google's event colour palette (colorId 1–11), as shown in Google Calendar. */
export const GOOGLE_EVENT_COLORS: Record<string, string> = {
  '1': '#7986cb', // Lavender
  '2': '#33b679', // Sage
  '3': '#8e24aa', // Grape
  '4': '#e67c73', // Flamingo
  '5': '#f6bf26', // Banana
  '6': '#f4511e', // Tangerine
  '7': '#039be5', // Peacock
  '8': '#616161', // Graphite
  '9': '#3f51b5', // Blueberry
  '10': '#0b8043', // Basil
  '11': '#d50000', // Tomato
};

const DEFAULT_CALENDAR_COLOR = '#4285f4';

/** `YYYY-MM-DD` → local midnight. */
function localDateMs(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

function timeMs(t: GoogleEventTime | undefined): { ms: number; allDay: boolean } | null {
  if (t?.dateTime) {
    const ms = Date.parse(t.dateTime);
    return Number.isNaN(ms) ? null : { ms, allDay: false };
  }
  if (t?.date) return { ms: localDateMs(t.date), allDay: true };
  return null;
}

/** `null` for events Daybloom shouldn't show (cancelled, declined, working-location markers). */
export function mapGoogleEvent(e: GoogleEvent, accountId: string, calendar: CalendarInfo): CalendarEvent | null {
  if (e.status === 'cancelled' || e.eventType === 'workingLocation') return null;
  if (e.attendees?.some((a) => a.self && a.responseStatus === 'declined')) return null;
  const start = timeMs(e.start);
  const end = timeMs(e.end);
  if (!start) return null;
  return {
    id: `${calendar.id}:${e.id}`,
    provider: 'google',
    accountId,
    calendarId: calendar.id,
    title: e.summary?.trim() || NO_TITLE,
    startMs: start.ms,
    // All-day `end.date` is exclusive, which is exactly the half-open end we want.
    endMs: Math.max(end?.ms ?? start.ms, start.ms),
    allDay: start.allDay,
    color: (e.colorId && GOOGLE_EVENT_COLORS[e.colorId]) || calendar.color,
    series: e.recurringEventId ?? e.id,
    ...(e.location ? { location: e.location } : {}),
    ...(e.htmlLink ? { htmlLink: e.htmlLink } : {}),
    ...meetingFields(e),
  };
}

/** Google Meet (or a Zoom / Teams add-on), the notes, and who's invited. */
function meetingFields(e: GoogleEvent): Partial<CalendarEvent> {
  const out: Partial<CalendarEvent> = {};
  const video = e.conferenceData?.entryPoints?.find((p) => p.entryPointType === 'video' && p.uri);
  const url = video?.uri ?? e.hangoutLink;
  if (url && /^https:\/\//i.test(url)) {
    out.meetUrl = url;
    out.meetLabel = e.conferenceData?.conferenceSolution?.name || meetingLabel(url);
  }
  const notes = plainText(e.description);
  if (notes) out.description = notes;
  const people = (e.attendees ?? []).filter((a) => !a.resource && (a.email || a.displayName));
  // A lone entry for yourself says nothing new.
  if (people.length > 1 || (people.length === 1 && !people[0].self)) {
    out.attendees = people.slice(0, 60).map((a) => ({
      ...(a.displayName ? { name: a.displayName } : {}),
      ...(a.email ? { email: a.email } : {}),
      status: rsvp(a.responseStatus),
      ...(a.organizer ? { organizer: true } : {}),
      ...(a.self ? { self: true } : {}),
    }));
  }
  return out;
}

export function mapCalendarListEntry(c: GoogleCalendarListEntry): CalendarInfo {
  return {
    id: c.id,
    name: c.summaryOverride || c.summary || c.id,
    color: c.backgroundColor || DEFAULT_CALENDAR_COLOR,
    enabled: c.selected ?? c.primary ?? false,
    ...(c.primary ? { primary: true } : {}),
  };
}

// ---------------------------------------------------------------------------
// PKCE

function base64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomToken(bytes: number): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** RFC 7636 S256 code challenge. */
export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

// ---------------------------------------------------------------------------
// HTTP with retry

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function bodyText(res: Response): Promise<string> {
  try {
    return await res.clone().text();
  } catch {
    return '';
  }
}

async function isRetryable(res: Response): Promise<boolean> {
  if (res.status === 429 || res.status >= 500) return true;
  // Google reports per-user quota exhaustion as 403.
  return res.status === 403 && /rateLimitExceeded|userRateLimitExceeded/.test(await bodyText(res));
}

function backoffMs(attempt: number, res: Response): number {
  const retryAfter = Number(res.headers.get('retry-after'));
  if (retryAfter > 0) return Math.min(retryAfter * 1000, 10_000);
  const base = 500 * 2 ** attempt;
  return base + Math.random() * base;
}

/** fetch with network-error wrapping and jittered retries on 429/5xx. */
async function send(url: string, init: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await platform.fetch(url, init);
    } catch (e) {
      throw new CalendarError('network', 'Couldn’t reach Google. Check your internet connection.', { cause: e });
    }
    if (attempt < MAX_RETRIES && (await isRetryable(res))) {
      await sleep(backoffMs(attempt, res));
      continue;
    }
    return res;
  }
}

async function apiError(res: Response): Promise<CalendarError> {
  const text = await bodyText(res);
  let message = '';
  try {
    message = JSON.parse(text)?.error?.message ?? '';
  } catch {
    /* not JSON */
  }
  if (res.status === 401 || /insufficientPermissions|ACCESS_TOKEN_SCOPE_INSUFFICIENT/.test(text)) {
    return new CalendarError('reconnect', 'Google needs you to sign in again.');
  }
  if (/accessNotConfigured|SERVICE_DISABLED|has not been used in project/.test(text)) {
    return new CalendarError(
      'config',
      'The Google Calendar API isn’t enabled for this OAuth client’s Cloud project. Enable it in Google Cloud Console → APIs & Services.',
    );
  }
  if (res.status === 404) return new CalendarError('http', 'That Google calendar no longer exists or isn’t shared with you.');
  return new CalendarError('http', `Google Calendar error ${res.status}${message ? `: ${message}` : ''}.`);
}

// ---------------------------------------------------------------------------
// Tokens

interface AccessToken {
  token: string;
  expiresAt: number;
}

const accessTokens = new Map<string, AccessToken>();
const refreshes = new Map<string, Promise<string>>();

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const client = requireClient();
  const body = new URLSearchParams({ ...params, client_id: client.clientId });
  if (client.clientSecret) body.set('client_secret', client.clientSecret);
  const res = await send(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
  });
  const data = (await res.json().catch(() => ({}))) as Partial<TokenResponse> & {
    error?: string;
    error_description?: string;
  };
  if (res.ok && data.access_token) return data as TokenResponse;
  switch (data.error) {
    // Refresh token revoked/expired, or issued to a different client id.
    case 'invalid_grant':
    case 'unauthorized_client':
      throw new CalendarError('reconnect', 'Google needs you to sign in again.');
    case 'invalid_client':
      throw new CalendarError('config', 'Google rejected the OAuth client ID or secret. Check them in Settings → Calendars.');
    default:
      throw new CalendarError('auth', `Google sign-in failed (${data.error_description || data.error || res.status}).`);
  }
}

function remember(accountId: string, t: TokenResponse): string {
  accessTokens.set(accountId, { token: t.access_token, expiresAt: Date.now() + t.expires_in * 1000 });
  return t.access_token;
}

async function refreshAccessToken(accountId: string): Promise<string> {
  const refreshToken = await platform.secrets.get(accountId);
  if (!refreshToken) throw new CalendarError('reconnect', 'Google needs you to sign in again.');
  const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken });
  if (t.refresh_token && t.refresh_token !== refreshToken) await platform.secrets.set(accountId, t.refresh_token);
  return remember(accountId, t);
}

/** Cached access token, refreshed a minute before expiry; one refresh in flight per account. */
async function accessToken(accountId: string): Promise<string> {
  const cached = accessTokens.get(accountId);
  if (cached && cached.expiresAt - REFRESH_EARLY_MS > Date.now()) return cached.token;
  let pending = refreshes.get(accountId);
  if (!pending) {
    pending = refreshAccessToken(accountId).finally(() => refreshes.delete(accountId));
    refreshes.set(accountId, pending);
  }
  return pending;
}

/** Authenticated GET; on 401 refreshes once and retries. */
async function apiGet<T>(accountId: string, url: string): Promise<T> {
  const get = (token: string) =>
    send(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  let token = await accessToken(accountId);
  let res = await get(token);
  if (res.status === 401) {
    // Only drop the token if nobody has replaced it meanwhile.
    if (accessTokens.get(accountId)?.token === token) accessTokens.delete(accountId);
    token = await accessToken(accountId);
    res = await get(token);
  }
  if (!res.ok) throw await apiError(res);
  return (await res.json()) as T;
}

async function paginate<T>(accountId: string, base: string, query: Record<string, string>): Promise<T[]> {
  const items: T[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const q = new URLSearchParams(query);
    if (pageToken) q.set('pageToken', pageToken);
    const data = await apiGet<Page<T>>(accountId, `${base}?${q}`);
    items.push(...(data.items ?? []));
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return items;
}

// ---------------------------------------------------------------------------
// Provider

export function createGoogleProvider(): CalendarProvider {
  const provider: CalendarProvider = {
    kind: 'google',

    async connect() {
      const client = requireClient();
      const verifier = randomToken(48);
      const state = randomToken(24);
      const challenge = await pkceChallenge(verifier);

      let port: number;
      try {
        port = await platform.oauth.listen();
      } catch (e) {
        throw new CalendarError('config', e instanceof Error ? e.message : 'Google sign-in needs the desktop app.', {
          cause: e,
        });
      }
      const redirectUri = `http://127.0.0.1:${port}`;
      const url = `${AUTH_URL}?${new URLSearchParams({
        client_id: client.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: SCOPES.join(' '),
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state,
        access_type: 'offline',
        // select_account lets the user add a second account; consent guarantees a refresh token.
        prompt: 'select_account consent',
        include_granted_scopes: 'true',
      })}`;

      // Start waiting before opening the browser so a quick redirect can't be missed.
      const redirect = platform.oauth.wait(port);
      redirect.catch(() => {});
      try {
        await platform.openExternal(url);
      } catch (e) {
        throw new CalendarError('config', 'Daybloom couldn’t open your web browser for Google sign-in.', { cause: e });
      }
      let r: Awaited<typeof redirect>;
      try {
        r = await redirect;
      } catch (e) {
        throw new CalendarError('cancelled', 'Google sign-in timed out or the browser was closed. Please try again.', {
          cause: e,
        });
      }

      if (r.error) {
        throw r.error === 'access_denied'
          ? new CalendarError('cancelled', 'Google sign-in was cancelled.')
          : new CalendarError('auth', `Google sign-in failed (${r.error}).`);
      }
      if (!r.state || r.state !== state) {
        throw new CalendarError('auth', 'The sign-in response didn’t match this request. Please try again.');
      }
      if (!r.code) throw new CalendarError('auth', 'Google didn’t return an authorization code. Please try again.');

      const tokens = await tokenRequest({
        grant_type: 'authorization_code',
        code: r.code,
        code_verifier: verifier,
        redirect_uri: redirectUri,
      });
      // Google's consent screen lets people untick individual scopes.
      if (tokens.scope && !tokens.scope.split(' ').includes(GOOGLE_CALENDAR_SCOPE)) {
        throw new CalendarError(
          'auth',
          'Daybloom needs permission to see your calendars. Connect again and leave the calendar box ticked.',
        );
      }
      if (!tokens.refresh_token) {
        throw new CalendarError('auth', 'Google didn’t issue a long-lived sign-in. Please try connecting again.');
      }

      const me = await send(USERINFO_URL, {
        headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: 'application/json' },
      });
      if (!me.ok) throw await apiError(me);
      const info = (await me.json()) as { sub: string; email?: string; name?: string };

      const id = `google:${info.sub}`;
      await platform.secrets.set(id, tokens.refresh_token);
      remember(id, tokens);
      const account: CalendarAccount = {
        id,
        provider: 'google',
        label: info.email || info.name || 'Google account',
        calendars: [],
        enabled: true,
        error: null,
      };
      account.calendars = await provider.listCalendars(account);
      return account;
    },

    async listCalendars(account) {
      const items = await paginate<GoogleCalendarListEntry>(account.id, `${API}/users/me/calendarList`, {
        maxResults: '250',
        fields: 'nextPageToken,items(id,summary,summaryOverride,backgroundColor,primary,selected,deleted)',
      });
      return items.filter((c) => !c.deleted).map(mapCalendarListEntry);
    },

    async fetchEvents(account, calendar, range: TimeRange) {
      const items = await paginate<GoogleEvent>(
        account.id,
        `${API}/calendars/${encodeURIComponent(calendar.id)}/events`,
        {
          singleEvents: 'true',
          orderBy: 'startTime',
          timeMin: new Date(range.startMs).toISOString(),
          timeMax: new Date(range.endMs).toISOString(),
          maxResults: '2500',
          showDeleted: 'false',
          // With more attendees than this, Google returns only the current user's entry.
          maxAttendees: '60',
          fields:
            'nextPageToken,items(id,status,summary,location,htmlLink,colorId,eventType,start,end,recurringEventId,description,hangoutLink,conferenceData(conferenceSolution(name),entryPoints(entryPointType,uri)),attendees(self,responseStatus,email,displayName,organizer,resource))',
        },
      );
      return items
        .map((e) => mapGoogleEvent(e, account.id, calendar))
        .filter((e): e is CalendarEvent => e !== null);
    },

    async disconnect(account) {
      accessTokens.delete(account.id);
      const refreshToken = await platform.secrets.get(account.id).catch(() => null);
      if (refreshToken) {
        // Best effort: revoke the grant so Google's "Third-party access" list is tidy too.
        await platform
          .fetch(REVOKE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ token: refreshToken }).toString(),
          })
          .catch(() => {});
      }
      await platform.secrets.delete(account.id);
    },
  };
  return provider;
}

/** Test hook: forget cached access tokens. */
export function _resetGoogleTokens(): void {
  accessTokens.clear();
  refreshes.clear();
}
