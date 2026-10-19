<script lang="ts">
  // Today so far: what got done (that's the headline), and the time it was worth.
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { formatDuration, formatTime, hourOf, isoOf } from '../../lib/engine/time';
  import type { ISODate } from '../../lib/engine/types';
  import Icon from '../../lib/Icon.svelte';
  import Rolling from '../../lib/dial/Rolling.svelte';
  import { dayReview } from '../../lib/nudges.svelte';
  import { clock } from '../../lib/stores/clock.svelte';
  import { taskFile } from '../../lib/stores/tasks.svelte';
  import { view } from '../../lib/stores/view.svelte';

  let { card }: { card: { kind: 'summary'; date: ISODate } } = $props();

  const r = $derived((clock.zone, taskFile.value.tasks, dayReview(card.date)));
  const fromBacklog = $derived(taskFile.value.tasks.filter((t) => t.date === null && t.doneAt && isoOf(t.doneAt) === card.date));
  const open = $derived(r.open.filter((b) => !b.floating && b.endMs <= clock.minute).length);
  const evening = $derived(hourOf(clock.minute) >= 17);
  const rise = (i: number) => ({ y: 6, delay: Math.min(i, 4) * 30, duration: view.reducedMotion ? 0 : 220, easing: cubicOut });
</script>

<div class="a-card summary">
  <div class="hero">
    <span class="big tnum"><Rolling text={String(r.done.length + fromBacklog.length)} reduced={view.reducedMotion} /></span>
    <div class="txt">
      <strong class="a-title">done {card.date === view.today ? 'today' : ''}</strong>
      <span class="a-meta">{r.spentMs >= 60_000 ? `${formatDuration(r.spentMs)} well spent` : 'Every block counts, however small.'}</span>
    </div>
  </div>
  {#if r.done.length || fromBacklog.length}
    <ul class="a-list">
      {#each r.done as b, i (b.key)}
        <li class="a-row static done" style:--c={b.color} in:fly={rise(i)}>
          <span class="a-time">{b.floating ? '' : formatTime(b.startMs, view.hour12)}</span>
          <span class="a-ico lume"><Icon name="check" size={13} stroke={2.6} /></span>
          <span class="a-title">{b.title}</span>
          <span></span>
        </li>
      {/each}
      {#each fromBacklog as t, i (t.id)}
        <li class="a-row static done" in:fly={rise(r.done.length + i)}>
          <span class="a-time">backlog</span>
          <span class="a-ico lume"><Icon name="check" size={13} stroke={2.6} /></span>
          <span class="a-title">{t.title}</span>
          <span></span>
        </li>
      {/each}
    </ul>
  {/if}
  {#if open || evening}
    <div class="a-actions">
      {#if open}<span class="a-meta">{open} still open — no rush.</span>{/if}
      {#if evening}<button class="a-chip" onclick={() => (view.sheet = { kind: 'winddown' })}><Icon name="moon" size={13} /> Close the day</button>{/if}
    </div>
  {/if}
</div>

<style>
  .hero {
    display: flex;
    align-items: center;
    gap: var(--s-3);
  }
  .big {
    font-family: var(--font-ui);
    font-size: 34px;
    font-weight: 300;
    letter-spacing: -0.03em;
    line-height: 1;
    color: var(--ink);
  }
  .txt {
    display: grid;
    gap: 1px;
  }
</style>
