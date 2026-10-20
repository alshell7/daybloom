// Soft landings, the live side: when a meeting (or a long stretch) ends, a calm card offers
// three stepping stones; taking one starts a short timer or the breathing guide. "Make room"
// slides the next block so a back-to-back hand-off gets its landing. Main window only.

import { untrack } from 'svelte';
import { adjust } from '../../actions';
import { parseBlockKey } from '../../engine/blocks';
import { formatTime, hourOf, MINUTE } from '../../engine/time';
import type { Block, Task } from '../../engine/types';
import { platform } from '../../platform';
import { shownTitle } from '../../privacy';
import { clock } from '../../stores/clock.svelte';
import { settings } from '../../stores/settings.svelte';
import { taskFile, tasks } from '../../stores/tasks.svelte';
import { timer } from '../../stores/timer.svelte';
import { view } from '../../stores/view.svelte';
import { drainOf, headline, pickStones, type Drain, type Handoff, type Stone } from './landings';
import { landingsFile } from './pad.svelte';

export interface Moment {
  key: string;
  drain: Drain;
  run: number;
  headline: string;
  /** What comes next, if it starts within the hour. */
  next: Block | null;
  stones: Stone[];
  at: number;
}

class Landings {
  moment = $state<Moment | null>(null);

  /** Take a stepping stone: a short timer (or the breathing guide), and note the landing. */
  take(stone: Stone) {
    const m = this.moment;
    if (stone.action === 'breathe') view.breatheAt = clock.now;
    else timer.startCountdown(stone.minutes, stone.title, stone.kind === 'step' ? (m?.next?.category ?? 'focus') : 'rest', stone.icon);
    this.log(stone.id);
    this.moment = null;
  }
  skip() {
    this.log(null);
    this.moment = null;
  }
  private log(stone: string | null) {
    const m = this.moment;
    const f = landingsFile.value;
    f.log = [...f.log, { at: Date.now(), run: m?.run ?? 1, stone }].slice(-400);
    if (m) f.recent = [...f.recent, ...m.stones.map((s) => s.id).filter((id) => id !== 'step')].slice(-6);
  }

  /** Slide the next block so the hand-off gets its landing, with Undo. */
  makeRoom(h: Handoff) {
    const p = parseBlockKey(h.to.key);
    const t = p && tasks.get(p.taskId);
    if (!p || !t) return;
    const before: Task = JSON.parse(JSON.stringify(t));
    const start = h.from.endMs + (h.gapMin + h.needMin) * MINUTE;
    adjust(h.to.key, start, start + (h.to.endMs - h.to.startMs));
    view.say(`“${h.to.title || 'Next block'}” now starts at ${formatTime(start, view.hour12)} · ${h.needMin}m more to land`, {
      label: 'Undo',
      run: () => {
        const list = taskFile.value.tasks;
        const i = list.findIndex((x) => x.id === before.id);
        if (i >= 0) list[i] = before;
      },
    });
  }
}

export const landings = new Landings();

/** Meetings in a row ending with this block (gaps under 10 minutes join them). */
function runEndingAt(b: Block, blocks: Block[]): number {
  let run = 1;
  let cur = b;
  const sorted = blocks.filter((x) => !x.floating).sort((a, c) => c.endMs - a.endMs);
  for (;;) {
    const prev = sorted.find((x) => x.key !== cur.key && x.endMs <= cur.startMs + MINUTE && cur.startMs - x.endMs < 10 * MINUTE && drainOf(x) === 'meeting');
    if (!prev || drainOf(cur) !== 'meeting') break;
    run++;
    cur = prev;
    if (run > 8) break;
  }
  return run;
}

/** Main window, while the addon is on. */
export function startLandings(): () => void {
  const fired = new Set<string>();
  let booted = false;
  const root = $effect.root(() => {
    $effect(() => {
      const now = clock.minute;
      void view.todayBlocks;
      untrack(() => {
        const s = landingsFile.value.settings;
        const blocks = view.todayBlocks;
        // A draining block that just ended (in the last 3 minutes), once.
        const ended = blocks.filter((b) => b.endMs <= now + MINUTE && b.endMs > now - 3 * MINUTE && drainOf(b) !== null);
        for (const b of ended) {
          if (fired.has(b.key)) continue;
          fired.add(b.key);
          if (!booted) continue;
          const drain = drainOf(b);
          if ((drain === 'meeting' && !s.afterMeetings) || (drain === 'long' && !s.afterLong)) continue;
          // Another meeting starts right away: wait for the end of the run.
          const next = blocks.filter((x) => !x.floating && x.startMs >= b.endMs - MINUTE && x.key !== b.key).sort((a, c) => a.startMs - c.startMs)[0] ?? null;
          if (next && drainOf(next) === 'meeting' && next.startMs - b.endMs < 10 * MINUTE) continue;
          // In a focus session already: no interruption.
          if (timer.active) continue;
          const soon = next && next.startMs - b.endMs <= 60 * MINUTE ? next : null;
          const run = runEndingAt(b, blocks);
          const stones = pickStones({ next: soon && soon.kind === 'task' ? soon : null, seed: Math.floor(now / MINUTE), allowed: s.stones, recent: landingsFile.value.recent, hour: hourOf(now) });
          landings.moment = { key: b.key, drain, run, headline: headline(run, drain), next: soon, stones, at: now };
          if (settings.value.notify && typeof document !== 'undefined' && document.hidden) {
            const nm = soon ? shownTitle(soon.title, soon.category) : '';
            void platform.notify(headline(run, drain), soon ? `A few minutes before ${nm} at ${formatTime(soon.startMs, view.hour12)}: ${stones[0]?.title.toLowerCase() ?? 'take a breath'}.` : `${stones[0]?.title ?? 'Take a breath'}, then pick up what's next.`);
          }
        }
        booted = true;
      });
    });
    // A card left unanswered goes quietly after 8 minutes.
    $effect(() => {
      const m = landings.moment;
      if (!m) return;
      const t = setTimeout(() => {
        if (landings.moment === m) landings.moment = null;
      }, 8 * 60_000);
      return () => clearTimeout(t);
    });
  });
  return () => {
    root();
    landings.moment = null;
  };
}

