// Decision with an AI service as its brain (Settings › AI › Decision): the same three jobs as
// TinyDecide — place a jotted line, sort the Inbox, place tasks in the Eisenhower matrix — asked
// in plain words and answered in JSON. What a line says plainly (a time, "tomorrow", "someday",
// "!!") still wins over the service, as it does over TinyDecide. Pure but for `call`, for tests.

import type { CategoryId } from '../../engine/types';
import { KINDS, minutesIn, type Destination, type RuleHints, type Suggestion, type TriageMove } from './questions';

export type Call = (system: string, user: string, maxTokens?: number) => Promise<string>;

const DESTS: Destination[] = ['today', 'tomorrow', 'next', 'inbox', 'someday'];
const KIND_WORDS: Record<CategoryId, string> = { focus: 'work/study', care: 'health/self-care', routine: 'chores/errands', social: 'people/calls', rest: 'rest/fun', learn: 'learning', move: 'exercise' };

function json(text: string): any {
  const m = /\{[\s\S]*\}/.exec(text ?? '');
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}
const level = (v: unknown) => (v === 1 || v === 2 || v === 3 ? v : null);
const str = (v: unknown, n: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : undefined);

export function capturePrompt(line: string): { system: string; user: string } {
  const system = [
    'You sort what someone jots down into their day planner. Decide where the line belongs and what it is.',
    `"dest": one of today (should happen today), tomorrow, next (a task for the coming days, no fixed day), inbox (truly unclear), someday (an idea or wish, no pressure).`,
    `"category": one of ${KINDS.map((k) => `${k} (${KIND_WORDS[k]})`).join(', ')}.`,
    '"priority": 1 must, 2 should, 3 could, or null. "energy": 1 low, 2 some, 3 high, or null. "minutes": how long it likely takes, or null.',
    '"person" and "place": who or where it involves, if the line says so, else null. "why": at most 6 plain words.',
    'Answer with JSON only: {"dest":"…","category":"…","priority":null,"energy":null,"minutes":null,"person":null,"place":null,"why":"…"}',
  ].join('\n');
  return { system, user: `Line: ${line.slice(0, 400)}` };
}

/** The service's answer, with what the line says plainly kept on top. */
export function readCapture(text: string, rules: RuleHints): Suggestion | null {
  const o = json(text);
  if (!o || !DESTS.includes(o.dest)) return null;
  let dest: Destination = o.dest;
  let why = str(o.why, 60) ?? '';
  if (rules.someday) [dest, why] = ['someday', 'You said someday'];
  else if (rules.hasTime) [dest, why] = [rules.day === 'tomorrow' ? 'tomorrow' : 'today', 'It has a time'];
  else if (rules.day === 'today' || rules.day === 'tomorrow') [dest, why] = [rules.day, rules.day === 'today' ? 'You said today' : 'You said tomorrow'];
  const category = rules.category ?? (KINDS.includes(o.category) ? (o.category as CategoryId) : null);
  const mins = typeof o.minutes === 'number' && o.minutes >= 5 && o.minutes <= 720 ? Math.round(o.minutes / 5) * 5 : null;
  const found: Suggestion['found'] = {};
  const person = str(o.person, 40);
  const place = str(o.place, 40);
  if (person) found.person = person;
  if (place) found.place = place;
  if (mins) found.minutes = mins;
  return {
    dest,
    sure: 0.8,
    category,
    priority: rules.priority ?? level(o.priority),
    energy: rules.energy ?? level(o.energy),
    why: why || 'Suggested',
    model: { when: dest === 'someday' ? 'someday' : dest === 'today' ? 'today' : 'soon', whenP: 0.8, urgent: o.priority === 1 ? 0.8 : 0.2, kind: category, kindP: 0.8 },
    found,
  };
}

export async function aiCapture(call: Call, line: string, rules: RuleHints): Promise<Suggestion | null> {
  const p = capturePrompt(line);
  return readCapture(await call(p.system, p.user, 300), rules);
}

export function matrixAiPrompt(items: { id: string; title: string }[]): { system: string; user: string } {
  const system = [
    'You sort a to-do list with the Eisenhower matrix. For each task: "urgent" = real time pressure in the next couple of days; "important" = it matters for their health, people, work or goals.',
    'Tell the tasks apart: not everything is important, and not everything can wait. "why": at most 6 plain words.',
    'Answer with JSON only: {"tasks":[{"id":"…","urgent":true,"important":false,"why":"…"}]}',
  ].join('\n');
  return { system, user: items.map((t) => `- id ${t.id}: ${t.title.slice(0, 160)}`).join('\n') };
}

export async function aiMatrix(call: Call, items: { id: string; title: string }[]) {
  const p = matrixAiPrompt(items);
  const o = json(await call(p.system, p.user, 900));
  const ids = new Set(items.map((t) => t.id));
  return (Array.isArray(o?.tasks) ? o.tasks : [])
    .filter((x: any) => x && ids.has(String(x.id)) && typeof x.urgent === 'boolean' && typeof x.important === 'boolean')
    .map((x: any) => ({ taskId: String(x.id), urgent: x.urgent, important: x.important, why: str(x.why, 60) ?? '' }));
}

export function triagePrompt(items: { id: string; title: string }[]): { system: string; user: string } {
  const system = [
    'You help sort an Inbox of jotted-down tasks. For each, choose "to": next (do in the coming days), someday (an idea, no pressure), today (needs doing today), or inbox (truly unclear, leave it).',
    '"priority": 1 must, 2 should, 3 could, or null. "why": at most 6 plain words.',
    'Answer with JSON only: {"tasks":[{"id":"…","to":"next","priority":null,"why":"…"}]}',
  ].join('\n');
  return { system, user: items.map((t) => `- id ${t.id}: ${t.title.slice(0, 160)}`).join('\n') };
}

export async function aiTriage(call: Call, items: { id: string; title: string }[]): Promise<TriageMove[]> {
  const p = triagePrompt(items);
  const o = json(await call(p.system, p.user, 900));
  const byId = new Map(items.map((t) => [t.id, t.title]));
  return (Array.isArray(o?.tasks) ? o.tasks : [])
    .filter((x: any) => x && byId.has(String(x.id)) && ['next', 'someday', 'today'].includes(x.to))
    .map((x: any) => ({ taskId: String(x.id), title: byId.get(String(x.id))!, to: x.to, priority: level(x.priority), why: str(x.why, 60) ?? '', sure: 0.8 }));
}

export { minutesIn };
