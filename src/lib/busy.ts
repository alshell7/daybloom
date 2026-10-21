// What counts as taken time whenever Daybloom looks for free time — the assistant, Alef, the
// board, plan-my-day and AI apps through MCP all ask here, so they agree: your timed blocks,
// calendar events (not the ones you skip), salah (on the dial or kept free without blocks) and,
// with Soft landings, a few minutes to land after meetings.

import { blocksInRange, freeGaps } from './engine/blocks';
import { addDays, atMinutes, isoOf, MINUTE, minutesOfDay, startOfDayMs } from './engine/time';
import type { Block, ISODate, Minutes } from './engine/types';
import { landingPad } from './addons/landings/pad.svelte';
import { settings } from './stores/settings.svelte';
import { taskFile } from './stores/tasks.svelte';
import { view } from './stores/view.svelte';

const ceil5 = (ms: number) => Math.ceil(ms / (5 * MINUTE)) * 5 * MINUTE;

/** Timed blocks that take time in [startMs, endMs), sorted; `except` leaves one block out (the one being moved). */
export function busyBetween(startMs: number, endMs: number, o: { except?: string; land?: boolean } = {}): Block[] {
  const kept = Object.values(view.busyEvents).flat();
  const events = kept.length ? [...view.events, ...kept] : view.events;
  // A skipped event's time is free.
  const blocks = blocksInRange(taskFile.value.tasks, events, startMs, endMs, view.finish.dark).filter((b) => b.key !== o.except && !b.skipped);
  return o.land === false ? blocks : landingPad(blocks);
}

/** The waking day of `date` in ms: wake to sleep (sleep after midnight runs into the next day). */
export function wakingSpan(date: ISODate): { fromMs: number; toMs: number } {
  const { wake, sleep } = settings.value;
  return { fromMs: atMinutes(date, wake), toMs: atMinutes(sleep <= wake ? addDays(date, 1) : date, sleep) };
}

export interface Slot {
  date: ISODate;
  start: Minutes;
  /** Not on the day asked for: that day had no room. */
  moved: boolean;
}

/**
 * The first free stretch that fits `minutes`, inside waking hours, from now on `date` (or its
 * wake time), looking up to `days` days ahead. Null when nothing fits.
 */
export function freeSlot(date: ISODate, minutes: number, now: number, o: { days?: number; except?: string; fromMs?: number; toMs?: number } = {}): Slot | null {
  const len = Math.max(5, minutes) * MINUTE;
  for (let i = 0; i < (o.days ?? 7); i++) {
    const d = addDays(date, i);
    const span = wakingSpan(d);
    let from = Math.max(span.fromMs, ceil5(now), i === 0 && o.fromMs ? o.fromMs : -Infinity);
    const to = i === 0 && o.toMs ? Math.min(span.toMs, o.toMs) : span.toMs;
    if (to - from < len) continue;
    from = ceil5(from);
    const gap = freeGaps(busyBetween(startOfDayMs(d), to, { except: o.except }), from, to, len).find((g) => g.endMs - g.startMs >= len);
    if (gap) return { date: isoOf(gap.startMs), start: minutesOfDay(gap.startMs), moved: i > 0 };
  }
  return null;
}
