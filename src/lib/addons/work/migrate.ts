// Defaults and the normalising migrate for the 'addon-work' file. `migrateWork` accepts
// anything (old versions, hand-edited JSON, garbage) and always returns a valid WorkData:
// bad records are repaired when they can be and dropped when they cannot.

import { CATEGORY_BY_ID } from '../../engine/categories';
import { todayISO } from '../../engine/time';
import type { ISODate } from '../../engine/types';
import { normalizeKey } from './keys';
import { lineAmount, normalizeCurrency } from './money';
import type {
  Assignment,
  Budget,
  BusinessProfile,
  Client,
  Discount,
  Invoice,
  InvoiceLine,
  InvoiceStatus,
  Project,
  Rate,
  WorkData,
  WorkSettings,
} from './types';

export const WORK_STORE_KEY = 'addon-work';
export const WORK_VERSION = 1 as const;

export const DEFAULT_WORK_SETTINGS: WorkSettings = { billPlanned: true, currency: 'USD', weekStartsOn: 1 };

export const DEFAULT_PROFILE: BusinessProfile = {
  name: '',
  email: '',
  address: '',
  paymentTerms: 14,
  currency: 'USD',
  invoicePrefix: 'INV',
};

export function emptyWorkData(): WorkData {
  return {
    version: WORK_VERSION,
    clients: [],
    projects: [],
    assignments: {},
    invoices: [],
    invoicedKeys: {},
    settings: { ...DEFAULT_WORK_SETTINGS },
    profile: { ...DEFAULT_PROFILE },
  };
}

export function workId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

// --- primitives -------------------------------------------------------------

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const optStr = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);
const finite = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Non-negative whole minor units. */
function minor(v: unknown): number | undefined {
  const n = finite(typeof v === 'string' && v.trim() !== '' ? Number(v) : v);
  return n === undefined ? undefined : Math.max(0, Math.round(n));
}

function pct(v: unknown): number | undefined {
  const n = finite(typeof v === 'string' && v.trim() !== '' ? Number(v) : v);
  return n === undefined ? undefined : clamp(n, 0, 100);
}

export function isISODate(v: unknown): v is ISODate {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export function normalizeColor(v: unknown): string {
  if (typeof v === 'string' && (v in CATEGORY_BY_ID || HEX.test(v))) return v;
  return 'focus';
}

const LOGO = /^data:image\/(?:png|jpeg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=\s]+$/;

/** Only an inline base64 image is accepted as a logo. */
export function normalizeLogo(v: unknown): string | undefined {
  return typeof v === 'string' && LOGO.test(v) ? v : undefined;
}

// --- records ----------------------------------------------------------------

/** Any rate-like value → a valid Rate (`none` when it cannot be read). */
export function normalizeRate(raw: unknown): Rate {
  if (!isObj(raw)) return { kind: 'none' };
  if (raw.kind === 'hourly' || raw.kind === 'fixed') {
    const amount = minor(raw.amount);
    return amount === undefined ? { kind: 'none' } : { kind: raw.kind, amount };
  }
  return { kind: 'none' };
}

function optRate(raw: unknown): Rate | undefined {
  if (raw === undefined || raw === null) return undefined;
  const r = normalizeRate(raw);
  return r.kind === 'none' ? undefined : r;
}

function normalizeBudget(raw: unknown): Budget | undefined {
  if (!isObj(raw) || (raw.kind !== 'hours' && raw.kind !== 'money')) return undefined;
  const n = finite(raw.amount);
  if (n === undefined || n <= 0) return undefined;
  return { kind: raw.kind, amount: raw.kind === 'money' ? Math.round(n) : n };
}

export function normalizeClient(raw: unknown, currency: string): Client | null {
  if (!isObj(raw)) return null;
  const c: Client = {
    id: optStr(raw.id) ?? workId(),
    name: str(raw.name),
    currency: normalizeCurrency(raw.currency) ?? currency,
  };
  const email = optStr(raw.email);
  if (email) c.email = email;
  const address = optStr(raw.address);
  if (address) c.address = address;
  const rate = optRate(raw.defaultRate);
  if (rate) c.defaultRate = rate;
  const tax = pct(raw.taxPct);
  if (tax !== undefined) c.taxPct = tax;
  const notes = optStr(raw.notes);
  if (notes) c.notes = notes;
  if (raw.archived === true) c.archived = true;
  return c;
}

export function normalizeProject(raw: unknown): Project | null {
  if (!isObj(raw)) return null;
  const p: Project = {
    id: optStr(raw.id) ?? workId(),
    name: str(raw.name),
    color: normalizeColor(raw.color),
    rate: normalizeRate(raw.rate),
    createdAt: finite(raw.createdAt) ?? Date.now(),
  };
  const clientId = optStr(raw.clientId);
  if (clientId) p.clientId = clientId;
  const budget = normalizeBudget(raw.budget);
  if (budget) p.budget = budget;
  if (raw.archived === true) p.archived = true;
  return p;
}

export function normalizeAssignment(raw: unknown): Assignment | null {
  if (!isObj(raw)) return null;
  const projectId = optStr(raw.projectId);
  if (!projectId) return null;
  const a: Assignment = { projectId, billable: raw.billable !== false };
  const rate = optRate(raw.rate);
  if (rate) a.rate = rate;
  return a;
}

function normalizeDiscount(raw: unknown): Discount | undefined {
  if (!isObj(raw)) return undefined;
  if (raw.kind === 'percent') {
    const p = pct(raw.pct);
    return p ? { kind: 'percent', pct: p } : undefined;
  }
  if (raw.kind === 'amount') {
    const a = minor(raw.amount);
    return a ? { kind: 'amount', amount: a } : undefined;
  }
  return undefined;
}

export function normalizeLine(raw: unknown): InvoiceLine | null {
  if (!isObj(raw)) return null;
  const quantity = finite(raw.quantity) ?? 0;
  const unitPrice = finite(raw.unitPrice) !== undefined ? Math.round(raw.unitPrice) : 0;
  const amount = finite(raw.amount);
  const keys = Array.isArray(raw.sourceKeys) ? raw.sourceKeys.filter((k: unknown): k is string => typeof k === 'string' && k.length > 0) : [];
  return {
    description: str(raw.description),
    quantity,
    unit: raw.unit === 'hour' ? 'hour' : 'item',
    unitPrice,
    amount: amount !== undefined ? Math.round(amount) : lineAmount(quantity, unitPrice),
    sourceKeys: [...new Set(keys)],
  };
}

const STATUSES: InvoiceStatus[] = ['draft', 'sent', 'paid'];

export function normalizeInvoice(raw: unknown, currency: string): Invoice | null {
  if (!isObj(raw)) return null;
  const now = Date.now();
  const issueDate = isISODate(raw.issueDate) ? raw.issueDate : todayISO();
  const from = isISODate(raw.from) ? raw.from : issueDate;
  const to = isISODate(raw.to) && raw.to >= from ? raw.to : from;
  const inv: Invoice = {
    id: optStr(raw.id) ?? workId(),
    number: str(raw.number),
    clientId: str(raw.clientId),
    currency: normalizeCurrency(raw.currency) ?? currency,
    issueDate,
    dueDate: isISODate(raw.dueDate) && raw.dueDate >= issueDate ? raw.dueDate : issueDate,
    from,
    to,
    lines: Array.isArray(raw.lines) ? raw.lines.map(normalizeLine).filter((l): l is InvoiceLine => !!l) : [],
    taxPct: pct(raw.taxPct) ?? 0,
    status: STATUSES.includes(raw.status) ? raw.status : 'draft',
    createdAt: finite(raw.createdAt) ?? now,
    updatedAt: finite(raw.updatedAt) ?? now,
  };
  const discount = normalizeDiscount(raw.discount);
  if (discount) inv.discount = discount;
  const notes = optStr(raw.notes);
  if (notes) inv.notes = notes;
  if (inv.status === 'paid') inv.paidAt = isISODate(raw.paidAt) ? raw.paidAt : inv.issueDate;
  return inv;
}

export function normalizeSettings(raw: unknown, currency: string): WorkSettings {
  const r = isObj(raw) ? raw : {};
  const wk = finite(r.weekStartsOn);
  return {
    billPlanned: typeof r.billPlanned === 'boolean' ? r.billPlanned : DEFAULT_WORK_SETTINGS.billPlanned,
    currency,
    weekStartsOn: wk !== undefined && Number.isInteger(wk) && wk >= 0 && wk <= 6 ? wk : DEFAULT_WORK_SETTINGS.weekStartsOn,
  };
}

export function normalizeProfile(raw: unknown, currency: string): BusinessProfile {
  const r = isObj(raw) ? raw : {};
  const terms = finite(r.paymentTerms);
  const p: BusinessProfile = {
    name: str(r.name),
    email: str(r.email),
    address: str(r.address),
    paymentTerms: terms !== undefined ? clamp(Math.round(terms), 0, 365) : DEFAULT_PROFILE.paymentTerms,
    currency,
    invoicePrefix: typeof r.invoicePrefix === 'string' ? r.invoicePrefix.trim().slice(0, 16) : DEFAULT_PROFILE.invoicePrefix,
  };
  const taxId = optStr(r.taxId);
  if (taxId) p.taxId = taxId;
  const logo = normalizeLogo(r.logoDataUrl);
  if (logo) p.logoDataUrl = logo;
  return p;
}

function uniqueById<T extends { id: string }>(list: T[]): T[] {
  const seen = new Set<string>();
  return list.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
}

/**
 * Rebuild `invoicedKeys` so it agrees with the invoices: stale entries (invoice gone) are
 * dropped, keys found on invoice lines are added, and a key claimed twice stays with the
 * earliest invoice.
 */
export function reconcileInvoicedKeys(invoices: Invoice[], stored: unknown): Record<string, string> {
  const ids = new Set(invoices.map((i) => i.id));
  const out: Record<string, string> = {};
  if (isObj(stored)) {
    for (const [k, v] of Object.entries(stored)) if (typeof v === 'string' && ids.has(v)) out[k] = v;
  }
  const byAge = invoices.slice().sort((a, b) => a.createdAt - b.createdAt);
  for (const inv of byAge) for (const line of inv.lines) for (const k of line.sourceKeys) out[k] ??= inv.id;
  // A stored key whose invoice no longer lists it is free again.
  const listed = new Map<string, Set<string>>();
  for (const inv of invoices) listed.set(inv.id, new Set(inv.lines.flatMap((l) => l.sourceKeys)));
  for (const [k, id] of Object.entries(out)) if (!listed.get(id)?.has(k)) delete out[k];
  return out;
}

/** The persisted-store migrate: anything in, a valid version-1 WorkData out. */
export function migrateWork(raw: unknown): WorkData {
  const r = isObj(raw) ? raw : {};
  const currency =
    normalizeCurrency(isObj(r.settings) ? r.settings.currency : undefined) ??
    normalizeCurrency(isObj(r.profile) ? r.profile.currency : undefined) ??
    DEFAULT_WORK_SETTINGS.currency;

  const clients = uniqueById((Array.isArray(r.clients) ? r.clients : []).map((c) => normalizeClient(c, currency)).filter((c): c is Client => !!c));
  const projects = uniqueById((Array.isArray(r.projects) ? r.projects : []).map(normalizeProject).filter((p): p is Project => !!p));
  const clientIds = new Set(clients.map((c) => c.id));
  for (const p of projects) if (p.clientId && !clientIds.has(p.clientId)) delete p.clientId;

  const projectIds = new Set(projects.map((p) => p.id));
  const assignments: Record<string, Assignment> = {};
  if (isObj(r.assignments)) {
    for (const [k, v] of Object.entries(r.assignments)) {
      const a = normalizeAssignment(v);
      if (k && a && projectIds.has(a.projectId)) assignments[normalizeKey(k)] = a;
    }
  }

  const invoices = uniqueById((Array.isArray(r.invoices) ? r.invoices : []).map((i) => normalizeInvoice(i, currency)).filter((i): i is Invoice => !!i));

  return {
    version: WORK_VERSION,
    clients,
    projects,
    assignments,
    invoices,
    invoicedKeys: reconcileInvoicedKeys(invoices, r.invoicedKeys),
    settings: normalizeSettings(r.settings, currency),
    profile: normalizeProfile(r.profile, currency),
  };
}
