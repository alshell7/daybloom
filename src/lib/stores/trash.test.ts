import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { removeBlock } from '../actions';
import { blockKey } from '../engine/blocks';
import { atMinutes } from '../engine/time';
import type { Task } from '../engine/types';
import { clock } from './clock.svelte';
import { DEFAULT_SETTINGS, settings } from './settings.svelte';
import { taskFile, tasks } from './tasks.svelte';
import { trash, trashFile, trashOccurrence, trashTask } from './trash.svelte';
import { view } from './view.svelte';

const TODAY = '2026-10-19';
const NOW = atMinutes(TODAY, 10 * 60);
const DAY = 86_400_000;

const task = (p: Partial<Task>): Task => ({ id: 'x', title: 'Write', icon: 'pen', category: 'focus', date: TODAY, start: 600, duration: 30, notes: '', subtasks: [], recurrence: null, completions: [], completedAt: {}, skips: [], overrides: {}, alerts: [], createdAt: NOW, updatedAt: NOW, ...p });

beforeAll(() => Object.assign(globalThis, { innerWidth: 1200, innerHeight: 800 }));
beforeEach(() => {
  settings.value = structuredClone(DEFAULT_SETTINGS);
  clock.setOffset(NOW - Date.now());
  view.date = view.today;
  taskFile.value = { version: 1, tasks: [task({ id: 'one' }), task({ id: 'daily', title: 'Meds', recurrence: { freq: 'daily', interval: 1 } })], deleted: [] };
  trashFile.value = { version: 1, items: [] };
});

describe('the trash', () => {
  it('keeps a deleted block, and puts it back exactly', () => {
    trashTask('one');
    expect(tasks.get('one')).toBeUndefined();
    expect(taskFile.value.deleted?.map((d) => d.id)).toEqual(['one']);
    const [it] = trash.items;
    expect(it.task.title).toBe('Write');
    expect(trash.restore(it.id)?.id).toBe('one');
    expect(tasks.get('one')?.start).toBe(600);
    // Restored: no longer marked deleted, so sync keeps it.
    expect(taskFile.value.deleted).toEqual([]);
    expect(trash.items).toEqual([]);
  });

  it('keeps one day of a repeating block, and un-skips it', () => {
    trashOccurrence('daily', TODAY);
    expect(tasks.get('daily')?.skips).toEqual([TODAY]);
    expect(trash.items[0].date).toBe(TODAY);
    trash.restore(trash.items[0].id);
    expect(tasks.get('daily')?.skips).toEqual([]);
  });

  it('lets go after 30 days', () => {
    trash.put(task({ id: 'old' }), undefined, NOW - 31 * DAY);
    trash.put(task({ id: 'new' }), undefined, NOW - 2 * DAY);
    expect(trash.daysLeft(trash.items[1], NOW)).toBe(28);
    trash.purge(NOW);
    expect(trash.items.map((x) => x.task.id)).toEqual(['new']);
  });

  it('removing a block from the timeline puts it in the trash; Undo takes it back out', () => {
    removeBlock(blockKey('one', TODAY));
    expect(trash.items.map((x) => x.task.id)).toEqual(['one']);
    view.toast?.action?.run();
    expect(tasks.get('one')).toBeDefined();
    expect(trash.items).toEqual([]);
  });
});
