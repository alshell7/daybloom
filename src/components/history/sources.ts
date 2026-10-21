// The live side of the history (lib/history.ts is the pure side): what it reads and what its
// rows do. It reads your tasks, the calendar events you marked done (matched to the calendar
// cache, which keeps about a month of past events) and the prayers you marked in Waqt.
//
// On load it tells lib/history.ts where done events come from, so every count that only has
// the task list — Your week, badges, the rhythm, Retrospection, the assistant — counts them too.
// Main window: InsightsPanel imports this module at start-up.

import { calendarState, dedupeEvents } from '../../lib/calendarBridge.svelte';
import { isOn } from '../../lib/addons/registry';
import { PRAYER_ICON, PRAYER_NAME, type PrayerId } from '../../lib/addons/waqt/types';
import { waqt, waqtFile } from '../../lib/addons/waqt/waqt.svelte';
import { backlog } from '../../lib/backlog';
import { MINUTE } from '../../lib/engine/time';
import type { CalendarEvent } from '../../lib/engine/types';
import { provideDoneSources, type DoneItem, type DoneSources, type PrayerDone } from '../../lib/history';
import { sounds } from '../../lib/sound';
import { eventStateFile, eventStates } from '../../lib/stores/eventStates.svelte';
import { taskFile, tasks } from '../../lib/stores/tasks.svelte';
import { view } from '../../lib/stores/view.svelte';

// ── Reading ──

let evMemo: { states: unknown; cal: unknown; out: CalendarEvent[] } | null = null;

/** Calendar events you marked done (and haven't skipped since), with when. */
export function doneEvents(): CalendarEvent[] {
  const states = eventStateFile.value.states;
  // Replaced after every sync: reading it here re-runs the counts when the cache changes.
  const cal = view.calendarEvents;
  if (evMemo && evMemo.states === states && evMemo.cal === cal) return evMemo.out;
  const marked = Object.entries(states).filter(([, s]) => s.done && !s.skipped);
  const out: CalendarEvent[] = [];
  if (marked.length) {
    const svc = calendarState.service;
    const pool = svc ? dedupeEvents(svc.eventsBetween(0, 8.64e15)) : cal;
    const byKey = new Map(pool.map((ev) => [`cal:${ev.accountId}:${ev.id}`, ev]));
    for (const [key, s] of marked) {
      const ev = byKey.get(key);
      if (ev && ev.provider !== 'salah') out.push({ ...ev, done: s.done });
      else if (!ev && s.was) {
        // Older than the calendar's cache: what was kept with the mark.
        const [, accountId, ...rest] = key.split(':');
        const w = s.was;
        out.push({ id: rest.join(':'), provider: 'google', accountId, calendarId: accountId, title: w.title, startMs: w.startMs, endMs: w.endMs, allDay: false, done: s.done, ...(w.category ? { category: w.category as CalendarEvent['category'] } : {}), ...(w.icon ? { icon: w.icon } : {}), ...(w.calendarName ? { calendarName: w.calendarName } : {}) });
      }
    }
  }
  evMemo = { states, cal, out };
  return out;
}

let prMemo: { prayed: unknown; detail: unknown; settings: string; out: PrayerDone[] } | null = null;

/** Prayers you marked in Waqt (while it is on), with their times when Waqt knows them. */
export function donePrayers(): PrayerDone[] {
  if (!isOn('waqt')) return [];
  const { prayed, detail } = waqtFile.value;
  const settings = JSON.stringify(waqt.settings);
  if (prMemo && prMemo.prayed === prayed && prMemo.detail === detail && prMemo.settings === settings) return prMemo.out;
  const out: PrayerDone[] = [];
  for (const [date, marks] of Object.entries(prayed)) {
    const day = waqt.day(date);
    for (const id of Object.keys(marks) as PrayerId[]) {
      const how = waqt.howOf(date, id);
      if (!how) continue;
      const slot = day?.prayers.find((p) => p.id === id);
      const start = slot ? (slot.jamaat ?? slot.at) : null;
      const len = slot?.name === 'Jumu’ah' ? waqt.settings.jamaat.jumuah.minutes : waqt.settings.dial.minutes;
      const d = waqt.detailOf(date, id);
      out.push({
        id: `salah:${id}:${date}`,
        date,
        name: slot?.name ?? PRAYER_NAME[id],
        icon: PRAYER_ICON[id],
        startMs: start,
        endMs: start == null ? null : start + len * MINUTE,
        how,
        ...(d.qasr ? { qasr: true } : {}),
        ...(d.at ? { markedAt: d.at } : {}),
      });
    }
  }
  prMemo = { prayed, detail, settings, out };
  return out;
}

/** Everything the History tab lists. */
export function historySources(): DoneSources {
  return { tasks: taskFile.value.tasks, events: doneEvents(), prayers: donePrayers() };
}

// Counts that only have the tasks still count the events you marked done (never the prayers:
// see `counts` in lib/history.ts).
provideDoneSources(() => ({ events: doneEvents() }));

// ── Acting ──

/** The prayer behind a salah item. */
function prayerOf(i: DoneItem): PrayerId | null {
  const m = /^cal:salah:salah:([a-z]+):/.exec(i.key);
  return m ? (m[1] as PrayerId) : null;
}

/** Can this item open in the block sheet right now? (Older calendar events have left the day's pool.) */
export function canOpen(i: DoneItem): boolean {
  if (i.source === 'salah') return isOn('waqt');
  if (i.source !== 'event') return true;
  return view.events.some((ev) => `cal:${ev.accountId}:${ev.id}` === i.key);
}

/** Open what was done: its block (on its day), its backlog card, or Waqt for a prayer. */
export function openItem(i: DoneItem) {
  if (i.source === 'salah') {
    view.sheet = { kind: 'waqt' };
    return;
  }
  if (i.source === 'backlog') {
    view.sheet = { kind: 'edit', key: i.key };
    return;
  }
  view.setDate(i.date);
  if (!canOpen(i)) return;
  view.selected = i.key;
  view.sheet = { kind: 'edit', key: i.key };
}

/** "Not done after all": un-tick it, with an Undo that puts it back as it was (same time). */
export function undoDone(i: DoneItem) {
  const name = i.title.trim() || 'That block';
  let restore: (() => void) | null = null;

  if (i.source === 'task') {
    const t = tasks.get(i.taskId);
    if (!t || !t.completions.includes(i.date)) return;
    tasks.toggleDone(t.id, i.date);
    restore = () => {
      const now = tasks.get(i.taskId);
      if (now && !now.completions.includes(i.date)) tasks.toggleDone(now.id, i.date, i.doneAt ?? Date.now());
    };
  } else if (i.source === 'backlog') {
    const t = tasks.get(i.taskId);
    if (!t?.doneAt) return;
    const was = { doneAt: t.doneAt, order: t.order };
    backlog.restore(t.id);
    restore = () => tasks.update(i.taskId, was);
  } else if (i.source === 'event') {
    const was = eventStates.of(i.key);
    if (!was?.done) return;
    eventStates.set(i.key, null);
    restore = () => eventStates.set(i.key, { done: was.done });
  } else {
    const id = prayerOf(i);
    if (!id) return;
    const f = waqtFile.value;
    const day = f.prayed[i.date] ? { ...f.prayed[i.date] } : null;
    const det = f.detail?.[i.date] ? { ...f.detail[i.date] } : null;
    waqt.mark(i.date, id, null);
    restore = () => {
      const g = waqtFile.value;
      if (day) g.prayed = { ...g.prayed, [i.date]: { ...(g.prayed[i.date] ?? {}), [id]: day[id] } };
      if (det?.[id]) g.detail = { ...(g.detail ?? {}), [i.date]: { ...(g.detail?.[i.date] ?? {}), [id]: det[id] } };
    };
  }

  sounds.tick();
  const back = restore;
  view.say(i.source === 'salah' ? `${name} is unmarked` : `“${name}” is open again`, { label: 'Undo', run: () => (back(), sounds.done()) }, 6000);
}
