import { describe, expect, it } from 'vitest';
import { firstMarked, kindOf, lines, minutesInWords, notes, onTimeShare, summarize, tally, timing, trend, usualWithin, type DayInput } from './analytics';
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

describe('waqt analytics: charts', () => {
  const D = 24 * H;
  const M = 60_000;
  /** n days from 2026-09-01, day i starting at i * D. */
  const run = (n: number) => Array.from({ length: n }, (_, i) => day(`2026-09-${String(i + 1).padStart(2, '0')}`, i * D));

  it('leaves out the days before the first mark, and counts from there', () => {
    const days = run(5);
    const file = { prayed: { '2026-09-04': { fajr: 'prayed' } }, detail: {} } as any;
    expect(firstMarked(file)).toBe('2026-09-04');
    const s = summarize(file, days, 6 * D);
    expect(s.grid[0].kinds.fajr).toBe('before');
    expect(s.counted).toBe(10); // only the 4th and 5th days
    expect(s.prayed).toBe(1);
    expect(summarize(file, days, 6 * D, { since: null }).counted).toBe(0);
    expect(summarize(file, days, 6 * D, { since: '2026-09-01' }).counted).toBe(25);
  });

  it('keeps when a prayer was marked, while its time lasted', () => {
    const days = run(1);
    const file = {
      prayed: { '2026-09-01': { fajr: 'prayed', dhuhr: 'jamaat', asr: 'prayed' } },
      detail: { '2026-09-01': { fajr: { at: 5 * H + 12 * M }, dhuhr: { at: 11 * H }, asr: { at: 19 * H } } },
    } as any;
    const s = summarize(file, days, D);
    expect(s.grid[0].after).toEqual({ fajr: 12 }); // Dhuhr marked an hour before its adhan, Asr after its end
  });

  it('tallies a day and gives the on-time share', () => {
    const s = summarize({ prayed: { '2026-09-01': { fajr: 'jamaat', dhuhr: 'prayed' } }, detail: { '2026-09-01': { dhuhr: { late: true } } } } as any, run(1), 16 * H);
    expect(tally(s.grid[0].kinds)).toEqual({ jamaat: 1, ontime: 0, late: 1, missed: 0, pending: 3, before: 0 });
    expect(onTimeShare(s)).toBe(0.5);
    expect(onTimeShare({ counted: 0, ontime: 0, jamaat: 0 })).toBeNull();
  });

  it('draws the trend in weeks ending today, from the first week you marked', () => {
    const days = run(20);
    const prayed: any = {};
    // Started on the 3rd: week one all on time, then Fajr and Isha only.
    for (let i = 3; i <= 20; i++) {
      const date = `2026-09-${String(i).padStart(2, '0')}`;
      prayed[date] = i <= 6 ? { fajr: 'prayed', dhuhr: 'prayed', asr: 'prayed', maghrib: 'prayed', isha: 'prayed' } : { fajr: 'prayed', isha: 'jamaat' };
    }
    const s = summarize({ prayed, detail: {} }, days, 20 * D);
    const t = trend(s.grid, 7);
    expect(t.map((p) => [p.from, p.to, p.days])).toEqual([
      ['2026-09-03', '2026-09-06', 4],
      ['2026-09-07', '2026-09-13', 7],
      ['2026-09-14', '2026-09-20', 7],
    ]);
    expect(t[0].share).toBe(1);
    expect(t[2]).toMatchObject({ counted: 35, good: 14, prayed: 14, share: 0.4 });
    expect(trend(summarize({ prayed: {}, detail: {} }, days, 20 * D).grid)).toEqual([]);
  });

  it('says when you usually mark a prayer, kindly rounded', () => {
    expect(usualWithin([3, 8])).toBeNull();
    expect(usualWithin([3, 8, 12, 14])).toBe(15);
    expect(usualWithin([1, 1, 2])).toBe(5);
    expect(usualWithin([50, 70, 80, 95])).toBe(90);
    expect(minutesInWords(20)).toBe('20 minutes');
    expect(minutesInWords(60)).toBe('an hour');
    expect(minutesInWords(90)).toBe('1 hour 30 minutes');
    expect(minutesInWords(120)).toBe('2 hours');

    const days = run(3);
    const prayed: any = {};
    const detail: any = {};
    days.forEach((d, i) => {
      prayed[d.date] = { fajr: 'prayed', maghrib: 'prayed' };
      detail[d.date] = { fajr: { at: d.prayers[0].at + (i + 1) * 10 * M }, maghrib: { late: true, at: d.prayers[3].at + 5 * M } };
    });
    const t = timing(summarize({ prayed, detail }, days, 3 * D));
    const fajr = t.byPrayer.find((p) => p.id === 'fajr')!;
    expect(fajr.marks.map((m) => m.after)).toEqual([10, 20, 30]);
    expect(fajr.median).toBe(20);
    expect(fajr.within).toBe(25);
    expect(t.byPrayer.find((p) => p.id === 'maghrib')!.marks).toEqual([]); // made up: not "on time"
    expect(t.within).toBe(25);
  });

  it('leads with what is going well', () => {
    const days = run(7);
    const prayed: any = {};
    for (const d of days) prayed[d.date] = { fajr: 'prayed', dhuhr: 'prayed', asr: 'prayed', maghrib: 'jamaat', isha: 'prayed' };
    const s = summarize({ prayed, detail: {} }, days, 7 * D);
    const n = notes(s, null, { jamaat: true, remindBefore: 0 });
    expect(n[0]).toEqual({ key: 'all', tone: 'bright', text: 'All 35 prayers on time or in jamaat.' });
    expect(n.some((x) => x.key === 'full')).toBe(false); // said already
    expect(n.find((x) => x.key === 'streak')!.text).toBe('Fajr on time 7 days in a row.');
    // A longer stretch's streak wins over the period's own.
    expect(notes(s, null, { jamaat: true, remindBefore: 0, streaks: { isha: 23 } }).find((x) => x.key === 'streak')!.text).toBe('Isha on time 23 days in a row.');
    expect(n.every((x) => x.tone === 'bright')).toBe(true);

    const few = summarize({ prayed: { '2026-09-01': { asr: 'prayed' } }, detail: { '2026-09-01': { asr: { late: true } } } } as any, run(2), 3 * D);
    const m = notes(few, null, { jamaat: false, remindBefore: 0 });
    expect(m[0]).toMatchObject({ key: 'some', text: 'One prayer marked. Each one counts.' });
    expect(m.map((x) => x.tone)).toEqual(['bright', 'tip', 'info']);
    expect(lines(few, null, { jamaat: false, remindBefore: 0 })).toEqual(m.map((x) => x.text));
  });

  it('names every prayer tied for steadiest', () => {
    const days = run(4);
    const prayed: any = {};
    for (const d of days) prayed[d.date] = { fajr: 'prayed', maghrib: 'prayed', isha: 'prayed', dhuhr: 'prayed' };
    delete prayed['2026-09-01'].dhuhr;
    const s = summarize({ prayed, detail: {} }, days, 5 * D);
    expect(notes(s, null, { jamaat: false, remindBefore: 0 }).find((x) => x.key === 'steady')!.text).toBe('Fajr, Maghrib and Isha are your steadiest: 100% prayed.');
  });

  it('notices more prayed than the period before', () => {
    const days = run(14);
    const prayed: any = {};
    days.forEach((d, i) => (prayed[d.date] = i < 7 ? { fajr: 'prayed' } : { fajr: 'prayed', dhuhr: 'prayed', asr: 'prayed' }));
    const file = { prayed, detail: {} };
    const before = summarize(file, days.slice(0, 7), 14 * D);
    const now = summarize(file, days.slice(7), 14 * D);
    expect(notes(now, before, { jamaat: false, remindBefore: 0, before: 'the week before' }).some((x) => x.text === 'More prayed than the week before. Well done.')).toBe(true);
  });
});

describe('waqt: qasr while marking', async () => {
  const { waqt, waqtFile } = await import('./waqt.svelte');
  const { migrateWaqt } = await import('./defaults');
  it('keeps how and when it was marked when qasr changes, and follows travelling by default', () => {
    waqtFile.value = migrateWaqt(null);
    waqtFile.value.settings.travel = { ...waqtFile.value.settings.travel, on: true, until: '' };
    expect(waqt.qasrOf('2026-10-19', 'dhuhr')).toBe(true);
    waqt.markAs('2026-10-19', 'dhuhr', 'late');
    expect(waqt.detailOf('2026-10-19', 'dhuhr')).toMatchObject({ late: true, qasr: true });
    const at = waqt.detailOf('2026-10-19', 'dhuhr').at;
    waqt.setQasr('2026-10-19', 'dhuhr', false);
    expect(waqt.detailOf('2026-10-19', 'dhuhr')).toEqual({ late: true, at });
    expect(waqt.howOf('2026-10-19', 'dhuhr')).toBe('late');
    expect(waqt.qasrOf('2026-10-19', 'fajr')).toBe(false);
  });
});
