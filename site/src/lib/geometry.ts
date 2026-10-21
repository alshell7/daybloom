// Dial geometry in a fixed 1000×1000 viewBox, the same constants as the app
// (src/lib/dial/geometry.ts). Angles are degrees, 0 = 12 o'clock, clockwise.

export const C = 500;

export const R = {
  case: 497,
  marker: 492,
  bezelOut: 468,
  bezelIn: 382,
  trackOut: 366,
  trackMinor: 354,
  trackMajor: 340,
  numerals: 298,
  readout: 252,
  wedgeIn: 214,
  wedgeOut: 330,
};

export function polar(r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
}

const f = (n: number) => Math.round(n * 100) / 100;

/** Annular sector from a0 to a1 (a1 > a0). Full turns render as a ring. */
export function sectorPath(a0: number, a1: number, rIn: number, rOut: number): string {
  const sweep = a1 - a0;
  if (!(sweep > 0.01)) return '';
  if (sweep >= 359.95) {
    return [
      `M${f(C)} ${f(C - rOut)}`,
      `A${rOut} ${rOut} 0 1 1 ${f(C)} ${f(C + rOut)}`,
      `A${rOut} ${rOut} 0 1 1 ${f(C)} ${f(C - rOut)}Z`,
      `M${f(C)} ${f(C - rIn)}`,
      `A${rIn} ${rIn} 0 1 0 ${f(C)} ${f(C + rIn)}`,
      `A${rIn} ${rIn} 0 1 0 ${f(C)} ${f(C - rIn)}Z`,
    ].join('');
  }
  const large = sweep > 180 ? 1 : 0;
  const [x0, y0] = polar(rOut, a0);
  const [x1, y1] = polar(rOut, a1);
  const [x2, y2] = polar(rIn, a1);
  const [x3, y3] = polar(rIn, a0);
  return `M${f(x0)} ${f(y0)}A${f(rOut)} ${f(rOut)} 0 ${large} 1 ${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}A${f(rIn)} ${f(rIn)} 0 ${large} 0 ${f(x3)} ${f(y3)}Z`;
}

/** Open arc at radius r; `reverse` runs counter-clockwise (upright text on the lower half). */
export function arcPath(r: number, a0: number, a1: number, reverse = false): string {
  const sweep = Math.min(a1 - a0, 359.9);
  if (sweep <= 0) return '';
  const large = sweep > 180 ? 1 : 0;
  const end = a0 + sweep;
  if (!reverse) {
    const [x0, y0] = polar(r, a0);
    const [x1, y1] = polar(r, end);
    return `M${f(x0)} ${f(y0)}A${r} ${r} 0 ${large} 1 ${f(x1)} ${f(y1)}`;
  }
  const [x0, y0] = polar(r, end);
  const [x1, y1] = polar(r, a0);
  return `M${f(x0)} ${f(y0)}A${r} ${r} 0 ${large} 0 ${f(x1)} ${f(y1)}`;
}

/** Degrees subtended by a straight length at radius r. */
export const degFor = (length: number, r: number) => (length / r) * (180 / Math.PI);
export const arcLength = (r: number, deg: number) => (deg * Math.PI * r) / 180;

/** Angle (deg, 0 = top, clockwise) of a point in viewBox space. */
export function angleOf(x: number, y: number) {
  const a = (Math.atan2(y - C, x - C) * 180) / Math.PI + 90;
  return (a + 360) % 360;
}

export const radiusOf = (x: number, y: number) => Math.hypot(x - C, y - C);

/** The equivalent of `target` (mod 360) nearest to `from`, so turns take the short way. */
export function nearestTurn(from: number, target: number) {
  const d = ((((target - from) % 360) + 540) % 360) - 180;
  return from + d;
}

export const LANE_GAP = 5;
export const MAX_LANES = 3;

/** Radii of lane `lane` when `lanes` blocks overlap (outermost first). */
export function laneRadii(lane: number, lanes: number) {
  const n = Math.max(1, Math.min(lanes, MAX_LANES));
  const l = Math.min(lane, n - 1);
  const band = R.bezelOut - R.bezelIn;
  const t = (band - (n - 1) * LANE_GAP) / n;
  const rOut = R.bezelOut - l * (t + LANE_GAP);
  return { rOut, rIn: rOut - t, thickness: t };
}
