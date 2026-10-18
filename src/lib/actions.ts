import { blockKey, freeGaps, parseBlockKey } from './engine/blocks';
import { CATEGORY_BY_ID } from './engine/categories';
import { atMinutes, formatDuration, formatTime, isoOf, MINUTE, minutesOfDay, snap, startOfDayMs, addDays } from './engine/time';
import type { CategoryId, ISODate, Task } from './engine/types';
import { sounds } from './sound';
import { settings } from './stores/settings.svelte';
import { tasks } from './stores/tasks.svelte';
import { view } from './stores/view.svelte';
import { clock } from './stores/clock.svelte';

// Keyword → icon/category. Typing "lunch" turns the block into a green fork-and-knife.
const HINTS: [RegExp, string, CategoryId][] = [
  [/\b(med|meds|pill|vitamin|tablet|dose)/i, 'pill', 'care'],
  [/\b(breakfast|lunch|dinner|eat|meal|snack|brunch)/i, 'utensils', 'care'],
  [/\b(coffee|tea|caf)/i, 'coffee', 'care'],
  [/\b(water|hydrate|drink)/i, 'droplet', 'care'],
  [/\b(shower|bath|wash up|skincare|teeth|brush)/i, 'shower', 'care'],
  [/\b(doctor|dentist|therap|gp|appointment|clinic)/i, 'stethoscope', 'care'],
  [/\b(sleep|bed|nap)/i, 'bed', 'rest'],
  [/\b(wind down|relax|rest|chill|unwind|meditat|breathe)/i, 'moon', 'rest'],
  [/\b(music|guitar|piano|practice)/i, 'music', 'rest'],
  [/\b(game|gaming|play)/i, 'gamepad', 'rest'],
  [/\b(tv|movie|show|netflix|film)/i, 'tv', 'rest'],
  [/\b(draw|paint|art|sketch|craft)/i, 'palette', 'rest'],
  [/\b(walk|stroll)/i, 'footprints', 'move'],
  [/\b(run|jog)/i, 'activity', 'move'],
  [/\b(gym|workout|lift|weights|exercise|stretch)/i, 'dumbbell', 'move'],
  [/\b(bike|cycle|cycling)/i, 'bike', 'move'],
  [/\b(swim|pool)/i, 'waves', 'move'],
  [/\b(yoga|hike)/i, 'mountain', 'move'],
  [/\b(call|phone|ring)/i, 'phone', 'social'],
  [/\b(meet|meeting|standup|stand-up|sync|1:1|interview)/i, 'video', 'focus'],
  [/\b(friend|family|mum|mom|dad|date|party|hang)/i, 'users', 'social'],
  [/\b(birthday|gift|present)/i, 'gift', 'social'],
  [/\b(email|mail|inbox|reply|message)/i, 'mail', 'focus'],
  [/\b(code|coding|program|debug|deploy)/i, 'code', 'focus'],
  [/\b(write|writing|essay|draft|journal)/i, 'pen', 'focus'],
  [/\b(deep work|focus|work)/i, 'laptop', 'focus'],
  [/\b(plan|planning|review)/i, 'target', 'focus'],
  [/\b(budget|bills|pay|bank|tax)/i, 'wallet', 'routine'],
  [/\b(read|reading|book)/i, 'book-open', 'learn'],
  [/\b(study|class|lecture|course|homework|school|learn)/i, 'graduation', 'learn'],
  [/\b(language|spanish|french|german|duolingo)/i, 'languages', 'learn'],
  [/\b(clean|tidy|vacuum|dishes|kitchen)/i, 'sparkles', 'routine'],
  [/\b(laundry|clothes|iron)/i, 'shirt', 'routine'],
  [/\b(shop|grocer|groceries|buy|store)/i, 'cart', 'routine'],
  [/\b(cook|bake|prep)/i, 'chef', 'routine'],
  [/\b(drive|car|commute|pick up|drop off|school run)/i, 'car', 'routine'],
  [/\b(bus|train|travel|flight)/i, 'bus', 'routine'],
  [/\b(plant|garden|water the)/i, 'plant', 'routine'],
  [/\b(dog|cat|pet|vet)/i, 'paw', 'routine'],
  [/\b(trash|bins|recycling|rubbish)/i, 'trash', 'routine'],
  [/\b(parcel|package|post)/i, 'package', 'routine'],
  [/\b(baby|kid|kids|feed)/i, 'baby', 'routine'],
];

export function suggest(title: string): { icon: string; category: CategoryId } | null {
  for (const [re, icon, category] of HINTS) if (re.test(title)) return { icon, category };
  return null;
}

/** Sweep on the dial → a real block, editor open on its title. */
export function createFromRange(startMs: number, endMs: number) {
  const date = isoOf(startMs);
  const start = Math.round(minutesOfDay(startMs));
  const duration = Math.max(5, Math.round((endMs - startMs) / MINUTE));
  const t = tasks.create({
    title: '',
    date,
    start,
    duration,
    category: 'focus',
    icon: CATEGORY_BY_ID.focus.icon,
    alerts: [5],
  });
  view.selected = blockKey(t.id, date);
  view.sheet = { kind: 'edit', key: view.selected };
  return t;
}

/** Quick add from the rail / keyboard: next free 30 minutes on the viewed day. */
export function createNext(date: ISODate = view.date, title = '') {
  const isToday = date === view.today;
  const from = isToday ? Math.max(clock.now, startOfDayMs(date)) : atMinutes(date, settings.value.wake);
  const startAt = Math.ceil(from / (5 * MINUTE)) * 5 * MINUTE;
  const end = startOfDayMs(addDays(date, 1));
  const gap = freeGaps(view.dayBlocks, startAt, end, 15 * MINUTE)[0];
  const s = gap ? gap.startMs : startAt;
  const t = tasks.create({ title, date, start: Math.round(minutesOfDay(s)), duration: 30, alerts: [5] });
  view.selected = blockKey(t.id, date);
  view.sheet = { kind: 'edit', key: view.selected };
  return t;
}

/** A drag/resize on the dial landed. */
export function adjust(key: string, startMs: number, endMs: number) {
  const p = parseBlockKey(key);
  if (!p) return;
  const t = tasks.get(p.taskId);
  if (!t) return;
  const duration = Math.max(5, Math.round((endMs - startMs) / MINUTE));
  const newDate = isoOf(startMs);
  if (!t.recurrence && newDate !== p.date) {
    tasks.update(t.id, { date: newDate, start: Math.round(minutesOfDay(startMs)), duration });
    view.selected = blockKey(t.id, newDate);
    return;
  }
  // Recurring blocks stay on their own day; clamp a cross-midnight drag.
  const start = newDate === p.date ? Math.round(minutesOfDay(startMs)) : newDate > p.date ? 1435 : 0;
  tasks.editOccurrence(t.id, p.date, { start, duration });
}

/** Tick a block. Celebrates proportionally — a whole finished day gets the big sweep. */
export function toggleDone(key: string, origin?: { x: number; y: number }) {
  const p = parseBlockKey(key);
  if (!p) return;
  const t = tasks.get(p.taskId);
  if (!t) return;
  const done = tasks.toggleDone(t.id, p.date, clock.now);
  if (!done) return;
  const color = CATEGORY_BY_ID[t.category]?.[view.finish.dark ? 'dark' : 'light'] ?? '#3D6FE3';
  // The score: how much time this block was worth ("+45m"); a block ticked early counts what was spent.
  const b = view.blockByKey(key);
  let spent = 0;
  if (b && !b.floating) spent = clock.now >= b.endMs ? b.endMs - b.startMs : clock.now > b.startMs ? clock.now - b.startMs : 0;
  if (origin) view.spark(origin.x, origin.y, color, false, spent >= MINUTE ? `+${formatDuration(spent)}` : 'Done');
  // Did that finish the day?
  queueMicrotask(() => {
    const own = [...view.dayBlocks, ...view.floating].filter((b) => b.kind === 'task' && b.date === p.date);
    const allDone = own.length > 1 && own.every((b) => b.done);
    if (allDone && p.date === view.today) {
      sounds.dayComplete();
      view.dayCompleteAt = Date.now();
      view.say('Every block today is done. Finished time glows.');
    } else sounds.done();
  });
}

/** Remove (with undo). Recurring: just this occurrence unless `all`. */
export function removeBlock(key: string, all = false) {
  const p = parseBlockKey(key);
  if (!p) return;
  const t = tasks.get(p.taskId);
  if (!t) return;
  const snapshot: Task = JSON.parse(JSON.stringify(t));
  if (t.recurrence && !all) tasks.removeOccurrence(t.id, p.date);
  else tasks.remove(t.id);
  if (view.selected === key) view.selected = null;
  if (view.sheet && 'key' in view.sheet && view.sheet.key === key) view.sheet = null;
  view.say(t.recurrence && !all ? `Skipped “${t.title || 'block'}” today` : `Removed “${t.title || 'block'}”`, {
    label: 'Undo',
    run: () => {
      tasks.remove(snapshot.id);
      tasks.restore(snapshot);
    },
  });
}

/** Copy a block into the next free gap after it (same day). */
export function duplicateBlock(key: string) {
  const p = parseBlockKey(key);
  const b = view.blockByKey(key);
  const t = p && tasks.get(p.taskId);
  if (!p || !b || !t) return;
  const len = b.endMs - b.startMs;
  const others = view.dayBlocks;
  const gap = freeGaps(others, b.endMs, startOfDayMs(addDays(p.date, 1)), len).find((g) => g.endMs - g.startMs >= len);
  const startMs = gap ? gap.startMs : b.endMs;
  const copy = tasks.create({
    ...JSON.parse(JSON.stringify(t)),
    id: undefined,
    date: p.date,
    start: Math.round(minutesOfDay(startMs)),
    duration: Math.round(len / MINUTE),
    recurrence: null,
    completions: [],
    completedAt: {},
    skips: [],
    overrides: {},
    subtasks: t.subtasks.map((s) => ({ ...s, id: Math.random().toString(36).slice(2, 10), done: false })),
  });
  view.selected = blockKey(copy.id, p.date);
  view.say(`Copied to ${formatTime(startMs, view.hour12)}`);
}

/** Gentle reschedule: slide an unfinished block into the next free gap today. */
export function moveToNextGap(key: string) {
  const p = parseBlockKey(key);
  const b = view.blockByKey(key);
  if (!p || !b) return;
  const len = b.endMs - b.startMs;
  const from = Math.ceil(Math.max(clock.now, b.startMs) / (5 * MINUTE)) * 5 * MINUTE;
  const end = startOfDayMs(addDays(view.today, 1));
  const others = view.todayBlocks.filter((x) => x.key !== key);
  const gap = freeGaps(others, from, end, len).find((g) => g.endMs - g.startMs >= len);
  if (!gap) {
    view.say('No free gap left today — try tomorrow.');
    return;
  }
  adjust(key, gap.startMs, gap.startMs + len);
  view.say(`Moved to ${formatTime(gap.startMs, view.hour12)}`);
}

export function moveToTomorrow(key: string) {
  const p = parseBlockKey(key);
  const t = p && tasks.get(p.taskId);
  if (!p || !t) return;
  if (t.recurrence) {
    tasks.removeOccurrence(t.id, p.date);
    tasks.create({ ...JSON.parse(JSON.stringify(t)), id: undefined, recurrence: null, completions: [], skips: [], overrides: {}, date: addDays(p.date, 1) });
  } else tasks.update(t.id, { date: addDays(p.date, 1) });
  view.say('See you tomorrow');
}

/** Later tray → today's next free slot. */
export function scheduleSoon(taskId: string) {
  const t = tasks.get(taskId);
  if (!t) return;
  const date = view.today;
  const len = t.duration * MINUTE;
  const from = Math.ceil(clock.now / (5 * MINUTE)) * 5 * MINUTE;
  const gap = freeGaps(view.todayBlocks, from, startOfDayMs(addDays(date, 1)), len)[0];
  const start = gap ? Math.round(minutesOfDay(gap.startMs)) : snap(minutesOfDay(from));
  tasks.schedule(t.id, date, start);
  view.date = date;
  view.selected = blockKey(t.id, date);
}
