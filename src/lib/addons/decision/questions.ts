// Decision (addon): the questions Daybloom asks TinyDecide about what you write, and what the
// answers mean for your day. TinyDecide reads one line and answers every question in one pass
// with probabilities, so each answer comes with how sure it is. The rules in quickadd.ts and
// backlog.ts stay in charge of what is written plainly ("5pm", "by fri", "!!"); the model
// decides what is only implied: when it belongs, how urgent it is, what kind of thing it is.
// Pure, for tests: the model runs in decide.worker.ts, the state lives in decision.svelte.ts.

import type { CategoryId } from '../../engine/types';

export type QuestionType = 'choice' | 'noul' | 'score' | 'span';

export interface Question {
  /** Ours, for corrections and reading the answers back. */
  id: string;
  type: QuestionType;
  text: string;
  options?: string[];
}

/** What TinyDecide returns per question (a subset of its own Answer types). */
export type Answer =
  | { type: 'choice' | 'score'; probs: number[]; pick: number; confidence: number; score?: number; qvec?: number[]; z0?: number[] }
  | { type: 'noul'; p: number; qvec?: number[]; z0?: number[] }
  | { type: 'span'; text: string; p_present: number; char?: [number, number] | null };

// ── Capture: where a new line belongs ─────────────────────────────────────────

/** When it should happen, as the model is asked it (order matters: corrections store the index). */
// Three plain choices: with more, a line that says nothing about time spreads thin over all of
// them; these three it tells apart well, and your confirmations sharpen it from there.
export const WHEN = ['today', 'soon', 'someday'] as const;
export type When = (typeof WHEN)[number];
const WHEN_TEXT: Record<When, string> = { today: 'today', soon: 'soon', someday: 'someday' };

/** The kinds of block, in the words the model understands best (same order as KINDS). */
export const KINDS: CategoryId[] = ['focus', 'care', 'routine', 'social', 'rest', 'learn', 'move'];
const KIND_TEXT: Record<CategoryId, string> = {
  focus: 'work',
  care: 'health',
  routine: 'chores',
  social: 'people',
  rest: 'fun',
  learn: 'learning',
  move: 'exercise',
};

export const CAPTURE_QUESTIONS: Question[] = [
  { id: 'when', type: 'choice', text: 'When should this be done?', options: WHEN.map((w) => WHEN_TEXT[w]) },
  { id: 'urgent', type: 'noul', text: 'This is urgent.' },
  { id: 'kind', type: 'choice', text: 'What kind of task is this?', options: KINDS.map((k) => KIND_TEXT[k]) },
  { id: 'energy', type: 'score', text: 'How much focus or energy does it need?', options: ['very little', 'some', 'a lot'] },
  { id: 'time', type: 'span', text: 'Extract the time.' },
  { id: 'date', type: 'span', text: 'Extract the date or day.' },
];

/** Where a line goes: on the dial (today — or the day the line names — or tomorrow) or into a backlog list. */
export type Destination = 'today' | 'tomorrow' | 'next' | 'inbox' | 'someday';

export const DESTINATIONS: { id: Destination; label: string; icon: string }[] = [
  { id: 'today', label: 'Today', icon: 'dial' },
  { id: 'tomorrow', label: 'Tomorrow', icon: 'sunrise' },
  { id: 'next', label: 'Backlog · Next', icon: 'list' },
  { id: 'inbox', label: 'Backlog · Inbox', icon: 'inbox' },
  { id: 'someday', label: 'Someday', icon: 'cloud' },
];

/** The "when" option a destination teaches the model, when you pick it (inbox teaches nothing). */
export const WHEN_OF: Partial<Record<Destination, When>> = { today: 'today', tomorrow: 'soon', next: 'soon', someday: 'someday' };

/** What the rules already found in the line (quickadd.ts / backlog.ts). */
export interface RuleHints {
  /** A clock time was written ("5pm"). */
  hasTime: boolean;
  /** The day it was written for, if any: today, tomorrow or later ("fri"). */
  day: 'today' | 'tomorrow' | 'later' | null;
  /** "someday", "later" and friends were written. */
  later: boolean;
  someday: boolean;
  /** "!" / "!!" or "must". */
  priority: 1 | 2 | 3 | null;
  energy: 1 | 2 | 3 | null;
  /** The category the keyword rules suggest. */
  category: CategoryId | null;
}

export interface Suggestion {
  dest: Destination;
  /** 0–1: how sure the whole suggestion is (drives "Decision thinks" vs "maybe"). */
  sure: number;
  category: CategoryId | null;
  priority: 1 | 2 | 3 | null;
  energy: 1 | 2 | 3 | null;
  /** A few words on why, for the chip's tooltip and the confirm card. */
  why: string;
  /** What the model thinks, before the rules had their say (for teaching and the panel). */
  model: { when: When; whenP: number; urgent: number; kind: CategoryId | null; kindP: number };
}

const choice = (a: Answer | undefined) => (a && (a.type === 'choice' || a.type === 'score') ? a : null);
const noul = (a: Answer | undefined) => (a && a.type === 'noul' ? a.p : 0);

/** Below this the model's "when" isn't trusted: the line waits in the Inbox for you to sort. */
export const WHEN_FLOOR = 0.45;
const KIND_FLOOR = 0.35;

/**
 * Turns the answers (in CAPTURE_QUESTIONS order) and the rules' findings into one suggestion.
 * Written words always win; the model fills in what was left unsaid.
 */
export function interpretCapture(answers: Answer[], rules: RuleHints): Suggestion {
  const byId = new Map(CAPTURE_QUESTIONS.map((q, i) => [q.id, answers[i]]));
  const w = choice(byId.get('when'));
  const when: When = w ? WHEN[w.pick] ?? 'soon' : 'soon';
  const whenP = w ? w.probs[w.pick] ?? 0 : 0;
  const urgent = noul(byId.get('urgent'));
  const k = choice(byId.get('kind'));
  const kind = k ? KINDS[k.pick] ?? null : null;
  const kindP = k ? k.probs[k.pick] ?? 0 : 0;
  const e = choice(byId.get('energy'));
  const model = { when, whenP, urgent, kind, kindP };

  // Where: what was written first, then the model, then the Inbox when it isn't sure.
  let dest: Destination;
  let sure: number;
  let why: string;
  if (rules.someday) [dest, sure, why] = ['someday', 0.95, 'You said someday'];
  else if (rules.hasTime) [dest, sure, why] = [rules.day === 'tomorrow' ? 'tomorrow' : 'today', 0.95, 'It has a time'];
  else if (rules.day === 'today' || rules.day === 'tomorrow') [dest, sure, why] = [rules.day, 0.9, rules.day === 'today' ? 'You said today' : 'You said tomorrow'];
  else if (rules.later || rules.day === 'later') [dest, sure, why] = ['next', 0.85, rules.day === 'later' ? 'It has a due date' : 'You said later'];
  else if (!w || whenP < WHEN_FLOOR) [dest, sure, why] = ['inbox', 1 - whenP, 'Not sure yet, so it waits in the Inbox'];
  else {
    const map: Record<When, Destination> = { today: 'today', soon: 'next', someday: 'someday' };
    dest = map[when];
    sure = whenP;
    why = { today: 'Sounds like today', soon: 'Soon, not today', someday: 'Sounds like a someday idea' }[when];
  }

  // Urgent and not placed today: it should at least lead the backlog.
  let priority = rules.priority;
  if (!priority && urgent >= 0.8) priority = 1;
  else if (!priority && urgent >= 0.62) priority = 2;
  if (priority === 1 && urgent >= 0.8 && dest === 'inbox') {
    dest = 'next';
    why = 'Sounds urgent';
  }

  const category = rules.category ?? (kind && kindP >= KIND_FLOOR ? kind : null);
  let energy = rules.energy;
  if (!energy && e && typeof e.score === 'number' && e.confidence > 0.15) energy = e.score < 0.34 ? 1 : e.score > 0.72 ? 3 : null;

  return { dest, sure: Math.max(0, Math.min(1, sure)), category, priority, energy, why, model };
}

// ── Inbox triage: sort what's waiting ─────────────────────────────────────────

export const TRIAGE_QUESTIONS: Question[] = CAPTURE_QUESTIONS.filter((q) => q.type !== 'span');

/** A move the triage proposes for one inbox item (you confirm each). */
export interface TriageMove {
  taskId: string;
  title: string;
  to: 'next' | 'someday' | 'today';
  priority: 1 | 2 | 3 | null;
  why: string;
  sure: number;
}

export function interpretTriage(taskId: string, title: string, answers: Answer[]): TriageMove | null {
  const s = interpretCapture(
    CAPTURE_QUESTIONS.map((q) => answers[TRIAGE_QUESTIONS.findIndex((t) => t.id === q.id)] ?? (q.type === 'span' ? { type: 'span', text: '', p_present: 0 } : undefined)) as Answer[],
    { hasTime: false, day: null, later: false, someday: false, priority: null, energy: null, category: null },
  );
  if (s.dest === 'inbox') return null;
  const to = s.dest === 'tomorrow' ? 'next' : s.dest;
  return { taskId, title, to, priority: s.priority, why: s.why, sure: s.sure };
}
