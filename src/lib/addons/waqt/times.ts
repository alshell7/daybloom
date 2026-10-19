// Waqt: the day's salah times. The astronomy is adhan-js (MIT; high-precision, the library
// many prayer apps use); this adds your adjustments, your mosque's fixed times, jamaat and
// Jumu'ah, and each prayer's window (until the next one begins). Pure: no stores, no clock.

import { CalculationMethod, Coordinates, HighLatitudeRule, Madhab as AMadhab, PrayerTimes, Qibla } from 'adhan';
import { PRAYERS, PRAYER_NAME, type PrayerId, type WaqtSettings } from './types';

export interface PrayerSlot {
  id: PrayerId;
  /** Shown name: "Jumu'ah" on Fridays when it's on. */
  name: string;
  /** The adhan (the prayer's time begins). */
  at: number;
  /** When its time ends: the next prayer, sunrise for Fajr, Fajr tomorrow for Isha. */
  end: number;
  /** Jamaat time, when there is one. */
  jamaat: number | null;
  /** This one is a fixed time (your mosque's), not computed. */
  manual: boolean;
}

export interface WaqtDay {
  /** ISO date. */
  date: string;
  sunrise: number;
  prayers: PrayerSlot[];
}

/** "HH:MM" on a day → epoch ms, using `atMinutes` (the app's zone). */
export type AtMinutes = (date: string, minutes: number) => number;

export function parseHHMM(s: string | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((s ?? '').trim());
  if (!m) return null;
  const h = +m[1];
  const mi = +m[2];
  return h < 24 && mi < 60 ? h * 60 + mi : null;
}

function methodParams(s: WaqtSettings) {
  const p = CalculationMethod[s.method]();
  p.madhab = s.madhab === 'hanafi' ? AMadhab.Hanafi : AMadhab.Shafi;
  if (s.highLat === 'middle') p.highLatitudeRule = HighLatitudeRule.MiddleOfTheNight;
  else if (s.highLat === 'seventh') p.highLatitudeRule = HighLatitudeRule.SeventhOfTheNight;
  else if (s.highLat === 'angle') p.highLatitudeRule = HighLatitudeRule.TwilightAngle;
  else if (s.place) p.highLatitudeRule = HighLatitudeRule.recommended(new Coordinates(s.place.lat, s.place.lng));
  return p;
}

function computed(s: WaqtSettings, date: string) {
  const [y, m, d] = date.split('-').map(Number);
  const t = new PrayerTimes(new Coordinates(s.place!.lat, s.place!.lng), new Date(y, m - 1, d), methodParams(s));
  return { fajr: +t.fajr, sunrise: +t.sunrise, dhuhr: +t.dhuhr, asr: +t.asr, maghrib: +t.maghrib, isha: +t.isha };
}

const nextIso = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  const n = new Date(Date.UTC(y, m - 1, d + 1));
  return n.toISOString().slice(0, 10);
};
const isFriday = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 5;
};

/** The day's times, or null until a place is set. */
export function waqtDay(s: WaqtSettings, date: string, at: AtMinutes): WaqtDay | null {
  if (!s.place) return null;
  const c = computed(s, date);
  const next = computed(s, nextIso(date));
  const min = 60_000;
  const time = (id: PrayerId) => {
    const fixed = parseHHMM(s.manual[id]);
    if (fixed != null) return { at: at(date, fixed), manual: true };
    return { at: c[id] + (s.adjust[id] ?? 0) * min, manual: false };
  };
  const t = Object.fromEntries(PRAYERS.map((id) => [id, time(id)])) as Record<PrayerId, { at: number; manual: boolean }>;
  const sunrise = c.sunrise + (s.adjust.sunrise ?? 0) * min;
  const fajrTomorrow = parseHHMM(s.manual.fajr) != null ? at(nextIso(date), parseHHMM(s.manual.fajr)!) : next.fajr + (s.adjust.fajr ?? 0) * min;
  const friday = isFriday(date) && s.jamaat.jumuah.on;
  const ends: Record<PrayerId, number> = { fajr: sunrise, dhuhr: t.asr.at, asr: t.maghrib.at, maghrib: t.isha.at, isha: fajrTomorrow };

  const prayers = PRAYERS.map((id): PrayerSlot => {
    let jamaat: number | null = null;
    const rule = s.jamaat.rules[id];
    if (friday && id === 'dhuhr') {
      const j = parseHHMM(s.jamaat.jumuah.at);
      jamaat = j != null ? at(date, j) : null;
    } else if (s.jamaat.on && rule && rule.mode !== 'off') {
      if (rule.mode === 'after') jamaat = t[id].at + Math.max(0, rule.after) * min;
      else {
        const j = parseHHMM(rule.at);
        jamaat = j != null ? at(date, j) : null;
      }
    }
    return { id, name: friday && id === 'dhuhr' ? 'Jumu’ah' : PRAYER_NAME[id], at: t[id].at, end: ends[id], jamaat, manual: t[id].manual };
  });
  return { date, sunrise, prayers };
}

/** The prayer whose time it is now (its window has begun and not ended), else null. */
export function currentPrayer(days: WaqtDay[], now: number): PrayerSlot | null {
  for (const d of days) for (const p of d.prayers) if (now >= p.at && now < p.end) return p;
  return null;
}

/** The next adhan after now. */
export function nextPrayer(days: WaqtDay[], now: number): PrayerSlot | null {
  let best: PrayerSlot | null = null;
  for (const d of days) for (const p of d.prayers) if (p.at > now && (!best || p.at < best.at)) best = p;
  return best;
}

/** Bearing to the Kaaba from north, degrees clockwise. */
export function qibla(lat: number, lng: number): number {
  return Qibla(new Coordinates(lat, lng));
}

/** "NW" etc. */
export function compass(deg: number): string {
  const n = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return n[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

const HIJRI_MONTHS = ['Muharram', 'Safar', 'Rabiʿ al-Awwal', 'Rabiʿ al-Thani', 'Jumada al-Ula', 'Jumada al-Akhirah', 'Rajab', 'Shaʿban', 'Ramadan', 'Shawwal', 'Dhu al-Qaʿdah', 'Dhu al-Hijjah'];

/** The Hijri date (Umm al-Qura), e.g. { day: 9, month: 5, name: 'Jumada al-Ula', year: 1448 }. */
export function hijri(ms: number): { day: number; month: number; name: string; year: number } | null {
  try {
    const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { day: 'numeric', month: 'numeric', year: 'numeric' }).formatToParts(new Date(ms));
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value?.replace(/[^0-9]/g, ''));
    const day = get('day');
    const month = get('month');
    const year = get('year');
    if (!day || !month || !year) return null;
    return { day, month, name: HIJRI_MONTHS[month - 1] ?? '', year };
  } catch {
    return null;
  }
}
