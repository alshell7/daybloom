import { describe, expect, it } from 'vitest';
import type { Block, Task } from '../engine/types';
import { actionsFor } from './notifyActions';
import { planReminders } from './reminders';

const block = (p: Partial<Block> = {}): Block => ({
  key: 'task:t@2026-10-31', kind: 'task', taskId: 't', date: '2026-10-31', title: 'Write', icon: 'laptop', category: 'focus', color: '#000',
  startMs: 0, endMs: 3_600_000, floating: false, done: false, recurring: false, readOnly: false, ...p,
});
const task = (subtasks: { done: boolean }[] = []) => ({ subtasks: subtasks.map((s, i) => ({ id: `s${i}`, title: `s${i}`, ...s })) }) as unknown as Task;
const acts = (xs: { act: string }[]) => xs.map((x) => x.act);

describe('reminder buttons', () => {
  it('a plain block starting: done, remind again, or not today', () => {
    expect(acts(actionsFor({ kind: 'start', block: block(), task: task() }))).toEqual(['done', 'remind', 'later']);
  });

  it('a block with steps left offers a two-minute start (which opens the planner)', () => {
    const a = actionsFor({ kind: 'start', block: block(), task: task([{ done: true }, { done: false }]) });
    expect(acts(a)).toEqual(['done', 'start2', 'remind']);
    expect(a[1].open).toBe(true);
  });

  it('with the Time Tracker on, a billable Work block offers to bill its time', () => {
    const a = actionsFor({ kind: 'start', block: block(), task: task([{ done: false }]), tracker: true, billable: true });
    expect(acts(a)).toEqual(['done', 'track', 'start2']);
    expect(a[1].label).toBe('Bill time');
    // Already tracked: no second clock.
    expect(acts(actionsFor({ kind: 'start', block: block(), task: task(), tracker: true, tracking: true }))).not.toContain('track');
  });

  it('a calendar event can be ticked or skipped; read-only blocks get no edits', () => {
    expect(acts(actionsFor({ kind: 'start', block: block({ kind: 'event', key: 'cal:a:e', readOnly: true }) }))).toEqual(['done', 'skip', 'remind']);
    expect(acts(actionsFor({ kind: 'heads', block: block({ readOnly: true }) }))).toEqual([]);
  });

  it('ending soon: done, ten more minutes, or finish later', () => {
    const a = actionsFor({ kind: 'heads', block: block(), task: task() });
    expect(acts(a)).toEqual(['done', 'extend', 'later']);
    expect(a[1].arg).toBe(10);
  });

  it('salah: prayed (in jamaat when there is one) at the adhan; before it, only a reminder', () => {
    expect(acts(actionsFor({ kind: 'salah', salah: { moment: 'adhan', jamaat: true } }))).toEqual(['prayed', 'jamaat', 'remind']);
    expect(acts(actionsFor({ kind: 'salah', salah: { moment: 'adhan', jamaat: false } }))).toEqual(['prayed', 'remind']);
    expect(acts(actionsFor({ kind: 'salah', salah: { moment: 'pre', jamaat: true } }))).toEqual(['remind']);
  });

  it('never more than three', () => {
    for (const kind of ['start', 'heads', 'before'] as const) {
      expect(actionsFor({ kind, block: block(), task: task([{ done: false }]), tracker: true, billable: true }).length).toBeLessThanOrEqual(3);
    }
  });

  it('the plan carries them, with what they act on', () => {
    const now = 1_000;
    const b = block({ startMs: now + 60_000, endMs: now + 3_660_000 });
    const items = planReminders({
      now, blocks: [b], taskOf: () => task(), notify: true, headsUpMin: 5, hour12: false,
      alarm: { tone: 'dawn', snooze: 10, ringFor: 5, gentle: true, volume: 0.7 },
      smart: { tracker: false, billable: () => false, tracking: () => false },
    });
    const start = items.find((i) => i.kind === 'start')!;
    expect(start.key).toBe(b.key);
    expect(acts(start.actions!)).toEqual(['done', 'remind', 'later']);
    // Without `smart`, reminders stay as they were: no buttons.
    const plain = planReminders({ now, blocks: [b], taskOf: () => task(), notify: true, headsUpMin: 5, hour12: false, alarm: { tone: 'dawn', snooze: 10, ringFor: 5, gentle: true, volume: 0.7 } });
    expect(plain.every((i) => !i.actions)).toBe(true);
  });
});
