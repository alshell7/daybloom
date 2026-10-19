import { beforeEach, describe, expect, it } from 'vitest';
import { taskFile, tasks } from '../../stores/tasks.svelte';
import { atMinutes } from '../../engine/time';
import { blockKey } from './keys';
import { emptyWorkData } from './migrate';
import { TODAY } from './testing';
import { work, workFile } from './work.svelte';

const DAY = { from: TODAY, to: TODAY };

function doneBlock(title: string, startMin = 9 * 60, duration = 60) {
  const t = tasks.create({ title, date: TODAY, start: startMin, duration });
  tasks.toggleDone(t.id, TODAY, atMinutes(TODAY, startMin + duration));
  return t;
}

beforeEach(() => {
  workFile.value = emptyWorkData();
  taskFile.value = { version: 1, tasks: [], deleted: [] };
});

describe('work store', () => {
  it('CRUD for clients and projects', () => {
    const c = work.addClient({ name: 'Acme', currency: 'eur', taxPct: 19 });
    expect(work.client(c.id)).toMatchObject({ name: 'Acme', currency: 'EUR', taxPct: 19 });
    work.updateClient(c.id, { name: 'Acme GmbH' });
    expect(work.client(c.id)?.name).toBe('Acme GmbH');

    const p = work.addProject({ name: 'Site', clientId: c.id, rate: { kind: 'hourly', amount: 9000 }, color: 'learn' });
    expect(work.project(p.id)).toMatchObject({ clientId: c.id, color: 'learn', rate: { kind: 'hourly', amount: 9000 } });
    work.updateProject(p.id, { budget: { kind: 'hours', amount: 20 } });
    expect(work.project(p.id)?.budget).toEqual({ kind: 'hours', amount: 20 });
    work.updateProject(p.id, { budget: undefined });
    expect(work.project(p.id)?.budget).toBeUndefined();

    work.removeClient(c.id);
    expect(work.clients).toEqual([]);
    expect(work.project(p.id)?.clientId).toBeUndefined();
  });

  it('new clients take the default currency', () => {
    work.updateSettings({ currency: 'chf' });
    expect(work.settings.currency).toBe('CHF');
    expect(work.profile.currency).toBe('CHF');
    expect(work.addClient({ name: 'X' }).currency).toBe('CHF');
    work.updateProfile({ currency: 'JPY', name: 'Me' });
    expect(work.settings.currency).toBe('JPY');
    work.updateSettings({ currency: 'nonsense' as string });
    expect(work.settings.currency).toBe('JPY');
  });

  it('assign, override one occurrence, and resolve the rate', () => {
    const c = work.addClient({ name: 'Acme', defaultRate: { kind: 'hourly', amount: 5000 } });
    const p = work.addProject({ name: 'Site', clientId: c.id });
    const t = doneBlock('Design');
    work.assign(t.id, p.id, true);
    expect(work.rateFor(t.id)).toEqual({ rate: { kind: 'hourly', amount: 5000 }, source: 'client', currency: 'USD' });

    work.setRate(t.id, { kind: 'hourly', amount: 7000 });
    expect(work.rateFor(blockKey(t.id, TODAY))?.source).toBe('task');
    // Re-assigning to the same project keeps the override.
    work.assign(t.id, p.id, true);
    expect(work.assignment(t.id)?.rate).toEqual({ kind: 'hourly', amount: 7000 });

    work.setRate(blockKey(t.id, TODAY), { kind: 'fixed', amount: 30_000 });
    expect(work.rateFor(blockKey(t.id, TODAY))).toMatchObject({ source: 'occurrence', rate: { kind: 'fixed', amount: 30_000 } });
    expect(work.items(DAY)[0]).toMatchObject({ amount: 30_000, done: true });

    work.setBillable(blockKey(t.id, TODAY), false);
    expect(work.items(DAY)).toEqual([]);
    expect(work.items(DAY, { includeNonBillable: true })[0].billable).toBe(false);

    work.assign(t.id, null);
    work.unassign(blockKey(t.id, TODAY));
    expect(work.rateFor(t.id)).toBeNull();
  });

  it('ignores assignments to projects that do not exist', () => {
    work.assign('t1', 'nope', true);
    expect(work.assignments).toEqual({});
  });

  it('removing a project drops its assignments', () => {
    const p = work.addProject({ name: 'Gone soon', rate: { kind: 'hourly', amount: 1000 } });
    work.assign('t1', p.id);
    work.assign(`t2:${TODAY}`, p.id);
    expect(Object.keys(work.assignments)).toEqual(['t1', blockKey('t2', TODAY)]);
    work.removeProject(p.id);
    expect(work.assignments).toEqual({});
  });

  it('reads tracked time from a connected source', () => {
    const p = work.addProject({ name: 'Site', rate: { kind: 'hourly', amount: 10_000 } });
    const t = tasks.create({ title: 'Build', date: TODAY, start: 9 * 60, duration: 60 });
    work.assign(t.id, p.id);
    expect(work.items(DAY)[0].amount).toBe(0);
    const off = work.connect({ entries: () => [{ taskId: t.id, startMs: atMinutes(TODAY, 9 * 60), endMs: atMinutes(TODAY, 10 * 60 + 30) }] });
    expect(work.items(DAY)[0]).toMatchObject({ trackedMinutes: 90, amount: 15_000 });
    off();
    expect(work.items(DAY)[0].trackedMinutes).toBe(0);
  });

  it('saves invoices with sequential numbers and never bills work twice', () => {
    work.updateProfile({ invoicePrefix: 'INV', paymentTerms: 30 });
    const c = work.addClient({ name: 'Acme' });
    const p = work.addProject({ name: 'Site', clientId: c.id, rate: { kind: 'hourly', amount: 10_000 } });
    const t1 = doneBlock('One', 9 * 60);
    work.assign(t1.id, p.id);

    const a = work.draftInvoice({ clientId: c.id, ...DAY, groupBy: 'task', issueDate: '2026-10-20' });
    expect(a.dueDate).toBe('2026-11-19');
    const saved = work.saveInvoice(a);
    expect(saved.ok).toBe(true);
    expect(work.invoices[0].number).toBe('INV-2026-0001');
    expect(work.isInvoiced(blockKey(t1.id, TODAY))).toBe(true);
    expect(work.invoiceFor(blockKey(t1.id, TODAY))?.id).toBe(a.id);
    expect(work.items(DAY)[0].invoiceId).toBe(a.id);

    // A second draft made from the same work has nothing left to bill.
    expect(work.draftInvoice({ clientId: c.id, ...DAY, groupBy: 'task' }).lines).toEqual([]);

    // Two drafts of new work: the first saved wins; the second is refused.
    const t2 = doneBlock('Two', 11 * 60);
    work.assign(t2.id, p.id);
    const b = work.draftInvoice({ clientId: c.id, ...DAY, groupBy: 'task', issueDate: '2026-10-21' });
    const b2 = work.draftInvoice({ clientId: c.id, ...DAY, groupBy: 'project', issueDate: '2026-10-21' });
    expect(b.number).toBe('INV-2026-0002');
    expect(work.saveInvoice(b).ok).toBe(true);
    const refused = work.saveInvoice(b2);
    expect(refused).toEqual({ ok: false, conflicts: [blockKey(t2.id, TODAY)] });
    expect(work.invoices).toHaveLength(2);

    // Editing keeps the number and the claim.
    expect(work.updateInvoice(b.id, { notes: 'Thanks' }).ok).toBe(true);
    expect(work.invoice(b.id)).toMatchObject({ number: 'INV-2026-0002', notes: 'Thanks' });

    // Deleting frees the work for a new invoice.
    work.removeInvoice(a.id);
    expect(work.isInvoiced(blockKey(t1.id, TODAY))).toBe(false);
    const again = work.draftInvoice({ clientId: c.id, ...DAY, groupBy: 'task' });
    expect(again.lines.flatMap((l) => l.sourceKeys)).toEqual([blockKey(t1.id, TODAY)]);
  });

  it('a clashing invoice number is replaced on save', () => {
    const c = work.addClient({ name: 'Acme' });
    const one = work.draftInvoice({ clientId: c.id, ...DAY, groupBy: 'task', issueDate: '2026-10-20' });
    const two = work.draftInvoice({ clientId: c.id, ...DAY, groupBy: 'task', issueDate: '2026-10-20' });
    expect(one.number).toBe(two.number);
    work.saveInvoice(one);
    work.saveInvoice(two);
    expect(work.invoices.map((i) => i.number)).toEqual(['INV-2026-0001', 'INV-2026-0002']);
  });

  it('status changes and exports', () => {
    const c = work.addClient({ name: 'Acme <Ltd>' });
    const p = work.addProject({ name: 'Site', clientId: c.id, rate: { kind: 'hourly', amount: 10_000 } });
    work.assign(doneBlock('Design').id, p.id);
    const inv = work.draftInvoice({ clientId: c.id, ...DAY, groupBy: 'task', issueDate: '2026-10-20' });
    work.saveInvoice(inv);
    work.markSent(inv.id);
    expect(work.invoice(inv.id)?.status).toBe('sent');
    work.markPaid(inv.id, '2026-10-30');
    expect(work.invoice(inv.id)).toMatchObject({ status: 'paid', paidAt: '2026-10-30' });
    work.setStatus(inv.id, 'sent');
    expect(work.invoice(inv.id)?.paidAt).toBeUndefined();
    expect(work.totals(work.invoice(inv.id)!).total).toBe(10_000);

    expect(work.invoiceCsv(inv.id)).toContain('Total');
    expect(work.invoiceHtml(inv.id, { locale: 'en-US' })).toContain('Acme &lt;Ltd&gt;');
    expect(work.itemsCsv(DAY).split('\r\n')[1]).toContain('INV-2026-0001');
    expect(work.invoiceHtml('missing')).toBe('');
  });

  it('week and month follow the settings', () => {
    work.updateSettings({ weekStartsOn: 0 });
    expect(work.week('2026-10-21')).toEqual({ from: '2026-10-18', to: '2026-10-24' });
    expect(work.month('2026-10-21')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(work.summary(work.week('2026-10-21')).byDay).toHaveLength(7);
  });
});
