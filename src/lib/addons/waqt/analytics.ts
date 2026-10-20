// Waqt analytics: how the prayers went over a week or a month — in jamaat, on time, made up
// late, qasr while travelling — per prayer and in all, with streaks and a few kind words.
// Pure (the days' times come in), so it tests fast. Never counts what hasn't happened yet.

import type { ISODate } from '../../engine/types';
import { PRAYER_NAME, PRAYERS, type MarkDetail, type Marked, type PrayerId, type WaqtFile } from './types';

/** jamaat / ontime / late: marked. missed: its time ended unmarked. open: its time is now. ahead: later. */
export type Kind = 'jamaat' | 'ontime' | 'late' | 'missed' | 'open' | 'ahead';

export interface DayInput {
  date: ISODate;
  prayers: { id: PrayerId; at: number; end: number }[];
}

export function kindOf(m: Marked | undefined, d: MarkDetail | undefined, p: { at: number; end: number }, now: number): Kind {
  if (m === 'jamaat') return 'jamaat';
  if (m === 'prayed') return d?.late ? 'late' : 'ontime';
  if (now < p.at) return 'ahead';
  if (now < p.end) return 'open';
  return 'missed';
}

export interface PrayerStat {
  id: PrayerId;
  /** Prayers whose time has come (or that are marked). */
  counted: number;
  prayed: number;
  jamaat: number;
  ontime: number;
  late: number;
  qasr: number;
  missed: number;
  /** Days in a row prayed on time or in jamaat, up to the latest one that counts. */
  streak: number;
  /** prayed / counted, 0..1. */
  rate: number;
}

export interface Summary {
  days: number;
  counted: number;
  prayed: number;
  jamaat: number;
  ontime: number;
  late: number;
  qasr: number;
  missed: number;
  /** Days with all five prayed. */
  fullDays: number;
  byPrayer: PrayerStat[];
  /** Every day's prayers, oldest first. */
  grid: { date: ISODate; kinds: Record<PrayerId, Kind>; qasr: Partial<Record<PrayerId, boolean>> }[];
}

export function summarize(file: Pick<WaqtFile, 'prayed' | 'detail'>, days: DayInput[], now: number): Summary {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const byPrayer = Object.fromEntries(PRAYERS.map((id) => [id, { id, counted: 0, prayed: 0, jamaat: 0, ontime: 0, late: 0, qasr: 0, missed: 0, streak: 0, rate: 0 }])) as Record<PrayerId, PrayerStat>;
  const grid: Summary['grid'] = [];
  let fullDays = 0;
  for (const day of sorted) {
    const kinds = {} as Record<PrayerId, Kind>;
    const qasr: Partial<Record<PrayerId, boolean>> = {};
    let prayedToday = 0;
    for (const id of PRAYERS) {
      const slot = day.prayers.find((p) => p.id === id);
      const m = file.prayed[day.date]?.[id];
      const d = file.detail?.[day.date]?.[id];
      const k = slot ? kindOf(m, d, slot, now) : m ? kindOf(m, d, { at: 0, end: 0 }, now) : 'ahead';
      kinds[id] = k;
      if (d?.qasr && m) qasr[id] = true;
      const s = byPrayer[id];
      if (k === 'ahead' || k === 'open') continue;
      s.counted++;
      if (k === 'missed') s.missed++;
      else {
        s.prayed++;
        prayedToday++;
        s[k]++;
        if (qasr[id]) s.qasr++;
      }
    }
    if (prayedToday === PRAYERS.length) fullDays++;
    grid.push({ date: day.date, kinds, qasr });
  }
  // Streaks: count back from the newest day that counts for that prayer.
  for (const id of PRAYERS) {
    let n = 0;
    for (let i = grid.length - 1; i >= 0; i--) {
      const k = grid[i].kinds[id];
      if (k === 'ahead' || k === 'open') continue;
      if (k === 'ontime' || k === 'jamaat') n++;
      else break;
    }
    byPrayer[id].streak = n;
    byPrayer[id].rate = byPrayer[id].counted ? byPrayer[id].prayed / byPrayer[id].counted : 0;
  }
  const list = PRAYERS.map((id) => byPrayer[id]);
  const sum = (k: keyof PrayerStat) => list.reduce((s, p) => s + (p[k] as number), 0);
  return {
    days: sorted.length,
    counted: sum('counted'),
    prayed: sum('prayed'),
    jamaat: sum('jamaat'),
    ontime: sum('ontime'),
    late: sum('late'),
    qasr: sum('qasr'),
    missed: sum('missed'),
    fullDays,
    byPrayer: list,
    grid,
  };
}

/** A few kind, specific lines about a period (never a scolding). */
export function lines(s: Summary, prev: Summary | null, opts: { jamaat: boolean; remindBefore: number }): string[] {
  const out: string[] = [];
  if (!s.counted) return ['Mark a prayer after you pray it, and your picture starts here.'];
  if (s.fullDays) out.push(s.fullDays === 1 ? 'One day with all five prayers.' : `${s.fullDays} days with all five prayers.`);
  if (opts.jamaat && s.jamaat) {
    const up = prev && prev.jamaat > 0 && s.jamaat > prev.jamaat ? `, up from ${prev.jamaat}` : '';
    out.push(`${s.jamaat} in jamaat${up}.`);
  }
  const streak = [...s.byPrayer].sort((a, b) => b.streak - a.streak)[0];
  if (streak && streak.streak >= 3) out.push(`${PRAYER_NAME[streak.id]} on time ${streak.streak} days in a row.`);
  const ranked = s.byPrayer.filter((p) => p.counted >= 2).sort((a, b) => b.rate - a.rate);
  const best = ranked[0];
  const hard = ranked[ranked.length - 1];
  if (best && best.rate >= 0.6 && ranked.length > 1) out.push(`${PRAYER_NAME[best.id]} is your steadiest: ${Math.round(best.rate * 100)}% prayed.`);
  if (hard && best && hard.id !== best.id && hard.rate < 0.75) {
    out.push(opts.remindBefore > 0 ? `${PRAYER_NAME[hard.id]} is the hardest to catch. The reminder ${opts.remindBefore} minutes before is there for it.` : `${PRAYER_NAME[hard.id]} is the hardest to catch. A reminder before its adhan might help.`);
  }
  if (s.late) out.push(s.late === 1 ? 'One prayer made up after its time — it still counts.' : `${s.late} prayers made up after their time — they still count.`);
  if (s.qasr) out.push(`${s.qasr} shortened while travelling.`);
  if (prev && prev.counted && s.counted) {
    const now = s.prayed / s.counted;
    const before = prev.prayed / prev.counted;
    if (now - before >= 0.08) out.push('More prayed than the period before. Well done.');
  }
  return out.slice(0, 5);
}
