// The breathing minute: one source for its rhythm, read by the dial's orb, the readout's words
// and the assistant's card. A calm 16-second breath, four times: in for 4, hold for 4, a long
// out for 6 (a longer out-breath is the calming part), and 2 to rest.

import { sounds } from './sound';
import { clock } from './stores/clock.svelte';
import { settings } from './stores/settings.svelte';

export type BreathPhaseId = 'in' | 'hold' | 'out' | 'rest';

export const BREATH: readonly { id: BreathPhaseId; word: string; ms: number }[] = [
  { id: 'in', word: 'Breathe in', ms: 4000 },
  { id: 'hold', word: 'Hold', ms: 4000 },
  { id: 'out', word: 'Breathe out', ms: 6000 },
  { id: 'rest', word: 'Rest', ms: 2000 },
];
export const CYCLE_MS = BREATH.reduce((a, p) => a + p.ms, 0);
export const ROUNDS = 4;
export const BREATH_MS = CYCLE_MS * ROUNDS;

export interface BreathState {
  id: BreathPhaseId;
  word: string;
  /** 1..ROUNDS */
  round: number;
  /** Whole seconds left in this phase (4, 3, 2, 1). */
  secondsLeft: number;
  /** ms since the minute began. */
  elapsed: number;
  /** ms until this phase ends. */
  msLeft: number;
}

/** Where the breath is `elapsed` ms in, or null outside the minute. */
export function breathAt(elapsed: number): BreathState | null {
  if (!(elapsed >= 0) || elapsed >= BREATH_MS) return null;
  const inCycle = elapsed % CYCLE_MS;
  let end = 0;
  for (const p of BREATH) {
    end += p.ms;
    if (inCycle < end) {
      const msLeft = end - inCycle;
      return { id: p.id, word: p.word, round: Math.floor(elapsed / CYCLE_MS) + 1, secondsLeft: Math.max(1, Math.ceil(msLeft / 1000)), elapsed, msLeft };
    }
  }
  return null;
}

/** Fractions of the cycle where each phase ends (for the orb's keyframes). */
export function phaseEnds(): Record<BreathPhaseId, number> {
  let t = 0;
  const out = {} as Record<BreathPhaseId, number>;
  for (const p of BREATH) out[p.id] = (t += p.ms) / CYCLE_MS;
  return out;
}

// ---- the live state, stepped exactly at each phase's boundaries and its whole seconds (not on
// the once-a-second clock), so the words change with the orb and not up to a second late.

class Guide {
  state = $state<BreathState | null>(null);
  #timer: ReturnType<typeof setTimeout> | null = null;
  #lastPhase = '';

  /** Follow a breathing minute that began at `startAt` (app clock ms; 0 = none). */
  watch(startAt: number) {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
    this.#lastPhase = '';
    if (!startAt) {
      this.state = null;
      return;
    }
    const step = () => {
      const s = breathAt(Date.now() + clock.offset - startAt);
      this.state = s;
      if (!s) {
        this.#timer = null;
        return;
      }
      const key = `${s.round}:${s.id}`;
      if (key !== this.#lastPhase) {
        this.#lastPhase = key;
        if (settings.value.sound && s.id === 'in') sounds.breatheIn();
        else if (settings.value.sound && s.id === 'out') sounds.breatheOut();
      }
      // The next whole second of this phase, or its end.
      this.#timer = setTimeout(step, Math.min(s.msLeft % 1000 || 1000, s.msLeft) + 15);
    };
    step();
  }
}

export const breath = new Guide();
