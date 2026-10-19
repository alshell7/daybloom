import { describe, expect, it } from 'vitest';
import { addDays } from '../../engine/time';
import { blockKey } from './keys';
import {
  claimKeys,
  draftInvoice,
  formatInvoiceNumber,
  invoiceTotals,
  isOverdue,
  makeLine,
  nextInvoiceNumber,
  parseInvoiceNumber,
  releaseKeys,
} from './invoices';
import { formatMoney } from './money';
import { ctx, doneTask, task, TODAY, workData } from './testing';
import type { Invoice, InvoiceLine, WorkData } from './types';

const OCT = { from: '2026-10-01', to: '2026-10-31' };

function setup() {
  const data = workData({
    clients: [
      { id: 'c1', name: 'Acme', currency: 'USD', taxPct: 10 },
      { id: 'c2', name: 'Other', currency: 'USD' },
    ],
    projects: [
      { id: 'web', name: 'Website', clientId: 'c1', color: 'focus', rate: { kind: 'hourly', amount: 10_000 } },
      { id: 'app', name: 'App', clientId: 'c1', color: 'learn', rate: { kind: 'hourly', amount: 12_000 } },
      { id: 'x', name: 'Elsewhere', clientId: 'c2', color: 'move', rate: { kind: 'hourly', amount: 9000 } },
    ],
    profile: { invoicePrefix: 'INV', paymentTerms: 14 },
  });
  const design = doneTask({ title: 'Design', date: '2026-10-05', duration: 90 });
  const build = task({ title: 'Build', date: '2026-10-05', duration: 60, recurrence: { freq: 'daily', interval: 1, count: 3 } });
  build.completions = ['2026-10-05', '2026-10-06', '2026-10-07'];
  const api = doneTask({ title: 'API', date: '2026-10-06', duration: 30 });
  const logo = doneTask({ title: 'Logo', date: '2026-10-20', duration: 60 });
  const other = doneTask({ title: 'Other client', date: '2026-10-05' });
  data.assignments[design.id] = { projectId: 'web', billable: true };
  data.assignments[build.id] = { projectId: 'web', billable: true };
  data.assignments[api.id] = { projectId: 'app', billable: true };
  data.assignments[logo.id] = { projectId: 'web', billable: true, rate: { kind: 'fixed', amount: 50_000 } };
  data.assignments[other.id] = { projectId: 'x', billable: true };
  return { data, tasks: [design, build, api, logo, other], design, build, api, logo };
}

function save(data: WorkData, inv: Invoice) {
  const claim = claimKeys(data.invoicedKeys, inv);
  if (!claim.ok) throw new Error('conflict');
  data.invoicedKeys = claim.invoicedKeys;
  data.invoices.push(inv);
}

describe('invoice numbering', () => {
  it('is sequential per year, whatever the prefix', () => {
    expect(nextInvoiceNumber([], 2026, 'INV')).toBe('INV-2026-0001');
    const list = [{ number: 'INV-2026-0006' }, { number: 'INV-2026-0003' }, { number: 'INV-2025-0019' }, { number: 'hand typed' }];
    expect(nextInvoiceNumber(list, 2026, 'INV')).toBe('INV-2026-0007');
    expect(nextInvoiceNumber(list, 2025, 'INV')).toBe('INV-2025-0020');
    expect(nextInvoiceNumber(list, 2027, 'INV')).toBe('INV-2027-0001');
    expect(nextInvoiceNumber(list, 2026, 'ACME')).toBe('ACME-2026-0007');
    expect(nextInvoiceNumber(list, 2026, '')).toBe('2026-0007');
  });

  it('parses and formats', () => {
    expect(parseInvoiceNumber('INV-2026-0007')).toEqual({ year: 2026, seq: 7 });
    expect(parseInvoiceNumber('2026-12345')).toEqual({ year: 2026, seq: 12_345 });
    expect(parseInvoiceNumber('INV-7')).toBeNull();
    expect(formatInvoiceNumber('INV', 2026, 7)).toBe('INV-2026-0007');
  });

  it('drafts take the next number for the issue year', () => {
    const { data, tasks } = setup();
    data.invoices.push({ ...draftInvoice(ctx(tasks, data), { clientId: 'c2', ...OCT, groupBy: 'task', issueDate: '2026-10-31' }) });
    const next = draftInvoice(ctx(tasks, data), { clientId: 'c1', ...OCT, groupBy: 'task', issueDate: '2026-11-01' });
    expect(data.invoices[0].number).toBe('INV-2026-0001');
    expect(next.number).toBe('INV-2026-0002');
    const newYear = draftInvoice(ctx(tasks, data), { clientId: 'c1', ...OCT, groupBy: 'task', issueDate: '2027-01-02' });
    expect(newYear.number).toBe('INV-2027-0001');
  });
});

describe('drafting', () => {
  it('fills client, currency, tax, dates and lines grouped by task', () => {
    const { data, tasks, build } = setup();
    const inv = draftInvoice(ctx(tasks, data), { clientId: 'c1', ...OCT, groupBy: 'task', issueDate: '2026-11-01', notes: 'Thanks!' });
    expect(inv).toMatchObject({ clientId: 'c1', currency: 'USD', taxPct: 10, issueDate: '2026-11-01', dueDate: '2026-11-15', status: 'draft', notes: 'Thanks!' });
    expect(inv.lines.map((l) => [l.description, l.quantity, l.unit, l.unitPrice, l.amount])).toEqual([
      ['Website — Build', 3, 'hour', 10_000, 30_000],
      ['Website — Design', 1.5, 'hour', 10_000, 15_000],
      ['App — API', 0.5, 'hour', 12_000, 6000],
      ['Website — Logo', 1, 'item', 50_000, 50_000],
    ]);
    expect(inv.lines[0].sourceKeys).toEqual(['2026-10-05', '2026-10-06', '2026-10-07'].map((d) => blockKey(build.id, d)));
    // Another client's work never appears.
    expect(inv.lines.some((l) => l.description.includes('Other'))).toBe(false);
  });

  it('groups by project and by day; prices never mix on a line', () => {
    const { data, tasks } = setup();
    const byProject = draftInvoice(ctx(tasks, data), { clientId: 'c1', ...OCT, groupBy: 'project' });
    expect(byProject.lines.map((l) => [l.description, l.quantity, l.unit, l.amount])).toEqual([
      ['Website', 4.5, 'hour', 45_000],
      ['App', 0.5, 'hour', 6000],
      ['Website', 1, 'item', 50_000],
    ]);
    const byDay = draftInvoice(ctx(tasks, data), { clientId: 'c1', ...OCT, groupBy: 'day', locale: 'en-US' });
    expect(byDay.lines.map((l) => [l.description, l.quantity])).toEqual([
      ['Mon, Oct 5 — Build, Design', 2.5],
      ['Tue, Oct 6 — API', 0.5],
      ['Tue, Oct 6 — Build', 1],
      ['Wed, Oct 7 — Build', 1],
      ['Tue, Oct 20 — Logo', 1],
    ]);
  });

  it('can be limited to some projects', () => {
    const { data, tasks } = setup();
    const inv = draftInvoice(ctx(tasks, data), { clientId: 'c1', projectIds: ['app'], ...OCT, groupBy: 'project' });
    expect(inv.lines.map((l) => l.description)).toEqual(['App']);
  });

  it('rejects an unknown client', () => {
    const { data, tasks } = setup();
    expect(() => draftInvoice(ctx(tasks, data), { clientId: 'nope', ...OCT, groupBy: 'task' })).toThrow();
  });
});

describe('no double billing', () => {
  it('work on a saved invoice never appears on another', () => {
    const { data, tasks, logo } = setup();
    const first = draftInvoice(ctx(tasks, data), { clientId: 'c1', from: '2026-10-01', to: '2026-10-15', groupBy: 'task' });
    save(data, first);
    // An overlapping period only picks up what is new.
    const second = draftInvoice(ctx(tasks, data), { clientId: 'c1', from: '2026-10-05', to: '2026-10-31', groupBy: 'task' });
    expect(second.lines.flatMap((l) => l.sourceKeys)).toEqual([blockKey(logo.id, '2026-10-20')]);
    save(data, second);
    const third = draftInvoice(ctx(tasks, data), { clientId: 'c1', ...OCT, groupBy: 'task' });
    expect(third.lines).toEqual([]);
  });

  it('two drafts made side by side cannot both be saved', () => {
    const { data, tasks } = setup();
    const a = draftInvoice(ctx(tasks, data), { clientId: 'c1', ...OCT, groupBy: 'task' });
    const b = draftInvoice(ctx(tasks, data), { clientId: 'c1', ...OCT, groupBy: 'project' });
    save(data, a);
    const claim = claimKeys(data.invoicedKeys, b);
    expect(claim.ok).toBe(false);
    if (!claim.ok) expect(claim.conflicts.length).toBe(b.lines.flatMap((l) => l.sourceKeys).length);
  });

  it('re-saving the same invoice keeps its keys; deleting it frees them', () => {
    const { data, tasks } = setup();
    const a = draftInvoice(ctx(tasks, data), { clientId: 'c1', ...OCT, groupBy: 'task' });
    save(data, a);
    const trimmed = { ...a, lines: a.lines.slice(1) };
    const again = claimKeys(data.invoicedKeys, trimmed);
    expect(again.ok).toBe(true);
    if (again.ok) {
      expect(Object.keys(again.invoicedKeys)).not.toContain(a.lines[0].sourceKeys[0]);
      data.invoicedKeys = again.invoicedKeys;
    }
    data.invoicedKeys = releaseKeys(data.invoicedKeys, a.id);
    expect(data.invoicedKeys).toEqual({});
    data.invoices = [];
    const fresh = draftInvoice(ctx(tasks, data), { clientId: 'c1', ...OCT, groupBy: 'task' });
    expect(fresh.lines.length).toBe(a.lines.length);
  });

  it('a hand-typed line has no keys and claims nothing', () => {
    const line = makeLine({ description: 'Hosting', quantity: 12, unitPrice: 1999 });
    expect(line).toEqual({ description: 'Hosting', quantity: 12, unit: 'item', unitPrice: 1999, amount: 23_988, sourceKeys: [] });
    const claim = claimKeys({ k: 'other' }, { id: 'me', lines: [line] });
    expect(claim).toEqual({ ok: true, invoicedKeys: { k: 'other' } });
  });
});

describe('totals and rounding', () => {
  const lines = (amounts: number[]): InvoiceLine[] => amounts.map((amount) => ({ description: '', quantity: 1, unit: 'item', unitPrice: amount, amount, sourceKeys: [] }));

  it('discount first, then tax on the discounted amount, each rounded once', () => {
    const t = invoiceTotals({ lines: lines([1999, 2501, 3333]), taxPct: 7.25, discount: { kind: 'percent', pct: 10 } });
    // 7833 − 783.3 → 783 = 7050; 7.25 % of 7050 = 511.125 → 511.
    expect(t).toEqual({ subtotal: 7833, discount: 783, taxable: 7050, tax: 511, total: 7561 });
  });

  it('rounds halves away from zero', () => {
    expect(invoiceTotals({ lines: lines([1005]), taxPct: 10 }).tax).toBe(101);
    expect(invoiceTotals({ lines: lines([1005]), taxPct: 0, discount: { kind: 'percent', pct: 50 } }).discount).toBe(503);
  });

  it('a fixed discount never exceeds the subtotal', () => {
    expect(invoiceTotals({ lines: lines([1000]), taxPct: 20, discount: { kind: 'amount', amount: 5000 } })).toEqual({ subtotal: 1000, discount: 1000, taxable: 0, tax: 0, total: 0 });
    expect(invoiceTotals({ lines: lines([10_000]), taxPct: 20, discount: { kind: 'amount', amount: 2500 } }).total).toBe(9000);
  });

  it('zero-decimal currencies stay whole', () => {
    const data = workData({
      clients: [{ id: 'jp', name: 'Tokyo', currency: 'JPY', taxPct: 10 }],
      projects: [{ id: 'p', name: 'P', clientId: 'jp', color: 'focus', rate: { kind: 'hourly', amount: 3333 } }],
    });
    const t = doneTask({ duration: 25 });
    data.assignments[t.id] = { projectId: 'p', billable: true };
    const inv = draftInvoice(ctx([t], data), { clientId: 'jp', from: TODAY, to: TODAY, groupBy: 'task' });
    expect(inv.currency).toBe('JPY');
    expect(inv.lines[0]).toMatchObject({ quantity: 0.42, unitPrice: 3333, amount: 1400 }); // 1399.86 → 1400
    const tot = invoiceTotals(inv);
    expect(tot).toMatchObject({ subtotal: 1400, tax: 140, total: 1540 });
    expect(formatMoney(tot.total, inv.currency, 'en-US')).toBe('¥1,540');
  });
});

describe('status', () => {
  it('overdue = sent and past due', () => {
    expect(isOverdue({ status: 'sent', dueDate: addDays(TODAY, -1) }, TODAY)).toBe(true);
    expect(isOverdue({ status: 'sent', dueDate: TODAY }, TODAY)).toBe(false);
    expect(isOverdue({ status: 'paid', dueDate: addDays(TODAY, -9) }, TODAY)).toBe(false);
  });
});
