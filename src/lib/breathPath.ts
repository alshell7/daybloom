// The breathing guide's ring, shared by the dial's orb and the previews in Settings. One breath
// goes once round a circle, clockwise from the bottom left: the in-breath rises up the left,
// hold crosses the top, the out-breath falls down the right, rest comes back along the bottom.
// Each phase is an arc as long as its time (box: four equal quarters), with a small gap before
// the next phase begins. Angles are degrees clockwise from 12 o'clock; y points down.

import type { BreathPhaseId, Rhythm } from './breath.svelte';

/** Where a breath begins: the bottom left (7:30). */
export const START = 225;
/** The gap at the end of each phase's arc, in degrees. */
export const GAP = 5;

export interface PhaseArc {
  id: BreathPhaseId;
  /** Fractions of the breath where the phase starts and ends. */
  from: number;
  to: number;
  /** The arc drawn for it (its end stops GAP short of the next phase). */
  a0: number;
  a1: number;
}

/** The arcs of a rhythm's phases. */
export function phaseArcs(r: Rhythm, gap = GAP): PhaseArc[] {
  let t = 0;
  return r.phases.map((p) => {
    const from = t / r.cycleMs;
    const to = (t += p.ms) / r.cycleMs;
    return { id: p.id, from, to, a0: START + 360 * from, a1: START + 360 * to - gap };
  });
}

const f = (n: number) => Math.round(n * 1000) / 1000;

/** A point on a circle of radius `r` at `deg`. */
export function pt(r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [f(r * Math.sin(a)), f(-r * Math.cos(a))];
}

/** SVG path of an arc of radius `r` from `a0` to `a1` (clockwise). */
export function arc(r: number, a0: number, a1: number): string {
  const [x0, y0] = pt(r, a0);
  const [x1, y1] = pt(r, a1);
  return `M${x0} ${y0}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
}

/** An arc split into pieces of at most a quarter turn (each fills inside its own quarter). */
export function pieces(a0: number, a1: number): [number, number][] {
  const out: [number, number][] = [];
  for (let a = a0; a < a1 - 1e-6; a += 90) out.push([a, Math.min(a1, a + 90)]);
  return out;
}
