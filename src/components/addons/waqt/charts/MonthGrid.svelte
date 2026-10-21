<script lang="ts">
  // The month as a heatmap: a row per prayer, a column per day, each cell one calm step (in
  // jamaat, on time, made up, not marked). Qasr cells have a small notch cut from a corner.
  // Cells pop in once in a wave; hover or arrow keys (Home/End too) show a cell's details,
  // and its prayer and day light up at the edges.
  import { PRAYER_NAME, PRAYERS } from '../../../../lib/addons/waqt/types';
  import type { GridDay } from '../../../../lib/addons/waqt/analytics';
  import ChartTip from './ChartTip.svelte';
  import { boxIn, dayLabel, KIND_WORD, step, type Box } from './kinds';

  let { days, today, reduced = false }: { days: GridDay[]; today: string; reduced?: boolean } = $props();

  const n = $derived(days.length);
  // Day numbers under the columns: today and each week back, with the month where it changes.
  const ticks = $derived.by(() => {
    let lastMonth = -1;
    return days.map((d, i) => {
      if ((n - 1 - i) % 7) return '';
      const dt = new Date(`${d.date}T12:00:00`);
      const m = dt.getMonth();
      const label = m !== lastMonth ? dt.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : String(dt.getDate());
      lastMonth = m;
      return label;
    });
  });

  function words(r: number, c: number) {
    const d = days[c];
    const id = PRAYERS[r];
    const k = d.kinds[id];
    const extra = [d.qasr[id] ? 'qasr' : '', d.after[id] != null ? marked(d.after[id]!) : ''].filter(Boolean);
    return { k, title: KIND_WORD[k], sub: `${PRAYER_NAME[id]} · ${dayLabel(d.date)}`, extra: extra.join(' · ') };
  }
  const marked = (m: number) => (m < 1 ? 'marked at the adhan' : `marked ${m} min after the adhan`);

  let chart = $state<HTMLDivElement>();
  let cells: HTMLElement[] = $state([]);
  let active = $state(-1);
  // Start on today's Fajr: the newest column.
  const focusIndex = $derived(active >= 0 ? active : n - 1);
  let shown = $state<{ i: number; box: Box } | null>(null);
  const hr = $derived(shown ? Math.floor(shown.i / n) : -1);
  const hc = $derived(shown ? shown.i % n : -1);

  function show(i: number) {
    if (!chart || !cells[i]) return;
    shown = { i, box: boxIn(cells[i], chart) };
  }
  function onkey(e: KeyboardEvent) {
    const next = step(e.key, focusIndex, n * PRAYERS.length, n);
    if (next == null) return;
    e.preventDefault();
    active = next;
    cells[next]?.focus();
  }
</script>

<div class="heat" class:still={reduced} bind:this={chart} style:--n={n} role="presentation" onpointerleave={() => (shown = null)}>
  <div class="grid" role="grid" aria-label={`The last ${n} days, a row for each prayer`} tabindex="-1" onkeydown={onkey}>
    {#each PRAYERS as id, r (id)}
      <div class="row" role="row">
        <span class="name" class:on={hr === r} role="rowheader">{PRAYER_NAME[id]}</span>
        {#each days as d, c (d.date)}
          {@const i = r * n + c}
          {@const w = words(r, c)}
          <span
            class="cell {d.kinds[id]}"
            class:qasr={!!d.qasr[id]}
            class:on={shown?.i === i}
            role="gridcell"
            tabindex={i === focusIndex ? 0 : -1}
            aria-label={`${w.sub}: ${w.title}${w.extra ? `, ${w.extra}` : ''}`}
            bind:this={cells[i]}
            style:--d={`${c * 11 + r * 34}ms`}
            onpointerenter={() => show(i)}
            onfocus={() => ((active = i), show(i))}
            onblur={() => (shown = null)}
          ></span>
        {/each}
      </div>
    {/each}
  </div>
  <div class="ticks" aria-hidden="true">
    <span></span>
    {#each ticks as t, c (c)}
      <span class:on={hc === c} class:today={days[c]?.date === today} class:end={c === n - 1}>{#if hc === c}<em>{new Date(`${days[c].date}T12:00:00`).getDate()}</em>{:else if t && (hc < 0 || Math.abs(c - hc) > 3)}<em>{t}</em>{/if}</span>
    {/each}
  </div>
  {#if shown}
    {@const w = words(hr, hc)}
    <ChartTip box={shown.box}>
      <span class="k"><i style:background={`var(--k-${w.k})`}></i><b>{w.title}</b><em></em></span>
      <span class="dim">{w.sub}</span>
      {#if w.extra}<span class="dim">{w.extra.replace(/^./, (x) => x.toUpperCase())}</span>{/if}
    </ChartTip>
  {/if}
</div>

<style>
  .heat {
    position: relative;
  }
  .grid {
    display: grid;
    gap: 3px;
    outline: none;
  }
  .row,
  .ticks {
    display: grid;
    grid-template-columns: 52px repeat(var(--n), minmax(0, 1fr));
    column-gap: 2px;
    align-items: center;
  }
  .name {
    font-size: var(--t-xs);
    color: var(--ink-3);
    white-space: nowrap;
    transition: color var(--dur-1) var(--ease-out);
  }
  .name.on {
    color: var(--ink);
  }
  .cell {
    display: block;
    aspect-ratio: 4 / 5;
    min-height: 8px;
    border-radius: 3px;
    background: var(--k-missed);
    transition:
      transform var(--dur-1) var(--ease-out),
      box-shadow var(--dur-1) var(--ease-out);
    animation: pop 380ms cubic-bezier(0.34, 1.56, 0.64, 1) var(--d) backwards;
  }
  .cell.jamaat {
    background: var(--k-jamaat);
  }
  .cell.ontime {
    background: var(--k-ontime);
  }
  .cell.late {
    background: var(--k-late);
  }
  .cell.open,
  .cell.ahead {
    background: transparent;
    box-shadow: inset 0 0 0 1.5px var(--k-ahead-line);
  }
  .cell.open {
    box-shadow: inset 0 0 0 1.5px var(--k-open-line);
  }
  .cell.before {
    background: transparent;
    box-shadow: inset 0 0 0 1px var(--line);
  }
  /* Qasr: a corner notch in the panel's own colour (shape, not colour, carries it). */
  .cell.qasr {
    background-image: linear-gradient(135deg, transparent 62%, var(--raised) 62%);
  }
  .cell.on {
    position: relative;
    z-index: 1;
    transform: scale(1.4);
    box-shadow: 0 0 0 2px var(--raised);
  }
  .cell:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }
  .ticks {
    margin-top: 5px;
    height: 14px;
  }
  .ticks span {
    position: relative;
  }
  .ticks em {
    position: absolute;
    left: 50%;
    top: 0;
    transform: translateX(-50%);
    font-style: normal;
    font-size: 10.5px;
    color: var(--ink-3);
    white-space: nowrap;
  }
  /* The newest day's label ends at the edge rather than spilling past it. */
  .ticks .end em {
    left: auto;
    right: 0;
    transform: none;
  }
  .ticks .today em {
    color: var(--ink);
    font-weight: 600;
  }
  .ticks .on em {
    z-index: 1;
    padding: 0 3px;
    border-radius: 4px;
    background: var(--raised);
    color: var(--ink);
    font-weight: 600;
  }
  @keyframes pop {
    from {
      transform: scale(0.2);
      opacity: 0;
    }
  }
  .still .cell,
  :global([data-motion='calm']) .cell {
    animation: none;
  }
</style>
