import { describe, expect, it, vi } from 'vitest';

vi.mock('../platform', () => ({ platform: { fetch: vi.fn() } }));

import { normalizeIcsUrl, parseIcs, readIcsMeta, unescapeText, zonedTimeToUtc } from './ics';

const cal = (...lines: (string | string[])[]) =>
  ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Daybloom//Test//EN', ...lines.flat(), 'END:VCALENDAR'].join('\r\n');
const vevent = (...lines: string[]) => ['BEGIN:VEVENT', ...lines, 'END:VEVENT'];
const local = (y: number, m: number, d: number, h = 0, mi = 0) => new Date(y, m - 1, d, h, mi).getTime();
const utc = (y: number, m: number, d: number, h = 0, mi = 0) => Date.UTC(y, m - 1, d, h, mi);
const ALL = { startMs: utc(2000, 1, 1), endMs: utc(2100, 1, 1) };

describe('parseIcs: values', () => {
  it('unfolds continuation lines and unescapes text', () => {
    const text = cal(
      vevent(
        'UID:fold-1',
        'DTSTART:20261020T090000Z',
        'SUMMARY:Team sync\\, planning\\; retro',
        '  and notes\\nline two \\\\ done',
        'LOCATION:Conf',
        '\terence room',
      ),
    );
    const [e] = parseIcs(text, ALL).events;
    expect(e.title).toBe('Team sync, planning; retro and notes\nline two \\ done');
    expect(e.location).toBe('Conference room');
    expect(unescapeText('a\\Nb\\,c')).toBe('a\nb,c');
  });

  it('accepts LF-only line endings and a BOM', () => {
    const text = '﻿' + cal(vevent('UID:lf', 'DTSTART:20261020T090000Z', 'SUMMARY:LF')).replace(/\r\n/g, '\n');
    expect(parseIcs(text, ALL).events.map((e) => e.title)).toEqual(['LF']);
  });

  it('parses all-day events with an exclusive end', () => {
    const text = cal(
      vevent('UID:a', 'DTSTART;VALUE=DATE:20261020', 'DTEND;VALUE=DATE:20261022', 'SUMMARY:Trip'),
      vevent('UID:b', 'DTSTART;VALUE=DATE:20261025', 'SUMMARY:One day'),
      vevent('UID:c', 'DTSTART;VALUE=DATE:20261026', 'DURATION:P2D', 'SUMMARY:Two days'),
    );
    const [trip, one, two] = parseIcs(text, ALL).events;
    expect(trip).toMatchObject({ allDay: true, startMs: local(2026, 10, 20), endMs: local(2026, 10, 22) });
    expect(one).toMatchObject({ allDay: true, startMs: local(2026, 10, 25), endMs: local(2026, 10, 26) });
    expect(two).toMatchObject({ allDay: true, startMs: local(2026, 10, 26), endMs: local(2026, 10, 28) });
  });

  it('parses UTC, floating and DURATION times', () => {
    const text = cal(
      vevent('UID:u', 'DTSTART:20261020T130000Z', 'DTEND:20261020T143000Z', 'SUMMARY:UTC'),
      vevent('UID:f', 'DTSTART:20261021T090000', 'DTEND:20261021T100000', 'SUMMARY:Floating'),
      vevent('UID:d', 'DTSTART:20261022T090000Z', 'DURATION:PT1H30M', 'SUMMARY:Duration'),
    );
    const [u, f, d] = parseIcs(text, ALL).events;
    expect(u).toMatchObject({ allDay: false, startMs: utc(2026, 10, 20, 13), endMs: utc(2026, 10, 20, 14, 30) });
    expect(f).toMatchObject({ startMs: local(2026, 10, 21, 9), endMs: local(2026, 10, 21, 10) });
    expect(d).toMatchObject({ startMs: utc(2026, 10, 22, 9), endMs: utc(2026, 10, 22, 10, 30) });
  });

  it('converts TZID times (IANA, quoted, Windows, Mozilla prefix, VTIMEZONE alias)', () => {
    const text = cal(
      'BEGIN:VTIMEZONE',
      'TZID:Custom India',
      'X-LIC-LOCATION:Asia/Kolkata',
      'BEGIN:STANDARD',
      'TZOFFSETFROM:+0530',
      'TZOFFSETTO:+0530',
      'DTSTART:19700101T000000',
      'END:STANDARD',
      'END:VTIMEZONE',
      vevent('UID:ny', 'DTSTART;TZID=America/New_York:20261020T090000', 'DTEND;TZID=America/New_York:20261020T100000'),
      vevent('UID:ldn', 'DTSTART;TZID="Europe/London":20261215T090000'),
      vevent('UID:win', 'DTSTART;TZID=Pacific Standard Time:20260115T100000'),
      vevent('UID:moz', 'DTSTART;TZID=/mozilla.org/20050126_1/Asia/Tokyo:20261020T090000'),
      vevent('UID:alias', 'DTSTART;TZID=Custom India:20261020T053000'),
    );
    const byUid = Object.fromEntries(parseIcs(text, ALL).events.map((e) => [e.uid, e]));
    expect(byUid.ny).toMatchObject({ startMs: utc(2026, 10, 20, 13), endMs: utc(2026, 10, 20, 14) });
    expect(byUid.ldn.startMs).toBe(utc(2026, 12, 15, 9));
    expect(byUid.win.startMs).toBe(utc(2026, 1, 15, 18));
    expect(byUid.moz.startMs).toBe(utc(2026, 10, 20, 0));
    expect(byUid.alias.startMs).toBe(utc(2026, 10, 20, 0));
  });

  it('applies X-WR-TIMEZONE to floating times', () => {
    const text = cal('X-WR-TIMEZONE:Asia/Tokyo', vevent('UID:x', 'DTSTART:20261020T090000'));
    expect(parseIcs(text, ALL).events[0].startMs).toBe(utc(2026, 10, 20, 0));
  });

  it('skips cancelled events and ignores VALARM properties', () => {
    const text = cal(
      vevent('UID:gone', 'DTSTART:20261020T090000Z', 'STATUS:CANCELLED', 'SUMMARY:Cancelled'),
      vevent(
        'UID:keep',
        'DTSTART:20261020T100000Z',
        'SUMMARY:Real title',
        'BEGIN:VALARM',
        'ACTION:EMAIL',
        'SUMMARY:Alarm title',
        'TRIGGER:-PT15M',
        'END:VALARM',
      ),
    );
    expect(parseIcs(text, ALL).events.map((e) => e.title)).toEqual(['Real title']);
  });

  it('only returns events overlapping the range', () => {
    const text = cal(
      vevent('UID:before', 'DTSTART:20261018T090000Z', 'DTEND:20261018T100000Z'),
      vevent('UID:spans', 'DTSTART:20261019T220000Z', 'DTEND:20261020T020000Z'),
      vevent('UID:inside', 'DTSTART:20261020T090000Z', 'DTEND:20261020T100000Z'),
      vevent('UID:after', 'DTSTART:20261021T000000Z', 'DTEND:20261021T010000Z'),
    );
    const range = { startMs: utc(2026, 10, 20), endMs: utc(2026, 10, 21) };
    expect(parseIcs(text, range).events.map((e) => e.uid)).toEqual(['spans', 'inside']);
  });

  it('keeps ids unique when a feed reuses a UID', () => {
    const text = cal(
      vevent('UID:dup', 'DTSTART:20261020T090000Z'),
      vevent('UID:dup', 'DTSTART:20261021T090000Z'),
    );
    expect(parseIcs(text, ALL).events.map((e) => e.id)).toEqual(['dup', 'dup~1']);
  });

  it('reads calendar name and colour', () => {
    const text = cal('X-WR-CALNAME:Family\\, shared', 'X-APPLE-CALENDAR-COLOR:#FF2968FF', vevent('UID:x', 'DTSTART:20261020T090000Z'));
    expect(readIcsMeta(text)).toEqual({ name: 'Family, shared', color: '#ff2968' });
    expect(parseIcs(text, ALL)).toMatchObject({ name: 'Family, shared', color: '#ff2968' });
  });
});

describe('parseIcs: recurrence', () => {
  const starts = (text: string, range = ALL) => parseIcs(text, range).events.map((e) => e.startMs);

  it('expands WEEKLY with BYDAY and COUNT in the event time zone', () => {
    const text = cal(
      vevent(
        'UID:wk',
        'DTSTART;TZID=America/New_York:20261005T090000',
        'DTEND;TZID=America/New_York:20261005T093000',
        'RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=5',
      ),
    );
    const events = parseIcs(text, ALL).events;
    expect(events.map((e) => e.startMs)).toEqual([
      utc(2026, 10, 5, 13),
      utc(2026, 10, 7, 13),
      utc(2026, 10, 9, 13),
      utc(2026, 10, 12, 13),
      utc(2026, 10, 14, 13),
    ]);
    expect(events[0]).toMatchObject({ id: `wk/${utc(2026, 10, 5, 13)}`, endMs: utc(2026, 10, 5, 13, 30) });
  });

  it('keeps wall-clock time across a DST change', () => {
    const text = cal(vevent('UID:dst', 'DTSTART;TZID=America/New_York:20261026T090000', 'RRULE:FREQ=WEEKLY;COUNT=2'));
    expect(starts(text)).toEqual([utc(2026, 10, 26, 13), utc(2026, 11, 2, 14)]);
  });

  it('stops at UNTIL (inclusive)', () => {
    const text = cal(vevent('UID:u', 'DTSTART:20261006T150000Z', 'RRULE:FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20261015T150000Z'));
    expect(starts(text)).toEqual([utc(2026, 10, 6, 15), utc(2026, 10, 8, 15), utc(2026, 10, 13, 15), utc(2026, 10, 15, 15)]);
  });

  it('treats a DATE UNTIL as inclusive of that day', () => {
    const text = cal(vevent('UID:ud', 'DTSTART;VALUE=DATE:20261001', 'RRULE:FREQ=DAILY;UNTIL=20261003'));
    expect(starts(text)).toEqual([local(2026, 10, 1), local(2026, 10, 2), local(2026, 10, 3)]);
  });

  it('removes EXDATEs (which still count towards COUNT)', () => {
    const text = cal(
      vevent(
        'UID:ex',
        'DTSTART;TZID=Europe/Berlin:20261001T080000',
        'RRULE:FREQ=DAILY;COUNT=5',
        'EXDATE;TZID=Europe/Berlin:20261003T080000',
        'EXDATE;TZID=Europe/Berlin:20261004T080000,20261010T080000',
      ),
    );
    expect(starts(text)).toEqual([utc(2026, 10, 1, 6), utc(2026, 10, 2, 6), utc(2026, 10, 5, 6)]);
  });

  it('applies RECURRENCE-ID overrides, including moved and cancelled instances', () => {
    const tz = 'TZID=America/New_York';
    const text = cal(
      vevent('UID:series', `DTSTART;${tz}:20261005T090000`, `DTEND;${tz}:20261005T100000`, 'SUMMARY:Standup', 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4'),
      vevent('UID:series', `RECURRENCE-ID;${tz}:20261007T090000`, `DTSTART;${tz}:20261007T150000`, `DTEND;${tz}:20261007T153000`, 'SUMMARY:Standup (moved)'),
      vevent('UID:series', `RECURRENCE-ID;${tz}:20261012T090000`, `DTSTART;${tz}:20261012T090000`, 'STATUS:CANCELLED'),
    );
    const events = parseIcs(text, ALL).events;
    expect(events.map((e) => [e.title, e.startMs])).toEqual([
      ['Standup', utc(2026, 10, 5, 13)],
      ['Standup (moved)', utc(2026, 10, 7, 19)],
      ['Standup', utc(2026, 10, 14, 13)],
    ]);
    const moved = events[1];
    // Same id as the slot it replaces, so caches update rather than duplicate.
    expect(moved.id).toBe(`series/${utc(2026, 10, 7, 13)}`);
    expect(moved.endMs).toBe(utc(2026, 10, 7, 19, 30));
  });

  it('includes an override that moved into the range from outside it', () => {
    const text = cal(
      vevent('UID:m', 'DTSTART:20261001T090000Z', 'RRULE:FREQ=DAILY;COUNT=3', 'SUMMARY:Series'),
      vevent('UID:m', 'RECURRENCE-ID:20261001T090000Z', 'DTSTART:20261020T090000Z', 'SUMMARY:Moved late'),
    );
    const range = { startMs: utc(2026, 10, 20), endMs: utc(2026, 10, 21) };
    expect(parseIcs(text, range).events.map((e) => e.title)).toEqual(['Moved late']);
  });

  it('only expands the requested range of an endless series', () => {
    const text = cal(vevent('UID:old', 'DTSTART:20100101T120000Z', 'DTEND:20100101T123000Z', 'RRULE:FREQ=DAILY'));
    const range = { startMs: utc(2026, 10, 19), endMs: utc(2026, 10, 26) };
    const result = starts(text, range);
    expect(result).toHaveLength(7);
    expect(result[0]).toBe(utc(2026, 10, 19, 12));
    expect(result[6]).toBe(utc(2026, 10, 25, 12));
  });

  it('honours INTERVAL for weekly series after skipping ahead', () => {
    const text = cal(vevent('UID:bi', 'DTSTART:20200106T100000Z', 'RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO'));
    const range = { startMs: utc(2026, 10, 1), endMs: utc(2026, 11, 1) };
    // 2020-01-06 + k·14 days lands on 2026-10-05 and 2026-10-19.
    expect(starts(text, range)).toEqual([utc(2026, 10, 5, 10), utc(2026, 10, 19, 10)]);
  });

  it('supports DAILY with BYDAY (weekdays only)', () => {
    const text = cal(vevent('UID:wd', 'DTSTART:20261016T090000Z', 'RRULE:FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR;COUNT=4'));
    expect(starts(text)).toEqual([utc(2026, 10, 16, 9), utc(2026, 10, 19, 9), utc(2026, 10, 20, 9), utc(2026, 10, 21, 9)]);
  });

  it('supports MONTHLY by ordinal weekday and skips short months for day 31', () => {
    const second = cal(vevent('UID:2tu', 'DTSTART:20260113T170000Z', 'RRULE:FREQ=MONTHLY;BYDAY=2TU;COUNT=3'));
    expect(starts(second)).toEqual([utc(2026, 1, 13, 17), utc(2026, 2, 10, 17), utc(2026, 3, 10, 17)]);

    const last = cal(vevent('UID:lfr', 'DTSTART:20260130T170000Z', 'RRULE:FREQ=MONTHLY;BYDAY=-1FR;COUNT=3'));
    expect(starts(last)).toEqual([utc(2026, 1, 30, 17), utc(2026, 2, 27, 17), utc(2026, 3, 27, 17)]);

    const day31 = cal(vevent('UID:31', 'DTSTART;VALUE=DATE:20260131', 'RRULE:FREQ=MONTHLY;COUNT=4'));
    expect(starts(day31)).toEqual([local(2026, 1, 31), local(2026, 3, 31), local(2026, 5, 31), local(2026, 7, 31)]);
  });

  it('supports YEARLY, including leap days', () => {
    const text = cal(vevent('UID:leap', 'DTSTART;VALUE=DATE:20240229', 'RRULE:FREQ=YEARLY;COUNT=2'));
    expect(starts(text)).toEqual([local(2024, 2, 29), local(2028, 2, 29)]);
  });

  it('falls back to the first instance for unsupported rules and never loops forever', () => {
    const hourly = cal(vevent('UID:h', 'DTSTART:20261020T090000Z', 'RRULE:FREQ=HOURLY;COUNT=5'));
    expect(starts(hourly)).toEqual([utc(2026, 10, 20, 9)]);

    const impossible = cal(vevent('UID:never', 'DTSTART;VALUE=DATE:20260101', 'RRULE:FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=30'));
    expect(starts(impossible)).toEqual([local(2026, 1, 1)]);
  });
});

describe('zonedTimeToUtc', () => {
  it('converts ordinary wall times', () => {
    expect(zonedTimeToUtc({ year: 2026, month: 7, day: 1, hour: 12 }, 'America/New_York')).toBe(utc(2026, 7, 1, 16));
    expect(zonedTimeToUtc({ year: 2026, month: 1, day: 1, hour: 5, minute: 30 }, 'Asia/Kolkata')).toBe(utc(2026, 1, 1));
  });

  it('resolves DST gaps and overlaps per RFC 5545', () => {
    // 02:30 doesn't exist on 8 Mar 2026 in New York: use the pre-gap offset (EST).
    expect(zonedTimeToUtc({ year: 2026, month: 3, day: 8, hour: 2, minute: 30 }, 'America/New_York')).toBe(utc(2026, 3, 8, 7, 30));
    // 01:30 happens twice on 1 Nov 2026: take the first (EDT).
    expect(zonedTimeToUtc({ year: 2026, month: 11, day: 1, hour: 1, minute: 30 }, 'America/New_York')).toBe(utc(2026, 11, 1, 5, 30));
  });
});

describe('normalizeIcsUrl', () => {
  it('rewrites webcal and rejects junk', () => {
    expect(normalizeIcsUrl(' webcal://example.com/cal.ics ')).toBe('https://example.com/cal.ics');
    expect(normalizeIcsUrl('webcals://example.com/a.ics')).toBe('https://example.com/a.ics');
    expect(() => normalizeIcsUrl('not a url')).toThrow(/calendar link/);
    expect(() => normalizeIcsUrl('ftp://example.com/a.ics')).toThrow(/https/);
  });
});
