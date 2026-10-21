<script lang="ts">
  // A small single-series column chart (up to 14). One tone; the bar to look at (highlight, or
  // the largest) is full colour and carries its value, the rest a lighter step of the same
  // hue. Columns are at most 22px wide with a 4px round tip, square on the hairline baseline.
  // Hover or focus a column for its value; a hidden table reads them all. The columns grow in
  // once (transform only; none under Calm).
  import type { ComponentRenderProps } from '@openuidev/svelte-lang';
  import { toneColor, valid } from '../../lib/ai/genui/read';
  import { BarChartProps } from '../../lib/ai/genui/schema';
  import { formatDuration, MINUTE } from '../../lib/engine/time';

  let { props }: ComponentRenderProps<Record<string, unknown>> = $props();
  const p = $derived(valid(BarChartProps, props));
  const bars = $derived.by(() => {
    if (!p) return [];
    const n = Math.min(p.labels.length, p.values.length, 14);
    return Array.from({ length: n }, (_, i) => ({ label: p.labels[i].trim().slice(0, 12), value: Math.max(0, Number.isFinite(p.values[i]) ? p.values[i] : 0) }));
  });
  const max = $derived(Math.max(1, ...bars.map((b) => b.value)));
  const top = $derived(p?.highlight != null && p.highlight >= 0 && p.highlight < bars.length ? Math.round(p.highlight) : bars.reduce((m, b, i) => (b.value > bars[m].value ? i : m), 0));
  const color = $derived(toneColor(p?.tone, 'focus'));
  const many = $derived(bars.length > 7);

  function show(v: number): string {
    const u = p?.unit;
    if (u === 'm') return v >= 1 ? formatDuration(Math.round(v) * MINUTE) : '0m';
    if (u === 'h') return `${Math.round(v * 10) / 10}h`;
    if (u === '%') return `${Math.round(v)}%`;
    return Math.round(v * 10) / 10 + '';
  }

  let hover = $state<number | null>(null);
</script>

{#if bars.length >= 2}
  <figure class="chart" style:--c={color}>
    {#if p?.title?.trim()}<figcaption class="a-label">{p.title.trim().slice(0, 50)}</figcaption>{/if}
    <div class="plot" class:many role="img" aria-label={`${p?.title ?? 'Chart'}: ${bars.map((b) => `${b.label} ${show(b.value)}`).join(', ')}`}>
      {#each bars as b, i (i)}
        <div
          class="col"
          role="presentation"
          onpointerenter={() => (hover = i)}
          onpointerleave={() => (hover = hover === i ? null : hover)}
        >
          <span class="val" class:on={i === top || hover === i}>{show(b.value)}</span>
          <span class="bar" class:top={i === top} class:zero={b.value <= 0} style:--h={b.value / max} style:animation-delay={`${i * 35}ms`}></span>
          <span class="x" class:top={i === top}>{many ? b.label.slice(0, 3) : b.label}</span>
        </div>
      {/each}
    </div>
    <table class="sr">
      <tbody>
        {#each bars as b, i (i)}<tr><th>{b.label}</th><td>{show(b.value)}</td></tr>{/each}
      </tbody>
    </table>
  </figure>
{/if}

<style>
  .chart {
    display: grid;
    gap: 8px;
    margin: 0;
    padding: 12px 14px 10px;
    border-radius: var(--r-md);
    background: var(--surface);
    border: 1px solid var(--line);
    min-width: 0;
  }
  .plot {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(0, 1fr);
    align-items: end;
    gap: 2px;
    height: 128px;
    /* The baseline: one solid hairline, recessive. */
    background: linear-gradient(var(--line-strong), var(--line-strong)) no-repeat left calc(100% - 20px) / 100% 1px;
  }
  .col {
    display: grid;
    grid-template-rows: 18px 1fr 20px;
    justify-items: center;
    height: 100%;
    min-width: 0;
  }
  .val {
    align-self: end;
    font-size: 10.5px;
    font-weight: 500;
    color: var(--ink-2);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    opacity: 0;
    transition: opacity var(--dur-1) var(--ease-out);
  }
  .val.on {
    opacity: 1;
  }
  .bar {
    align-self: end;
    width: min(22px, 72%);
    height: max(2px, calc(var(--h) * 100%));
    border-radius: 4px 4px 0 0;
    background: color-mix(in srgb, var(--c) 42%, var(--surface));
    transform-origin: 50% 100%;
    animation: grow 560ms var(--ease-settle) both;
    transition: background var(--dur-1) var(--ease-out);
  }
  .bar.top,
  .col:hover .bar {
    background: var(--c);
  }
  .bar.zero {
    background: var(--line-strong);
  }
  @keyframes grow {
    from {
      transform: scaleY(0);
    }
  }
  .x {
    align-self: center;
    max-width: 100%;
    font-size: var(--t-xs);
    color: var(--ink-3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: clip;
  }
  .x.top {
    color: var(--ink);
    font-weight: 500;
  }
  .many .x {
    font-size: 10.5px;
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  :global([data-motion='calm']) .bar {
    animation: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .bar {
      animation: none;
    }
  }
</style>
