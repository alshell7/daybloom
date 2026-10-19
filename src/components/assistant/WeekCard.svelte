<script lang="ts">
  // The week (or four) as tiny dials of finished time, and the gentle highlights the
  // insights panel would say. Switch the span right here.
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { categoryColor } from '../../lib/engine/categories';
  import { formatDuration, fromISODate, minutesOfDay } from '../../lib/engine/time';
  import { computeInsights, highlights, type Highlight, type Span } from '../../lib/insights';
  import Icon from '../../lib/Icon.svelte';
  import { clock } from '../../lib/stores/clock.svelte';
  import { settings } from '../../lib/stores/settings.svelte';
  import { taskFile } from '../../lib/stores/tasks.svelte';
  import { view } from '../../lib/stores/view.svelte';
  import DayDial from '../insights/DayDial.svelte';
  import Segmented from '../Segmented.svelte';

  let { card }: { card: { kind: 'week'; span: Span } } = $props();

  let picked = $state<Span | null>(null);
  const span = $derived(picked ?? card.span);
  const stats = $derived((clock.zone, computeInsights(taskFile.value.tasks, clock.minute, span)));
  const lines = $derived(highlights(stats, { hour12: view.hour12 }));
  const nowMin = $derived(minutesOfDay(clock.minute));
  const rise = (i: number) => ({ y: 6, delay: Math.min(i, 4) * 30, duration: view.reducedMotion ? 0 : 220, easing: cubicOut });

  function tone(h: Highlight) {
    if (h.tone === 'lume') return 'var(--lume)';
    if (h.tone === 'ink') return 'var(--ink-2)';
    return categoryColor(h.tone, view.finish.dark);
  }
</script>

<div class="a-card week">
  <Segmented
    label="Period"
    value={String(span) as '7' | '28'}
    options={[
      { value: '7', label: 'This week' },
      { value: '28', label: 'Last 4 weeks' },
    ]}
    onchange={(v) => (picked = Number(v) as Span)}
  />
  <div class="dials" class:month={span === 28}>
    {#each stats.days as d (d.date)}
      <button class="d" onclick={() => view.setDate(d.date)} title={fromISODate(d.date).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}>
        <DayDial day={d} finish={view.finish} wake={settings.value.wake} sleep={settings.value.sleep} nowMin={d.date === stats.today ? nowMin : null} />
        {#if span === 7}<span class="a-meta">{fromISODate(d.date).toLocaleDateString(undefined, { weekday: 'narrow' })}</span>{/if}
      </button>
    {/each}
  </div>
  <p class="a-meta tnum">
    {stats.finished + stats.backlogDone} finished{stats.spentTotal >= 60_000 ? ` · ${formatDuration(stats.spentTotal)} well spent` : ''} · {stats.activeDays} {stats.activeDays === 1 ? 'day' : 'days'} with something done
  </p>
  <ul class="lines">
    {#each lines as h, i (h.text)}
      <li in:fly={rise(i)}>
        <span class="glyph" style:--c={tone(h)}><Icon name={h.icon} size={14} stroke={2} /></span>
        <span>{h.text}</span>
      </li>
    {/each}
  </ul>
  <div class="a-actions">
    <button class="a-chip quiet" onclick={() => (view.sheet = { kind: 'insights' })}><Icon name="chart" size={13} /> Open your week</button>
  </div>
</div>

<style>
  .dials {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 6px;
  }
  .dials.month {
    gap: 4px;
  }
  .d {
    display: grid;
    justify-items: center;
    gap: 2px;
    padding: 2px;
    border-radius: var(--r-sm);
    transition: background var(--dur-1) var(--ease-out);
  }
  .d:hover {
    background: var(--sunken);
  }
  .lines {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 8px;
  }
  .lines li {
    display: grid;
    grid-template-columns: 24px 1fr;
    gap: 8px;
    align-items: start;
    font-size: var(--t-sm);
    color: var(--ink-2);
  }
  .glyph {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--c) 16%, transparent);
    color: var(--c);
  }
</style>
