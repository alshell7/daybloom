<script lang="ts">
  // Time well spent: one stacked bar per period, category by category, on a shared
  // scale so this week and last week compare by length. Free time is never painted.
  import { CATEGORIES, categoryColor } from '../../lib/engine/categories';
  import { formatDuration, MINUTE } from '../../lib/engine/time';
  import type { CategoryId } from '../../lib/engine/types';
  import Rolling from '../../lib/dial/Rolling.svelte';

  let {
    current,
    previous,
    currentLabel,
    previousLabel,
    dark = false,
    reduced = false,
  }: {
    current: Record<CategoryId, number>;
    previous: Record<CategoryId, number>;
    currentLabel: string;
    previousLabel: string;
    dark?: boolean;
    reduced?: boolean;
  } = $props();

  const sum = (r: Record<CategoryId, number>) => CATEGORIES.reduce((a, c) => a + (r[c.id] ?? 0), 0);
  const curTotal = $derived(sum(current));
  const prevTotal = $derived(sum(previous));
  const scale = $derived(Math.max(curTotal, prevTotal, 1));

  function segments(r: Record<CategoryId, number>) {
    let acc = 0;
    return CATEGORIES.map((c) => {
      const l = (acc / scale) * 100;
      acc += r[c.id] ?? 0;
      const rr = (acc / scale) * 100;
      return { id: c.id, color: categoryColor(c.id, dark), l, r: rr, on: rr - l > 0.01 };
    });
  }
  const cur = $derived(segments(current));
  const prev = $derived(segments(previous));
  const legend = $derived(CATEGORIES.filter((c) => (current[c.id] ?? 0) >= MINUTE));

  // Segments glide (clip-path) when the period changes, but never slide in on first paint.
  let ready = $state(false);
  $effect(() => {
    const id = requestAnimationFrame(() => (ready = true));
    return () => cancelAnimationFrame(id);
  });

  const clip = (s: { l: number; r: number; on: boolean }) =>
    s.on ? `inset(0 calc(${100 - s.r}% + 1px) 0 calc(${s.l}% + 1px) round 999px)` : `inset(0 ${100 - s.l}% 0 ${s.l}% round 999px)`;
  const dur = (ms: number) => (ms < MINUTE ? '0m' : formatDuration(ms));
</script>

{#if curTotal === 0 && prevTotal === 0}
  <p class="empty">Finished blocks fill this bar, one colour for each kind of time.</p>
{:else}
  <div class="bars" class:ready={ready && !reduced}>
    <div class="row">
      <span class="label">{currentLabel}</span>
      <span class="bar now" role="img" aria-label={`${currentLabel}: ${dur(curTotal)}`}>
        {#each cur as s (s.id)}
          <i style:background={s.color} style:clip-path={clip(s)}></i>
        {/each}
      </span>
      <span class="total tnum"><Rolling text={dur(curTotal)} {reduced} /></span>
    </div>
    <div class="row past">
      <span class="label">{previousLabel}</span>
      <span class="bar" role="img" aria-label={`${previousLabel}: ${dur(prevTotal)}`}>
        {#each prev as s (s.id)}
          <i style:background={s.color} style:clip-path={clip(s)}></i>
        {/each}
      </span>
      <span class="total tnum"><Rolling text={dur(prevTotal)} {reduced} /></span>
    </div>
  </div>

  {#if legend.length}
    <ul class="legend">
      {#each legend as c (c.id)}
        <li>
          <i style:background={categoryColor(c.id, dark)}></i>
          <span class="name">{c.label}</span>
          <span class="tnum">{dur(current[c.id])}</span>
        </li>
      {/each}
    </ul>
  {/if}
{/if}

<style>
  .bars {
    display: grid;
    gap: var(--s-2);
  }
  .row {
    display: grid;
    grid-template-columns: 76px minmax(0, 1fr) 64px;
    align-items: center;
    gap: var(--s-3);
  }
  .label {
    font-family: var(--font-ui);
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .bar {
    position: relative;
    height: 12px;
    /* a hairline baseline gives the scale; the bar itself only paints spent time */
    background: linear-gradient(var(--line-strong), var(--line-strong)) center / 100% 1px no-repeat;
  }
  .past .bar {
    height: 6px;
    opacity: 0.55;
  }
  .bar i {
    position: absolute;
    inset: 0;
  }
  .ready .bar i {
    transition: clip-path var(--dur-3) var(--ease-out);
  }
  .total {
    justify-self: end;
    font-family: var(--font-ui);
    font-size: var(--t-sm);
    font-weight: 500;
    color: var(--ink);
  }
  .past .total {
    font-weight: 400;
    color: var(--ink-3);
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-1) var(--s-4);
    margin: var(--s-3) 0 0;
    padding: 0 0 0 calc(76px + var(--s-3));
    list-style: none;
    font-family: var(--font-ui);
    font-size: var(--t-xs);
    color: var(--ink-2);
  }
  .legend li {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .legend i {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
  .legend .tnum {
    color: var(--ink-3);
  }
  .empty {
    margin: 0;
    font-size: var(--t-sm);
    color: var(--ink-3);
  }
  @media (max-width: 520px) {
    .legend {
      padding-left: 0;
    }
  }
</style>
