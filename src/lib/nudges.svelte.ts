// Proactive support, derived from the clock and the day. Nothing here nags twice: every
// card can be answered or dismissed, and dismissals last for the day.

import { addDays, atMinutes, MINUTE, startOfDayMs } from './engine/time';
import type { Block, Task } from './engine/types';
import { blocksInRange } from './engine/blocks';
import { rhythm } from './streaks';
import { clock } from './stores/clock.svelte';
import { persisted } from './stores/persisted.svelte';
import { settings } from './stores/settings.svelte';
import { taskFile } from './stores/tasks.svelte';
import { view } from './stores/view.svelte';

const dismissals = persisted<{ date: string; ids: string[] }>('nudges', { date: '', ids: [] });

function dismissedToday() {
  return dismissals.value.date === view.today ? dismissals.value.ids : [];
}

export function dismiss(id: string) {
  if (dismissals.value.date !== view.today) dismissals.value = { date: view.today, ids: [] };
  if (!dismissals.value.ids.includes(id)) dismissals.value.ids.push(id);
}

function taskOf(b: Block): Task | undefined {
  return b.taskId ? taskFile.value.tasks.find((t) => t.id === b.taskId) : undefined;
}

class Nudges {
  /** Blocks that ended in the last 6 h without a tick or an "ok, let it go". Oldest first. */
  checkIns = $derived.by(() => {
    const now = clock.minute;
    if (!settings.value.nudges.checkIn) return [] as Block[];
    return view.todayBlocks
      .filter((b) => b.kind === 'task' && !b.done && !b.floating && b.endMs <= now && b.endMs > now - 6 * 60 * MINUTE)
      .filter((b) => !taskOf(b)?.acks?.includes(b.date))
      // Swiped away for today (the block itself stays open in the timeline).
      .filter((b) => !dismissedToday().includes(`check:${b.key}`))
      .sort((a, b) => a.endMs - b.endMs);
  });

  /** Minutes the oldest open check-in has waited (drives the gentle escalation). */
  overdueMin = $derived(this.checkIns.length ? Math.floor((clock.minute - this.checkIns[0].endMs) / MINUTE) : 0);

  /** A block just began: offer the smallest possible first step. */
  starter = $derived.by(() => {
    const c = view.now.current;
    if (!c || c.kind !== 'task' || c.done) return null;
    if (clock.now - c.startMs > 5 * MINUTE || clock.now < c.startMs) return null;
    if (dismissedToday().includes(`start:${c.key}`)) return null;
    // An alarm block has its own ringing card.
    if (taskOf(c)?.alarm) return null;
    return c;
  });

  /** Free time before the next thing, and a backlog item that fits in it. */
  gapIdea = $derived.by(() => {
    if (!settings.value.nudges.gapIdeas || view.now.current) return null;
    const now = clock.minute;
    const sleepAt = atMinutes(view.today, settings.value.sleep);
    const next = view.now.next;
    const gapEnd = Math.min(next ? next.startMs : sleepAt, sleepAt);
    const gapMin = Math.floor((gapEnd - now) / MINUTE);
    if (gapMin < 20) return null;
    const id = `gap:${next?.key ?? 'eod'}`;
    if (dismissedToday().includes(id)) return null;
    const fits = taskFile.value.tasks
      .filter((t) => t.date === null && !t.doneAt && t.list !== 'someday' && t.duration <= gapMin - 5)
      .sort(
        (a, b) =>
          (a.due ?? '9999').localeCompare(b.due ?? '9999') ||
          (a.priority ?? 9) - (b.priority ?? 9) ||
          (a.list === 'next' ? 0 : 1) - (b.list === 'next' ? 0 : 1) ||
          a.duration - b.duration,
      );
    if (!fits.length) return null;
    return { id, gapMin, nextTitle: next?.title ?? null, options: fits.slice(0, 5) };
  });

  /** Evening, nothing finished yet today, and a rhythm worth keeping: one small thing counts. */
  keepRhythm = $derived.by(() => {
    const h = Math.floor((clock.minute - startOfDayMs(view.today)) / (60 * MINUTE));
    if (h < 17) return null;
    if (dismissedToday().includes('rhythm')) return null;
    const r = rhythm(taskFile.value.tasks, clock.minute);
    if (r.countedToday || r.current < 2) return null;
    const small = taskFile.value.tasks
      .filter((t) => t.date === null && !t.doneAt && t.duration <= 15)
      .sort((a, b) => a.duration - b.duration)[0];
    return { days: r.current, rest: r.rest, small };
  });

  /** Evening: offer to close the day. */
  windDown = $derived.by(() => {
    const at = settings.value.nudges.windDown;
    if (at < 0) return false;
    const m = Math.floor((clock.minute - startOfDayMs(view.today)) / MINUTE);
    if (m < at || m > at + 180) return false;
    return !dismissedToday().includes('winddown');
  });

  /** Anything at all asking for attention (widget pip, menu bar). */
  attention = $derived(this.checkIns.length);
}

export const nudges = new Nudges();

/** Today's finished and unfinished task blocks, for the wind-down. */
export function dayReview(date = view.today) {
  const s = startOfDayMs(date);
  const blocks = blocksInRange(taskFile.value.tasks, [], s, startOfDayMs(addDays(date, 1)));
  const own = blocks.filter((b) => b.kind === 'task' && b.date === date);
  const done = own.filter((b) => b.done);
  const open = own.filter((b) => !b.done && !taskFile.value.tasks.find((t) => t.id === b.taskId)?.acks?.includes(date));
  const spentMs = done.reduce((sum, b) => sum + Math.max(0, Math.min(b.endMs, b.doneAt ?? b.endMs) - b.startMs), 0);
  return { done, open, spentMs };
}
