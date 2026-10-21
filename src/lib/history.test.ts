import { afterEach, describe, expect, it } from 'vitest';
import { addDays, atMinutes, MINUTE } from './engine/time';
import type { CalendarEvent, ISODate, Task } from './engine/types';
import {
  completedItems,
  counts,
  filterActive,
  filterDone,
  firstDoneDate,
  groupByDay,
  NO_FILTER,
  provideDoneSources,
  sourcesFor,
  type PrayerDone,
} from './history';
import { computeInsights, evaluateAchievements } from './insights';
import { rhythm } from './streaks';
import { analyse } from './addons/retro/retro';

// Monday 19 October 2026, 18:00.
const TODAY = '2026-10-19';
const NOW = atMinutes(TODAY, 18 * 60);
const D = (n: number): ISODate => addDays(TODAY, n);

let seq = 0;
function task(p: Partial<Task>): Task {
  return {
    id: `t${++seq}`,
    title: 'Block',
    icon: 'laptop',
    category: 'focus',
    date: TODAY,
    start: 9 * 60,
    duration: 30,
    notes: '',
    subtasks: [],
    recurrence: null,
    completions: [],
    completedAt: {},
    skips: [],
    overrides: {},
    alerts: [],
    createdAt: 0,
    updatedAt: 0,
    ...p,
  };
}

/** Tick `dates`, `after` minutes past each start (default: 5 minutes past the end). */
function tick(t: Task, dates: ISODate[], after?: number): Task {
  for (const d of dates) {
    t.completions.push(d);
    const start = t.overrides[d]?.start ?? t.start ?? 12 * 60;
    t.completedAt![d] = atMinutes(d, start + (after ?? (t.overrides[d]?.duration ?? t.duration) + 5));
  }
  return t;
}

function event(p: Partial<CalendarEvent> & { startMs: number; endMs: number }): CalendarEvent {
  return { id: `e${++seq}`, provider: 'google', accountId: 'a', calendarId: 'c', title: 'Standup', allDay: false, calendarName: 'Work', ...p };
}

function prayer(date: ISODate, name: string, at: number, how: PrayerDone['how'] = 'ontime'): PrayerDone {
  const id = name.toLowerCase();
  return { id: `salah:${id}:${date}`, date, name, icon: 'sun', startMs: atMinutes(date, at), endMs: atMinutes(date, at + 15), how };
}

afterEach(() => provideDoneSources(null));

describe('completedItems', () => {
  it('lists every occurrence of a routine with when it was done and how long it took', () => {
    const meds = task({ title: 'Meds', category: 'care', date: D(-10), start: 8 * 60, duration: 10, recurrence: { freq: 'daily', interval: 1 } });
    tick(meds, [D(-2), D(-1)], 5);
    const items = completedItems({ tasks: [meds] }, null, TODAY);
    expect(items.map((i) => i.date)).toEqual([D(-1), D(-2)]);
    const [y] = items;
    expect(y).toMatchObject({ key: `task:${meds.id}@${D(-1)}`, source: 'task', kind: 'timed', recurring: true, title: 'Meds' });
    expect(y.spentMs).toBe(5 * MINUTE); // ticked 5 minutes in
    expect(y.doneAt).toBe(atMinutes(D(-1), 8 * 60 + 5));
  });

  it('honours per-occurrence edits and skips', () => {
    const t = task({ date: D(-5), recurrence: { freq: 'daily', interval: 1 }, overrides: { [D(-3)]: { title: 'Early', start: 7 * 60 } }, skips: [D(-2)] });
    t.completions.push(D(-3), D(-2)); // a skipped day is not an occurrence
    const items = completedItems({ tasks: [t] }, null, TODAY);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ title: 'Early', startMs: atMinutes(D(-3), 7 * 60) });
  });

  it('includes anytime blocks, backlog items and calendar events marked done', () => {
    const anytime = tick(task({ title: 'Water plants', start: null, date: D(-1) }), [D(-1)]);
    const cleared = task({ title: 'Book dentist', date: null, start: null, doneAt: atMinutes(D(-1), 10 * 60) });
    const waiting = task({ title: 'Later', date: null, start: null });
    const met = event({ startMs: atMinutes(D(-1), 11 * 60), endMs: atMinutes(D(-1), 11 * 60 + 30), done: atMinutes(D(-1), 11 * 60 + 31) });
    const skipped = event({ startMs: atMinutes(D(-1), 13 * 60), endMs: atMinutes(D(-1), 14 * 60), done: 1, skipped: true });
    const unmarked = event({ startMs: atMinutes(D(-1), 15 * 60), endMs: atMinutes(D(-1), 16 * 60) });
    const items = completedItems({ tasks: [anytime, cleared, waiting], events: [met, skipped, unmarked] }, null, TODAY);
    expect(items.map((i) => [i.source, i.kind, i.title])).toEqual([
      ['task', 'anytime', 'Water plants'],
      ['event', 'timed', 'Standup'],
      ['backlog', 'backlog', 'Book dentist'],
    ]);
    expect(items.find((i) => i.source === 'event')).toMatchObject({ key: `cal:a:${met.id}`, spentMs: 30 * MINUTE, note: 'Work' });
    expect(items.find((i) => i.source === 'backlog')!.key).toBe(`later:${cleared.id}`);
  });

  it('keeps to the range, and backlog items only once they have happened', () => {
    const old = tick(task({ date: D(-20) }), [D(-20)]);
    const soon = task({ date: null, start: null, doneAt: NOW + 60 * MINUTE });
    const ahead = tick(task({ date: D(2) }), [D(2)]);
    expect(completedItems({ tasks: [old, soon, ahead] }, D(-6), TODAY, NOW)).toEqual([]);
    expect(completedItems({ tasks: [old, soon, ahead] }, null, TODAY, NOW).map((i) => i.date)).toEqual([D(-20)]);
  });

  it('a prayer and its block are one item, with how it went', () => {
    const p = prayer(D(-1), 'Asr', 15 * 60, 'jamaat');
    const block = event({ id: p.id, provider: 'salah', accountId: 'salah', calendarId: 'salah', title: 'Asr', startMs: p.startMs!, endMs: p.endMs!, done: NOW });
    const items = completedItems({ tasks: [], prayers: [p], events: [block] }, null, TODAY);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ source: 'salah', how: 'jamaat', title: 'Asr', category: 'care' });
    expect(counts(items[0])).toBe(false);
  });

  it('orders newest day first, then by when it was done', () => {
    const a = tick(task({ title: 'A', date: D(-1), start: 9 * 60 }), [D(-1)]);
    const b = tick(task({ title: 'B', date: D(-1), start: 14 * 60 }), [D(-1)]);
    const c = tick(task({ title: 'C', date: TODAY, start: 8 * 60 }), [TODAY]);
    expect(completedItems({ tasks: [a, b, c] }, null, TODAY).map((i) => i.title)).toEqual(['C', 'B', 'A']);
  });
});

describe('filters and days', () => {
  const tasks = [
    tick(task({ title: 'Write the essay', category: 'learn', date: D(-1), start: 9 * 60, duration: 60 }), [D(-1)]),
    tick(task({ title: 'Walk', category: 'move', date: D(-1), start: 17 * 60, duration: 30 }), [D(-1)]),
    task({ title: 'Return parcel', category: 'routine', date: null, start: null, doneAt: atMinutes(TODAY, 9 * 60) }),
  ];
  const events = [event({ title: 'Café catch-up', calendarName: 'Friends', startMs: atMinutes(D(-1), 12 * 60), endMs: atMinutes(D(-1), 13 * 60), done: atMinutes(D(-1), 13 * 60) })];
  const prayers = [prayer(D(-1), 'Maghrib', 18 * 60)];
  const items = completedItems({ tasks, events, prayers }, null, TODAY);

  it('filters by kind, category and words (accents and case aside)', () => {
    expect(filterDone(items, { ...NO_FILTER, kind: 'tasks' }).map((i) => i.title)).toEqual(['Return parcel', 'Walk', 'Write the essay']);
    expect(filterDone(items, { ...NO_FILTER, kind: 'events' }).map((i) => i.title)).toEqual(['Café catch-up']);
    expect(filterDone(items, { ...NO_FILTER, kind: 'salah' }).map((i) => i.title)).toEqual(['Maghrib']);
    expect(filterDone(items, { ...NO_FILTER, category: 'move' }).map((i) => i.title)).toEqual(['Walk']);
    expect(filterDone(items, { ...NO_FILTER, query: 'cafe' }).map((i) => i.title)).toEqual(['Café catch-up']);
    expect(filterDone(items, { ...NO_FILTER, query: 'friends' })).toHaveLength(1); // the calendar's name
    expect(filterDone(items, { ...NO_FILTER, query: 'essay write' })).toHaveLength(1); // every word, any order
    expect(filterActive(NO_FILTER)).toBe(false);
    expect(filterActive({ ...NO_FILTER, query: '  ' })).toBe(false);
  });

  it('groups by day with the counts "Your week" uses; prayers apart', () => {
    const days = groupByDay(items);
    expect(days.map((d) => d.date)).toEqual([TODAY, D(-1)]);
    const y = days[1];
    expect(y.done).toBe(3);
    expect(y.salah).toBe(1);
    expect(y.spentMs).toBe((60 + 30 + 60) * MINUTE);
    expect(y.arcs.map((a) => a.title)).toEqual(['Write the essay', 'Café catch-up', 'Walk']);
    expect(days[0]).toMatchObject({ done: 1, backlog: 1, spentMs: 0, arcs: [] });
  });

  it('finds the first day', () => {
    expect(firstDoneDate({ tasks, events, prayers })).toBe(D(-1));
    expect(firstDoneDate({ tasks: [] })).toBeNull();
  });
});

describe('the analytics count what the history lists', () => {
  const meeting = event({ title: 'Planning', startMs: atMinutes(D(-1), 10 * 60), endMs: atMinutes(D(-1), 11 * 60), done: atMinutes(D(-1), 11 * 60) });
  const block = tick(task({ title: 'Deep work', date: D(-1), start: 14 * 60, duration: 60 }), [D(-1)]);

  it('sourcesFor adds the app’s done events to a task list, and leaves full sources alone', () => {
    provideDoneSources(() => ({ events: [meeting] }));
    expect(sourcesFor([block], null, TODAY).events).toEqual([meeting]);
    expect(sourcesFor({ tasks: [block] }, null, TODAY).events).toBeUndefined();
  });

  it('Your week, badges, the rhythm and Retrospection agree with the history', () => {
    provideDoneSources(() => ({ events: [meeting] }));
    const listed = groupByDay(completedItems(sourcesFor([block], null, TODAY), null, TODAY, NOW));
    expect(listed[0]).toMatchObject({ date: D(-1), done: 2, spentMs: 2 * 60 * MINUTE });

    const s = computeInsights([block], NOW);
    const day = s.days.find((d) => d.date === D(-1))!;
    expect(day.done).toBe(2);
    expect(day.spentMs).toBe(2 * 60 * MINUTE);
    expect(s.finished).toBe(2);
    expect(s.kept).toBe(s.finished);
    expect(s.planned).toBe(2); // the meeting you marked done counts as a plan kept

    // A day with only a meeting marked done still keeps the rhythm going.
    expect(rhythm([], NOW).current).toBe(1);
    expect(evaluateAchievements([], NOW).map((a) => a.id)).toContain('first-bloom');

    const r = analyse({ tasks: [block], events: [], from: D(-6), to: TODAY, nowMs: NOW, wake: 420, sleep: 1380 });
    expect(r.done).toBe(2);
    expect(r.planned).toBe(2);
    expect(r.doneMin).toBe(120);
  });

  it('prayers never change the counts', () => {
    const prayers = [prayer(D(-1), 'Fajr', 5 * 60), prayer(D(-1), 'Isha', 21 * 60)];
    provideDoneSources(() => ({ prayers }));
    expect(computeInsights([block], NOW).finished).toBe(1);
    expect(rhythm([], NOW).current).toBe(0);
  });

  it('a meeting the retro is handed and the app knows about counts once', () => {
    provideDoneSources(() => ({ events: [meeting] }));
    const r = analyse({ tasks: [], events: [meeting], from: D(-6), to: TODAY, nowMs: NOW, wake: 420, sleep: 1380 });
    expect(r.done).toBe(1);
  });
});
