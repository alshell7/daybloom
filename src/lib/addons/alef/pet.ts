// Alef as a little pet: reading touch (a slow stroke is petting, a fast wiggle tickles) and
// deciding, now and then, to do something on its own — welcome you back, ask you to stretch
// after a long stretch of work, cheer halfway through a focus session, check you're still
// there, daydream, get bored, hiccup. Kind and rare: never more than one thing at a time, and
// each kind of moment has its own quiet spell. Pure.

import type { ActId } from './behaviors';

// ── Touch ──

export interface Sample {
  /** Pointer position in face widths (0..1 across the face). */
  x: number;
  y: number;
  t: number;
}

export type Gesture = 'pet' | 'tickle';

/** What a run of pointer samples over the face means, if anything. */
export function gesture(samples: Sample[], now: number): Gesture | null {
  const recent = samples.filter((s) => now - s.t <= 1500);
  if (recent.length < 5) return null;
  let path = 0;
  let turns = 0;
  let dir = 0;
  let run = 0;
  const quick: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    const dx = recent[i].x - recent[i - 1].x;
    const dy = recent[i].y - recent[i - 1].y;
    path += Math.hypot(dx, dy);
    if (Math.abs(dx) < 0.004) continue;
    const d = Math.sign(dx);
    if (dir && d !== dir) {
      // A turn counts once the stroke before it was long enough to be meant.
      if (run >= 0.06) {
        turns++;
        quick.push(recent[i].t);
      }
      run = 0;
    }
    dir = d;
    run += Math.abs(dx);
  }
  const fastTurns = quick.filter((t) => now - t <= 900).length;
  if (fastTurns >= 5 && path >= 0.9) return 'tickle';
  if (turns >= 2 && path >= 1.1) return 'pet';
  return null;
}

// ── Doing things on its own ──

export interface PetCtx {
  now: number;
  awake: boolean;
  /** Minutes since you last touched the computer, now and at the last look. */
  idleMin: number;
  prevIdleMin: number;
  /** Minutes you've been at it without a real break. */
  activeMin: number;
  /** A focus session: how far along (0..1) and when it started. */
  focus: { progress: number; startedAt: number } | null;
  /** The mood: pleasant and calm makes for daydreams. */
  v: number;
  a: number;
  /** Nothing planned in the next hour. */
  quiet: boolean;
  /** Things waiting in the backlog. */
  backlog: number;
  /** A random number 0..1 (injected for tests). */
  roll: number;
}

export interface PetMemory {
  /** When each kind of moment last happened (ms). */
  last: Partial<Record<string, number>>;
  /** Focus sessions already cheered at halfway / checked on. */
  halfway: number | null;
  checked: number | null;
  /** Hiccups and sneezes today. */
  quirks: { day: string; n: number };
}

export const FRESH_MEMORY: PetMemory = { last: {}, halfway: null, checked: null, quirks: { day: '', n: 0 } };

export interface PetMoment {
  kind: 'welcome' | 'halfway' | 'still-there' | 'stretch' | 'quirk' | 'daydream' | 'bored';
  act: ActId;
  /** What Alef says (null: just the act). */
  line: string | null;
}

const MIN = 60_000;
const since = (m: PetMemory, k: string, now: number) => now - (m.last[k] ?? -Infinity);
const dayOf = (now: number) => new Date(now).toDateString();

/** The one thing worth doing now, if any (and the memory to keep). */
export function petMoment(c: PetCtx, m: PetMemory): { moment: PetMoment | null; memory: PetMemory } {
  const mem: PetMemory = { ...m, last: { ...m.last }, quirks: m.quirks.day === dayOf(c.now) ? { ...m.quirks } : { day: dayOf(c.now), n: 0 } };
  const pick = (k: PetMoment['kind'], act: ActId, line: string | null): { moment: PetMoment; memory: PetMemory } => {
    mem.last[k] = c.now;
    return { moment: { kind: k, act, line }, memory: mem };
  };
  const pickLine = (xs: string[]) => xs[Math.floor(c.roll * xs.length) % xs.length];

  // You're back after a while away.
  if (c.awake && c.prevIdleMin >= 10 && c.idleMin < 1 && since(mem, 'welcome', c.now) > 20 * MIN)
    return pick('welcome', 'welcome', c.prevIdleMin >= 60 ? pickLine(['There you are! I missed you.', 'Welcome back! Ready when you are.']) : pickLine(['Welcome back!', 'Oh, hi again!']));

  if (c.focus) {
    if (c.focus.progress >= 0.5 && c.focus.progress < 0.9 && mem.halfway !== c.focus.startedAt) {
      mem.halfway = c.focus.startedAt;
      return pick('halfway', 'happy', pickLine(['Halfway there. Nice and steady.', 'Half done! Keep going.']));
    }
    if (c.idleMin >= 5 && mem.checked !== c.focus.startedAt) {
      mem.checked = c.focus.startedAt;
      return pick('still-there', 'curious', 'Still with me? No rush.');
    }
    return { moment: null, memory: mem };
  }
  if (!c.awake) return { moment: null, memory: mem };

  // A long stretch at the screen: stretch together.
  if (c.activeMin >= 80 && c.idleMin < 2 && since(mem, 'stretch', c.now) > 80 * MIN)
    return pick('stretch', 'stretching', pickLine(['Stretch with me? Arms up!', "You've been at it a while. Quick stretch?"]));

  // A rare hiccup or sneeze: once or twice a day at most.
  if (c.idleMin < 3 && mem.quirks.n < 2 && c.roll < 0.012 && since(mem, 'quirk', c.now) > 90 * MIN) {
    mem.quirks.n++;
    return pick('quirk', c.roll < 0.006 ? 'sneeze' : 'hiccup', null);
  }

  // Content and left alone for a bit: a daydream.
  if (c.v > 0.25 && c.a < 0.2 && c.idleMin >= 2 && c.idleMin <= 10 && c.roll < 0.18 && since(mem, 'daydream', c.now) > 25 * MIN) return pick('daydream', 'daydreaming', null);

  // You're here, nothing is planned for a while: a little nudge toward the backlog.
  if (c.quiet && c.idleMin < 2 && c.backlog > 0 && c.roll < 0.25 && since(mem, 'bored', c.now) > 70 * MIN)
    return pick('bored', 'bored', pickLine(['Nothing planned for a bit. Pick something small from the backlog?', 'Free time! Want a tiny task from the backlog, or a real break?']));

  return { moment: null, memory: mem };
}
