// Pick for me, the live side: deals cards from the backlog for this moment (the free time until
// your next block, the hour's usual energy), gives each a tiny first step — from the AI service
// chosen for Getting started when there is one, else from the built-in first steps — and starts
// the one you choose as a short focus. What you start and what you pass over stays on this
// device (`pick`), so the next deal fits you better. The rules are in pick.ts.

import { ai } from './ai/hub.svelte';
import { chatOnce } from './ai/providers';
import { openItems } from './backlog';
import { busyBetween, wakingSpan } from './busy';
import { freeGaps } from './engine/blocks';
import { MINUTE } from './engine/time';
import type { Task } from './engine/types';
import { haptic } from './haptics';
import { cardsPrompt, deal, EMPTY_STATS, frame, HOOK_BY_ID, hookLine, minutesFor, parseCards, recordDeal, recordPass, recordStart, rng, energyAt, type HookId, type PickStats } from './pick';
import { platform } from './platform';
import { deviceStep } from './starter';
import { clock } from './stores/clock.svelte';
import { persisted } from './stores/persisted.svelte';
import { settings } from './stores/settings.svelte';
import { taskFile } from './stores/tasks.svelte';
import { timer } from './stores/timer.svelte';
import { view } from './stores/view.svelte';
import type { Quadrant } from './matrix';

function migrateStats(raw: any): PickStats {
  const pairs = (o: any) =>
    Object.fromEntries(Object.entries(o && typeof o === 'object' ? o : {}).filter(([, v]) => Array.isArray(v) && v.length === 2 && v.every((n) => Number.isFinite(n) && n >= 0))) as Record<string, [number, number]>;
  const times = (o: any) => Object.fromEntries(Object.entries(o && typeof o === 'object' ? o : {}).filter(([, v]) => Number.isFinite(v))) as Record<string, number>;
  return { hooks: pairs(raw?.hooks), kinds: pairs(raw?.kinds), seen: times(raw?.seen), passed: times(raw?.passed) };
}

/** What the picker learned on this device (never synced: each device has its own moments). */
export const pickFile = persisted<PickStats>('pick', EMPTY_STATS, migrateStats);

export interface Card {
  task: Task;
  hook: HookId;
  minutes: number;
  step: string;
  line: string;
  reasons: string[];
  quadrant: Quadrant;
  /** A mystery card stays face down until you turn it over. */
  open: boolean;
  /** The words came from the AI service. */
  ai: boolean;
}

const ceil5 = (ms: number) => Math.ceil(ms / (5 * MINUTE)) * 5 * MINUTE;

/** Minutes free from now until the next block, event or salah (or the end of the waking day). */
export function freeNow(now = clock.now): number {
  const end = wakingSpan(view.today).toMs;
  if (end <= now) return 30;
  const from = ceil5(now);
  const gap = freeGaps(busyBetween(now, end), from, end, 5 * MINUTE).find((g) => g.startMs <= from + 5 * MINUTE);
  return gap ? Math.round((gap.endMs - Math.max(now, gap.startMs)) / MINUTE) : 0;
}

class Picker {
  cards = $state<Card[]>([]);
  writing = $state(false);
  freeMin = $state(0);
  #seq = 0;

  /** What may be dealt: open backlog items (Someday only if you allow it). */
  pool(): Task[] {
    const s = settings.value.pick;
    return openItems(taskFile.value.tasks).filter((t) => s.someday || t.list !== 'someday');
  }

  /** A new deal. `only` keeps the deal to some tasks (a quadrant of the matrix). */
  deal(only?: string[]) {
    // What it learned loads the first time it deals (and isn't written before it has).
    if (!pickFile.ready) void pickFile.load().then(() => this.cards.length && (pickFile.value = recordDeal(pickFile.value, this.cards, clock.now)));
    const s = settings.value.pick;
    const now = clock.now;
    this.freeMin = freeNow(now);
    const pool = this.pool().filter((t) => !only || only.includes(t.id));
    const c = { now, today: view.today, freeMin: this.freeMin, energy: energyAt(new Date(now).getHours()), stats: pickFile.value };
    const random = rng(now ^ (++this.#seq * 2654435761));
    const scored = deal(pool, c, s.choices, random);
    const hooks = frame(scored, c, s, random);
    this.cards = scored.map((x, i) => {
      const hook = HOOK_BY_ID[hooks[i]];
      const minutes = minutesFor(hook, x.task, this.freeMin);
      const step = deviceStep({ title: x.task.title, notes: x.task.notes, category: x.task.category, minutes: x.task.duration, nextStep: x.task.subtasks.find((st) => !st.done)?.title ?? null }, i + this.#seq).step;
      return { task: x.task, hook: hook.id, minutes, step, line: hookLine(hook, x.task, minutes, step, now), reasons: x.reasons.slice(0, 2), quadrant: x.quadrant, open: !hook.hidden, ai: false };
    });
    if (pickFile.ready) pickFile.value = recordDeal(pickFile.value, this.cards, now);
    if (s.ai && ai.ready('starter', 'think')) void this.#words(this.#seq);
  }

  /** With an AI service: each card's own first step and invitation (the built-in ones show first). */
  async #words(seq: number) {
    const conn = await ai.connection('starter', 'think').catch(() => null);
    if (!conn || !this.cards.length) return;
    this.writing = true;
    try {
      const p = cardsPrompt(this.cards.map((c) => ({ id: c.task.id, title: c.task.title, notes: c.task.notes, hook: HOOK_BY_ID[c.hook], minutes: c.minutes })));
      const r = await chatOnce(conn.config, conn.key, [{ role: 'system', content: p.system }, { role: 'user', content: p.user }], null, (u, i) => platform.fetch(u, i), 500);
      if (seq !== this.#seq) return;
      const words = parseCards(r.content, new Set(this.cards.map((c) => c.task.id)));
      this.cards = this.cards.map((c) => {
        const w = words.find((x) => x.id === c.task.id);
        if (!w) return c;
        const hook = HOOK_BY_ID[c.hook];
        return { ...c, step: w.step, line: w.line || hookLine(hook, c.task, c.minutes, w.step, clock.now), ai: true };
      });
    } catch (e) {
      console.warn('[daybloom] pick words', e);
    } finally {
      if (seq === this.#seq) this.writing = false;
    }
  }

  turn(card: Card) {
    this.cards = this.cards.map((c) => (c.task.id === card.task.id ? { ...c, open: true } : c));
    haptic('pick');
  }

  /** You chose it: a short focus on its first step (or the dare, or the race). */
  start(card: Card) {
    pickFile.value = recordStart(pickFile.value, card);
    const hook = HOOK_BY_ID[card.hook];
    const label = card.hook === 'first' || card.hook === 'two' ? card.step : card.task.title;
    timer.startSession({ minutes: card.minutes, rhythm: 'single', label, icon: card.task.icon, category: card.task.category, target: { taskId: card.task.id } });
    haptic('done');
    view.sheet = null;
    view.say(card.hook === 'badly' ? `${card.minutes} minutes of “badly on purpose”. Start with: ${card.step}` : `${card.minutes} minutes, ${hook.label.toLowerCase()}. First: ${card.step}`, undefined, 6500);
    this.cards = [];
  }

  /** Not this one (for a couple of days): it leaves the deck, and another card takes its place. */
  pass(card: Card) {
    pickFile.value = recordPass(pickFile.value, card.task.id, clock.now);
    const rest = this.cards.filter((c) => c.task.id !== card.task.id);
    const keep = new Set(rest.map((c) => c.task.id));
    const s = settings.value.pick;
    const now = clock.now;
    const pool = this.pool().filter((t) => !keep.has(t.id) && t.id !== card.task.id);
    const c = { now, today: view.today, freeMin: this.freeMin, energy: energyAt(new Date(now).getHours()), stats: pickFile.value };
    const random = rng(now ^ (++this.#seq * 2246822519));
    const [next] = deal(pool, c, 1, random);
    if (!next) {
      this.cards = rest;
      return;
    }
    const used = new Set(rest.map((x) => x.hook));
    const hookId = frame([next], c, s, random).find((h) => !used.has(h)) ?? 'plain';
    const hook = HOOK_BY_ID[hookId];
    const minutes = minutesFor(hook, next.task, this.freeMin);
    const step = deviceStep({ title: next.task.title, notes: next.task.notes, category: next.task.category, minutes: next.task.duration }, this.#seq).step;
    this.cards = [...rest, { task: next.task, hook: hookId, minutes, step, line: hookLine(hook, next.task, minutes, step, now), reasons: next.reasons.slice(0, 2), quadrant: next.quadrant, open: !hook.hidden, ai: false }];
    pickFile.value = recordDeal(pickFile.value, [{ task: next.task, hook: hookId }], now);
  }
}

export const picker = new Picker();
