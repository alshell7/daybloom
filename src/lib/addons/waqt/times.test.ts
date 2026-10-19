import { describe, expect, it } from 'vitest';
import { compass, currentPrayer, hijri, nextPrayer, parseHHMM, qibla, waqtDay } from './times';
import { defaultWaqtSettings } from './defaults';
import type { WaqtSettings } from './types';

const atUTC = (date: string, minutes: number) => Date.parse(`${date}T00:00:00Z`) + minutes * 60_000;
const hm = (ms: number, tz: string) => new Date(ms).toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' });
const mins = (s: string) => +s.slice(0, 2) * 60 + +s.slice(3);

const london = (o: Partial<WaqtSettings> = {}): WaqtSettings => ({
  ...defaultWaqtSettings(),
  place: { name: 'London', country: 'GB', lat: 51.5074, lng: -0.1278 },
  method: 'MuslimWorldLeague',
  madhab: 'shafi',
  ...o,
});

describe('waqt: salah times', () => {
  it('matches a published London timetable (MWL), within a few minutes', () => {
    const d = waqtDay(london(), '2026-10-20', atUTC)!;
    const ref: Record<string, string> = { fajr: '05:41', dhuhr: '12:45', asr: '15:26', maghrib: '17:57', isha: '19:42' };
    for (const p of d.prayers) expect(Math.abs(mins(hm(p.at, 'Europe/London')) - mins(ref[p.id]))).toBeLessThanOrEqual(3);
    expect(Math.abs(mins(hm(d.sunrise, 'Europe/London')) - mins('07:33'))).toBeLessThanOrEqual(1);
  });

  it('puts Hanafi Asr later than the standard Asr', () => {
    const std = waqtDay(london(), '2026-10-20', atUTC)!.prayers.find((p) => p.id === 'asr')!.at;
    const han = waqtDay(london({ madhab: 'hanafi' }), '2026-10-20', atUTC)!.prayers.find((p) => p.id === 'asr')!.at;
    expect(han - std).toBeGreaterThan(30 * 60_000);
  });

  it('applies your adjustments and your mosque’s fixed times', () => {
    const base = waqtDay(london(), '2026-10-20', atUTC)!;
    const s = london();
    s.adjust.maghrib = 3;
    s.manual.isha = '20:00';
    const d = waqtDay(s, '2026-10-20', atUTC)!;
    const get = (x: typeof d, id: string) => x.prayers.find((p) => p.id === id)!;
    expect(get(d, 'maghrib').at - get(base, 'maghrib').at).toBe(3 * 60_000);
    expect(get(d, 'isha').at).toBe(atUTC('2026-10-20', 20 * 60));
    expect(get(d, 'isha').manual).toBe(true);
  });

  it('gives each prayer its window', () => {
    const d = waqtDay(london(), '2026-10-20', atUTC)!;
    const [fajr, dhuhr, asr, maghrib, isha] = d.prayers;
    expect(fajr.end).toBe(d.sunrise);
    expect(dhuhr.end).toBe(asr.at);
    expect(asr.end).toBe(maghrib.at);
    expect(maghrib.end).toBe(isha.at);
    const tomorrow = waqtDay(london(), '2026-10-21', atUTC)!;
    expect(isha.end).toBe(tomorrow.prayers[0].at);
  });

  it('works out jamaat, and Jumu’ah on Fridays', () => {
    const s = london();
    s.jamaat.on = true;
    s.jamaat.rules.asr = { mode: 'after', after: 15, at: '' };
    s.jamaat.rules.isha = { mode: 'at', after: 0, at: '20:30' };
    s.jamaat.jumuah = { on: true, at: '13:15', minutes: 45 };
    const tue = waqtDay(s, '2026-10-20', atUTC)!;
    const asr = tue.prayers.find((p) => p.id === 'asr')!;
    expect(asr.jamaat! - asr.at).toBe(15 * 60_000);
    expect(tue.prayers.find((p) => p.id === 'isha')!.jamaat).toBe(atUTC('2026-10-20', 20 * 60 + 30));
    expect(tue.prayers.find((p) => p.id === 'dhuhr')!.name).toBe('Dhuhr');
    const fri = waqtDay(s, '2026-10-23', atUTC)!.prayers.find((p) => p.id === 'dhuhr')!;
    expect(fri.name).toBe('Jumu’ah');
    expect(fri.jamaat).toBe(atUTC('2026-10-23', 13 * 60 + 15));
  });

  it('knows the current prayer and the next', () => {
    const days = [waqtDay(london(), '2026-10-20', atUTC)!, waqtDay(london(), '2026-10-21', atUTC)!];
    const asr = days[0].prayers.find((p) => p.id === 'asr')!;
    expect(currentPrayer(days, asr.at + 60_000)?.id).toBe('asr');
    expect(nextPrayer(days, asr.at + 60_000)?.id).toBe('maghrib');
    // Between sunrise and Dhuhr no prayer's time is running.
    expect(currentPrayer(days, days[0].sunrise + 60 * 60_000)).toBeNull();
  });

  it('copes with summer nights far north', () => {
    const s = london({ place: { name: 'Oslo', country: 'NO', lat: 59.9139, lng: 10.7522 } });
    const d = waqtDay(s, '2026-06-21', atUTC)!;
    for (const p of d.prayers) expect(Number.isFinite(p.at)).toBe(true);
    expect(d.prayers[4].at).toBeGreaterThan(d.prayers[3].at);
  });

  it('has nothing to show until there is a place', () => {
    expect(waqtDay(defaultWaqtSettings(), '2026-10-20', atUTC)).toBeNull();
  });

  it('points to the Qibla and names the Hijri date', () => {
    expect(qibla(51.5074, -0.1278)).toBeCloseTo(119, 0);
    expect(compass(119)).toBe('SE');
    expect(hijri(Date.UTC(2026, 9, 20, 12))).toMatchObject({ day: 9, month: 5, name: 'Jumada al-Ula', year: 1448 });
    expect(parseHHMM('7:05')).toBe(425);
    expect(parseHHMM('25:00')).toBeNull();
  });
});
