// Waqt: defaults, and repairing a stored file.

import { PRAYERS, METHODS, type JamaatRule, type Marked, type PrayerId, type WaqtFile, type WaqtSettings } from './types';

const JAMAAT_AFTER: Record<PrayerId, number> = { fajr: 20, dhuhr: 15, asr: 15, maghrib: 5, isha: 15 };

export function defaultWaqtSettings(): WaqtSettings {
  return {
    place: null,
    method: 'MuslimWorldLeague',
    madhab: 'shafi',
    highLat: 'auto',
    adjust: { fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 },
    manual: {},
    jamaat: {
      on: false,
      rules: Object.fromEntries(PRAYERS.map((p) => [p, { mode: 'after', after: JAMAAT_AFTER[p], at: '' } satisfies JamaatRule])) as Record<PrayerId, JamaatRule>,
      jumuah: { on: false, at: '13:30', minutes: 45 },
    },
    dial: { track: true, blocks: true, minutes: 15 },
    remind: { before: 10, atAdhan: true, beforeJamaat: 10, sound: true },
  };
}

const num = (x: unknown, d: number, lo = -Infinity, hi = Infinity) => (typeof x === 'number' && Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d);
const hhmm = (x: unknown) => (typeof x === 'string' && /^\d{1,2}:\d{2}$/.test(x.trim()) ? x.trim() : '');

export function migrateWaqt(raw: any): WaqtFile {
  const d = defaultWaqtSettings();
  const s = raw?.settings ?? {};
  const p = s.place;
  const place =
    p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180
      ? { name: String(p.name ?? 'My place').slice(0, 80), country: String(p.country ?? ''), lat: p.lat, lng: p.lng }
      : null;
  const rules = Object.fromEntries(
    PRAYERS.map((id) => {
      const r = s.jamaat?.rules?.[id] ?? {};
      return [id, { mode: ['off', 'after', 'at'].includes(r.mode) ? r.mode : d.jamaat.rules[id].mode, after: num(r.after, d.jamaat.rules[id].after, 0, 180), at: hhmm(r.at) }];
    }),
  ) as Record<PrayerId, JamaatRule>;
  const settings: WaqtSettings = {
    place,
    method: METHODS.some((m) => m.id === s.method) ? s.method : d.method,
    madhab: s.madhab === 'hanafi' ? 'hanafi' : 'shafi',
    highLat: ['auto', 'middle', 'seventh', 'angle'].includes(s.highLat) ? s.highLat : 'auto',
    adjust: Object.fromEntries((['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'] as const).map((k) => [k, num(s.adjust?.[k], 0, -60, 60)])) as WaqtSettings['adjust'],
    manual: Object.fromEntries(PRAYERS.map((id) => [id, hhmm(s.manual?.[id])]).filter(([, v]) => v)),
    jamaat: {
      on: s.jamaat?.on === true,
      rules,
      jumuah: { on: s.jamaat?.jumuah?.on === true, at: hhmm(s.jamaat?.jumuah?.at) || d.jamaat.jumuah.at, minutes: num(s.jamaat?.jumuah?.minutes, 45, 10, 120) },
    },
    dial: { track: s.dial?.track !== false, blocks: s.dial?.blocks !== false, minutes: num(s.dial?.minutes, 15, 5, 60) },
    remind: {
      before: num(s.remind?.before, d.remind.before, 0, 60),
      atAdhan: s.remind?.atAdhan !== false,
      beforeJamaat: num(s.remind?.beforeJamaat, d.remind.beforeJamaat, 0, 60),
      sound: s.remind?.sound !== false,
    },
  };
  const prayed: WaqtFile['prayed'] = {};
  for (const [date, marks] of Object.entries(raw?.prayed ?? {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || typeof marks !== 'object' || !marks) continue;
    const m: Partial<Record<PrayerId, Marked>> = {};
    for (const id of PRAYERS) {
      const v = (marks as any)[id];
      if (v === 'prayed' || v === 'jamaat') m[id] = v;
    }
    if (Object.keys(m).length) prayed[date] = m;
  }
  return { version: 1, settings, prayed };
}
