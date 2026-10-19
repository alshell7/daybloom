import { describe, expect, it } from 'vitest';
import { addDays } from '../../engine/time';
import type { CalendarEvent } from '../../engine/types';
import { resolveKey, workItems } from './earnings';
import { blockKey, projectTimeKey } from './keys';
import { at, ctx, doneTask, entry, task, TODAY, workData } from './testing';

const DAY = { from: TODAY, to: TODAY };

function base(extra: Record<string, unknown> = {}) {
  return workData({
    clients: [{ id: 'c1', name: 'Acme', currency: 'USD', defaultRate: { kind: 'hourly', amount: 5000 } }],
    projects: [
      { id: 'p1', name: 'Website', clientId: 'c1', color: 'focus', rate: { kind: 'hourly', amount: 10_000 }, createdAt: 0 },
      { id: 'p2', name: 'Support', clientId: 'c1', color: 'care', rate: { kind: 'none' }, createdAt: 0 },
    ],
    ...extra,
  });
}

describe('rate precedence', () => {
  it('occurrence > task > project > client default', () => {
    const data = base();
    const occ = blockKey('t1', TODAY);

    data.assignments.t1 = { projectId: 'p2', billable: true };
    expect(resolveKey(data, occ)).toMatchObject({ source: 'client', rate: { kind: 'hourly', amount: 5000 } });

    data.projects[1].rate = { kind: 'hourly', amount: 8000 };
    expect(resolveKey(data, occ)).toMatchObject({ source: 'project', rate: { amount: 8000 } });

    data.assignments.t1.rate = { kind: 'hourly', amount: 9000 };
    expect(resolveKey(data, occ)).toMatchObject({ source: 'task', rate: { amount: 9000 } });
    expect(resolveKey(data, 't1')).toMatchObject({ source: 'task', rate: { amount: 9000 } });

    data.assignments[occ] = { projectId: 'p2', billable: true, rate: { kind: 'fixed', amount: 20_000 } };
    expect(resolveKey(data, occ)).toMatchObject({ source: 'occurrence', rate: { kind: 'fixed', amount: 20_000 } });
    // Other occurrences keep the task's rate.
    expect(resolveKey(data, blockKey('t1', addDays(TODAY, 1)))).toMatchObject({ source: 'task' });
  });

  it('an occurrence override can move one block to another project or make it free', () => {
    const data = base();
    data.assignments.t1 = { projectId: 'p1', billable: true };
    data.assignments[blockKey('t1', TODAY)] = { projectId: 'p2', billable: false };
    const r = resolveKey(data, blockKey('t1', TODAY))!;
    expect(r.project.id).toBe('p2');
    expect(r.billable).toBe(false);
    expect(r.assignedBy).toBe('occurrence');
  });

  it('accepts the short <taskId>:<date> occurrence form', () => {
    const data = base();
    data.assignments.t1 = { projectId: 'p1', billable: true };
    data.assignments[blockKey('t1', TODAY)] = { projectId: 'p1', billable: true, rate: { kind: 'hourly', amount: 1 } };
    expect(resolveKey(data, `t1:${TODAY}`)).toMatchObject({ source: 'occurrence' });
  });

  it('no price anywhere resolves to none', () => {
    const data = workData({ projects: [{ id: 'p', name: 'Free', color: 'focus', rate: { kind: 'none' } }] });
    data.assignments.t1 = { projectId: 'p', billable: true };
    expect(resolveKey(data, 't1')).toMatchObject({ source: 'none', rate: { kind: 'none' }, currency: 'USD' });
  });

  it('unassigned work and missing projects resolve to null', () => {
    const data = base();
    expect(resolveKey(data, 't9')).toBeNull();
    data.assignments.t9 = { projectId: 'gone', billable: true };
    expect(resolveKey(data, 't9')).toBeNull();
  });
});

describe('tracked vs planned billing', () => {
  it('a done block bills its planned length when nothing was tracked', () => {
    const t = doneTask({ start: 9 * 60, duration: 60 });
    const data = base({ assignments: { [t.id]: { projectId: 'p1', billable: true } } });
    const [item] = workItems(ctx([t], data), DAY);
    expect(item).toMatchObject({ key: blockKey(t.id, TODAY), plannedMinutes: 60, trackedMinutes: 0, billedMinutes: 60, amount: 10_000, done: true, currency: 'USD' });
    expect(item.projectName).toBe('Website');
    expect(item.clientName).toBe('Acme');
  });

  it('a block ticked early counts only up to the tick', () => {
    const t = doneTask({ start: 9 * 60, duration: 60 }, 9 * 60 + 45);
    const data = base({ assignments: { [t.id]: { projectId: 'p1', billable: true } } });
    const [item] = workItems(ctx([t], data), DAY);
    expect(item.plannedMinutes).toBe(45);
    expect(item.amount).toBe(7500);
  });

  it('tracked time wins over the plan, done or not', () => {
    const t = task({ start: 9 * 60, duration: 60 });
    const data = base({ assignments: { [t.id]: { projectId: 'p1', billable: true } } });
    const entries = [
      entry(TODAY, [9, 0], [9, 30], { blockKey: blockKey(t.id, TODAY) }),
      entry(TODAY, [9, 40], [10, 40], { taskId: t.id }),
    ];
    const [item] = workItems(ctx([t], data, entries), DAY);
    expect(item).toMatchObject({ done: false, plannedMinutes: 60, trackedMinutes: 90, billedMinutes: 90, amount: 15_000 });
  });

  it('nothing bills for an unfinished, untracked block (but it is listed)', () => {
    const t = task();
    const data = base({ assignments: { [t.id]: { projectId: 'p1', billable: true } } });
    const items = workItems(ctx([t], data), DAY);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ billedMinutes: 0, amount: 0 });
  });

  it('billPlanned off: only tracked time bills', () => {
    const t = doneTask();
    const data = base({ assignments: { [t.id]: { projectId: 'p1', billable: true } }, settings: { billPlanned: false } });
    expect(workItems(ctx([t], data), DAY)[0]).toMatchObject({ billedMinutes: 0, amount: 0 });
    const tracked = workItems(ctx([t], data, [entry(TODAY, [9, 0], [9, 20], { taskId: t.id })]), DAY)[0];
    expect(tracked).toMatchObject({ billedMinutes: 20, amount: 3300 }); // 0.33 h × $100
  });

  it('a running entry counts up to now', () => {
    const t = task();
    const data = base({ assignments: { [t.id]: { projectId: 'p1', billable: true } } });
    const items = workItems(ctx([t], data, [{ taskId: t.id, startMs: at(TODAY, 9), endMs: null }], { now: at(TODAY, 9, 30) }), DAY);
    expect(items[0].trackedMinutes).toBe(30);
  });

  it('non-billable work is hidden by default and never earns', () => {
    const t = doneTask();
    const data = base({ assignments: { [t.id]: { projectId: 'p1', billable: false } } });
    expect(workItems(ctx([t], data), DAY)).toEqual([]);
    const [item] = workItems(ctx([t], data), DAY, { includeNonBillable: true });
    expect(item).toMatchObject({ billable: false, billedMinutes: 60, amount: 0 });
  });

  it('unassigned tasks are not work', () => {
    expect(workItems(ctx([doneTask()], base()), DAY)).toEqual([]);
  });
});

describe('fixed-rate items', () => {
  it('bill their amount once per occurrence, when done', () => {
    const t = task({ recurrence: { freq: 'daily', interval: 1 }, completions: [TODAY, addDays(TODAY, 1)] });
    const data = base({ assignments: { [t.id]: { projectId: 'p1', billable: true, rate: { kind: 'fixed', amount: 25_000 } } } });
    const items = workItems(ctx([t], data), { from: TODAY, to: addDays(TODAY, 2) });
    expect(items.map((i) => [i.date, i.done, i.amount])).toEqual([
      [TODAY, true, 25_000],
      [addDays(TODAY, 1), true, 25_000],
      [addDays(TODAY, 2), false, 0],
    ]);
  });

  it('do not scale with tracked time', () => {
    const t = doneTask();
    const data = base({ assignments: { [t.id]: { projectId: 'p1', billable: true, rate: { kind: 'fixed', amount: 25_000 } } } });
    const [item] = workItems(ctx([t], data, [entry(TODAY, [9, 0], [13, 0], { taskId: t.id })]), DAY);
    expect(item).toMatchObject({ trackedMinutes: 240, billedMinutes: 240, amount: 25_000 });
  });

  it('a backlog task finished today bills on the day it was done', () => {
    const t = task({ date: null, start: null, duration: 30, doneAt: at(TODAY, 15) });
    const data = base({ assignments: { [t.id]: { projectId: 'p1', billable: true, rate: { kind: 'fixed', amount: 9900 } } } });
    const [item] = workItems(ctx([t], data), DAY);
    expect(item).toMatchObject({ key: blockKey(t.id, TODAY), date: TODAY, done: true, plannedMinutes: 30, amount: 9900 });
  });
});

describe('other kinds of work', () => {
  it('tracked entries with only a project count as project time, one item per day', () => {
    const data = base();
    const entries = [
      entry(TODAY, [8, 0], [8, 30], { projectId: 'p1' }),
      entry(TODAY, [16, 0], [16, 30], { projectId: 'p1' }),
      entry(addDays(TODAY, 1), [8, 0], [9, 0], { projectId: 'p1' }),
    ];
    const items = workItems(ctx([], data, entries), { from: TODAY, to: addDays(TODAY, 1) });
    expect(items.map((i) => [i.key, i.kind, i.billedMinutes, i.amount, i.title])).toEqual([
      [projectTimeKey('p1', TODAY), 'project', 60, 10_000, 'Website'],
      [projectTimeKey('p1', addDays(TODAY, 1)), 'project', 60, 10_000, 'Website'],
    ]);
  });

  it("an entry's project assigns an otherwise unassigned task", () => {
    const t = task({ title: 'Call' });
    const items = workItems(ctx([t], base(), [entry(TODAY, [9, 0], [9, 30], { taskId: t.id, projectId: 'p1' })]), DAY);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ title: 'Call', projectId: 'p1', billedMinutes: 30, amount: 5000 });
  });

  it('time tracked on a day with no occurrence still bills', () => {
    const t = task({ date: addDays(TODAY, -3) });
    const data = base({ assignments: { [t.id]: { projectId: 'p1', billable: true } } });
    const items = workItems(ctx([t], data, [entry(TODAY, [10, 0], [11, 0], { taskId: t.id })]), DAY);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ key: blockKey(t.id, TODAY), plannedMinutes: 0, billedMinutes: 60, amount: 10_000 });
  });

  it('calendar events assigned to a project bill once they have ended', () => {
    const ev: CalendarEvent = {
      id: 'e1',
      provider: 'ics',
      accountId: 'a1',
      calendarId: 'c',
      title: 'Client call',
      startMs: at(TODAY, 14),
      endMs: at(TODAY, 15),
      allDay: false,
    };
    const data = base({ assignments: { 'cal:a1:e1': { projectId: 'p1', billable: true } } });
    const ended = workItems(ctx([], data, [], { events: [ev], now: at(TODAY, 16) }), DAY);
    expect(ended[0]).toMatchObject({ kind: 'event', title: 'Client call', done: true, billedMinutes: 60, amount: 10_000 });
    const live = workItems(ctx([], data, [], { events: [ev], now: at(TODAY, 14, 30) }), DAY);
    expect(live[0]).toMatchObject({ done: false, amount: 0 });
  });

  it('uses the client currency, and the default when there is no client', () => {
    const t1 = doneTask({ title: 'A' });
    const t2 = doneTask({ title: 'B' });
    const data = workData({
      settings: { currency: 'EUR' },
      clients: [{ id: 'jp', name: 'Tokyo', currency: 'JPY' }],
      projects: [
        { id: 'a', name: 'A', clientId: 'jp', color: 'focus', rate: { kind: 'hourly', amount: 3333 } },
        { id: 'b', name: 'B', color: 'focus', rate: { kind: 'hourly', amount: 4000 } },
      ],
      assignments: { [t1.id]: { projectId: 'a', billable: true }, [t2.id]: { projectId: 'b', billable: true } },
    });
    const items = workItems(ctx([t1, t2], data), DAY);
    expect(items.map((i) => [i.currency, i.amount])).toEqual([
      ['JPY', 3333],
      ['EUR', 4000],
    ]);
  });

  it('filters by client and project, and marks invoiced keys', () => {
    const t1 = doneTask();
    const t2 = doneTask();
    const data = base({ assignments: { [t1.id]: { projectId: 'p1', billable: true }, [t2.id]: { projectId: 'p2', billable: true } } });
    data.invoicedKeys[blockKey(t1.id, TODAY)] = 'inv1';
    const c = ctx([t1, t2], data);
    expect(workItems(c, DAY, { projectIds: ['p2'] }).map((i) => i.taskId)).toEqual([t2.id]);
    expect(workItems(c, DAY, { clientId: null })).toEqual([]);
    expect(workItems(c, DAY).find((i) => i.taskId === t1.id)?.invoiceId).toBe('inv1');
  });
});
