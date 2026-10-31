// The Eisenhower matrix for the backlog: is it urgent (a deadline is close), is it important
// (it matters to you)? Four quadrants, each with its own honest next move:
//
//   Do now        urgent and important        → today, ideally next
//   Schedule      important, not urgent       → give it a day before it turns urgent
//   Make it quick urgent, not important        → batch them into one short block, or hand off
//   Let go        neither                      → someday, or drop it without guilt
//
// You can place a task yourself (its `urgent` / `important` flags); otherwise urgency comes from
// its due date and importance from its priority (Must and Should matter). Pure, for tests.

import type { ISODate, Task } from './engine/types';
import { addDays } from './engine/time';

export type Quadrant = 'do' | 'plan' | 'quick' | 'drop';

export const QUADRANTS: { id: Quadrant; title: string; short: string; hint: string; icon: string; urgent: boolean; important: boolean }[] = [
  { id: 'do', title: 'Do now', short: 'Do', hint: 'Urgent and important', icon: 'zap', urgent: true, important: true },
  { id: 'plan', title: 'Schedule', short: 'Plan', hint: 'Important, not urgent', icon: 'calendar-plus', urgent: false, important: true },
  { id: 'quick', title: 'Make it quick', short: 'Quick', hint: 'Urgent, less important', icon: 'timer', urgent: true, important: false },
  { id: 'drop', title: 'Let go', short: 'Later', hint: 'Neither, for now', icon: 'cloud', urgent: false, important: false },
];

/** A due date this close (or past) makes a task urgent. */
export const URGENT_DAYS = 2;

export function isUrgent(t: Pick<Task, 'urgent' | 'due'>, today: ISODate): boolean {
  if (typeof t.urgent === 'boolean') return t.urgent;
  return !!t.due && t.due <= addDays(today, URGENT_DAYS);
}

export function isImportant(t: Pick<Task, 'important' | 'priority'>): boolean {
  if (typeof t.important === 'boolean') return t.important;
  return t.priority === 1 || t.priority === 2;
}

export function quadrantOf(t: Pick<Task, 'urgent' | 'important' | 'due' | 'priority'>, today: ISODate): Quadrant {
  const u = isUrgent(t, today);
  const i = isImportant(t);
  return u && i ? 'do' : i ? 'plan' : u ? 'quick' : 'drop';
}

/** Whether you placed it yourself (so a sort never moves it). A sort's own placing doesn't count. */
export const placedByYou = (t: Pick<Task, 'urgent' | 'important' | 'matrixBy'>) => (typeof t.urgent === 'boolean' || typeof t.important === 'boolean') && t.matrixBy !== 'sort';

/** The fields that put a task in a quadrant (by your hand). */
export function patchFor(q: Quadrant): Pick<Task, 'urgent' | 'important' | 'matrixBy'> {
  const d = QUADRANTS.find((x) => x.id === q)!;
  return { urgent: d.urgent, important: d.important, matrixBy: null };
}

/** Open backlog tasks by quadrant, each sorted by what's most pressing first. */
export function byQuadrant(items: Task[], today: ISODate): Record<Quadrant, Task[]> {
  const out: Record<Quadrant, Task[]> = { do: [], plan: [], quick: [], drop: [] };
  for (const t of items) out[quadrantOf(t, today)].push(t);
  const key = (t: Task) => `${t.due ?? '9999'}|${t.priority ?? 9}|${String(Math.round((t.order ?? 0) + 1e12)).padStart(16, '0')}`;
  for (const q of Object.keys(out) as Quadrant[]) out[q].sort((a, z) => (key(a) < key(z) ? -1 : key(a) > key(z) ? 1 : 0));
  return out;
}

// ── Suggestions (Decision or an AI service) ───────────────────────────────────

export interface MatrixGuess {
  taskId: string;
  urgent: boolean;
  important: boolean;
  why: string;
}

/** The prompt for an AI service: place each task, with a few words why. */
export function matrixPrompt(items: { id: string; title: string; due?: string | null; notes?: string; priority?: number | null }[], today: ISODate, about?: string | null): { system: string; user: string } {
  const system = [
    'You help someone sort their to-do list with the Eisenhower matrix.',
    'For each task decide: "urgent" (has a real deadline or time pressure within about two days) and "important" (it matters for their health, people, work or goals, beyond the moment).',
    'Be honest and kind; most errands are not important, many ideas are not urgent.',
    'Answer with JSON only: {"tasks":[{"id":"…","urgent":true,"important":false,"why":"…"}]}. "why": at most 8 words, plain and warm.',
  ].join('\n');
  const lines = items.map((t) => `- id ${t.id}: ${t.title}${t.due ? ` (due ${t.due})` : ''}${t.priority === 1 ? ' [must]' : t.priority === 2 ? ' [should]' : ''}${t.notes ? ` — ${t.notes.slice(0, 120)}` : ''}`);
  const user = [`Today is ${today}.`, about ? `About them: ${about.slice(0, 300)}` : '', 'Tasks:', ...lines].filter(Boolean).join('\n');
  return { system, user };
}

export function parseMatrix(text: string, ids: Set<string>): MatrixGuess[] {
  const m = /\{[\s\S]*\}/.exec(text ?? '');
  if (!m) return [];
  try {
    const o = JSON.parse(m[0]);
    const list = Array.isArray(o?.tasks) ? o.tasks : [];
    return list
      .filter((x: any) => x && ids.has(String(x.id)) && typeof x.urgent === 'boolean' && typeof x.important === 'boolean')
      .map((x: any) => ({ taskId: String(x.id), urgent: x.urgent, important: x.important, why: String(x.why ?? '').slice(0, 80) }));
  } catch {
    return [];
  }
}
