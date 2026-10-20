<script lang="ts">
  // A month of days, Monday first. Today has a ring, the picked day is filled, and with
  // `busy` each day carries a hairline that fills with how much is planned (so a lighter day
  // is easy to find). Arrow keys move by day and week, Page Up/Down by month.
  import { untrack } from 'svelte';
  import { cubicOut } from 'svelte/easing';
  import { fly } from 'svelte/transition';
  import { blocksInRange } from '../../lib/engine/blocks';
  import { addDays, daysBetween, fromISODate, MINUTE, startOfDayMs } from '../../lib/engine/time';
  import type { ISODate } from '../../lib/engine/types';
  import Icon from '../../lib/Icon.svelte';
  import { monthGrid, monthLabel } from '../../lib/pickers';
  import { settings } from '../../lib/stores/settings.svelte';
  import { taskFile } from '../../lib/stores/tasks.svelte';
  import { view } from '../../lib/stores/view.svelte';

  let {
    value,
    preview = null,
    today,
    busy = false,
    min = null,
    max = null,
    onpick,
  }: {
    value: ISODate | null;
    /** A day typed but not yet chosen: outlined. */
    preview?: ISODate | null;
    today: ISODate;
    busy?: boolean;
    min?: ISODate | null;
    max?: ISODate | null;
    onpick: (d: ISODate) => void;
  } = $props();

  // The month and focus start where the picked (or typed) day is; after that they're ours.
  const first = untrack(() => preview ?? value ?? today);
  const start = fromISODate(first);
  let year = $state(start.getFullYear());
  let month = $state(start.getMonth());
  let dir = $state(1);
  let focusDay = $state<ISODate>(first);
  let gridEl = $state<HTMLDivElement>();

  $effect(() => {
    // Typing a day elsewhere brings its month into view.
    const p = preview;
    if (!p) return;
    const d = fromISODate(p);
    if (d.getFullYear() !== year || d.getMonth() !== month) {
      dir = p > `${year}-${String(month + 1).padStart(2, '0')}-01` ? 1 : -1;
      year = d.getFullYear();
      month = d.getMonth();
    }
    focusDay = p;
  });

  const days = $derived(monthGrid(year, month));
  const inMonth = (d: ISODate) => Number(d.slice(5, 7)) - 1 === month;
  const allowed = (d: ISODate) => (!min || d >= min) && (!max || d <= max);

  /** Planned minutes per day, as a share of the waking day. */
  const load = $derived.by(() => {
    if (!busy) return new Map<ISODate, number>();
    const from = startOfDayMs(days[0]);
    const to = startOfDayMs(addDays(days[41], 1));
    const waking = Math.max(60, (((settings.value.sleep - settings.value.wake) % 1440) + 1440) % 1440 || 960);
    const m = new Map<ISODate, number>();
    for (const b of blocksInRange(taskFile.value.tasks, view.events, from, to)) {
      const d = b.date;
      m.set(d, (m.get(d) ?? 0) + (b.endMs - b.startMs) / MINUTE / waking);
    }
    return m;
  });

  function go(n: number) {
    dir = n;
    const t = new Date(year, month + n, 1);
    year = t.getFullYear();
    month = t.getMonth();
  }
  function moveFocus(d: ISODate) {
    const t = fromISODate(d);
    if (t.getFullYear() !== year || t.getMonth() !== month) {
      dir = d > focusDay ? 1 : -1;
      year = t.getFullYear();
      month = t.getMonth();
    }
    focusDay = d;
    queueMicrotask(() => gridEl?.querySelector<HTMLButtonElement>(`[data-day="${d}"]`)?.focus());
  }
  function key(e: KeyboardEvent) {
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (step[e.key]) {
      e.preventDefault();
      moveFocus(addDays(focusDay, step[e.key]));
    } else if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault();
      const t = fromISODate(focusDay);
      const n = new Date(t.getFullYear(), t.getMonth() + (e.key === 'PageUp' ? -1 : 1), Math.min(t.getDate(), 28));
      moveFocus(`${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`);
    }
  }
  const atHome = $derived.by(() => {
    const h = fromISODate(value ?? today);
    return h.getFullYear() === year && h.getMonth() === month;
  });
</script>

<div class="mg">
  <div class="head">
    <button type="button" class="nav" onclick={() => go(-1)} aria-label="Previous month"><Icon name="chevron-left" size={16} /></button>
    <button
      type="button"
      class="title"
      disabled={atHome}
      onclick={() => {
        const h = fromISODate(value ?? today);
        dir = (value ?? today) > `${year}-${String(month + 1).padStart(2, '0')}-01` ? 1 : -1;
        year = h.getFullYear();
        month = h.getMonth();
      }}
      title={atHome ? undefined : 'Back'}>{monthLabel(year, month)}</button
    >
    <button type="button" class="nav" onclick={() => go(1)} aria-label="Next month"><Icon name="chevron-right" size={16} /></button>
  </div>
  <div class="dow" aria-hidden="true">
    {#each ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as d (d)}<span>{d}</span>{/each}
  </div>
  {#key `${year}-${month}`}
    <!-- Arrow keys between the day buttons are handled once, here. -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="grid" role="group" aria-label={monthLabel(year, month)} tabindex="-1" bind:this={gridEl} onkeydown={key} in:fly={{ x: view.reducedMotion ? 0 : 14 * dir, duration: view.reducedMotion ? 0 : 240, easing: cubicOut }}>
      {#each days as d (d)}
        {@const l = load.get(d) ?? 0}
        <button
          type="button"
          class="day tnum"
          class:out={!inMonth(d)}
          class:today={d === today}
          class:sel={d === value}
          class:pre={d === preview && d !== value}
          class:past={d < today}
          data-day={d}
          disabled={!allowed(d)}
          tabindex={d === focusDay ? 0 : -1}
          aria-pressed={d === value}
          aria-label={fromISODate(d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) + (busy && l > 0 ? `, ${Math.round(l * 100)}% planned` : '')}
          onclick={() => onpick(d)}
          onfocus={() => (focusDay = d)}
        >
          {Number(d.slice(8))}
          {#if busy && l > 0 && inMonth(d)}<i class="load" class:full={l > 0.8} style:--l={Math.min(1, l)}></i>{/if}
        </button>
      {/each}
    </div>
  {/key}
  {#if value && daysBetween(today, value) !== 0}
    <p class="away tnum">{Math.abs(daysBetween(today, value))} {Math.abs(daysBetween(today, value)) === 1 ? 'day' : 'days'} {daysBetween(today, value) > 0 ? 'from today' : 'ago'}</p>
  {/if}
</div>

<style>
  .mg {
    display: grid;
    gap: 4px;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .title {
    font-size: var(--t-sm);
    font-weight: 500;
    padding: 4px 10px;
    border-radius: var(--r-pill);
    color: var(--ink);
  }
  .title:not(:disabled):hover {
    background: var(--sunken);
  }
  .title:disabled {
    cursor: default;
  }
  .nav {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    color: var(--ink-2);
  }
  .nav:hover {
    background: var(--sunken);
    color: var(--ink);
  }
  .dow,
  .grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    justify-items: center;
  }
  .dow span {
    font-size: 10.5px;
    color: var(--ink-3);
    padding: 2px 0;
  }
  .grid {
    row-gap: 2px;
    outline: none;
  }
  .day {
    position: relative;
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    font-size: var(--t-sm);
    color: var(--ink);
    transition:
      background var(--dur-1) var(--ease-out),
      color var(--dur-1) var(--ease-out),
      transform var(--dur-1) var(--ease-out);
  }
  .day:hover:not(:disabled) {
    background: var(--sunken);
  }
  .day:active:not(:disabled) {
    transform: scale(0.92);
  }
  .day.out {
    color: var(--ink-3);
    opacity: 0.55;
  }
  .day.past:not(.sel) {
    color: var(--ink-3);
  }
  .day.today {
    box-shadow: inset 0 0 0 1.5px var(--signal);
  }
  .day.pre {
    box-shadow: inset 0 0 0 1.5px var(--ink-2);
  }
  .day.sel {
    background: var(--ink);
    color: var(--ink-inverse);
    font-weight: 500;
  }
  .day:disabled {
    opacity: 0.25;
    cursor: default;
  }
  .day:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 1px;
  }
  .load {
    position: absolute;
    left: 50%;
    bottom: 4px;
    width: 14px;
    height: 2px;
    margin-left: -7px;
    border-radius: 1px;
    background: color-mix(in srgb, var(--ink) 14%, transparent);
    overflow: hidden;
  }
  .load::after {
    content: '';
    position: absolute;
    inset: 0;
    background: var(--ink-3);
    transform-origin: left;
    transform: scaleX(var(--l));
  }
  .load.full::after {
    background: var(--warm);
  }
  .sel .load {
    background: color-mix(in srgb, var(--ink-inverse) 30%, transparent);
  }
  .sel .load::after {
    background: var(--ink-inverse);
  }
  .away {
    margin: 2px 0 0;
    text-align: center;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
</style>
