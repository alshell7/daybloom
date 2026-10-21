<script lang="ts">
  // Week by week: the share of prayers on time or in jamaat in each 7-day span, ending today,
  // from the first week you marked. One line on a fixed 0–100% scale, its latest value at
  // the end. The line draws once; hover or arrow keys move a crosshair across the weeks.
  import type { TrendPoint } from '../../../../lib/addons/waqt/analytics';
  import ChartTip from './ChartTip.svelte';
  import { shortDate, spanLabel, step, type Box } from './kinds';

  let { points, reduced = false }: { points: TrendPoint[]; reduced?: boolean } = $props();

  const H = 132;
  const TOP = 14;
  const AXIS = 20;
  const LEFT = 36;
  const RIGHT = 38;
  let w = $state(320);
  const plotW = $derived(Math.max(40, w - LEFT - RIGHT));
  const plotH = H - TOP - AXIS;
  const n = $derived(points.length);
  const x = (i: number) => LEFT + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => TOP + (1 - v) * plotH;
  const base = TOP + plotH;
  const line = $derived(points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.share).toFixed(1)}`).join(' '));
  const area = $derived(n ? `${line} L${x(n - 1).toFixed(1)},${base} L${x(0).toFixed(1)},${base} Z` : '');
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const last = $derived(points[n - 1]);
  const label = (p: TrendPoint) => `${spanLabel(p.from, p.to)}: ${pct(p.share)} on time or in jamaat, ${p.good} of ${p.counted}`;

  let cells: HTMLElement[] = $state([]);
  let active = $state(-1);
  const focusIndex = $derived(active >= 0 ? active : n - 1);
  let hover = $state<number | null>(null);
  const box = $derived.by((): Box | null => {
    if (hover == null || !points[hover]) return null;
    const px = x(hover);
    return { x1: px, x2: px, top: y(points[hover].share) - 4, mid: 0, width: w };
  });
  function onkey(e: KeyboardEvent) {
    const next = step(e.key, focusIndex, n);
    if (next == null) return;
    e.preventDefault();
    active = next;
    cells[next]?.focus();
  }
  // Hit columns reach halfway to each neighbour, so the pointer only has to be nearest.
  const edge = (i: number) => (i <= 0 ? LEFT - 8 : i >= n ? LEFT + plotW + 8 : (x(i - 1) + x(i)) / 2);
</script>

<div class="trend" class:still={reduced} bind:clientWidth={w} style:height={`${H}px`} role="presentation" onpointerleave={() => (hover = null)}>
  <svg width={w} height={H} aria-hidden="true">
    {#each [1, 0.5, 0] as v (v)}
      <line class="grid" x1={LEFT} x2={LEFT + plotW} y1={y(v) + 0.5} y2={y(v) + 0.5} />
      <text class="ytick tnum" x={LEFT - 8} y={y(v) + 3.5}>{pct(v)}</text>
    {/each}
    <path class="area" d={area} />
    <path class="line" d={line} pathLength="1" />
    {#if hover != null && points[hover]}
      <line class="cross" x1={x(hover)} x2={x(hover)} y1={TOP} y2={base} />
      <circle class="dot" cx={x(hover)} cy={y(points[hover].share)} r="4" />
    {/if}
    {#if last}
      <circle class="dot end" cx={x(n - 1)} cy={y(last.share)} r="4" />
      <text class="endval tnum" x={x(n - 1) + 9} y={y(last.share) + 4}>{pct(last.share)}</text>
      <text class="xtick" x={x(0)} y={H - 4} text-anchor="start">{shortDate(points[0].from)}</text>
      <text class="xtick" x={x(n - 1)} y={H - 4} text-anchor="end">This week</text>
    {/if}
  </svg>
  <div class="hits" role="grid" aria-label="On time or in jamaat, week by week" tabindex="-1" onkeydown={onkey}>
    <div role="row">
      {#each points as p, i (p.from)}
        <span
          class="hit"
          role="gridcell"
          tabindex={i === focusIndex ? 0 : -1}
          aria-label={label(p)}
          bind:this={cells[i]}
          style:left={`${edge(i)}px`}
          style:width={`${edge(i + 1) - edge(i)}px`}
          style:top={`${TOP}px`}
          style:height={`${plotH}px`}
          onpointerenter={() => (hover = i)}
          onfocus={() => ((active = i), (hover = i))}
          onblur={() => (hover = null)}
        ></span>
      {/each}
    </div>
  </div>
  {#if box && hover != null}
    {@const p = points[hover]}
    <ChartTip {box}>
      <b>{pct(p.share)}</b>
      <span class="dim">{spanLabel(p.from, p.to)}{p.days < 7 ? ` · ${p.days} ${p.days === 1 ? 'day' : 'days'}` : ''}</span>
      <span class="dim">{p.good} of {p.counted} on time or in jamaat</span>
    </ChartTip>
  {/if}
</div>

<style>
  .trend {
    position: relative;
    width: 100%;
    min-width: 0;
  }
  /* Out of flow: the chart's width comes from the panel, never from the last drawing. */
  svg {
    position: absolute;
    inset: 0;
    display: block;
    overflow: visible;
  }
  .grid {
    stroke: var(--line);
    stroke-width: 1;
  }
  .ytick {
    font-size: 10.5px;
    fill: var(--ink-3);
    text-anchor: end;
  }
  .xtick {
    font-size: 10.5px;
    fill: var(--ink-3);
  }
  .area {
    fill: var(--green);
    opacity: 0.1;
    animation: fade 700ms var(--ease-out) 300ms backwards;
  }
  .line {
    fill: none;
    stroke: var(--green);
    stroke-width: 2;
    stroke-linejoin: round;
    stroke-linecap: round;
    stroke-dasharray: 1;
    animation: draw 1s var(--ease-out) backwards;
  }
  .cross {
    stroke: var(--line-strong);
    stroke-width: 1;
  }
  .dot {
    fill: var(--green);
    stroke: var(--raised);
    stroke-width: 2;
  }
  .end {
    transform-box: fill-box;
    transform-origin: center;
    animation: pop 420ms cubic-bezier(0.34, 1.56, 0.64, 1) 850ms backwards;
  }
  .endval {
    font-size: var(--t-xs);
    font-weight: 500;
    fill: var(--ink-2);
    animation: fade 300ms var(--ease-out) 900ms backwards;
  }
  .hits {
    position: absolute;
    inset: 0;
    outline: none;
  }
  .hit {
    position: absolute;
    border-radius: 6px;
  }
  .hit:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: -2px;
  }
  @keyframes draw {
    from {
      stroke-dashoffset: 1;
    }
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
  @keyframes pop {
    from {
      transform: scale(0);
    }
  }
  .still .area,
  .still .line,
  .still .end,
  .still .endval,
  :global([data-motion='calm']) .trend .area,
  :global([data-motion='calm']) .trend .line,
  :global([data-motion='calm']) .trend .end,
  :global([data-motion='calm']) .trend .endval {
    animation: none;
  }
</style>
