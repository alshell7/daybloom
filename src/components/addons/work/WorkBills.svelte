<script lang="ts">
  import { cubicOut } from 'svelte/easing';
  import { fly, slide } from 'svelte/transition';
  import { formatMoney } from '../../../lib/addons/work/money';
  import { work } from '../../../lib/addons/work/work.svelte';
  import type { Invoice } from '../../../lib/addons/work/types';
  import { addDays, fromISODate, todayISO } from '../../../lib/engine/time';
  import Icon from '../../../lib/Icon.svelte';
  import { platform } from '../../../lib/platform';
  import { view } from '../../../lib/stores/view.svelte';
  import Segmented from '../../Segmented.svelte';

  const date = (d: string) => fromISODate(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  // ---- new bill
  let making = $state(false);
  let clientId = $state('');
  let period = $state<'this' | 'last' | 'custom'>('this');
  let from = $state(work.month().from);
  let to = $state(work.month().to);
  let groupBy = $state<'task' | 'project' | 'day'>('task');
  let notes = $state('');
  let err = $state('');

  $effect(() => {
    if (period === 'this') ({ from, to } = work.month());
    else if (period === 'last') ({ from, to } = work.month(addDays(work.month().from, -1)));
  });

  const draft: Invoice | null = $derived.by(() => {
    if (!making || !clientId || !from || !to || from > to) return null;
    try {
      return work.draftInvoice({ clientId, from, to, groupBy, notes: notes.trim() || undefined });
    } catch {
      return null;
    }
  });
  const dtot = $derived(draft ? work.totals(draft) : null);

  function startBill() {
    clientId = work.clients.find((c) => !c.archived)?.id ?? '';
    period = 'this';
    groupBy = 'task';
    notes = '';
    err = '';
    making = true;
  }
  function saveBill() {
    if (!draft || !draft.lines.length) return;
    const r = work.saveInvoice(draft);
    if (!r.ok) {
      err = `Some of this work is already on another bill (${r.conflicts.length}). Refresh and try again.`;
      return;
    }
    making = false;
    view.say(`Bill ${r.invoice.number} saved`);
  }

  async function exportHtml(inv: Invoice) {
    const where = await platform.exportFile(`${inv.number}.html`, work.invoiceHtml(inv.id), 'open');
    view.say(platform.isNative ? `Opened ${where.split(/[\\/]/).pop()} — print it to save a PDF` : 'Bill downloaded');
  }
  async function exportCsv(inv: Invoice) {
    const where = await platform.exportFile(`${inv.number}.csv`, work.invoiceCsv(inv.id), 'reveal');
    view.say(`Saved ${where.split(/[\\/]/).pop()}`);
  }

  let confirmDelete = $state<string | null>(null);
  const bills = $derived([...work.invoices].sort((a, b) => b.createdAt - a.createdAt));

  // ---- profile
  let profileOpen = $state(false);
  const profileEmpty = $derived(!work.profile.name.trim());
</script>

<section>
  <div class="head">
    <h4>Bills</h4>
    {#if !making}<button class="btn btn-soft sm" onclick={startBill} disabled={!work.clients.length}><Icon name="plus" size={13} /> New bill</button>{/if}
  </div>

  {#if !work.clients.length}
    <p class="empty">Add a client in Projects first. Bills are made for one client at a time.</p>
  {/if}

  {#if making}
    <div class="maker" transition:slide={{ duration: view.reducedMotion ? 0 : 220 }}>
      <div class="row">
        <span>Client</span>
        <select class="field compact" bind:value={clientId} aria-label="Client">
          {#each work.clients.filter((c) => !c.archived) as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
        </select>
      </div>
      <div class="row">
        <span>Period</span>
        <Segmented
          label="Bill period"
          value={period}
          options={[
            { value: 'this', label: 'This month' },
            { value: 'last', label: 'Last month' },
            { value: 'custom', label: 'Custom' },
          ]}
          onchange={(v) => (period = v as typeof period)}
        />
      </div>
      {#if period === 'custom'}
        <div class="dates">
          <input class="field" type="date" bind:value={from} aria-label="From" />
          <span>to</span>
          <input class="field" type="date" bind:value={to} aria-label="To" />
        </div>
      {/if}
      <div class="row">
        <span>Lines</span>
        <Segmented
          label="Group lines by"
          value={groupBy}
          options={[
            { value: 'task', label: 'By block' },
            { value: 'project', label: 'By project' },
            { value: 'day', label: 'By day' },
          ]}
          onchange={(v) => (groupBy = v as typeof groupBy)}
        />
      </div>

      {#if draft && dtot}
        {#if draft.lines.length}
          <div class="preview" in:fly={{ y: 4, duration: view.reducedMotion ? 0 : 200 }}>
            <div class="ptop"><b>{draft.number}</b><span>{date(draft.from)} – {date(draft.to)}</span></div>
            <ul class="lines">
              {#each draft.lines.slice(0, 10) as l, i (i)}
                <li>
                  <span class="d">{l.description}</span>
                  <span class="q tnum">{l.unit === 'hour' ? `${l.quantity} h × ${formatMoney(l.unitPrice, draft.currency)}` : `${l.quantity} ×`}</span>
                  <span class="a tnum">{formatMoney(l.amount, draft.currency)}</span>
                </li>
              {/each}
              {#if draft.lines.length > 10}<li class="more">and {draft.lines.length - 10} more lines</li>{/if}
            </ul>
            <div class="totals tnum">
              <span>Subtotal</span><span>{formatMoney(dtot.subtotal, draft.currency)}</span>
              {#if dtot.discount}<span>Discount</span><span>−{formatMoney(dtot.discount, draft.currency)}</span>{/if}
              {#if dtot.tax}<span>Tax ({draft.taxPct}%)</span><span>{formatMoney(dtot.tax, draft.currency)}</span>{/if}
              <b>Total</b><b>{formatMoney(dtot.total, draft.currency)}</b>
            </div>
          </div>
          <textarea class="field" rows="2" placeholder="Note on the bill (optional)" bind:value={notes} aria-label="Note on the bill"></textarea>
        {:else}
          <p class="empty">No billable work for this client in this period that isn't billed yet.</p>
        {/if}
      {/if}
      {#if err}<p class="error">{err}</p>{/if}
      <div class="actions">
        <button class="btn btn-quiet" onclick={() => (making = false)}>Cancel</button>
        <button class="btn btn-primary" onclick={saveBill} disabled={!draft?.lines.length}><Icon name="receipt" size={14} /> Save bill</button>
      </div>
    </div>
  {/if}

  {#if bills.length}
    <ul class="bills">
      {#each bills as inv, i (inv.id)}
        {@const t = work.totals(inv)}
        {@const c = work.client(inv.clientId)}
        <li in:fly={{ y: 6, duration: view.reducedMotion ? 0 : 240, delay: view.reducedMotion ? 0 : i * 25, easing: cubicOut }}>
          <div class="btop">
            <span class="num"><Icon name="file-text" size={15} /> {inv.number}</span>
            <span class="status {inv.status}">{inv.status === 'draft' ? 'Draft' : inv.status === 'sent' ? 'Sent' : 'Paid'}</span>
            <span class="total tnum">{formatMoney(t.total, inv.currency)}</span>
          </div>
          <p class="meta">{c?.name ?? 'Client'} · {date(inv.from)} – {date(inv.to)} · due {date(inv.dueDate)}</p>
          <div class="bacts">
            <button class="btn btn-soft sm" onclick={() => exportHtml(inv)}><Icon name="printer" size={13} /> Print / PDF</button>
            <button class="btn btn-quiet sm" onclick={() => exportCsv(inv)}><Icon name="download" size={13} /> CSV</button>
            {#if inv.status === 'draft'}<button class="btn btn-quiet sm" onclick={() => work.markSent(inv.id)}>Mark sent</button>{/if}
            {#if inv.status !== 'paid'}<button class="btn btn-quiet sm" onclick={() => work.markPaid(inv.id, todayISO())}><Icon name="check" size={13} /> Mark paid</button>{/if}
            <span class="sp"></span>
            {#if confirmDelete === inv.id}
              <button class="btn btn-danger sm" onclick={() => ((confirmDelete = null), work.removeInvoice(inv.id))}>Delete bill</button>
              <button class="btn btn-quiet sm" onclick={() => (confirmDelete = null)}>Keep</button>
            {:else}
              <button class="icon-btn" onclick={() => (confirmDelete = inv.id)} aria-label={`Delete ${inv.number}`} title="Delete (its work becomes billable again)"><Icon name="trash-ui" size={14} /></button>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  {:else if !making && work.clients.length}
    <p class="empty">No bills yet. Make one from the work you finished.</p>
  {/if}
</section>

<section>
  <button class="disclose" onclick={() => (profileOpen = !profileOpen)} aria-expanded={profileOpen}>
    <Icon name={profileOpen ? 'chevron-down' : 'chevron-right'} size={14} />
    <span>Your details on bills</span>
    {#if profileEmpty}<span class="todo">Add your name</span>{/if}
  </button>
  {#if profileOpen}
    <div class="profile" transition:slide={{ duration: view.reducedMotion ? 0 : 200 }}>
      <input class="field" placeholder="Your name or business" value={work.profile.name} oninput={(e) => work.updateProfile({ name: e.currentTarget.value })} aria-label="Your name or business" />
      <input class="field" placeholder="Email" value={work.profile.email} oninput={(e) => work.updateProfile({ email: e.currentTarget.value })} aria-label="Your email" />
      <textarea class="field" rows="2" placeholder="Address" value={work.profile.address} oninput={(e) => work.updateProfile({ address: e.currentTarget.value })} aria-label="Your address"></textarea>
      <div class="pair">
        <input class="field" placeholder="Tax ID (optional)" value={work.profile.taxId ?? ''} oninput={(e) => work.updateProfile({ taxId: e.currentTarget.value || undefined })} aria-label="Tax ID" />
        <input class="field" placeholder="Prefix" value={work.profile.invoicePrefix} oninput={(e) => work.updateProfile({ invoicePrefix: e.currentTarget.value || 'INV' })} aria-label="Bill number prefix" />
      </div>
      <div class="pair">
        <label class="lab">Pay within <input class="field" type="number" min="0" max="120" value={work.profile.paymentTerms} oninput={(e) => work.updateProfile({ paymentTerms: Math.max(0, Number(e.currentTarget.value) || 0) })} aria-label="Payment terms in days" /> days</label>
        <label class="lab">Currency <input class="field cur" maxlength="3" value={work.settings.currency} oninput={(e) => e.currentTarget.value.length === 3 && work.updateSettings({ currency: e.currentTarget.value.toUpperCase() })} aria-label="Default currency" /></label>
      </div>
      <label class="row">
        <span>Bill finished blocks when no time was tracked</span>
        <input type="checkbox" class="switch" checked={work.settings.billPlanned} onchange={(e) => work.updateSettings({ billPlanned: e.currentTarget.checked })} />
      </label>
    </div>
  {/if}
</section>

<style>
  section {
    display: grid;
    gap: var(--s-3);
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  h4 {
    margin: 0;
    font-size: var(--t-xs);
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--ink-3);
  }
  .sm {
    height: 28px;
    padding: 0 10px;
    font-size: var(--t-xs);
  }
  .maker,
  .profile {
    display: grid;
    gap: var(--s-2);
    padding: var(--s-3);
    border-radius: var(--r-md);
    background: var(--sunken);
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-2);
    font-size: var(--t-sm);
  }
  .compact {
    width: auto;
    height: 32px;
  }
  .dates,
  .pair {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    font-size: var(--t-sm);
  }
  .dates .field,
  .pair > * {
    flex: 1;
    min-width: 0;
  }
  .lab {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--t-xs);
    color: var(--ink-2);
    white-space: nowrap;
  }
  .lab .field {
    width: 64px;
    flex: none;
  }
  .cur {
    text-transform: uppercase;
  }
  .preview {
    padding: var(--s-3);
    border-radius: var(--r-md);
    background: var(--raised);
    border: 1px solid var(--line);
  }
  .ptop {
    display: flex;
    justify-content: space-between;
    font-size: var(--t-xs);
    color: var(--ink-3);
    margin-bottom: 6px;
  }
  .ptop b {
    color: var(--ink);
    font-weight: 600;
  }
  .lines {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .lines li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    gap: 10px;
    padding: 5px 0;
    border-bottom: 1px solid var(--line);
    font-size: var(--t-xs);
  }
  .lines .d {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .lines .q {
    color: var(--ink-3);
  }
  .lines .a {
    min-width: 70px;
    text-align: right;
    font-weight: 500;
  }
  .lines .more {
    display: block;
    color: var(--ink-3);
    border: 0;
  }
  .totals {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 3px 16px;
    margin-top: 8px;
    font-size: var(--t-xs);
    color: var(--ink-2);
    text-align: right;
  }
  .totals b {
    font-size: var(--t-sm);
    color: var(--ink);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
  }
  .bills {
    display: grid;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .bills li {
    display: grid;
    gap: 6px;
    padding: 10px 12px;
    border-radius: var(--r-md);
    background: var(--raised);
    border: 1px solid var(--line);
  }
  .btop {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .num {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-weight: 600;
    font-size: var(--t-sm);
  }
  .status {
    padding: 1px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 500;
    color: var(--ink-2);
    background: var(--sunken);
  }
  .status.paid {
    color: var(--ink);
    box-shadow: inset 0 0 0 1px var(--line-strong);
  }
  .total {
    margin-left: auto;
    font-weight: 600;
  }
  .meta {
    margin: 0;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .bacts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .sp {
    flex: 1;
  }
  .disclose {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--t-sm);
    color: var(--ink-2);
  }
  .todo {
    margin-left: 6px;
    padding: 0 7px;
    border-radius: 999px;
    font-size: 11px;
    background: var(--sunken);
    color: var(--ink-2);
  }
  .empty {
    margin: 0;
    font-size: var(--t-sm);
    color: var(--ink-3);
  }
  .error {
    margin: 0;
    font-size: var(--t-sm);
    color: var(--danger);
  }
</style>
