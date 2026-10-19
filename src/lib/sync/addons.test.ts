import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS as TRACKER_DEFAULTS } from '../addons/tracker/migrate';
import type { AppTime, Entry, TrackerFile, TrackerSettings } from '../addons/tracker/types';
import type { Client, Invoice, Project, WorkData } from '../addons/work/types';
import { mergeTrackerFiles, mergeWorkFiles, parseTrackerFile, parseWorkFile, trackerUnused, workUnused } from './addons';

const M = 60_000;
/** 09:00 UTC on Monday 19 October 2026. */
const T0 = Date.UTC(2026, 9, 19, 9);
const at = (min: number) => T0 + min * M;

// ---------------------------------------------------------------------------
// Time Tracker

function entry(id: string, startMin: number, endMin: number | null, p: Partial<Entry> = {}): Entry {
  return { id, startMs: at(startMin), endMs: endMin === null ? null : at(endMin), source: 'tracker', ...p };
}

function tf(entries: Entry[], settings: Partial<TrackerSettings> = {}): TrackerFile {
  return parseTrackerFile({ version: 1, entries, settings: { ...TRACKER_DEFAULTS, ...settings } });
}

/** A file as it stands, without the one-running repair the parse would apply. */
const raw = (entries: Entry[]): TrackerFile => ({ version: 1, entries, settings: { ...TRACKER_DEFAULTS } });

const ids = (f: { entries: Entry[] }) => f.entries.map((e) => e.id);
const get = (f: TrackerFile, id: string) => f.entries.find((e) => e.id === id)!;
const running = (f: TrackerFile) => f.entries.filter((e) => e.endMs === null).map((e) => e.id);
const app = (name: string, min: number, title?: string): AppTime => (title ? { app: name, ms: min * M, title } : { app: name, ms: min * M });

describe('mergeTrackerFiles', () => {
  const e1 = entry('e1', 0, 30);
  const e2 = entry('e2', 40, 50);

  it('keeps entries added on either side, in start order', () => {
    const base = tf([e1]);
    const m = mergeTrackerFiles(base, tf([e1, entry('mine', 60, 90)]), tf([e1, entry('theirs', 35, 38)]));
    expect(ids(m)).toEqual(['e1', 'theirs', 'mine']);
  });

  it('deletes an entry removed on one side and untouched on the other, from either side', () => {
    const base = tf([e1, e2]);
    expect(ids(mergeTrackerFiles(base, tf([e1]), tf([e1, e2])))).toEqual(['e1']);
    expect(ids(mergeTrackerFiles(base, tf([e1, e2]), tf([e1])))).toEqual(['e1']);
  });

  it('keeps an entry edited on one side and deleted on the other', () => {
    const base = tf([e1, e2]);
    const edited = { ...e2, note: 'Client call' };
    expect(get(mergeTrackerFiles(base, tf([e1, edited]), tf([e1])), 'e2').note).toBe('Client call');
    expect(get(mergeTrackerFiles(base, tf([e1]), tf([e1, edited])), 'e2').note).toBe('Client call');
  });

  it('takes a change made on one side only, such as a stop on the other computer', () => {
    const base = tf([entry('r', 0, null)]);
    const m = mergeTrackerFiles(base, base, tf([entry('r', 0, 45)]));
    expect(get(m, 'r').endMs).toBe(at(45));
    expect(running(m)).toEqual([]);
  });

  it('both changed: the later end wins, a running entry counts as latest, a tie keeps local', () => {
    const base = tf([entry('x', 0, 30)]);
    const later = mergeTrackerFiles(base, tf([entry('x', 0, 45, { note: 'local' })]), tf([entry('x', 0, 40, { note: 'remote' })]));
    expect(get(later, 'x')).toMatchObject({ endMs: at(45), note: 'local' });
    const remoteLater = mergeTrackerFiles(base, tf([entry('x', 0, 45, { note: 'local' })]), tf([entry('x', 0, 50, { note: 'remote' })]));
    expect(get(remoteLater, 'x')).toMatchObject({ endMs: at(50), note: 'remote' });
    const tie = mergeTrackerFiles(base, tf([entry('x', 0, 30, { note: 'local' })]), tf([entry('x', 0, 30, { note: 'remote' })]));
    expect(get(tie, 'x').note).toBe('local');

    // Still running here (a note added), stopped there with a note of its own: running wins.
    const runBase = tf([entry('r', 0, null)]);
    const m = mergeTrackerFiles(runBase, tf([entry('r', 0, null, { note: 'local' })]), tf([entry('r', 0, 40, { note: 'remote' })]));
    expect(get(m, 'r')).toMatchObject({ endMs: null, note: 'local' });
    const flipped = mergeTrackerFiles(runBase, tf([entry('r', 0, 40, { note: 'local' })]), tf([entry('r', 0, null, { note: 'remote' })]));
    expect(get(flipped, 'r')).toMatchObject({ endMs: null, note: 'remote' });
  });

  it('merges app time per app by the larger time, keeping the title that goes with it', () => {
    const base = tf([entry('x', 0, 60, { activity: [app('Code', 10)] })]);
    const local = tf([entry('x', 0, 60, { note: 'local', activity: [app('Code', 20, 'new.ts'), app('Mail', 5)] })]);
    const remote = tf([entry('x', 0, 70, { activity: [app('Code', 15, 'old.ts'), app('Browser', 8)] })]);
    const m = get(mergeTrackerFiles(base, local, remote), 'x');
    expect(m.endMs).toBe(at(70)); // remote ends later
    expect(m.note).toBeUndefined();
    expect(m.activity).toEqual([app('Code', 20, 'new.ts'), app('Browser', 8), app('Mail', 5)]);
  });

  it('keeps only the latest-started entry running: two computers tracking become a switch', () => {
    const base = tf([e1]);
    const here = tf([e1, entry('a', 60, null, { taskId: 'write' })]);
    const there = tf([e1, entry('b', 90, null, { taskId: 'call' })]);
    for (const m of [mergeTrackerFiles(base, here, there), mergeTrackerFiles(base, there, here)]) {
      expect(ids(m)).toEqual(['e1', 'a', 'b']);
      expect(get(m, 'a').endMs).toBe(at(90));
      expect(running(m)).toEqual(['b']);
    }
  });

  it('closes every older running entry at the start of the next running one', () => {
    // Three computers' worth of running entries, as a hand-edited or garbled file could hold.
    const m = mergeTrackerFiles(null, raw([entry('a', 0, null), entry('c', 120, null)]), raw([entry('b', 60, null), entry('done', 10, 20)]));
    expect(m.entries.map((e) => [e.id, e.endMs])).toEqual([
      ['a', at(60)],
      ['done', at(20)],
      ['b', at(120)],
      ['c', null],
    ]);
  });

  it('drops a running entry that started at the very same instant as the one kept', () => {
    const m = mergeTrackerFiles(tf([]), tf([entry('a', 60, null)]), tf([entry('b', 60, null)]));
    expect(ids(m)).toEqual(['b']);
    expect(running(m)).toEqual(['b']);
  });

  it('merges settings per field: the changed side wins, both changed keeps local', () => {
    const base = tf([]);
    const local = tf([], { roundTo: 15, idleMinutes: 10 });
    const remote = tf([], { idleMinutes: 20, followFocus: false });
    expect(mergeTrackerFiles(base, local, remote).settings).toEqual({ ...TRACKER_DEFAULTS, roundTo: 15, idleMinutes: 10, followFocus: false });
  });

  it('with no base, a setting still at its default gives way to the other side’s choice', () => {
    const fresh = tf([]);
    const used = tf([], { roundTo: 15, dailyGoalMinutes: 360 });
    expect(mergeTrackerFiles(null, fresh, used).settings).toEqual(used.settings);
    expect(mergeTrackerFiles(null, used, fresh).settings).toEqual(used.settings);
    // Both moved away from the default: this computer's.
    expect(mergeTrackerFiles(null, tf([], { roundTo: 5 }), used).settings).toEqual({ ...used.settings, roundTo: 5 });
  });

  it('unions both sides on a first sync (no base)', () => {
    const local = tf([entry('mine', 0, 10), entry('both', 20, 30, { note: 'local' })]);
    const remote = tf([entry('theirs', 12, 18), entry('both', 20, 35)]);
    const m = mergeTrackerFiles(null, local, remote);
    expect(ids(m)).toEqual(['mine', 'theirs', 'both']);
    expect(get(m, 'both').endMs).toBe(at(35));
  });

  it('is deterministic, idempotent and converges on both computers', () => {
    const base = tf([e1, e2, entry('r', 100, null)], { roundTo: 5 });
    const local = tf([{ ...e1, note: 'edited' }, entry('r', 100, null, { activity: [app('Code', 3)] }), entry('l', 200, null)], { roundTo: 6 });
    const remote = tf([e1, e2, entry('r', 100, 150), entry('q', 160, 170)], { dailyGoalMinutes: 300 });
    const m = mergeTrackerFiles(base, local, remote);
    expect(mergeTrackerFiles(base, local, remote)).toEqual(m);
    expect(mergeTrackerFiles(m, m, m)).toEqual(m);
    expect(mergeTrackerFiles(base, local, local)).toEqual(local);
    expect(mergeTrackerFiles(null, m, m)).toEqual(m);
    // The other computer, whose last sync was `remote`, lands on the same file.
    expect(mergeTrackerFiles(remote, remote, m)).toEqual(m);
    expect(running(m)).toEqual(['l']);
    expect(get(m, 'r').endMs).toBe(at(200));
  });

  it('does not alias its inputs', () => {
    const local = tf([entry('a', 0, null)]);
    const remote = tf([entry('b', 60, null)]);
    mergeTrackerFiles(null, local, remote);
    expect(local.entries[0].endMs).toBeNull();
  });
});

describe('parseTrackerFile', () => {
  it('normalises a garbled or future file through the addon migrate', () => {
    const f = parseTrackerFile({
      version: 7,
      entries: [entry('ok', 0, 30), null, 'junk', { id: 'bad', startMs: 'soon' }, { id: 'back', startMs: at(50), endMs: at(40) }, entry('r1', 60, null), entry('r2', 90, null)],
      settings: { roundTo: 7, idleMinutes: -3, trackApps: 'yes', future: true },
    });
    expect(f.entries.map((e) => [e.id, e.endMs])).toEqual([
      ['ok', at(30)],
      ['r1', at(90)],
      ['r2', null],
    ]);
    expect(f.settings).toEqual({ ...TRACKER_DEFAULTS, idleMinutes: 1 });
    expect(parseTrackerFile(f)).toEqual(f);
  });

  it('knows an unused tracker', () => {
    expect(trackerUnused(parseTrackerFile(null))).toBe(true);
    expect(trackerUnused(tf([entry('a', 0, 1)]))).toBe(false);
    expect(trackerUnused(tf([], { roundTo: 15 }))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Work

const client = (id: string, p: Partial<Client> = {}): Client => ({ id, name: id, currency: 'USD', ...p });
const project = (id: string, p: Partial<Project> = {}): Project => ({ id, name: id, color: 'focus', rate: { kind: 'hourly', amount: 10_000 }, createdAt: 1, ...p });

function invoice(id: string, number: string, createdAt: number, keys: string[] = [], p: Partial<Invoice> = {}): Invoice {
  return {
    id,
    number,
    clientId: 'c1',
    currency: 'USD',
    issueDate: '2026-10-19',
    dueDate: '2026-11-02',
    from: '2026-10-01',
    to: '2026-10-31',
    lines: [{ description: 'Work', quantity: 1, unit: 'hour', unitPrice: 10_000, amount: 10_000, sourceKeys: keys }],
    taxPct: 0,
    status: 'draft',
    createdAt,
    updatedAt: createdAt,
    ...p,
  };
}

const wd = (p: Partial<WorkData> = {}): WorkData => parseWorkFile({ clients: [client('c1')], ...p });
const idsOf = (list: { id: string }[]) => list.map((x) => x.id);
const numbers = (d: WorkData) => Object.fromEntries(d.invoices.map((i) => [i.id, i.number]));

describe('mergeWorkFiles', () => {
  it('clients and projects: added on either side, deleted if untouched on the other, kept if edited', () => {
    const base = wd({ clients: [client('c1'), client('c2')], projects: [project('p1', { clientId: 'c1' }), project('p2')] });
    const local = wd({
      clients: [client('c1'), client('c2'), client('c3')],
      projects: [project('p1', { clientId: 'c1' }), project('p2', { name: 'Renamed here' })],
    });
    const remote = wd({ clients: [client('c1')], projects: [project('p1', { clientId: 'c1' }), project('p3')] });
    const m = mergeWorkFiles(base, local, remote);
    expect(idsOf(m.clients)).toEqual(['c1', 'c3']); // c2 deleted there, untouched here
    expect(idsOf(m.projects)).toEqual(['p1', 'p3', 'p2']); // p2 deleted there but edited here
    expect(m.projects[2].name).toBe('Renamed here');
    // The same from the other side.
    expect(idsOf(mergeWorkFiles(base, remote, local).clients).sort()).toEqual(['c1', 'c3']);
  });

  it('both changed a client: local fields win, fields only the other side changed come along', () => {
    const c = client('c1', { name: 'Acme', email: 'a@acme.test', taxPct: 5 });
    const base = wd({ clients: [c] });
    const local = wd({ clients: [{ ...c, name: 'Acme Ltd', notes: 'Net 30' }] });
    const remote = wd({ clients: [{ ...c, name: 'ACME', email: 'billing@acme.test', address: '1 Road', taxPct: undefined }] });
    expect(mergeWorkFiles(base, local, remote).clients[0]).toEqual({
      id: 'c1',
      name: 'Acme Ltd',
      currency: 'USD',
      email: 'billing@acme.test',
      address: '1 Road',
      notes: 'Net 30',
    });
  });

  it('both changed a project: a rate or budget is taken whole, never stitched from both', () => {
    const p = project('p1', { rate: { kind: 'hourly', amount: 10_000 }, budget: { kind: 'hours', amount: 10 } });
    const base = wd({ projects: [p] });
    const local = wd({ projects: [{ ...p, rate: { kind: 'fixed', amount: 10_000 } }] });
    const remote = wd({ projects: [{ ...p, name: 'Site', rate: { kind: 'hourly', amount: 12_000 }, budget: undefined }] });
    const m = mergeWorkFiles(base, local, remote).projects[0];
    expect(m.rate).toEqual({ kind: 'fixed', amount: 10_000 });
    expect(m.name).toBe('Site');
    expect(m.budget).toBeUndefined();
  });

  it('both changed an invoice: the newer updatedAt wins, a tie keeps local', () => {
    const inv = invoice('i1', 'INV-2026-0001', 100, ['k1']);
    const base = wd({ invoices: [inv] });
    const sent = { ...inv, status: 'sent' as const, updatedAt: 200 };
    const noted = { ...inv, notes: 'Thanks!', updatedAt: 300 };
    expect(mergeWorkFiles(base, wd({ invoices: [sent] }), wd({ invoices: [noted] })).invoices[0]).toEqual(noted);
    expect(mergeWorkFiles(base, wd({ invoices: [noted] }), wd({ invoices: [sent] })).invoices[0]).toEqual(noted);
    const tie = mergeWorkFiles(base, wd({ invoices: [sent] }), wd({ invoices: [{ ...noted, updatedAt: 200 }] }));
    expect(tie.invoices[0]).toEqual(sent);
  });

  it('an invoice deleted on one side: gone (work freed) if untouched there, kept (work claimed) if edited', () => {
    const inv = invoice('i1', 'INV-2026-0001', 100, ['k1']);
    const base = wd({ invoices: [inv] });
    const deleted = wd({ invoices: [] });
    const gone = mergeWorkFiles(base, deleted, base);
    expect(gone.invoices).toEqual([]);
    expect(gone.invoicedKeys).toEqual({});

    const paid = wd({ invoices: [{ ...inv, status: 'paid', paidAt: '2026-10-25', updatedAt: 400 }] });
    for (const m of [mergeWorkFiles(base, deleted, paid), mergeWorkFiles(base, paid, deleted)]) {
      expect(m.invoices.map((i) => i.status)).toEqual(['paid']);
      expect(m.invoicedKeys).toEqual({ k1: 'i1' });
    }
  });

  it('rebuilds invoicedKeys from the merged invoices, never from either side’s ledger', () => {
    const i1 = invoice('i1', 'INV-2026-0001', 100, ['k1']);
    const base = wd({ invoices: [i1] });
    const local: WorkData = { ...wd({ invoices: [i1, invoice('i2', 'INV-2026-0002', 200, ['k2', 'twice'])] }), invoicedKeys: { k1: 'i1', ghost: 'i9' } };
    const remote: WorkData = { ...wd({ invoices: [i1, invoice('i3', 'INV-2026-0003', 150, ['k3', 'twice'])] }), invoicedKeys: { k1: 'i3', k3: 'i1' } };
    const m = mergeWorkFiles(base, local, remote);
    expect(idsOf(m.invoices)).toEqual(['i1', 'i3', 'i2']);
    // Every billed key is in the ledger once; work both computers billed stays with the older invoice.
    expect(m.invoicedKeys).toEqual({ k1: 'i1', k2: 'i2', k3: 'i3', twice: 'i3' });
  });

  it('renumbers a clashing invoice number: the older keeps it, the newer takes the next free one', () => {
    const base = wd({ invoices: [invoice('i1', 'INV-2026-0001', 10), invoice('i2', 'INV-2026-0002', 20)] });
    const here = wd({ invoices: [...base.invoices, invoice('a', 'INV-2026-0003', 300)] });
    const there = wd({ invoices: [...base.invoices, invoice('b', 'INV-2026-0003', 400), invoice('c', 'INV-2026-0004', 410)] });
    const expected = { i1: 'INV-2026-0001', i2: 'INV-2026-0002', a: 'INV-2026-0003', b: 'INV-2026-0005', c: 'INV-2026-0004' };
    expect(numbers(mergeWorkFiles(base, here, there))).toEqual(expected);
    expect(numbers(mergeWorkFiles(base, there, here))).toEqual(expected);
    const m = mergeWorkFiles(base, here, there);
    expect(mergeWorkFiles(m, m, m)).toEqual(m);
  });

  it('renumbering keeps the clashing number’s prefix and year, or falls back to the profile', () => {
    const local = wd({ invoices: [invoice('x', 'ACME-2025-0007', 1, [], { issueDate: '2026-01-02', dueDate: '2026-01-02', from: '2026-01-01', to: '2026-01-01' })] });
    const remote = wd({ invoices: [invoice('y', 'ACME-2025-0007', 2, [], { issueDate: '2026-01-03', dueDate: '2026-01-03', from: '2026-01-01', to: '2026-01-01' })] });
    expect(numbers(mergeWorkFiles(null, local, remote))).toEqual({ y: 'ACME-2025-0008', x: 'ACME-2025-0007' });

    const typed = { profile: { ...wd().profile, invoicePrefix: 'BILL' } };
    const h = wd({ ...typed, invoices: [invoice('h', 'Deposit', 5)] });
    const t = wd({ ...typed, invoices: [invoice('t', 'Deposit', 6)] });
    expect(numbers(mergeWorkFiles(null, h, t))).toEqual({ t: 'BILL-2026-0001', h: 'Deposit' });
  });

  it('merges assignments key by key', () => {
    const projects = [project('p1'), project('p2')];
    const base = wd({ projects, assignments: { t1: { projectId: 'p1', billable: true }, t2: { projectId: 'p1', billable: true }, t5: { projectId: 'p1', billable: true } } });
    const local = wd({
      projects,
      assignments: {
        t1: { projectId: 'p2', billable: true }, // changed here
        t2: { projectId: 'p1', billable: true },
        t3: { projectId: 'p1', billable: true }, // added here
        t5: { projectId: 'p2', billable: true }, // changed on both
      },
    });
    const remote = wd({
      projects,
      assignments: {
        t1: { projectId: 'p1', billable: true },
        // t2 removed there
        't4@x': { projectId: 'p2', billable: false }, // added there
        t5: { projectId: 'p1', billable: false },
      },
    });
    expect(mergeWorkFiles(base, local, remote).assignments).toEqual({
      t1: { projectId: 'p2', billable: true },
      t3: { projectId: 'p1', billable: true },
      't4@x': { projectId: 'p2', billable: false },
      t5: { projectId: 'p2', billable: true },
    });
  });

  it('drops what points at a record the other side removed', () => {
    const base = wd({ clients: [client('c1'), client('c2')], projects: [project('p1'), project('p2', { clientId: 'c2' })] });
    const local = wd({ ...base, assignments: { t9: { projectId: 'p1', billable: true }, t8: { projectId: 'p2', billable: true } } });
    const remote = wd({ clients: [client('c1')], projects: [project('p2')], assignments: {} });
    // p1 and c2 were removed there, untouched here: t9 has no project left, p2 no client.
    const m = mergeWorkFiles(base, local, remote);
    expect(m.assignments).toEqual({ t8: { projectId: 'p2', billable: true } });
    expect(m.projects).toEqual([project('p2')]);
  });

  it('merges the profile and settings per field, keeping both currency fields together', () => {
    const base = wd();
    const local = wd({ profile: { ...base.profile, name: 'Studio', paymentTerms: 30 }, settings: { ...base.settings, billPlanned: false } });
    const remote = wd({
      profile: { ...base.profile, email: 'me@studio.test', paymentTerms: 7, invoicePrefix: 'BILL', currency: 'EUR' },
      settings: { ...base.settings, weekStartsOn: 0, currency: 'EUR' },
    });
    const m = mergeWorkFiles(base, local, remote);
    expect(m.profile).toEqual({ ...base.profile, name: 'Studio', email: 'me@studio.test', paymentTerms: 30, invoicePrefix: 'BILL', currency: 'EUR' });
    expect(m.settings).toEqual({ billPlanned: false, weekStartsOn: 0, currency: 'EUR' });
  });

  it('with no base, a profile or setting still at its default gives way to the other side’s', () => {
    const fresh = wd();
    const used = wd({
      profile: { ...fresh.profile, name: 'Studio', invoicePrefix: 'BILL', currency: 'EUR' },
      settings: { ...fresh.settings, currency: 'EUR', weekStartsOn: 0 },
    });
    for (const m of [mergeWorkFiles(null, fresh, used), mergeWorkFiles(null, used, fresh)]) {
      expect(m.profile).toEqual(used.profile);
      expect(m.settings).toEqual(used.settings);
    }
  });

  it('combines both sides on a first sync (no base)', () => {
    const local = wd({ clients: [client('c1', { email: 'mine@acme.test' })], projects: [project('mine')] });
    const remote = wd({ clients: [client('c1', { address: 'Theirs' }), client('c9')], projects: [project('theirs')] });
    const m = mergeWorkFiles(null, local, remote);
    expect(m.clients).toEqual([client('c1', { email: 'mine@acme.test', address: 'Theirs' }), client('c9')]);
    expect(idsOf(m.projects)).toEqual(['theirs', 'mine']);
  });

  it('is deterministic, idempotent and converges on both computers', () => {
    const base = wd({ projects: [project('p1')], invoices: [invoice('i1', 'INV-2026-0001', 10, ['k1'])], assignments: { t1: { projectId: 'p1', billable: true } } });
    const local = wd({
      ...base,
      clients: [client('c1', { name: 'Here' })],
      invoices: [...base.invoices, invoice('a', 'INV-2026-0002', 50, ['k2'])],
    });
    const remote = wd({
      ...base,
      projects: [project('p1'), project('p2')],
      invoices: [{ ...base.invoices[0], status: 'sent', updatedAt: 40 }, invoice('b', 'INV-2026-0002', 60, ['k3'])],
      assignments: {},
    });
    const m = mergeWorkFiles(base, local, remote);
    expect(mergeWorkFiles(base, local, remote)).toEqual(m);
    expect(mergeWorkFiles(m, m, m)).toEqual(m);
    expect(mergeWorkFiles(base, local, local)).toEqual(local);
    expect(mergeWorkFiles(null, m, m)).toEqual(m);
    expect(mergeWorkFiles(remote, remote, m)).toEqual(m);
    expect(numbers(m)).toEqual({ i1: 'INV-2026-0001', a: 'INV-2026-0002', b: 'INV-2026-0003' });
    expect(m.invoicedKeys).toEqual({ k1: 'i1', k2: 'a', k3: 'b' });
  });
});

describe('parseWorkFile', () => {
  it('normalises a garbled or future file through the addon migrate', () => {
    const d = parseWorkFile({
      version: 3,
      clients: [{ id: 'c1', name: 'Acme', currency: 'eur', taxPct: 250 }, null, 'junk'],
      projects: 'nope',
      assignments: { t1: { projectId: 'missing' } },
      invoices: [{ id: 'i1', number: 'INV-2026-0001', clientId: 'c1', issueDate: '2026-10-19', createdAt: 1, updatedAt: 1, lines: [{ description: 'x', quantity: 1, unitPrice: 5, sourceKeys: ['k', 5, ''] }], status: 'lost' }],
      invoicedKeys: { bogus: 'nobody' },
      settings: { weekStartsOn: 42 },
      futureField: { anything: true },
    });
    expect(d.clients).toEqual([{ id: 'c1', name: 'Acme', currency: 'EUR', taxPct: 100 }]);
    expect(d.projects).toEqual([]);
    expect(d.assignments).toEqual({});
    expect(d.invoices[0]).toMatchObject({ id: 'i1', status: 'draft', lines: [{ sourceKeys: ['k'], amount: 5 }] });
    expect(d.invoicedKeys).toEqual({ k: 'i1' });
    expect(d.settings.weekStartsOn).toBe(1);
    expect(d).not.toHaveProperty('futureField');
    expect(parseWorkFile(d)).toEqual(d);
  });

  it('knows an unused Work addon', () => {
    expect(workUnused(parseWorkFile(undefined))).toBe(true);
    expect(workUnused(wd())).toBe(false);
    expect(workUnused(parseWorkFile({ settings: { billPlanned: false } }))).toBe(false);
  });
});

describe('tracker device-only settings', () => {
  it('app and title tracking never come from another computer', async () => {
    const { mergeTrackerFiles } = await import('./addons');
    const { migrateTrackerFile } = await import('../addons/tracker/migrate');
    const base = migrateTrackerFile(null);
    const local = migrateTrackerFile({ ...base, settings: { ...base.settings, trackApps: false, trackTitles: false, idleMinutes: 5 } });
    const remote = migrateTrackerFile({ ...base, settings: { ...base.settings, trackApps: true, trackTitles: true, idleMinutes: 10 } });
    const merged = mergeTrackerFiles(base, local, remote);
    expect(merged.settings.trackApps).toBe(false);
    expect(merged.settings.trackTitles).toBe(false);
    expect(merged.settings.idleMinutes).toBe(10);
  });
});
