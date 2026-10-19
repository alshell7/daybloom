// ICS / webcal subscription provider plus a small RFC 5545 parser.
//
// Supported: line folding, text escapes, DATE / UTC / floating / TZID date-times
// (IANA names, Windows names, Mozilla-style prefixes, VTIMEZONE X-LIC-LOCATION),
// DTEND / DURATION, STATUS:CANCELLED, RRULE (DAILY/WEEKLY/MONTHLY/YEARLY with
// INTERVAL, COUNT, UNTIL, BYDAY, BYMONTHDAY, BYMONTH, BYSETPOS, WKST), EXDATE and
// RECURRENCE-ID overrides. Rules using parts we don't understand (BYHOUR, BYWEEKNO,
// HOURLY, …) fall back to the single DTSTART instance rather than guessing dates.

import type { CalendarEvent } from '../engine/types';
import { platform } from '../platform';
import {
  CalendarError,
  type CalendarAccount,
  type CalendarInfo,
  type CalendarProvider,
  type TimeRange,
} from './types';

const DAY_MS = 86_400_000;
/** Hard cap on RRULE periods walked per series (days, weeks, months or years). */
const MAX_PERIODS = 5_000;
const NO_TITLE = '(No title)';

// ---------------------------------------------------------------------------
// Time zones

export interface WallTime {
  year: number;
  /** 1–12 */
  month: number;
  day: number;
  hour?: number;
  minute?: number;
  second?: number;
}

const formatters = new Map<string, Intl.DateTimeFormat | null>();

function zoneFormatter(timeZone: string): Intl.DateTimeFormat | null {
  let f = formatters.get(timeZone);
  if (f === undefined) {
    try {
      f = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
      });
    } catch {
      f = null;
    }
    formatters.set(timeZone, f);
  }
  return f;
}

export function isValidTimeZone(timeZone: string): boolean {
  return zoneFormatter(timeZone) !== null;
}

// Zone transitions fall on 15-minute UTC boundaries, so the offset is constant per bucket.
const offsetCache = new Map<string, number>();
const OFFSET_BUCKET_MS = 15 * 60_000;

/** UTC offset (local − UTC, in ms) of `timeZone` at the instant `ms`. */
export function timeZoneOffsetMs(ms: number, timeZone: string): number {
  const key = `${timeZone}|${Math.floor(ms / OFFSET_BUCKET_MS)}`;
  const cached = offsetCache.get(key);
  if (cached !== undefined) return cached;
  const f = zoneFormatter(timeZone);
  if (!f) throw new RangeError(`Unknown time zone: ${timeZone}`);
  const p: Record<string, number> = {};
  for (const part of f.formatToParts(ms)) if (part.type !== 'literal') p[part.type] = Number(part.value);
  const offset = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
  if (offsetCache.size > 20_000) offsetCache.clear();
  offsetCache.set(key, offset);
  return offset;
}

/**
 * Wall-clock time in an IANA zone → epoch ms. Per RFC 5545 §3.3.5 a time inside a
 * spring-forward gap uses the offset from before the gap, and an ambiguous
 * fall-back time resolves to its first occurrence.
 */
export function zonedTimeToUtc(t: WallTime, timeZone: string): number {
  const asUtc = Date.UTC(t.year, t.month - 1, t.day, t.hour ?? 0, t.minute ?? 0, t.second ?? 0);
  // Offsets a day either side bracket any DST transition near this wall time.
  const before = timeZoneOffsetMs(asUtc - DAY_MS, timeZone);
  const after = timeZoneOffsetMs(asUtc + DAY_MS, timeZone);
  const valid = [asUtc - before, asUtc - after].filter((c) => timeZoneOffsetMs(c, timeZone) === asUtc - c);
  return valid.length ? Math.min(...valid) : asUtc - before;
}

// Outlook/Exchange feeds use Windows zone names. The common ones:
const WINDOWS_ZONES: Record<string, string> = {
  'UTC': 'UTC',
  'GMT Standard Time': 'Europe/London',
  'Greenwich Standard Time': 'Atlantic/Reykjavik',
  'W. Europe Standard Time': 'Europe/Berlin',
  'Romance Standard Time': 'Europe/Paris',
  'Central Europe Standard Time': 'Europe/Budapest',
  'Central European Standard Time': 'Europe/Warsaw',
  'E. Europe Standard Time': 'Europe/Chisinau',
  'FLE Standard Time': 'Europe/Kiev',
  'GTB Standard Time': 'Europe/Bucharest',
  'Turkey Standard Time': 'Europe/Istanbul',
  'Russian Standard Time': 'Europe/Moscow',
  'Egypt Standard Time': 'Africa/Cairo',
  'South Africa Standard Time': 'Africa/Johannesburg',
  'Arab Standard Time': 'Asia/Riyadh',
  'Arabian Standard Time': 'Asia/Dubai',
  'Pakistan Standard Time': 'Asia/Karachi',
  'India Standard Time': 'Asia/Kolkata',
  'Bangladesh Standard Time': 'Asia/Dhaka',
  'SE Asia Standard Time': 'Asia/Bangkok',
  'Singapore Standard Time': 'Asia/Singapore',
  'China Standard Time': 'Asia/Shanghai',
  'Tokyo Standard Time': 'Asia/Tokyo',
  'Korea Standard Time': 'Asia/Seoul',
  'AUS Eastern Standard Time': 'Australia/Sydney',
  'New Zealand Standard Time': 'Pacific/Auckland',
  'Hawaiian Standard Time': 'Pacific/Honolulu',
  'Alaskan Standard Time': 'America/Anchorage',
  'Pacific Standard Time': 'America/Los_Angeles',
  'Mountain Standard Time': 'America/Denver',
  'US Mountain Standard Time': 'America/Phoenix',
  'Central Standard Time': 'America/Chicago',
  'Eastern Standard Time': 'America/New_York',
  'Atlantic Standard Time': 'America/Halifax',
  'E. South America Standard Time': 'America/Sao_Paulo',
};

function resolveTimeZone(tzid: string, aliases: Map<string, string>): string | null {
  const id = tzid.trim();
  const tail = /([A-Za-z_]+\/[A-Za-z0-9_+-]+(?:\/[A-Za-z0-9_+-]+)?)$/.exec(id)?.[1];
  for (const c of [id, aliases.get(id), WINDOWS_ZONES[id], tail]) if (c && isValidTimeZone(c)) return c;
  return null;
}

// ---------------------------------------------------------------------------
// Date-time values

interface IcsTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  kind: 'date' | 'utc' | 'floating' | 'zoned';
  tz?: string;
}

interface Ctx {
  aliases: Map<string, string>;
  /** X-WR-TIMEZONE: applied to floating date-times, as Apple and Outlook do. */
  defaultTz: string | null;
}

const mod = (n: number, m: number) => ((n % m) + m) % m;
const dayNumber = (t: { year: number; month: number; day: number }) => Date.UTC(t.year, t.month - 1, t.day) / DAY_MS;
/** 0 = Sunday. Day 0 (1970-01-01) was a Thursday. */
const weekday = (day: number) => mod(day + 4, 7);

function civil(day: number): { year: number; month: number; day: number } {
  const d = new Date(day * DAY_MS);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

const withDay = (t: IcsTime, day: number): IcsTime => ({ ...t, ...civil(day) });

function toMs(t: IcsTime): number {
  switch (t.kind) {
    case 'date':
      return new Date(t.year, t.month - 1, t.day).getTime();
    case 'utc':
      return Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second);
    case 'floating':
      return new Date(t.year, t.month - 1, t.day, t.hour, t.minute, t.second).getTime();
    case 'zoned':
      return zonedTimeToUtc(t, t.tz!);
  }
}

function parseTimeValue(value: string, params: Record<string, string>, ctx: Ctx): IcsTime | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/i.exec(value.trim());
  if (!m) return null;
  const base = { year: +m[1], month: +m[2], day: +m[3], hour: 0, minute: 0, second: 0 };
  if (!m[4] || params.VALUE?.toUpperCase() === 'DATE') return { ...base, kind: 'date' };
  const t = { ...base, hour: +m[4], minute: +m[5], second: m[6] ? +m[6] : 0 };
  if (m[7]) return { ...t, kind: 'utc' };
  const tz = params.TZID ? resolveTimeZone(params.TZID, ctx.aliases) : ctx.defaultTz;
  return tz ? { ...t, kind: 'zoned', tz } : { ...t, kind: 'floating' };
}

/** A floating EXDATE/UNTIL next to a zoned DTSTART is meant in the DTSTART zone. */
function alignTo(t: IcsTime, like: IcsTime): IcsTime {
  return t.kind === 'floating' && like.kind === 'zoned' ? { ...t, kind: 'zoned', tz: like.tz } : t;
}

/** Nominal days (calendar-aware) plus exact milliseconds, per RFC 5545 §3.3.6. */
interface Span {
  days: number;
  ms: number;
}

function parseDuration(v: string): Span | null {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i.exec(v.trim());
  if (!m) return null;
  const sign = m[1] === '-' ? -1 : 1;
  const n = (i: number) => (m[i] ? Number(m[i]) : 0);
  return { days: sign * (n(2) * 7 + n(3)), ms: sign * (n(4) * 3600 + n(5) * 60 + n(6)) * 1000 };
}

// ---------------------------------------------------------------------------
// Lexing

interface Prop {
  name: string;
  params: Record<string, string>;
  value: string;
}

function unfold(text: string): string[] {
  const out: string[] = [];
  for (const line of text.replace(/^﻿/, '').split(/\r\n|\n|\r/)) {
    if ((line[0] === ' ' || line[0] === '\t') && out.length) out[out.length - 1] += line.slice(1);
    else out.push(line);
  }
  return out;
}

function splitOutsideQuotes(s: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (const ch of s) {
    if (ch === '"') quoted = !quoted;
    if (ch === sep && !quoted) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function parseLine(line: string): Prop | null {
  let quoted = false;
  let colon = -1;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') quoted = !quoted;
    else if (ch === ':' && !quoted) {
      colon = i;
      break;
    }
  }
  if (colon <= 0) return null;
  const [name, ...rawParams] = splitOutsideQuotes(line.slice(0, colon), ';');
  const params: Record<string, string> = {};
  for (const p of rawParams) {
    const eq = p.indexOf('=');
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"(.*)"$/, '$1');
  }
  return { name: name.toUpperCase(), params, value: line.slice(colon + 1) };
}

export function unescapeText(v: string): string {
  return v.replace(/\\([nN\\,;])/g, (_, c: string) => (c === 'n' || c === 'N' ? '\n' : c));
}

interface Lexed {
  calendar: Prop[];
  events: Prop[][];
  aliases: Map<string, string>;
}

function lex(text: string, stopAtFirstEvent = false): Lexed {
  const calendar: Prop[] = [];
  const events: Prop[][] = [];
  const aliases = new Map<string, string>();
  const stack: string[] = [];
  let event: Prop[] | null = null;
  let tz: { id?: string; location?: string } | null = null;

  for (const line of unfold(text)) {
    const p = parseLine(line);
    if (!p) continue;
    if (p.name === 'BEGIN') {
      const comp = p.value.trim().toUpperCase();
      if (comp === 'VEVENT' && stopAtFirstEvent) break;
      stack.push(comp);
      if (comp === 'VEVENT' && !event) event = [];
      else if (comp === 'VTIMEZONE') tz = {};
      continue;
    }
    if (p.name === 'END') {
      const comp = stack.pop();
      if (comp === 'VEVENT' && event) {
        events.push(event);
        event = null;
      } else if (comp === 'VTIMEZONE' && tz) {
        if (tz.id && tz.location) aliases.set(tz.id, tz.location);
        tz = null;
      }
      continue;
    }
    const top = stack[stack.length - 1];
    // Only the VEVENT's own properties — a nested VALARM must not overwrite them.
    if (top === 'VEVENT' && event) event.push(p);
    else if (top === 'VCALENDAR') calendar.push(p);
    else if (top === 'VTIMEZONE' && tz) {
      if (p.name === 'TZID') tz.id = p.value.trim();
      else if (p.name === 'X-LIC-LOCATION') tz.location = p.value.trim();
    }
  }
  return { calendar, events, aliases };
}

function normalizeColor(v: string | undefined): string | undefined {
  const m = v && /^#?([0-9a-f]{6})(?:[0-9a-f]{2})?$/i.exec(v.trim());
  return m ? `#${m[1].toLowerCase()}` : undefined;
}

function calendarMeta(props: Prop[]): { name?: string; color?: string; timezone?: string } {
  const get = (n: string) => props.find((p) => p.name === n)?.value;
  const name = unescapeText(get('X-WR-CALNAME') ?? get('NAME') ?? '').trim();
  return {
    name: name || undefined,
    color: normalizeColor(get('X-APPLE-CALENDAR-COLOR') ?? get('COLOR')),
    timezone: get('X-WR-TIMEZONE')?.trim(),
  };
}

/** Calendar name, colour and time zone only; stops before the first VEVENT, so it's cheap. */
export function readIcsMeta(text: string): { name?: string; color?: string; timeZone?: string } {
  const { calendar, aliases } = lex(text, true);
  const { name, color, timezone } = calendarMeta(calendar);
  const timeZone = timezone ? (resolveTimeZone(timezone, aliases) ?? undefined) : undefined;
  return { name, color, ...(timeZone ? { timeZone } : {}) };
}

// ---------------------------------------------------------------------------
// Events and recurrence

interface VEvent {
  uid: string;
  title: string;
  location?: string;
  url?: string;
  cancelled: boolean;
  start: IcsTime;
  duration: Span;
  rrule?: string;
  exdates: Prop[];
  recurrenceId?: number;
}

function readEvent(props: Prop[], ctx: Ctx): VEvent | null {
  const get = (n: string) => props.find((p) => p.name === n);
  const time = (p: Prop | undefined) => (p ? parseTimeValue(p.value, p.params, ctx) : null);

  const start = time(get('DTSTART'));
  if (!start) return null;
  const allDay = start.kind === 'date';
  const end = time(get('DTEND'));
  const dur = get('DURATION');
  let duration: Span = { days: allDay ? 1 : 0, ms: 0 };
  if (end) {
    duration = allDay ? { days: dayNumber(end) - dayNumber(start), ms: 0 } : { days: 0, ms: toMs(end) - toMs(start) };
  } else if (dur) {
    duration = parseDuration(dur.value) ?? duration;
  }
  // Negative spans, and all-day events whose DTEND repeats DTSTART, get the default length.
  if (duration.days < 0 || duration.ms < 0 || (allDay && duration.days === 0 && duration.ms === 0)) {
    duration = { days: allDay ? 1 : 0, ms: 0 };
  }

  const rid = time(get('RECURRENCE-ID'));
  const summary = unescapeText(get('SUMMARY')?.value ?? '').trim();
  const location = unescapeText(get('LOCATION')?.value ?? '').trim();
  const url = get('URL')?.value.trim();
  return {
    uid: get('UID')?.value.trim() || `${summary}@${toMs(start)}`,
    title: summary || NO_TITLE,
    location: location || undefined,
    url: url && /^https?:\/\//i.test(url) ? url : undefined,
    cancelled: get('STATUS')?.value.trim().toUpperCase() === 'CANCELLED',
    start,
    duration,
    rrule: get('RRULE')?.value,
    exdates: props.filter((p) => p.name === 'EXDATE'),
    recurrenceId: rid ? toMs(alignTo(rid, start)) : undefined,
  };
}

const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const UNSUPPORTED_PARTS = ['BYHOUR', 'BYMINUTE', 'BYSECOND', 'BYWEEKNO', 'BYYEARDAY'];

interface RRule {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  interval: number;
  count?: number;
  untilMs?: number;
  /** `n` = ordinal within the month (1 = first, -1 = last); 0 = every such weekday. */
  byDay?: { n: number; wd: number }[];
  byMonthDay?: number[];
  byMonth?: number[];
  bySetPos?: number[];
  wkst: number;
}

/** `null` when the rule uses parts we can't honour; the caller then emits DTSTART only. */
function parseRRule(value: string, start: IcsTime, ctx: Ctx): RRule | null {
  const parts: Record<string, string> = {};
  for (const kv of value.split(';')) {
    const eq = kv.indexOf('=');
    if (eq > 0) parts[kv.slice(0, eq).trim().toUpperCase()] = kv.slice(eq + 1).trim();
  }
  const freq = parts.FREQ?.toUpperCase();
  if (freq !== 'DAILY' && freq !== 'WEEKLY' && freq !== 'MONTHLY' && freq !== 'YEARLY') return null;
  if (UNSUPPORTED_PARTS.some((p) => p in parts)) return null;

  const ints = (s: string | undefined) =>
    s ? s.split(',').map(Number).filter((n) => Number.isInteger(n) && n !== 0) : undefined;

  let byDay: RRule['byDay'];
  if (parts.BYDAY) {
    byDay = [];
    for (const tok of parts.BYDAY.split(',')) {
      const m = /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/i.exec(tok.trim());
      if (!m) return null;
      // Ordinals only mean something inside a month.
      const n = m[1] && (freq === 'MONTHLY' || freq === 'YEARLY') ? Number(m[1]) : 0;
      byDay.push({ n, wd: WEEKDAYS.indexOf(m[2].toUpperCase()) });
    }
  }
  const byMonth = ints(parts.BYMONTH);
  if (freq === 'YEARLY' && byDay && !byMonth) return null; // e.g. "20th Monday of the year"

  let untilMs: number | undefined;
  const until = parts.UNTIL ? parseTimeValue(parts.UNTIL, {}, ctx) : null;
  if (until) {
    if (until.kind === 'date') {
      // Inclusive date: everything before the next local midnight in the event's zone.
      untilMs = toMs(withDay({ ...start, hour: 0, minute: 0, second: 0 }, dayNumber(until) + 1)) - 1;
    } else {
      untilMs = toMs(alignTo(until, start));
    }
  }
  const count = Number(parts.COUNT);
  const wkst = WEEKDAYS.indexOf(parts.WKST?.toUpperCase() ?? 'MO');
  return {
    freq,
    interval: Math.max(1, Math.floor(Number(parts.INTERVAL)) || 1),
    count: Number.isInteger(count) && count > 0 ? count : undefined,
    untilMs,
    byDay,
    byMonthDay: ints(parts.BYMONTHDAY),
    byMonth,
    bySetPos: ints(parts.BYSETPOS),
    wkst: wkst < 0 ? 1 : wkst,
  };
}

function monthDays(year: number, month: number, rule: RRule, start: IcsTime): number[] {
  const first = dayNumber({ year, month, day: 1 });
  const dim = dayNumber({ year, month: month + 1, day: 1 }) - first;
  const fromMonthDay = rule.byMonthDay
    ?.map((n) => (n > 0 ? n : dim + n + 1))
    .filter((n) => n >= 1 && n <= dim)
    .map((n) => first + n - 1);
  if (!rule.byDay) return fromMonthDay ?? (start.day <= dim ? [first + start.day - 1] : []);

  const fromByDay: number[] = [];
  for (const { n, wd } of rule.byDay) {
    const all: number[] = [];
    for (let d = first + mod(wd - weekday(first), 7); d < first + dim; d += 7) all.push(d);
    if (n === 0) fromByDay.push(...all);
    else {
      const pick = n > 0 ? all[n - 1] : all[all.length + n];
      if (pick !== undefined) fromByDay.push(pick);
    }
  }
  return fromMonthDay ? fromMonthDay.filter((d) => fromByDay.includes(d)) : fromByDay;
}

/** Candidate days (day numbers, sorted) for period `p` counted from DTSTART's period. */
function periodDays(rule: RRule, start: IcsTime, p: number): number[] {
  const startDay = dayNumber(start);
  let days: number[];
  switch (rule.freq) {
    case 'DAILY':
      days = [startDay + p];
      break;
    case 'WEEKLY': {
      const weekStart = startDay - mod(weekday(startDay) - rule.wkst, 7) + p * 7;
      days = rule.byDay ? rule.byDay.map((b) => weekStart + mod(b.wd - rule.wkst, 7)) : [startDay + p * 7];
      break;
    }
    case 'MONTHLY': {
      const m = start.month - 1 + p;
      days = monthDays(start.year + Math.floor(m / 12), mod(m, 12) + 1, rule, start);
      break;
    }
    case 'YEARLY':
      days = (rule.byMonth ?? [start.month]).flatMap((m) => monthDays(start.year + p, m, rule, start));
      break;
  }
  if (rule.freq === 'DAILY' && rule.byDay) days = days.filter((d) => rule.byDay!.some((b) => b.wd === weekday(d)));
  if (rule.freq !== 'YEARLY' && rule.byMonth) days = days.filter((d) => rule.byMonth!.includes(civil(d).month));
  days = [...new Set(days)].sort((a, b) => a - b);
  if (rule.bySetPos) {
    const picked = rule.bySetPos.map((n) => (n > 0 ? days[n - 1] : days[days.length + n]));
    days = [...new Set(picked.filter((d) => d !== undefined))].sort((a, b) => a - b);
  }
  return days;
}

/** First period index worth walking when COUNT doesn't force us to start at DTSTART. */
function firstUsefulPeriod(rule: RRule, start: IcsTime, fromMs: number): number {
  const startDay = dayNumber(start);
  const fromDay = Math.floor(fromMs / DAY_MS) - 1; // 1-day margin for zone offsets
  if (fromDay <= startDay) return 0;
  const f = civil(fromDay);
  const elapsed =
    rule.freq === 'DAILY'
      ? fromDay - startDay
      : rule.freq === 'WEEKLY'
        ? Math.floor((fromDay - startDay) / 7)
        : rule.freq === 'MONTHLY'
          ? (f.year - start.year) * 12 + (f.month - start.month)
          : f.year - start.year;
  return Math.max(0, (Math.floor(elapsed / rule.interval) - 1) * rule.interval);
}

/** Occurrence starts that may overlap `range` (EXDATEs removed, but still counted for COUNT). */
function expand(ev: VEvent, rule: RRule, range: TimeRange, ctx: Ctx): IcsTime[] {
  const exMs = new Set<number>();
  const exDays = new Set<number>();
  for (const p of ev.exdates) {
    for (const v of p.value.split(',')) {
      const t = parseTimeValue(v, p.params, ctx);
      if (!t) continue;
      if (t.kind === 'date' && ev.start.kind !== 'date') exDays.add(dayNumber(t));
      else exMs.add(toMs(alignTo(t, ev.start)));
    }
  }

  const lookback = ev.duration.days * DAY_MS + ev.duration.ms + DAY_MS;
  const out: IcsTime[] = [];
  let emitted = 0;
  // Returns false once the series or the range is exhausted.
  const emit = (t: IcsTime): boolean => {
    const ms = toMs(t);
    if (rule.untilMs !== undefined && ms > rule.untilMs) return false;
    if (rule.count !== undefined && emitted >= rule.count) return false;
    emitted++;
    if (ms >= range.endMs) return false;
    if (ms >= range.startMs - lookback && !exMs.has(ms) && !exDays.has(dayNumber(t))) out.push(t);
    return true;
  };

  const startDay = dayNumber(ev.start);
  let p = rule.count === undefined ? firstUsefulPeriod(rule, ev.start, range.startMs - lookback) : 0;
  // DTSTART is always the first instance (RFC 5545 §3.8.5.3), even if the rule wouldn't produce it.
  if (p === 0 && !emit(ev.start)) return out;
  for (let i = 0; i < MAX_PERIODS; i++, p += rule.interval) {
    for (const day of periodDays(rule, ev.start, p)) {
      if (day <= startDay) continue;
      if (!emit(withDay(ev.start, day))) return out;
    }
  }
  return out;
}

export interface IcsOccurrence {
  /** UID for single events; `UID/<original start ms>` for instances of a series. */
  id: string;
  uid: string;
  title: string;
  startMs: number;
  endMs: number;
  allDay: boolean;
  location?: string;
  url?: string;
}

export interface IcsCalendar {
  name?: string;
  color?: string;
  events: IcsOccurrence[];
}

function overlaps(startMs: number, endMs: number, range: TimeRange): boolean {
  if (startMs >= range.endMs) return false;
  return endMs > range.startMs || (endMs === startMs && startMs >= range.startMs);
}

/** Parse an iCalendar document into concrete occurrences overlapping `range`, sorted by start. */
export function parseIcs(text: string, range: TimeRange): IcsCalendar {
  const lexed = lex(text);
  const meta = calendarMeta(lexed.calendar);
  const ctx: Ctx = {
    aliases: lexed.aliases,
    defaultTz: meta.timezone ? resolveTimeZone(meta.timezone, lexed.aliases) : null,
  };
  const vevents = lexed.events.map((p) => readEvent(p, ctx)).filter((e): e is VEvent => e !== null);

  // RECURRENCE-ID instances replace (or, when cancelled, remove) a generated slot.
  const overridden = new Map<string, Set<number>>();
  for (const ev of vevents) {
    if (ev.recurrenceId === undefined) continue;
    let set = overridden.get(ev.uid);
    if (!set) overridden.set(ev.uid, (set = new Set()));
    set.add(ev.recurrenceId);
  }

  const out: IcsOccurrence[] = [];
  const push = (ev: VEvent, start: IcsTime, id: string) => {
    const startMs = toMs(start);
    const endMs = toMs(withDay(start, dayNumber(start) + ev.duration.days)) + ev.duration.ms;
    if (!overlaps(startMs, endMs, range)) return;
    out.push({
      id,
      uid: ev.uid,
      title: ev.title,
      startMs,
      endMs,
      allDay: start.kind === 'date',
      ...(ev.location ? { location: ev.location } : {}),
      ...(ev.url ? { url: ev.url } : {}),
    });
  };

  for (const ev of vevents) {
    if (ev.cancelled) continue;
    if (ev.recurrenceId !== undefined) {
      push(ev, ev.start, `${ev.uid}/${ev.recurrenceId}`);
      continue;
    }
    const rule = ev.rrule ? parseRRule(ev.rrule, ev.start, ctx) : null;
    if (!rule) {
      push(ev, ev.start, ev.uid);
      continue;
    }
    const skip = overridden.get(ev.uid);
    for (const start of expand(ev, rule, range, ctx)) {
      const ms = toMs(start);
      if (!skip?.has(ms)) push(ev, start, `${ev.uid}/${ms}`);
    }
  }

  // Some generators reuse UIDs; keep ids unique so caches keyed by id don't drop events.
  const seen = new Map<string, number>();
  for (const o of out) {
    const n = seen.get(o.id) ?? 0;
    seen.set(o.id, n + 1);
    if (n) o.id = `${o.id}~${n}`;
  }
  out.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  return { name: meta.name, color: meta.color, events: out };
}

// ---------------------------------------------------------------------------
// Provider

/** ICS accounts expose the whole feed as a single calendar with this id. */
export const FEED_CALENDAR_ID = 'feed';
/** Re-use a fetched feed for this long, so listCalendars + fetchEvents cost one request. */
const FEED_REUSE_MS = 30_000;
/** Adding a calendar right after previewing it reuses the preview's download. */
const CONNECT_REUSE_MS = 20_000;
const FEED_COLORS = ['#5b8def', '#3fa66b', '#e5793b', '#9b6ad6', '#d0587e', '#2fa3a8', '#c99a2e'];

/**
 * webcal:// → https://, trimmed and validated. Quotes or angle brackets copied along with
 * the link are dropped. Throws `CalendarError('invalid')`.
 */
export function normalizeIcsUrl(input: string): string {
  const raw = input
    .trim()
    .replace(/^[<"'“‘]+|[>"'”’]+$/g, '')
    .trim()
    .replace(/^webcals?:\/\//i, 'https://');
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new CalendarError('invalid', 'That doesn’t look like a calendar link. It should start with https:// or webcal://.');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new CalendarError('invalid', 'Calendar links must start with https://, http:// or webcal://.');
  }
  return url.toString();
}

function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
}

export function icsAccountId(normalizedUrl: string): string {
  return `ics:${hash(normalizedUrl)}`;
}

/** Keychain entry that holds an ICS account's full link. */
export function icsSecretKey(accountId: string): string {
  return `${accountId}:url`;
}

/** A last path segment we can show: a plain word with a calendar extension, e.g. `basic.ics`. */
const SAFE_FILE = /^[a-z_-]{1,24}\.(?:ics|ical|icalendar|ifb|vcs)$/i;

/**
 * A short form of a calendar link that is safe to show and to store: the host, plus the file
 * name when it is a plain word. Tokens in the path, the query and any user info are dropped.
 * `https://calendar.google.com/calendar/ical/x%40gmail.com/private-ab12/basic.ics` →
 * `calendar.google.com/…/basic.ics`.
 */
export function redactIcsUrl(url: string): string {
  let u: URL;
  try {
    u = new URL(url.trim().replace(/^webcals?:\/\//i, 'https://'));
  } catch {
    return 'calendar link';
  }
  const host = u.hostname.replace(/^www\./, '');
  const segments = u.pathname.split('/').filter(Boolean);
  const last = segments[segments.length - 1] ?? '';
  const file = SAFE_FILE.test(last) ? last : '';
  const query = u.search.length > 1 ? '?…' : '';
  if (!segments.length) return host + (query ? `/${query}` : '');
  if (segments.length === 1 && file) return `${host}/${file}${query}`;
  return `${host}/…${file ? `/${file}` : ''}${query}`;
}

/** Replace every link inside a message with its redacted form, so errors never carry a token. */
export function scrubUrls(text: string): string {
  return text.replace(/\b(?:https?|webcals?):\/\/[^\s"'<>)\]]+/gi, (m) => redactIcsUrl(m));
}

interface Feed {
  text: string;
  fetchedAt: number;
  etag?: string;
  lastModified?: string;
}

const feeds = new Map<string, Feed>();

/**
 * Keep a feed that was just fetched elsewhere (the add-calendar preview), so adding the
 * calendar and its first sync reuse it instead of downloading it again.
 */
export function rememberFeed(url: string, text: string, headers?: Headers): void {
  feeds.set(url, {
    text,
    fetchedAt: Date.now(),
    etag: headers?.get('etag') ?? undefined,
    lastModified: headers?.get('last-modified') ?? undefined,
  });
}

async function fetchFeed(url: string, maxAgeMs = FEED_REUSE_MS): Promise<string> {
  const hit = feeds.get(url);
  if (hit && Date.now() - hit.fetchedAt < maxAgeMs) return hit.text;

  const headers: Record<string, string> = { Accept: 'text/calendar, */*;q=0.5' };
  if (hit?.etag) headers['If-None-Match'] = hit.etag;
  if (hit?.lastModified) headers['If-Modified-Since'] = hit.lastModified;
  let res: Response;
  try {
    res = await platform.fetch(url, { headers });
  } catch (e) {
    throw new CalendarError('network', 'Couldn’t reach that calendar. Check your connection and the link.', { cause: e });
  }
  if (res.status === 304 && hit) {
    hit.fetchedAt = Date.now();
    return hit.text;
  }
  if (!res.ok) {
    const message =
      res.status === 401 || res.status === 403
        ? 'That calendar link is private or needs a password.'
        : res.status === 404 || res.status === 410
          ? 'That calendar link no longer exists.'
          : `The calendar server answered with an error (${res.status}).`;
    throw new CalendarError('http', message);
  }
  const text = await res.text();
  if (!text.includes('BEGIN:VCALENDAR')) {
    throw new CalendarError('invalid', 'That link didn’t return a calendar (.ics) file.');
  }
  rememberFeed(url, text, res.headers);
  return text;
}

function feedCalendar(accountId: string, text: string, fallbackName: string): CalendarInfo {
  const meta = readIcsMeta(text);
  const color = meta.color ?? FEED_COLORS[parseInt(hash(accountId), 36) % FEED_COLORS.length];
  return { id: FEED_CALENDAR_ID, name: meta.name ?? fallbackName, color, enabled: true, primary: true };
}

function requireUrl(account: CalendarAccount): string {
  if (!account.url) throw new CalendarError('invalid', 'This calendar subscription has no link.');
  return account.url;
}

export function createIcsProvider(): CalendarProvider {
  return {
    kind: 'ics',

    async connect(input) {
      const url = normalizeIcsUrl(input?.url ?? '');
      // A preview from the last few seconds is fresh enough to validate the link.
      const text = await fetchFeed(url, CONNECT_REUSE_MS);
      const id = icsAccountId(url);
      const host = new URL(url).hostname;
      const calendar = feedCalendar(id, text, input?.label?.trim() || host);
      return {
        id,
        provider: 'ics',
        label: input?.label?.trim() || calendar.name || host,
        url,
        calendars: [calendar],
        enabled: true,
        error: null,
      };
    },

    async listCalendars(account) {
      return [feedCalendar(account.id, await fetchFeed(requireUrl(account)), account.label)];
    },

    async fetchEvents(account, calendar, range) {
      const { events } = parseIcs(await fetchFeed(requireUrl(account)), range);
      return events.map(
        (o): CalendarEvent => ({
          id: `${calendar.id}:${o.id}`,
          provider: 'ics',
          accountId: account.id,
          calendarId: calendar.id,
          title: o.title,
          startMs: o.startMs,
          endMs: o.endMs,
          allDay: o.allDay,
          color: calendar.color,
          ...(o.location ? { location: o.location } : {}),
          ...(o.url ? { htmlLink: o.url } : {}),
        }),
      );
    },

    async disconnect(account) {
      if (account.url) feeds.delete(account.url);
    },
  };
}
