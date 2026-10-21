// Reality check with an AI service (Settings › AI › Reality check). Two practical things:
//
//   aiEstimate — a realistic length for one block: the service reads the task (title, notes,
//     steps) next to how long similar blocks really took you, and answers with minutes, a
//     one-line reason and, when it helps, a tip ("split it in two").
//   aiTips — a look across your record and today's plan: up to three practical tips, each with
//     a one-tap fix where there is one (give a repeating task its real length, move one block to
//     tomorrow so today fits).
//
// Prompts and parsers are pure (tested); answers are kept for the session so asking is rare.

import { ai } from '../../ai/hub.svelte';
import { chatOnce } from '../../ai/providers';
import { MINUTE } from '../../engine/time';
import type { Task } from '../../engine/types';
import { platform } from '../../platform';
import { UNKIND } from '../alef/coach';
import { kindKey, summarize, type Sample } from './reality';

// ── Estimates ─────────────────────────────────────────────────────────────────

export interface AiEstimate {
  minutes: number;
  confidence: 'low' | 'medium' | 'high';
  /** One short reason, in plain words. */
  why: string;
  tip?: string;
}

const words = (t: string) => new Set(kindKey(t).split(' ').filter((w) => w.length > 2));

/** Past blocks most like this task: the same kind first, then shared words, then the same category. */
export function similar(samples: Sample[], o: { title: string; category: string }, n = 20): Sample[] {
  const key = kindKey(o.title);
  const mine = words(o.title);
  const score = (s: Sample) => {
    if (kindKey(s.title) === key) return 3;
    const shared = [...words(s.title)].filter((w) => mine.has(w)).length;
    if (shared) return 1 + Math.min(1, shared / Math.max(1, mine.size));
    return s.category === o.category ? 0.5 : 0;
  };
  return samples
    .map((s) => ({ s, k: score(s) }))
    .filter((x) => x.k > 0)
    .sort((a, b) => b.k - a.k || b.s.at - a.s.at)
    .slice(0, n)
    .map((x) => x.s);
}

const line = (s: Sample) => `- ${s.title} · planned ${s.planned}m → really ${s.actual}m (${s.source === 'tick' ? 'when ticked' : s.source})`;

export function estimatePrompt(o: { title: string; notes?: string; minutes: number; category: string; steps?: string[]; when?: string; samples: Sample[] }): { system: string; user: string } {
  const sum = summarize(o.samples);
  const like = similar(o.samples, o);
  const system = [
    'You help a person plan realistic lengths for their day planner blocks, using their own track record first and general knowledge second.',
    'Answer with JSON only: {"minutes":50,"confidence":"low|medium|high","why":"…","tip":"…"}.',
    '"minutes" is the length you would plan (5 to 600, a multiple of 5). If what they planned already fits, give the same minutes. "why" is one short, friendly sentence (at most 18 words) that names the evidence ("your writing blocks run about 40% long"). "tip" is optional: one practical move (split it, add a buffer, do the hard part first) — leave it out if there is nothing useful.',
    'High confidence only with several very similar past blocks; low when guessing from the title. Never shame: no "always late", "underestimate", "failed".',
  ].join('\n');
  const user = [
    `Block: ${o.title}`,
    o.notes?.trim() ? `Notes: ${o.notes.trim().slice(0, 600)}` : '',
    o.steps?.length ? `Its steps: ${o.steps.slice(0, 10).join('; ')}` : '',
    `Kind: ${o.category}`,
    `Planned: ${o.minutes} minutes${o.when ? ` (${o.when})` : ''}`,
    sum.ratio != null ? `Overall, their blocks take ${Math.round(sum.ratio * 100)}% of the planned time (${sum.n} finished blocks).` : 'They have no finished blocks recorded yet.',
    like.length ? `Similar past blocks:\n${like.map(line).join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  return { system, user };
}

export function parseEstimate(reply: string): AiEstimate | null {
  const m = /\{[\s\S]*\}/.exec(reply);
  if (!m) return null;
  let j: any;
  try {
    j = JSON.parse(m[0]);
  } catch {
    return null;
  }
  const minutes = Math.round(Number(j?.minutes) / 5) * 5;
  const why = String(j?.why ?? '').trim().slice(0, 160);
  if (!Number.isFinite(minutes) || minutes < 5 || minutes > 600 || !why || UNKIND.test(why)) return null;
  const confidence = ['low', 'medium', 'high'].includes(j?.confidence) ? j.confidence : 'low';
  const tip = typeof j?.tip === 'string' && j.tip.trim() && !UNKIND.test(j.tip) ? j.tip.trim().slice(0, 160) : undefined;
  return { minutes, confidence, why, ...(tip ? { tip } : {}) };
}

// ── Tips ──────────────────────────────────────────────────────────────────────

export type TipAction = { type: 'length'; task: string; minutes: number } | { type: 'tomorrow'; key: string };

export interface Tip {
  title: string;
  detail: string;
  action?: TipAction;
}

export interface Tips {
  headline: string;
  tips: Tip[];
}

/** Today's plan, as the tips see it: what's left, its planned length and the usual real one. */
export interface PlanLine {
  key: string;
  title: string;
  start: string;
  planned: number;
  /** What blocks like it usually take (when known). */
  usual?: number;
}

export function tipsPrompt(o: { samples: Sample[]; today: PlanLine[]; freeMin: number | null; recurring: string[] }): { system: string; user: string } {
  const sum = summarize(o.samples);
  const system = [
    'You are a practical, kind planning coach. You look at how long someone\'s blocks really take compared with what they plan, and at what is left of today, and give at most three practical tips that make their plans fit reality.',
    'Answer with JSON only: {"headline":"…","tips":[{"title":"…","detail":"…","action":null}]}.',
    'Each tip: a short title (at most 8 words) and one or two plain sentences of detail with the numbers. An "action" is optional and must be one of: {"type":"length","task":"<exact title from Repeating tasks>","minutes":55} to give a repeating task a realistic length, or {"type":"tomorrow","key":"<exact key from Today>"} to move one of today\'s blocks to tomorrow when today does not fit. Only use titles and keys exactly as given. Lead with what is going well when something is. "headline" is one encouraging sentence.',
    'Never shame or scold: no "always late", "underestimate", "failed", "behind", "should". Plans bending is normal.',
  ].join('\n');
  const user = [
    sum.ratio != null ? `Overall: blocks take ${Math.round(sum.ratio * 100)}% of the planned time (${sum.n} finished blocks).` : 'No finished blocks recorded yet.',
    sum.byTitle.length ? `By task (planned → really, median, times):\n${sum.byTitle.slice(0, 12).map((g) => `- ${g.label}: ${g.planned}m → ${g.actual}m, ${g.n}×`).join('\n')}` : '',
    sum.byCategory.length ? `By kind:\n${sum.byCategory.map((g) => `- ${g.label}: ${g.planned}m → ${g.actual}m, ${g.n}×`).join('\n')}` : '',
    o.recurring.length ? `Repeating tasks: ${o.recurring.slice(0, 20).join('; ')}` : '',
    o.today.length ? `Today, still ahead (key · start · title · planned · usually):\n${o.today.map((b) => `- ${b.key} · ${b.start} · ${b.title} · ${b.planned}m${b.usual ? ` · ~${b.usual}m` : ''}`).join('\n')}` : 'Nothing left planned today.',
    o.freeMin != null ? `Free time left today: ${o.freeMin} minutes.` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
  return { system, user };
}

export function parseTips(reply: string, o: { keys: string[]; recurring: string[] }): Tips | null {
  const m = /\{[\s\S]*\}/.exec(reply);
  if (!m) return null;
  let j: any;
  try {
    j = JSON.parse(m[0]);
  } catch {
    return null;
  }
  const clean = (x: unknown, n: number) => String(x ?? '').trim().slice(0, n);
  const tips: Tip[] = (Array.isArray(j?.tips) ? j.tips : [])
    .map((t: any): Tip | null => {
      const title = clean(t?.title, 80);
      const detail = clean(t?.detail, 280);
      if (!title || !detail || UNKIND.test(title) || UNKIND.test(detail)) return null;
      const a = t?.action;
      let action: TipAction | undefined;
      if (a?.type === 'length' && o.recurring.some((r) => kindKey(r) === kindKey(String(a.task ?? ''))) && Number.isFinite(Number(a.minutes))) {
        action = { type: 'length', task: String(a.task), minutes: Math.max(5, Math.min(600, Math.round(Number(a.minutes) / 5) * 5)) };
      } else if (a?.type === 'tomorrow' && o.keys.includes(String(a.key ?? ''))) action = { type: 'tomorrow', key: String(a.key) };
      return { title, detail, ...(action ? { action } : {}) };
    })
    .filter((t: Tip | null): t is Tip => !!t)
    .slice(0, 3);
  const headline = clean(j?.headline, 160);
  if (!tips.length) return null;
  return { headline: headline && !UNKIND.test(headline) ? headline : 'A few ways to make plans fit', tips };
}

// ── Live ──────────────────────────────────────────────────────────────────────

const estimates = new Map<string, AiEstimate | null>();

async function ask(system: string, user: string, tokens: number): Promise<string | null> {
  const conn = await ai.connection('reality', 'think');
  if (!conn) return null;
  try {
    const r = await chatOnce(conn.config, conn.key, [{ role: 'system', content: system }, { role: 'user', content: user }], null, (u, i) => platform.fetch(u, i), tokens);
    return r.content;
  } catch (e) {
    console.warn('[daybloom] reality check', e);
    return null;
  }
}

/** A realistic length for a task (kept for the session), or null. */
export async function aiEstimate(task: Task, minutes: number, samples: Sample[], when?: string): Promise<AiEstimate | null> {
  if (!ai.ready('reality', 'think') || !task.title.trim()) return null;
  const id = `${kindKey(task.title)}|${minutes}|${task.notes.length}|${task.subtasks.length}`;
  if (estimates.has(id)) return estimates.get(id) ?? null;
  const p = estimatePrompt({ title: task.title, notes: task.notes, minutes, category: task.category, steps: task.subtasks.map((s) => s.title), when, samples });
  const reply = await ask(p.system, p.user, 300);
  const est = reply ? parseEstimate(reply) : null;
  estimates.set(id, est);
  return est;
}

/** Practical tips for your record and today, or null. */
export async function aiTips(o: { samples: Sample[]; today: PlanLine[]; freeMin: number | null; recurring: string[] }): Promise<Tips | null> {
  if (!ai.ready('reality', 'think')) return null;
  const p = tipsPrompt(o);
  // One unusable answer (cut short, or every tip too blunt) gets one more try.
  for (let i = 0; i < 2; i++) {
    const reply = await ask(p.system, p.user, 700);
    const tips = reply ? parseTips(reply, { keys: o.today.map((t) => t.key), recurring: o.recurring }) : null;
    if (tips || !reply) return tips;
  }
  return null;
}

/** Minutes, as the prompts say them. */
export const mins = (ms: number) => Math.round(ms / MINUTE);
