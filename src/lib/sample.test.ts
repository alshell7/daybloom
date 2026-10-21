import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { atMinutes } from './engine/time';
import { clearSample, offerClear, sampleTasks } from './sample';
import { clock } from './stores/clock.svelte';
import { seedSampleDay, taskFile, tasks } from './stores/tasks.svelte';
import { view } from './stores/view.svelte';

const NOW = atMinutes('2026-10-19', 9 * 60);

beforeAll(() => Object.assign(globalThis, { innerWidth: 1200, innerHeight: 800 }));
beforeEach(() => {
  clock.setOffset(NOW - Date.now());
  taskFile.value = { version: 1, tasks: [], deleted: [] };
  seedSampleDay(NOW);
});

describe('the sample day', () => {
  it('clears in one go, with an Undo, leaving your own blocks', () => {
    const mine = tasks.create({ title: 'My own thing', date: '2026-10-19', start: 600, duration: 30 });
    expect(sampleTasks()).toHaveLength(10);
    expect(offerClear()).toBe(true);
    expect(clearSample()).toBe(10);
    expect(taskFile.value.tasks.map((t) => t.id)).toEqual([mine.id]);
    view.toast?.action?.run();
    expect(taskFile.value.tasks).toHaveLength(11);
  });

  it('keeps a sample block you renamed', () => {
    const deep = taskFile.value.tasks.find((t) => t.title === 'Deep work')!;
    deep.title = 'Deep work on the grant';
    expect(sampleTasks().map((t) => t.title)).not.toContain('Deep work on the grant');
    expect(sampleTasks()).toHaveLength(9);
  });

  it("doesn't offer before you plan something of your own", () => {
    expect(offerClear()).toBe(false);
  });
});
