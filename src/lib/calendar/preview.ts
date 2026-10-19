// Check a calendar link before adding it: fetch it once, read its name and the next two
// weeks, and turn every failure into plain words plus one thing to try. Nothing here is
// stored; the link only lives in memory until `addIcs` puts it in the keychain.

import { platform } from '../platform';
import { normalizeIcsUrl, parseIcs, readIcsMeta, redactIcsUrl, rememberFeed } from './ics';

const DAY_MS = 86_400_000;
/** The preview counts events in this many days from now. */
export const PREVIEW_DAYS = 14;
const DEFAULT_TIMEOUT_MS = 20_000;

/** The service a calendar link comes from, read from its host. */
export type IcsSource = 'google' | 'icloud' | 'outlook' | 'fastmail' | 'other';

export type IcsPreviewErrorKind = 'not-found' | 'not-public' | 'not-calendar' | 'auth' | 'network' | 'invalid-url';

export interface IcsPreviewOk {
  ok: true;
  /** The cleaned, normalised https:// link. Pass it to `addIcs`; never store or log it. */
  url: string;
  /** A short form that is safe to show, e.g. `calendar.google.com/…/basic.ics`. */
  displayUrl: string;
  name: string;
  /** `#rrggbb` from the feed, when it has one. */
  color?: string;
  /** IANA zone from X-WR-TIMEZONE, when the feed has one. */
  timeZone?: string;
  /** Events that overlap the next 14 days (an event in progress counts). */
  upcoming: number;
  /** VEVENTs in the whole feed, past ones included. */
  total: number;
  /** The first of the `upcoming` events. It can already be in progress. */
  next?: { title: string; startMs: number; allDay: boolean };
  provider: IcsSource;
}

export interface IcsPreviewError {
  ok: false;
  kind: IcsPreviewErrorKind;
  /** What happened, in one short sentence. */
  message: string;
  /** What to do, in short imperative sentences. */
  advice: string;
  /** Best guess at the service, so the UI can open the matching guide. */
  provider: IcsSource;
  /** HTTP status, when the server answered. */
  status?: number;
}

export type IcsPreview = IcsPreviewOk | IcsPreviewError;

export interface PreviewOptions {
  /** Start of the 14-day window (default: now). */
  now?: number;
  /** Give up after this long (default 20 s). */
  timeoutMs?: number;
}

/** Which service a calendar link belongs to, from its host. */
export function detectIcsProvider(url: string): IcsSource {
  let host: string;
  try {
    host = new URL(url.trim().replace(/^webcals?:\/\//i, 'https://')).hostname.toLowerCase();
  } catch {
    return 'other';
  }
  return sourceOfDomain(host);
}

function sourceOfDomain(host: string): IcsSource {
  const is = (...domains: string[]) => domains.some((d) => host === d || host.endsWith(`.${d}`));
  if (is('google.com', 'gmail.com', 'googlemail.com')) return 'google';
  if (is('icloud.com', 'me.com', 'mac.com')) return 'icloud';
  if (is('outlook.com', 'office365.com', 'office.com', 'live.com', 'hotmail.com')) return 'outlook';
  if (is('fastmail.com', 'fastmail.fm', 'user.fm', 'messagingengine.com')) return 'fastmail';
  return 'other';
}

/** The link inside whatever was pasted: a bare link, or the first link in a sentence or HTML snippet. */
export function extractLink(input: string): string {
  const text = input.trim();
  if (!/\s/.test(text)) return text;
  return /(?:https?|webcals?):\/\/[^\s"'<>]+/i.exec(text)?.[0] ?? text;
}

/** Where to find the right link, per service. One short paragraph; the UI has the full steps. */
export const FIND_LINK: Record<IcsSource, string> = {
  google:
    'In Google Calendar, open Settings, select the calendar, then Integrate calendar. Copy “Secret address in iCal format” and paste it here.',
  icloud: 'In the Calendar app, share the calendar and turn on Public Calendar. Copy the link and paste it here.',
  outlook: 'In Outlook, open Settings, then Calendar, then Shared calendars. Publish the calendar. Copy the ICS link and paste it here.',
  fastmail: 'In Fastmail, open Settings, then Calendars. Share the calendar publicly. Copy the iCal link and paste it here.',
  other: 'In your calendar app, look for Share, Publish or Export. Copy the link that ends in .ics or starts with webcal://.',
};

const FALLBACK_NAME: Record<Exclude<IcsSource, 'other'>, string> = {
  google: 'Google calendar',
  icloud: 'iCloud calendar',
  outlook: 'Outlook calendar',
  fastmail: 'Fastmail calendar',
};

class Timeout extends Error {}

function withTimeout<T>(work: Promise<T>, ms: number, abort?: AbortController): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      abort?.abort();
      reject(new Timeout());
    }, ms);
  });
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
}

const looksLikeHtml = (text: string, type: string) => /html/i.test(type) || /^\s*</.test(text);

/** Explain a non-2xx answer. */
function explainStatus(status: number, url: URL, provider: IcsSource): IcsPreviewError {
  const fail = (kind: IcsPreviewErrorKind, message: string, advice: string): IcsPreviewError => ({
    ok: false,
    kind,
    message,
    advice,
    provider,
    status,
  });
  if (provider === 'google' && (status === 404 || status === 401 || status === 403)) {
    return url.pathname.includes('/private-')
      ? fail('not-public', 'Google did not accept this secret address. It can be old or cut short.', FIND_LINK.google)
      : fail('not-public', 'This address is not public.', FIND_LINK.google);
  }
  if (status === 401 || status === 403) {
    return fail(
      'auth',
      'This calendar is private.',
      `Daybloom can only read public or secret links. ${FIND_LINK[provider]}`,
    );
  }
  if (status === 404 || status === 410) {
    return provider === 'other'
      ? fail('not-found', 'Nothing is at this address.', 'Check that you copied the whole link. If the calendar was shared again, it has a new link.')
      : fail('not-found', 'This calendar is not shared at this address now.', FIND_LINK[provider]);
  }
  if (status === 429 || status >= 500) {
    return fail('network', `The calendar server has a problem (error ${status}).`, 'Try again in a few minutes.');
  }
  return fail('not-found', `The calendar server did not accept this link (error ${status}).`, 'Check that you copied the whole link.');
}

/** Explain a 2xx answer that is not an iCalendar file. */
function explainNotCalendar(url: URL, provider: IcsSource, html: boolean): IcsPreviewError {
  const fail = (kind: IcsPreviewErrorKind, message: string, advice: string): IcsPreviewError => ({
    ok: false,
    kind,
    message,
    advice,
    provider,
  });
  if (provider === 'google') {
    // An /ical/ address that answers with a page is Google asking to sign in: the calendar isn't public.
    return url.pathname.includes('/ical/')
      ? fail('not-public', 'This address is not public.', FIND_LINK.google)
      : fail('not-calendar', 'This is a link to the Google Calendar web page, not to the calendar file.', FIND_LINK.google);
  }
  if (provider === 'outlook' && html) {
    return fail('not-calendar', 'This is the HTML link. It opens a web page.', 'Use the ICS link from the same place. It ends in .ics.');
  }
  if (provider === 'icloud' && html) {
    return fail('not-calendar', 'This is an invitation link, not a public calendar link.', FIND_LINK.icloud);
  }
  return fail(
    'not-calendar',
    html ? 'This link opens a web page, not a calendar file.' : 'This link does not give a calendar file.',
    'Use the link that ends in .ics or starts with webcal://.',
  );
}

/**
 * Fetch a calendar link once and describe it, without adding anything. Never rejects: every
 * problem comes back as `{ ok: false, kind, message, advice }` in plain words.
 */
export async function previewIcs(input: string, options: PreviewOptions = {}): Promise<IcsPreview> {
  const now = options.now ?? Date.now();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pasted = extractLink(input ?? '');

  if (!pasted) {
    return { ok: false, kind: 'invalid-url', message: 'Paste a calendar link first.', advice: 'The link starts with https:// or webcal://.', provider: 'other' };
  }
  // People often paste the calendar ID (an email-like address) instead of the link.
  const idLike = /^[^\s@/:]+@([^\s@/:]+\.[a-z]{2,})$/i.exec(pasted);
  if (idLike) {
    const provider = sourceOfDomain(idLike[1].toLowerCase());
    return {
      ok: false,
      kind: 'invalid-url',
      message: 'This is a calendar ID or an email address, not a link.',
      advice: FIND_LINK[provider],
      provider,
    };
  }

  let url: string;
  try {
    url = normalizeIcsUrl(pasted);
  } catch {
    return {
      ok: false,
      kind: 'invalid-url',
      message: 'This is not a calendar link.',
      advice: 'Paste the full address. It starts with https:// or webcal://.',
      provider: detectIcsProvider(pasted),
    };
  }
  const parsedUrl = new URL(url);
  const provider = detectIcsProvider(url);
  const unreachable = (message: string, advice: string): IcsPreviewError => ({ ok: false, kind: 'network', message, advice, provider });

  const abort = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
  let res: Response;
  let text: string;
  try {
    res = await withTimeout(
      platform.fetch(url, { headers: { Accept: 'text/calendar, */*;q=0.5' }, signal: abort?.signal }),
      timeoutMs,
      abort,
    );
    if (!res.ok) return explainStatus(res.status, parsedUrl, provider);
    text = await withTimeout(res.text(), timeoutMs, abort);
  } catch (e) {
    if (e instanceof Timeout) return unreachable('The calendar server did not answer in time.', 'Try again in a minute.');
    if (platform.isNative === false) {
      return unreachable('The browser blocked this link.', 'Open Daybloom’s desktop app to add calendar links.');
    }
    return unreachable(
      'Daybloom could not reach this address.',
      parsedUrl.protocol === 'http:'
        ? 'Use the https:// version of this link. Then try again.'
        : 'Check your internet connection. Then try again.',
    );
  }

  if (!text.includes('BEGIN:VCALENDAR')) {
    return explainNotCalendar(parsedUrl, provider, looksLikeHtml(text, res.headers.get('content-type') ?? ''));
  }

  let events: ReturnType<typeof parseIcs>['events'];
  let meta: ReturnType<typeof readIcsMeta>;
  try {
    meta = readIcsMeta(text);
    events = parseIcs(text, { startMs: now, endMs: now + PREVIEW_DAYS * DAY_MS }).events;
  } catch {
    return {
      ok: false,
      kind: 'not-calendar',
      message: 'Daybloom could not read this calendar file.',
      advice: 'Check the link in your calendar app. Then try again.',
      provider,
    };
  }

  // Adding the calendar right after this reuses the download.
  rememberFeed(url, text, res.headers);
  const first = events[0];
  return {
    ok: true,
    url,
    displayUrl: redactIcsUrl(url),
    name: meta.name ?? (provider === 'other' ? parsedUrl.hostname.replace(/^www\./, '') : FALLBACK_NAME[provider]),
    ...(meta.color ? { color: meta.color } : {}),
    ...(meta.timeZone ? { timeZone: meta.timeZone } : {}),
    upcoming: events.length,
    total: text.match(/^BEGIN:VEVENT\r?$/gim)?.length ?? 0,
    ...(first ? { next: { title: first.title, startMs: first.startMs, allDay: first.allDay } } : {}),
    provider,
  };
}
