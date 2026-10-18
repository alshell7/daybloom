import type { ISODate, Minutes } from './types';

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

const pad = (n: number) => String(n).padStart(2, '0');

// ---------------------------------------------------------------------------
// Time zone. Every wall-clock read in the app goes through this module, so the
// whole UI can follow the computer's zone (default) or one the user picks.
// `ISODate` values are calendar dates; instants are epoch ms.
// ---------------------------------------------------------------------------

let zone: string | null = null;
let zoneFmt: Intl.DateTimeFormat | null = null;
const offsetCache = new Map<number, number>();

export function systemTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Follow an IANA zone (e.g. "Asia/Tokyo"), or null/"" for the computer's own zone. */
export function setTimeZone(z: string | null) {
  offsetCache.clear();
  if (!z || z === systemTimeZone()) {
    zone = null;
    zoneFmt = null;
    return;
  }
  try {
    zoneFmt = new Intl.DateTimeFormat('en-US', {
      timeZone: z,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    zone = z;
  } catch {
    zone = null;
    zoneFmt = null;
  }
}

export function activeTimeZone(): string {
  return zone ?? systemTimeZone();
}

/** Offset of a zone from UTC at an instant, in ms (cached per quarter hour). */
export function zoneOffsetMs(ms: number, z: string | null = zone): number {
  if (!z) return -new Date(ms).getTimezoneOffset() * MINUTE;
  const fmt =
    z === zone && zoneFmt
      ? zoneFmt
      : new Intl.DateTimeFormat('en-US', { timeZone: z, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
  const bucket = Math.floor(ms / (15 * MINUTE));
  if (z === zone) {
    const hit = offsetCache.get(bucket);
    if (hit !== undefined) return hit;
  }
  const t = bucket * 15 * MINUTE;
  const p: Record<string, number> = {};
  for (const part of fmt.formatToParts(t)) if (part.type !== 'literal') p[part.type] = Number(part.value);
  const off = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second) - t;
  if (z === zone) {
    if (offsetCache.size > 4000) offsetCache.clear();
    offsetCache.set(bucket, off);
  }
  return off;
}

/** The wall clock of the active zone as a UTC-fielded Date (read it with getUTC*). */
function wall(ms: number): Date {
  return new Date(ms + zoneOffsetMs(ms));
}

/** Calendar date container: local fields hold the calendar date (zone-independent). */
export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** A Date whose local fields are this calendar date — for calendar maths and labels only. */
export function fromISODate(date: ISODate): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Calendar date of an instant in the active zone. */
export function isoOf(ms: number): ISODate {
  const w = wall(ms);
  return `${w.getUTCFullYear()}-${pad(w.getUTCMonth() + 1)}-${pad(w.getUTCDate())}`;
}

export function todayISO(now = Date.now()): ISODate {
  return isoOf(now);
}

export function addDays(date: ISODate, n: number): ISODate {
  const d = fromISODate(date);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** Whole days from a to b (DST-safe). */
export function daysBetween(a: ISODate, b: ISODate): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / DAY);
}

export function weekday(date: ISODate): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Epoch ms for minutes-after-midnight on a date in the active zone (DST-correct). */
export function atMinutes(date: ISODate, minutes: Minutes): number {
  if (!zone) {
    const d = fromISODate(date);
    d.setHours(0, minutes, 0, 0);
    return d.getTime();
  }
  const [y, m, d] = date.split('-').map(Number);
  const target = Date.UTC(y, m - 1, d, 0, minutes);
  // Two passes settle the offset across a DST change.
  let t = target - zoneOffsetMs(target);
  t = target - zoneOffsetMs(t);
  return t;
}

export function startOfDayMs(date: ISODate): number {
  return atMinutes(date, 0);
}

/** Minutes after midnight (with seconds as a fraction) in the active zone. */
export function minutesOfDay(ms: number): Minutes {
  const w = wall(ms);
  return w.getUTCHours() * 60 + w.getUTCMinutes() + (w.getUTCSeconds() + w.getUTCMilliseconds() / 1000) / 60;
}

export function hourOf(ms: number): number {
  return wall(ms).getUTCHours();
}

/** Start of the hour containing `ms` in the active zone. */
export function hourStartMs(ms: number): number {
  return ms - (minutesOfDay(ms) % 60) * MINUTE;
}

/** "Tokyo", "New York" — the city part of an IANA zone. */
export function zoneCity(z: string): string {
  return (z.split('/').pop() ?? z).replaceAll('_', ' ');
}

/** "GMT+9", "GMT−3:30", "GMT" for a zone right now. */
export function zoneOffsetLabel(z: string, at = Date.now()): string {
  const off = Math.round(zoneOffsetMs(at, z) / MINUTE);
  if (off === 0) return 'GMT';
  const sign = off > 0 ? '+' : '−';
  const h = Math.floor(Math.abs(off) / 60);
  const m = Math.abs(off) % 60;
  return `GMT${sign}${h}${m ? `:${pad(m)}` : ''}`;
}

export function snap(minutes: number, step = 5): number {
  return Math.round(minutes / step) * step;
}

export function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

/** "1h 25m", "25m", "45s" — compact, for the dial centre. */
export function formatDuration(ms: number, { seconds = false } = {}): string {
  const neg = ms < 0;
  ms = Math.abs(ms);
  const totalMin = seconds ? Math.floor(ms / MINUTE) : Math.ceil(ms / MINUTE - 1e-9);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  let out: string;
  if (seconds && totalMin < 1) out = `${Math.ceil(ms / 1000)}s`;
  else if (h === 0) out = `${m}m`;
  else if (m === 0) out = `${h}h`;
  else out = `${h}h ${m}m`;
  return neg ? `-${out}` : out;
}

/** "mm:ss" or "h:mm:ss" — for the countdown face. */
export function formatClockCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

let hour12Cache: boolean | null = null;
/** Respect the OS/locale clock preference unless the user overrides it. */
export function prefers12h(): boolean {
  if (hour12Cache === null) {
    try {
      hour12Cache = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12 ?? false;
    } catch {
      hour12Cache = false;
    }
  }
  return hour12Cache;
}

export function formatTime(ms: number, hour12 = prefers12h()): string {
  const d = wall(ms);
  const h = d.getUTCHours();
  const m = pad(d.getUTCMinutes());
  if (!hour12) return `${pad(h)}:${m}`;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m}${h < 12 ? 'am' : 'pm'}`;
}

export function formatMinutes(min: Minutes, hour12 = prefers12h()): string {
  return formatTime(atMinutes('2000-01-03', min), hour12);
}

/** "Mon 19" style day label. */
export function formatDayShort(date: ISODate, locale?: string): { dow: string; day: number } {
  const d = fromISODate(date);
  return { dow: d.toLocaleDateString(locale, { weekday: 'short' }), day: d.getDate() };
}

export function formatDayLong(date: ISODate, locale?: string): string {
  return fromISODate(date).toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' });
}

/** Angle in degrees (0 = 12 o'clock, clockwise) for a time on a dial spanning `spanMs` from `originMs`. */
export function angleFor(ms: number, originMs: number, spanMs: number): number {
  return ((ms - originMs) / spanMs) * 360;
}
