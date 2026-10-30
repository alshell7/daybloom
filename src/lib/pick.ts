// Pick for me: when the backlog is long and nothing feels startable, Daybloom deals a few cards
// and you choose one. Nothing is ever chosen for you — the choice is the point (autonomy), the
// deck changes each time and some cards come face down (novelty), and every card has a tiny,
// concrete way in plus the honest reason it was dealt ("Due Friday · fits the 40 minutes before
// your call"). Each card wears a framing — a mystery card, a ten-minute dare, just the first
// step, do it badly on purpose… — and Daybloom quietly learns which framings you actually start
// (a Thompson-sampling bandit), so the deck keeps getting more "you".
//
// Pure, for tests: scoring, dealing, framings and learning. The live side is pick.svelte.ts.

import type { ISODate, Task } from './engine/types';
import { quadrantOf, type Quadrant } from './matrix';

export type HookId = 'mystery' | 'dare' | 'first' | 'badly' | 'two' | 'fresh' | 'race' | 'plain';

export interface Hook {
  id: HookId;
  /** The card's label. */
  label: string;
  /** The invitation under the title ({min} and {days} are filled in). */
  line: string;
  /** How long the start is (minutes); 0 = the task's own length, capped by the free time. */
  minutes: number;
  icon: string;
  /** Hidden until you turn it over. */
  hidden?: boolean;
  /** A playful framing (Settings: playful framings off leaves only the plain ones). */
  playful?: boolean;
}

export const HOOKS: Hook[] = [
  { id: 'mystery', label: 'Mystery card', line: 'Turn it over. If it’s the one, give it {min} minutes.', minutes: 10, icon: 'sparkles', hidden: true, playful: true },
  { id: 'dare', label: '10-minute dare', line: 'Ten minutes, timer on. See how far you get, then stop guilt-free.', minutes: 10, icon: 'zap', playful: true },
  { id: 'first', label: 'Just the first step', line: 'Only the first step below. Then decide, freely, whether to go on.', minutes: 5, icon: 'footprints' },
  { id: 'badly', label: 'Do it badly', line: 'A rough, messy version is the goal. Perfect comes later, if ever.', minutes: 15, icon: 'pen', playful: true },
  { id: 'two', label: 'Two minutes', line: 'Two minutes only. Stopping after is a win.', minutes: 2, icon: 'timer' },
  { id: 'fresh', label: 'Fresh eyes', line: 'It’s waited {days} days. A new look might make it easy.', minutes: 10, icon: 'eye' },
  { id: 'race', label: 'Beat the clock', line: 'Usually {usual}. Can you do it in {min}?', minutes: 0, icon: 'gauge', playful: true },
  { id: 'plain', label: 'Up next', line: 'A good one for right now.', minutes: 0, icon: 'arrow-right' },
];
export const HOOK_BY_ID = Object.fromEntries(HOOKS.map((h) => [h.id, h])) as Record<HookId, Hook>;

export interface PickSettings {
  /** Cards per deal. */
  choices: 2 | 3 | 4;
  /** Playful framings (mystery, dares, do it badly, beat the clock). */
  playful: boolean;
  /** Someday items may be dealt too. */
  someday: boolean;
  /** Offer a deal in free time on the timeline. */
  inGaps: boolean;
  /** Use the AI service for Getting started to write each card's first step and invitation. */
  ai: boolean;
}
export const DEFAULT_PICK: PickSettings = { choices: 3, playful: true, someday: false, inGaps: true, ai: true };

/** What the picker has learned on this device. */
export interface PickStats {
  /** Per framing: [dealt, started]. */
  hooks: Partial<Record<HookId, [number, number]>>;
  /** Per kind of task: [dealt, started]. */
  kinds: Record<string, [number, number]>;
  /** When each task was last dealt / last passed over (ms), so the deck keeps changing. */
  seen: Record<string, number>;
  passed: Record<string, number>;
}
export const EMPTY_STATS: PickStats = { hooks: {}, kinds: {}, seen: {}, passed: {} };

export interface PickContext {
  now: number;
  today: ISODate;
  /** Minutes free from now until the next thing (or the end of the waking day). */
  freeMin: number;
  /** 1 low, 2 some, 3 high: what the hour usually allows (morning high, after lunch low…). */
  energy: 1 | 2 | 3;
  stats: PickStats;
}

export interface Scored {
  task: Task;
  score: number;
  quadrant: Quadrant;
  reasons: string[];
}

const DAY = 86_400_000;
const Q_WEIGHT: Record<Quadrant, number> = { do: 3, plan: 2.2, quick: 1.6, drop: 0.7 };

/** What the hour usually allows (a gentle default; a task's own energy says the rest). */
export function energyAt(hour: number): 1 | 2 | 3 {
  if (hour >= 8 && hour < 12) return 3;
  if (hour >= 13 && hour < 15) return 1;
  if (hour >= 21 || hour < 7) return 1;
  return 2;
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

export function dueText(due: ISODate, today: ISODate): string {
  const d = Math.round((Date.parse(due) - Date.parse(today)) / DAY);
  if (d < 0) return 'Past its due date';
  if (d === 0) return 'Due today';
  if (d === 1) return 'Due tomorrow';
  return `Due in ${plural(d, 'day')}`;
}

/** How well a task suits this moment, and the honest reasons (the first two show on its card). */
export function scoreTask(t: Task, c: PickContext): Scored {
  const q = quadrantOf(t, c.today);
  let s = Q_WEIGHT[q];
  const reasons: string[] = [];
  if (t.due) {
    reasons.push(dueText(t.due, c.today));
    const d = (Date.parse(t.due) - Date.parse(c.today)) / DAY;
    if (d <= 2) s += 1.2 - Math.max(0, d) * 0.3;
  }
  if (t.priority === 1) reasons.push('A must');
  // Fits the free time: a whole task that fits is better than a slice (but a slice is fine).
  const len = Math.max(5, t.duration || 30);
  if (c.freeMin > 0) {
    if (len <= c.freeMin) {
      s += 0.9;
      reasons.push(`Fits your ${c.freeMin >= 90 ? 'free time' : `${c.freeMin} free minutes`}`);
    } else s -= Math.min(0.8, (len - c.freeMin) / 120);
  }
  // Energy: a high-energy task when the hour is high, a light one when it's low.
  if (t.energy) {
    const gap = Math.abs(t.energy - c.energy);
    s += gap === 0 ? 0.6 : gap === 2 ? -0.6 : 0;
    if (gap === 0 && c.energy === 1) reasons.push('Light enough for now');
    if (gap === 0 && c.energy === 3) reasons.push('Good for your sharp hours');
  }
  // Waiting long: it comes back to the surface (log, so nothing old dominates).
  const days = Math.max(0, (c.now - (t.createdAt || c.now)) / DAY);
  if (days >= 3) {
    s += Math.min(1, Math.log2(days) / 4);
    if (reasons.length < 2) reasons.push(`Waiting ${plural(Math.round(days), 'day')}`);
  }
  // Novelty: what was dealt or passed over lately steps back for a while.
  const seen = c.stats.seen[t.id];
  if (seen && c.now - seen < 6 * 3_600_000) s -= 1.2 * (1 - (c.now - seen) / (6 * 3_600_000));
  const passed = c.stats.passed[t.id];
  if (passed && c.now - passed < 2 * DAY) s -= 1.5 * (1 - (c.now - passed) / (2 * DAY));
  // Kinds you tend to start get a little lift (Beta mean, gently).
  const k = c.stats.kinds[t.category];
  if (k) s += ((k[1] + 1) / (k[0] + 2) - 0.5) * 0.8;
  return { task: t, score: s, quadrant: q, reasons };
}

/** A small seeded random number generator, so a deal can be reproduced (tests, "this deck"). */
export function rng(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a ^= a << 13;
    a ^= a >>> 17;
    a ^= a << 5;
    return ((a >>> 0) % 1_000_000) / 1_000_000;
  };
}

/**
 * Deals `n` cards: weighted by score (softmax with some warmth, so it isn't always the same
 * top three), one per kind of task where it can, so the choice is a real one.
 */
export function deal(items: Task[], c: PickContext, n: number, random: () => number): Scored[] {
  const pool = items.map((t) => scoreTask(t, c));
  const out: Scored[] = [];
  const temp = 0.9;
  while (out.length < n && pool.length) {
    const kinds = new Set(out.map((x) => x.task.category));
    const w = pool.map((p) => Math.exp(p.score / temp) * (kinds.has(p.task.category) ? 0.35 : 1));
    const total = w.reduce((a, b) => a + b, 0);
    let r = random() * total;
    let i = 0;
    while (i < w.length - 1 && r > w[i]) r -= w[i++];
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}

/** A sample from Beta(a, b) (Jöhnk's method for small shapes is enough here: a, b ≥ 1). */
export function betaSample(a: number, b: number, random: () => number): number {
  const gamma = (k: number) => {
    // Marsaglia–Tsang for k ≥ 1.
    const d = k - 1 / 3;
    const cc = 1 / Math.sqrt(9 * d);
    for (;;) {
      let x = 0;
      let v = 0;
      do {
        const u1 = Math.max(1e-12, random());
        const u2 = random();
        x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        v = 1 + cc * x;
      } while (v <= 0);
      v = v * v * v;
      const u = Math.max(1e-12, random());
      if (Math.log(u) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v;
    }
  };
  const x = gamma(Math.max(1, a));
  const y = gamma(Math.max(1, b));
  return x / (x + y);
}

/**
 * A framing for each card: Thompson sampling over what you've started before, never the same
 * framing twice in one deal. "Fresh eyes" only for things that waited; "Beat the clock" only
 * for tasks long enough to race.
 */
export function frame(cards: Scored[], c: PickContext, s: PickSettings, random: () => number): HookId[] {
  const used = new Set<HookId>();
  return cards.map((card) => {
    const days = (c.now - (card.task.createdAt || c.now)) / DAY;
    const ok = HOOKS.filter((h) => {
      if (used.has(h.id)) return false;
      if (h.playful && !s.playful) return false;
      if (h.id === 'fresh' && days < 4) return false;
      if (h.id === 'race' && (card.task.duration || 30) < 20) return false;
      if (h.id === 'plain') return false;
      return true;
    });
    if (!ok.length) return 'plain';
    let best = ok[0];
    let top = -1;
    for (const h of ok) {
      const [dealt, started] = c.stats.hooks[h.id] ?? [0, 0];
      const v = betaSample(started + 1, dealt - started + 1, random);
      if (v > top) [top, best] = [v, h];
    }
    used.add(best.id);
    return best.id;
  });
}

/** How long the start is for a framing on this task, within the free time. */
export function minutesFor(h: Hook, t: Task, freeMin: number): number {
  const len = Math.max(5, t.duration || 30);
  const want = h.id === 'race' ? Math.max(10, Math.round((len * 0.7) / 5) * 5) : h.minutes || len;
  return Math.max(2, Math.min(want, freeMin > 0 ? Math.max(2, freeMin) : want, 90));
}

/** The card's invitation, filled in. */
export function hookLine(h: Hook, t: Task, minutes: number, step: string, now: number): string {
  const days = Math.max(1, Math.round((now - (t.createdAt || now)) / DAY));
  return h.line
    .replace('{min}', `${minutes} minutes`)
    .replace('{days}', String(days))
    .replace('{usual}', `${Math.max(5, t.duration || 30)} minutes`)
    .replace('{step}', step);
}

/** Learning: a deal (each framing and kind dealt once) and, when you start one, its success. */
export function recordDeal(stats: PickStats, cards: { task: Task; hook: HookId }[], now: number): PickStats {
  const hooks = { ...stats.hooks };
  const kinds = { ...stats.kinds };
  const seen = { ...stats.seen };
  for (const c of cards) {
    const h = hooks[c.hook] ?? [0, 0];
    hooks[c.hook] = [h[0] + 1, h[1]];
    const k = kinds[c.task.category] ?? [0, 0];
    kinds[c.task.category] = [k[0] + 1, k[1]];
    seen[c.task.id] = now;
  }
  return prune({ ...stats, hooks, kinds, seen }, now);
}

export function recordStart(stats: PickStats, card: { task: Task; hook: HookId }): PickStats {
  const h = stats.hooks[card.hook] ?? [1, 0];
  const k = stats.kinds[card.task.category] ?? [1, 0];
  return { ...stats, hooks: { ...stats.hooks, [card.hook]: [h[0], Math.min(h[0], h[1] + 1)] }, kinds: { ...stats.kinds, [card.task.category]: [k[0], Math.min(k[0], k[1] + 1)] } };
}

export function recordPass(stats: PickStats, taskId: string, now: number): PickStats {
  return prune({ ...stats, passed: { ...stats.passed, [taskId]: now } }, now);
}

/** Old memories fade: seen/passed older than a week go; counts decay so tastes can change. */
function prune(s: PickStats, now: number): PickStats {
  const keep = (r: Record<string, number>) => Object.fromEntries(Object.entries(r).filter(([, at]) => now - at < 7 * DAY));
  const decay = <K extends string>(r: Partial<Record<K, [number, number]>>) =>
    Object.fromEntries(Object.entries(r).map(([k, v]) => {
      const [d, st] = v as [number, number];
      return d > 60 ? [k, [Math.round(d * 0.8), Math.round(st * 0.8)]] : [k, v];
    })) as Partial<Record<K, [number, number]>>;
  return { hooks: decay(s.hooks), kinds: decay(s.kinds) as Record<string, [number, number]>, seen: keep(s.seen), passed: keep(s.passed) };
}

// ── With an AI service: each card's own first step and invitation ────────────

export interface CardWords {
  id: string;
  step: string;
  line: string;
}

export function cardsPrompt(cards: { id: string; title: string; notes?: string; hook: Hook; minutes: number }[], about?: string | null): { system: string; user: string } {
  const system = [
    'You help someone pick a task from their backlog and start it. They choose freely among a few cards; your words should make each one feel inviting, light and a little novel, never pushy.',
    'For each card write:',
    '"step": ONE tiny physical first action for that exact task, at most 10 words, an imperative. Never generic. Never invent file names, people or tools not in the task.',
    '"line": one inviting sentence (at most 16 words) in the spirit of the card\'s framing, honest and warm. No guilt, no pressure: never "should", "late", "behind", "finally", "procrastinat", "lazy".',
    'Answer with JSON only: {"cards":[{"id":"…","step":"…","line":"…"}]}. Write in the language of each task title.',
  ].join('\n');
  const user = [
    about ? `About them: ${about.slice(0, 300)}` : '',
    'Cards:',
    ...cards.map((c) => `- id ${c.id}: "${c.title}"${c.notes ? ` (notes: ${c.notes.slice(0, 160)})` : ''}; framing: ${c.hook.label} — ${c.hook.line.replace('{step}', 'the first step').replace('{min}', `${c.minutes} minutes`).replace('{days}', 'some').replace('{usual}', 'its usual time')}; ${c.minutes} minutes`),
  ]
    .filter(Boolean)
    .join('\n');
  return { system, user };
}

const UNKIND = /\b(should|late|behind|finally|procrastinat\w*|lazy|failed?|must)\b/i;

export function parseCards(text: string, ids: Set<string>): CardWords[] {
  const m = /\{[\s\S]*\}/.exec(text ?? '');
  if (!m) return [];
  try {
    const o = JSON.parse(m[0]);
    return (Array.isArray(o?.cards) ? o.cards : [])
      .filter((x: any) => x && ids.has(String(x.id)) && typeof x.step === 'string' && x.step.trim())
      .map((x: any) => ({ id: String(x.id), step: String(x.step).trim().slice(0, 90), line: UNKIND.test(String(x.line ?? '')) ? '' : String(x.line ?? '').trim().slice(0, 140) }));
  } catch {
    return [];
  }
}
