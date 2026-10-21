import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { blockKey } from '../../engine/blocks';
import { atMinutes, MINUTE } from '../../engine/time';
import type { CalendarEvent, Task } from '../../engine/types';
import { clock } from '../../stores/clock.svelte';
import { DEFAULT_SETTINGS, settings } from '../../stores/settings.svelte';
import { taskFile, tasks } from '../../stores/tasks.svelte';
import { view } from '../../stores/view.svelte';
import { dropFor, statusBoard, type Card } from './board';
import { applyDrop, fitFree, migrateViews, moveBar, spanFree } from './views.svelte';
import { weekBoard } from './board';
import { blocksInRange, floatingBlocks } from '../../engine/blocks';
import { addDays, startOfDayMs } from '../../engine/time';

// Monday 2026-10-19, 10:40 in whatever zone the tests run in.
const TODAY = '2026-10-19';
const TOMORROW = '2026-10-20';
const NOW = atMinutes(TODAY, 10 * 60 + 40);
const daily = { freq: 'daily' as const, interval: 1 };

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

const ev = (id: string, title: string, from: number, to: number, provider: CalendarEvent['provider'] = 'google'): CalendarEvent => ({
  id: `c:${id}`,
  provider,
  accountId: provider === 'salah' ? 'waqt' : 'a',
  calendarId: 'c',
  title,
  startMs: atMinutes(TODAY, from),
  endMs: atMinutes(TODAY, to),
  allDay: false,
});

function seed() {
  taskFile.value.tasks = [
    task({ id: 'deep', title: 'Deep work', start: 615, duration: 45 }),
    task({ id: 'lunch', title: 'Lunch', category: 'care', start: 720, duration: 40, recurrence: daily }),
    task({ id: 'plants', title: 'Water the plants', category: 'routine', start: null, duration: 10 }),
    task({ id: 'essay', title: 'Write the essay', date: null, duration: 45, list: 'next', order: 1 }),
    task({ id: 'dentist', title: 'Book dentist', date: null, duration: 15, order: 2 }),
  ];
}

const ctx = () => ({ today: view.today, date: view.date, now: clock.now, fit: fitFree });
const card = (col: 'later' | 'today' | 'now' | 'done', id: string): Card => {
  const b = statusBoard({ date: view.date, today: view.today, now: clock.now, timed: view.dayBlocks, floating: view.floating, tasks: taskFile.value.tasks });
  return b[col].find((c) => c.taskId === id)!;
};

beforeAll(() => {
  Object.assign(globalThis, { innerWidth: 1200, innerHeight: 800 });
});

beforeEach(() => {
  settings.value = { ...structuredClone(DEFAULT_SETTINGS), clock: '24' };
  clock.setOffset(NOW - Date.now());
  view.date = view.today;
  view.calendarEvents = [];
  view.addonEvents = {};
  seed();
});

describe('board drops, live', () => {
  it('schedules Later → Today around a meeting and a prayer', () => {
    // Deep work runs to 11:00, a meeting 11:00–11:30, Dhuhr 11:30–11:50, then lunch at 12:00.
    view.calendarEvents = [ev('m', 'Design review', 660, 690)];
    view.addonEvents = { waqt: [ev('dhuhr', 'Dhuhr', 690, 710, 'salah')] };
    const d = dropFor(card('later', 'essay'), 'today', ctx());
    expect(d).toMatchObject({ kind: 'schedule', taskId: 'essay' });
    applyDrop(d);
    const t = tasks.get('essay')!;
    expect(t.date).toBe(TODAY);
    // 45 minutes fits only after lunch (12:40).
    expect(t.start).toBe(12 * 60 + 40);
    const s = atMinutes(TODAY, t.start!);
    for (const e of view.events) expect(s >= e.endMs || s + 45 * MINUTE <= e.startMs).toBe(true);
  });

  it('says so when nothing fits, and leaves the item in Later', () => {
    view.calendarEvents = [ev('all', 'Offsite', 10 * 60, 24 * 60 - 1)];
    const d = dropFor(card('later', 'essay'), 'today', ctx());
    expect(d).toMatchObject({ kind: 'none', why: 'full' });
    applyDrop(d);
    expect(tasks.get('essay')!.date).toBeNull();
  });

  it('sends a block back to the backlog, ticks it, and unticks it', () => {
    applyDrop(dropFor(card('today', 'lunch'), 'done', ctx()));
    expect(tasks.get('lunch')!.completions).toEqual([TODAY]);
    applyDrop(dropFor(card('done', 'lunch'), 'today', ctx()));
    expect(tasks.get('lunch')!.completions).toEqual([]);
    applyDrop(dropFor(card('today', 'plants'), 'later', ctx()));
    const p = tasks.get('plants')!;
    expect([p.date, p.start, p.list]).toEqual([null, null, 'next']);
    // An anytime block keeps its own length in the backlog.
    expect(p.duration).toBe(10);
  });

  it('starts a block now, and finishes a backlog item from Later', () => {
    applyDrop(dropFor(card('today', 'lunch'), 'now', ctx()));
    expect(tasks.get('lunch')!.overrides[TODAY]).toMatchObject({ start: 640, duration: 40 });
    applyDrop(dropFor(card('later', 'dentist'), 'done', ctx()));
    expect(tasks.get('dentist')!.doneAt).toBe(clock.now);
    expect(card('done', 'dentist')).toBeTruthy();
  });

  it('reorders Later', () => {
    const c = card('later', 'dentist');
    applyDrop(dropFor(c, 'later', { ...ctx(), laterIds: ['later:essay', 'later:dentist'], index: 0 }));
    expect(tasks.get('dentist')!.order).toBe(0);
    expect(tasks.get('essay')!.order).toBe(1);
  });
});

describe('week drops, live', () => {
  const weekCard = (id: string) => {
    const dates = Array.from({ length: 7 }, (_, i) => addDays(TODAY, i));
    const all = taskFile.value.tasks;
    const days = Object.fromEntries(dates.map((d) => [d, { timed: blocksInRange(all, view.events, startOfDayMs(d), startOfDayMs(addDays(d, 1))), floating: floatingBlocks(all, view.events, d) }]));
    return weekBoard({ dates, today: TODAY, now: clock.now, days, tasks: all })[1].cards.find((c) => c.taskId === id)!;
  };
  const wctx = () => ({ ...ctx(), free: spanFree });

  it('keeps the time of day on a free day, and steps around a meeting there', () => {
    applyDrop(dropFor(weekCard('deep'), `day:${TOMORROW}`, wctx()));
    expect(tasks.get('deep')).toMatchObject({ date: TOMORROW, start: 615 });
    seed();
    view.calendarEvents = [{ ...ev('t', 'Planning', 0, 0), startMs: atMinutes(TOMORROW, 600), endMs: atMinutes(TOMORROW, 660) }];
    const d = dropFor(weekCard('deep'), `day:${TOMORROW}`, wctx());
    expect(d).toMatchObject({ kind: 'move', date: TOMORROW });
    expect(d.kind === 'move' && d.kept).toBeFalsy();
    applyDrop(d);
    const t = tasks.get('deep')!;
    const s = atMinutes(TOMORROW, t.start!);
    expect(s >= atMinutes(TOMORROW, 660) || s + 45 * MINUTE <= atMinutes(TOMORROW, 600)).toBe(true);
  });
});

describe('gantt edits, live', () => {
  it('moves and stretches like the rail; a repeating block keeps its other days', () => {
    moveBar(blockKey('deep', TODAY), TODAY, 14 * 60, 15 * 60);
    expect(tasks.get('deep')).toMatchObject({ start: 840, duration: 60 });
    moveBar(blockKey('lunch', TODAY), TODAY, 12 * 60 + 30, 13 * 60);
    expect(tasks.get('lunch')).toMatchObject({ start: 720, duration: 40 });
    expect(tasks.get('lunch')!.overrides[TODAY]).toEqual({ start: 750, duration: 30 });
  });

  it('moves a block to another day; a repeating one becomes a one-off there', () => {
    moveBar(blockKey('deep', TODAY), TOMORROW, 9 * 60, 9 * 60 + 45);
    expect(tasks.get('deep')).toMatchObject({ date: TOMORROW, start: 540 });
    const before = taskFile.value.tasks.length;
    const key = moveBar(blockKey('lunch', TODAY), TOMORROW, 13 * 60, 13 * 60 + 40);
    expect(tasks.get('lunch')!.skips).toEqual([TODAY]);
    expect(taskFile.value.tasks.length).toBe(before + 1);
    const copy = taskFile.value.tasks[before];
    expect(key).toBe(blockKey(copy.id, TOMORROW));
    expect(copy).toMatchObject({ date: TOMORROW, start: 780, recurrence: null });
  });
});

describe('the file', () => {
  it('reads old or broken files safely', () => {
    expect(migrateViews(null)).toEqual({ version: 1, mode: 'list', board: { group: 'day' }, gantt: { days: 1, pxh: 0 } });
    expect(migrateViews({ mode: 'gantt', board: { group: 'week' }, gantt: { days: 7, pxh: 9999 } })).toEqual({ version: 1, mode: 'gantt', board: { group: 'week' }, gantt: { days: 7, pxh: 240 } });
    expect(migrateViews({ mode: 'grid', gantt: { days: 5, pxh: -3 } }).mode).toBe('list');
  });
});
