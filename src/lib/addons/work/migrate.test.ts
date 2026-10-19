import { describe, expect, it } from 'vitest';
import { emptyWorkData, migrateWork, normalizeRate, reconcileInvoicedKeys } from './migrate';
import type { WorkData } from './types';

function expectValid(d: WorkData) {
  expect(d.version).toBe(1);
  expect(Array.isArray(d.clients)).toBe(true);
  expect(Array.isArray(d.projects)).toBe(true);
  expect(Array.isArray(d.invoices)).toBe(true);
  expect(typeof d.assignments).toBe('object');
  expect(typeof d.invoicedKeys).toBe('object');
  expect(typeof d.settings.billPlanned).toBe('boolean');
  expect(d.settings.currency).toMatch(/^[A-Z]{3}$/);
  expect(d.profile.currency).toBe(d.settings.currency);
  expect(Number.isInteger(d.settings.weekStartsOn)).toBe(true);
  expect(Number.isInteger(d.profile.paymentTerms)).toBe(true);
  for (const c of d.clients) {
    expect(typeof c.id).toBe('string');
    expect(typeof c.name).toBe('string');
    expect(c.currency).toMatch(/^[A-Z]{3}$/);
  }
  for (const p of d.projects) {
    expect(typeof p.id).toBe('string');
    expect(['hourly', 'fixed', 'none']).toContain(p.rate.kind);
    expect(Number.isFinite(p.createdAt)).toBe(true);
  }
  for (const i of d.invoices) {
    expect(['draft', 'sent', 'paid']).toContain(i.status);
    expect(i.issueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const l of i.lines) {
      expect(Number.isInteger(l.amount)).toBe(true);
      expect(Array.isArray(l.sourceKeys)).toBe(true);
    }
  }
  // JSON round trip is stable: a second migrate changes nothing.
  expect(migrateWork(JSON.parse(JSON.stringify(d)))).toEqual(d);
}

describe('migrate copes with garbage', () => {
  const garbage: unknown[] = [
    undefined,
    null,
    0,
    42,
    NaN,
    'garbage',
    '{"clients":[]}',
    true,
    [],
    [1, 2, 3],
    {},
    { version: 99 },
    { clients: 'nope', projects: {}, invoices: 7, assignments: [], invoicedKeys: 'x', settings: 'x', profile: [] },
    {
      clients: [null, 1, 'x', [], { id: 5, name: 6, currency: 'euro', defaultRate: { kind: 'hourly', amount: 'lots' }, taxPct: 900 }],
      projects: [null, { name: 'P' }, { id: 'p', rate: 'cheap', color: 'url(javascript:x)', budget: { kind: 'hours', amount: -3 }, createdAt: 'yesterday' }],
      assignments: { a: null, b: 'p', c: { projectId: 7 }, d: { projectId: 'p', billable: 'yes', rate: { kind: 'weird' } } },
      invoices: [null, {}, { id: 'i', lines: [null, { quantity: 'x', unitPrice: {}, sourceKeys: [1, null, 'k', 'k'] }], status: 'lost', issueDate: '2026-02-30', taxPct: -1, discount: { kind: 'percent', pct: 'x' } }],
      invoicedKeys: { k: 5, z: 'missing-invoice' },
      settings: { billPlanned: 'yes', currency: 12, weekStartsOn: 9 },
      profile: { name: {}, paymentTerms: -4, invoicePrefix: 99, logoDataUrl: 'javascript:alert(1)' },
    },
  ];

  for (const g of garbage) {
    it(`→ valid data for ${JSON.stringify(g) ?? String(g)}`.slice(0, 100), () => expectValid(migrateWork(g)));
  }

  it('nothing at all gives the defaults', () => {
    expect(migrateWork(undefined)).toEqual(emptyWorkData());
  });
});

describe('migrate repairs what it can', () => {
  const d = migrateWork({
    settings: { billPlanned: false, weekStartsOn: 0 },
    profile: { currency: 'gbp', paymentTerms: 1000, invoicePrefix: '  ACME  ', logoDataUrl: 'data:image/png;base64,iVBORw0KGgo=' },
    clients: [
      { id: 'c1', name: 'Acme', currency: 'eur', taxPct: 19, defaultRate: { kind: 'hourly', amount: 4999.6 } },
      { id: 'c1', name: 'Duplicate' },
      { id: 'c2', name: 'No currency' },
    ],
    projects: [
      { id: 'p1', name: 'One', clientId: 'c1', color: 'care', rate: { kind: 'fixed', amount: -10 }, budget: { kind: 'money', amount: 1234.4 } },
      { id: 'p2', name: 'Two', clientId: 'gone', color: '#AABBCC', rate: { kind: 'hourly', amount: '7500' } },
    ],
    assignments: {
      t1: { projectId: 'p1', billable: false },
      't2:2026-10-19': { projectId: 'p2' },
      t3: { projectId: 'nope', billable: true },
    },
    invoices: [{ id: 'inv', number: 'INV-2026-0001', clientId: 'c1', status: 'paid', issueDate: '2026-10-01', lines: [{ description: 'x', quantity: 2, unitPrice: 150, sourceKeys: ['k1'] }] }],
    invoicedKeys: { stale: 'deleted-invoice' },
  });

  it('settings and profile', () => {
    expect(d.settings).toEqual({ billPlanned: false, currency: 'GBP', weekStartsOn: 0 });
    expect(d.profile).toMatchObject({ currency: 'GBP', paymentTerms: 365, invoicePrefix: 'ACME', logoDataUrl: 'data:image/png;base64,iVBORw0KGgo=' });
  });

  it('clients', () => {
    expect(d.clients.map((c) => [c.id, c.name, c.currency])).toEqual([
      ['c1', 'Acme', 'EUR'],
      ['c2', 'No currency', 'GBP'],
    ]);
    expect(d.clients[0].defaultRate).toEqual({ kind: 'hourly', amount: 5000 });
    expect(d.clients[0].taxPct).toBe(19);
  });

  it('projects', () => {
    expect(d.projects[0]).toMatchObject({ color: 'care', rate: { kind: 'fixed', amount: 0 }, budget: { kind: 'money', amount: 1234 }, clientId: 'c1' });
    expect(d.projects[1]).toMatchObject({ color: '#AABBCC', rate: { kind: 'hourly', amount: 7500 } });
    expect(d.projects[1].clientId).toBeUndefined();
  });

  it('assignments: short occurrence keys become block keys, unknown projects drop', () => {
    expect(d.assignments).toEqual({
      t1: { projectId: 'p1', billable: false },
      'task:t2@2026-10-19': { projectId: 'p2', billable: true },
    });
  });

  it('invoices and the invoiced-key ledger agree', () => {
    expect(d.invoices[0]).toMatchObject({ status: 'paid', paidAt: '2026-10-01', currency: 'GBP', dueDate: '2026-10-01', from: '2026-10-01', to: '2026-10-01' });
    expect(d.invoices[0].lines[0]).toMatchObject({ unit: 'item', amount: 300 });
    expect(d.invoicedKeys).toEqual({ k1: 'inv' });
  });

  it('rates', () => {
    expect(normalizeRate({ kind: 'hourly', amount: 12.4 })).toEqual({ kind: 'hourly', amount: 12 });
    expect(normalizeRate({ kind: 'fixed' })).toEqual({ kind: 'none' });
    expect(normalizeRate('hourly')).toEqual({ kind: 'none' });
  });

  it('a key claimed by two invoices stays with the earlier one', () => {
    const line = { description: '', quantity: 1, unit: 'item' as const, unitPrice: 1, amount: 1, sourceKeys: ['k'] };
    const mk = (id: string, createdAt: number) => ({ id, number: id, clientId: 'c', currency: 'USD', issueDate: '2026-10-01', dueDate: '2026-10-01', from: '2026-10-01', to: '2026-10-01', lines: [line], taxPct: 0, status: 'draft' as const, createdAt, updatedAt: createdAt });
    expect(reconcileInvoicedKeys([mk('late', 2), mk('early', 1)], {})).toEqual({ k: 'early' });
    // An explicit claim recorded in the ledger is kept.
    expect(reconcileInvoicedKeys([mk('late', 2), mk('early', 1)], { k: 'late' })).toEqual({ k: 'late' });
  });
});
