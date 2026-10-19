import { describe, expect, it } from 'vitest';
import { csvField, csvText, escapeHtml, invoiceCsv, invoiceHtml, itemsCsv } from './export';
import { DEFAULT_PROFILE } from './migrate';
import type { BusinessProfile, Client, Invoice, WorkItem } from './types';

/** Minimal RFC 4180 reader, to check that what we write reads back the same. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\r' && text[i + 1] === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i++;
    } else cell += ch;
  }
  if (cell || row.length) rows.push([...row, cell]);
  return rows;
}

const item = (p: Partial<WorkItem> = {}): WorkItem => ({
  key: 'task:t1@2026-10-19',
  kind: 'occurrence',
  taskId: 't1',
  date: '2026-10-19',
  startMs: 0,
  title: 'Design',
  projectId: 'p1',
  projectName: 'Website',
  projectColor: '#3D6FE3',
  clientId: 'c1',
  clientName: 'Acme',
  billable: true,
  plannedMinutes: 60,
  trackedMinutes: 25,
  billedMinutes: 25,
  rate: { kind: 'hourly', amount: 10_000 },
  rateSource: 'project',
  amount: 4200,
  currency: 'USD',
  done: true,
  ...p,
});

const invoice = (p: Partial<Invoice> = {}): Invoice => ({
  id: 'inv1',
  number: 'INV-2026-0007',
  clientId: 'c1',
  currency: 'USD',
  issueDate: '2026-11-01',
  dueDate: '2026-11-15',
  from: '2026-10-01',
  to: '2026-10-31',
  lines: [
    { description: 'Design, "phase 1"', quantity: 1.5, unit: 'hour', unitPrice: 10_000, amount: 15_000, sourceKeys: ['a'] },
    { description: 'Logo', quantity: 1, unit: 'item', unitPrice: 50_000, amount: 50_000, sourceKeys: ['b'] },
  ],
  taxPct: 7.25,
  discount: { kind: 'percent', pct: 10 },
  status: 'sent',
  createdAt: 0,
  updatedAt: 0,
  ...p,
});

const profile: BusinessProfile = { ...DEFAULT_PROFILE, name: 'Studio Bloom', email: 'hi@studio.test', address: '1 Main St\nSpringfield', taxId: 'DE123' };
const client: Client = { id: 'c1', name: 'Acme', currency: 'USD', email: 'ap@acme.test', address: '9 Side Rd' };

describe('CSV', () => {
  it('quotes per RFC 4180', () => {
    expect(csvField('plain')).toBe('plain');
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('two\nlines')).toBe('"two\nlines"');
    expect(csvField('cr\rhere')).toBe('"cr\rhere"');
    expect(csvField('')).toBe('');
    expect(csvField(undefined)).toBe('');
    expect(csvField(12)).toBe('12');
  });

  it('defuses spreadsheet formulas in free text', () => {
    expect(csvText('=SUM(A1:A9)')).toBe("'=SUM(A1:A9)");
    expect(csvText('+1')).toBe("'+1");
    expect(csvText('@me')).toBe("'@me");
    expect(csvText('=1,2')).toBe(`"'=1,2"`);
    expect(csvText('Normal')).toBe('Normal');
  });

  it('itemsCsv writes a header, CRLF rows, and reads back intact', () => {
    const tricky = 'Fix "login", then\r\ndeploy';
    const text = itemsCsv([item(), item({ title: tricky, clientName: 'Comma, Inc', invoiceId: 'inv1', key: 'task:t2@2026-10-20' })], { inv1: 'INV-2026-0001' });
    expect(text.endsWith('\r\n')).toBe(true);
    const rows = parseCsv(text);
    expect(rows).toHaveLength(3);
    expect(rows[0][0]).toBe('Date');
    expect(rows[1]).toEqual(['2026-10-19', 'Acme', 'Website', 'Design', 'yes', 'yes', '60', '25', '0.42', 'hourly', '100.00', '42.00', 'USD', '', 'task:t1@2026-10-19']);
    expect(rows[2][1]).toBe('Comma, Inc');
    expect(rows[2][3]).toBe(tricky);
    expect(rows[2][13]).toBe('INV-2026-0001');
    expect(rows.every((r) => r.length === rows[0].length)).toBe(true);
  });

  it('itemsCsv writes zero-decimal currencies whole', () => {
    const rows = parseCsv(itemsCsv([item({ currency: 'JPY', amount: 1400, rate: { kind: 'hourly', amount: 3333 } })]));
    expect(rows[1].slice(10, 13)).toEqual(['3333', '1400', 'JPY']);
  });

  it('invoiceCsv lists lines then the totals', () => {
    const rows = parseCsv(invoiceCsv(invoice()));
    expect(rows[0]).toEqual(['Invoice', 'Issue date', 'Description', 'Quantity', 'Unit', 'Unit price', 'Amount', 'Currency']);
    expect(rows[1]).toEqual(['INV-2026-0007', '2026-11-01', 'Design, "phase 1"', '1.50', 'hour', '100.00', '150.00', 'USD']);
    expect(rows[2]).toEqual(['INV-2026-0007', '2026-11-01', 'Logo', '1', 'item', '500.00', '500.00', 'USD']);
    // 650 − 65 = 585; 7.25 % = 42.4125 → 42.41; total 627.41.
    expect(rows.slice(3).map((r) => [r[2], r[6]])).toEqual([
      ['Subtotal', '650.00'],
      ['Discount', '-65.00'],
      ['Tax (7.25%)', '42.41'],
      ['Total', '627.41'],
    ]);
  });
});

describe('HTML invoice', () => {
  it('is a complete, printable A4 document', () => {
    const html = invoiceHtml(invoice(), profile, client, { locale: 'en-US' });
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('@page { size: A4;');
    expect(html).toContain('@media print');
    expect(html).toContain('</html>');
    expect(html).not.toMatch(/<script|<link|https?:\/\//i);
    expect(html).toContain('Studio Bloom');
    expect(html).toContain('INV-2026-0007');
    expect(html).toContain('$627.41');
    expect(html).toContain('Tax (7.25%)');
    expect(html).toContain('Discount (10%)');
    expect(html).toContain('Nov 15, 2026');
    expect(html).toContain('Payment is due within 14 days, by Nov 15, 2026.');
    expect(html).toContain('Tax ID DE123');
  });

  it('escapes every interpolated string', () => {
    const evil = '<script>alert("x")</script>';
    const html = invoiceHtml(
      invoice({
        number: `INV"><script>alert(1)</script>`,
        notes: `</style>${evil}`,
        lines: [{ description: `<img src=x onerror=alert(1)>${evil}`, quantity: 1, unit: 'item', unitPrice: 100, amount: 100, sourceKeys: [] }],
      }),
      { ...profile, name: evil, address: `"quoted" & <b>bold</b>`, email: `x@y.test' onmouseover='alert(1)`, taxId: evil },
      { ...client, name: evil, address: evil, email: evil },
      { locale: 'en-US', lang: `en"><script>` },
    );
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<b>bold</b>');
    expect(html).not.toContain("' onmouseover='");
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(html).toContain('&quot;quoted&quot; &amp; &lt;b&gt;bold&lt;/b&gt;');
    // Only our own </style> closes the stylesheet.
    expect(html.match(/<\/style>/g)).toHaveLength(1);
  });

  it('only embeds an inline image logo', () => {
    const ok = 'data:image/png;base64,iVBORw0KGgo=';
    expect(invoiceHtml(invoice(), { ...profile, logoDataUrl: ok }, client)).toContain(`<img src="${ok}"`);
    for (const bad of ['javascript:alert(1)', 'https://evil.test/x.png', 'data:image/png;base64,AA" onload="alert(1)', 'data:text/html;base64,PHNjcmlwdD4=']) {
      expect(invoiceHtml(invoice(), { ...profile, logoDataUrl: bad }, client)).not.toContain('<img');
    }
  });

  it('marks drafts and paid invoices, and shows nothing due once paid', () => {
    expect(invoiceHtml(invoice({ status: 'draft' }), profile, client)).toContain('>Draft<');
    const paid = invoiceHtml(invoice({ status: 'paid', paidAt: '2026-11-10' }), profile, client, { locale: 'en-US' });
    expect(paid).toContain('Paid Nov 10, 2026');
    expect(paid).toMatch(/Amount due<\/span><span class="amount">\$0\.00/);
  });

  it('copes with a missing client and no lines', () => {
    const html = invoiceHtml(invoice({ lines: [], discount: undefined, taxPct: 0 }), DEFAULT_PROFILE, undefined, { locale: 'en-US' });
    expect(html).toContain('No items');
    expect(html).toContain('$0.00');
    expect(html).not.toContain('Tax (');
  });

  it('escapeHtml covers the five specials and backticks', () => {
    expect(escapeHtml(`<a href="x" title='y'>&\``)).toBe('&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&#96;');
    expect(escapeHtml(null)).toBe('');
  });
});
