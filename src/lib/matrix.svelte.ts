// The Eisenhower matrix, the live side: suggestions for where unsorted backlog items belong —
// from the AI service chosen for Getting started (it reads titles, due dates and notes), or
// from the Decision addon on this device — shown for you to confirm, never applied by itself.

import { ai } from './ai/hub.svelte';
import { chatOnce } from './ai/providers';
import { isOn } from './addons/registry';
import type { Task } from './engine/types';
import { isImportant, isUrgent, matrixPrompt, parseMatrix, placedByYou, quadrantOf, type MatrixGuess } from './matrix';
import { platform } from './platform';
import { tasks } from './stores/tasks.svelte';
import { view } from './stores/view.svelte';

/** Who can sort right now: Decision (TinyDecide or its AI service), an AI service, or nobody. */
export function suggester(): 'ai' | 'decision' | null {
  if (isOn('decision')) return 'decision';
  if (ai.ready('starter', 'think')) return 'ai';
  return null;
}

/**
 * Suggested places for the items you haven't placed yourself (at most 30 at a time). What the
 * task already says wins: a due date decides urgency and a priority decides importance; the
 * suggestion only fills in what's missing, and only items that would move are listed.
 */
export async function suggestPlaces(items: Task[]): Promise<MatrixGuess[]> {
  const raw = await guesses(items);
  const today = view.today;
  const out: MatrixGuess[] = [];
  for (const g of raw) {
    const t = tasks.get(g.taskId);
    if (!t) continue;
    const urgent = t.due ? isUrgent(t, today) : g.urgent;
    const important = t.priority ? isImportant(t) : g.important;
    if (quadrantOf({ urgent, important, due: null, priority: null }, today) === quadrantOf(t, today)) continue;
    out.push({ ...g, urgent, important });
  }
  return out;
}

async function guesses(items: Task[]): Promise<MatrixGuess[]> {
  const open = items.filter((t) => !placedByYou(t)).slice(0, 30);
  if (!open.length) return [];
  const who = suggester();
  if (who === 'decision') {
    const { decision } = await import('./addons/decision/decision.svelte');
    return decision.matrix(open.map((t) => ({ id: t.id, title: t.title, category: t.category })));
  }
  if (who === 'ai') {
    const conn = await ai.connection('starter', 'think');
    if (conn) {
      const p = matrixPrompt(open.map((t) => ({ id: t.id, title: t.title, due: t.due, notes: t.notes, priority: t.priority })), view.today);
      try {
        const r = await chatOnce(conn.config, conn.key, [{ role: 'system', content: p.system }, { role: 'user', content: p.user }], null, (u, i) => platform.fetch(u, i), 900);
        const got = parseMatrix(r.content, new Set(open.map((t) => t.id)));
        if (got.length) return got;
      } catch (e) {
        console.warn('[daybloom] matrix', e);
      }
    }
  }
  return [];
}

/** Places tasks (yours to undo). */
export function place(guesses: { taskId: string; urgent: boolean; important: boolean }[]) {
  const before = guesses.map((g) => {
    const t = tasks.get(g.taskId);
    return { id: g.taskId, urgent: t?.urgent ?? null, important: t?.important ?? null, matrixBy: t?.matrixBy ?? null };
  });
  for (const g of guesses) tasks.update(g.taskId, { urgent: g.urgent, important: g.important, matrixBy: 'sort' });
  return () => {
    for (const b of before) tasks.update(b.id, { urgent: b.urgent, important: b.important, matrixBy: b.matrixBy });
  };
}
