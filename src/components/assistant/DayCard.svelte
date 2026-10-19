<script lang="ts">
  // One day: a tiny 24-hour dial and the list, with chips to step to the day before or after.
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { dayBlocksOf, dayWord } from '../../lib/assistant/tools';
  import { addDays, formatDuration, formatTime, minutesOfDay, startOfDayMs } from '../../lib/engine/time';
  import type { Block, ISODate } from '../../lib/engine/types';
  import Icon from '../../lib/Icon.svelte';
  import { clock } from '../../lib/stores/clock.svelte';
  import { settings } from '../../lib/stores/settings.svelte';
  import { view } from '../../lib/stores/view.svelte';
  import MiniDial, { arcsFor } from './MiniDial.svelte';

  let { card }: { card: { kind: 'day'; date: ISODate } } = $props();

  let offset = $state(0);
  const date = $derived(addDays(card.date, offset));
  const day = $derived((clock.zone, dayBlocksOf(date)));
  const timed = $derived(day.timed.filter((b) => b.date === date || b.startMs >= startOfDayMs(date)));
  const isToday = $derived(date === view.today);
  const nowMin = $derived(isToday ? minutesOfDay(clock.minute) : null);
  const fmt = (ms: number) => formatTime(ms, view.hour12);
  const rise = (i: number) => ({ y: 6, delay: Math.min(i, 4) * 30, duration: view.reducedMotion ? 0 : 220, easing: cubicOut });

  function show(b: Block) {
    view.setDate(date);
    view.selected = b.key;
  }
</script>

<div class="a-card day">
  <div class="top">
    <MiniDial arcs={arcsFor(day.timed, date)} finish={view.finish} wake={settings.value.wake} sleep={settings.value.sleep} {nowMin} size={104} />
    <div class="side">
      <div class="nav">
        <button class="icon-btn sm" onclick={() => offset--} aria-label="Day before"><Icon name="chevron-left" size={15} /></button>
        <span class="when">{dayWord(date)}</span>
        <button class="icon-btn sm" onclick={() => offset++} aria-label="Day after"><Icon name="chevron-right" size={15} /></button>
      </div>
      <span class="a-meta tnum">
        {#if timed.length || day.floating.length}
          {timed.length} timed{day.floating.length ? ` · ${day.floating.length} any time` : ''}{timed.filter((b) => b.done).length ? ` · ${timed.filter((b) => b.done).length} done` : ''}
        {:else}
          Nothing planned — a fresh dial.
        {/if}
      </span>
      <button class="a-chip quiet" onclick={() => view.setDate(date)}><Icon name="dial" size={13} /> Show on the dial</button>
    </div>
  </div>

  {#key date}
    {#if timed.length}
      <ul class="a-list">
        {#each timed as b, i (b.key)}
          <li in:fly={rise(i)}>
            <button class="a-row" class:done={b.done} class:live={isToday && b.startMs <= clock.now && clock.now < b.endMs && !b.done} style:--c={b.color} onclick={() => show(b)}>
              <span class="a-time">{fmt(b.startMs)}</span>
              <span class="a-ico" class:lume={b.done}><Icon name={b.done ? 'check' : b.icon} size={14} stroke={b.done ? 2.6 : 2} /></span>
              <span class="a-title">{b.title || 'Untitled block'}</span>
              <span class="a-time">{formatDuration(b.endMs - b.startMs)}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
    {#if day.floating.length}
      <p class="a-label">Any time</p>
      <ul class="a-list">
        {#each day.floating as b, i (b.key)}
          <li in:fly={rise(timed.length + i)}>
            <button class="a-row" class:done={b.done} style:--c={b.color} onclick={() => show(b)}>
              <span class="a-time"></span>
              <span class="a-ico" class:lume={b.done}><Icon name={b.done ? 'check' : b.icon} size={14} stroke={b.done ? 2.6 : 2} /></span>
              <span class="a-title">{b.title || 'Untitled block'}</span>
              <span></span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  {/key}
</div>

<style>
  .top {
    display: flex;
    gap: var(--s-4);
    align-items: center;
  }
  .side {
    display: grid;
    gap: 6px;
    justify-items: start;
    min-width: 0;
  }
  .nav {
    display: flex;
    align-items: center;
    gap: 2px;
    margin-left: -6px;
  }
  .when {
    min-width: 7ch;
    text-align: center;
    font-family: var(--font-ui);
    font-size: var(--t-lg);
    font-weight: 500;
    letter-spacing: -0.01em;
  }
  .when::first-letter {
    text-transform: uppercase;
  }
  .sm {
    width: 28px;
    height: 28px;
  }
</style>
