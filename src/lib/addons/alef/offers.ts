// What Alef's buttons do (coach.ts picks them): start a two-minute focus on a block with Alef
// beside you, tick it, give it ten more minutes, move it to the next free time or to tomorrow,
// open Make it smaller, leave a breadcrumb, put a fitting backlog task in a free gap, breathe.
// Each returns what Alef says about it, if anything.

import { extendBlock, moveToNextGap, moveToTomorrow, scheduleSoon, toggleDone } from '../../actions';
import type { Block } from '../../engine/types';
import { clock } from '../../stores/clock.svelte';
import { tasks } from '../../stores/tasks.svelte';
import { timer } from '../../stores/timer.svelte';
import { view } from '../../stores/view.svelte';
import { dayReview } from '../../nudges.svelte';
import type { Offer } from './coach';

export function runOffer(o: Offer): { line?: string; block?: Block | null } | null {
  const b = o.key ? view.blockByKey(o.key) : null;
  switch (o.id) {
    case 'start2': {
      if (!b) return null;
      const m = o.minutes ?? 2;
      timer.startSession({ minutes: m, rhythm: 'single', label: o.step ?? (b.title || 'Two minutes'), icon: b.icon, category: b.category, target: { key: b.key, taskId: b.taskId } });
      return { line: o.step ? `Just this: ${o.step}. I’m right here.` : `${m === 2 ? 'Two' : m} minutes, starting now. I’m right here.`, block: b };
    }
    case 'tick':
      if (!b) return null;
      if (!b.done) toggleDone(b.key);
      return { block: b };
    case 'more10':
      if (!b) return null;
      extendBlock(b.key, 10);
      return { line: 'Ten more minutes. Take your time.', block: b };
    case 'moveNext':
      if (!b) return null;
      moveToNextGap(b.key);
      return { line: 'Moved to your next free time. No fuss.', block: b };
    case 'tomorrow': {
      const open = dayReview().open.filter((x) => x.endMs <= clock.now);
      for (const x of open) moveToTomorrow(x.key);
      view.say(open.length ? `Moved ${open.length} to tomorrow. Today is lighter now.` : 'Nothing to move. Today is already light.');
      return { line: 'There. A lighter day, and a fresh one tomorrow.' };
    }
    case 'pickOne': {
      const next = view.now.current?.kind === 'task' ? view.now.current : view.todayBlocks.find((x) => x.kind === 'task' && !x.done && x.endMs > clock.now) ?? null;
      if (!next) return { line: 'Nothing is waiting. Enjoy the free time.' };
      view.selected = next.key;
      return { line: `Just this one: “${next.title}”. The rest can wait.`, block: next };
    }
    case 'smaller':
      if (!b) return null;
      view.sheet = { kind: 'edit', key: b.key, smaller: true };
      return null;
    case 'crumb':
      if (!b) return null;
      view.sheet = { kind: 'crumbs' };
      return null;
    case 'fill': {
      if (!o.taskId || !tasks.get(o.taskId)) return null;
      scheduleSoon(o.taskId);
      return { line: 'Popped it into your free time.' };
    }
    case 'breathe':
      view.breatheAt = clock.now;
      return { line: 'Breathe with me. In… and out.' };
    case 'talk':
      view.sheet = { kind: 'alef', tab: 'talk' };
      return null;
  }
}
