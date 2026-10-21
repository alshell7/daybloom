// The world clock: other places' time beside your own. Pure helpers shared by the dial's
// day/night rings, the zone picker and Settings: where a zone's sky is, its wall time, how far
// ahead it runs, and how its day, twilight and night fall across the dial's span.

import { PLACES } from '../addons/waqt/places';
import { mix } from '../engine/categories';
import { HOUR, MINUTE } from '../engine/time';
import type { Finish } from '../presets';
import { polar } from './geometry';
import { solarAltitude } from './sun';

/** Compare zones beside the primary (three zones in all). */
export const MAX_COMPARE = 2;

// ---------------------------------------------------------------------------
// Wall time in any zone, independent of the zone the app follows.
// ---------------------------------------------------------------------------

const fmts = new Map<string, Intl.DateTimeFormat>();
const offsets = new Map<string, number>();

/** Offset of `zone` from UTC at `ms`, in ms (cached per zone and quarter hour). */
export function offsetOf(ms: number, zone: string): number {
  const bucket = Math.floor(ms / (15 * MINUTE));
  const key = `${zone}|${bucket}`;
  const hit = offsets.get(key);
  if (hit !== undefined) return hit;
  let fmt = fmts.get(zone);
  if (!fmt) {
    try {
      fmt = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
    } catch {
      fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
    }
    fmts.set(zone, fmt);
  }
  const t = bucket * 15 * MINUTE;
  const p: Record<string, number> = {};
  for (const part of fmt.formatToParts(t)) if (part.type !== 'literal') p[part.type] = Number(part.value);
  const off = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second) - t;
  if (offsets.size > 2000) offsets.clear();
  offsets.set(key, off);
  return off;
}

/** The wall clock of `zone` at `ms`, as a UTC-fielded Date (read it with getUTC*). */
export function wallIn(ms: number, zone: string): Date {
  return new Date(ms + offsetOf(ms, zone));
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "23:14" or "11:14pm" in `zone`. */
export function timeIn(ms: number, zone: string, hour12 = false): string {
  const d = wallIn(ms, zone);
  const h = d.getUTCHours();
  const m = pad(d.getUTCMinutes());
  if (!hour12) return `${pad(h)}:${m}`;
  return `${h % 12 === 0 ? 12 : h % 12}:${m}${h < 12 ? 'am' : 'pm'}`;
}

/** Calendar days `zone` is ahead of `primary` at `ms` (−1, 0 or +1). */
export function dayShift(ms: number, zone: string, primary: string): number {
  const a = wallIn(ms, zone);
  const b = wallIn(ms, primary);
  return Math.round((Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate()) - Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate())) / (24 * HOUR));
}

/** Short weekday in `zone` ("Thu"). */
export function weekdayIn(ms: number, zone: string, locale?: string): string {
  return wallIn(ms, zone).toLocaleDateString(locale, { weekday: 'short', timeZone: 'UTC' });
}

/** How far `zone` runs ahead of `primary`: "+8h", "−5h", "+3h 30m", or "same time". */
export function aheadLabel(ms: number, zone: string, primary: string): string {
  const diff = Math.round((offsetOf(ms, zone) - offsetOf(ms, primary)) / MINUTE);
  if (diff === 0) return 'same time';
  const sign = diff > 0 ? '+' : '−';
  const h = Math.floor(Math.abs(diff) / 60);
  const m = Math.abs(diff) % 60;
  return m ? `${sign}${h ? `${h}h ` : ''}${m}m` : `${sign}${h}h`;
}

// ---------------------------------------------------------------------------
// Where a zone's sky is: a representative city.
// ---------------------------------------------------------------------------

const ALIAS: Record<string, string> = {
  'Asia/Calcutta': 'Asia/Kolkata',
  'Asia/Dacca': 'Asia/Dhaka',
  'Asia/Katmandu': 'Asia/Kathmandu',
  'Asia/Saigon': 'Asia/Ho_Chi_Minh',
  'Asia/Rangoon': 'Asia/Yangon',
  'Europe/Kiev': 'Europe/Kyiv',
  'America/Buenos_Aires': 'America/Argentina/Buenos_Aires',
  'Australia/ACT': 'Australia/Sydney',
  'US/Eastern': 'America/New_York',
  'US/Central': 'America/Chicago',
  'US/Mountain': 'America/Denver',
  'US/Pacific': 'America/Los_Angeles',
};

// Zones the Waqt list doesn't cover, by their main city: [lat, lng].
const EXTRA: Record<string, [number, number]> = {
  'Pacific/Honolulu': [21.31, -157.86],
  'America/Anchorage': [61.22, -149.9],
  'America/Phoenix': [33.45, -112.07],
  'America/Winnipeg': [49.9, -97.14],
  'America/Halifax': [44.65, -63.57],
  'America/St_Johns': [47.56, -52.71],
  'America/Havana': [23.11, -82.37],
  'America/Panama': [8.98, -79.52],
  'America/Guatemala': [14.63, -90.51],
  'America/Bogota': [4.71, -74.07],
  'America/Lima': [-12.05, -77.04],
  'America/Caracas': [10.48, -66.9],
  'America/La_Paz': [-16.5, -68.15],
  'America/Santiago': [-33.45, -70.67],
  'America/Montevideo': [-34.9, -56.16],
  'Atlantic/Reykjavik': [64.15, -21.94],
  'Atlantic/Azores': [37.74, -25.67],
  'Europe/Warsaw': [52.23, 21.01],
  'Europe/Prague': [50.08, 14.44],
  'Europe/Budapest': [47.5, 19.04],
  'Europe/Zagreb': [45.81, 15.98],
  'Europe/Luxembourg': [49.61, 6.13],
  'Europe/Bucharest': [44.43, 26.1],
  'Europe/Sofia': [42.7, 23.32],
  'Europe/Kyiv': [50.45, 30.52],
  'Europe/Minsk': [53.9, 27.56],
  'Europe/Riga': [56.95, 24.1],
  'Europe/Tallinn': [59.44, 24.75],
  'Europe/Vilnius': [54.69, 25.28],
  'Asia/Tbilisi': [41.72, 44.79],
  'Asia/Yerevan': [40.18, 44.51],
  'Asia/Yekaterinburg': [56.84, 60.6],
  'Asia/Novosibirsk': [55.03, 82.92],
  'Asia/Yangon': [16.87, 96.2],
  'Asia/Ho_Chi_Minh': [10.82, 106.63],
  'Asia/Phnom_Penh': [11.56, 104.92],
  'Asia/Taipei': [25.03, 121.57],
  'Asia/Ulaanbaatar': [47.89, 106.91],
  'Asia/Vladivostok': [43.12, 131.89],
  'Australia/Brisbane': [-27.47, 153.03],
  'Australia/Adelaide': [-34.93, 138.6],
  'Australia/Darwin': [-12.46, 130.84],
  'Australia/Hobart': [-42.88, 147.33],
  'Pacific/Guam': [13.44, 144.79],
  'Pacific/Fiji': [-18.14, 178.44],
  'Pacific/Tongatapu': [-21.14, -175.2],
  'Africa/Abidjan': [5.36, -4.01],
  'Africa/Kinshasa': [-4.44, 15.27],
  'Africa/Luanda': [-8.84, 13.23],
  'Africa/Kampala': [0.35, 32.58],
  'Africa/Harare': [-17.83, 31.05],
  'Indian/Mauritius': [-20.16, 57.5],
};

export interface SkyPlace {
  lat: number;
  lng: number;
  /** No known city: the sky is guessed from the zone's offset (about 6:00–18:00). */
  approx: boolean;
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z]/g, '');

/** A representative city for a zone; unknown zones get an equator sky at the offset's longitude. */
export function placeOf(zone: string, at = Date.now()): SkyPlace {
  const z = ALIAS[zone] ?? zone;
  const city = norm(z.split('/').pop() ?? '');
  const inZone = PLACES.filter((p) => p.tz === z);
  const p = inZone.find((x) => norm(x.name) === city) ?? inZone[0];
  if (p) return { lat: p.lat, lng: p.lng, approx: false };
  const e = EXTRA[z];
  if (e) return { lat: e[0], lng: e[1], approx: false };
  return { lat: 0, lng: (offsetOf(at, zone) / HOUR) * 15, approx: true };
}

// ---------------------------------------------------------------------------
// The sky's colours, from the dial finish so they sit right on every face.
// ---------------------------------------------------------------------------

export interface Sky {
  day: string;
  dusk: string;
  twilight: string;
  night: string;
  /** Hairline around each band. */
  edge: string;
  /** Hour marks printed on the band. */
  markDay: string;
  markNight: string;
  sun: string;
  moon: string;
}

// A real sky (clear blue, indigo night, an amber-rose dusk) leaned toward the finish's own face
// and ink, so it reads as day and night at a glance yet belongs to each dial.
export function skyFor(f: Finish): Sky {
  if (f.dark) {
    const day = mix('#86b8ee', f.face, 0.2);
    const night = mix('#343c8c', f.face, 0.36);
    return {
      day,
      dusk: mix('#f29a6a', f.face, 0.1),
      twilight: mix('#6c5cb8', f.face, 0.22),
      night,
      edge: f.track,
      markDay: mix(day, '#0b1430', 0.5),
      markNight: mix(night, '#ffffff', 0.32),
      sun: '#ffcb57',
      moon: mix(f.ink, '#e4ebff', 0.4),
    };
  }
  const day = mix('#a6d2f8', f.face, 0.22);
  const night = mix('#283273', f.ink, 0.28);
  return {
    day,
    dusk: mix('#f3955f', f.face, 0.12),
    twilight: mix('#7a69c6', f.face, 0.12),
    night,
    edge: f.track,
    markDay: mix(day, '#0b1a3c', 0.42),
    markNight: mix(night, '#ffffff', 0.38),
    sun: '#f2a20c',
    moon: '#eef2ff',
  };
}

/** Above this the band is plain day; below `NIGHT_ALT`, plain night (degrees of solar altitude). */
export const DAY_ALT = 5;
export const NIGHT_ALT = -10;

/** The sky's colour for a solar altitude: night → twilight violet → dusk amber → day. */
export function skyColor(alt: number, s: Sky): string {
  if (alt >= DAY_ALT) return s.day;
  if (alt <= NIGHT_ALT) return s.night;
  const t = (alt - NIGHT_ALT) / (DAY_ALT - NIGHT_ALT);
  if (t < 0.4) return mix(s.night, s.twilight, t / 0.4);
  if (t < 0.68) return mix(s.twilight, s.dusk, (t - 0.4) / 0.28);
  return mix(s.dusk, s.day, (t - 0.68) / 0.32);
}

/** Day, twilight or night where `place` is, right now. */
export function phaseAt(ms: number, place: SkyPlace): 'day' | 'twilight' | 'night' {
  const alt = solarAltitude(ms, place.lat, place.lng);
  return alt >= DAY_ALT ? 'day' : alt <= NIGHT_ALT ? 'night' : 'twilight';
}

// ---------------------------------------------------------------------------
// A ring: the dial's whole turn as solid day/night stretches and graded twilights.
// ---------------------------------------------------------------------------

export interface SkyPiece {
  /** Start / end angle (deg, clockwise from 12), a1 > a0. */
  a0: number;
  a1: number;
  /** A solid stretch… */
  color?: string;
  /** …or a gradient through these angles. */
  stops?: { a: number; color: string }[];
}

export interface RingSpan {
  /** Time at 0°. */
  originMs: number;
  /** Time in one full turn. */
  spanMs: number;
  /** Where the turn starts (the dial's window start). */
  startMs: number;
}

const angleOf = (t: number, s: RingSpan) => ((t - s.originMs) / s.spanMs) * 360;

/**
 * Sample the sky every `stepDeg` round the turn and fold it into pieces: one per solid day or
 * night stretch, gradients (at most `maxChunk`° each) through dawn and dusk.
 */
export function skyPieces(span: RingSpan, place: SkyPlace, sky: Sky, stepDeg = 1, maxChunk = 40): SkyPiece[] {
  const n = Math.max(12, Math.round(360 / stepDeg));
  const a: number[] = [];
  const c: string[] = [];
  for (let i = 0; i <= n; i++) {
    const t = span.startMs + (span.spanMs * i) / n;
    a.push(angleOf(t, span));
    c.push(skyColor(solarAltitude(t, place.lat, place.lng), sky));
  }
  const out: SkyPiece[] = [];
  let i = 0;
  while (i < n) {
    if (c[i] === c[i + 1]) {
      let j = i + 1;
      while (j < n && c[j + 1] === c[i]) j++;
      out.push({ a0: a[i], a1: a[j], color: c[i] });
      i = j;
    } else {
      let j = i + 1;
      while (j < n && c[j] !== c[j + 1] && a[j] - a[i] < maxChunk) j++;
      const stops: { a: number; color: string }[] = [];
      for (let k = i; k <= j; k++) stops.push({ a: a[k], color: c[k] });
      out.push({ a0: a[i], a1: a[j], stops });
      i = j;
    }
  }
  return out;
}

/** A gradient's axis for a piece drawn at radius r: the chord from its start to its end, with each stop projected onto it. */
export function gradientAxis(p: SkyPiece, r: number) {
  const [x1, y1] = polar(r, p.a0);
  const [x2, y2] = polar(r, p.a1);
  const vx = x2 - x1;
  const vy = y2 - y1;
  const len2 = vx * vx + vy * vy || 1;
  const stops = (p.stops ?? []).map((s) => {
    const [x, y] = polar(r, s.a);
    return { offset: Math.min(1, Math.max(0, ((x - x1) * vx + (y - y1) * vy) / len2)), color: s.color };
  });
  return { x1, y1, x2, y2, stops };
}

export interface HourMark {
  t: number;
  /** Angle on the dial. */
  a: number;
  /** Local hour there, 0–23. */
  hour: number;
}

/** Each of `zone`'s whole local hours inside the turn [startMs, startMs + spanMs). */
export function hourMarks(span: RingSpan, zone: string): HourMark[] {
  const end = span.startMs + span.spanMs;
  const out: HourMark[] = [];
  let off = offsetOf(span.startMs, zone);
  let t = Math.ceil((span.startMs + off) / HOUR) * HOUR - off;
  let guard = 0;
  while (t < end && guard++ < 60) {
    off = offsetOf(t, zone);
    // Re-seat on the wall-clock hour (a DST change can move it).
    const local = Math.round((t + off) / HOUR) * HOUR;
    const at = local - off;
    if (at >= span.startMs && at < end && !out.some((m) => m.t === at)) out.push({ t: at, a: angleOf(at, span), hour: new Date(local).getUTCHours() });
    t = at + HOUR;
  }
  return out;
}

// ---------------------------------------------------------------------------
// The list of compare zones: at most two, never the primary, no repeats.
// ---------------------------------------------------------------------------

/** The compare zones worth drawing beside `primary`. */
export function compareList(zones: string[], primary: string): string[] {
  const out: string[] = [];
  for (const z of zones) if (z && z !== primary && !out.includes(z) && out.length < MAX_COMPARE) out.push(z);
  return out;
}

/** Pin `z` beside the primary. `full` means the list already holds two: ask which to replace. */
export function pinZone(zones: string[], z: string, primary: string): { zones: string[]; full: boolean } {
  if (z === primary || zones.includes(z)) return { zones, full: false };
  if (zones.length >= MAX_COMPARE) return { zones, full: true };
  return { zones: [...zones, z], full: false };
}

/** Put `z` where `old` was. */
export function replaceZone(zones: string[], old: string, z: string): string[] {
  return zones.map((x) => (x === old ? z : x)).filter((x, i, all) => all.indexOf(x) === i);
}

/**
 * A pinned zone becomes the primary: the old primary takes its place in the list, so the three
 * zones stay the same three.
 */
export function promoteZone(zones: string[], z: string, oldPrimary: string): string[] {
  if (!zones.includes(z)) return zones;
  if (!oldPrimary || oldPrimary === z || zones.includes(oldPrimary)) return zones.filter((x) => x !== z);
  return zones.map((x) => (x === z ? oldPrimary : x));
}
