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
  { id: 'person', type: 'span', text: 'Extract the person.' },
  { id: 'place', type: 'span', text: 'Extract the place.' },
  { id: 'length', type: 'span', text: 'Extract how long it takes.' },
  { id: 'deadline', type: 'noul', text: 'This has a deadline.' },
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
  /** The line itself (to read what the model pulled out of it). */
  line?: string;
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
  /** What it pulled out of the line: who, where, how long (minutes). */
  found: { person?: string; place?: string; minutes?: number };
}

/** People words that count even in lower case ("call mom"). */
const KIN = /^(mom|mum|mother|dad|father|parents|wife|husband|partner|sister|brother|son|daughter|kids|grandma|grandpa|aunt|uncle|cousin|friend|friends|boss|manager|team|client|landlord|neighbour|neighbor)$/i;
const NOT_PEOPLE = /^(it|this|that|milk|bread|eggs|bill|bills|invoice|report|car|tap|parcel|card|passport|garage|photos?)$/i;

/** "2 hours", "30 min", "half an hour", "an hour and a half" → minutes. */
export function minutesIn(text: string): number | null {
  const t = text.toLowerCase();
  if (/half an? hour/.test(t)) return 30;
  if (/an? hour and a half|1\.5 ?h/.test(t)) return 90;
  if (/quarter of an hour/.test(t)) return 15;
  const m = /(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes)\b/.exec(t);
  if (m) {
    const n = Number(m[1]);
    const v = /^h/.test(m[2]) ? n * 60 : n;
    return v >= 5 && v <= 12 * 60 ? Math.round(v / 5) * 5 : null;
  }
  if (/\b(an|one) hour\b/.test(t)) return 60;
  return null;
}

/** The spans worth showing: a person who looks like one, a place, a length. */
export function findings(line: string, byId: Map<string, Answer | undefined>): Suggestion['found'] {
  const span = (id: string, floor: number) => {
    const a = byId.get(id);
    return a && a.type === 'span' && a.p_present >= floor && a.text.trim() ? a.text.trim() : '';
  };
  const out: Suggestion['found'] = {};
  const who = span('person', 0.6);
  if (who && !NOT_PEOPLE.test(who) && (KIN.test(who) || /^[A-Z][\p{L}'-]+/u.test(line.slice(line.indexOf(who))))) out.person = who;
  const where = span('place', 0.6);
  if (where && where !== out.person && !NOT_PEOPLE.test(where)) out.place = where;
  const len = span('length', 0.5);
  const mins = len ? minutesIn(len) : null;
  if (mins) out.minutes = mins;
  return out;
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

  const second = w ? [...w.probs].sort((a, z) => z - a)[1] ?? 0 : 0;
  const deadline = noul(byId.get('deadline'));
  // Where: what was written first, then the model, then the Inbox when it isn't sure. The model
  // counts when its pick stands out (a clear lead over the next), not only when it's high.
  const clear = !!w && whenP >= WHEN_FLOOR - 0.05 && whenP - second >= 0.08;
  let dest: Destination;
  let sure: number;
  let why: string;
  if (rules.someday) [dest, sure, why] = ['someday', 0.95, 'You said someday'];
  else if (rules.hasTime) [dest, sure, why] = [rules.day === 'tomorrow' ? 'tomorrow' : 'today', 0.95, 'It has a time'];
  else if (rules.day === 'today' || rules.day === 'tomorrow') [dest, sure, why] = [rules.day, 0.9, rules.day === 'today' ? 'You said today' : 'You said tomorrow'];
  else if (rules.later || rules.day === 'later') [dest, sure, why] = ['next', 0.85, rules.day === 'later' ? 'It has a due date' : 'You said later'];
  else if (urgent >= 0.72) [dest, sure, why] = ['today', urgent, 'Sounds urgent, so today'];
  else if (deadline >= 0.6) [dest, sure, why] = ['next', deadline, 'It has a deadline'];
  else if (!clear) [dest, sure, why] = ['inbox', 1 - whenP, 'Not sure yet, so it waits in the Inbox'];
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

  const found = findings(rules.line ?? '', byId);
  const category = rules.category ?? (kind && kindP >= KIND_FLOOR ? kind : found.person ? 'social' : null);
  let energy = rules.energy;
  if (!energy && e && typeof e.score === 'number' && e.confidence > 0.15) energy = e.score < 0.34 ? 1 : e.score > 0.72 ? 3 : null;

  return { dest, sure: Math.max(0, Math.min(1, sure)), category, priority, energy, why, model, found };
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
    { hasTime: false, day: null, later: false, someday: false, priority: null, energy: null, category: null, line: title },
  );
  if (s.dest === 'inbox') return null;
  const to = s.dest === 'tomorrow' ? 'next' : s.dest;
  return { taskId, title, to, priority: s.priority, why: s.why, sure: s.sure };
}

// ── The Eisenhower matrix: urgent × important, ranked within your own list ────

export const MATRIX_QUESTIONS: Question[] = [
  { id: 'm_urgent', type: 'noul', text: 'This is urgent.' },
  { id: 'm_deadline', type: 'noul', text: 'This has a deadline.' },
  { id: 'm_matters', type: 'noul', text: 'This matters for health, people, work or goals.' },
  { id: 'm_problem', type: 'noul', text: 'Skipping this would cause a real problem.' },
  { id: 'm_important', type: 'noul', text: 'This task is important.' },
];

export interface MatrixScore {
  taskId: string;
  urgent: number;
  important: number;
}

/** One task's two scores from its answers (in MATRIX_QUESTIONS order). */
export function matrixScore(taskId: string, answers: Answer[], category?: CategoryId | null): MatrixScore {
  const p = (i: number) => noul(answers[i]);
  const urgent = Math.max(p(0), p(1) * 0.9);
  // Care and people lean important; the model's own "important" is weak alone, so it counts least.
  const lean = category === 'care' || category === 'social' ? 0.08 : category === 'rest' ? -0.05 : 0;
  const important = 0.45 * p(2) + 0.35 * p(3) + 0.2 * p(4) + lean;
  return { taskId, urgent, important };
}

const quantile = (xs: number[], q: number) => {
  if (!xs.length) return Infinity;
  const s = [...xs].sort((a, z) => a - z);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))];
};

/**
 * Where each task sits, judged against the rest of your list as well as on its own: clearly
 * urgent or important ones always count, and of the rest the most urgent quarter and the most
 * important ~40% do too — so a sort always tells your list apart instead of piling it in one place.
 */
export function placeByScores(scores: MatrixScore[]): { taskId: string; urgent: boolean; important: boolean; why: string }[] {
  const uCut = Math.max(0.3, quantile(scores.map((s) => s.urgent), 0.75));
  const iCut = Math.max(0.2, quantile(scores.map((s) => s.important), 0.6));
  return scores.map((s) => {
    const urgent = s.urgent >= 0.6 || (scores.length >= 4 && s.urgent >= uCut);
    const important = s.important >= 0.45 || (scores.length >= 3 && s.important >= iCut);
    const why = urgent && important ? 'Pressing, and it matters' : important ? 'It matters; give it time' : urgent ? 'Time-bound, but lighter' : 'Nothing pressing in it';
    return { taskId: s.taskId, urgent, important, why };
  });
}
