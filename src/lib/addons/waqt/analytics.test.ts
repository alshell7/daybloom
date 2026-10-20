import { describe, expect, it } from 'vitest';
import { kindOf, lines, summarize, type DayInput } from './analytics';
import { migrateWaqt } from './defaults';
import { PRAYERS } from './types';

const H = 3_600_000;
/** A day whose five prayers start at 05, 12, 15, 18, 20 h (ms from an epoch "day" start). */
function day(date: string, base: number): DayInput {
  const at = [5, 12, 15, 18, 20];
  const end = [6, 15, 18, 20, 29];
  return { date, prayers: PRAYERS.map((id, i) => ({ id, at: base + at[i] * H, end: base + end[i] * H })) };
}

describe('waqt analytics', () => {
  it('names how each prayer went, and never counts what is still ahead', () => {
    const p = { at: 10, end: 20 };
    expect(kindOf('jamaat', undefined, p, 0)).toBe('jamaat');
    expect(kindOf('prayed', { late: true }, p, 0)).toBe('late');
    expect(kindOf('prayed', undefined, p, 0)).toBe('ontime');
    expect(kindOf(undefined, undefined, p, 5)).toBe('ahead');
    expect(kindOf(undefined, undefined, p, 15)).toBe('open');
    expect(kindOf(undefined, undefined, p, 25)).toBe('missed');
  });

  it('sums a period: jamaat, on time, late, qasr, missed, full days and streaks', () => {
    const D = 24 * H;
    const days = [day('2026-10-18', 0), day('2026-10-19', D), day('2026-10-20', 2 * D)];
    const file = {
      prayed: {
        '2026-10-18': { fajr: 'prayed', dhuhr: 'jamaat', asr: 'prayed', maghrib: 'prayed', isha: 'prayed' },
        '2026-10-19': { fajr: 'prayed', dhuhr: 'prayed', maghrib: 'jamaat' },
        '2026-10-20': { fajr: 'prayed' },
      },
      detail: { '2026-10-19': { dhuhr: { late: true, qasr: true } } },
    } as const;
    // "Now" is 13:00 on the last day: Dhuhr is open, the rest of that day ahead.
    const s = summarize(file as any, days, 2 * D + 13 * H);
    expect(s.counted).toBe(11);
    expect(s.prayed).toBe(9);
    expect(s.jamaat).toBe(2);
    expect(s.late).toBe(1);
    expect(s.ontime).toBe(6);
    expect(s.qasr).toBe(1);
    expect(s.missed).toBe(2);
    expect(s.fullDays).toBe(1);
    const fajr = s.byPrayer.find((p) => p.id === 'fajr')!;
    expect(fajr).toMatchObject({ counted: 3, prayed: 3, streak: 3, rate: 1 });
    const dhuhr = s.byPrayer.find((p) => p.id === 'dhuhr')!;
    expect(dhuhr.streak).toBe(0); // late breaks the on-time run; today's is still open
    expect(s.grid[2].kinds.dhuhr).toBe('open');
    expect(s.grid[1].qasr.dhuhr).toBe(true);
  });

  it('speaks kindly and specifically', () => {
    const D = 24 * H;
    const days = Array.from({ length: 4 }, (_, i) => day(`2026-10-1${i}`, i * D));
    const prayed: any = {};
    for (const d of days) prayed[d.date] = { fajr: 'prayed', dhuhr: 'jamaat', maghrib: 'prayed', isha: 'prayed' };
    const s = summarize({ prayed, detail: {} }, days, 5 * D);
    const out = lines(s, null, { jamaat: true, remindBefore: 10 });
    expect(out).toContain('4 in jamaat.');
    expect(out.some((l) => l.startsWith('Fajr on time 4 days in a row'))).toBe(true);
    expect(out.some((l) => l.startsWith('Asr is the hardest to catch'))).toBe(true);
    expect(lines(summarize({ prayed: {}, detail: {} }, [], 0), null, { jamaat: false, remindBefore: 0 })).toEqual(['Mark a prayer after you pray it, and your picture starts here.']);
  });

  it('keeps details only where there is a mark, and qasr only where it applies', () => {
    const f = migrateWaqt({
      prayed: { '2026-10-20': { fajr: 'prayed', dhuhr: 'jamaat' } },
      detail: { '2026-10-20': { fajr: { qasr: true, late: true }, dhuhr: { late: true, qasr: true }, asr: { late: true } } },
      settings: { travel: { on: true, until: '2026-10-25' } },
    });
    expect(f.detail).toEqual({ '2026-10-20': { fajr: { late: true }, dhuhr: { qasr: true } } });
    expect(f.settings.travel).toEqual({ on: true, until: '2026-10-25' });
    expect(migrateWaqt(null).detail).toEqual({});
  });
});
