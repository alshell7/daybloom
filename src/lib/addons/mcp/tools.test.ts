import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { blockKey } from '../../engine/blocks';
import { atMinutes } from '../../engine/time';
import type { Task } from '../../engine/types';
import { clock } from '../../stores/clock.svelte';
import { DEFAULT_SETTINGS, settings } from '../../stores/settings.svelte';
import { taskFile, tasks } from '../../stores/tasks.svelte';
import { timerFile } from '../../stores/timer.svelte';
import { view } from '../../stores/view.svelte';
import { answer, clientLabel, mcp, migrateMcp, mcpFile } from './mcp.svelte';
import { dayArg, hm, timeArg } from './tools';

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

/** Call a tool the way an AI app would, and read its JSON answer. */
function call(name: string, args: Record<string, unknown> = {}, client = 'claude-code') {
  const out = answer({ method: 'tools/call', params: { name, arguments: args }, client }, NOW) as { result: { content: { text: string }[]; isError?: boolean } };
  const text = out.result.content[0].text;
  return { error: out.result.isError ? text : null, data: out.result.isError ? null : JSON.parse(text) };
}

let lastToast: { text: string; action?: { run: () => void } } | null = null;

beforeAll(() => {
  Object.assign(globalThis, { innerWidth: 1200, innerHeight: 800 });
  const say = view.say.bind(view);
  view.say = (text, action, ms) => {
    lastToast = { text, action };
    say(text, action, ms);
  };
});

beforeEach(() => {
  settings.value = { ...structuredClone(DEFAULT_SETTINGS), clock: '24', addons: { mcp: true } };
  timerFile.value.active = null;
  clock.setOffset(NOW - Date.now());
  view.date = view.today;
  view.calendarEvents = [];
  view.addonEvents = {};
  mcpFile.value = migrateMcp(null);
  lastToast = null;
  taskFile.value.tasks = [
    task({ id: 'meds', title: 'Morning meds', icon: 'pill', category: 'care', start: 480, duration: 10, recurrence: { freq: 'daily', interval: 1 } }),
    task({ id: 'deep', title: 'Deep work', start: 615, duration: 75, notes: 'Draft the grant report' }),
    task({ id: 'lunch', title: 'Lunch & water', icon: 'utensils', category: 'care', start: 720, duration: 40 }),
    task({ id: 'plants', title: 'Water the plants', icon: 'plant', category: 'routine', start: null, duration: 10 }),
    task({ id: 'dentist', title: 'Book dentist', category: 'care', date: null, duration: 15, list: 'inbox', priority: 1 }),
  ];
});

describe('arguments', () => {
  it('reads days and times kindly, and refuses nonsense', () => {
    expect(dayArg(undefined, TODAY)).toBe(TODAY);
    expect(dayArg('tomorrow', TODAY)).toBe(TOMORROW);
    expect(dayArg('2026-11-02', TODAY)).toBe('2026-11-02');
    expect(() => dayArg('next week', TODAY)).toThrow(/YYYY-MM-DD/);
    expect(timeArg('14:30')).toBe(870);
    expect(timeArg('9am')).toBe(540);
    expect(timeArg('12:15 am')).toBe(15);
    expect(() => timeArg('25:00')).toThrow();
    expect(() => timeArg('9')).toThrow();
    expect(hm(65)).toBe('01:05');
  });

  it('names the apps', () => {
    expect(clientLabel('claude-code')).toBe('Claude Code');
    expect(clientLabel('codex-mcp-client')).toBe('Codex');
    expect(clientLabel('claude-ai')).toBe('Claude');
    expect(clientLabel('my_agent')).toBe('My Agent');
    expect(clientLabel('')).toBe('An AI app');
  });
});

describe('reading', () => {
  it('lists the tools, and hides changes while read-only', () => {
    const list = (answer({ method: 'tools/list', params: {}, client: '' }, NOW) as any).result.tools;
    expect(list.map((t: any) => t.name)).toContain('create_block');
    expect(list.find((t: any) => t.name === 'delete_block').annotations.destructiveHint).toBe(true);
    // Waqt is off: no prayer tool.
    expect(list.map((t: any) => t.name)).not.toContain('get_prayer_times');
    mcp.write = false;
    const ro = (answer({ method: 'tools/list', params: {}, client: '' }, NOW) as any).result.tools;
    expect(ro.every((t: any) => t.annotations.readOnlyHint)).toBe(true);
    expect(call('create_block', { title: 'Sneaky' }).error).toMatch(/read-only/);
  });

  it('reads a day: blocks, now, anytime and free time', () => {
    const { data } = call('get_day');
    expect(data.date).toBe(TODAY);
    expect(data.now).toBe('10:40');
    expect(data.current).toBe(blockKey('deep', TODAY));
    expect(data.blocks.map((b: any) => b.title)).toEqual(['Morning meds', 'Deep work', 'Lunch & water']);
    const deep = data.blocks[1];
    expect(deep).toMatchObject({ start: '10:15', end: '11:30', minutes: 75, category: 'focus', done: false, notes: 'Draft the grant report' });
    expect(data.blocks[0].repeats).toBeTruthy();
    expect(data.anytime[0]).toMatchObject({ title: 'Water the plants', anytime: true });
    // From now: 11:30–12:00, then after lunch until sleep.
    expect(data.free[0]).toEqual({ start: '11:30', end: '12:00', minutes: 30 });
    expect(data.free[1].start).toBe('12:40');
  });

  it('lists blocks over days, with filters', () => {
    const { data } = call('list_blocks', { from: TODAY, to: '2026-10-21', query: 'meds' });
    expect(data.count).toBe(3);
    expect(data.blocks.map((b: any) => b.date)).toEqual([TODAY, TOMORROW, '2026-10-21']);
    expect(call('list_blocks', { from: TODAY, to: '2027-03-01' }).error).toMatch(/62 days/);
  });

  it('finds free time of a length', () => {
    const { data } = call('find_free_time', { minutes: 45, before: '13:30' });
    expect(data.free).toEqual([{ start: '12:40', end: '13:30', minutes: 50 }]);
  });

  it('notes reads in plain words, one line for a burst', () => {
    for (let i = 0; i < 5; i++) call('find_free_time');
    call('get_day', {}, 'codex-mcp-client');
    expect(mcpFile.value.log.map((a) => `${a.client} ${a.text}`)).toEqual(['claude-code looked for free time', 'codex-mcp-client read your day']);
  });

  it('reads the backlog and settings, never secrets', () => {
    expect(call('list_backlog').data.items).toEqual([expect.objectContaining({ id: 'dentist', title: 'Book dentist', priority: 'must', list: 'inbox' })]);
    settings.value.google = { clientId: 'id', clientSecret: 'shh' };
    const s = call('get_settings').data;
    expect(s.waking_hours).toEqual({ from: '07:00', to: '23:00' });
    expect(JSON.stringify(s)).not.toMatch(/shh|clientSecret|google/);
  });

  it('reads insights', () => {
    tasks.toggleDone('deep', TODAY, NOW);
    const { data } = call('get_insights');
    expect(data.finished).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(data.highlights)).toBe(true);
  });
});

describe('changing', () => {
  it('adds a block in the first free time, guesses its kind, and can be undone', () => {
    const { data } = call('create_block', { title: 'Call mum', minutes: 20 });
    expect(data.created).toMatchObject({ title: 'Call mum', start: '11:30', end: '11:50', category: 'social' });
    expect(lastToast?.text).toBe('Claude Code added “Call mum” at 11:30');
    expect(mcpFile.value.log.at(-1)).toMatchObject({ tool: 'create_block', write: true, ok: true });
    lastToast!.action!.run();
    expect(taskFile.value.tasks.some((t) => t.title === 'Call mum')).toBe(false);
  });

  it('says what a new block overlaps, and makes repeats and steps', () => {
    const { data } = call('create_block', { title: 'Stand-up', date: 'today', start: '11:00', minutes: 15, repeat: { every: 'week', weekdays: ['mon', 'wed'] }, steps: ['Notes', 'Blockers'] });
    expect(data.overlaps).toEqual(['Deep work (10:15–11:30)']);
    const t = taskFile.value.tasks.find((t) => t.title === 'Stand-up')!;
    expect(t.recurrence).toEqual({ freq: 'weekly', interval: 1, byWeekday: [1, 3] });
    expect(t.subtasks.map((s) => s.title)).toEqual(['Notes', 'Blockers']);
  });

  it('refuses bad input without changing anything', () => {
    const before = taskFile.value.tasks.length;
    expect(call('create_block', { title: '  ' }).error).toMatch(/title/);
    expect(call('create_block', { title: 'X', category: 'party' }).error).toMatch(/category/);
    expect(call('update_block', { key: blockKey('deep', TODAY), start: '15:00', minutes: 2 }).error).toMatch(/minutes/);
    expect(tasks.get('deep')!.start).toBe(615);
    expect(taskFile.value.tasks.length).toBe(before);
    expect(mcpFile.value.log.at(-1)).toMatchObject({ ok: false });
  });

  it('moves and renames one day of a repeat, and undoes it', () => {
    const key = blockKey('meds', TOMORROW);
    const { data } = call('update_block', { key, start: '09:00', title: 'Meds + water' });
    expect(data.updated).toMatchObject({ key, start: '09:00', title: 'Meds + water' });
    expect(tasks.get('meds')!.title).toBe('Morning meds');
    expect(tasks.get('meds')!.overrides[TOMORROW]).toMatchObject({ start: 540, title: 'Meds + water' });
    lastToast!.action!.run();
    expect(tasks.get('meds')!.overrides[TOMORROW]).toBeUndefined();
  });

  it('moves a one-off block to another day', () => {
    const { data } = call('update_block', { key: blockKey('lunch', TODAY), date: 'tomorrow' });
    expect(data.updated).toMatchObject({ key: blockKey('lunch', TOMORROW), date: TOMORROW, start: '12:00' });
  });

  it('finishes and removes blocks and backlog items', () => {
    expect(call('complete_block', { key: blockKey('deep', TODAY) }).data).toEqual({ key: blockKey('deep', TODAY), done: true });
    expect(tasks.get('deep')!.completions).toContain(TODAY);
    expect(call('complete_block', { key: blockKey('deep', TODAY) }).data.unchanged).toBe(true);
    expect(call('complete_block', { key: 'dentist' }).data.done).toBe(true);
    expect(tasks.get('dentist')!.doneAt).toBe(NOW);

    expect(call('delete_block', { key: blockKey('meds', TODAY) }).data).toEqual({ removed: blockKey('meds', TODAY), only: TODAY });
    expect(tasks.get('meds')!.skips).toContain(TODAY);
    lastToast!.action!.run();
    expect(tasks.get('meds')!.skips).not.toContain(TODAY);
    expect(call('delete_block', { key: 'cal:x:y' }).error).toMatch(/read-only/);
  });

  it('fills the backlog and plans from it', () => {
    const { data } = call('add_to_backlog', { items: [{ title: 'Renew passport', minutes: 45, priority: 'should' }, { title: 'Fix the bike' }], list: 'next' });
    expect(data.added).toEqual([expect.objectContaining({ title: 'Renew passport', minutes: 45, priority: 'should', list: 'next' }), expect.objectContaining({ title: 'Fix the bike', list: 'next' })]);
    expect(lastToast?.text).toBe('Claude Code put 2 tasks in the backlog');
    const id = data.added[0].id;
    const plan = call('schedule_backlog_item', { id }).data;
    expect(plan.scheduled).toMatchObject({ title: 'Renew passport', start: '12:40', minutes: 45 });
  });

  it('changes only a few safe settings, with undo', () => {
    expect(call('update_settings', { wake: '06:30', theme: 'dark' }).data.changed).toEqual(['wake', 'theme']);
    expect(settings.value.wake).toBe(390);
    expect(settings.value.theme).toBe('dark');
    lastToast!.action!.run();
    expect(settings.value.wake).toBe(420);
    expect(call('update_settings', { theme: 'neon' }).error).toMatch(/theme/);
    expect(call('update_settings', {}).error).toMatch(/Nothing/);
  });
});
