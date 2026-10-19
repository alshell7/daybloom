// Exports: RFC 4180 CSV for work items and invoices, and a self-contained printable
// HTML invoice (A4, inline CSS, no scripts, no external requests). Every interpolated
// string goes through `escapeHtml`.

import { fromISODate } from '../../engine/time';
import type { ISODate } from '../../engine/types';
import { invoiceTotals } from './invoices';
import { normalizeLogo } from './migrate';
import { formatMoney, formatNumber, hoursOf, minorToDecimal } from './money';
import type { BusinessProfile, Client, Invoice, WorkItem } from './types';

// --- CSV --------------------------------------------------------------------

/** One RFC 4180 field: quoted when it holds a comma, quote, CR or LF; quotes doubled. */
export function csvField(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

/**
 * Free text from the user. A leading = + - @ (or tab/CR) would run as a formula in a
 * spreadsheet, so such text gets a leading apostrophe.
 */
export function csvText(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return csvField(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s);
}

/** Rows → CSV text with CRLF line breaks (RFC 4180). Cells are already encoded. */
function csv(rows: string[][]): string {
  return rows.map((r) => r.join(',')).join('\r\n') + '\r\n';
}

const ITEM_HEADER = [
  'Date',
  'Client',
  'Project',
  'Item',
  'Billable',
  'Done',
  'Planned minutes',
  'Tracked minutes',
  'Billed hours',
  'Rate type',
  'Rate',
  'Amount',
  'Currency',
  'Invoice',
  'Key',
];

/** Work items as CSV. Money is a plain decimal in major units ("12.50"), hours to two decimals. */
export function itemsCsv(items: WorkItem[], invoiceNumbers: Record<string, string> = {}): string {
  const rows = [ITEM_HEADER.map(csvField)];
  for (const i of items) {
    rows.push([
      csvField(i.date),
      csvText(i.clientName ?? ''),
      csvText(i.projectName),
      csvText(i.title),
      csvField(i.billable ? 'yes' : 'no'),
      csvField(i.done ? 'yes' : 'no'),
      csvField(i.plannedMinutes),
      csvField(i.trackedMinutes),
      csvField(hoursOf(i.billedMinutes).toFixed(2)),
      csvField(i.rate.kind),
      csvField(i.rate.kind === 'none' ? '' : minorToDecimal(i.rate.amount, i.currency)),
      csvField(minorToDecimal(i.amount, i.currency)),
      csvField(i.currency),
      csvText(i.invoiceId ? (invoiceNumbers[i.invoiceId] ?? i.invoiceId) : ''),
      csvText(i.key),
    ]);
  }
  return csv(rows);
}

/** An invoice as CSV: one row per line, then subtotal, discount, tax and total rows. */
export function invoiceCsv(inv: Invoice): string {
  const t = invoiceTotals(inv);
  const money = (m: number) => csvField(minorToDecimal(m, inv.currency));
  const head = [csvText(inv.number), csvField(inv.issueDate)];
  const rows = [['Invoice', 'Issue date', 'Description', 'Quantity', 'Unit', 'Unit price', 'Amount', 'Currency'].map(csvField)];
  for (const l of inv.lines) {
    rows.push([
      ...head,
      csvText(l.description),
      csvField(l.unit === 'hour' ? l.quantity.toFixed(2) : String(l.quantity)),
      csvField(l.unit),
      money(l.unitPrice),
      money(l.amount),
      csvField(inv.currency),
    ]);
  }
  const summary = (label: string, amount: number) => [...head, csvField(label), '', '', '', money(amount), csvField(inv.currency)];
  rows.push(summary('Subtotal', t.subtotal));
  if (t.discount) rows.push(summary('Discount', -t.discount));
  if (inv.taxPct) rows.push(summary(`Tax (${inv.taxPct}%)`, t.tax));
  rows.push(summary('Total', t.total));
  return csv(rows);
}

// --- HTML -------------------------------------------------------------------

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };

/** Safe in text and in quoted attributes. */
export function escapeHtml(v: unknown): string {
  return String(v ?? '').replace(/[&<>"'`]/g, (c) => ESC[c]);
}

function formatDate(date: ISODate, locale?: string): string {
  try {
    return fromISODate(date).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return date;
  }
}

export interface InvoiceHtmlOptions {
  /** BCP 47 locale for dates and money. Default: the system's. */
  locale?: string;
  /** Document language attribute. Default 'en'. */
  lang?: string;
}

const STYLE = `
@page { size: A4; margin: 16mm 16mm 18mm; }
:root {
  --ink: #1b2130; --body: #3a4253; --muted: #6b7385; --faint: #9aa1b0;
  --line: #e6e8ec; --soft: #f5f6f8; --paper: #ffffff; --desk: #eceef2;
}
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; -webkit-text-size-adjust: 100%; }
body {
  margin: 0; background: var(--desk); color: var(--body);
  font: 400 10pt/1.55 "Inter", "SF Pro Text", -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif;
  font-variant-numeric: tabular-nums; -webkit-font-smoothing: antialiased;
}
.sheet {
  width: 210mm; min-height: 297mm; margin: 10mm auto; padding: 18mm 18mm 16mm;
  background: var(--paper); box-shadow: 0 1px 2px rgba(20,28,44,.06), 0 12px 32px rgba(20,28,44,.08);
  display: flex; flex-direction: column;
}
h1, h2, p { margin: 0; }
.top { display: flex; justify-content: space-between; align-items: flex-start; gap: 12mm; }
.brand { max-width: 60%; }
.brand img { display: block; max-height: 16mm; max-width: 55mm; margin-bottom: 5mm; }
.brand .name { color: var(--ink); font-size: 12.5pt; font-weight: 600; letter-spacing: -0.005em; }
.brand .meta { color: var(--muted); white-space: pre-line; margin-top: 1.5mm; }
.title { text-align: right; }
.title h1 { color: var(--ink); font-size: 24pt; font-weight: 300; letter-spacing: 0.01em; line-height: 1.1; }
.title .number { color: var(--muted); margin-top: 1.5mm; letter-spacing: 0.02em; }
.badge {
  display: inline-block; margin-top: 3mm; padding: 0.6mm 3mm; border-radius: 99px;
  font-size: 7.5pt; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase;
  border: 1px solid var(--line); color: var(--muted); background: var(--soft);
}
.badge.paid { color: #1f6b4a; border-color: #cfe6da; background: #eef7f2; }
.parties { display: grid; grid-template-columns: 1.2fr 1fr; gap: 12mm; margin: 12mm 0 10mm; padding-top: 8mm; border-top: 1px solid var(--line); }
.label { color: var(--faint); font-size: 7.5pt; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 2mm; }
.client .name { color: var(--ink); font-size: 11pt; font-weight: 600; }
.client .meta { color: var(--muted); white-space: pre-line; margin-top: 1mm; }
.facts { display: grid; grid-template-columns: auto 1fr; gap: 1.2mm 8mm; margin: 0; }
.facts dt { color: var(--muted); }
.facts dd { margin: 0; text-align: right; color: var(--ink); }
.due { margin-top: 5mm; padding: 4mm 5mm; background: var(--soft); border-radius: 2mm; display: flex; justify-content: space-between; align-items: baseline; gap: 6mm; }
.due .amount { color: var(--ink); font-size: 15pt; font-weight: 600; letter-spacing: -0.01em; white-space: nowrap; }
table { width: 100%; border-collapse: collapse; }
thead { display: table-header-group; }
th {
  color: var(--faint); font-size: 7.5pt; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase;
  text-align: left; padding: 0 0 2.5mm; border-bottom: 1px solid var(--ink);
}
td { padding: 3mm 0; border-bottom: 1px solid var(--line); vertical-align: top; color: var(--ink); }
td.desc { white-space: pre-line; padding-right: 6mm; }
th.num, td.num { text-align: right; white-space: nowrap; padding-left: 6mm; }
td.num { color: var(--body); }
td.num.amount { color: var(--ink); font-weight: 500; }
tr { break-inside: avoid; page-break-inside: avoid; }
td.empty { color: var(--faint); text-align: center; padding: 8mm 0; }
.sum { margin-left: auto; width: 80mm; margin-top: 5mm; break-inside: avoid; page-break-inside: avoid; }
.sum .row { display: flex; justify-content: space-between; gap: 6mm; padding: 1.4mm 0; }
.sum .row span:first-child { color: var(--muted); }
.sum .row span:last-child { color: var(--ink); white-space: nowrap; }
.sum .total { margin-top: 2mm; padding-top: 3mm; border-top: 1px solid var(--ink); font-size: 12.5pt; font-weight: 600; }
.sum .total span:first-child { color: var(--ink); }
.notes { display: grid; grid-template-columns: 1fr 1fr; gap: 12mm; margin-top: 12mm; break-inside: avoid; page-break-inside: avoid; }
.notes p { color: var(--muted); white-space: pre-line; }
.spacer { flex: 1; }
footer { margin-top: 12mm; padding-top: 4mm; border-top: 1px solid var(--line); color: var(--faint); font-size: 8pt; display: flex; justify-content: space-between; gap: 6mm; }
@media print {
  body { background: none; }
  .sheet { width: auto; min-height: 0; margin: 0; padding: 0; box-shadow: none; display: block; }
  .spacer { display: none; }
}
@media screen and (max-width: 820px) {
  .sheet { width: auto; min-height: 0; margin: 0; padding: 24px 16px; box-shadow: none; }
  .top, .parties, .notes { display: block; }
  .title { text-align: left; margin-top: 16px; }
  .parties > * + *, .notes > * + * { margin-top: 20px; }
  .sum { width: 100%; }
}
`;

/**
 * A complete, printable HTML invoice. No scripts and no external resources (a logo is
 * only ever an inline data: image), so it can be shown in a sandboxed frame or printed
 * to PDF from any browser's print dialog.
 */
export function invoiceHtml(inv: Invoice, profile: BusinessProfile, client: Client | null | undefined, opts: InvoiceHtmlOptions = {}): string {
  const { locale } = opts;
  const e = escapeHtml;
  const money = (m: number) => e(formatMoney(m, inv.currency, locale));
  const date = (d: ISODate) => e(formatDate(d, locale));
  const t = invoiceTotals(inv);
  const logo = normalizeLogo(profile.logoDataUrl);

  const fromMeta = [profile.address, profile.email].filter(Boolean).join('\n');
  const clientMeta = [client?.address, client?.email].filter(Boolean).join('\n');

  const rows = inv.lines.length
    ? inv.lines
        .map(
          (l) => `<tr>
          <td class="desc">${e(l.description)}</td>
          <td class="num">${e(l.unit === 'hour' ? formatNumber(l.quantity, 2, locale) + ' h' : formatNumber(l.quantity, 2, locale))}</td>
          <td class="num">${money(l.unitPrice)}${l.unit === 'hour' ? ' / h' : ''}</td>
          <td class="num amount">${money(l.amount)}</td>
        </tr>`,
        )
        .join('\n')
    : `<tr><td class="empty" colspan="4">No items</td></tr>`;

  const discountLabel = inv.discount?.kind === 'percent' ? `Discount (${formatNumber(inv.discount.pct, 4, locale)}%)` : 'Discount';
  const terms =
    profile.paymentTerms > 0
      ? `Payment is due within ${profile.paymentTerms} ${profile.paymentTerms === 1 ? 'day' : 'days'}, by ${formatDate(inv.dueDate, locale)}.`
      : `Payment is due on receipt.`;

  const badge =
    inv.status === 'paid'
      ? `<div class="badge paid">Paid${inv.paidAt ? ` ${date(inv.paidAt)}` : ''}</div>`
      : inv.status === 'draft'
        ? `<div class="badge">Draft</div>`
        : '';

  const titleText = `Invoice ${inv.number}${profile.name ? ` — ${profile.name}` : ''}`;

  return `<!doctype html>
<html lang="${e(opts.lang ?? 'en')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${e(titleText)}</title>
<style>${STYLE}</style>
</head>
<body>
<main class="sheet">
  <header class="top">
    <div class="brand">
      ${logo ? `<img src="${e(logo)}" alt="${e(profile.name)}">` : ''}
      ${profile.name ? `<div class="name">${e(profile.name)}</div>` : ''}
      ${fromMeta ? `<p class="meta">${e(fromMeta)}</p>` : ''}
    </div>
    <div class="title">
      <h1>Invoice</h1>
      <p class="number">${e(inv.number)}</p>
      ${badge}
    </div>
  </header>

  <section class="parties">
    <div class="client">
      <div class="label">Bill to</div>
      <div class="name">${e(client?.name ?? '')}</div>
      ${clientMeta ? `<p class="meta">${e(clientMeta)}</p>` : ''}
    </div>
    <div>
      <dl class="facts">
        <dt>Issue date</dt><dd>${date(inv.issueDate)}</dd>
        <dt>Due date</dt><dd>${date(inv.dueDate)}</dd>
        <dt>Period</dt><dd>${date(inv.from)} – ${date(inv.to)}</dd>
      </dl>
      <div class="due"><span class="label" style="margin:0">Amount due</span><span class="amount">${inv.status === 'paid' ? money(0) : money(t.total)}</span></div>
    </div>
  </section>

  <table>
    <thead>
      <tr><th>Description</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Amount</th></tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  <section class="sum">
    <div class="row"><span>Subtotal</span><span>${money(t.subtotal)}</span></div>
    ${t.discount ? `<div class="row"><span>${e(discountLabel)}</span><span>−${money(t.discount)}</span></div>` : ''}
    ${inv.taxPct ? `<div class="row"><span>Tax (${e(formatNumber(inv.taxPct, 4, locale))}%)</span><span>${money(t.tax)}</span></div>` : ''}
    <div class="row total"><span>Total</span><span>${money(t.total)}</span></div>
  </section>

  <section class="notes">
    <div>
      ${inv.notes ? `<div class="label">Notes</div><p>${e(inv.notes)}</p>` : ''}
    </div>
    <div>
      <div class="label">Payment terms</div>
      <p>${e(terms)}</p>
    </div>
  </section>

  <div class="spacer"></div>
  <footer>
    <span>${e([profile.name, profile.taxId ? `Tax ID ${profile.taxId}` : ''].filter(Boolean).join(' · '))}</span>
    <span>${e(inv.number)}</span>
  </footer>
</main>
</body>
</html>
`;
}
