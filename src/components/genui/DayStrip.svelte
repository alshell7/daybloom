<script lang="ts">
  // A day as one thin timeline, wake to bedtime (or the part asked for): what's planned in its
  // colours, free time bare, now in signal. The blocks a model picked out by key are listed
  // under it (only ones that exist); the rest fade. A tap shows a block on the dial.
  import type { ComponentRenderProps } from '@openuidev/svelte-lang';
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { act, blockOf, dateOf, fmt, gapsIn, windowOf } from '../../lib/ai/genui/act';
  import { valid } from '../../lib/ai/genui/read';
  import { DayStripProps } from '../../lib/ai/genui/schema';
  import { dayWord } from '../../lib/assistant/tools';
  import { busyBetween } from '../../lib/busy';
  import { formatDuration, MINUTE } from '../../lib/engine/time';
  import type { Block } from '../../lib/engine/types';
  import Icon from '../../lib/Icon.svelte';
  import { clock } from '../../lib/stores/clock.svelte';
  import { view } from '../../lib/stores/view.svelte';
  import Strip from './Strip.svelte';

  let { props }: ComponentRenderProps<Record<string, unknown>> = $props();
  const p = $derived(valid(DayStripProps, props));
  const date = $derived(dateOf(p?.date));
  const picks = $derived((clock.minute, (p?.keys ?? []).map(blockOf).filter((b): b is Block => !!b && b.date === date && !b.floating)));
  const span = $derived.by(() => {
    const w = windowOf(date, { from: p?.from, to: p?.to });
    // Never cut off a block that was picked out.
    for (const b of picks) {
      w.startMs = Math.min(w.startMs, b.startMs);
      w.endMs = Math.max(w.endMs, b.endMs);
    }
    return w;
  });
  const blocks = $derived((clock.minute, busyBetween(span.startMs, span.endMs, { land: false })));
  const gaps = $derived(gapsIn(date, span, 15));
  const isToday = $derived(date === view.today);
  const freeMs = $derived(gaps.reduce((s, g) => s + Math.max(0, g.endMs - Math.max(g.startMs, isToday ? clock.minute : 0)), 0));
  const own = $derived(blocks.filter((b) => b.kind === 'task'));
  const picked = $derived(picks.length ? new Set(picks.map((b) => b.key)) : null);
  const rise = (i: number) => ({ y: 6, delay: Math.min(i, 4) * 30, duration: view.reducedMotion ? 0 : 220, easing: cubicOut });
</script>

{#if p}
  <div class="a-card gu-flat day">
    <div class="top">
      <span class="when">{dayWord(date)}</span>
      <span class="a-meta">
        {#if blocks.length}
          {own.length} {own.length === 1 ? 'block' : 'blocks'}{blocks.length > own.length ? ` · ${blocks.length - own.length} from your calendar` : ''} · {freeMs >= 15 * MINUTE ? `${formatDuration(freeMs)} free` : 'no free stretch left'}
        {:else}
          Nothing planned — a fresh day.
        {/if}
      </span>
    </div>
    <Strip {span} {blocks} {gaps} nowMs={isToday ? clock.now : null} {picked} onpick={(k) => act.show(k)} />
    {#if picks.length}
      <ul class="a-list">
        {#each picks.slice(0, 6) as b, i (b.key)}
          <li in:fly={rise(i)}>
            <button class="a-row" class:done={b.done} class:live={isToday && !b.done && b.startMs <= clock.now && clock.now < b.endMs} style:--c={b.color} onclick={() => act.show(b.key)}>
              <span class="a-time">{fmt(b.startMs)}</span>
              <span class="a-ico" class:lume={b.done}><Icon name={b.done ? 'check' : b.icon} size={14} stroke={b.done ? 2.6 : 2} /></span>
              <span class="a-title">{b.title || 'Untitled block'}</span>
              <span class="a-time">{formatDuration(b.endMs - b.startMs)}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
{/if}

<style>
  .top {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 10px;
  }
  .when {
    font-family: var(--font-ui);
    font-size: var(--t-md);
    font-weight: 500;
    color: var(--ink);
  }
  .when::first-letter {
    text-transform: uppercase;
  }
</style>
