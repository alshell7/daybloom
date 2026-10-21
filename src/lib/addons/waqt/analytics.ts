// Waqt analytics: how the prayers went over a week or a month — in jamaat, on time, made up
// late, qasr while travelling — per prayer and in all, with streaks, a week-by-week trend,
// when each prayer was marked against its adhan, and a few kind words (bright spots first).
// Pure (the days' times come in), so it tests fast. Never counts what hasn't happened yet, nor
// the days before you first marked a prayer.

import type { ISODate } from '../../engine/types';
import { PRAYER_NAME, PRAYERS, type MarkDetail, type Marked, type PrayerId, type WaqtFile } from './types';

const MIN = 60_000;

/**
 * jamaat / ontime / late: marked. missed: its time ended unmarked. open: its time is now.
 * ahead: later. before: a day before you first marked a prayer (not counted).
 */
export type Kind = 'jamaat' | 'ontime' | 'late' | 'missed' | 'open' | 'ahead' | 'before';

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

/** The first day with a marked prayer, or null when nothing is marked yet. */
export function firstMarked(file: Pick<WaqtFile, 'prayed'>): ISODate | null {
  let first: ISODate | null = null;
  for (const [date, day] of Object.entries(file.prayed ?? {})) {
    if (day && Object.keys(day).length && (!first || date < first)) first = date;
  }
  return first;
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

export interface GridDay {
  date: ISODate;
  kinds: Record<PrayerId, Kind>;
  qasr: Partial<Record<PrayerId, boolean>>;
  /** Minutes after the adhan it was marked, when that was while its time lasted. */
  after: Partial<Record<PrayerId, number>>;
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
  grid: GridDay[];
}

/** `since`: days before it don't count (default: the first day you marked a prayer). */
export function summarize(file: Pick<WaqtFile, 'prayed' | 'detail'>, days: DayInput[], now: number, opts: { since?: ISODate | null } = {}): Summary {
  const since = opts.since === undefined ? firstMarked(file) : opts.since;
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const byPrayer = Object.fromEntries(PRAYERS.map((id) => [id, { id, counted: 0, prayed: 0, jamaat: 0, ontime: 0, late: 0, qasr: 0, missed: 0, streak: 0, rate: 0 }])) as Record<PrayerId, PrayerStat>;
  const grid: GridDay[] = [];
  let fullDays = 0;
  for (const day of sorted) {
    const kinds = {} as Record<PrayerId, Kind>;
    const qasr: Partial<Record<PrayerId, boolean>> = {};
    const after: Partial<Record<PrayerId, number>> = {};
    const early = !since || day.date < since;
    let prayedToday = 0;
    for (const id of PRAYERS) {
      const slot = day.prayers.find((p) => p.id === id);
      const m = file.prayed[day.date]?.[id];
      const d = file.detail?.[day.date]?.[id];
      const k: Kind = early ? 'before' : slot ? kindOf(m, d, slot, now) : m ? kindOf(m, d, { at: 0, end: 0 }, now) : 'ahead';
      kinds[id] = k;
      if (d?.qasr && m && !early) qasr[id] = true;
      if (m && slot && d?.at != null && d.at >= slot.at - 30 * MIN && d.at <= slot.end) after[id] = Math.max(0, Math.round((d.at - slot.at) / MIN));
      const s = byPrayer[id];
      if (k === 'ahead' || k === 'open' || k === 'before') continue;
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
    grid.push({ date: day.date, kinds, qasr, after });
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

/** One day's prayers by how they went. pending: its time is now or still ahead. */
export interface DayTally {
  jamaat: number;
  ontime: number;
  late: number;
  missed: number;
  pending: number;
  before: number;
}
export function tally(kinds: Record<PrayerId, Kind>): DayTally {
  const t: DayTally = { jamaat: 0, ontime: 0, late: 0, missed: 0, pending: 0, before: 0 };
  for (const id of PRAYERS) {
    const k = kinds[id];
    if (k === 'open' || k === 'ahead') t.pending++;
    else t[k]++;
  }
  return t;
}

/** On time or in jamaat, as a share of what counted (0..1); null when nothing counted. */
export function onTimeShare(x: { counted: number; ontime: number; jamaat: number }): number | null {
  return x.counted ? (x.ontime + x.jamaat) / x.counted : null;
}

export interface TrendPoint {
  from: ISODate;
  to: ISODate;
  /** Days in the span that count (the oldest span can be shorter). */
  days: number;
  counted: number;
  prayed: number;
  /** On time or in jamaat. */
  good: number;
  /** good / counted, 0..1. */
  share: number;
}

/** The grid in spans of `size` days ending on its last day, oldest first. Days before you started are left out. */
export function trend(grid: GridDay[], size = 7): TrendPoint[] {
  const start = grid.findIndex((d) => PRAYERS.some((id) => d.kinds[id] !== 'before'));
  if (start < 0) return [];
  const days = grid.slice(start);
  const out: TrendPoint[] = [];
  for (let end = days.length; end > 0; end -= size) {
    const span = days.slice(Math.max(0, end - size), end);
    const p = { counted: 0, prayed: 0, good: 0 };
    for (const d of span) {
      const t = tally(d.kinds);
      p.good += t.jamaat + t.ontime;
      p.prayed += t.jamaat + t.ontime + t.late;
      p.counted += t.jamaat + t.ontime + t.late + t.missed;
    }
    if (!p.counted) continue;
    out.unshift({ from: span[0].date, to: span[span.length - 1].date, days: span.length, ...p, share: p.good / p.counted });
  }
  return out;
}

export interface PrayerTiming {
  id: PrayerId;
  /** Marked on time or in jamaat while its time lasted: minutes after the adhan. */
  marks: { date: ISODate; after: number }[];
  median: number | null;
  /** Most marks (three in four) fall within this many minutes; null with fewer than three. */
  within: number | null;
}

/** When each prayer was marked, against its adhan. */
export function timing(s: Pick<Summary, 'grid'>): { byPrayer: PrayerTiming[]; all: number[]; within: number | null } {
  const all: number[] = [];
  const byPrayer = PRAYERS.map((id): PrayerTiming => {
    const marks: PrayerTiming['marks'] = [];
    for (const d of s.grid) {
      const k = d.kinds[id];
      const a = d.after[id];
      if (a != null && (k === 'ontime' || k === 'jamaat')) marks.push({ date: d.date, after: a });
    }
    const mins = marks.map((m) => m.after);
    all.push(...mins);
    return { id, marks, median: quantile(mins, 0.5), within: usualWithin(mins) };
  });
  return { byPrayer, all, within: usualWithin(all) };
}

function quantile(xs: number[], q: number): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const i = (s.length - 1) * q;
  const lo = Math.floor(i);
  return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo);
}

/** "Usually within N minutes": three in four marks, rounded up to 5 minutes (15 past an hour). */
export function usualWithin(mins: number[]): number | null {
  if (mins.length < 3) return null;
  const q = quantile(mins, 0.75) ?? 0;
  const step = q > 60 ? 15 : 5;
  return Math.max(5, Math.ceil(q / step) * step);
}

/** 20 → "20 minutes", 60 → "an hour", 90 → "1 hour 30 minutes". */
export function minutesInWords(m: number): string {
  if (m < 60) return `${m} minutes`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  const hours = h === 1 ? (r ? '1 hour' : 'an hour') : `${h} hours`;
  return r ? `${hours} ${r} minutes` : hours;
}

export type NoteTone = 'bright' | 'tip' | 'info';
export interface Note {
  key: string;
  text: string;
  tone: NoteTone;
}

export interface NoteOpts {
  jamaat: boolean;
  remindBefore: number;
  /** Streaks over a longer stretch than the period (so a 7-day view can say "23 days"). */
  streaks?: Partial<Record<PrayerId, number>>;
  /** What the period before is called: "the week before". */
  before?: string;
}

/** Kind, specific notes about a period: what's going well first, then a tip, then the rest. */
export function notes(s: Summary, prev: Summary | null, opts: NoteOpts): Note[] {
  if (!s.counted) return [{ key: 'start', text: 'Mark a prayer after you pray it, and your picture starts here.', tone: 'info' }];
  const bright: Note[] = [];
  const good = s.ontime + s.jamaat;
  if (s.counted >= 5 && s.prayed === s.counted) {
    bright.push({ key: 'all', tone: 'bright', text: good === s.counted ? `All ${s.counted} prayers on time or in jamaat.` : `All ${s.counted} prayers prayed.` });
  }
  const streakOf = (id: PrayerId) => opts.streaks?.[id] ?? s.byPrayer.find((p) => p.id === id)?.streak ?? 0;
  const streak = [...s.byPrayer].sort((a, b) => streakOf(b.id) - streakOf(a.id))[0];
  if (streak && streakOf(streak.id) >= 3) bright.push({ key: 'streak', tone: 'bright', text: `${PRAYER_NAME[streak.id]} on time ${streakOf(streak.id)} days in a row.` });
  if (prev && prev.counted && s.counted && s.prayed / s.counted - prev.prayed / prev.counted >= 0.08) {
    bright.push({ key: 'more', tone: 'bright', text: `More prayed than ${opts.before ?? 'the period before'}. Well done.` });
  }
  if (s.fullDays && !bright.some((n) => n.key === 'all')) bright.push({ key: 'full', tone: 'bright', text: s.fullDays === 1 ? 'One day with all five prayers.' : `${s.fullDays} days with all five prayers.` });
  if (opts.jamaat && s.jamaat) {
    const up = prev && prev.jamaat > 0 && s.jamaat > prev.jamaat ? `, up from ${prev.jamaat}` : '';
    bright.push({ key: 'jamaat', tone: 'bright', text: `${s.jamaat} in jamaat${up}.` });
  }
  const ranked = s.byPrayer.filter((p) => p.counted >= 2).sort((a, b) => b.rate - a.rate);
  const best = ranked[0];
  const hard = ranked[ranked.length - 1];
  // Every prayer tied at the top is named: "Maghrib and Isha are your steadiest".
  const top = ranked.filter((p) => best && p.rate === best.rate);
  if (best && best.rate >= 0.6 && ranked.length > top.length) {
    const names = top.map((p) => PRAYER_NAME[p.id]);
    const who = names.length === 1 ? `${names[0]} is` : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} are`;
    bright.push({ key: 'steady', tone: 'bright', text: `${who} your steadiest: ${Math.round(best.rate * 100)}% prayed.` });
  }
  if (!bright.length && s.prayed) bright.push({ key: 'some', tone: 'bright', text: s.prayed === 1 ? 'One prayer marked. Each one counts.' : `${s.prayed} prayers marked. Each one counts.` });

  const rest: Note[] = [];
  if (hard && best && hard.id !== best.id && hard.rate < 0.75) {
    rest.push({
      key: 'hard',
      tone: 'tip',
      text: opts.remindBefore > 0 ? `${PRAYER_NAME[hard.id]} is the hardest to catch. The reminder ${opts.remindBefore} minutes before is there for it.` : `${PRAYER_NAME[hard.id]} is the hardest to catch. A reminder before its adhan might help.`,
    });
  }
  if (s.late) rest.push({ key: 'late', tone: 'info', text: s.late === 1 ? 'One prayer made up after its time — it still counts.' : `${s.late} prayers made up after their time — they still count.` });
  if (s.qasr) rest.push({ key: 'qasr', tone: 'info', text: `${s.qasr} shortened while travelling.` });
  return [...bright, ...rest];
}

/** A few kind, specific lines about a period (never a scolding). */
export function lines(s: Summary, prev: Summary | null, opts: NoteOpts): string[] {
  return notes(s, prev, opts)
    .map((n) => n.text)
    .slice(0, 5);
}
