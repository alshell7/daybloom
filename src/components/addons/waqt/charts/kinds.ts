// Waqt charts, shared: the words for how a prayer went, the order they stack in, date labels,
// and the arrow-key step for charts you move through with the keyboard (one tab stop each).
import type { Kind } from '../../../../lib/addons/waqt/analytics';

export const KIND_WORD: Record<Kind, string> = {
  jamaat: 'In jamaat',
  ontime: 'On time',
  late: 'Made up',
  missed: 'Not marked',
  open: 'Its time is now',
  ahead: 'Still ahead',
  before: 'Before you started',
};

/** Strongest first: how a day's bricks stack from the bottom. */
export const STACK: Kind[] = ['jamaat', 'ontime', 'late', 'missed', 'open', 'ahead', 'before'];

const at = (d: string) => new Date(`${d}T12:00:00`);
/** "Tue 14 Oct" */
export const dayLabel = (d: string) => at(d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
/** "Tue" */
export const weekdayLabel = (d: string) => at(d).toLocaleDateString(undefined, { weekday: 'short' });
/** "14 Oct" */
export const shortDate = (d: string) => at(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
/** "14–20 Oct", or "28 Sep – 4 Oct" across a month. */
export function spanLabel(from: string, to: string): string {
  if (from === to) return shortDate(from);
  const a = at(from);
  const b = at(to);
  if (a.getMonth() === b.getMonth()) return `${a.getDate()}–${shortDate(to)}`;
  return `${shortDate(from)} – ${shortDate(to)}`;
}

/** Where an arrow key (or Home/End) moves in n items laid out in rows of `cols`; null for other keys. */
export function step(key: string, i: number, n: number, cols = n): number | null {
  const col = i % cols;
  const rowStart = i - col;
  switch (key) {
    case 'ArrowRight':
      return col < cols - 1 && i + 1 < n ? i + 1 : i;
    case 'ArrowLeft':
      return col > 0 ? i - 1 : i;
    case 'ArrowDown':
      return i + cols < n ? i + cols : i;
    case 'ArrowUp':
      return i - cols >= 0 ? i - cols : i;
    case 'Home':
      return rowStart;
    case 'End':
      return Math.min(n - 1, rowStart + cols - 1);
  }
  return null;
}

/** A target's box inside its chart, for placing the tip. */
export function boxIn(el: Element, chart: Element) {
  const r = el.getBoundingClientRect();
  const c = chart.getBoundingClientRect();
  return { x1: r.left - c.left, x2: r.right - c.left, top: r.top - c.top, mid: (r.top + r.bottom) / 2 - c.top, width: c.width };
}
export type Box = ReturnType<typeof boxIn>;
