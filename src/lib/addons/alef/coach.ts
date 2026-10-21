// Alef's helping hand. When a moment calls for it — a block starts, one ends unticked, the day
// slips, you sit stuck in a block, a gap opens — Alef offers one small, concrete next step you
// can take with a tap: start for two minutes together, make it smaller, give it ten more
// minutes, move it without fuss. Action first, never a verdict: no counts of what's undone,
// no "late", no "should". Pure: it picks the words and offers; alef.svelte.ts runs them.

import type { AffectEvent } from './affect';

export type OfferId = 'start2' | 'tick' | 'more10' | 'moveNext' | 'tomorrow' | 'pickOne' | 'smaller' | 'crumb' | 'fill' | 'breathe' | 'talk';

export interface Offer {
  id: OfferId;
  label: string;
  icon: string;
  /** The block it acts on. */
  key?: string;
  /** A backlog task (for 'fill'). */
  taskId?: string;
  /** For 'start2': how long, and the step to start (Help me start's first step). */
  minutes?: number;
  step?: string;
}

export interface Help {
  line: string;
  offers: Offer[];
}

export interface CoachCtx {
  title?: string;
  key?: string;
  /** Block length, minutes. */
  minutes?: number;
  /** The block is yours (not a calendar event or salah). */
  own?: boolean;
  /** Addons that can help. */
  smaller?: boolean;
  crumbs?: boolean;
  /** A backlog task that fits the free time now. */
  fits?: { id: string; title: string; minutes: number } | null;
  /** Minutes free until the next thing. */
  freeMin?: number;
  who?: string;
  seed: number;
}

const q = (t?: string) => (t ? `“${t.length > 34 ? `${t.slice(0, 32).trimEnd()}…` : t}”` : 'this');
const pick = <T>(xs: T[], seed: number) => xs[Math.abs(seed) % xs.length];

const START: Offer = { id: 'start2', label: 'Start with 2 minutes', icon: 'play' };

/** Help for a moment, or null when the moment needs none. */
export function helpFor(ev: AffectEvent | 'stuck' | 'gap', c: CoachCtx): Help | null {
  const k = c.key;
  const big = (c.minutes ?? 0) >= 30;
  switch (ev) {
    case 'blockStart': {
      if (!c.own || !k) return null;
      const offers: Offer[] = [{ ...START, key: k }];
      if (big && c.smaller) offers.push({ id: 'smaller', label: 'Make it smaller', icon: 'layers', key: k });
      return {
        line: pick(
          [`Time for ${q(c.title)}. Two minutes is a perfect start; I'll do them with you.`, `${q(c.title)} now. Shall we just open it up and begin, together?`, `Here we go: ${q(c.title)}. Tiny first step?`],
          c.seed,
        ),
        offers,
      };
    }
    case 'checkIn':
      if (!k) return null;
      return {
        line: pick([`${q(c.title)} has ended. How did it go? Any answer is fine.`, `That was ${q(c.title)}. Done, or want more time?`, `Checking in on ${q(c.title)}. You decide what's next.`], c.seed),
        offers: [
          { id: 'tick', label: 'Done', icon: 'check', key: k },
          { id: 'more10', label: '10 more min', icon: 'timer', key: k },
          { id: 'moveNext', label: 'Move it', icon: 'move-later', key: k },
        ],
      };
    case 'overrun':
      if (!k) return null;
      return {
        line: `Still with ${q(c.title)}? Deep in it is a good place. Want more time, or wrap up?`,
        offers: [
          { id: 'more10', label: '10 more min', icon: 'timer', key: k },
          { id: 'tick', label: 'Wrap up', icon: 'check', key: k },
        ],
      };
    case 'manyMissed':
      return {
        line: pick(["Plans moved on without us today. That happens to everyone. Fresh start?", "Let's lighten today. Move the open ones to tomorrow, or pick just one for now?"], c.seed),
        offers: [
          { id: 'pickOne', label: 'Just one thing', icon: 'target' },
          { id: 'tomorrow', label: 'Fresh start tomorrow', icon: 'sunrise' },
        ],
      };
    case 'stuck': {
      if (!c.own || !k) return null;
      const offers: Offer[] = [{ ...START, key: k }];
      if (c.smaller) offers.push({ id: 'smaller', label: 'Make it smaller', icon: 'layers', key: k });
      else offers.push({ id: 'breathe', label: 'Breathe first', icon: 'wind' });
      return {
        line: pick([`Starting is the hardest part of ${q(c.title)}. Two minutes, side by side?`, `Want a hand with ${q(c.title)}? We can do the tiniest first bit together.`, `${q(c.title)} feeling heavy? Let's make the first step so small it's easy.`], c.seed),
        offers,
      };
    }
    case 'headsUp':
      if (!c.crumbs || !k || !c.own) return null;
      return { line: `${q(c.title)} wraps up soon. Leave yourself a note for next time?`, offers: [{ id: 'crumb', label: 'Leave a note', icon: 'pin', key: k }] };
    case 'gap': {
      if (!c.fits) return null;
      return {
        line: pick([`${c.freeMin ?? c.fits.minutes} free minutes. ${q(c.fits.title)} would fit nicely. Or a real break?`, `A little gap! ${q(c.fits.title)} fits in it, if you like.`], c.seed),
        offers: [
          { id: 'fill', label: `Do ${c.fits.title.length > 18 ? 'it' : c.fits.title}`, icon: 'plus', taskId: c.fits.id },
          { id: 'breathe', label: 'Take a break', icon: 'wind' },
        ],
      };
    }
    case 'focusEnd':
      if (!k || !c.own) return null;
      return { line: `Nice focus${c.who ? `, ${c.who}` : ''}! Is ${q(c.title)} done?`, offers: [{ id: 'tick', label: 'Yes, done', icon: 'check', key: k }, { ...START, label: '2 more minutes', key: k }] };
    default:
      return null;
  }
}

/** Words that never appear in anything Alef says on its own (checked in tests). */
export const UNKIND = /\b(overdue|failed|failure|missed|behind|lazy|should have|you forgot|again\?|why didn't|late again|wasted)\b/i;
