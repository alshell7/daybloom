// The face at rest, between performances: the mood shows in it softly (a hint of a smile
// when the day goes well, heavy lids when tired, a small frown when it's hard). Pure.

import { coreOf, type Affect } from './affect';
import { BEHAVIORS, type BehaviorId, type CoreState, type Eye } from './behaviors';

const E: Eye = { x: 0, y: 0, sx: 1, sy: 1, rot: 0, lid: 0, slant: 0, smile: 0 };
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** Behaviours whose last pose stays until the next one (asleep stays asleep). */
export const STICKY: BehaviorId[] = ['sleeping'];

export function restPose(a: Affect): { l: Eye; r: Eye } {
  const smile = a.v > 0.25 ? clamp((a.v - 0.25) * 0.45, 0, 0.22) : 0;
  const tired = a.a < -0.3 ? clamp((-a.a - 0.3) * 0.75, 0, 0.5) : 0;
  const low = a.v < -0.3 ? clamp((-a.v - 0.3) * 0.5, 0, 0.25) : 0;
  const wide = a.a > 0.45 ? clamp((a.a - 0.45) * 0.25, 0, 0.08) : 0;
  const lid = clamp(tired + low * 0.6, 0, 0.55);
  const slant = low ? -10 * (low / 0.25) : 0;
  const base = { ...E, smile, lid, sx: 1 + wide, sy: 1 + wide, y: tired * 6 };
  return { l: { ...base, slant }, r: { ...base, slant: -slant } };
}

const CORE_LED: Record<CoreState, string> = {
  'pleasant-active': '#FFD84A',
  pleasant: '#5CF2B0',
  'pleasant-inactive': '#4FD3E6',
  active: '#FFC85C',
  inactive: '#4FD3E6',
  'unpleasant-active': '#A58BFF',
  unpleasant: '#7AA7FF',
  'unpleasant-inactive': '#8A97AD',
};

/** The mood light: the feeling's colour while performing, the mood's otherwise. */
export function moodLed(a: Affect, performing: BehaviorId | null): string {
  return performing ? BEHAVIORS[performing].led : CORE_LED[coreOf(a)];
}

/** How bright the mood light glows (0..1). */
export function moodGlow(a: Affect, performing: BehaviorId | null): number {
  if (performing) return BEHAVIORS[performing].glow;
  return clamp(0.42 + a.a * 0.22 + a.v * 0.12, 0.18, 0.75);
}
