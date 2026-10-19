import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { blockKey } from '../engine/blocks';
import { atMinutes, systemTimeZone } from '../engine/time';
import type { Task } from '../engine/types';
import { clock } from '../stores/clock.svelte';
import { DEFAULT_SETTINGS, settings } from '../stores/settings.svelte';
import { taskFile, tasks } from '../stores/tasks.svelte';
import { timerFile } from '../stores/timer.svelte';
import { view } from '../stores/view.svelte';
import { execute, respond } from './brain';
import { clearEmbeddings } from './match';
import { blockFor, dayWord, firstFree, openCheckIns, placeOccurrence, planFor, removeTarget, resolveZone, type ToolResult } from './tools';

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

function seed() {
  taskFile.value.tasks = [
    task({ id: 'meds', title: 'Morning meds', icon: 'pill', category: 'care', start: 480, duration: 10, recurrence: daily }),
    task({ id: 'deep', title: 'Deep work', start: 615, duration: 75, notes: 'Draft the grant report' }),
    task({ id: 'lunch', title: 'Lunch & water', icon: 'utensils', category: 'care', start: 720, duration: 40 }),
    task({ id: 'walk', title: 'Walk outside', icon: 'footprints', category: 'move', start: 810, duration: 25 }),
    task({ id: 'reply', title: 'Reply to messages', icon: 'mail', start: 870, duration: 30 }),
    task({ id: 'call', title: 'Call a friend', icon: 'phone', category: 'social', start: 960, duration: 30 }),
    task({ id: 'wind', title: 'Wind down', icon: 'moon', category: 'rest', start: 1320, duration: 45, recurrence: daily }),
    task({ id: 'plants', title: 'Water the plants', icon: 'plant', category: 'routine', start: null, duration: 10 }),
    task({ id: 'dentist', title: 'Book dentist', icon: 'stethoscope', category: 'care', date: null, duration: 15, list: 'inbox' }),
    task({ id: 'parcel', title: 'Return the parcel', icon: 'package', category: 'routine', date: null, duration: 20, list: 'next' }),
  ];
}

const get = (id: string) => tasks.get(id)!;
const ask = (text: string) => respond(text, null, NOW).then((r) => r.result);
const created = (before: number) => taskFile.value.tasks.slice(before);

beforeAll(() => {
  // toggleDone celebrates with sparks at window coordinates.
  Object.assign(globalThis, { innerWidth: 1200, innerHeight: 800 });
});

beforeEach(() => {
  settings.value = { ...structuredClone(DEFAULT_SETTINGS), clock: '24' };
  timerFile.value.active = null;
  clock.setOffset(NOW - Date.now());
  view.date = view.today;
  view.events = [];
  view.breatheAt = 0;
  seed();
  clearEmbeddings();
});

describe('helpers', () => {
  it('speaks days kindly', () => {
    expect(dayWord(TODAY, TODAY)).toBe('today');
    expect(dayWord(TOMORROW, TODAY)).toBe('tomorrow');
    expect(dayWord('2026-10-23', TODAY)).toBe('Friday');
  });

  it('finds the first free gap that fits', () => {
    // From 10:40: Deep work runs to 11:30, lunch at 12:00 → 11:30 fits 30 minutes.
    expect(firstFree(TODAY, 30, NOW)).toBe(11 * 60 + 30);
    // 45 minutes doesn't fit before lunch; after lunch 12:40–13:30 does.
    expect(firstFree(TODAY, 45, NOW)).toBe(12 * 60 + 40);
    // Another day starts at wake time.
    expect(firstFree(TOMORROW, 30, NOW)).toBe(7 * 60);
  });

  it('resolves places to zones', () => {
    expect(resolveZone('Tokyo')).toBe('Asia/Tokyo');
    expect(resolveZone('new york')).toBe('America/New_York');
    expect(resolveZone('Lisbon')).toBe('Europe/Lisbon');
    expect(resolveZone('local')).toBe('');
    expect(resolveZone('a meeting')).toBeUndefined();
  });

  it('lists check-ins: ended, unticked, not let go', () => {
    expect(openCheckIns(NOW).map((b) => b.taskId)).toEqual(['meds']);
    get('meds').acks = [TODAY];
    expect(openCheckIns(NOW)).toEqual([]);
  });
});

describe('creating', () => {
  it('add gym at 5pm for 45 minutes', async () => {
    const before = taskFile.value.tasks.length;
    const r = await ask('add gym at 5pm for 45 minutes');
    const [t] = created(before);
    expect(t).toMatchObject({ title: 'Gym', date: TODAY, start: 17 * 60, duration: 45, category: 'move', icon: 'dumbbell' });
    expect(r.say).toBe('Added “Gym” today, 17:00–17:45.');
    expect(r.card).toEqual({ kind: 'block', key: blockKey(t.id, TODAY), verb: 'added' });
    r.undo!();
    expect(tasks.get(t.id)).toBeUndefined();
  });

  it('meds every day at 8am repeats', async () => {
    const before = taskFile.value.tasks.length;
    const r = await ask('evening meds every day at 9pm');
    const [t] = created(before);
    expect(t).toMatchObject({ title: 'Evening meds', start: 21 * 60, recurrence: { freq: 'daily', interval: 1 }, category: 'care' });
    expect(r.say).toContain('every day at 21:00');
  });

  it('a weekday repeat anchors on its first matching day', async () => {
    const before = taskFile.value.tasks.length;
    const r = await ask('swim every wednesday at 7am');
    const [t] = created(before);
    expect(t.date).toBe('2026-10-21');
    expect(r.card.kind === 'block' && r.card.key).toBe(blockKey(t.id, '2026-10-21'));
  });

  it('no time → the next free gap, said so', async () => {
    const before = taskFile.value.tasks.length;
    const r = await ask('add stretch');
    const [t] = created(before);
    expect(t.start).toBe(11 * 60 + 30);
    expect(r.say).toContain('next free gap');
  });

  it('remember to buy milk sometime → backlog, with undo', async () => {
    const before = taskFile.value.tasks.length;
    const r = await ask('remember to buy milk sometime');
    const [t] = created(before);
    expect(t).toMatchObject({ title: 'Buy milk', date: null, start: null, list: 'inbox', category: 'routine' });
    expect(r.say).toBe('Saved “Buy milk” to your backlog.');
    expect(r.card).toEqual({ kind: 'items', mode: 'captured', ids: [t.id] });
    // New items land at the top of their list.
    expect(t.order!).toBeLessThan(get('dentist').order!);
    r.undo!();
    expect(tasks.get(t.id)).toBeUndefined();
  });

  it('someday goes to the Someday list', async () => {
    const before = taskFile.value.tasks.length;
    await ask('someday learn the piano');
    expect(created(before)[0]).toMatchObject({ title: 'Learn the piano', list: 'someday' });
  });
});

describe('changing blocks', () => {
  it('I finished lunch → done, undoable', async () => {
    const r = await ask('I finished lunch');
    expect(get('lunch').completions).toEqual([TODAY]);
    expect(r.card).toEqual({ kind: 'block', key: `task:lunch@${TODAY}`, verb: 'done' });
    expect(r.say).toContain('Lunch & water');
    r.undo!();
    expect(get('lunch').completions).toEqual([]);
  });

  it('"done" alone ticks the block you are in', async () => {
    await ask('done');
    expect(get('deep').completions).toEqual([TODAY]);
  });

  it('took my meds → the meds you just missed', async () => {
    await ask('took my meds');
    expect(get('meds').completions).toEqual([TODAY]);
  });

  it('finishing a backlog item by name', async () => {
    const r = await ask('I finished booking the dentist');
    expect(get('dentist').doneAt).toBe(NOW);
    r.undo!();
    expect(get('dentist').doneAt).toBeNull();
  });

  it('already done is said kindly', async () => {
    get('lunch').completions = [TODAY];
    const r = await ask('lunch is done');
    expect(r.card).toMatchObject({ verb: 'already' });
  });

  it('move lunch to 2pm', async () => {
    const r = await ask('move lunch to 2pm');
    expect(get('lunch').start).toBe(14 * 60);
    expect(r.say).toBe('Moved “Lunch & water” to 14:00.');
    expect(r.card).toMatchObject({ kind: 'block', verb: 'moved', from: '12:00' });
    r.undo!();
    expect(get('lunch').start).toBe(12 * 60);
  });

  it('push the walk to tomorrow keeps its time', async () => {
    await ask('push the walk to tomorrow');
    expect(get('walk')).toMatchObject({ date: TOMORROW, start: 810 });
  });

  it('move gym 30 minutes later shifts', async () => {
    await ask('move the walk 30 minutes later');
    expect(get('walk').start).toBe(810 + 30);
  });

  it('a recurring block moved on its day gets an override; to another day, a one-off copy', async () => {
    await ask('move wind down to 9pm');
    expect(get('wind').overrides[TODAY]).toEqual({ start: 21 * 60 });
    const before = taskFile.value.tasks.length;
    const r = await ask('push wind down to tomorrow');
    expect(get('wind').skips).toEqual([TODAY]);
    const [copy] = created(before);
    expect(copy).toMatchObject({ title: 'Wind down', date: TOMORROW, recurrence: null });
    r.undo!();
    expect(tasks.get(copy.id)).toBeUndefined();
    expect(get('wind').skips).toEqual([]);
  });

  it('moving a backlog item places it', async () => {
    await ask('move return the parcel to 3pm');
    expect(get('parcel')).toMatchObject({ date: TODAY, start: 15 * 60 });
  });

  it('give me 15 more minutes extends the current block', async () => {
    const r = await ask('give me 15 more minutes');
    expect(get('deep').duration).toBe(90);
    expect(r.say).toContain('until 11:45');
    r.undo!();
    expect(get('deep').duration).toBe(75);
  });

  it('…or the running timer, when there is one', async () => {
    await ask('start a 25 minute focus');
    const r = await ask('give me 10 more minutes');
    expect(r.card.kind).toBe('timer');
    expect(timerFile.value.active!.segments[0].ms).toBe(35 * 60_000);
  });

  it('delete asks first, then removes with undo', async () => {
    const r = await ask('delete call a friend');
    expect(r.card).toEqual({ kind: 'confirm', key: `task:call@${TODAY}`, title: 'Call a friend', recurring: false });
    expect(tasks.get('call')).toBeDefined();
    const undo = removeTarget(`task:call@${TODAY}`)!;
    expect(tasks.get('call')).toBeUndefined();
    undo();
    expect(tasks.get('call')).toBeDefined();
  });

  it('deleting one occurrence of a routine skips just that day', () => {
    const undo = removeTarget(`task:wind@${TODAY}`)!;
    expect(get('wind').skips).toEqual([TODAY]);
    undo();
    expect(get('wind').skips).toEqual([]);
    removeTarget(`task:wind@${TODAY}`, true);
    expect(tasks.get('wind')).toBeUndefined();
  });

  it('two blocks with the same name → which one?', async () => {
    taskFile.value.tasks.push(task({ id: 'call2', title: 'Call a friend', start: 1140, duration: 30 }));
    const r = await ask('delete call a friend');
    expect(r.card.kind).toBe('choice');
    if (r.card.kind !== 'choice') return;
    expect(r.card.options).toHaveLength(2);
    // Picking one runs the same tool on exactly that block.
    const pick = await execute(r.card.options[1].call, null, NOW);
    expect(pick.card.kind).toBe('confirm');
  });

  it('a name nobody has → not found, with a search chip', async () => {
    const r = await ask('move the spaceship to 3pm');
    expect(r.card.kind).toBe('note');
    expect(r.say).toContain('couldn’t find'.replace('’', "'"));
  });

  it('placeOccurrence on a one-off moves day and time', () => {
    const r = placeOccurrence(`task:reply@${TODAY}`, TOMORROW, 9 * 60)!;
    expect(r.key).toBe(`task:reply@${TOMORROW}`);
    expect(get('reply')).toMatchObject({ date: TOMORROW, start: 540 });
    r.undo();
    expect(get('reply')).toMatchObject({ date: TODAY, start: 870 });
  });
});

describe('timers', () => {
  it('start a 25 minute focus → countdown on the hour face', async () => {
    const r = await ask('start a 25 minute focus');
    const a = timerFile.value.active!;
    expect(a.kind).toBe('countdown');
    expect(a.segments[0].ms).toBe(25 * 60_000);
    // You're in Deep work, so the timer carries its name.
    expect(a.label).toBe('Deep work');
    expect(settings.value.preset).toBe('timer60');
    r.undo!();
    expect(timerFile.value.active).toBeNull();
    expect(settings.value.preset).toBe('field12');
  });

  it('I need a break → a 10 minute rest timer', async () => {
    await ask('I need a break');
    expect(timerFile.value.active).toMatchObject({ label: 'Break', category: 'rest' });
    expect(timerFile.value.active!.segments[0].ms).toBe(10 * 60_000);
  });

  it('focus rounds', async () => {
    await ask('start 3 focus rounds');
    const a = timerFile.value.active!;
    expect(a.kind).toBe('cycles');
    expect(a.segments).toHaveLength(6);
    expect(settings.value.preset).toBe('chrono');
  });

  it('stop the timer, with undo', async () => {
    await ask('set a timer for 10 minutes');
    const r = await ask('stop the timer');
    expect(timerFile.value.active).toBeNull();
    r.undo!();
    expect(timerFile.value.active).not.toBeNull();
  });

  it('stopping nothing offers to start something', async () => {
    const r = await ask('stop the timer');
    expect(r.say).toBe('No timer is running.');
  });
});

describe('looking', () => {
  it("what's now", async () => {
    const r = await ask("what's now");
    expect(r.say).toBe('You’re in “Deep work” — 50m left. Then Lunch & water at 12:00.'.replace('You’re', "You're"));
    expect(r.card.kind).toBe('now');
  });

  it('show tomorrow', async () => {
    const r = await ask('show tomorrow');
    expect(r.card).toEqual({ kind: 'day', date: TOMORROW });
    // Only the two routines repeat into tomorrow.
    expect(r.say).toBe('Tomorrow: 2 blocks, first Morning meds at 08:00.');
  });

  it('when is lunch', async () => {
    const r = await ask('when is lunch');
    expect(r.say).toBe('“Lunch & water” is at 12:00 — in 1h 20m.');
    expect(r.card).toEqual({ kind: 'when', key: `task:lunch@${TODAY}` });
  });

  it('when is wind down (a routine) → today’s', async () => {
    const r = await ask('when is wind down');
    expect(r.card).toEqual({ kind: 'when', key: `task:wind@${TODAY}` });
  });

  it('when am I free tomorrow', async () => {
    const r = await ask('when am I free tomorrow');
    expect(r.card).toMatchObject({ kind: 'free', date: TOMORROW });
    expect(r.say).toContain('free');
  });

  it('find me an hour this afternoon', async () => {
    const r = await ask('find me an hour this afternoon');
    if (r.card.kind !== 'free') throw new Error('expected free');
    expect(r.card.minutes).toBe(60);
    expect(r.card.fromMs).toBe(atMinutes(TODAY, 12 * 60));
    expect(r.card.toMs).toBe(atMinutes(TODAY, 17 * 60));
  });

  it('plan my day proposes backlog items in free time', async () => {
    const r = await ask('plan my day');
    expect(r.card).toEqual({ kind: 'plan', date: TODAY });
    const plan = planFor(TODAY);
    expect(plan.items.map((i) => i.taskId).sort()).toEqual(['dentist', 'parcel']);
    expect(r.say).toContain('2 things');
  });

  it('search by name, notes too', async () => {
    const r = await ask('find dentist');
    expect(r.card).toMatchObject({ kind: 'items', mode: 'search', ids: ['dentist'] });
    const r2 = await ask('search for grant');
    expect(r2.card).toMatchObject({ ids: ['deep'] });
    const r3 = await ask('find the spaceship');
    expect(r3.card.kind).toBe('note');
  });

  it('show my backlog', async () => {
    const r = await ask('show my backlog');
    expect(r.card).toMatchObject({ kind: 'items', mode: 'backlog', list: 'all' });
    if (r.card.kind === 'items') expect(r.card.ids.sort()).toEqual(['dentist', 'parcel']);
    expect(r.say).toBe('2 things waiting.');
  });

  it('summary, check-ins, rhythm, week', async () => {
    await ask('I finished deep work');
    expect((await ask('what did I do today')).say).toMatch(/^1 done today/);
    expect((await ask('check-ins')).say).toBe('1 block is waiting for a check-in.');
    expect((await ask('my rhythm')).say).toMatch(/^1-day rhythm/);
    expect((await ask('how was my week')).card).toEqual({ kind: 'week', span: 7 });
  });

  it('the bare name of a block offers what to do with it', async () => {
    const r = await ask('lunch');
    expect(r.card.kind).toBe('choice');
  });
});

describe('look, feel and calm', () => {
  it('switch to the black theme, undoable', async () => {
    const r = await ask('switch to the black theme');
    expect(settings.value).toMatchObject({ darkTheme: 'black', theme: 'dark' });
    expect(r.say).toBe('Black theme on.');
    r.undo!();
    expect(settings.value).toMatchObject({ darkTheme: 'midnight', theme: 'system' });
  });

  it('light mode', async () => {
    await ask('light mode');
    expect(settings.value.theme).toBe('light');
  });

  it('24 hour dial', async () => {
    const r = await ask('use the 24 hour dial');
    expect(settings.value.preset).toBe('gmt24');
    r.undo!();
    expect(settings.value.preset).toBe('field12');
  });

  it("I'm in Tokyo, then back", async () => {
    const r = await ask("I'm in Tokyo");
    const expected = systemTimeZone() === 'Asia/Tokyo' ? '' : 'Asia/Tokyo';
    expect(settings.value.timeZone).toBe(expected);
    r.undo!();
    expect(settings.value.timeZone).toBe('');
    await ask("I'm in Lisbon");
    await ask('back to local time');
    expect(settings.value.timeZone).toBe('');
  });

  it('breathe starts the guide on the dial', async () => {
    const r: ToolResult = await ask('I feel overwhelmed');
    expect(view.breatheAt).toBe(NOW);
    expect(r.card.kind).toBe('breathe');
  });

  it('wind down and help', async () => {
    expect((await ask('wind down')).card.kind).toBe('winddown');
    expect((await ask('what can you do')).card.kind).toBe('help');
  });

  it('blocks resolve on any date', () => {
    expect(blockFor(`task:wind@2026-11-01`)?.title).toBe('Wind down');
    expect(blockFor(`task:lunch@${TOMORROW}`)).toBeNull();
  });
});
