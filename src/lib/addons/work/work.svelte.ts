// The Work addon store: clients, projects, assignments, invoices, settings and the
// business profile, persisted as 'addon-work'. All the maths lives in the plain .ts
// modules next to this file; this module only holds state and wires it together.

import { clock } from '../../stores/clock.svelte';
import { taskFile } from '../../stores/tasks.svelte';
import { todayISO } from '../../engine/time';
import type { CalendarEvent, ISODate } from '../../engine/types';
import { monthRange, summary as summarize, weekRange, type SummaryOptions, type WorkSummary } from './analytics';
import { resolveKey, workItems, type WorkItemsOptions } from './earnings';
import { invoiceCsv as toInvoiceCsv, invoiceHtml as toInvoiceHtml, itemsCsv as toItemsCsv, type InvoiceHtmlOptions } from './export';
import {
  claimKeys,
  draftInvoice as draft,
  invoiceTotals,
  nextInvoiceNumber,
  releaseKeys,
  yearOf,
  type DraftInvoiceOptions,
  type InvoiceTotals,
} from './invoices';
import { normalizeKey } from './keys';
import {
  emptyWorkData,
  migrateWork,
  normalizeAssignment,
  normalizeClient,
  normalizeInvoice,
  normalizeProfile,
  normalizeProject,
  normalizeSettings,
  WORK_STORE_KEY,
  workId,
} from './migrate';
import { normalizeCurrency } from './money';
import { persisted } from '../../stores/persisted.svelte';
import type {
  Assignment,
  BusinessProfile,
  Client,
  DateRange,
  Invoice,
  InvoiceStatus,
  Project,
  Rate,
  RateResolution,
  Resolved,
  TrackedEntry,
  WorkContext,
  WorkData,
  WorkItem,
  WorkSettings,
} from './types';

export const workFile = persisted<WorkData>(WORK_STORE_KEY, emptyWorkData(), migrateWork);

let loading: Promise<void> | null = null;
/** Load once; later calls return the same promise. */
export function loadWork(): Promise<void> {
  return (loading ??= workFile.load());
}
// Load on first import (like progress.svelte.ts), so the shell needs no change.
if (typeof window !== 'undefined') loadWork();

/** Where tracked time and calendar events come from (the Time Tracker addon, the calendar bridge). */
export interface WorkSources {
  entries?: () => TrackedEntry[];
  events?: () => CalendarEvent[];
}

let sources = $state.raw<WorkSources>({});

export type SaveInvoiceResult = { ok: true; invoice: Invoice } | { ok: false; conflicts: string[] };

const d = () => workFile.value;
const findClient = (id: string) => d().clients.find((c) => c.id === id);
const findProject = (id: string) => d().projects.find((p) => p.id === id);
const findInvoice = (id: string) => d().invoices.find((i) => i.id === id);

/** The pure-engine context for the live state. */
function context(): WorkContext {
  const s = sources;
  return {
    tasks: taskFile.value.tasks,
    data: d(),
    entries: s.entries?.() ?? [],
    events: s.events?.() ?? [],
    // The app clock (honours the dev time preview), at minute steps so open panels
    // recompute once a minute rather than every second.
    now: clock.minute,
  };
}

/** Write an assignment, or delete it with null. */
function put(key: string, a: Assignment | null) {
  const k = normalizeKey(key);
  if (!a) {
    delete d().assignments[k];
    return;
  }
  const clean = normalizeAssignment(a);
  if (clean && findProject(clean.projectId)) d().assignments[k] = clean;
}

/** Store a (re)claimed invoice; fails without changes when its work is on another invoice. */
function store(inv: Invoice): SaveInvoiceResult {
  const clean = normalizeInvoice(inv, d().settings.currency);
  if (!clean) return { ok: false, conflicts: [] };
  const others = d().invoices.filter((i) => i.id !== clean.id);
  if (!clean.number || others.some((i) => i.number === clean.number)) {
    clean.number = nextInvoiceNumber(others, yearOf(clean.issueDate), d().profile.invoicePrefix);
  }
  const claim = claimKeys(d().invoicedKeys, clean);
  if (!claim.ok) return claim;
  clean.updatedAt = Date.now();
  const at = d().invoices.findIndex((i) => i.id === clean.id);
  if (at >= 0) d().invoices[at] = clean;
  else d().invoices.push(clean);
  d().invoicedKeys = claim.invoicedKeys;
  return { ok: true, invoice: clean };
}

export const work = {
  get ready(): boolean {
    return workFile.ready;
  },
  load: loadWork,
  get data(): WorkData {
    return d();
  },

  // --- settings and profile -----------------------------------------------

  get settings(): WorkSettings {
    return d().settings;
  },
  updateSettings(patch: Partial<WorkSettings>) {
    const currency = normalizeCurrency(patch.currency) ?? d().settings.currency;
    d().settings = normalizeSettings({ ...d().settings, ...patch }, currency);
    d().profile.currency = currency;
  },
  get profile(): BusinessProfile {
    return d().profile;
  },
  updateProfile(patch: Partial<BusinessProfile>) {
    const currency = normalizeCurrency(patch.currency) ?? d().profile.currency;
    d().profile = normalizeProfile({ ...d().profile, ...patch }, currency);
    d().settings.currency = currency;
  },

  // --- clients ------------------------------------------------------------

  get clients(): Client[] {
    return d().clients;
  },
  client(id: string): Client | undefined {
    return findClient(id);
  },
  addClient(p: Partial<Client> & { name: string }): Client {
    const c = normalizeClient({ ...p, id: p.id && !findClient(p.id) ? p.id : workId() }, d().settings.currency)!;
    d().clients.push(c);
    return c;
  },
  updateClient(id: string, patch: Partial<Omit<Client, 'id'>>) {
    const i = d().clients.findIndex((c) => c.id === id);
    if (i < 0) return;
    const merged = { ...d().clients[i], ...patch, id };
    d().clients[i] = normalizeClient(merged, d().clients[i].currency)!;
  },
  /** Remove a client. Its projects stay, without a client; its invoices stay too. */
  removeClient(id: string) {
    d().clients = d().clients.filter((c) => c.id !== id);
    for (const p of d().projects) if (p.clientId === id) delete p.clientId;
  },

  // --- projects -----------------------------------------------------------

  get projects(): Project[] {
    return d().projects;
  },
  project(id: string): Project | undefined {
    return findProject(id);
  },
  addProject(p: Partial<Project> & { name: string }): Project {
    const proj = normalizeProject({
      createdAt: Date.now(),
      rate: { kind: 'none' },
      ...p,
      id: p.id && !findProject(p.id) ? p.id : workId(),
    })!;
    if (proj.clientId && !findClient(proj.clientId)) delete proj.clientId;
    d().projects.push(proj);
    return proj;
  },
  updateProject(id: string, patch: Partial<Omit<Project, 'id'>>) {
    const i = d().projects.findIndex((p) => p.id === id);
    if (i < 0) return;
    const merged: Record<string, unknown> = { ...d().projects[i], ...patch, id };
    // Explicit `undefined` clears an optional field (clientId, budget).
    for (const [k, v] of Object.entries(patch)) if (v === undefined) delete merged[k];
    const next = normalizeProject(merged)!;
    if (next.clientId && !findClient(next.clientId)) delete next.clientId;
    d().projects[i] = next;
  },
  /** Remove a project and every assignment to it. Invoices keep their lines. */
  removeProject(id: string) {
    d().projects = d().projects.filter((p) => p.id !== id);
    for (const [k, a] of Object.entries(d().assignments)) if (a.projectId === id) delete d().assignments[k];
  },

  // --- assignments --------------------------------------------------------

  get assignments(): Record<string, Assignment> {
    return d().assignments;
  },
  /** The assignment stored under exactly this key (task id or block key). */
  assignment(key: string): Assignment | undefined {
    return d().assignments[normalizeKey(key)];
  },
  /**
   * Put a task (or, with a block key, one occurrence) on a project. `projectId: null`
   * removes it. A rate override already on the same project is kept unless `rate` is given.
   */
  assign(taskIdOrKey: string, projectId: string | null, billable = true, rate?: Rate) {
    if (!projectId) return put(taskIdOrKey, null);
    const prev = work.assignment(taskIdOrKey);
    const keep = !rate && prev?.projectId === projectId ? prev.rate : rate;
    put(taskIdOrKey, { projectId, billable, ...(keep && keep.kind !== 'none' ? { rate: keep } : {}) });
  },
  /** Low-level: write or delete (null) an assignment under any key. */
  setAssignment(key: string, a: Assignment | null) {
    put(key, a);
  },
  unassign(key: string) {
    put(key, null);
  },
  /**
   * Override the rate for a key (task id or block key); null clears the override. For a
   * block key with no assignment of its own, the task's project and billable flag are copied.
   */
  setRate(key: string, rate: Rate | null) {
    const base = work.assignment(key) ?? work.resolve(key);
    if (!base) return;
    const projectId = 'project' in base ? base.project.id : base.projectId;
    put(key, { projectId, billable: base.billable, ...(rate && rate.kind !== 'none' ? { rate } : {}) });
  },
  /** Mark a key billable or not (copies the task's project for a bare block key). */
  setBillable(key: string, billable: boolean) {
    const own = work.assignment(key);
    const base = own ?? work.resolve(key);
    if (!base) return;
    const projectId = 'project' in base ? base.project.id : base.projectId;
    put(key, { projectId, billable, ...(own?.rate ? { rate: own.rate } : {}) });
  },
  /** Project, client, billable flag and rate for a key, after every override. */
  resolve(key: string): Resolved | null {
    return resolveKey(d(), key);
  },
  /** The rate in force for a key: occurrence > task > project > client default. */
  rateFor(key: string): RateResolution | null {
    const r = resolveKey(d(), key);
    return r ? { rate: r.rate, source: r.source, currency: r.currency } : null;
  },

  // --- sources ------------------------------------------------------------

  /** Plug in tracked time and/or calendar events. Returns a function that unplugs them. */
  connect(src: WorkSources): () => void {
    const next = { ...sources, ...src };
    sources = next;
    return () => {
      if (sources === next) sources = {};
    };
  },
  context,

  // --- earnings and analytics --------------------------------------------

  items(range: DateRange, opts?: WorkItemsOptions): WorkItem[] {
    return workItems(context(), range, opts);
  },
  summary(range: DateRange, opts?: SummaryOptions): WorkSummary {
    return summarize(context(), range, opts);
  },
  week(date: ISODate = todayISO()): DateRange {
    return weekRange(date, d().settings.weekStartsOn);
  },
  month(date: ISODate = todayISO()): DateRange {
    return monthRange(date);
  },

  // --- invoices -----------------------------------------------------------

  get invoices(): Invoice[] {
    return d().invoices;
  },
  invoice(id: string): Invoice | undefined {
    return findInvoice(id);
  },
  /** The invoice billing a work-item key, if any. */
  invoiceFor(key: string): Invoice | undefined {
    const id = d().invoicedKeys[key];
    return id ? findInvoice(id) : undefined;
  },
  isInvoiced(key: string): boolean {
    return !!d().invoicedKeys[key];
  },
  /** Build a draft from work not yet on any invoice. Not saved until `saveInvoice`. */
  draftInvoice(opts: DraftInvoiceOptions): Invoice {
    return draft(context(), opts);
  },
  /** Save a new or edited invoice and reserve its work. Fails when work is already billed elsewhere. */
  saveInvoice(inv: Invoice): SaveInvoiceResult {
    return store(inv);
  },
  updateInvoice(id: string, patch: Partial<Omit<Invoice, 'id'>>): SaveInvoiceResult {
    const cur = findInvoice(id);
    if (!cur) return { ok: false, conflicts: [] };
    return store({ ...$state.snapshot(cur), ...patch, id } as Invoice);
  },
  setStatus(id: string, status: InvoiceStatus, paidAt?: ISODate) {
    const inv = findInvoice(id);
    if (!inv) return;
    inv.status = status;
    if (status === 'paid') inv.paidAt = paidAt ?? todayISO();
    else delete inv.paidAt;
    inv.updatedAt = Date.now();
  },
  markSent(id: string) {
    work.setStatus(id, 'sent');
  },
  markPaid(id: string, paidAt?: ISODate) {
    work.setStatus(id, 'paid', paidAt);
  },
  /** Delete an invoice and free its work so it can be invoiced again. */
  removeInvoice(id: string) {
    d().invoices = d().invoices.filter((i) => i.id !== id);
    d().invoicedKeys = releaseKeys(d().invoicedKeys, id);
  },
  totals(inv: Invoice): InvoiceTotals {
    return invoiceTotals(inv);
  },

  // --- exports ------------------------------------------------------------

  invoiceCsv(id: string): string {
    const inv = findInvoice(id);
    return inv ? toInvoiceCsv(inv) : '';
  },
  invoiceHtml(id: string, opts?: InvoiceHtmlOptions): string {
    const inv = findInvoice(id);
    return inv ? toInvoiceHtml(inv, d().profile, findClient(inv.clientId), opts) : '';
  },
  itemsCsv(range: DateRange, opts?: WorkItemsOptions): string {
    const numbers = Object.fromEntries(d().invoices.map((i) => [i.id, i.number]));
    return toItemsCsv(work.items(range, opts), numbers);
  },
};
