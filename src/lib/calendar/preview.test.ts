import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  store: new Map<string, string>(),
  secrets: new Map<string, string>(),
}));

vi.mock('../platform', () => ({
  platform: {
    fetch: vi.fn(),
    load: vi.fn(async (key: string) => h.store.get(key) ?? null),
    save: vi.fn(async (key: string, value: string) => void h.store.set(key, value)),
    onExternalChange: vi.fn(() => () => {}),
    secrets: {
      get: vi.fn(async (a: string) => h.secrets.get(a) ?? null),
      set: vi.fn(async (a: string, v: string) => void h.secrets.set(a, v)),
      delete: vi.fn(async (a: string) => void h.secrets.delete(a)),
    },
  },
}));

import { platform } from '../platform';
import { createIcsProvider } from './ics';
import { detectIcsProvider, extractLink, previewIcs, type IcsPreviewError, type IcsPreviewOk } from './preview';
import { createCalendarService } from './service';

const fetchMock = vi.mocked(platform.fetch);
const NOW = new Date(2026, 9, 19, 10, 0).getTime();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// Synthetic links only. The tokens are made up.
let n = 0;
/** A fresh link per test, so the module's feed cache never leaks between tests. */
const googleSecret = () => `https://calendar.google.com/calendar/ical/someone%40example.test/private-${(++n).toString(16).padStart(8, '0')}/basic.ics`;
const googlePublic = () => `https://calendar.google.com/calendar/ical/someone${++n}%40example.test/public/basic.ics`;
const otherFeed = () => `https://feeds.example.test/team/${++n}/calendar.ics`;

const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const ymd = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
};
const vevent = (...lines: string[]) => ['BEGIN:VEVENT', ...lines, 'END:VEVENT'];

/** A small made-up feed: one past, one in progress, a weekly series, an all-day, a far one, a cancelled one. */
function feed({ meta = true } = {}) {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Daybloom//Preview test//EN',
    ...(meta ? ['X-WR-CALNAME:Team plans', 'X-APPLE-CALENDAR-COLOR:#3366FF', 'X-WR-TIMEZONE:Europe/Berlin'] : []),
    ...vevent('UID:past', `DTSTART:${stamp(NOW - 18 * DAY)}`, `DTEND:${stamp(NOW - 18 * DAY + HOUR)}`, 'SUMMARY:Old review'),
    ...vevent('UID:now', `DTSTART:${stamp(NOW - HOUR / 2)}`, `DTEND:${stamp(NOW + HOUR)}`, 'SUMMARY:Planning'),
    ...vevent('UID:weekly', `DTSTART:${stamp(NOW + DAY - HOUR)}`, `DTEND:${stamp(NOW + DAY)}`, 'RRULE:FREQ=WEEKLY;COUNT=4', 'SUMMARY:Sync'),
    ...vevent('UID:allday', `DTSTART;VALUE=DATE:${ymd(NOW + 6 * DAY)}`, 'SUMMARY:Offsite'),
    ...vevent('UID:far', `DTSTART:${stamp(NOW + 40 * DAY)}`, 'SUMMARY:Far away'),
    ...vevent('UID:gone', `DTSTART:${stamp(NOW + 2 * DAY)}`, 'STATUS:CANCELLED', 'SUMMARY:Cancelled'),
    'END:VCALENDAR',
  ].join('\r\n');
}

const reply = (body: string, status = 200, type = 'text/calendar; charset=utf-8') =>
  new Response(body, { status, headers: { 'content-type': type, etag: '"v1"' } });

const ok = async (url: string) => {
  const r = await previewIcs(url, { now: NOW });
  if (!r.ok) throw new Error(`expected ok, got ${r.kind}: ${r.message}`);
  return r as IcsPreviewOk;
};
const problem = async (url: string, opts = {}) => {
  const r = await previewIcs(url, { now: NOW, ...opts });
  if (r.ok) throw new Error('expected a problem');
  return r as IcsPreviewError;
};

beforeEach(() => {
  vi.clearAllMocks();
  h.store.clear();
  h.secrets.clear();
});

afterEach(() => {
  fetchMock.mockReset();
});

describe('previewIcs: a working link', () => {
  it('reads the name, colour, zone, the next event and the count for 14 days', async () => {
    fetchMock.mockResolvedValue(reply(feed()));
    const url = googleSecret();
    const r = await ok(url);
    expect(r).toMatchObject({
      ok: true,
      url,
      displayUrl: 'calendar.google.com/…/basic.ics',
      name: 'Team plans',
      color: '#3366ff',
      timeZone: 'Europe/Berlin',
      provider: 'google',
      total: 6,
      // in progress + 2 of the weekly series + the all-day; not the past, far or cancelled ones
      upcoming: 4,
      next: { title: 'Planning', startMs: NOW - HOUR / 2, allDay: false },
    });
  });

  it('normalises webcal:// and trims, then fetches over https', async () => {
    fetchMock.mockResolvedValue(reply(feed()));
    const url = otherFeed();
    const r = await ok(`  ${url.replace('https://', 'webcal://')}\n`);
    expect(r.url).toBe(url);
    expect(fetchMock).toHaveBeenCalledWith(url, expect.objectContaining({ headers: expect.any(Object) }));
  });

  it('finds the link inside a pasted sentence', async () => {
    fetchMock.mockResolvedValue(reply(feed()));
    const url = otherFeed();
    expect((await ok(`Secret address in iCal format: ${url}`)).url).toBe(url);
    expect(extractLink(`<a href="${url}">feed</a>`)).toBe(url);
  });

  it('falls back to a name from the service and handles an empty feed', async () => {
    fetchMock.mockResolvedValueOnce(reply('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR'));
    const google = await ok(googleSecret());
    expect(google).toMatchObject({ name: 'Google calendar', upcoming: 0, total: 0 });
    expect(google.next).toBeUndefined();
    fetchMock.mockResolvedValueOnce(reply(feed({ meta: false })));
    expect((await ok('https://www.example.test/cal.ics')).name).toBe('example.test');
  });

  it('accepts a calendar served with the wrong content type', async () => {
    fetchMock.mockResolvedValue(reply(feed(), 200, 'text/html'));
    expect((await ok(otherFeed())).upcoming).toBe(4);
  });
});

describe('previewIcs: problems in plain words', () => {
  it('maps a 404 from Google to not-public, with the steps to the secret address', async () => {
    fetchMock.mockResolvedValue(reply('Not Found', 404, 'text/html'));
    const r = await problem(googlePublic());
    expect(r).toMatchObject({ kind: 'not-public', provider: 'google', status: 404, message: 'This address is not public.' });
    expect(r.advice).toBe(
      'In Google Calendar, open Settings, select the calendar, then Integrate calendar. Copy “Secret address in iCal format” and paste it here.',
    );
  });

  it('says a rejected secret address may be old', async () => {
    fetchMock.mockResolvedValue(reply('Not Found', 404));
    const r = await problem(googleSecret());
    expect(r.kind).toBe('not-public');
    expect(r.message).toMatch(/secret address/);
  });

  it('spots a web page instead of a calendar file', async () => {
    fetchMock.mockImplementation(async () => reply('<!doctype html><html><body>Calendar</body></html>', 200, 'text/html'));
    expect(await problem(otherFeed())).toMatchObject({ kind: 'not-calendar', message: 'This link opens a web page, not a calendar file.' });
    const embed = await problem('https://calendar.google.com/calendar/embed?src=someone%40example.test');
    expect(embed).toMatchObject({ kind: 'not-calendar', provider: 'google' });
    expect(embed.advice).toMatch(/Integrate calendar/);
    const outlook = await problem('https://outlook.office365.com/owa/calendar/x@example.test/y/calendar.html');
    expect(outlook).toMatchObject({ kind: 'not-calendar', provider: 'outlook' });
    expect(outlook.advice).toMatch(/ICS link/);
  });

  it('treats anything without BEGIN:VCALENDAR as not a calendar', async () => {
    fetchMock.mockResolvedValue(reply('{"events": []}', 200, 'application/json'));
    expect(await problem(otherFeed())).toMatchObject({ kind: 'not-calendar', message: 'This link does not give a calendar file.' });
  });

  it('maps other HTTP answers', async () => {
    fetchMock.mockResolvedValueOnce(reply('', 401));
    expect(await problem(otherFeed())).toMatchObject({ kind: 'auth', status: 401 });
    fetchMock.mockResolvedValueOnce(reply('', 404));
    expect(await problem(otherFeed())).toMatchObject({ kind: 'not-found', message: 'Nothing is at this address.' });
    fetchMock.mockResolvedValueOnce(reply('', 404));
    expect(await problem('https://p01-caldav.icloud.com/published/2/TOKEN')).toMatchObject({ kind: 'not-found', provider: 'icloud' });
    fetchMock.mockResolvedValueOnce(reply('', 503));
    expect(await problem(otherFeed())).toMatchObject({ kind: 'network', message: expect.stringContaining('503') });
  });

  it('reports a failed or slow connection as a network problem', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('error sending request'));
    expect(await problem(otherFeed())).toMatchObject({ kind: 'network', advice: 'Check your internet connection. Then try again.' });
    fetchMock.mockRejectedValueOnce(new TypeError('blocked'));
    expect((await problem('http://feeds.example.test/a.ics')).advice).toMatch(/https:\/\//);
    fetchMock.mockReturnValueOnce(new Promise(() => {}));
    expect(await problem(otherFeed(), { timeoutMs: 5 })).toMatchObject({ kind: 'network', message: expect.stringContaining('in time') });
  });

  it('rejects things that are not links, without fetching', async () => {
    expect(await problem('')).toMatchObject({ kind: 'invalid-url', message: 'Paste a calendar link first.' });
    expect(await problem('not a link')).toMatchObject({ kind: 'invalid-url' });
    expect(await problem('ftp://example.test/cal.ics')).toMatchObject({ kind: 'invalid-url' });
    const id = await problem('someone@gmail.com');
    expect(id).toMatchObject({ kind: 'invalid-url', provider: 'google' });
    expect(id.advice).toMatch(/Secret address in iCal format/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('detectIcsProvider', () => {
  it('reads the service from the host', () => {
    expect(detectIcsProvider('https://calendar.google.com/calendar/ical/x/basic.ics')).toBe('google');
    expect(detectIcsProvider('webcal://p01-caldav.icloud.com/published/2/x')).toBe('icloud');
    expect(detectIcsProvider('https://outlook.office365.com/owa/calendar/x/calendar.ics')).toBe('outlook');
    expect(detectIcsProvider('https://outlook.live.com/owa/calendar/x/calendar.ics')).toBe('outlook');
    expect(detectIcsProvider('https://user.fm/calendar/v1-x/Work.ics')).toBe('fastmail');
    expect(detectIcsProvider('https://example.test/cal.ics')).toBe('other');
    expect(detectIcsProvider('https://notgoogle.com/cal.ics')).toBe('other');
    expect(detectIcsProvider('junk')).toBe('other');
  });
});

describe('preview, then add', () => {
  it('downloads the feed once and keeps the link out of plain storage', async () => {
    fetchMock.mockImplementation(async () => reply(feed()));
    const service = createCalendarService({ providers: { ics: createIcsProvider() }, now: () => NOW });
    const preview = await ok(googleSecret());
    const account = await service.addIcs(preview.url, 'Team');
    await service.sync(undefined, { force: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(account).toMatchObject({ label: 'Team', displayUrl: preview.displayUrl, urlInKeychain: true });
    expect([...h.store.values()].join()).not.toContain('private-');
    expect(service.eventsBetween(NOW, NOW + 14 * DAY)).toHaveLength(4);
    service.dispose();
  });
});
