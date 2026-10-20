// Alef's feelings: a small psychological model of affect. Two numbers — valence (how pleasant,
// −1..1) and arousal (how active, −1..1) — on two timescales: a slow mood that follows how
// the day is going, and quick emotions that events add and that fade back into the mood.
// Where the pair lands picks one of 8 core states; events and states pick a behaviour. Pure.

import { BEHAVIORS, BY_CORE, type BehaviorId, type CoreState } from './behaviors';

export interface Affect {
  v: number;
  a: number;
}

/** What Alef can tell about the day. */
export interface Signals {
  hour: number;
  /** Within the waking day. */
  awake: boolean;
  /** Finished / due today (null when nothing was due yet). */
  doneRatio: number | null;
  /** Blocks that ended without a tick or a "let it go". */
  openCheckIns: number;
  /** Minutes the current block has run over its end (0 if none). */
  overrunMin: number;
  /** In a focus session. */
  inFocus: boolean;
  /** Minutes since you last did anything with Daybloom. */
  idleMin: number;
  /** Days in a row with something finished. */
  streak: number;
  /** The next block starts in this many minutes (null: nothing soon). */
  nextInMin: number | null;
}

export type AffectEvent =
  | 'done' | 'bigDone' | 'allDone' | 'badge'
  | 'blockStart' | 'headsUp' | 'focusStart' | 'focusEnd' | 'lastMinute'
  | 'checkIn' | 'missed' | 'manyMissed' | 'overrun' | 'overdue' | 'pushedAgain' | 'ignored'
  | 'poke' | 'pokeAgain' | 'pokeTooMuch' | 'thanks'
  | 'listening' | 'thinking' | 'answered' | 'unsure' | 'failed'
  | 'greet' | 'loud' | 'prayer' | 'landing';

const clamp = (x: number) => Math.max(-1, Math.min(1, x));

/** Where the mood heads, from how the day is going. */
export function moodTarget(s: Signals): Affect {
  let v = 0.12;
  if (s.doneRatio !== null) v += (s.doneRatio - 0.5) * 0.7;
  v -= Math.min(s.openCheckIns, 4) * 0.08;
  v += (Math.min(s.streak, 7) / 7) * 0.12;
  if (s.overrunMin > 0) v -= Math.min(0.2, s.overrunMin / 100);
  let a = 0;
  if (!s.awake) a = -0.75;
  else {
    if (s.inFocus) a -= 0.15;
    if (s.nextInMin !== null && s.nextInMin <= 10) a += 0.3;
    if (s.overrunMin > 0) a += Math.min(0.45, 0.15 + s.overrunMin / 60);
    if (s.idleMin > 10) a -= Math.min(0.55, (s.idleMin - 10) / 30);
    if (s.hour >= 21 || s.hour < 6) a -= 0.25;
  }
  return { v: clamp(v), a: clamp(a) };
}

/** Quick emotions fade into the mood: a half-life of ~40 s for arousal, ~2 min for valence. */
export function settle(cur: Affect, mood: Affect, dtMs: number): Affect {
  const kA = 1 - 0.5 ** (dtMs / 40_000);
  const kV = 1 - 0.5 ** (dtMs / 120_000);
  return { v: cur.v + (mood.v - cur.v) * kV, a: cur.a + (mood.a - cur.a) * kA };
}

const IMPULSE: Record<AffectEvent, Affect> = {
  done: { v: 0.35, a: 0.2 },
  bigDone: { v: 0.5, a: 0.35 },
  allDone: { v: 0.9, a: 0.7 },
  badge: { v: 0.7, a: 0.5 },
  blockStart: { v: 0.1, a: 0.35 },
  headsUp: { v: 0, a: 0.25 },
  focusStart: { v: 0.15, a: -0.2 },
  focusEnd: { v: 0.35, a: 0.15 },
  lastMinute: { v: 0, a: 0.45 },
  checkIn: { v: -0.02, a: 0.2 },
  missed: { v: -0.3, a: -0.05 },
  manyMissed: { v: -0.55, a: -0.2 },
  overrun: { v: -0.2, a: 0.4 },
  overdue: { v: -0.35, a: 0.45 },
  pushedAgain: { v: -0.35, a: 0.25 },
  ignored: { v: -0.25, a: 0.05 },
  poke: { v: 0.3, a: 0.3 },
  pokeAgain: { v: -0.2, a: 0.2 },
  pokeTooMuch: { v: -0.45, a: 0.55 },
  thanks: { v: 0.6, a: 0.2 },
  listening: { v: 0.05, a: 0.25 },
  thinking: { v: 0, a: 0.2 },
  answered: { v: 0.3, a: 0.1 },
  unsure: { v: -0.25, a: 0.1 },
  failed: { v: -0.4, a: 0.3 },
  greet: { v: 0.4, a: 0.45 },
  loud: { v: -0.1, a: 0.6 },
  prayer: { v: 0.3, a: -0.3 },
  landing: { v: 0.25, a: -0.25 },
};

export function impulse(cur: Affect, ev: AffectEvent): Affect {
  const d = IMPULSE[ev];
  return { v: clamp(cur.v + d.v), a: clamp(cur.a + d.a) };
}

/** The 8 core states: pleasant or not, active or not (the middle reads as quietly inactive). */
export function coreOf(x: Affect): CoreState {
  const P = x.v > 0.3;
  const U = x.v < -0.3;
  const A = x.a > 0.35;
  const I = x.a < -0.35;
  if (A) return P ? 'pleasant-active' : U ? 'unpleasant-active' : 'active';
  if (I) return P ? 'pleasant-inactive' : U ? 'unpleasant-inactive' : 'inactive';
  if (P) return 'pleasant';
  if (U) return 'unpleasant';
  return 'inactive';
}

/** The behaviour an event calls for (the strongest feelings get the biggest performances). */
export const EVENT_BEHAVIOR: Record<AffectEvent, BehaviorId | ((x: Affect) => BehaviorId)> = {
  done: (x) => (x.v > 0.6 ? 'delighted' : x.v > 0.3 ? 'happy' : 'pleased'),
  bigDone: (x) => (x.a > 0.5 ? 'celebratory' : 'delighted'),
  allDone: 'victorious',
  badge: 'proud',
  blockStart: (x) => (x.v > 0.2 ? 'excited' : 'curious'),
  headsUp: 'curious',
  focusStart: 'content',
  focusEnd: 'glad',
  lastMinute: 'racing',
  checkIn: 'curious',
  missed: 'disappointed',
  manyMissed: (x) => (x.v < -0.6 ? 'miserable' : 'sad'),
  overrun: 'pacing',
  overdue: 'afraid',
  pushedAgain: 'disgusted',
  ignored: 'glaring',
  poke: 'delighted',
  pokeAgain: 'grumpy',
  pokeTooMuch: 'angry',
  thanks: 'loving',
  listening: 'curious',
  thinking: 'spinning',
  answered: (x) => (x.v > 0.4 ? 'happy' : 'pleased'),
  unsure: 'confused',
  failed: 'frustrated',
  greet: (x) => (x.a > 0.5 ? 'excited' : 'amazed'),
  loud: 'startled',
  prayer: 'contemplating',
  landing: 'content',
};

export function behaviorForEvent(ev: AffectEvent, after: Affect): BehaviorId {
  const b = EVENT_BEHAVIOR[ev];
  return typeof b === 'function' ? b(after) : b;
}

/**
 * Between events, what to do now and then, by core state. Calm states mostly blink and look
 * around; asleep stays asleep. `seed` picks among them so it doesn't repeat.
 */
export function idleBehavior(x: Affect, seed: number, o: { night: boolean; idleMin: number }): BehaviorId {
  if (o.night && o.idleMin > 15) return 'sleeping';
  const core = coreOf(x);
  const pick = (ids: BehaviorId[]) => ids[Math.abs(seed) % ids.length];
  switch (core) {
    case 'inactive':
      return o.idleMin > 25 ? 'sleepy' : pick(['blinking', 'looking', 'blinking']);
    case 'pleasant-inactive':
      return pick(['content', 'blinking', 'contemplating', 'glad']);
    case 'unpleasant-inactive':
      return o.idleMin > 12 ? 'bored' : pick(['blinking', 'grumpy', 'bored']);
    case 'pleasant':
      return pick(['blinking', 'pleased', 'looking', 'happy']);
    case 'unpleasant':
      return pick(['blinking', 'disappointed', 'looking']);
    case 'active':
      return pick(['looking', 'curious', 'blinking']);
    case 'pleasant-active':
      return pick(['blinking', 'excited', 'looking']);
    case 'unpleasant-active':
      return pick(['looking', 'pacing', 'blinking']);
  }
}

/** For the emotions gallery and tests: each behaviour's core state. */
export function coreOfBehavior(id: BehaviorId): CoreState {
  return BEHAVIORS[id].core;
}
export { BY_CORE };
