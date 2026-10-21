<script lang="ts">
  // The week as stacks: each day is a column of five bricks, filled from the bottom by how its
  // prayers went (in jamaat, on time, made up), then the ones not marked, then any still ahead.
  // A day with all five gets a small check. Bricks spring up once; hover or arrow keys show
  // the day's five prayers in a tip.
  import { tally, type GridDay } from '../../../../lib/addons/waqt/analytics';
  import { PRAYER_NAME, PRAYERS } from '../../../../lib/addons/waqt/types';
  import Icon from '../../../../lib/Icon.svelte';
  import ChartTip from './ChartTip.svelte';
  import { boxIn, dayLabel, KIND_WORD, STACK, step, weekdayLabel, type Box } from './kinds';

  let { days, today, reduced = false }: { days: GridDay[]; today: string; reduced?: boolean } = $props();

  const cols = $derived(
    days.map((d) => {
      const t = tally(d.kinds);
      const bricks = STACK.flatMap((k) => PRAYERS.filter((id) => d.kinds[id] === k).map(() => k));
      const prayed = t.jamaat + t.ontime + t.late;
      const counted = prayed + t.missed;
      const words = PRAYERS.map((id) => `${PRAYER_NAME[id]} ${KIND_WORD[d.kinds[id]].toLowerCase()}${d.qasr[id] ? ' (qasr)' : ''}`).join(', ');
      const head = t.before === 5 ? 'before you started' : counted ? (prayed === 5 ? 'all five prayed' : `${prayed} of ${counted} prayed`) : 'still ahead';
      return { d, t, bricks, prayed, counted, full: prayed === 5, head, label: `${dayLabel(d.date)}: ${head}. ${t.before === 5 ? '' : words}` };
    }),
  );

  let chart = $state<HTMLDivElement>();
  let cells: HTMLElement[] = $state([]);
  let active = $state(-1);
  const focusIndex = $derived(active >= 0 ? active : cols.length - 1);
  let shown = $state<{ i: number; box: Box } | null>(null);

  function show(i: number) {
    if (!chart || !cells[i]) return;
    shown = { i, box: boxIn(cells[i], chart) };
  }
  function onkey(e: KeyboardEvent) {
    const next = step(e.key, focusIndex, cols.length);
    if (next == null) return;
    e.preventDefault();
    active = next;
    cells[next]?.focus();
  }
</script>

<div class="stacks" class:still={reduced} bind:this={chart} role="grid" aria-label="Each day of the week: how its five prayers went" tabindex="-1" onkeydown={onkey} onpointerleave={() => (shown = null)}>
  <div class="row" role="row">
    {#each cols as c, i (c.d.date)}
      <div
        class="day"
        class:today={c.d.date === today}
        class:on={shown?.i === i}
        role="gridcell"
        tabindex={i === focusIndex ? 0 : -1}
        aria-label={c.label}
        bind:this={cells[i]}
        onpointerenter={() => show(i)}
        onfocus={() => ((active = i), show(i))}
        onblur={() => (shown = null)}
      >
        <span class="cap" aria-hidden="true">
          {#if c.full}<span class="check" style:--d={`${i * 45 + 330}ms`}><Icon name="check" size={11} stroke={2.6} /></span>{/if}
        </span>
        <span class="col" aria-hidden="true">
          {#each c.bricks as k, j (j)}
            <i class="b {k}" style:--d={`${i * 45 + j * 38}ms`}></i>
          {/each}
        </span>
        <span class="lbl" aria-hidden="true">{weekdayLabel(c.d.date)}</span>
      </div>
    {/each}
  </div>
  {#if shown && cols[shown.i]}
    {@const c = cols[shown.i]}
    <ChartTip box={shown.box} place="beside">
      <b>{c.head.replace(/^./, (x) => x.toUpperCase())}</b>
      <span class="dim">{dayLabel(c.d.date)}</span>
      {#if c.t.before < 5}
        {#each PRAYERS as id (id)}
          <span class="k"><i style:background={`var(--k-${c.d.kinds[id]})`}></i>{PRAYER_NAME[id]}<em>{KIND_WORD[c.d.kinds[id]]}{c.d.qasr[id] ? ' · qasr' : ''}</em></span>
        {/each}
      {/if}
    </ChartTip>
  {/if}
</div>

<style>
  .stacks {
    position: relative;
    outline: none;
  }
  .row {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 4px;
  }
  .day {
    display: grid;
    justify-items: center;
    gap: 5px;
    padding: 4px 0 6px;
    border-radius: var(--r-sm);
    transition: background var(--dur-1) var(--ease-out);
  }
  .day.on {
    background: color-mix(in srgb, var(--ink) 5%, transparent);
  }
  .day:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 0;
  }
  .cap {
    display: grid;
    place-items: center;
    height: 14px;
  }
  .check {
    display: grid;
    place-items: center;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    color: var(--k-jamaat);
    animation: pop 420ms cubic-bezier(0.34, 1.56, 0.64, 1) var(--d) both;
  }
  .col {
    display: flex;
    flex-direction: column-reverse;
    gap: 2px;
    width: min(24px, 70%);
  }
  .b {
    display: block;
    height: 15px;
    border-radius: 4px;
    background: var(--k-missed);
    transform-origin: 50% 100%;
    animation: rise 560ms cubic-bezier(0.34, 1.5, 0.64, 1) var(--d) both;
  }
  .b.jamaat {
    background: var(--k-jamaat);
  }
  .b.ontime {
    background: var(--k-ontime);
  }
  .b.late {
    background: var(--k-late);
  }
  .b.open,
  .b.ahead {
    background: transparent;
    box-shadow: inset 0 0 0 1.5px var(--k-ahead-line);
  }
  .b.open {
    box-shadow: inset 0 0 0 1.5px var(--k-open-line);
  }
  .b.before {
    background: transparent;
    box-shadow: inset 0 0 0 1px var(--line);
  }
  .lbl {
    font-size: 10.5px;
    color: var(--ink-3);
  }
  .today .lbl {
    color: var(--ink);
    font-weight: 600;
  }
  @keyframes rise {
    from {
      transform: scaleY(0);
      opacity: 0;
    }
  }
  @keyframes pop {
    from {
      transform: scale(0);
      opacity: 0;
    }
  }
  .still .b,
  .still .check,
  :global([data-motion='calm']) .b,
  :global([data-motion='calm']) .check {
    animation: none;
  }
</style>
