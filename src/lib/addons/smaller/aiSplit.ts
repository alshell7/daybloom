// Make it smaller with an AI service (Settings › AI › Make it smaller). The service gets what a
// good coach would want to know: the task's title, notes and existing steps, its energy and due
// date, when the block is and how much time there really is before the next thing, how long
// tasks like it really take you (Reality check), and what you wrote about yourself for Alef.
// It answers with 3–5 concrete steps that fit the time — the first a two-minute, obvious,
// physical start — each with a clear finish line, plus one practical tip. Any step can be split
// again. Anything unusable falls back to the built-in ideas.

import { ai } from '../../ai/hub.svelte';
import { chatOnce } from '../../ai/providers';
import { formatTime, MINUTE } from '../../engine/time';
import type { Block, Task } from '../../engine/types';
import { platform } from '../../platform';
import { clock } from '../../stores/clock.svelte';
import { view } from '../../stores/view.svelte';
import { isOn } from '../registry';
import type { StepIdea } from './split';

/** A step from the AI: what to do, how long, and how you know it's done. */
export interface AiStep extends StepIdea {
  doneWhen?: string;
}

export interface AiSplit {
  steps: AiStep[];
  /** One practical tip for doing this task (where, how, what to have ready). */
  tip?: string;
}

/** What the service is told about the task and its moment. Pure, for tests. */
export interface SplitContext {
  title: string;
  notes?: string;
  minutes: number;
  category?: string;
  energy?: 1 | 2 | 3 | null;
  due?: string | null;
  /** Steps already on the task (done ones are marked). */
  existing?: { title: string; done: boolean }[];
  /** "Today 15:00–16:00", "now, 25m left", "in the backlog". */
  when?: string;
  /** Free minutes until the next block, and what it is. */
  until?: { minutes: number; what: string } | null;
  /** From Reality check: how long tasks like this really take you. */
  reality?: string | null;
  /** What you wrote about yourself (Alef › About you). */
  about?: string | null;
  /** Ideas already shown, for "Other ideas". */
  avoid?: string[];
}

export function splitPrompt(c: SplitContext): { system: string; user: string } {
  const system = [
    'You are a kind, practical coach who helps people start a task that feels too big. You break it into small, concrete steps that fit the real time available.',
    `Answer with JSON only: {"steps":[{"title":"…","minutes":2,"done_when":"…"},…],"tip":"…"}.`,
    `Rules: 3 to 5 steps. Their minutes add up to about ${c.minutes} (never more than ${Math.max(c.minutes, 10)}). The first step is a 2-minute, obvious, physical start (open the file, put the shoes by the door, write one ugly sentence). Titles are short imperatives (at most 9 words), specific to this exact task and its notes — never generic ("research", "plan", "work on it"). "done_when" is a visible finish line in a few words ("3 bullet points on the page"). Build on any steps that already exist instead of repeating them. Put the hardest thinking where energy is best and end with a small, satisfying wrap-up step.`,
    `"tip" is one practical sentence about how to do it (what to have ready, where, a way around the usual snag), not a pep talk. Never guilt or shame; no "just", no "should".`,
    'Never invent names of files, people, places or tools that are not in the task or its notes.',
    'Write in the language of the task title.',
  ].join('\n');
  const lines = [`Task: ${c.title}`];
  if (c.notes?.trim()) lines.push(`Notes: ${c.notes.trim().slice(0, 900)}`);
  if (c.category) lines.push(`Kind: ${c.category}`);
  lines.push(`Time for it: ${c.minutes} minutes${c.when ? ` (${c.when})` : ''}`);
  if (c.until) lines.push(`Free until the next thing: ${c.until.minutes} minutes, then "${c.until.what}"`);
  if (c.energy) lines.push(`Energy it takes: ${['low', 'medium', 'high'][c.energy - 1]}`);
  if (c.due) lines.push(`Due: ${c.due}`);
  if (c.existing?.length) lines.push(`Steps it already has: ${c.existing.map((s) => `${s.done ? '[done] ' : ''}${s.title}`).join('; ')}`);
  if (c.reality) lines.push(`How long tasks like this really take this person: ${c.reality}`);
  if (c.about?.trim()) lines.push(`About the person (use it to fit the steps, don't mention it): ${c.about.trim().slice(0, 500)}`);
  if (c.avoid?.length) lines.push(`Give a different approach from these steps: ${c.avoid.join(' | ')}`);
  return { system, user: lines.join('\n') };
}

/** The steps in a reply (JSON, possibly fenced), tidied to fit; null when there aren't at least two. */
export function parseSteps(reply: string, minutes: number): AiSplit | null {
  const m = /\{[\s\S]*\}/.exec(reply);
  if (!m) return null;
  let j: any;
  try {
    j = JSON.parse(m[0]);
  } catch {
    return null;
  }
  const raw: unknown[] = Array.isArray(j?.steps) ? j.steps : [];
  const steps: AiStep[] = raw
    .map((x: any) => ({ title: String(x?.title ?? '').trim().slice(0, 120), minutes: Math.round(Number(x?.minutes)), doneWhen: String(x?.done_when ?? x?.doneWhen ?? '').trim().slice(0, 100) }))
    .filter((x) => x.title)
    .slice(0, 6)
    .map((x, i) => ({
      title: x.title,
      minutes: i === 0 ? 2 : Math.max(1, Math.min(minutes, Number.isFinite(x.minutes) && x.minutes > 0 ? x.minutes : 5)),
      ...(x.doneWhen ? { doneWhen: x.doneWhen } : {}),
    }));
  if (steps.length < 2) return null;
  // More than the time there is: scale the later steps down to fit.
  const total = steps.reduce((a, s) => a + s.minutes, 0);
  if (total > minutes * 1.15 && steps.length > 1) {
    const room = Math.max(steps.length - 1, minutes - steps[0].minutes);
    const rest = total - steps[0].minutes;
    for (let i = 1; i < steps.length; i++) steps[i].minutes = Math.max(1, Math.round((steps[i].minutes / rest) * room));
  }
  const tip = typeof j?.tip === 'string' && j.tip.trim() ? j.tip.trim().slice(0, 220) : undefined;
  return { steps, ...(tip ? { tip } : {}) };
}

/** What Daybloom knows about the task's moment, for the prompt. */
async function contextOf(task: Task, blockKey: string | null, minutes: number, avoid: string[]): Promise<SplitContext> {
  const b: Block | null = blockKey ? view.blockByKey(blockKey) : null;
  const now = clock.now;
  let when: string | undefined;
  let until: SplitContext['until'] = null;
  if (b && !b.floating) {
    const live = b.startMs <= now && now < b.endMs;
    when = live ? `on now, ${Math.round((b.endMs - now) / MINUTE)} minutes left` : `${b.date === view.today ? 'today' : b.date} ${formatTime(b.startMs, false)}–${formatTime(b.endMs, false)}`;
    const from = Math.max(now, b.startMs);
    const next = view.todayBlocks.filter((x) => !x.floating && x.key !== b.key && !x.skipped && x.startMs >= from).sort((x, y) => x.startMs - y.startMs)[0];
    if (next && b.date === view.today) until = { minutes: Math.max(0, Math.round((next.startMs - from) / MINUTE)), what: next.title };
  } else if (!task.date) when = 'in the backlog, not on a day yet';
  let reality: string | null = null;
  if (isOn('reality')) {
    try {
      const { realityFile } = await import('../reality/reality.svelte');
      const { estimate } = await import('../reality/reality');
      const est = estimate(realityFile.value.samples, { title: task.title, category: task.category });
      if (est) reality = `${est.scope === 'title' ? 'this same task' : est.label} usually takes ${Math.round(est.ratio * 100)}% of what's planned (from ${est.n} finished blocks)${est.typical ? `, about ${Math.round(est.typical)} minutes` : ''}`;
    } catch {
      reality = null;
    }
  }
  let about: string | null = null;
  if (isOn('alef')) {
    try {
      const { alefFile } = await import('../alef/alef.svelte');
      about = alefFile.value.settings.you.about || null;
    } catch {
      about = null;
    }
  }
  return {
    title: task.title,
    notes: task.notes,
    minutes,
    category: task.category,
    energy: task.energy ?? null,
    due: task.due ?? null,
    existing: task.subtasks.map((s) => ({ title: s.title, done: s.done })),
    when,
    until,
    reality,
    about,
    avoid,
  };
}

async function ask(system: string, user: string, minutes: number): Promise<AiSplit | null> {
  const conn = await ai.connection('smaller', 'think');
  if (!conn) return null;
  try {
    const r = await chatOnce(conn.config, conn.key, [{ role: 'system', content: system }, { role: 'user', content: user }], null, (u, i) => platform.fetch(u, i), 700);
    return parseSteps(r.content, minutes);
  } catch (e) {
    console.warn('[daybloom] make it smaller', e);
    return null;
  }
}

/** Steps for a task, or null (not chosen, unreachable, or an answer we can't use). */
export async function aiSteps(o: { task: Task; blockKey: string | null; minutes: number; avoid?: string[] }): Promise<AiSplit | null> {
  if (!ai.ready('smaller', 'think')) return null;
  const p = splitPrompt(await contextOf(o.task, o.blockKey, o.minutes, o.avoid ?? []));
  return ask(p.system, p.user, o.minutes);
}

/** One step, split again into 2–4 smaller ones that fill its minutes. */
export async function aiSplitStep(o: { task: Task; step: AiStep }): Promise<AiStep[] | null> {
  if (!ai.ready('smaller', 'think')) return null;
  const minutes = Math.max(3, o.step.minutes);
  const p = splitPrompt({ title: `${o.step.title} (part of “${o.task.title}”)`, notes: o.task.notes, minutes, category: o.task.category });
  const r = await ask(p.system.replace('3 to 5 steps', '2 to 4 steps'), p.user, minutes);
  return r?.steps ?? null;
}
