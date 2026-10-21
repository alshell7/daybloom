// The breathing guide: one source for its rhythm, read by the dial's orb, the readout's words,
// the assistant's card and Settings. Two patterns (Settings › Rhythm › Breathe): box breathing,
// where in, hold, out and rest each last the same few seconds (4 by default), and calm, 4·4·6·2,
// whose longer out-breath is the calming part. The guide is a few rounds of it (about a minute).
// A running guide keeps the rhythm it started with, steps exactly at each phase's edges and
// whole seconds (not on the once-a-second clock, so the words change with the orb), and plays
// each phase's sound (breathSound.ts) as the phase begins.

import { playCue, stopCues, warmCue, type BreathVoice } from './breathSound';
import { clock } from './stores/clock.svelte';
import { settings, type Settings } from './stores/settings.svelte';

export type BreathPhaseId = 'in' | 'hold' | 'out' | 'rest';
export type BreathPattern = Settings['breathe']['pattern'];

export interface BreathPhase {
  id: BreathPhaseId;
  word: string;
  ms: number;
}

export interface Rhythm {
  pattern: BreathPattern;
  /** In, hold, out, rest. */
  phases: readonly BreathPhase[];
  /** One breath (all four phases), ms. */
  cycleMs: number;
  rounds: number;
  /** The whole guide, ms. */
  totalMs: number;
}

export const PHASE_IDS: readonly BreathPhaseId[] = ['in', 'hold', 'out', 'rest'];
const WORDS: Record<BreathPhaseId, string> = { in: 'Breathe in', hold: 'Hold', out: 'Breathe out', rest: 'Rest' };
const CALM: Record<BreathPhaseId, number> = { in: 4, hold: 4, out: 6, rest: 2 };
/** Seconds per side of the box, and rounds, that Settings offer. */
export const SECONDS_RANGE = [3, 6] as const;
export const ROUNDS_RANGE = [2, 8] as const;

const pick = (v: unknown, d: number, [lo, hi]: readonly [number, number]) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d);

/** The rhythm for a breathe setting (missing or odd values fall back to box, 4 s, 4 rounds). */
export function rhythmOf(b: Partial<Settings['breathe']> = {}): Rhythm {
  const pattern: BreathPattern = b.pattern === 'calm' ? 'calm' : 'box';
  const s = pick(b.seconds, 4, SECONDS_RANGE);
  const rounds = pick(b.rounds, 4, [1, 12]);
  const phases = PHASE_IDS.map((id) => ({ id, word: WORDS[id], ms: (pattern === 'box' ? s : CALM[id]) * 1000 }));
  const cycleMs = phases.reduce((a, p) => a + p.ms, 0);
  return { pattern, phases, cycleMs, rounds, totalMs: cycleMs * rounds };
}

/** The rhythm Settings ask for now. */
export const rhythm = () => rhythmOf(settings.value.breathe);

/** "in for 4, hold for 4, out for 4, rest for 4" */
export function describeRhythm(r: Rhythm = breath.rhythm): string {
  return r.phases.map((p) => `${p.id} for ${p.ms / 1000}`).join(', ');
}

/** About how long the guide lasts, for buttons: "1 min". */
export function rhythmLength(r: Rhythm = breath.rhythm): string {
  return `${Math.max(1, Math.round(r.totalMs / 60_000))} min`;
}

export interface BreathState {
  id: BreathPhaseId;
  word: string;
  /** 1..rounds */
  round: number;
  /** Whole seconds left in this phase (4, 3, 2, 1). */
  secondsLeft: number;
  /** ms since the guide began. */
  elapsed: number;
  /** ms until this phase ends. */
  msLeft: number;
  /** This phase's length, ms. */
  ms: number;
}

/** Where the breath is `elapsed` ms in, or null outside the guide. */
export function breathAt(elapsed: number, r: Rhythm = breath.rhythm): BreathState | null {
  if (!(elapsed >= 0) || elapsed >= r.totalMs) return null;
  const inCycle = elapsed % r.cycleMs;
  let end = 0;
  for (const p of r.phases) {
    end += p.ms;
    if (inCycle < end) {
      const msLeft = end - inCycle;
      return { id: p.id, word: p.word, round: Math.floor(elapsed / r.cycleMs) + 1, secondsLeft: Math.max(1, Math.ceil(msLeft / 1000)), elapsed, msLeft, ms: p.ms };
    }
  }
  return null;
}

/** Fractions of the cycle where each phase starts and ends (for the orb's keyframes). */
export function phaseSpans(r: Rhythm = breath.rhythm): Record<BreathPhaseId, { from: number; to: number }> {
  let t = 0;
  const out = {} as Record<BreathPhaseId, { from: number; to: number }>;
  for (const p of r.phases) out[p.id] = { from: t / r.cycleMs, to: (t += p.ms) / r.cycleMs };
  return out;
}

/** The sound a phase makes now, from Settings: a breath, tones, or none. */
function voice(): BreathVoice | null {
  const v = settings.value.breathe?.sound ?? 'breath';
  return settings.value.sound && v !== 'off' ? v : null;
}

// ---- the live guide

class Guide {
  state = $state<BreathState | null>(null);
  /** The watched guide's rhythm, kept from its start (Settings may change meanwhile). */
  #running = $state<Rhythm | null>(null);
  #timer: ReturnType<typeof setTimeout> | null = null;
  #lastPhase = '';

  /** The watched guide's rhythm (also once it has ended, until the next), or the one Settings ask for. */
  get rhythm(): Rhythm {
    return this.#running ?? rhythm();
  }

  /** Follow a guide that began at `startAt` (app clock ms; 0 = none). */
  watch(startAt: number) {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
    this.#lastPhase = '';
    stopCues();
    if (!startAt) {
      this.state = null;
      this.#running = null;
      return;
    }
    const r = rhythm();
    this.#running = r;
    // Each breath sounds a little different: a seed per round and phase, fixed for this guide.
    const seed = (round: number, i: number) => ((startAt / 1000) | 0) + round * 4 + i;
    const step = () => {
      const s = breathAt(Date.now() + clock.offset - startAt, r);
      this.state = s;
      if (!s) {
        this.#timer = null;
        return;
      }
      const key = `${s.round}:${s.id}`;
      if (key !== this.#lastPhase) {
        this.#lastPhase = key;
        const v = voice();
        if (v) {
          const i = PHASE_IDS.indexOf(s.id);
          // Joins where the phase is, if this step came late (a throttled timer).
          playCue(s.id, v, s.ms / 1000, { seed: seed(s.round, i), offset: (s.ms - s.msLeft) / 1000 });
          // Render the next phase's sound while this one plays.
          const ni = (i + 1) % 4;
          warmCue(PHASE_IDS[ni], v, r.phases[ni].ms / 1000, seed(s.round + (ni === 0 ? 1 : 0), ni));
        }
      }
      // The next whole second of this phase, or its end.
      this.#timer = setTimeout(step, Math.min(s.msLeft % 1000 || 1000, s.msLeft) + 15);
    };
    step();
  }
}

export const breath = new Guide();
