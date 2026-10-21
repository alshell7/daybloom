import { describe, expect, it } from 'vitest';
import { MINUTE } from '../engine/time';
import type { Block, Task } from '../engine/types';
import { planReminders, type PlanInput } from './reminders';

const NOW = new Date(2026, 9, 22, 8, 0).getTime();
const at = (h: number, m = 0, day = 0) => new Date(2026, 9, 22 + day, h, m).getTime();

function block(key: string, start: number, end: number, p: Partial<Block> = {}): Block {
  return { key, kind: 'task', taskId: key, date: '2026-10-22', title: key, icon: 'laptop', category: 'focus', color: '#000', startMs: start, endMs: end, floating: false, done: false, recurring: false, readOnly: false, ...p };
}

function input(blocks: Block[], tasks: Record<string, Partial<Task>> = {}, p: Partial<PlanInput> = {}): PlanInput {
  return {
    now: NOW,
    blocks,
    taskOf: (b) => (tasks[b.key] ? ({ alerts: [], ...tasks[b.key] } as Task) : ({ alerts: [] } as unknown as Task)),
    notify: true,
    headsUpMin: 5,
    alarm: { tone: 'dawn', snooze: 5, ringFor: 3, gentle: true, volume: 0.7 },
    hour12: false,
    ...p,
  };
}

describe('planReminders', () => {
  it('a block start, its heads-up and an alert, in order', () => {
    const items = planReminders(input([block('write', at(9), at(10)), block('lunch', at(10), at(11))], { write: { alerts: [10] } }));
    expect(items.filter((i) => i.id.includes('write')).map((i) => [i.kind, new Date(i.at).getHours() * 60 + new Date(i.at).getMinutes()])).toEqual([
      ['before', 8 * 60 + 50],
      ['start', 9 * 60],
      ['heads', 9 * 60 + 55],
    ]);
    const hu = items.find((i) => i.id === 'hu:write')!;
    expect(hu.title).toBe('5m left · write');
    expect(hu.body).toBe('Next up: lunch');
  });

  it('an alarm block rings instead of the "Now" notification, with its own tone', () => {
    const items = planReminders(input([block('wake', at(9), at(9, 30))], { wake: { alarm: { tone: 'harp' } as Task['alarm'] } }));
    const alarm = items.find((i) => i.kind === 'alarm')!;
    expect(alarm).toMatchObject({ id: 'alarm:wake', at: at(9), tone: 'harp', ringForMin: 3, snoozeMin: 5 });
    expect(items.some((i) => i.kind === 'start')).toBe(false);
  });

  it('nothing for what is done, past, beyond two days, anytime, or with notifications off', () => {
    const blocks = [
      block('done', at(9), at(10), { done: true }),
      block('past', at(7), at(7, 30)),
      block('far', at(9, 0, 3), at(10, 0, 3)),
      block('anytime', at(9), at(9, 30), { floating: true }),
    ];
    expect(planReminders(input(blocks))).toEqual([]);
    expect(planReminders(input([block('a', at(9), at(10))], {}, { notify: false }))).toEqual([]);
  });

  it('no heads-up on a block too short for one', () => {
    expect(planReminders(input([block('short', at(9), at(9, 6))])).some((i) => i.kind === 'heads')).toBe(false);
  });

  it('calendar events get "Now" and a heads-up too, as in the open app', () => {
    const items = planReminders(input([block('cal:g:standup', at(9), at(9, 30), { kind: 'event', taskId: undefined, title: 'Standup' })]));
    expect(items.map((i) => [i.kind, i.title])).toEqual([
      ['start', 'Now: Standup'],
      ['heads', '5m left · Standup'],
    ]);
  });

  it('salah: before, at the adhan and before jamaat, as Waqt says', () => {
    const items = planReminders(
      input([], {}, {
        prayers: [{ date: '2026-10-22', id: 'dhuhr', name: 'Dhuhr', at: at(12, 10), end: at(15, 30), jamaat: at(12, 45) }],
        waqtRemind: { before: 10, atAdhan: true, beforeJamaat: 15 },
      }),
    );
    expect(items.map((i) => [i.title, new Date(i.at).getHours() * 60 + new Date(i.at).getMinutes()])).toEqual([
      ['Dhuhr in 10 minutes', 12 * 60],
      ['It’s time for Dhuhr', 12 * 60 + 10],
      ['Jamaat for Dhuhr in 15 minutes', 12 * 60 + 30],
    ]);
  });

  it('a waiting snooze rings again as an alarm', () => {
    const items = planReminders(input([], {}, { snoozed: [{ key: 'task:wake@2026-10-22', title: 'Wake up', at: NOW + 5 * MINUTE, startMs: NOW - MINUTE, tone: 'dawn' }] }));
    expect(items).toEqual([expect.objectContaining({ kind: 'alarm', id: 'snooze:task:wake@2026-10-22', at: NOW + 5 * MINUTE })]);
  });
});
