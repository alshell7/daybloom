// The widget's wing, as plain numbers. A wing is a translucent panel that comes out beside the
// dial with the words that don't fit inside it (a full block title, Alef's reply). Its inner edge
// follows the dial's case at a small gap, so it hugs the curve; its outer edge is straight with
// round corners. Here: which side it opens on (the side with room on the screen, or the one you
// chose), its outline, how far the widget's window grows to hold it, its colours from the dial's
// finish, and the timing of sliding titles and typed replies. Wing.svelte, Marquee.svelte and
// WidgetView draw with these; wing.test.ts checks them.

import { contrast, mix } from '../../lib/engine/categories';

export type Side = 'left' | 'right';
export type SidePref = 'auto' | Side;
export type WingStyle = 'auto' | 'dark' | 'light';
/** The dial's case: its centre and radius. */
export interface Circle {
  cx: number;
  cy: number;
  r: number;
}
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Space between the dial's case and the wing's inner edge. */
export const GAP = 7;
/** Room kept between the wing and the window's edge, for its shadow. */
export const MARGIN = 14;
/** The wing's width setting (points, from the dial's side outward). */
export const WIDTH_MIN = 180;
export const WIDTH_MAX = 400;
/** The shortest wing: one line, or Alef's thinking dots. */
export const HEIGHT_MIN = 46;
/** Letters a second for typed replies. */
export const SPEED_MIN = 20;
export const SPEED_MAX = 90;

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * The side a wing opens on. `room` is the free screen beside the widget on each side and `need`
 * what the wing takes (same units). 'auto' takes the roomier side (the right on a tie). A chosen
 * side is kept while it has room, or while the other side has no more. `fit` is how much of
 * `need` fits there.
 */
export function pickSide(pref: SidePref, room: { left: number; right: number }, need: number): { side: Side; fit: number } {
  let side: Side;
  if (pref === 'auto') side = room.left > room.right ? 'left' : 'right';
  else {
    const other: Side = pref === 'left' ? 'right' : 'left';
    side = room[pref] >= need ? pref : room[other] >= need || room[other] > room[pref] ? other : pref;
  }
  return { side, fit: clamp(room[side], 0, need) };
}

/** How far a window `winW` wide must grow on `side` so a wing `width` wide fits beside the dial `c`. */
export function growFor(c: Circle, winW: number, side: Side, width: number): number {
  const reach = c.r + GAP + width + MARGIN;
  return Math.max(0, Math.ceil(side === 'right' ? c.cx + reach - winW : reach - c.cx));
}

/** The widest wing that fits when the window can grow by only `grow` (the inverse of `growFor`). */
export function widthFor(c: Circle, winW: number, side: Side, grow: number): number {
  const room = side === 'right' ? winW + grow - c.cx : grow + c.cx;
  return Math.floor(room - c.r - GAP - MARGIN);
}

/** The tallest wing beside a dial of radius `r` in a window `winH` tall: it wraps at most ~110° of the case. */
export function maxHeight(r: number, winH: number): number {
  return Math.max(HEIGHT_MIN, Math.min(2 * (r + GAP) * 0.82, winH - 20));
}

export interface WingShape {
  /** Where the wing sits, in the circle's coordinates. */
  box: Box;
  /** Its outline in box coordinates, drawn for the right side (mirror it for the left). */
  path: string;
  /** The dial's centre in box coordinates (for this side). */
  centre: { x: number; y: number };
  /** The inner edge's radius (the case plus the gap). */
  ri: number;
  /** How far the box reaches past the dial's side (the wing itself, without its horns). */
  width: number;
  height: number;
}

const f1 = (n: number) => Math.round(n * 10) / 10;

/**
 * A wing `width` wide (from the dial's side outward) and `height` tall, centred on the dial's
 * middle. Its inner edge is an arc around the dial at `GAP` from the case, so near the top and
 * bottom it reaches back around the dial (its "horns"); those corners are rounded by `fillet`,
 * the outer ones by `round`.
 */
export function wingShape(c: Circle, side: Side, width: number, height: number, o: { round?: number; fillet?: number } = {}): WingShape {
  const ri = c.r + GAP;
  const h = clamp(height, 8, 2 * ri * 0.96);
  const half = h / 2;
  const reach = Math.sqrt(ri * ri - half * half);
  const w = ri - reach + width;
  const box: Box = { left: side === 'right' ? c.cx + reach : c.cx - ri - width, top: c.cy - half, width: w, height: h };
  // Drawn for the right side: the dial's centre lies left of the box.
  const ox = -reach;
  const oy = half;
  const r = Math.min(o.round ?? 20, half, width / 2);
  const fl = Math.min(o.fillet ?? 12, half * 0.5, width / 3);
  const a0 = Math.atan2(-half, reach);
  const da = fl / ri;
  const top = [ox + ri * Math.cos(a0 + da), oy + ri * Math.sin(a0 + da)];
  const bot = [ox + ri * Math.cos(-a0 - da), oy + ri * Math.sin(-a0 - da)];
  const path = [
    `M${f1(fl)} 0`,
    `H${f1(w - r)}`,
    `A${f1(r)} ${f1(r)} 0 0 1 ${f1(w)} ${f1(r)}`,
    `V${f1(h - r)}`,
    `A${f1(r)} ${f1(r)} 0 0 1 ${f1(w - r)} ${f1(h)}`,
    `H${f1(fl)}`,
    `Q0 ${f1(h)} ${f1(bot[0])} ${f1(bot[1])}`,
    `A${f1(ri)} ${f1(ri)} 0 0 0 ${f1(top[0])} ${f1(top[1])}`,
    `Q0 0 ${f1(fl)} 0`,
    'Z',
  ].join('');
  const centre = { x: c.cx - box.left, y: c.cy - box.top };
  return { box, path, centre, ri, width, height: h };
}

/** The width of a circle of radius `r` at a distance `d` from its centre (0 outside it). */
export function chord(r: number, d: number): number {
  return Math.abs(d) >= r ? 0 : 2 * Math.sqrt(r * r - d * d);
}

/** The closest and furthest a line running from `top` to `bottom` comes to a centre at `cy`. */
export function lineReach(top: number, bottom: number, cy: number): { near: number; far: number } {
  const a = top - cy;
  const b = bottom - cy;
  const near = a <= 0 && b >= 0 ? 0 : Math.min(Math.abs(a), Math.abs(b));
  return { near, far: Math.max(Math.abs(a), Math.abs(b)) };
}

// ---- sliding titles ------------------------------------------------------------------------

export interface MarqueeLeg {
  /** How far the words travel (px). */
  travel: number;
  /** Out to the end, unhurried; and back to the start, quicker. */
  there: number;
  back: number;
}

/** One pass of a title that's `overflow` px too long: null when it fits. About `speed` px a second. */
export function marqueeLeg(overflow: number, speed = 30): MarqueeLeg | null {
  if (!(overflow > 1)) return null;
  const there = clamp((overflow / speed) * 1000 + 700, 1600, 12_000);
  return { travel: Math.ceil(overflow), there: Math.round(there), back: Math.round(clamp(there * 0.4, 800, 3200)) };
}

/** Passes before a title rests at its start for good (until the pointer comes by, or it changes). */
export const MARQUEE_PASSES = 8;

/**
 * The rest before each leg (ms). The first pass starts after a beat, so the title is read from
 * its start; it waits at the end, then at the start again, longer after the first few passes.
 * After `MARQUEE_PASSES` passes: null, it stays at its start.
 */
export function marqueeRest(pass: number, at: 'start' | 'end'): number | null {
  if (at === 'end') return 1700;
  if (pass >= MARQUEE_PASSES) return null;
  return pass === 0 ? 1800 : pass < 3 ? 4500 : 14_000;
}

// ---- typed replies -------------------------------------------------------------------------

export interface TypingPlan {
  /** When each letter shows, ms from the start. */
  at: number[];
  /** The string length once that letter shows. */
  end: number[];
  /** When the last one shows. */
  total: number;
}

function graphemes(text: string): string[] {
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter;
  if (Seg) return Array.from(new Seg(undefined, { granularity: 'grapheme' }).segment(text), (s) => s.segment);
  return Array.from(text);
}

/** Letter by letter at `speed` letters a second, with a breath after a comma and a longer one after a sentence. */
export function typingPlan(text: string, speed: number): TypingPlan {
  const step = 1000 / clamp(speed, 5, 400);
  const at: number[] = [];
  const end: number[] = [];
  let t = 0;
  let len = 0;
  const gs = graphemes(text);
  gs.forEach((g, i) => {
    len += g.length;
    at.push(Math.round(t));
    end.push(len);
    const next = gs[i + 1];
    // A pause after punctuation that ends a phrase (not inside "3.5" or "e.g.").
    const pause = next === undefined || /\s/.test(next) ? (/[.!?…]/.test(g) ? 7 : /[,;:—–]/.test(g) ? 3 : 0) : 0;
    t += step * (1 + pause);
  });
  return { at, end, total: at.length ? at[at.length - 1] : 0 };
}

/** How much of the text shows `elapsed` ms into its plan (a string length). */
export function typedLength(plan: TypingPlan, elapsed: number): number {
  const { at, end } = plan;
  if (!at.length || elapsed < at[0]) return 0;
  let lo = 0;
  let hi = at.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (at[mid] <= elapsed) lo = mid;
    else hi = mid - 1;
  }
  return end[lo];
}

// ---- colours -------------------------------------------------------------------------------

export interface WingPalette {
  /** The wing's glass, opaque near the dial and more see-through outward. */
  fill: string;
  near: number;
  far: number;
  ink: string;
  dark: boolean;
  /** Alef's colour on this glass (the typing caret, the thinking dots). */
  accent: string;
}

/**
 * The wing in the dial's own colours: 'auto' is the finish's face with its ink; 'dark' and
 * 'light' take whichever of the finish's face and ink is dark or light, so even a fixed look
 * keeps the dial's tint. `eye` is Alef's eye colour for this finish.
 */
export function wingPalette(f: { face: string; ink: string; dark: boolean; lume: string }, style: WingStyle, eye?: string): WingPalette {
  const dark = style === 'auto' ? f.dark : style === 'dark';
  const [base, ink] = dark === f.dark ? [f.face, f.ink] : [f.ink, f.face];
  const fill = dark ? mix(base, '#05070b', 0.18) : mix(base, '#ffffff', 0.45);
  const want = eye ?? f.lume;
  const accent = contrast(want, fill) >= 3 ? want : mix(want, ink, 0.55);
  return { fill, near: dark ? 0.95 : 0.97, far: dark ? 0.8 : 0.86, ink, dark, accent };
}
