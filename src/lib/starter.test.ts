import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { atMinutes, MINUTE } from './engine/time';
import type { Task } from './engine/types';
import { deviceStep, parseStep, startPrompt } from './starter';
import { starter } from './starter.svelte';
import { clock } from './stores/clock.svelte';
import { DEFAULT_SETTINGS, settings } from './stores/settings.svelte';
import { taskFile, tasks } from './stores/tasks.svelte';
import { timerFile } from './stores/timer.svelte';
import { view } from './stores/view.svelte';

const TODAY = '2026-10-19';
const NOW = atMinutes(TODAY, 10 * 60 + 3);
const task = (p: Partial<Task>): Task => ({ id: 'w', title: 'Write the grant report', icon: 'pen', category: 'focus', date: TODAY, start: 600, duration: 60, notes: 'Budget section', subtasks: [], recurrence: null, completions: [], completedAt: {}, skips: [], overrides: {}, alerts: [], createdAt: NOW, updatedAt: NOW, ...p });

describe('help me start: the step', () => {
  it('asks for one concrete, tiny step that fits the task and the moment', () => {
    const p = startPrompt({ title: 'Write the grant report', notes: 'Budget section', category: 'focus', minutes: 60, leftMin: 57, sinceMin: 3, nextStep: 'Draft the budget' });
    expect(p.user).toContain('Budget section');
    expect(p.user).toContain("began 3 minutes ago and hasn't started yet");
    expect(p.user).toContain('Its next step: Draft the budget');
    expect(p.system).toMatch(/ONE physical action/);
  });

  it('reads a step, keeps it to 2 or 5 minutes, and refuses pressure or vague steps', () => {
    expect(parseStep('{"step":"Open the budget sheet and type one number.","minutes":3,"nudge":"Just one number. That counts."}')).toEqual({ step: 'Open the budget sheet and type one number', minutes: 2, nudge: 'Just one number. That counts.' });
    expect(parseStep('{"step":"Open the doc","minutes":5,"nudge":"Easy does it."}')?.minutes).toBe(5);
    expect(parseStep('{"step":"Get started","minutes":2,"nudge":"Go."}')).toBeNull();
    expect(parseStep('{"step":"Open the doc","minutes":2,"nudge":"You should have started already, you are behind."}')).toBeNull();
    expect(parseStep('no json')).toBeNull();
  });

  it('without AI: the task’s own next step, else a built-in two-minute start', () => {
    expect(deviceStep({ title: 'Write the grant report', category: 'focus', minutes: 60, nextStep: 'Draft the budget' })).toMatchObject({ step: 'Draft the budget', minutes: 2, via: 'device' });
    const s = deviceStep({ title: 'Write the grant report', category: 'focus', minutes: 60 });
    expect(s.step.length).toBeGreaterThan(5);
    expect(s.minutes).toBe(2);
  });
});

describe('help me start: in the day', () => {
  beforeAll(() => Object.assign(globalThis, { innerWidth: 1200, innerHeight: 800 }));
  beforeEach(() => {
    settings.value = structuredClone(DEFAULT_SETTINGS);
    clock.setOffset(NOW - Date.now());
    view.date = view.today;
    timerFile.value.active = null;
    taskFile.value = { version: 1, tasks: [task({})], deleted: [] };
    starter.steps = {};
  });

  it('offers the block that has just begun, and places its first step first', async () => {
    const b = starter.offer!;
    expect(b.title).toBe('Write the grant report');
    const s = await starter.prepare(b);
    expect(s.via).toBe('device');
    starter.arrived(b);
    expect(tasks.get('w')!.subtasks[0]).toMatchObject({ title: s.step, done: false });
    // Twice: still one step.
    starter.arrived(b);
    expect(tasks.get('w')!.subtasks).toHaveLength(1);
  });

  it('starts the step as a short focus, and ticks it when that ends', async () => {
    const b = starter.offer!;
    const s = await starter.prepare(b);
    starter.arrived(b);
    starter.start(b);
    expect(timerFile.value.active).toMatchObject({ label: s.step, target: { key: b.key } });
    expect(starter.offer).toBeNull();
    starter.ended(b.key, s.step, 2 * MINUTE);
    expect(tasks.get('w')!.subtasks[0].done).toBe(true);
  });

  it('“Not now” lets go and takes back the step it added', async () => {
    const b = starter.offer!;
    await starter.prepare(b);
    starter.arrived(b);
    starter.dismiss(b);
    expect(starter.offer).toBeNull();
    expect(tasks.get('w')!.subtasks).toEqual([]);
  });

  it('lets go after twenty minutes, and stays quiet when turned off', () => {
    settings.value.nudges.firstStep = false;
    expect(starter.offer).toBeNull();
    settings.value.nudges.firstStep = true;
    clock.setOffset(NOW + 25 * MINUTE - Date.now());
    expect(starter.offer).toBeNull();
  });

  it('a repeating block keeps its own steps', async () => {
    taskFile.value.tasks = [task({ id: 'daily', recurrence: { freq: 'daily', interval: 1 } })];
    const b = starter.offer!;
    await starter.prepare(b);
    starter.arrived(b);
    expect(tasks.get('daily')!.subtasks).toEqual([]);
  });
});
