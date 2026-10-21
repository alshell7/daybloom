// Help me start, the pure side: one tiny, concrete first step for a block that hasn't started
// (2 or 5 minutes, something you can do right now without deciding anything) and one warm line
// that lowers the bar. With an AI service the step fits this exact task; without one it comes
// from Make it smaller's built-in first steps. Prompts and parsing are pure, for tests.

import { UNKIND } from './addons/alef/coach';
import { makeSmaller } from './addons/smaller/split';
import type { CategoryId } from './engine/types';

export interface FirstStep {
  /** What to do, as a short imperative ("Open the doc and write one messy line"). */
  step: string;
  minutes: 2 | 5;
  /** A warm line that lowers the bar. */
  nudge: string;
  via: 'ai' | 'device';
}

export interface StartContext {
  title: string;
  notes?: string;
  category: CategoryId;
  /** The block's length and how much of it is left. */
  minutes: number;
  leftMin?: number;
  /** Minutes since it began (0 = it's about to). */
  sinceMin?: number;
  /** The first step it already has that isn't done. */
  nextStep?: string | null;
  about?: string | null;
  /** Ideas already offered, for "Another idea". */
  avoid?: string[];
}

const NUDGES = [
  'Ready when you are. The first bit is tiny.',
  'No need to do all of it. Just this, for now:',
  'Starting is the hard part, so let’s make it small.',
  'Two minutes, then see how it feels. Stopping is allowed.',
];

/** A first step without AI: the task's own next step if it has one, else a built-in two-minute start. */
export function deviceStep(c: StartContext, seed = 0): FirstStep {
  const nudge = NUDGES[Math.abs(seed) % NUDGES.length];
  if (c.nextStep?.trim()) return { step: c.nextStep.trim(), minutes: 2, nudge, via: 'device' };
  const first = makeSmaller(c.title, { category: c.category, minutes: c.minutes, variant: Math.abs(seed) % 2 })[0];
  return { step: first?.title || `Open what you need for ${c.title}`, minutes: 2, nudge, via: 'device' };
}

export function startPrompt(c: StartContext): { system: string; user: string } {
  const system = [
    'You help someone take the very first step on a task they have not started yet. Starting is the hard part for them, so make it tiny, concrete and obvious.',
    'Answer with JSON only: {"step":"…","minutes":2,"nudge":"…"}.',
    '"step": ONE physical action they can do right now without deciding anything, specific to this exact task and its notes (open the file called…, write one ugly sentence about…, put the … on the desk, find the email from…). At most 10 words, an imperative. Never generic ("get started", "plan it", "focus"). If the task already has a next step, make an even smaller way into it.',
    'Never invent names of files, people, places or tools that are not in the task or its notes; say "the report", not "Final_Report.docx".',
    '"minutes": 2, or 5 only if 2 is truly too short.',
    '"nudge": one warm, calm sentence (at most 16 words) that lowers the bar and invites, like a kind friend beside them. Never guilt or pressure: no "should", "late", "behind", "finally", "missed", "procrastinat".',
    'Write in the language of the task title.',
  ].join('\n');
  const user = [
    `Task: ${c.title}`,
    c.notes?.trim() ? `Notes: ${c.notes.trim().slice(0, 600)}` : '',
    `Kind: ${c.category}`,
    `Block: ${c.minutes} minutes${c.leftMin != null ? `, ${c.leftMin} left` : ''}${c.sinceMin ? `; it began ${c.sinceMin} minutes ago and hasn't started yet` : ''}`,
    c.nextStep ? `Its next step: ${c.nextStep}` : '',
    c.about?.trim() ? `About them (fit the step to them; don't mention it): ${c.about.trim().slice(0, 400)}` : '',
    c.avoid?.length ? `Something different from: ${c.avoid.join(' | ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  return { system, user };
}

/** The step in a reply, tidied; null when it's missing, too long, generic or unkind. */
export function parseStep(reply: string): Omit<FirstStep, 'via'> | null {
  const m = /\{[\s\S]*\}/.exec(reply);
  if (!m) return null;
  let j: any;
  try {
    j = JSON.parse(m[0]);
  } catch {
    return null;
  }
  const step = String(j?.step ?? '').trim().replace(/[.!]+$/, '');
  const nudge = String(j?.nudge ?? '').trim();
  if (!step || step.length > 90 || !nudge || nudge.length > 140) return null;
  if (UNKIND.test(step) || UNKIND.test(nudge) || /\b(procrastinat\w*|finally|should)\b/i.test(nudge)) return null;
  if (/^(get started|start( working)?|begin|focus|plan( it)?|work on it)$/i.test(step)) return null;
  return { step, minutes: Number(j?.minutes) >= 4 ? 5 : 2, nudge };
}
