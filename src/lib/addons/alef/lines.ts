// What Alef says on its own, in a few warm words. Never a scold: a block that didn't happen
// gets a question, not a verdict. How often Alef speaks follows its chattiness. Pure.

import type { AffectEvent } from './affect';

export type Chattiness = 'quiet' | 'some' | 'chatty';

export interface LineCtx {
  title?: string;
  /** "3:30pm". */
  at?: string;
  /** Minutes until something. */
  inMin?: number;
  count?: number;
  /** A salah's name, a meeting run… */
  name?: string;
  hour: number;
  seed: number;
  /** What Alef calls you. */
  who?: string;
}

/** Which moments Alef speaks up for, by chattiness ('quiet' only answers when spoken to). */
const SPEAKS: Record<Chattiness, AffectEvent[]> = {
  quiet: [],
  some: ['greet', 'allDone', 'bigDone', 'checkIn', 'manyMissed', 'focusStart', 'focusEnd', 'prayer', 'landing', 'headsUp'],
  chatty: ['greet', 'allDone', 'bigDone', 'done', 'checkIn', 'manyMissed', 'focusStart', 'focusEnd', 'prayer', 'landing', 'headsUp', 'blockStart', 'lastMinute', 'poke', 'pokeAgain', 'pokeTooMuch', 'badge'],
};

/** Pokes always get a word or two, even from a quiet Alef: you asked for it. */
const ALWAYS: AffectEvent[] = ['poke', 'pokeAgain', 'pokeTooMuch'];

export function speaksFor(ev: AffectEvent, c: Chattiness): boolean {
  return ALWAYS.includes(ev) || SPEAKS[c].includes(ev);
}

const q = (t?: string) => (t ? `“${t.length > 38 ? `${t.slice(0, 36).trimEnd()}…` : t}”` : 'that');

const LINES: Partial<Record<AffectEvent, ((c: LineCtx) => string)[]>> = {
  greet: [
    (c) => (c.hour < 12 ? `Good morning${c.who ? `, ${c.who}` : ''}!` : c.hour < 17 ? `Hello again${c.who ? `, ${c.who}` : ''}!` : `Good evening${c.who ? `, ${c.who}` : ''}!`) + (c.count ? ` ${c.count} ${c.count === 1 ? 'block' : 'blocks'} today.` : ''),
    (c) => (c.title ? `Hi${c.who ? ` ${c.who}` : ''}! First up: ${q(c.title)}${c.at ? ` at ${c.at}` : ''}.` : `Hi${c.who ? ` ${c.who}` : ''}! A fresh dial today.`),
    (c) => `Hey${c.who ? ` ${c.who}` : ''}, you're here! Let's take it one block at a time.`,
  ],
  done: [(c) => `${q(c.title)}, done. Nice.`, () => 'One down!', () => 'That counts. Well done.', () => 'Done and dusted.'],
  bigDone: [(c) => `${q(c.title)} was a big one. Well done!`, () => 'That was a lot of good work.', () => 'Big block, finished. Take a breath.'],
  allDone: [(c) => `Every block today: done! I knew you could${c.who ? `, ${c.who}` : ''}.`, () => "That's the whole day. Look at that dial glow!", () => 'All done. Time is yours now.'],
  badge: [() => 'A new badge! You earned it.'],
  blockStart: [(c) => `Time for ${q(c.title)}. I'm right here with you.`, (c) => `${q(c.title)} now. Let's start small.`, (c) => `Starting ${q(c.title)}. Two minutes is a fine start.`],
  headsUp: [(c) => `${q(c.title)} in ${c.inMin ?? 5} minutes.`, (c) => `Soon: ${q(c.title)}. A good moment to wrap up.`],
  lastMinute: [(c) => `Two minutes left on ${q(c.title)}.`, () => 'Almost there. Two minutes.'],
  checkIn: [(c) => `How did ${q(c.title)} go?`, (c) => `${q(c.title)} has ended. Done, or shall we move it?`, (c) => `Did ${q(c.title)} happen? Either way is okay.`],
  manyMissed: [() => "A few blocks didn't happen. That's okay. Want to move them to tomorrow?", () => 'Some plans slipped. Shall we pick just one to do now?'],
  focusStart: [() => "Focus time. I'll work right here beside you.", () => "Let's focus together. I'll keep quiet.", () => 'Phones away, one thing at a time. I am with you.'],
  focusEnd: [() => 'Session done! Stretch a little?', () => 'Nice focus. Water, then the next thing?', () => 'Good work. Rest your eyes a moment.'],
  prayer: [(c) => `It's time for ${c.name ?? 'salah'}.`, (c) => `${c.name ?? 'Salah'} now. I'll wait here.`],
  landing: [() => 'Meeting over. Land softly first.', () => 'That was a lot of talking. A short reset?'],
  poke: [() => 'Hehe!', () => 'Hi there!', () => 'That tickles!', () => 'Boop!', () => "I'm here!"],
  pokeAgain: [() => 'Hey…', () => 'Yes, still here.', () => 'Hmm?'],
  pokeTooMuch: [() => "Okay, okay! I'm awake!", () => 'Grr! (Just kidding.)', () => 'Too many pokes!'],
  thanks: [() => "You're welcome!", () => 'Any time.', () => 'Happy to help.'],
};

/** A line for this moment, or null when Alef stays quiet. */
export function lineFor(ev: AffectEvent, c: LineCtx, chattiness: Chattiness): string | null {
  if (!speaksFor(ev, chattiness)) return null;
  const opts = LINES[ev];
  if (!opts?.length) return null;
  return opts[Math.abs(c.seed) % opts.length](c);
}

/** A goodnight for late hours, when Alef dozes off. */
export function lateLine(seed: number): string {
  const opts = ["It's getting late. Time to wind down?", 'Late already. Tomorrow is a fresh dial.', 'Yawn… bedtime soon?'];
  return opts[Math.abs(seed) % opts.length];
}
