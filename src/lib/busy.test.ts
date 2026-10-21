import { beforeEach, describe, expect, it } from 'vitest';
import { respond } from './assistant/brain';
import { freeSlot } from './busy';
import { atMinutes } from './engine/time';
import type { CalendarEvent } from './engine/types';
import { clock } from './stores/clock.svelte';
import { DEFAULT_SETTINGS, settings } from './stores/settings.svelte';
import { taskFile } from './stores/tasks.svelte';
import { view } from './stores/view.svelte';

// Monday 2026-10-19, 10:40.
const TODAY = '2026-10-19';
const NOW = atMinutes(TODAY, 10 * 60 + 40);
const ev = (id: string, title: string, s: number, e: number, provider: CalendarEvent['provider'] = 'google', day = TODAY): CalendarEvent => ({
  id,
  provider,
  accountId: provider,
  calendarId: provider,
  title,
  startMs: atMinutes(day, s),
  endMs: atMinutes(day, e),
  allDay: false,
});
const placed = () => taskFile.value.tasks.map((t) => [t.title, t.date, t.start, t.duration]);

beforeEach(() => {
  settings.value = { ...structuredClone(DEFAULT_SETTINGS), clock: '24' };
  clock.setOffset(NOW - Date.now());
  view.date = view.today;
  taskFile.value.tasks = [];
  view.calendarEvents = [ev('standup', 'Standup', 645, 720)];
  view.addonEvents = {};
  // Salah with its dial blocks hidden: still kept free.
  view.busyEvents = { salah: [ev('dhuhr', 'Dhuhr', 720, 740, 'salah')] };
});

describe('free time', () => {
  it('steps over calendar events and salah, shown or not', () => {
    expect(freeSlot(TODAY, 30, NOW)).toEqual({ date: TODAY, start: 12 * 60 + 20, moved: false });
  });

  it('moves to the next day with room when today is full', () => {
    view.calendarEvents = [ev('offsite', 'Offsite', 10 * 60, 23 * 60)];
    expect(freeSlot(TODAY, 60, NOW)).toEqual({ date: '2026-10-20', start: 7 * 60, moved: true });
  });

  it('stays inside waking hours', () => {
    settings.value.sleep = 13 * 60;
    expect(freeSlot(TODAY, 60, NOW)?.date).toBe('2026-10-20');
  });
});

describe('asking for free time', () => {
  it.each([
    ['add reading in my free time', 'Reading', 30],
    ['add a task to read in my free time', 'Read', 30],
    ['schedule reading for 1 hour in my free time', 'Reading', 60],
    ['find time for the gym', 'Gym', 30],
    ['fit in a walk', 'Walk', 30],
    ['add call mom when I am free', 'Call mom', 30],
  ])('“%s” adds it after the meeting and the prayer', async (q, title, minutes) => {
    const r = await respond(q, null, NOW);
    expect(r.route.call?.tool).toBe('create_block');
    expect(placed()).toEqual([[title, TODAY, 12 * 60 + 20, minutes]]);
  });

  it('a full day goes to the next free one, and says so', async () => {
    view.calendarEvents = [ev('offsite', 'Offsite', 10 * 60, 23 * 60)];
    const r = await respond('add reading in my free time', null, NOW);
    expect(placed()).toEqual([['Reading', '2026-10-20', 7 * 60, 30]]);
    expect(r.result.say).toMatch(/full/);
  });

  it('questions about free time still list it', async () => {
    const r = await respond('when am I free?', null, NOW);
    expect(r.route.call?.tool).toBe('find_free_time');
    expect(r.result.say).toBe("Today you're free 12:20–23:00.");
    expect(placed()).toEqual([]);
  });
});

describe('calendar events you tick or skip', async () => {
  const { eventStateFile } = await import('./stores/eventStates.svelte');
  const { skipEvent, toggleDone } = await import('./actions');
  beforeEach(() => {
    eventStateFile.value = { version: 1, states: {} };
    Object.assign(globalThis, { innerWidth: 1200, innerHeight: 800 });
  });

  it('ticks a meeting done like a block (the event itself stays read-only)', () => {
    const key = 'cal:google:standup';
    toggleDone(key);
    const b = view.blockByKey(key)!;
    expect(b.done).toBe(true);
    expect(b.readOnly).toBe(true);
    toggleDone(key);
    expect(view.blockByKey(key)!.done).toBe(false);
  });

  it('a skipped meeting frees its time', () => {
    skipEvent('cal:google:standup');
    expect(view.blockByKey('cal:google:standup')!.skipped).toBe(true);
    // Free from now (10:40) until Dhuhr at 12:00.
    expect(freeSlot(TODAY, 30, NOW)).toEqual({ date: TODAY, start: 10 * 60 + 40, moved: false });
    expect(view.now.current?.key).not.toBe('cal:google:standup');
  });
});
