// Invoices: drafting lines from not-yet-invoiced work, numbering, totals, and the
// key ledger (`invoicedKeys`) that stops a piece of work from billing twice. Pure.

import { addDays, fromISODate, isoOf } from '../../engine/time';
import type { ISODate } from '../../engine/types';
import { clientById, projectById, workItems } from './earnings';
import { workId } from './migrate';
import { hundredthsOfHour, lineAmount, mulDiv, percentOf } from './money';
import type { Invoice, InvoiceLine, Minor, WorkContext, WorkData, WorkItem } from './types';

export type InvoiceGroupBy = 'task' | 'project' | 'day';

export interface DraftInvoiceOptions {
  clientId: string;
  /** Only these projects (all of the client's when omitted). */
  projectIds?: string[];
  from: ISODate;
  to: ISODate;
  groupBy: InvoiceGroupBy;
  /** Default: today (from `ctx.now`). */
  issueDate?: ISODate;
  notes?: string;
  /** Locale for the dates written into 'day' line descriptions. */
  locale?: string;
}

// --- numbering --------------------------------------------------------------

/** `INV-2026-0007` → { year: 2026, seq: 7 }. Any prefix (or none) is accepted. */
export function parseInvoiceNumber(number: string): { year: number; seq: number } | null {
  const m = /(?:^|-)(\d{4})-(\d+)$/.exec(number.trim());
  return m ? { year: Number(m[1]), seq: Number(m[2]) } : null;
}

export function formatInvoiceNumber(prefix: string, year: number, seq: number): string {
  const tail = `${year}-${String(seq).padStart(4, '0')}`;
  return prefix ? `${prefix}-${tail}` : tail;
}

/** Next number in `year`: one past the highest sequence used that year (any prefix). */
export function nextInvoiceNumber(invoices: Pick<Invoice, 'number'>[], year: number, prefix: string): string {
  let max = 0;
  for (const inv of invoices) {
    const p = parseInvoiceNumber(inv.number ?? '');
    if (p && p.year === year && p.seq > max) max = p.seq;
  }
  return formatInvoiceNumber(prefix, year, max + 1);
}

export function yearOf(date: ISODate): number {
  return Number(date.slice(0, 4));
}

// --- lines and totals -------------------------------------------------------

/** A line with its amount computed from quantity × unit price (quantity to two decimals). */
export function makeLine(p: Partial<InvoiceLine> & Pick<InvoiceLine, 'description' | 'unitPrice'>): InvoiceLine {
  const quantity = Math.round((Number.isFinite(p.quantity) ? p.quantity! : 1) * 100) / 100;
  return {
    description: p.description,
    quantity,
    unit: p.unit ?? 'item',
    unitPrice: Math.round(p.unitPrice),
    amount: lineAmount(quantity, p.unitPrice),
    sourceKeys: [...(p.sourceKeys ?? [])],
  };
}

export interface InvoiceTotals {
  subtotal: Minor;
  discount: Minor;
  /** subtotal − discount. */
  taxable: Minor;
  tax: Minor;
  total: Minor;
}

/** Subtotal → discount → tax on the discounted amount → total. Each step rounds once. */
export function invoiceTotals(inv: Pick<Invoice, 'lines' | 'taxPct' | 'discount'>): InvoiceTotals {
  const subtotal = inv.lines.reduce((s, l) => s + l.amount, 0);
  let discount = 0;
  if (inv.discount?.kind === 'percent') discount = percentOf(subtotal, inv.discount.pct);
  else if (inv.discount?.kind === 'amount') discount = Math.round(inv.discount.amount);
  discount = Math.max(0, Math.min(discount, Math.max(0, subtotal)));
  const taxable = subtotal - discount;
  const tax = percentOf(taxable, inv.taxPct || 0);
  return { subtotal, discount, taxable, tax, total: taxable + tax };
}

function dayLabel(date: ISODate, locale?: string): string {
  try {
    return fromISODate(date).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
  } catch {
    return date;
  }
}

/** Group items into invoice lines. Items with different prices or units never share a line. */
export function linesFor(items: WorkItem[], groupBy: InvoiceGroupBy, data: WorkData, locale?: string): InvoiceLine[] {
  const manyProjects = new Set(items.map((i) => i.projectId)).size > 1;
  const groups = new Map<string, WorkItem[]>();
  for (const i of items) {
    if (i.rate.kind === 'none') continue;
    const what =
      groupBy === 'project'
        ? `p:${i.projectId}`
        : groupBy === 'day'
          ? `d:${i.date}`
          : i.taskId
            ? `t:${i.projectId}:${i.taskId}`
            : i.kind === 'project'
              ? `p:${i.projectId}`
              : `e:${i.projectId}:${i.title}`;
    const k = `${what}|${i.rate.kind}|${i.rate.amount}`;
    const g = groups.get(k);
    if (g) g.push(i);
    else groups.set(k, [i]);
  }

  const lines: InvoiceLine[] = [];
  for (const g of groups.values()) {
    const first = g[0];
    const rate = first.rate as Exclude<WorkItem['rate'], { kind: 'none' }>;
    let description: string;
    if (groupBy === 'project') description = projectById(data, first.projectId)?.name ?? first.projectName;
    else if (groupBy === 'day') description = `${dayLabel(first.date, locale)} — ${[...new Set(g.map((i) => i.title))].join(', ')}`;
    else description = manyProjects && first.kind !== 'project' ? `${first.projectName} — ${first.title}` : first.title;

    const sourceKeys = g.map((i) => i.key);
    if (rate.kind === 'fixed') {
      lines.push({ description, quantity: g.length, unit: 'item', unitPrice: rate.amount, amount: g.length * rate.amount, sourceKeys });
    } else {
      const hundredths = g.reduce((s, i) => s + hundredthsOfHour(i.billedMinutes), 0);
      lines.push({ description, quantity: hundredths / 100, unit: 'hour', unitPrice: rate.amount, amount: mulDiv(hundredths, rate.amount, 100), sourceKeys });
    }
  }
  return lines;
}

/** The items a draft for these options would bill: billable, priced, not yet invoiced. */
export function invoiceableItems(ctx: WorkContext, opts: Pick<DraftInvoiceOptions, 'clientId' | 'projectIds' | 'from' | 'to'>): WorkItem[] {
  return workItems(ctx, { from: opts.from, to: opts.to }, { clientId: opts.clientId, projectIds: opts.projectIds }).filter(
    (i) => i.billable && i.amount > 0 && !ctx.data.invoicedKeys[i.key],
  );
}

/**
 * A new draft (not saved) for a client and period. Lines come only from work that is
 * not on any saved invoice; saving it (see `claimKeys`) reserves that work.
 */
export function draftInvoice(ctx: WorkContext, opts: DraftInvoiceOptions): Invoice {
  const { data } = ctx;
  const client = clientById(data, opts.clientId);
  if (!client) throw new Error(`Unknown client: ${opts.clientId}`);
  const now = ctx.now ?? Date.now();
  const issueDate = opts.issueDate ?? isoOf(now);
  const items = invoiceableItems(ctx, opts).filter((i) => i.currency === client.currency);
  const inv: Invoice = {
    id: workId(),
    number: nextInvoiceNumber(data.invoices, yearOf(issueDate), data.profile.invoicePrefix),
    clientId: client.id,
    currency: client.currency,
    issueDate,
    dueDate: addDays(issueDate, Math.max(0, data.profile.paymentTerms)),
    from: opts.from,
    to: opts.to,
    lines: linesFor(items, opts.groupBy, data, opts.locale),
    taxPct: client.taxPct ?? 0,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  };
  if (opts.notes) inv.notes = opts.notes;
  return inv;
}

// --- the no-double-billing ledger ---------------------------------------------

export function invoiceKeys(inv: Pick<Invoice, 'lines'>): string[] {
  return [...new Set(inv.lines.flatMap((l) => l.sourceKeys))];
}

/**
 * Reserve an invoice's source keys. Fails (nothing changes) when any key is already on a
 * different invoice; re-saving the same invoice first frees the keys it held before.
 */
export function claimKeys(
  invoicedKeys: Record<string, string>,
  inv: Pick<Invoice, 'id' | 'lines'>,
): { ok: true; invoicedKeys: Record<string, string> } | { ok: false; conflicts: string[] } {
  const keys = invoiceKeys(inv);
  const conflicts = keys.filter((k) => invoicedKeys[k] && invoicedKeys[k] !== inv.id);
  if (conflicts.length) return { ok: false, conflicts };
  const next = releaseKeys(invoicedKeys, inv.id);
  for (const k of keys) next[k] = inv.id;
  return { ok: true, invoicedKeys: next };
}

/** Free every key an invoice held (on delete, or before re-claiming). */
export function releaseKeys(invoicedKeys: Record<string, string>, invoiceId: string): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [k, id] of Object.entries(invoicedKeys)) if (id !== invoiceId) next[k] = id;
  return next;
}

/** Sent, unpaid, and past its due date. */
export function isOverdue(inv: Pick<Invoice, 'status' | 'dueDate'>, today: ISODate): boolean {
  return inv.status === 'sent' && inv.dueDate < today;
}
