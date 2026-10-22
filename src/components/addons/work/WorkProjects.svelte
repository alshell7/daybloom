<script lang="ts">
  import { cubicOut } from 'svelte/easing';
  import { fly, slide } from 'svelte/transition';
  import { formatMoney, fromMinor, toMinor } from '../../../lib/addons/work/money';
  import { work } from '../../../lib/addons/work/work.svelte';
  import type { Client, Project, Rate } from '../../../lib/addons/work/types';
  import { CATEGORIES } from '../../../lib/engine/categories';
  import { formatDuration, MINUTE } from '../../../lib/engine/time';
  import Icon from '../../../lib/Icon.svelte';
  import { view } from '../../../lib/stores/view.svelte';
  import Segmented from '../../Segmented.svelte';
  import Meter from '../charts/Meter.svelte';
  import { CHART_ORDER, chartColor } from '../charts/palette';

  const month = $derived(work.summary(work.month()));
  const stat = (id: string) => month.byProject.find((p) => p.projectId === id);
  const burn = (id: string) => month.budgets.find((b) => b.projectId === id);

  const currencyOf = (clientId?: string) => (clientId ? work.client(clientId)?.currency : undefined) ?? work.settings.currency;
  function rateLabel(r: Rate, currency: string) {
    if (r.kind === 'hourly') return `${formatMoney(r.amount, currency)}/h`;
    if (r.kind === 'fixed') return `${formatMoney(r.amount, currency)} per block`;
    return 'Client rate';
  }

  // ---- project form (new or edit)
  let editing = $state<string | 'new' | null>(null);
  let f = $state({ name: '', clientId: '', newClient: '', color: 'focus' as string, kind: 'hourly' as Rate['kind'], amount: '', budgetKind: 'none' as 'none' | 'hours' | 'money', budget: '' });

  function startNew() {
    f = { name: '', clientId: work.clients.find((c) => !c.archived)?.id ?? '', newClient: '', color: CHART_ORDER[work.projects.length % CHART_ORDER.length], kind: 'hourly', amount: '', budgetKind: 'none', budget: '' };
    editing = 'new';
  }
  function startEdit(p: Project) {
    const cur = currencyOf(p.clientId);
    f = {
      name: p.name,
      clientId: p.clientId ?? '',
      newClient: '',
      color: p.color,
      kind: p.rate.kind,
      amount: p.rate.kind === 'none' ? '' : String(fromMinor(p.rate.amount, cur)),
      budgetKind: p.budget?.kind ?? 'none',
      budget: p.budget ? String(p.budget.kind === 'money' ? fromMinor(p.budget.amount, cur) : p.budget.amount) : '',
    };
    editing = p.id;
  }
  function save(e: SubmitEvent) {
    e.preventDefault();
    if (!f.name.trim()) return;
    let clientId: string | undefined = f.clientId || undefined;
    if (f.clientId === '__new' && f.newClient.trim()) clientId = work.addClient({ name: f.newClient.trim(), currency: work.settings.currency }).id;
    else if (f.clientId === '__new') clientId = undefined;
    const cur = currencyOf(clientId);
    const amount = Number(String(f.amount).replace(',', '.'));
    const rate: Rate = f.kind === 'none' || !Number.isFinite(amount) || amount <= 0 ? { kind: 'none' } : { kind: f.kind, amount: toMinor(amount, cur) };
    const b = Number(String(f.budget).replace(',', '.'));
    const budget = f.budgetKind !== 'none' && Number.isFinite(b) && b > 0 ? { kind: f.budgetKind, amount: f.budgetKind === 'money' ? toMinor(b, cur) : b } : undefined;
    if (editing === 'new') {
      work.addProject({ name: f.name.trim(), clientId, color: f.color, rate, budget });
      view.say(`Project “${f.name.trim()}” is ready. Open a block to bill it.`);
    } else if (editing) work.updateProject(editing, { name: f.name.trim(), clientId, color: f.color, rate, budget });
    editing = null;
  }

  // ---- clients
  let clientEdit = $state<string | 'new' | null>(null);
  let c = $state({ name: '', email: '', address: '', currency: 'USD', taxPct: '' });
  function startClient(cl?: Client) {
    c = cl
      ? { name: cl.name, email: cl.email ?? '', address: cl.address ?? '', currency: cl.currency, taxPct: cl.taxPct != null ? String(cl.taxPct) : '' }
      : { name: '', email: '', address: '', currency: work.settings.currency, taxPct: '' };
    clientEdit = cl?.id ?? 'new';
  }
  function saveClient(e: SubmitEvent) {
    e.preventDefault();
    if (!c.name.trim()) return;
    const tax = Number(c.taxPct);
    const patch = { name: c.name.trim(), email: c.email.trim() || undefined, address: c.address.trim() || undefined, currency: c.currency.trim().toUpperCase() || 'USD', taxPct: Number.isFinite(tax) && c.taxPct !== '' ? tax : undefined };
    if (clientEdit === 'new') work.addClient(patch);
    else if (clientEdit) work.updateClient(clientEdit, patch);
    clientEdit = null;
  }

  const active = $derived(work.projects.filter((p) => !p.archived));
  const archived = $derived(work.projects.filter((p) => p.archived));
</script>

<section>
  <div class="head">
    <h4>Projects</h4>
    <button class="btn btn-soft sm" onclick={startNew}><Icon name="plus" size={13} /> New project</button>
  </div>

  {#if editing}
    <form class="form" onsubmit={save} transition:slide={{ duration: view.reducedMotion ? 0 : 200 }}>
      <input class="field" placeholder="Project name" bind:value={f.name} aria-label="Project name" />
      <div class="pair">
        <select class="field" bind:value={f.clientId} aria-label="Client">
          <option value="">No client</option>
          {#each work.clients.filter((x) => !x.archived) as cl (cl.id)}<option value={cl.id}>{cl.name}</option>{/each}
          <option value="__new">New client…</option>
        </select>
        {#if f.clientId === '__new'}<input class="field" placeholder="Client name" bind:value={f.newClient} aria-label="New client name" />{/if}
      </div>
      <div class="row">
        <span>Rate</span>
        <Segmented
          label="Rate kind"
          value={f.kind}
          options={[
            { value: 'hourly', label: 'Per hour' },
            { value: 'fixed', label: 'Per block' },
            { value: 'none', label: 'Client rate' },
          ]}
          onchange={(v) => (f.kind = v as Rate['kind'])}
        />
      </div>
      {#if f.kind !== 'none'}
        <label class="money"><span>{currencyOf(f.clientId && f.clientId !== '__new' ? f.clientId : undefined)}</span><input class="field" inputmode="decimal" placeholder={f.kind === 'hourly' ? '60' : '250'} bind:value={f.amount} aria-label="Rate amount" /></label>
      {/if}
      <div class="row">
        <span>Budget</span>
        <Segmented
          label="Budget kind"
          value={f.budgetKind}
          options={[
            { value: 'none', label: 'None' },
            { value: 'hours', label: 'Hours' },
            { value: 'money', label: 'Money' },
          ]}
          onchange={(v) => (f.budgetKind = v as typeof f.budgetKind)}
        />
      </div>
      {#if f.budgetKind !== 'none'}
        <input class="field" inputmode="decimal" placeholder={f.budgetKind === 'hours' ? 'Hours, e.g. 40' : 'Amount, e.g. 5000'} bind:value={f.budget} aria-label="Budget amount" />
      {/if}
      <div class="row">
        <span>Colour</span>
        <div class="colors" role="radiogroup" aria-label="Project colour">
          {#each CHART_ORDER as id (id)}
            <button type="button" class="sw" class:on={f.color === id} style:--sw={chartColor(id)} role="radio" aria-checked={f.color === id} aria-label={CATEGORIES.find((x) => x.id === id)?.label} onclick={() => (f.color = id)}></button>
          {/each}
        </div>
      </div>
      <div class="actions">
        <button type="button" class="btn btn-quiet" onclick={() => (editing = null)}>Cancel</button>
        <button class="btn btn-primary" disabled={!f.name.trim()}>{editing === 'new' ? 'Create project' : 'Save'}</button>
      </div>
    </form>
  {/if}

  {#if active.length}
    <ul class="projects">
      {#each active as p, i (p.id)}
        {@const st = stat(p.id)}
        {@const b = burn(p.id)}
        {@const cur = currencyOf(p.clientId)}
        <li in:fly={{ y: 6, duration: view.reducedMotion ? 0 : 240, delay: view.reducedMotion ? 0 : i * 30, easing: cubicOut }}>
          <button class="proj" onclick={() => startEdit(p)} title="Edit project">
            <i style:background={chartColor(p.color)}></i>
            <span class="t"><b>{p.name}</b><small>{p.clientId ? (work.client(p.clientId)?.name ?? '') + ' · ' : ''}{rateLabel(p.rate, cur)}</small></span>
            <span class="m tnum">{st ? formatMoney(st.earned, cur) : formatMoney(0, cur)}<small>{st ? formatDuration(st.billedMinutes * MINUTE) : '0m'} this month</small></span>
          </button>
          {#if b}<Meter used={b.pct / 100} color={chartColor(p.color)} label={`${p.name} budget`} />{/if}
          <div class="tools">
            <button class="icon-btn" onclick={() => work.updateProject(p.id, { archived: true })} title="Archive" aria-label={`Archive ${p.name}`}><Icon name="archive" size={14} /></button>
          </div>
        </li>
      {/each}
    </ul>
  {:else if !editing}
    <p class="empty">No projects yet. A project groups work for one client and sets its rate.</p>
  {/if}
  {#if archived.length}
    <details class="arch">
      <summary>Archived ({archived.length})</summary>
      {#each archived as p (p.id)}
        <div class="arow"><span>{p.name}</span><button class="btn btn-quiet sm" onclick={() => work.updateProject(p.id, { archived: false })}>Restore</button></div>
      {/each}
    </details>
  {/if}
</section>

<section>
  <div class="head">
    <h4>Clients</h4>
    <button class="btn btn-quiet sm" onclick={() => startClient()}><Icon name="plus" size={13} /> New client</button>
  </div>
  {#if clientEdit}
    <form class="form" onsubmit={saveClient} transition:slide={{ duration: view.reducedMotion ? 0 : 200 }}>
      <input class="field" placeholder="Client name" bind:value={c.name} aria-label="Client name" />
      <div class="pair">
        <input class="field" placeholder="Email (for bills)" bind:value={c.email} aria-label="Client email" />
        <input class="field cur" placeholder="USD" maxlength="3" bind:value={c.currency} aria-label="Currency" />
      </div>
      <textarea class="field" rows="2" placeholder="Address (printed on bills)" bind:value={c.address} aria-label="Client address"></textarea>
      <input class="field" inputmode="decimal" placeholder="Tax % on bills (optional)" bind:value={c.taxPct} aria-label="Tax percent" />
      <div class="actions">
        <button type="button" class="btn btn-quiet" onclick={() => (clientEdit = null)}>Cancel</button>
        <button class="btn btn-primary" disabled={!c.name.trim()}>{clientEdit === 'new' ? 'Add client' : 'Save'}</button>
      </div>
    </form>
  {/if}
  {#if work.clients.filter((x) => !x.archived).length}
    <ul class="clients">
      {#each work.clients.filter((x) => !x.archived) as cl (cl.id)}
        <li>
          <button class="cl" onclick={() => startClient(cl)}>
            <span class="av">{cl.name.slice(0, 1).toUpperCase()}</span>
            <span class="t"><b>{cl.name}</b><small>{cl.currency}{cl.email ? ` · ${cl.email}` : ''}</small></span>
            <span class="m">{work.projects.filter((p) => p.clientId === cl.id && !p.archived).length} projects</span>
          </button>
        </li>
      {/each}
    </ul>
  {:else if !clientEdit}
    <p class="empty">Clients appear on bills. You can also add one while you create a project.</p>
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
  .form {
    display: grid;
    gap: var(--s-2);
    padding: var(--s-3);
    border-radius: var(--r-md);
    background: var(--sunken);
  }
  .pair {
    display: flex;
    gap: var(--s-2);
  }
  .pair > * {
    flex: 1;
    min-width: 0;
  }
  .pair .cur {
    flex: 0 0 76px;
    text-transform: uppercase;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-2);
    font-size: var(--t-sm);
  }
  .money {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--t-sm);
    color: var(--ink-3);
  }
  .money .field {
    flex: 1;
  }
  .colors {
    display: flex;
    gap: 6px;
  }
  .sw {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--sw);
    transition: box-shadow var(--dur-2) var(--ease-out);
  }
  .sw.on {
    box-shadow:
      0 0 0 2px var(--sunken),
      0 0 0 4px var(--ink);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
  }
  .projects,
  .clients {
    display: grid;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .projects li {
    position: relative;
    display: grid;
    gap: 6px;
    padding: 10px 12px;
    border-radius: var(--r-md);
    background: var(--raised);
    border: 1px solid var(--line);
  }
  .proj,
  .cl {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    text-align: left;
  }
  .proj i {
    flex: none;
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }
  .t {
    flex: 1;
    min-width: 0;
    display: grid;
  }
  .t b {
    font-weight: 500;
    font-size: var(--t-sm);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .t small,
  .m small,
  .cl .m {
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .m {
    display: grid;
    justify-items: end;
    font-size: var(--t-sm);
    font-weight: 500;
  }
  .tools {
    position: absolute;
    right: 6px;
    bottom: 6px;
    opacity: 0;
    transition: opacity var(--dur-1) var(--ease-out);
  }
  .projects li:hover .tools,
  .projects li:focus-within .tools {
    opacity: 1;
  }
  .clients li {
    padding: 8px 10px;
    border-radius: var(--r-md);
  }
  .clients li:hover {
    background: var(--sunken);
  }
  .av {
    display: grid;
    place-items: center;
    flex: none;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    font-size: var(--t-xs);
    font-weight: 600;
    color: var(--ink-2);
    background: var(--sunken);
  }
  .empty {
    margin: 0;
    font-size: var(--t-sm);
    color: var(--ink-3);
  }
  .arch summary {
    font-size: var(--t-xs);
    color: var(--ink-3);
    cursor: pointer;
  }
  .arow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 0;
    font-size: var(--t-sm);
  }

  /* A touch screen has no hover to reveal it: it always shows. */
  @media (hover: none) {
    .projects li .tools {
      opacity: 1;
      visibility: visible;
    }
  }
</style>
