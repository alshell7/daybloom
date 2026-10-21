<script lang="ts">
  // When you marked each prayer, against its adhan: a strip per prayer, one dot per prayer
  // marked on time or in jamaat (where they gather is your usual), and a small tick at the
  // middle one. Dots settle in once; hover a dot for its day, or arrow through the prayers.
  import { minutesInWords, type PrayerTiming } from '../../../../lib/addons/waqt/analytics';
  import { PRAYER_NAME } from '../../../../lib/addons/waqt/types';
  import ChartTip from './ChartTip.svelte';
  import { boxIn, dayLabel, step, type Box } from './kinds';

  let { prayers, all, reduced = false }: { prayers: PrayerTiming[]; all: number[]; reduced?: boolean } = $props();

  const rows = $derived(prayers.filter((p) => p.marks.length));
  // The scale: an hour, or up to where nine in ten marks fall (at most four hours).
  const span = $derived.by(() => {
    const s = [...all].sort((a, b) => a - b);
    const p90 = s.length ? s[Math.min(s.length - 1, Math.floor(s.length * 0.9))] : 0;
    return Math.min(240, Math.max(60, Math.ceil(p90 / 30) * 30));
  });
  const pos = (m: number) => `${(Math.min(m, span) / span) * 100}%`;
  const hm = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`);
  const after = (m: number) => (m < 1 ? 'At the adhan' : `${m} min after the adhan`);
  const rowLabel = (p: PrayerTiming) =>
    `${PRAYER_NAME[p.id]}: ${p.marks.length} marked${p.within != null ? `, usually within ${minutesInWords(p.within)} of the adhan` : p.median != null ? `, about ${Math.round(p.median)} minutes after the adhan` : ''}`;

  let chart = $state<HTMLDivElement>();
  let cells: HTMLElement[] = $state([]);
  let active = $state(0);
  let shown = $state<{ box: Box; row: number; dot: number | null } | null>(null);

  function showRow(r: number) {
    if (!chart || !cells[r]) return;
    shown = { box: boxIn(cells[r].querySelector('.strip') ?? cells[r], chart), row: r, dot: null };
  }
  // The dot nearest the pointer along its strip.
  function near(e: PointerEvent, r: number) {
    const strip = e.currentTarget as HTMLElement;
    if (!chart) return;
    const b = strip.getBoundingClientRect();
    const m = ((e.clientX - b.left) / b.width) * span;
    const marks = rows[r].marks;
    let best = 0;
    for (let j = 1; j < marks.length; j++) if (Math.abs(Math.min(marks[j].after, span) - m) < Math.abs(Math.min(marks[best].after, span) - m)) best = j;
    const dotEl = strip.querySelectorAll('.dot')[best];
    if (dotEl) shown = { box: boxIn(dotEl, chart), row: r, dot: best };
  }
  function onkey(e: KeyboardEvent) {
    const next = step(e.key === 'ArrowDown' ? 'ArrowRight' : e.key === 'ArrowUp' ? 'ArrowLeft' : e.key, active, rows.length);
    if (next == null) return;
    e.preventDefault();
    active = next;
    cells[next]?.focus();
  }
</script>

<div class="timing" class:still={reduced} bind:this={chart} role="presentation" onpointerleave={() => (shown = null)}>
  <div role="grid" aria-label="When you marked each prayer, after its adhan" tabindex="-1" onkeydown={onkey}>
    {#each rows as p, r (p.id)}
      <div class="row" role="row">
        <span class="nm" role="rowheader">{PRAYER_NAME[p.id]}</span>
        <span
          class="cell"
          class:on={shown?.row === r}
          role="gridcell"
          tabindex={r === active ? 0 : -1}
          aria-label={rowLabel(p)}
          bind:this={cells[r]}
          onfocus={() => ((active = r), showRow(r))}
          onblur={() => (shown = null)}
        >
          <span class="strip" aria-hidden="true" onpointermove={(e) => near(e, r)}>
            <i class="rule"></i>
            {#each p.marks as m, j (m.date)}
              <i class="dot" class:hot={shown?.row === r && shown.dot === j} style:left={pos(m.after)} style:--d={`${r * 70 + j * 22}ms`}></i>
            {/each}
            {#if p.median != null && p.marks.length >= 3}
              <i class="mid" style:left={pos(Math.round(p.median))} style:--d={`${r * 70 + 420}ms`}></i>
            {/if}
          </span>
          <span class="val tnum" aria-hidden="true">{p.within != null ? `≤ ${hm(p.within)}` : ''}</span>
        </span>
      </div>
    {/each}
  </div>
  <div class="axis tnum" aria-hidden="true">
    <span></span>
    <span class="ticks">
      <em style:left="0%">Adhan</em>
      <em style:left="50%">+{hm(span / 2)}</em>
      <em style:left="100%">+{hm(span)}</em>
    </span>
    <span></span>
  </div>
  {#if shown && rows[shown.row]}
    {@const p = rows[shown.row]}
    <ChartTip box={shown.box}>
      {#if shown.dot != null && p.marks[shown.dot]}
        {@const m = p.marks[shown.dot]}
        <b>{after(m.after)}</b>
        <span class="dim">{PRAYER_NAME[p.id]} · {dayLabel(m.date)}</span>
      {:else}
        <b>{p.within != null ? `Usually within ${minutesInWords(p.within)}` : `${p.marks.length} marked`}</b>
        <span class="dim">{PRAYER_NAME[p.id]}{p.median != null ? ` · middle ${Math.round(p.median)} min after the adhan` : ''}</span>
      {/if}
    </ChartTip>
  {/if}
</div>

<style>
  .timing {
    position: relative;
  }
  [role='grid'] {
    display: grid;
    gap: 2px;
    outline: none;
  }
  .row,
  .axis {
    display: grid;
    grid-template-columns: 52px minmax(0, 1fr);
    align-items: center;
    column-gap: 8px;
  }
  .nm {
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .cell {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 46px;
    align-items: center;
    gap: 8px;
    border-radius: 8px;
  }
  .cell:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }
  .cell.on .val {
    color: var(--ink);
  }
  .strip {
    position: relative;
    height: 22px;
    margin: 0 6px;
  }
  .rule {
    position: absolute;
    left: -6px;
    right: -6px;
    top: 50%;
    height: 1px;
    background: var(--line);
  }
  .dot {
    position: absolute;
    top: 50%;
    width: 8px;
    height: 8px;
    margin: -4px 0 0 -4px;
    border-radius: 50%;
    background: var(--green-k);
    /* Translucent, so where marks gather reads darker (no rings: they'd bead into a chain). */
    opacity: 0.45;
    transition:
      transform var(--dur-1) var(--ease-out),
      opacity var(--dur-1) var(--ease-out);
    animation: settle 420ms cubic-bezier(0.34, 1.56, 0.64, 1) var(--d) backwards;
  }
  .dot.hot {
    z-index: 1;
    opacity: 1;
    transform: scale(1.35);
    box-shadow: 0 0 0 2px var(--raised);
  }
  .mid {
    position: absolute;
    top: 50%;
    width: 2px;
    height: 16px;
    margin: -8px 0 0 -1px;
    border-radius: 1px;
    background: var(--ink-2);
    transform-origin: 50% 50%;
    animation: grow 320ms var(--ease-out) var(--d) backwards;
  }
  .val {
    font-size: var(--t-xs);
    color: var(--ink-3);
    text-align: right;
    white-space: nowrap;
  }
  .axis {
    margin-top: 2px;
  }
  .ticks {
    position: relative;
    height: 14px;
    margin: 0 calc(46px + 8px + 6px) 0 6px;
  }
  .ticks em {
    position: absolute;
    top: 0;
    transform: translateX(-50%);
    font-style: normal;
    font-size: 10.5px;
    color: var(--ink-3);
    white-space: nowrap;
  }
  .ticks em:first-child {
    transform: translateX(-6px);
  }
  .ticks em:last-child {
    transform: translateX(calc(-100% + 6px));
  }
  @keyframes settle {
    from {
      opacity: 0;
      transform: translateY(-6px) scale(0.4);
    }
  }
  @keyframes grow {
    from {
      transform: scaleY(0);
    }
  }
  .still .dot,
  .still .mid,
  :global([data-motion='calm']) .timing .dot,
  :global([data-motion='calm']) .timing .mid {
    animation: none;
  }
</style>
