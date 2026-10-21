import { describe, expect, it } from 'vitest';
import { blocksInRange, eventBlock, floatingBlocks } from '../../engine/blocks';
import { addDays, atMinutes, startOfDayMs } from '../../engine/time';
import type { CalendarEvent, Task } from '../../engine/types';
import { describeDrop, dropFor, landingIndex, neighbour, statusBoard, weekBoard, type Card, type DropContext } from './board';

// Monday 2026-10-19, 10:40 in whatever zone the tests run in.
const TODAY = '2026-10-19';
const TOMORROW = '2026-10-20';
const NOW = atMinutes(TODAY, 10 * 60 + 40);

let n = 0;
function task(p: Partial<Task>): Task {
  n++;
  return {
    id: p.id ?? `t${n}`,
    title: `Task ${n}`,
    icon: 'laptop',
    category: 'focus',
    date: TODAY,
    start: null,
    duration: 30,
    notes: '',
    subtasks: [],
    recurrence: null,
    completions: [],
    completedAt: {},
    skips: [],
    overrides: {},
    alerts: [],
    createdAt: NOW - n * 60_000,
    updatedAt: NOW,
    list: 'inbox',
    priority: null,
    due: null,
    energy: null,
    order: n,
    doneAt: null,
    acks: [],
    ...p,
  };
}

const meeting: CalendarEvent = {
  id: 'cal1:m1',
  provider: 'google',
  accountId: 'a',
  calendarId: 'cal1',
  title: 'Design review',
  startMs: atMinutes(TODAY, 11 * 60 + 30),
  endMs: atMinutes(TODAY, 12 * 60),
  allDay: false,
};
const pastEvent: CalendarEvent = { ...meeting, id: 'cal1:m0', title: 'Standup', startMs: atMinutes(TODAY, 9 * 60), endMs: atMinutes(TODAY, 9 * 60 + 15) };

function day(tasks: Task[], events: CalendarEvent[] = [], date = TODAY) {
  return {
    timed: blocksInRange(tasks, events, startOfDayMs(date), startOfDayMs(addDays(date, 1))),
    floating: floatingBlocks(tasks, events, date),
  };
}

const TASKS = () => [
  task({ id: 'meds', title: 'Morning meds', start: 480, duration: 10, completions: [TODAY], completedAt: { [TODAY]: atMinutes(TODAY, 485) } }),
  task({ id: 'late', title: 'Stretch', start: 540, duration: 20 }),
  task({ id: 'deep', title: 'Deep work', start: 615, duration: 75 }),
  task({ id: 'lunch', title: 'Lunch', start: 720, duration: 40, recurrence: { freq: 'daily', interval: 1 } }),
  task({ id: 'plants', title: 'Water the plants', start: null, duration: 10 }),
  task({ id: 'dentist', title: 'Book dentist', date: null, duration: 15, order: 2 }),
  task({ id: 'parcel', title: 'Return the parcel', date: null, duration: 20, list: 'next', order: 1 }),
  task({ id: 'gone', title: 'Old idea', date: null, duration: 20, doneAt: atMinutes(TODAY, 9 * 60) }),
];

function board(tasks = TASKS(), events = [meeting, pastEvent], date = TODAY) {
  return statusBoard({ date, today: TODAY, now: NOW, ...day(tasks, events, date), tasks });
}

const ctx = (over: Partial<DropContext> = {}): DropContext => ({ today: TODAY, date: TODAY, now: NOW, fit: () => 13 * 60, ...over });
const find = (cards: Card[], id: string) => cards.find((c) => c.id === id || c.taskId === id)!;

describe('status board', () => {
  it('sorts the day into Later, Today, Now and Done', () => {
    const b = board();
    expect(b.later.map((c) => c.taskId)).toEqual(['parcel', 'dentist']);
    expect(b.now.map((c) => c.taskId)).toEqual(['deep']);
    expect(b.today.map((c) => c.title)).toEqual(['Stretch', 'Design review', 'Lunch', 'Water the plants']);
    expect(b.done.map((c) => c.title)).toEqual(['Old idea', 'Morning meds']);
  });

  it('marks what went by quietly, and keeps events locked', () => {
    const b = board();
    expect(find(b.today, 'late').earlier).toBe(true);
    expect(find(b.today, 'lunch').earlier).toBe(false);
    const ev = b.today.find((c) => c.title === 'Design review')!;
    expect(ev.locked).toBe(true);
    // A meeting that is over has nothing left to do today.
    expect(b.today.some((c) => c.title === 'Standup')).toBe(false);
    expect(find(b.today, 'plants').anytime).toBe(true);
    expect(find(b.today, 'plants').minutes).toBe(10);
  });

  it('has no Now on other days', () => {
    const b = board(TASKS(), [], TOMORROW);
    expect(b.now).toEqual([]);
    expect(b.today.map((c) => c.taskId)).toEqual(['lunch']);
  });

  it('gives one task the same fly key in Later and on the day', () => {
    const t = TASKS();
    const before = board(t).later.find((c) => c.taskId === 'dentist')!;
    t.find((x) => x.id === 'dentist')!.date = TODAY;
    t.find((x) => x.id === 'dentist')!.start = 900;
    const after = board(t).today.find((c) => c.taskId === 'dentist')!;
    expect(after.fly).toBe(before.fly);
    // Repeating blocks fly by their own occurrence.
    expect(find(board(t).today, 'lunch').fly).toBe('task:lunch@2026-10-19');
  });
});

describe('drops', () => {
  const b = board();
  const later = find(b.later, 'dentist');
  const deep = find(b.now, 'deep');
  const lunch = find(b.today, 'lunch');
  const meds = find(b.done, 'meds');
  const gone = find(b.done, 'gone');
  const ev = b.today.find((c) => c.locked)!;

  it('Later → Today schedules into the first free time that fits', () => {
    const seen: [string, number][] = [];
    const d = dropFor(later, 'today', ctx({ fit: (date, min) => (seen.push([date, min]), 12 * 60 + 40) }));
    expect(d).toEqual({ kind: 'schedule', taskId: 'dentist', date: TODAY, start: 760, minutes: 15, reopen: false });
    expect(seen).toEqual([[TODAY, 15]]);
    expect(dropFor(later, 'today', ctx({ fit: () => null }))).toEqual({ kind: 'none', why: 'full', minutes: 15, date: TODAY });
  });

  it('Today → Later sends it back; anything → Done ticks it; Done → Today unticks', () => {
    expect(dropFor(lunch, 'later', ctx())).toEqual({ kind: 'unschedule', key: 'task:lunch@2026-10-19' });
    expect(dropFor(lunch, 'done', ctx())).toEqual({ kind: 'tick', key: 'task:lunch@2026-10-19' });
    expect(dropFor(deep, 'done', ctx())).toEqual({ kind: 'tick', key: 'task:deep@2026-10-19' });
    expect(dropFor(later, 'done', ctx())).toEqual({ kind: 'finish', taskId: 'dentist' });
    expect(dropFor(meds, 'today', ctx())).toEqual({ kind: 'untick', key: 'task:meds@2026-10-19' });
    expect(dropFor(gone, 'later', ctx())).toEqual({ kind: 'restore', taskId: 'gone' });
    expect(dropFor(gone, 'today', ctx()).kind).toBe('schedule');
  });

  it('Now starts it now; Now → Today finds the next free time', () => {
    expect(dropFor(lunch, 'now', ctx())).toEqual({ kind: 'start', key: 'task:lunch@2026-10-19', start: 640, minutes: 40 });
    expect(dropFor(later, 'now', ctx())).toMatchObject({ kind: 'schedule', start: 640, now: true });
    expect(dropFor(deep, 'today', ctx({ fit: (_d, _m, key) => (key === deep.key ? 14 * 60 : null) }))).toMatchObject({ kind: 'move', start: 840, sameDay: true });
    expect(dropFor(meds, 'now', ctx()).kind).toBe('none');
    expect(dropFor(lunch, 'now', ctx({ date: TOMORROW })).kind).toBe('none');
  });

  it('never moves calendar events or salah', () => {
    for (const to of ['later', 'today', 'now', 'done', `day:${TOMORROW}`] as const) expect(dropFor(ev, to, ctx())).toEqual({ kind: 'none', why: 'locked' });
  });

  it('reorders Later, and slides a block that went by into the next free time', () => {
    const ids = b.later.map((c) => c.id);
    expect(dropFor(later, 'later', ctx({ laterIds: ids, index: 0 }))).toEqual({ kind: 'reorder', ids: ['later:dentist', 'later:parcel'] });
    expect(dropFor(later, 'later', ctx({ laterIds: ids, index: 1 }))).toEqual({ kind: 'none', why: 'same' });
    const late = find(b.today, 'late');
    expect(dropFor(late, 'today', ctx())).toMatchObject({ kind: 'move', key: 'task:late@2026-10-19', start: 780, sameDay: true });
    expect(dropFor(lunch, 'today', ctx()).kind).toBe('none');
  });

  it('says where it lands', () => {
    expect(describeDrop(dropFor(later, 'today', ctx()), TODAY, false)).toBe('13:00 · first free time');
    expect(describeDrop(dropFor(later, 'today', ctx({ fit: () => null })), TODAY, false)).toBe('No 15m gap left today');
    expect(describeDrop(dropFor(lunch, 'later', ctx()), TODAY, false)).toBe('Back to the backlog');
    expect(describeDrop(dropFor(lunch, 'now', ctx()), TODAY, true)).toBe('Start now');
  });

  it('previews the landing spot in time order', () => {
    const d = dropFor(later, 'today', ctx({ fit: () => 12 * 60 + 40 }));
    // After Stretch (9:00), the meeting (11:30) and Lunch (12:00); before the anytime block.
    expect(landingIndex(b.today, d, later)).toBe(3);
    expect(landingIndex(b.done, dropFor(lunch, 'done', ctx()), lunch)).toBe(0);
  });
});

describe('week board', () => {
  const tasks = TASKS();
  const dates = Array.from({ length: 7 }, (_, i) => addDays(TODAY, i));
  const days = Object.fromEntries(dates.map((d) => [d, day(tasks, [meeting], d)]));
  const cols = weekBoard({ dates, today: TODAY, now: NOW, days, tasks });

  it('has Later and the next seven days', () => {
    expect(cols.map((c) => c.id)).toEqual(['later', ...dates.map((d) => `day:${d}`)]);
    expect(cols[1].cards.map((c) => c.title)).toEqual(['Morning meds', 'Stretch', 'Deep work', 'Design review', 'Lunch', 'Water the plants']);
    // The daily lunch shows every day.
    expect(cols.slice(1).every((c) => c.cards.some((x) => x.taskId === 'lunch'))).toBe(true);
  });

  it('moves a block to another day into its first free time; anytime stays anytime', () => {
    const lunch = cols[1].cards.find((c) => c.taskId === 'lunch')!;
    const fit = (date: string, min: number) => (date === TOMORROW && min === 40 ? 7 * 60 : null);
    expect(dropFor(lunch, `day:${TOMORROW}`, ctx({ fit }))).toEqual({ kind: 'move', key: lunch.key, date: TOMORROW, start: 420, minutes: 40, sameDay: false });
    const plants = cols[1].cards.find((c) => c.taskId === 'plants')!;
    expect(dropFor(plants, `day:${TOMORROW}`, ctx())).toMatchObject({ kind: 'move', start: null });
    expect(dropFor(lunch, `day:${TODAY}`, ctx()).kind).toBe('none');
    const dentist = cols[0].cards.find((c) => c.taskId === 'dentist')!;
    expect(dropFor(dentist, `day:${TOMORROW}`, ctx({ fit: () => 8 * 60 }))).toMatchObject({ kind: 'schedule', date: TOMORROW, start: 480 });
    expect(describeDrop(dropFor(lunch, `day:${TOMORROW}`, ctx({ fit })), TODAY, false)).toBe('Tomorrow · 07:00 · first free time');
  });

  it('keeps its time of day on the new day when that time is free there', () => {
    const lunch = cols[1].cards.find((c) => c.taskId === 'lunch')!;
    const asked: [string, number, number][] = [];
    const free = (date: string, start: number, min: number) => (asked.push([date, start, min]), true);
    const d = dropFor(lunch, `day:${TOMORROW}`, ctx({ free, fit: () => 7 * 60 }));
    expect(d).toEqual({ kind: 'move', key: lunch.key, date: TOMORROW, start: 720, minutes: 40, sameDay: false, kept: true });
    expect(asked).toEqual([[TOMORROW, 720, 40]]);
    expect(describeDrop(d, TODAY, false)).toBe('Tomorrow · 12:00 · same time');
    // Busy at that time: the first free time instead.
    expect(dropFor(lunch, `day:${TOMORROW}`, ctx({ free: () => false, fit: () => 7 * 60 }))).toMatchObject({ start: 420 });
  });

  it('steps between columns for the keyboard', () => {
    const ids = cols.map((c) => c.id);
    expect(neighbour(ids, 'later', 1)).toBe(`day:${TODAY}`);
    expect(neighbour(ids, 'later', -1)).toBeNull();
  });

  it('shows the event once, on its own day', () => {
    expect(eventBlock(meeting).date).toBe(TODAY);
    expect(cols.filter((c) => c.cards.some((x) => x.title === 'Design review')).length).toBe(1);
  });
});
