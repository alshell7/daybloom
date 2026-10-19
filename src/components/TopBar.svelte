<script lang="ts">
  import { blocksInRange } from '../lib/engine/blocks';
  import { addDays, formatDayLong, formatTime, fromISODate, startOfDayMs, weekday } from '../lib/engine/time';
  import { clock } from '../lib/stores/clock.svelte';
  import type { Block, ISODate } from '../lib/engine/types';
  import Icon from '../lib/Icon.svelte';
  import ThemeToggle from './ThemeToggle.svelte';
  import ZonePicker from './ZonePicker.svelte';
  import UpdateChip from './UpdateChip.svelte';
  import { settings } from '../lib/stores/settings.svelte';
  import { taskFile } from '../lib/stores/tasks.svelte';
  import { view } from '../lib/stores/view.svelte';

  let { mac = false, ontogglewidget }: { mac?: boolean; ontogglewidget: () => void } = $props();

  const weekStart = $derived(addDays(view.date, -((weekday(view.date) + 6) % 7)));
  const days = $derived(Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)));

  const byDay = $derived.by(() => {
    const s = startOfDayMs(weekStart);
    const e = startOfDayMs(addDays(weekStart, 7));
    const all = blocksInRange(taskFile.value.tasks, view.events, s, e, view.finish.dark);
    const map = new Map<ISODate, Block[]>();
    for (const b of all) {
      const list = map.get(b.date) ?? [];
      list.push(b);
      map.set(b.date, list);
    }
    return map;
  });

  // The selected-day puck slides between days instead of jumping.
  let weekEl: HTMLElement | undefined = $state();
  let puckX = $state(-1);
  let puckReady = $state(false);
  function placePuck() {
    const el = weekEl?.querySelector<HTMLElement>('.day-chip.selected');
    puckX = el ? el.offsetLeft : -1;
  }
  $effect(() => {
    view.date;
    days;
    placePuck();
    requestAnimationFrame(() => (puckReady = true));
  });
  // Layout changes (window resize, fonts arriving) move the chips; keep the puck under them.
  $effect(() => {
    if (!weekEl) return;
    const ro = new ResizeObserver(placePuck);
    ro.observe(weekEl);
    return () => ro.disconnect();
  });

  const title = $derived(formatDayLong(view.date));
  const rel = $derived.by(() => {
    if (view.date === view.today) return 'Today';
    if (view.date === addDays(view.today, 1)) return 'Tomorrow';
    if (view.date === addDays(view.today, -1)) return 'Yesterday';
    return null;
  });
</script>

<header class="bar" class:mac data-tauri-drag-region>
  <div class="when" data-tauri-drag-region>
    <h1 class="day" data-tauri-drag-region>
      <span class="clock tnum" aria-label={`It's ${formatTime(clock.now, view.hour12)}`}>{formatTime(clock.now, view.hour12)}</span>
      {#if rel}<span class="rel">{rel}</span>{/if}
      <span class="date">{title}</span>
    </h1>
    <ZonePicker />
  </div>

  <nav class="week" aria-label="Week" bind:this={weekEl}>
    <span class="puck" class:ready={puckReady} style:transform={`translateX(${puckX}px)`} style:opacity={puckX < 0 ? 0 : 1} aria-hidden="true"></span>
    <button class="icon-btn" onclick={() => view.shiftDay(-7)} aria-label="Previous week"><Icon name="chevron-left" size={18} /></button>
    {#each days as d (d)}
      {@const blocks = byDay.get(d) ?? []}
      {@const date = fromISODate(d)}
      <button
        class="day-chip"
        class:selected={d === view.date}
        class:today={d === view.today}
        onclick={() => view.setDate(d)}
        aria-pressed={d === view.date}
        aria-label={`${date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}, ${blocks.length} blocks`}
      >
        <span class="dow">{date.toLocaleDateString(undefined, { weekday: 'narrow' })}</span>
        <span class="num tnum">{date.getDate()}</span>
        <span class="dots" aria-hidden="true">
          {#each blocks.slice(0, 4) as b (b.key)}
            <i style:background={b.color} class:done={b.done}></i>
          {/each}
        </span>
      </button>
    {/each}
    <button class="icon-btn" onclick={() => view.shiftDay(7)} aria-label="Next week"><Icon name="chevron-right" size={18} /></button>
    {#if view.date !== view.today}
      <button class="btn btn-soft today-btn" onclick={() => view.goToday()}>Today</button>
    {/if}
  </nav>

  <div class="actions">
    <UpdateChip />
    <button class="icon-btn ask" onclick={() => (view.sheet = view.sheet?.kind === 'assistant' ? null : { kind: 'assistant' })} aria-pressed={view.sheet?.kind === 'assistant'} aria-label="Ask Daybloom (⌘K)" title="Ask Daybloom · ⌘K">
      <Icon name="sparkles" size={18} />
    </button>
    <ThemeToggle />
    <button class="icon-btn" onclick={() => (view.sheet = view.sheet?.kind === 'backlog' ? null : { kind: 'backlog' })} aria-pressed={view.sheet?.kind === 'backlog'} aria-label="Backlog (B)" title="Backlog · B">
      <Icon name="inbox" size={18} />
      {#if view.later.length}<span class="badge tnum">{view.later.length > 99 ? '99+' : view.later.length}</span>{/if}
    </button>
    <button class="icon-btn" onclick={() => (view.sheet = view.sheet?.kind === 'insights' ? null : { kind: 'insights' })} aria-pressed={view.sheet?.kind === 'insights'} aria-label="Your week (I)" title="Your week · I">
      <Icon name="chart" size={18} />
    </button>
    <button class="icon-btn" onclick={() => (view.focus = true)} aria-label="Focus on now (F)" title="Focus on now · F">
      <Icon name="focus" size={18} />
    </button>
    <button
      class="icon-btn"
      onclick={ontogglewidget}
      aria-pressed={settings.value.widget.visible}
      aria-label="Desktop widget (W)"
      title="Desktop widget · W"
    >
      <Icon name="picture" size={18} />
    </button>
    <button class="icon-btn" onclick={() => (view.sheet = { kind: 'settings' })} aria-label="Settings" title="Settings · ,">
      <Icon name="settings" size={18} />
    </button>
  </div>
</header>

<style>
  .bar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    gap: var(--s-4);
    padding: var(--s-3) var(--s-5) var(--s-2);
    min-height: 60px;
    -webkit-user-select: none;
    user-select: none;
  }
  .bar.mac {
    padding-left: 88px;
    padding-top: var(--s-3);
  }
  .when {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    min-width: 0;
  }
  .day {
    margin: 0;
    display: flex;
    align-items: baseline;
    gap: var(--s-2);
    font-family: var(--font-ui);
    font-size: var(--t-lg);
    font-weight: 500;
    letter-spacing: -0.01em;
    white-space: nowrap;
    overflow: hidden;
  }
  .rel {
    color: var(--ink);
  }
  .clock {
    padding: 2px 9px;
    border-radius: var(--r-pill);
    background: var(--ink);
    color: var(--ink-inverse);
    font-weight: 500;
    letter-spacing: 0.01em;
  }
  .rel + .date {
    color: var(--ink-3);
    font-weight: 400;
    font-size: var(--t-md);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .week {
    position: relative;
    display: flex;
    align-items: center;
    gap: 2px;
    isolation: isolate;
  }
  .puck {
    position: absolute;
    left: 0;
    top: 50%;
    width: 42px;
    height: 50px;
    margin-top: -25px;
    border-radius: var(--r-md);
    background: var(--ink);
    z-index: -1;
    pointer-events: none;
  }
  .puck.ready {
    transition:
      transform 0.42s var(--ease-out),
      opacity 0.2s;
  }
  .day-chip {
    position: relative;
    display: grid;
    justify-items: center;
    gap: 1px;
    width: 42px;
    padding: 5px 0 6px;
    border-radius: var(--r-md);
    font-family: var(--font-ui);
    transition:
      background var(--dur-2) var(--ease-out),
      color var(--dur-2) var(--ease-out);
  }
  .day-chip:hover {
    background: var(--sunken);
  }
  .dow {
    font-size: var(--t-xs);
    color: var(--ink-3);
    line-height: 1.2;
  }
  .num {
    font-size: var(--t-md);
    font-weight: 500;
    line-height: 1.3;
  }
  .day-chip.today .num {
    color: var(--signal);
  }
  .day-chip.selected {
    color: var(--ink-inverse);
    background: transparent;
  }
  .day-chip.selected:hover {
    background: transparent;
  }
  .day-chip.selected .dow {
    color: color-mix(in srgb, var(--ink-inverse) 70%, transparent);
  }
  .day-chip.selected.today .num {
    color: var(--ink-inverse);
  }
  .dots {
    display: flex;
    gap: 2px;
    height: 4px;
  }
  .dots i {
    width: 4px;
    height: 4px;
    border-radius: 50%;
  }
  .dots i.done {
    background: var(--lume) !important;
    box-shadow: 0 0 5px var(--lume);
  }
  .today-btn {
    height: 30px;
    margin-left: var(--s-2);
  }
  .actions .icon-btn {
    position: relative;
  }
  .badge {
    position: absolute;
    top: 2px;
    right: 1px;
    min-width: 15px;
    height: 15px;
    padding: 0 4px;
    border-radius: 8px;
    background: var(--ink);
    color: var(--ink-inverse);
    font-size: 9.5px;
    font-weight: 600;
    line-height: 15px;
    text-align: center;
    pointer-events: none;
  }
  .actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 2px;
  }

  @media (max-width: 980px) {
    .bar {
      grid-template-columns: 1fr auto;
      grid-template-areas: 'when actions' 'week week';
      row-gap: var(--s-2);
    }
    .when {
      grid-area: when;
    }
    .week {
      grid-area: week;
      justify-content: center;
    }
    .actions {
      grid-area: actions;
    }
  }
</style>
