import { describe, expect, it } from 'vitest';
import type { Task } from '../engine/types';
import { DEFAULT_SETTINGS } from '../stores/settings.svelte';
import {
  applySharedSettings,
  DEVICE_SETTINGS,
  deepEqual,
  mergeProgressFiles,
  mergeSettingsFiles,
  mergeStreakFiles,
  mergeTask,
  mergeTaskFiles,
  parseSettingsFile,
  parseTaskFile,
  pickSharedSettings,
  SHARED_SETTINGS,
  type SettingsFileData,
  type TaskFileData,
} from './merge';

function task(p: Partial<Task> & { id: string }): Task {
  return {
    title: 'Deep work',
    icon: 'laptop',
    category: 'focus',
    date: '2026-10-19',
    start: 9 * 60,
    duration: 60,
    notes: '',
    subtasks: [],
    recurrence: null,
    completions: [],
    completedAt: {},
    skips: [],
    overrides: {},
    alerts: [5],
    createdAt: 100,
    updatedAt: 100,
    list: 'inbox',
    priority: null,
    due: null,
    energy: null,
    order: 100,
    doneAt: null,
    acks: [],
    ...p,
  };
}

const file = (tasks: Task[], deleted: { id: string; at: number }[] = []): TaskFileData => ({ version: 1, tasks, deleted });
const edit = (t: Task, p: Partial<Task>): Task => ({ ...structuredClone(t), ...p });
const ids = (f: TaskFileData) => f.tasks.map((t) => t.id);

describe('mergeTaskFiles', () => {
  const daily = task({ id: 'meds', title: 'Meds', recurrence: { freq: 'daily', interval: 1 } });

  it('unions completions ticked on two devices for different days', () => {
    const base = file([daily]);
    const a = file([edit(daily, { completions: ['2026-10-18'], completedAt: { '2026-10-18': 1_000 }, updatedAt: 200 })]);
    const b = file([edit(daily, { completions: ['2026-10-19'], completedAt: { '2026-10-19': 2_000 }, updatedAt: 300 })]);
    const m = mergeTaskFiles(base, a, b);
    expect(m.tasks[0].completions.sort()).toEqual(['2026-10-18', '2026-10-19']);
    expect(m.tasks[0].completedAt).toEqual({ '2026-10-18': 1_000, '2026-10-19': 2_000 });
    expect(m.tasks[0].updatedAt).toBe(300);
    // The other device ends up at the same place.
    expect(mergeTaskFiles(base, b, a).tasks[0].completions.sort()).toEqual(['2026-10-18', '2026-10-19']);
  });

  it('respects an untick on one side while the other ticks another day', () => {
    const t = edit(daily, { completions: ['2026-10-17'], completedAt: { '2026-10-17': 500 } });
    const base = file([t]);
    const a = file([edit(t, { completions: [], completedAt: {}, updatedAt: 200 })]);
    const b = file([edit(t, { completions: ['2026-10-17', '2026-10-19'], completedAt: { '2026-10-17': 500, '2026-10-19': 900 }, updatedAt: 150 })]);
    const m = mergeTaskFiles(base, a, b).tasks[0];
    expect(m.completions).toEqual(['2026-10-19']);
    expect(m.completedAt).toEqual({ '2026-10-19': 900 });
  });

  it('unions skips and acks minus explicit removals', () => {
    const t = edit(daily, { skips: ['2026-10-01'], acks: ['2026-10-02'] });
    const base = file([t]);
    const a = file([edit(t, { skips: ['2026-10-01', '2026-10-05'], acks: [] })]);
    const b = file([edit(t, { skips: [], acks: ['2026-10-02', '2026-10-06'] })]);
    const m = mergeTaskFiles(base, a, b).tasks[0];
    expect(m.skips).toEqual(['2026-10-05']);
    expect(m.acks).toEqual(['2026-10-06']);
  });

  it('deletes a task removed on one side and untouched on the other', () => {
    const t = task({ id: 'x' });
    const base = file([t]);
    const m = mergeTaskFiles(base, file([t]), file([], [{ id: 'x', at: 500 }]), { baseAt: 300 });
    expect(ids(m)).toEqual([]);
    expect(m.deleted).toEqual([{ id: 'x', at: 500 }]);
    // …and from the deleting side's point of view.
    expect(ids(mergeTaskFiles(base, file([], [{ id: 'x', at: 500 }]), file([t]), { baseAt: 300 }))).toEqual([]);
  });

  it('keeps a task edited after the other side deleted it, and drops the tombstone', () => {
    const t = task({ id: 'x' });
    const base = file([t]);
    const edited = edit(t, { title: 'Still needed', updatedAt: 900 });
    const m = mergeTaskFiles(base, file([edited]), file([], [{ id: 'x', at: 500 }]), { baseAt: 300 });
    expect(m.tasks).toEqual([edited]);
    expect(m.deleted).toEqual([]);
    // The deleting device gets it back too.
    const back = mergeTaskFiles(base, file([], [{ id: 'x', at: 500 }]), file([edited]), { baseAt: 300 });
    expect(back.tasks).toEqual([edited]);
    expect(back.deleted).toEqual([]);
  });

  it('lets the delete win over an older edit', () => {
    const t = task({ id: 'x' });
    const base = file([t]);
    const edited = edit(t, { title: 'Renamed', updatedAt: 400 });
    expect(ids(mergeTaskFiles(base, file([edited]), file([], [{ id: 'x', at: 500 }]), { baseAt: 300 }))).toEqual([]);
  });

  it('detects an edit that did not bump updatedAt by comparing with the base', () => {
    const t = task({ id: 'x', subtasks: [{ id: 's1', title: 'Open the doc', done: false }] });
    const base = file([t]);
    // A subtask toggle doesn't touch updatedAt; the delete happened before the last sync finished.
    const toggled = edit(t, { subtasks: [{ id: 's1', title: 'Open the doc', done: true }] });
    const m = mergeTaskFiles(base, file([toggled]), file([], [{ id: 'x', at: 250 }]), { baseAt: 300 });
    expect(ids(m)).toEqual(['x']);
  });

  it('removes a task both sides deleted, keeping one tombstone with the later time', () => {
    const base = file([task({ id: 'x' })]);
    const m = mergeTaskFiles(base, file([], [{ id: 'x', at: 400 }]), file([], [{ id: 'x', at: 600 }]));
    expect(m.tasks).toEqual([]);
    expect(m.deleted).toEqual([{ id: 'x', at: 600 }]);
  });

  it('keeps tasks created on either side, remote order first', () => {
    const shared = task({ id: 'shared' });
    const base = file([shared]);
    const mine = task({ id: 'mine', createdAt: 700, updatedAt: 700 });
    const theirs = task({ id: 'theirs', createdAt: 800, updatedAt: 800 });
    const m = mergeTaskFiles(base, file([shared, mine]), file([shared, theirs]));
    expect(ids(m)).toEqual(['shared', 'theirs', 'mine']);
  });

  it('brings back a task restored (undo) after its deletion was synced', () => {
    const t = task({ id: 'x' });
    const tomb = { id: 'x', at: 500 };
    // Last sync: deleted. Since then this device restored it.
    const base = file([], [tomb]);
    const restored = edit(t, { updatedAt: 800 });
    const m = mergeTaskFiles(base, file([restored]), file([], [tomb]), { baseAt: 600 });
    expect(m.tasks).toEqual([restored]);
    expect(m.deleted).toEqual([]);
  });

  it('honours a remote tombstone on a first sync (no base) only if it is newer than the task', () => {
    const old = task({ id: 'old', updatedAt: 100 });
    const fresh = task({ id: 'fresh', updatedAt: 900 });
    const m = mergeTaskFiles(null, file([old, fresh]), file([], [{ id: 'old', at: 500 }, { id: 'fresh', at: 500 }]));
    expect(ids(m)).toEqual(['fresh']);
    expect(m.deleted).toEqual([{ id: 'old', at: 500 }]);
  });

  it('unions everything on a first sync (no base)', () => {
    const a = task({ id: 'a' });
    const b = task({ id: 'b' });
    const both = task({ id: 'both', completions: ['2026-10-01'] });
    const m = mergeTaskFiles(null, file([a, both]), file([b, edit(both, { completions: ['2026-10-02'], updatedAt: 200 })]));
    expect(ids(m)).toEqual(['b', 'both', 'a']);
    expect(m.tasks[1].completions).toEqual(['2026-10-02', '2026-10-01']);
  });

  it('is deterministic and idempotent', () => {
    const t1 = task({ id: 't1', completions: ['2026-10-10'] });
    const t2 = task({ id: 't2' });
    const base = file([t1, t2]);
    const local = file([edit(t1, { title: 'Local', updatedAt: 300 }), task({ id: 'n', updatedAt: 400 })], [{ id: 't2', at: 350 }]);
    const remote = file([edit(t1, { completions: ['2026-10-10', '2026-10-11'], updatedAt: 200 }), t2]);
    const m = mergeTaskFiles(base, local, remote, { baseAt: 250 });
    expect(mergeTaskFiles(base, local, remote, { baseAt: 250 })).toEqual(m);
    expect(mergeTaskFiles(m, m, m)).toEqual(m);
    expect(mergeTaskFiles(base, m, m)).toEqual(m);
    expect(mergeTaskFiles(null, m, m)).toEqual(m);
    // Once a device has the merge, merging again with an untouched local changes nothing.
    expect(mergeTaskFiles(m, m, mergeTaskFiles(base, local, remote, { baseAt: 250 }))).toEqual(m);
    // Both devices converge: the other side, starting from `remote`, reaches the same tasks.
    const other = mergeTaskFiles(remote, remote, m);
    expect(other).toEqual(m);
  });

  it('does not alias its inputs', () => {
    const t = task({ id: 'x' });
    const m = mergeTaskFiles(null, file([t]), file([t]));
    m.tasks[0].title = 'changed';
    expect(t.title).toBe('Deep work');
  });
});

describe('mergeTask', () => {
  const base = task({
    id: 't',
    subtasks: [
      { id: 's1', title: 'Open the doc', done: false },
      { id: 's2', title: 'Write a paragraph', done: false },
      { id: 's3', title: 'Re-read', done: false },
    ],
  });

  it('merges subtasks by id: adds, toggles, renames and removals from both sides', () => {
    const local = edit(base, {
      subtasks: [
        { id: 's1', title: 'Open the doc', done: true }, // toggled here
        { id: 's2', title: 'Write a paragraph', done: false },
        { id: 's3', title: 'Re-read', done: false },
        { id: 'l1', title: 'Local extra', done: false }, // added here
      ],
    });
    const remote = edit(base, {
      subtasks: [
        { id: 's1', title: 'Open the document', done: false }, // renamed there
        // s2 removed there
        { id: 'r1', title: 'Remote extra', done: false }, // added there
        { id: 's3', title: 'Re-read', done: false },
      ],
      updatedAt: 200,
    });
    const m = mergeTask(base, local, remote);
    expect(m.subtasks).toEqual([
      { id: 's1', title: 'Open the document', done: true },
      { id: 'r1', title: 'Remote extra', done: false },
      { id: 's3', title: 'Re-read', done: false },
      { id: 'l1', title: 'Local extra', done: false },
    ]);
  });

  it('keeps a subtask one side edited while the other removed it', () => {
    const local = edit(base, { subtasks: base.subtasks.map((s) => (s.id === 's2' ? { ...s, done: true } : s)) });
    const remote = edit(base, { subtasks: base.subtasks.filter((s) => s.id !== 's2'), updatedAt: 200 });
    expect(mergeTask(base, local, remote).subtasks.map((s) => s.id)).toEqual(['s1', 's2', 's3']);
  });

  it('gives scalars to the side that changed them, both changed → newer updatedAt', () => {
    const local = edit(base, { title: 'Local title', notes: 'local notes', updatedAt: 500 });
    const remote = edit(base, { title: 'Remote title', duration: 90, updatedAt: 400 });
    const m = mergeTask(base, local, remote);
    expect(m.title).toBe('Local title'); // both changed, local is newer
    expect(m.notes).toBe('local notes'); // only local changed
    expect(m.duration).toBe(90); // only remote changed
    expect(m.updatedAt).toBe(500);
  });

  it('falls back to remote when both changed a scalar at the same time', () => {
    const local = edit(base, { title: 'Local', updatedAt: 500 });
    const remote = edit(base, { title: 'Remote', updatedAt: 500 });
    expect(mergeTask(base, local, remote).title).toBe('Remote');
  });

  it('merges overrides per date and per field', () => {
    const t = edit(base, { recurrence: { freq: 'daily', interval: 1 }, overrides: { '2026-10-20': { start: 600 } } });
    const local = edit(t, { overrides: { '2026-10-20': { start: 600, duration: 45 }, '2026-10-21': { title: 'Short one' } }, updatedAt: 300 });
    const remote = edit(t, { overrides: { '2026-10-20': { start: 660 } }, updatedAt: 200 });
    expect(mergeTask(t, local, remote).overrides).toEqual({
      '2026-10-20': { start: 660, duration: 45 },
      '2026-10-21': { title: 'Short one' },
    });
  });

  it('treats the recurrence rule as one value', () => {
    const t = edit(base, { recurrence: { freq: 'weekly', interval: 1, byWeekday: [1] } });
    const local = edit(t, { recurrence: { freq: 'weekly', interval: 1, byWeekday: [1, 3] }, updatedAt: 300 });
    const remote = edit(t, { recurrence: { freq: 'weekly', interval: 2, byWeekday: [1] }, updatedAt: 200 });
    expect(mergeTask(t, local, remote).recurrence).toEqual({ freq: 'weekly', interval: 1, byWeekday: [1, 3] });
  });
});

describe('settings', () => {
  const settingsFile = (s: object): SettingsFileData => ({ version: 1, settings: pickSharedSettings(s) });

  it('classifies every setting as shared or device-specific, exactly once', () => {
    const leaves: string[] = [];
    for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
      if (k === 'widget') leaves.push(...Object.keys(v).map((s) => `widget.${s}`));
      else leaves.push(k);
    }
    const listed = [...SHARED_SETTINGS, ...DEVICE_SETTINGS] as string[];
    expect(new Set(listed).size).toBe(listed.length);
    // Every leaf is either listed itself or sits under a listed parent (e.g. "nudges", "google").
    for (const leaf of leaves) expect(listed.some((p) => leaf === p || leaf.startsWith(`${p}.`))).toBe(true);
  });

  it('never picks device-specific settings', () => {
    const shared = pickSharedSettings({
      ...DEFAULT_SETTINGS,
      widget: { visible: true, layer: 'desktop', preset: 'field24', finish: 'ink' },
      google: { clientId: 'id', clientSecret: 'secret' },
      timeZone: 'Asia/Dubai',
      onboarded: true,
    });
    expect(shared.widget).toEqual({ preset: 'field24', finish: 'ink' });
    for (const k of ['google', 'timeZone', 'onboarded', 'launchAtLogin', 'menuBarTimer', 'lastGreeted', 'autoUpdate', 'recentZones']) {
      expect(shared).not.toHaveProperty(k);
    }
    expect(JSON.stringify(shared)).not.toContain('secret');
  });

  it('strips device-specific keys even if a repo file contains them', () => {
    const parsed = parseSettingsFile({ version: 1, settings: { theme: 'dark', launchAtLogin: true, google: { clientSecret: 'x' }, widget: { visible: true, preset: 'hour' } } });
    expect(parsed.settings).toEqual({ theme: 'dark', widget: { preset: 'hour' } });
  });

  it('per key: the changed side wins; both changed → remote', () => {
    const base = settingsFile(DEFAULT_SETTINGS);
    const local = settingsFile({ ...DEFAULT_SETTINGS, theme: 'dark', clock: '12', nudges: { ...DEFAULT_SETTINGS.nudges, anchors: 'hourly' } });
    const remote = settingsFile({ ...DEFAULT_SETTINGS, clock: '24', wake: 6 * 60, nudges: { ...DEFAULT_SETTINGS.nudges, checkIn: false } });
    const m = mergeSettingsFiles(base, local, remote).settings as any;
    expect(m.theme).toBe('dark');
    expect(m.wake).toBe(360);
    expect(m.clock).toBe('24');
    expect(m.nudges).toEqual({ ...DEFAULT_SETTINGS.nudges, anchors: 'hourly', checkIn: false });
    expect(mergeSettingsFiles(base, local, local)).toEqual(local);
    expect(mergeSettingsFiles(m === null ? base : { version: 1, settings: m }, { version: 1, settings: m }, { version: 1, settings: m }).settings).toEqual(m);
  });

  it('applies shared values without touching device-specific ones, and refuses wrong shapes', () => {
    const local = { ...DEFAULT_SETTINGS, timeZone: 'Asia/Dubai', widget: { ...DEFAULT_SETTINGS.widget, visible: true, layer: 'desktop' as const } };
    const out = applySharedSettings(local, { theme: 'dark', wake: 'noon', widget: { preset: 'hour', visible: false }, nudges: { anchors: 'half' } });
    expect(out.theme).toBe('dark');
    expect(out.wake).toBe(DEFAULT_SETTINGS.wake); // a string where a number belongs is ignored
    expect(out.widget).toEqual({ ...local.widget, preset: 'hour' }); // visible stays per device
    expect(out.nudges).toEqual({ ...DEFAULT_SETTINGS.nudges, anchors: 'half' });
    expect(out.timeZone).toBe('Asia/Dubai');
    expect(local.theme).toBe('system'); // input untouched
  });
});

describe('progress and streaks', () => {
  it('unions badges by id with the earliest time', () => {
    const m = mergeProgressFiles(
      null,
      { version: 1, unlocked: [{ id: 'first-tick', at: 300 }, { id: 'early-bird', at: 500 }] },
      { version: 1, unlocked: [{ id: 'first-tick', at: 200 }, { id: 'week', at: 400 }] },
    );
    expect(m.unlocked).toEqual([
      { id: 'first-tick', at: 200 },
      { id: 'week', at: 400 },
      { id: 'early-bird', at: 500 },
    ]);
    expect(mergeProgressFiles(m, m, m)).toEqual(m);
  });

  it('streaks: changed side wins, both changed → max', () => {
    expect(mergeStreakFiles({ celebrated: 7 }, { celebrated: 0 }, { celebrated: 7 })).toEqual({ celebrated: 0 });
    expect(mergeStreakFiles({ celebrated: 3 }, { celebrated: 7 }, { celebrated: 14 })).toEqual({ celebrated: 14 });
    expect(mergeStreakFiles(null, { celebrated: 3 }, { celebrated: 7 })).toEqual({ celebrated: 7 });
  });
});

describe('parseTaskFile', () => {
  it('drops junk and fills the collections merge relies on', () => {
    const f = parseTaskFile({ tasks: [{ id: 'a', title: 'A' }, { title: 'no id' }, null, { id: 'a', title: 'dup' }], deleted: [{ id: 'z', at: 5 }, { id: 'bad' }] });
    expect(f.tasks).toHaveLength(1);
    expect(f.tasks[0]).toMatchObject({ id: 'a', title: 'A', completions: [], skips: [], subtasks: [], overrides: {}, updatedAt: 0 });
    expect(f.deleted).toEqual([{ id: 'z', at: 5 }]);
    expect(deepEqual(parseTaskFile(f), f)).toBe(true);
  });
});
