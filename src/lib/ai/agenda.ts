// The day in a few plain lines for an AI service: what's planned (your blocks, calendar events,
// salah), what's free between them, and the top of the backlog — compact text instead of a
// JSON dump, so it always fits, and with each block's key so tools can act on it.

import { dayBlocksOf } from '../assistant/tools';
import { openItems } from '../backlog';
import { busyBetween, wakingSpan } from '../busy';
import { freeGaps } from '../engine/blocks';
import { addDays, formatMinutes, fromISODate, isoOf, MINUTE, minutesOfDay, startOfDayMs } from '../engine/time';
import type { Block, ISODate } from '../engine/types';
import { taskFile } from '../stores/tasks.svelte';

/** "14:05" in the app's time zone (24-hour, the form tools take). */
const hm = (ms: number) => formatMinutes(minutesOfDay(ms), false);
const mins = (a: number, b: number) => Math.round((b - a) / MINUTE);

function kindOf(b: Block): string {
  if (b.kind === 'task') return b.done ? 'yours, done' : 'yours';
  if (b.event?.provider === 'salah') return 'salah';
  return 'calendar';
}

/** One day: blocks in order, anytime tasks and free time (from now, if it's today). */
export function dayLines(date: ISODate, now: number): string[] {
  const today = isoOf(now);
  const { timed, floating } = dayBlocksOf(date);
  const own = timed.filter((b) => b.date === date || b.startMs >= startOfDayMs(date));
  const weekday = fromISODate(date).toLocaleDateString('en', { weekday: 'long' });
  const out = [`${date === today ? 'Today' : date === addDays(today, 1) ? 'Tomorrow' : weekday}, ${weekday} ${date}:`];
  if (!own.length) out.push('- nothing planned');
  for (const b of own) {
    const nowMark = date === today && b.startMs <= now && now < b.endMs ? ' ← now' : '';
    out.push(`- ${hm(b.startMs)}–${hm(b.endMs)} ${b.title || '(untitled)'} [${kindOf(b)}${b.recurring ? ', repeats' : ''}] key=${b.key}${nowMark}`);
  }
  const any = floating.filter((b) => b.kind === 'task');
  if (any.length) out.push(`Anytime: ${any.map((b) => `${b.title}${b.done ? ' (done)' : ''} key=${b.key}`).join('; ')}`);
  const span = wakingSpan(date);
  const from = Math.max(span.fromMs, date === today ? Math.ceil(now / (5 * MINUTE)) * 5 * MINUTE : span.fromMs);
  const gaps = from < span.toMs ? freeGaps(busyBetween(startOfDayMs(date), span.toMs), from, span.toMs, 15 * MINUTE) : [];
  out.push(gaps.length ? `Free: ${gaps.map((g) => `${hm(g.startMs)}–${hm(g.endMs)} (${mins(g.startMs, g.endMs)}m)`).join(', ')}` : 'Free: no free stretch of 15 minutes or more left');
  return out;
}

/** Today, tomorrow's free time, and the backlog's first few items, for a system prompt. */
export function agenda(now: number, o: { backlog?: number } = {}): string {
  const today = isoOf(now);
  const lines = [...dayLines(today, now), '', ...dayLines(addDays(today, 1), now)];
  const items = openItems(taskFile.value.tasks).slice(0, o.backlog ?? 8);
  if (items.length) lines.push('', `Backlog (not on a day yet): ${items.map((t) => `${t.title} (${t.duration}m${t.due ? `, due ${t.due}` : ''}) id=${t.id}`).join('; ')}`);
  return lines.join('\n');
}
