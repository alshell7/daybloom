// Help me start, the live side (main window, Settings › Rhythm › Gentle support). A minute or
// two before one of your blocks begins, Daybloom gets a tiny first step ready for it (from the
// AI service chosen for Getting started, or a built-in one), so it's there the moment the block
// starts: added as the block's first step, offered in a warm card in the timeline (and by Alef,
// when it's on) with one tap to start it as a 2- or 5-minute focus. It waits kindly for about
// twenty minutes and then lets go, and it never asks twice for the same block. When that short
// session ends, its step is ticked: you started.

import { untrack } from 'svelte';
import { ai } from './ai/hub.svelte';
import { chatOnce } from './ai/providers';
import { isOn } from './addons/registry';
import { MINUTE } from './engine/time';
import type { Block } from './engine/types';
import { platform } from './platform';
import { deviceStep, parseStep, startPrompt, type FirstStep, type StartContext } from './starter';
import { clock } from './stores/clock.svelte';
import { settings } from './stores/settings.svelte';
import { tasks, uid } from './stores/tasks.svelte';
import { timer } from './stores/timer.svelte';
import { view } from './stores/view.svelte';

/** How long before a block starts its step is made, and how long after it the offer stays. */
export const AHEAD_MIN = 2;
export const OFFER_MIN = 20;

/** The step added to a block's steps carries this id prefix (so it's never added twice). */
const MARK = 'first-';

class Starter {
  /** Ready steps, by block key. */
  steps = $state<Record<string, FirstStep>>({});
  /** Steps being made right now. */
  making = $state<Record<string, boolean>>({});
  /** Blocks you said "not now" to (this run of the app). */
  #dismissed = new Set<string>();
  #tried = new Map<string, string[]>();

  of(key: string): FirstStep | null {
    return this.steps[key] ?? null;
  }

  /** The block whose start the card offers help with now, if any. */
  get offer(): Block | null {
    if (!settings.value.nudges.firstStep) return null;
    const now = clock.minute;
    const b = view.now.current;
    if (!b || b.kind !== 'task' || b.done || b.floating) return null;
    if (now - b.startMs > OFFER_MIN * MINUTE || b.endMs - now < 5 * MINUTE) return null;
    if (this.#dismissed.has(b.key) || (timer.active && timer.active.target?.key === b.key)) return null;
    if (view.taskForKey(b.key)?.task.alarm) return null;
    return b;
  }

  #context(b: Block): StartContext {
    const t = view.taskForKey(b.key)?.task;
    const now = clock.now;
    return {
      title: b.title,
      notes: t?.notes,
      category: b.category,
      minutes: Math.round((b.endMs - b.startMs) / MINUTE),
      leftMin: Math.max(0, Math.round((b.endMs - Math.max(now, b.startMs)) / MINUTE)),
      sinceMin: Math.max(0, Math.round((now - b.startMs) / MINUTE)),
      nextStep: t?.subtasks.find((s) => !s.done && !s.id.startsWith(MARK))?.title ?? null,
      avoid: this.#tried.get(b.key) ?? [],
    };
  }

  async #about(): Promise<string | null> {
    if (!isOn('alef')) return null;
    try {
      const { alefFile } = await import('./addons/alef/alef.svelte');
      return alefFile.value.settings.you.about || null;
    } catch {
      return null;
    }
  }

  /** Make (or remake, for "Another idea") the first step for a block. */
  async prepare(b: Block, again = false): Promise<FirstStep> {
    if (!again && this.steps[b.key]) return this.steps[b.key];
    this.making = { ...this.making, [b.key]: true };
    try {
      const c = this.#context(b);
      let step: FirstStep | null = null;
      if (ai.ready('starter', 'think')) {
        const conn = await ai.connection('starter', 'think');
        if (conn) {
          const p = startPrompt({ ...c, about: await this.#about() });
          try {
            const r = await chatOnce(conn.config, conn.key, [{ role: 'system', content: p.system }, { role: 'user', content: p.user }], null, (u, i) => platform.fetch(u, i), 200);
            const got = parseStep(r.content);
            if (got) step = { ...got, via: 'ai' };
          } catch (e) {
            console.warn('[daybloom] first step', e);
          }
        }
      }
      step ??= deviceStep(c, (this.#tried.get(b.key)?.length ?? 0) + Math.floor(clock.now / 60_000));
      this.#tried.set(b.key, [...(this.#tried.get(b.key) ?? []), step.step]);
      this.steps = { ...this.steps, [b.key]: step };
      if (again) this.#placeStep(b, step);
      return step;
    } finally {
      const { [b.key]: _, ...rest } = this.making;
      this.making = rest;
    }
  }

  /** Put the step first in the block's steps (one-off blocks; a repeat keeps its own steps). */
  #placeStep(b: Block, step: FirstStep) {
    const t = view.taskForKey(b.key)?.task;
    if (!t || t.recurrence) return;
    const id = `${MARK}${b.date}`;
    const mine = t.subtasks.find((s) => s.id === id);
    if (mine?.done) return;
    const rest = t.subtasks.filter((s) => s.id !== id);
    tasks.update(t.id, { subtasks: [{ id, title: step.step, done: false }, ...rest] });
  }

  /** Start the step as a short focus on the block. */
  start(b: Block) {
    const s = this.steps[b.key] ?? deviceStep(this.#context(b));
    timer.startSession({ minutes: s.minutes, rhythm: 'single', label: s.step, icon: b.icon, category: b.category, target: { key: b.key, taskId: b.taskId } });
    view.say(`${s.minutes} minutes, just this: ${s.step}. You can stop after.`, undefined, 6000);
  }

  /** "Not now": the offer goes for this block; its added step goes too if it's untouched. */
  dismiss(b: Block) {
    this.#dismissed.add(b.key);
    const t = view.taskForKey(b.key)?.task;
    const id = `${MARK}${b.date}`;
    if (t?.subtasks.some((s) => s.id === id && !s.done)) tasks.update(t.id, { subtasks: t.subtasks.filter((s) => s.id !== id) });
  }

  /** At the block's start: the step is placed (Alef, when it's on, offers the same step itself). */
  arrived(b: Block) {
    const s = this.steps[b.key];
    if (s) this.#placeStep(b, s);
  }

  /** Alef's helping hand for a block that's starting or stuck: this step, in its words. */
  helpFor(key: string): { line: string; offers: { id: 'start2'; label: string; icon: string; key: string; minutes: number; step: string }[] } | null {
    const s = settings.value.nudges.firstStep ? this.steps[key] : null;
    if (!s || this.#dismissed.has(key)) return null;
    return { line: s.nudge, offers: [{ id: 'start2', label: `${s.step} · ${s.minutes} min`, icon: 'play', key, minutes: s.minutes, step: s.step }] };
  }

  /** A short session on a block ended: tick the first step (you started). */
  ended(key: string, label: string, ranMs: number) {
    if (ranMs < MINUTE) return;
    const p = view.taskForKey(key);
    if (!p) return;
    const id = `${MARK}${p.date}`;
    const s = p.task.subtasks.find((x) => x.id === id && x.title === label);
    if (s && !s.done) tasks.update(p.task.id, { subtasks: p.task.subtasks.map((x) => (x.id === id ? { ...x, done: true } : x)) });
  }
}

export const starter = new Starter();

if (import.meta.env.DEV) (globalThis as { __starter?: Starter }).__starter = starter;

/** Main window: get steps ready a little ahead, place them at the start, tick them when done. */
export function startStarter(): () => void {
  const arrived = new Set<string>();
  return $effect.root(() => {
    $effect(() => {
      const now = clock.minute;
      void view.todayBlocks;
      untrack(() => {
        if (!settings.value.nudges.firstStep) return;
        for (const b of view.todayBlocks) {
          if (b.kind !== 'task' || b.done || b.floating || b.endMs - b.startMs < 10 * MINUTE) continue;
          const toStart = b.startMs - now;
          if (toStart > AHEAD_MIN * MINUTE || now - b.startMs > OFFER_MIN * MINUTE) continue;
          if (view.taskForKey(b.key)?.task.alarm) continue;
          void starter.prepare(b).then(() => {
            if (clock.now >= b.startMs && !arrived.has(b.key)) {
              arrived.add(b.key);
              if (!(timer.active && timer.active.target?.key === b.key)) starter.arrived(b);
            }
          });
        }
      });
    });
    // A session on a block ends: its first step is ticked.
    let last: { key?: string; label: string; startedAt: number } | null = null;
    $effect(() => {
      const a = timer.active;
      untrack(() => {
        if (last && (!a || a.startedAt !== last.startedAt) && last.key) starter.ended(last.key, last.label, Date.now() + clock.offset - last.startedAt);
        last = a ? { key: a.target?.key, label: a.label, startedAt: a.startedAt } : null;
      });
    });
  });
}
