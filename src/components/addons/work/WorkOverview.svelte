<script lang="ts">
  import { cubicOut } from 'svelte/easing';
  import { fly } from 'svelte/transition';
  import { formatMoney } from '../../../lib/addons/work/money';
  import { work } from '../../../lib/addons/work/work.svelte';
  import type { DateRange } from '../../../lib/addons/work/types';
  import { addDays, formatDuration, fromISODate, MINUTE, todayISO } from '../../../lib/engine/time';
  import Icon from '../../../lib/Icon.svelte';
  import { platform } from '../../../lib/platform';
  import { view } from '../../../lib/stores/view.svelte';
  import Segmented from '../../Segmented.svelte';
  import Columns from '../charts/Columns.svelte';
  import Meter from '../charts/Meter.svelte';
  import { chartColor } from '../charts/palette';
  import RankBars from '../charts/RankBars.svelte';
  import StatTile from '../charts/StatTile.svelte';

  let { ongo }: { ongo: (tab: 'projects' | 'bills') => void } = $props();

  let span = $state<'week' | 'month'>('week');
  let anchor = $state(todayISO());
  const range: DateRange = $derived(span === 'week' ? work.week(anchor) : work.month(anchor));
  const sum = $derived(work.summary(range));
  const items = $derived(work.items(range).filter((i) => i.billable));
  const unbilled = $derived(items.filter((i) => !i.invoiceId && i.amount > 0));
  const cur = $derived(sum.currency);
  const money = (m: number) => formatMoney(m, cur);
  const hours = (min: number) => formatDuration(min * MINUTE);

  const isCurrent = $derived(range.from <= todayISO() && todayISO() <= range.to);
  const title = $derived.by(() => {
    const a = fromISODate(range.from);
    const b = fromISODate(range.to);
    if (span === 'month') return a.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const same = a.getMonth() === b.getMonth();
    return `${a.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${b.toLocaleDateString(undefined, same ? { day: 'numeric' } : { month: 'short', day: 'numeric' })}`;
  });
  const vs = $derived(span === 'week' ? 'last week' : 'last month');

  function shift(dir: -1 | 1) {
    anchor = dir < 0 ? addDays(range.from, -1) : addDays(range.to, 1);
  }

  const days = $derived(
    sum.byDay.map((d) => {
      const dt = fromISODate(d.date);
      return {
        key: d.date,
        label: span === 'week' ? dt.toLocaleDateString(undefined, { weekday: 'narrow' }) : String(dt.getDate()),
        value: d.earned,
        tip: `${dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · ${hours(d.billedMinutes)}`,
        muted: d.date > todayISO(),
      };
    }),
  );
  const projects = $derived(
    sum.byProject
      .filter((p) => p.earned > 0 || p.billedMinutes > 0)
      .map((p) => ({ key: p.projectId, label: p.name, value: p.earned, color: chartColor(p.color), sub: hours(p.billedMinutes) })),
  );
  const clients = $derived(
    sum.byClient.filter((c) => c.earned > 0).map((c, i) => ({ key: c.clientId ?? `none-${i}`, label: c.name, value: c.earned, color: '#9AA4B8', sub: hours(c.billedMinutes) })),
  );

  async function exportItems() {
    const csv = work.itemsCsv(range);
    const where = await platform.exportFile(`Daybloom work ${range.from} to ${range.to}.csv`, csv, 'reveal');
    view.say(`Saved ${where.split(/[\\/]/).pop()}`);
  }
</script>

{#if !work.projects.length}
  <section class="hello" in:fly={{ y: 8, duration: view.reducedMotion ? 0 : 300, easing: cubicOut }}>
    <span class="mark"><Icon name="briefcase" size={22} /></span>
    <h3>Make your time count</h3>
    <ol>
      <li>Create a project, with a client and a rate.</li>
      <li>Open any block and choose the project.</li>
      <li>Finish the block. Daybloom adds it to your earnings.</li>
    </ol>
    <button class="btn btn-primary" onclick={() => ongo('projects')}><Icon name="plus" size={14} /> Create a project</button>
  </section>
{:else}
  <div class="period">
    <Segmented
      label="Period"
      value={span}
      options={[
        { value: 'week', label: 'Week' },
        { value: 'month', label: 'Month' },
      ]}
      onchange={(v) => ((span = v as 'week' | 'month'), (anchor = todayISO()))}
    />
    <div class="nav">
      <button class="icon-btn" onclick={() => shift(-1)} aria-label="Previous period"><Icon name="chevron-left" size={16} /></button>
      <span class="when">{title}</span>
      <button class="icon-btn" onclick={() => shift(1)} aria-label="Next period"><Icon name="chevron-right" size={16} /></button>
      {#if !isCurrent}<button class="btn btn-quiet sm" onclick={() => (anchor = todayISO())}>Now</button>{/if}
    </div>
  </div>

  {#key range.from + span}
    <section class="hero" in:fly={{ y: 6, duration: view.reducedMotion ? 0 : 280, easing: cubicOut }}>
      <StatTile hero label="Earned" value={money(sum.earned)} delta={sum.change.earned !== null ? { pct: sum.change.earned * 100, vs } : null} hint={sum.previous.earned ? '' : 'First period with earnings'} />
      <div class="tiles">
        <StatTile label="Billable time" value={hours(sum.billedMinutes)} delta={sum.change.billedMinutes !== null ? { pct: sum.change.billedMinutes * 100, vs } : null} />
        <StatTile label="Effective rate" value={sum.effectiveHourly !== null ? `${money(sum.effectiveHourly)}/h` : '—'} />
        <StatTile label="Not billed yet" value={money(sum.uninvoiced)} />
      </div>
    </section>

    <section>
      <h4>Earned each day</h4>
      <Columns items={days} color="#25976A" format={money} label={`Earned each day, ${title}`} reduced={view.reducedMotion} />
    </section>

    <div class="two">
      <section>
        <h4>By project</h4>
        <RankBars items={projects} format={money} empty="No billable time in this period." reduced={view.reducedMotion} />
      </section>
      <section>
        <h4>By client</h4>
        <RankBars items={clients} format={money} empty="No clients billed in this period." reduced={view.reducedMotion} />
      </section>
    </div>

    {#if sum.budgets.length}
      <section>
        <h4>Budgets</h4>
        <ul class="budgets">
          {#each sum.budgets as b (b.projectId)}
            {@const p = work.project(b.projectId)}
            {#if p}
              <li>
                <span class="bn"><i style:background={chartColor(p.color)}></i>{p.name}</span>
                <span class="bv tnum">{b.kind === 'hours' ? `${Math.round(b.used * 10) / 10} of ${b.budget} h` : `${money(b.used)} of ${money(b.budget)}`}</span>
                <Meter used={b.pct / 100} color={chartColor(p.color)} label={`${p.name} budget`} />
              </li>
            {/if}
          {/each}
        </ul>
      </section>
    {/if}

    <section>
      <div class="head">
        <h4>Not billed yet <span class="count tnum">{unbilled.length}</span></h4>
        <div class="acts">
          <button class="btn btn-quiet sm" onclick={exportItems}><Icon name="download" size={13} /> CSV</button>
          {#if unbilled.length}<button class="btn btn-soft sm" onclick={() => ongo('bills')}><Icon name="receipt" size={13} /> Make a bill</button>{/if}
        </div>
      </div>
      {#if unbilled.length}
        <ul class="items">
          {#each unbilled.slice(0, 8) as it (it.key)}
            <li>
              <i style:background={chartColor(it.projectColor)}></i>
              <span class="t"><b>{it.title}</b><small>{it.projectName}{it.clientName ? ` · ${it.clientName}` : ''} · {fromISODate(it.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</small></span>
              <span class="m tnum">{it.rate.kind === 'fixed' ? 'Fixed' : hours(it.billedMinutes)}</span>
              <span class="a tnum">{formatMoney(it.amount, it.currency)}</span>
            </li>
          {/each}
          {#if unbilled.length > 8}<li class="more">and {unbilled.length - 8} more</li>{/if}
        </ul>
      {:else}
        <p class="empty">Everything in this period is on a bill.</p>
      {/if}
    </section>
  {/key}
{/if}

<style>
  .hello {
    display: grid;
    justify-items: start;
    gap: var(--s-3);
    padding: var(--s-4);
    border-radius: var(--r-lg);
    background: color-mix(in srgb, #25976a 7%, var(--raised));
    border: 1px solid color-mix(in srgb, #25976a 25%, var(--line));
  }
  .mark {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border-radius: 14px;
    color: #fff;
    background: #25976a;
  }
  .hello h3 {
    margin: 0;
    font-size: var(--t-lg);
  }
  ol {
    margin: 0;
    padding-left: 1.2em;
    display: grid;
    gap: 4px;
    font-size: var(--t-sm);
    color: var(--ink-2);
  }
  .period {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-2);
  }
  .nav {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .when {
    min-width: 120px;
    text-align: center;
    font-size: var(--t-sm);
    font-weight: 500;
  }
  .sm {
    height: 28px;
    padding: 0 10px;
    font-size: var(--t-xs);
  }
  .hero {
    display: grid;
    gap: var(--s-4);
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--s-3);
    padding-top: var(--s-3);
    border-top: 1px solid var(--line);
  }
  h4 {
    margin: 0 0 var(--s-3);
    font-size: var(--t-xs);
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--ink-3);
  }
  .two {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--s-5);
  }
  .budgets {
    display: grid;
    gap: var(--s-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .budgets li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 4px 8px;
    font-size: var(--t-sm);
  }
  .budgets li :global(.meter) {
    grid-column: 1 / -1;
  }
  .bn {
    display: flex;
    align-items: center;
    gap: 7px;
    font-weight: 500;
  }
  .bn i,
  .items i {
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
  .bv {
    color: var(--ink-2);
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-2);
  }
  .head h4 {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .count {
    padding: 0 6px;
    border-radius: 999px;
    background: var(--sunken);
    color: var(--ink-2);
    letter-spacing: 0;
  }
  .acts {
    display: flex;
    gap: 6px;
  }
  .items {
    display: grid;
    gap: 2px;
    margin: var(--s-3) 0 0;
    padding: 0;
    list-style: none;
  }
  .items li {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 4px;
    border-bottom: 1px solid var(--line);
    font-size: var(--t-sm);
  }
  .items .t {
    flex: 1;
    min-width: 0;
    display: grid;
  }
  .items .t b {
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .items .t small,
  .items .m {
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .items .a {
    min-width: 72px;
    text-align: right;
    font-weight: 500;
  }
  .items .more,
  .empty {
    font-size: var(--t-xs);
    color: var(--ink-3);
    border: 0;
  }
  .empty {
    margin: var(--s-2) 0 0;
  }
</style>
