import { describe, expect, it } from 'vitest';
import { atMinutes } from '../../engine/time';
import { budgetBurn, datesIn, monthRange, previousRange, summary, weekRange } from './analytics';
import { ctx, doneTask, entry, workData } from './testing';

// The week of Mon 19 Oct 2026, and the one before it.
const WEEK = { from: '2026-10-19', to: '2026-10-25' };

function scenario() {
  const data = workData({
    clients: [{ id: 'acme', name: 'Acme', currency: 'USD' }],
    projects: [
      { id: 'web', name: 'Website', clientId: 'acme', color: 'focus', rate: { kind: 'hourly', amount: 10_000 }, budget: { kind: 'hours', amount: 10 }, createdAt: atMinutes('2026-10-01', 0) },
      { id: 'ops', name: 'Internal', color: '#808080', rate: { kind: 'none' }, createdAt: atMinutes('2026-10-01', 0) },
      { id: 'fix', name: 'Fixes', clientId: 'acme', color: 'move', rate: { kind: 'fixed', amount: 20_000 }, budget: { kind: 'money', amount: 50_000 }, createdAt: atMinutes('2026-10-01', 0) },
    ],
  });
  const t1 = doneTask({ title: 'Design', date: '2026-10-19', start: 9 * 60, duration: 120 }); // 2 h → $200
  const t2 = doneTask({ title: 'Build', date: '2026-10-20', start: 9 * 60, duration: 60 }); // tracked 1.5 h → $150
  const t3 = doneTask({ title: 'Admin', date: '2026-10-21', start: 9 * 60, duration: 60 }); // non-billable 1 h
  const t4 = doneTask({ title: 'Last week', date: '2026-10-13', start: 9 * 60, duration: 60 }); // previous: 1 h → $100
  const t5 = doneTask({ title: 'Bug', date: '2026-10-22', start: 14 * 60, duration: 30 }); // fixed $200
  data.assignments[t1.id] = { projectId: 'web', billable: true };
  data.assignments[t2.id] = { projectId: 'web', billable: true };
  data.assignments[t3.id] = { projectId: 'ops', billable: false };
  data.assignments[t4.id] = { projectId: 'web', billable: true };
  data.assignments[t5.id] = { projectId: 'fix', billable: true };
  const entries = [entry('2026-10-20', [9, 0], [10, 30], { taskId: t2.id })];
  return ctx([t1, t2, t3, t4, t5], data, entries);
}

describe('ranges', () => {
  it('weeks follow weekStartsOn', () => {
    expect(weekRange('2026-10-21', 1)).toEqual({ from: '2026-10-19', to: '2026-10-25' });
    expect(weekRange('2026-10-21', 0)).toEqual({ from: '2026-10-18', to: '2026-10-24' });
    expect(weekRange('2026-10-19', 1)).toEqual({ from: '2026-10-19', to: '2026-10-25' });
    expect(weekRange('2026-10-18', 1)).toEqual({ from: '2026-10-12', to: '2026-10-18' });
  });

  it('months and previous periods', () => {
    expect(monthRange('2026-02-10')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(previousRange(WEEK)).toEqual({ from: '2026-10-12', to: '2026-10-18' });
    expect(previousRange({ from: '2026-03-01', to: '2026-03-31' })).toEqual({ from: '2026-01-29', to: '2026-02-28' });
    expect(datesIn(WEEK)).toHaveLength(7);
  });
});

describe('summary', () => {
  it('totals earned, billed and non-billable time, and the effective rate', () => {
    const s = summary(scenario(), WEEK);
    expect(s.currency).toBe('USD');
    expect(s.earned).toBe(20_000 + 15_000 + 20_000);
    expect(s.billedMinutes).toBe(120 + 90 + 30);
    expect(s.nonBillableMinutes).toBe(60);
    expect(s.billableShare).toBeCloseTo(240 / 300);
    expect(s.effectiveHourly).toBe(13_750); // $550 over 4 h
    expect(s.uninvoiced).toBe(55_000);
    expect(s.earnedByCurrency).toEqual({ USD: 55_000 });
    expect(s.itemCount).toBe(4);
  });

  it('per-day series cover every date, zeros included', () => {
    const s = summary(scenario(), WEEK);
    expect(s.byDay.map((d) => [d.date, d.earned, d.billedMinutes, d.nonBillableMinutes])).toEqual([
      ['2026-10-19', 20_000, 120, 0],
      ['2026-10-20', 15_000, 90, 0],
      ['2026-10-21', 0, 0, 60],
      ['2026-10-22', 20_000, 30, 0],
      ['2026-10-23', 0, 0, 0],
      ['2026-10-24', 0, 0, 0],
      ['2026-10-25', 0, 0, 0],
    ]);
  });

  it('per-project and per-client series, and top projects', () => {
    const s = summary(scenario(), WEEK);
    expect(s.byProject.map((p) => [p.projectId, p.earned, p.billedMinutes, p.nonBillableMinutes, p.items])).toEqual([
      ['web', 35_000, 210, 0, 2],
      ['fix', 20_000, 30, 0, 1],
      ['ops', 0, 0, 60, 1],
    ]);
    expect(s.byProject[0].effectiveHourly).toBe(10_000);
    expect(s.byProject.find((p) => p.projectId === 'ops')?.color).toBe('#808080');
    expect(s.byClient.map((c) => [c.clientId, c.name, c.earned, c.nonBillableMinutes])).toEqual([
      ['acme', 'Acme', 55_000, 0],
      [null, '', 0, 60],
    ]);
    expect(s.topProjects.map((p) => p.projectId)).toEqual(['web', 'fix']);
    expect(summary(scenario(), WEEK, { top: 1 }).topProjects).toHaveLength(1);
  });

  it('compares with the previous period of the same length', () => {
    const s = summary(scenario(), WEEK);
    expect(s.previous).toMatchObject({ range: { from: '2026-10-12', to: '2026-10-18' }, earned: 10_000, billedMinutes: 60, nonBillableMinutes: 0, effectiveHourly: 10_000 });
    expect(s.change.earned).toBeCloseTo(4.5); // 550 vs 100
    expect(s.change.billedMinutes).toBeCloseTo(3); // 240 vs 60
    expect(s.change.nonBillableMinutes).toBeNull(); // nothing to compare with
    expect(s.change.effectiveHourly).toBeCloseTo(0.375);
  });

  it('budget burn counts the project lifetime up to the end of the range', () => {
    const c = scenario();
    const s = summary(c, WEEK);
    const web = s.budgets.find((b) => b.projectId === 'web')!;
    // 1 h last week + 2 h + 1.5 h this week = 4.5 of 10 hours.
    expect(web).toMatchObject({ kind: 'hours', budget: 10, used: 4.5, remaining: 5.5, pct: 45, over: false });
    const fix = s.budgets.find((b) => b.projectId === 'fix')!;
    expect(fix).toMatchObject({ kind: 'money', budget: 50_000, used: 20_000, pct: 40, currency: 'USD' });
    expect(s.byProject.find((p) => p.projectId === 'web')?.budget?.pct).toBe(45);
    // Before this week only last week's hour counts.
    expect(budgetBurn(c, '2026-10-18').find((b) => b.projectId === 'web')?.used).toBe(1);
  });

  it('an empty period has no rate and no change', () => {
    const s = summary(ctx([], workData()), WEEK);
    expect(s).toMatchObject({ earned: 0, billedMinutes: 0, effectiveHourly: null, billableShare: null, budgets: [], byProject: [] });
    expect(s.change).toEqual({ earned: null, billedMinutes: null, nonBillableMinutes: null, effectiveHourly: null });
    expect(s.byDay).toHaveLength(7);
  });

  it('headlines one currency and keeps the others apart', () => {
    const data = workData({
      settings: { currency: 'EUR' },
      clients: [
        { id: 'us', name: 'US', currency: 'USD' },
        { id: 'eu', name: 'EU', currency: 'EUR' },
      ],
      projects: [
        { id: 'a', name: 'A', clientId: 'us', color: 'focus', rate: { kind: 'hourly', amount: 10_000 } },
        { id: 'b', name: 'B', clientId: 'eu', color: 'focus', rate: { kind: 'hourly', amount: 8000 } },
      ],
    });
    const t1 = doneTask({ date: '2026-10-19' });
    const t2 = doneTask({ date: '2026-10-19' });
    data.assignments[t1.id] = { projectId: 'a', billable: true };
    data.assignments[t2.id] = { projectId: 'b', billable: true };
    const s = summary(ctx([t1, t2], data), WEEK);
    expect(s.currency).toBe('EUR');
    expect(s.earned).toBe(8000);
    expect(s.earnedByCurrency).toEqual({ USD: 10_000, EUR: 8000 });
    expect(s.billedMinutes).toBe(120);
    expect(s.effectiveHourly).toBe(8000);
    expect(summary(ctx([t1, t2], data), WEEK, { currency: 'USD' }).earned).toBe(10_000);
  });
});
