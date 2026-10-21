// The world clock's sky, from the app (src/lib/dial/sun.ts and world.ts): a small solar model
// (the USNO almanac approximation) shades day, twilight and night for any city, all arithmetic,
// no lookup service. Zone coordinates come from the app's Waqt place list.

import zonesData from '@/data/zones.json';
import { mix } from './color';

const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;
const J2000 = 10957.5;

export function solarAltitude(ms: number, lat: number, lng: number): number {
  const d = ms / DAY_MS - J2000;
  const g = (357.529 + 0.98560028 * d) * RAD;
  const q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const e = (23.439 - 0.00000036 * d) * RAD;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)) / RAD / 15;
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  let eqt = (((q / 15 - ra) % 24) + 24) % 24;
  if (eqt >= 12) eqt -= 24;
  const utcHours = (((ms % DAY_MS) + DAY_MS) % DAY_MS) / 3_600_000;
  const hourAngle = (utcHours + lng / 15 + eqt - 12) * 15 * RAD;
  const phi = lat * RAD;
  const s = Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(hourAngle);
  return Math.asin(Math.max(-1, Math.min(1, s))) / RAD;
}

const fmts = new Map<string, Intl.DateTimeFormat>();
/** Offset of `zone` from UTC at `ms`, in ms. */
export function offsetOf(ms: number, zone: string): number {
  let f = fmts.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' });
    fmts.set(zone, f);
  }
  const t = Math.floor(ms / 60_000) * 60_000;
  const p: Record<string, number> = {};
  for (const part of f.formatToParts(t)) if (part.type !== 'literal') p[part.type] = Number(part.value);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute) - t;
}

const pad = (n: number) => String(n).padStart(2, '0');
export function timeIn(ms: number, zone: string, hour12: boolean): string {
  const d = new Date(ms + offsetOf(ms, zone));
  const h = d.getUTCHours();
  const m = pad(d.getUTCMinutes());
  if (!hour12) return `${pad(h)}:${m}`;
  return `${h % 12 === 0 ? 12 : h % 12}:${m}${h < 12 ? 'am' : 'pm'}`;
}
export function weekdayIn(ms: number, zone: string): string {
  return new Date(ms + offsetOf(ms, zone)).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
}

/** "+8h", "−5h", "+5h 30m" or "same time". */
export function aheadLabel(ms: number, zone: string, primary: string): string {
  const diff = Math.round((offsetOf(ms, zone) - offsetOf(ms, primary)) / 60_000);
  if (diff === 0) return 'same time';
  const sign = diff > 0 ? '+' : '−';
  const h = Math.floor(Math.abs(diff) / 60);
  const m = Math.abs(diff) % 60;
  return m ? `${sign}${h ? `${h}h ` : ''}${m}m` : `${sign}${h}h`;
}

const Z = zonesData as unknown as { alias: Record<string, string>; zones: Record<string, [number, number, string]> };

export interface Place {
  zone: string;
  city: string;
  lat: number;
  lng: number;
}

/** A representative city for a zone; an unknown zone gets an equator sky at its offset's longitude. */
export function placeOf(zone: string, at = Date.now()): Place {
  const z = Z.alias[zone] ?? zone;
  const hit = Z.zones[z];
  const city = (z.split('/').pop() ?? z).replace(/_/g, ' ');
  if (hit) return { zone, city: hit[2] || city, lat: hit[0], lng: hit[1] };
  return { zone, city, lat: 0, lng: (offsetOf(at, zone) / 3_600_000) * 15 };
}

export interface Sky {
  day: string;
  dusk: string;
  twilight: string;
  night: string;
  sun: string;
  moon: string;
}

/** A real sky (clear blue, indigo night, amber-rose dusk) leaned toward the dial's own face. */
export function skyFor(dark: boolean): Sky {
  const face = dark ? '#141B29' : '#F7F8FA';
  const ink = dark ? '#E9EDF3' : '#151C2A';
  if (dark) {
    return { day: mix('#86b8ee', face, 0.2), dusk: mix('#f29a6a', face, 0.1), twilight: mix('#6c5cb8', face, 0.22), night: mix('#343c8c', face, 0.36), sun: '#ffcb57', moon: mix(ink, '#e4ebff', 0.4) };
  }
  // The app's night is drawn as a thin ring; on these wider rings it is eased a little toward the face.
  return { day: mix('#a6d2f8', face, 0.22), dusk: mix('#f3955f', face, 0.12), twilight: mix('#7a69c6', face, 0.12), night: mix(mix('#283273', ink, 0.28), face, 0.18), sun: '#f2a20c', moon: '#eef2ff' };
}

export function skyColor(alt: number, s: Sky): string {
  if (alt >= 5) return s.day;
  if (alt <= -10) return s.night;
  const t = (alt + 10) / 15;
  if (t < 0.4) return mix(s.night, s.twilight, t / 0.4);
  if (t < 0.68) return mix(s.twilight, s.dusk, (t - 0.4) / 0.28);
  return mix(s.dusk, s.day, (t - 0.68) / 0.32);
}

/** The visitor's zone, as the browser reports it. */
export function localZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export const CITY_CHOICES: { zone: string; city: string }[] = [
  { zone: 'Europe/London', city: 'London' },
  { zone: 'America/New_York', city: 'New York' },
  { zone: 'America/Los_Angeles', city: 'San Francisco' },
  { zone: 'Asia/Tokyo', city: 'Tokyo' },
  { zone: 'Asia/Dubai', city: 'Dubai' },
  { zone: 'Asia/Kolkata', city: 'Bengaluru' },
  { zone: 'Asia/Singapore', city: 'Singapore' },
  { zone: 'Australia/Sydney', city: 'Sydney' },
  { zone: 'Europe/Berlin', city: 'Berlin' },
  { zone: 'America/Sao_Paulo', city: 'São Paulo' },
];

/** Two cities that sit far from the visitor and from each other on the clock. */
export function defaultCompare(primary: string, now: number): string[] {
  const own = offsetOf(now, primary) / 3_600_000;
  const others = CITY_CHOICES.filter((c) => c.zone !== primary && Math.abs(offsetOf(now, c.zone) / 3_600_000 - own) >= 3);
  const ahead = others.filter((c) => offsetOf(now, c.zone) / 3_600_000 > own).sort((a, b) => offsetOf(now, b.zone) - offsetOf(now, a.zone));
  const behind = others.filter((c) => offsetOf(now, c.zone) / 3_600_000 < own).sort((a, b) => offsetOf(now, a.zone) - offsetOf(now, b.zone));
  const pick = [ahead[Math.floor(ahead.length / 3)] ?? behind[1], behind[Math.floor(behind.length / 2)] ?? ahead[0]].filter(Boolean) as typeof others;
  const out = [...new Set(pick.map((p) => p.zone))];
  for (const c of others) if (out.length < 2 && !out.includes(c.zone)) out.push(c.zone);
  return out.slice(0, 2);
}
