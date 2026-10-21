// Timeline views, the Gantt chart's geometry. Pure. The x axis is the time of day in wall-clock
// minutes (0–1440), so a 3-day or week chart lines its days up hour over hour. A day chart has
// one row per kind of block (category); a longer one has one row per day. Inside a row, blocks
// that overlap step into lanes (assignLanes), the way the dial splits its bezel.

import { assignLanes } from '../../engine/blocks';
import { addDays, atMinutes, clamp, minutesOfDay, startOfDayMs } from '../../engine/time';
import type { Block, CategoryId, ISODate } from '../../engine/types';

export const DAY_MIN = 1440;
/** A lane's height, and the room above and below a row's lanes (px). */
export const LANE = 34;
export const ROW_PAD = 7;
/** Zoom limits, in px per hour. */
export const MIN_PXH = 22;
export const MAX_PXH = 240;
export const STEP = 5;

export interface Row {
  id: string;
  date: ISODate;
  /** Set on a day chart (rows by kind). */
  category: CategoryId | null;
  top: number;
  height: number;
  lanes: number;
  /** No blocks in it (its label steps back). */
  empty: boolean;
}

export interface Bar {
  /** Unique per row: one block can cross midnight into the next day's row. */
  id: string;
  key: string;
  block: Block;
  row: string;
  date: ISODate;
  lane: number;
  top: number;
  /** Wall-clock minutes on the row's day, clipped to it. */
  s: number;
  e: number;
  /** Cut at midnight on this side. */
  clipS: boolean;
  clipE: boolean;
}

/** Wall-clock minutes of `ms` on `date`: before the day → 0, after it → 1440. */
export function wallMin(ms: number, date: ISODate): number {
  if (ms <= startOfDayMs(date)) return 0;
  if (ms >= startOfDayMs(addDays(date, 1))) return DAY_MIN;
  return minutesOfDay(ms);
}

/** Back from wall-clock minutes on a date to an instant (DST-correct). */
export function msAt(date: ISODate, min: number): number {
  return atMinutes(date, Math.round(min));
}

/**
 * Rows and bars. `byCategory`: one day (`dates[0]`) in a row per kind, every kind shown so a
 * block can be painted straight into its row. Otherwise one row per date.
 */
export function layoutGantt(blocks: Block[], dates: ISODate[], byCategory: boolean, categories: CategoryId[]): { rows: Row[]; bars: Bar[]; height: number } {
  const timed = blocks.filter((b) => !b.floating).sort((a, b) => a.startMs - b.startMs || b.endMs - a.endMs);
  const groups: { id: string; date: ISODate; category: CategoryId | null; blocks: Block[] }[] = [];
  if (byCategory) {
    const date = dates[0];
    const s = startOfDayMs(date);
    const e = startOfDayMs(addDays(date, 1));
    const inDay = timed.filter((b) => b.startMs < e && b.endMs > s);
    for (const c of categories) groups.push({ id: `cat:${c}`, date, category: c, blocks: inDay.filter((b) => b.category === c) });
  } else {
    for (const date of dates) {
      const s = startOfDayMs(date);
      const e = startOfDayMs(addDays(date, 1));
      groups.push({ id: `day:${date}`, date, category: null, blocks: timed.filter((b) => b.startMs < e && b.endMs > s) });
    }
  }
  const rows: Row[] = [];
  const bars: Bar[] = [];
  let top = 0;
  for (const g of groups) {
    const lanes = assignLanes(g.blocks);
    const n = Math.max(1, ...[...lanes.values()].map((l) => l + 1));
    const height = n * LANE + ROW_PAD * 2;
    rows.push({ id: g.id, date: g.date, category: g.category, top, height, lanes: n, empty: g.blocks.length === 0 });
    for (const b of g.blocks) {
      const lane = lanes.get(b.key) ?? 0;
      const s = wallMin(b.startMs, g.date);
      const e = wallMin(b.endMs, g.date);
      bars.push({
        id: `${b.key}|${g.date}`,
        key: b.key,
        block: b,
        row: g.id,
        date: g.date,
        lane,
        top: top + ROW_PAD + lane * LANE,
        s,
        e: Math.max(e, s + 1),
        clipS: b.startMs < startOfDayMs(g.date),
        clipE: b.endMs > startOfDayMs(addDays(g.date, 1)),
      });
    }
    top += height;
  }
  return { rows, bars, height: top };
}

export const snapMin = (m: number, step = STEP) => Math.round(m / step) * step;

export type Grip = 'move' | 'start' | 'end';

/**
 * A bar dragged by `d` minutes: moved whole, or by one end. Snaps to 5 minutes, stays inside
 * the day, and never shrinks below one step.
 */
export function dragSpan(grip: Grip, s: number, e: number, d: number, step = STEP): { s: number; e: number } {
  if (grip === 'move') {
    const len = e - s;
    const ns = clamp(snapMin(s + d, step), 0, Math.max(0, DAY_MIN - len));
    return { s: ns, e: ns + len };
  }
  if (grip === 'start') return { s: clamp(snapMin(s + d, step), 0, e - step), e };
  return { s, e: clamp(snapMin(e + d, step), s + step, DAY_MIN) };
}

/** A new block swept from `a` to `b` (minutes), or null while it is still shorter than a step. */
export function sweepSpan(a: number, b: number, step = STEP): { s: number; e: number } | null {
  const s = clamp(snapMin(Math.min(a, b), step), 0, DAY_MIN);
  const e = clamp(snapMin(Math.max(a, b), step), 0, DAY_MIN);
  return e - s >= step ? { s, e } : null;
}

export const clampPxh = (p: number) => clamp(p, MIN_PXH, MAX_PXH);

/** The scale that shows the waking day (wake → sleep) across `width` px. */
export function fitPxh(width: number, wake: number, sleep: number): number {
  const hours = ((sleep > wake ? sleep - wake : sleep + DAY_MIN - wake) || DAY_MIN) / 60;
  return clampPxh(Math.round((width / Math.max(4, hours)) * 10) / 10);
}

/** The scroll offset that keeps the minute under `viewX` (px into the viewport) still across a zoom. */
export function zoomScroll(scrollLeft: number, viewX: number, labelW: number, from: number, to: number): number {
  const min = ((scrollLeft + viewX - labelW) / from) * 60;
  return Math.max(0, (min / 60) * to + labelW - viewX);
}

/** Hours between labels in the header at this scale. */
export function hourStep(pxh: number): number {
  return pxh >= 44 ? 1 : pxh >= 26 ? 2 : 3;
}

export interface BarLabel {
  /** Words inside the bar, just its icon, or nothing. */
  fit: 'full' | 'icon' | 'none';
  /** Room for the title beside a short bar (px), 0 for none. */
  out: number;
}

/** How each bar shows its words at this scale: inside when it fits, else beside it if the lane has room. */
export function barLabels(bars: Bar[], pxm: number): Map<string, BarLabel> {
  const out = new Map<string, BarLabel>();
  const lanes = new Map<string, Bar[]>();
  for (const b of bars) {
    const k = `${b.row}#${b.lane}`;
    (lanes.get(k) ?? lanes.set(k, []).get(k)!).push(b);
  }
  for (const list of lanes.values()) {
    list.sort((a, b) => a.s - b.s);
    list.forEach((b, i) => {
      const w = (b.e - b.s) * pxm;
      const fit = w >= 66 ? 'full' : w >= 26 ? 'icon' : 'none';
      const next = list[i + 1]?.s ?? DAY_MIN;
      const room = (next - b.e) * pxm - 10;
      out.set(b.id, { fit, out: fit !== 'full' && room >= 64 ? Math.min(room, 200) : 0 });
    });
  }
  return out;
}

/** Free stretches (≥ `minLen` minutes) inside the waking window of `date`, in wall-clock minutes. */
export function freeBands(blocks: Block[], date: ISODate, wake: number, sleep: number, minLen = 15): { s: number; e: number }[] {
  const lo = wake;
  const hi = sleep > wake ? sleep : DAY_MIN;
  const busy = blocks
    .filter((b) => !b.floating)
    .map((b) => ({ s: wallMin(b.startMs, date), e: wallMin(b.endMs, date) }))
    .filter((x) => x.e > x.s)
    .sort((a, b) => a.s - b.s);
  const gaps: { s: number; e: number }[] = [];
  let cursor = lo;
  for (const x of busy) {
    if (x.s - cursor >= minLen && x.s > lo) gaps.push({ s: cursor, e: Math.min(x.s, hi) });
    cursor = Math.max(cursor, x.e);
    if (cursor >= hi) break;
  }
  if (hi - cursor >= minLen) gaps.push({ s: cursor, e: hi });
  return gaps.filter((g) => g.e - g.s >= minLen);
}

/** The row under a y offset (px into the body), clamped to the first and last rows. */
export function rowAt(rows: Row[], y: number): Row | null {
  if (!rows.length) return null;
  return rows.find((r) => y >= r.top && y < r.top + r.height) ?? (y < 0 ? rows[0] : rows[rows.length - 1]);
}
