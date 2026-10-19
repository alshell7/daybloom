<script lang="ts">
  import { blocksInRange } from '../lib/engine/blocks';
  import { addDays, formatDayLong, formatTime, fromISODate, startOfDayMs, weekday } from '../lib/engine/time';
  import { clock } from '../lib/stores/clock.svelte';
  import type { Block, ISODate } from '../lib/engine/types';
  import Icon from '../lib/Icon.svelte';
  import ThemeToggle from './ThemeToggle.svelte';
  import { toggleTheme } from '../lib/themeToggle';
  import { cubicOut } from 'svelte/easing';
  import { scale } from 'svelte/transition';
  import ZonePicker from './ZonePicker.svelte';
  import UpdateChip from './UpdateChip.svelte';
  import { settings } from '../lib/stores/settings.svelte';
  import { taskFile } from '../lib/stores/tasks.svelte';
  import { view } from '../lib/stores/view.svelte';
  import { timer } from '../lib/stores/timer.svelte';

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
  const shortTitle = $derived(fromISODate(view.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }));

  function openFocus() {
    if (timer.active) view.focus = true;
    else view.sheet = view.sheet?.kind === 'focus' ? null : { kind: 'focus' };
  }

  // Narrow windows fold the quieter actions into a "more" menu (see the container queries).
  let moreOpen = $state(false);
  function pick(run: () => void) {
    moreOpen = false;
    run();
  }
  function onMoreKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && moreOpen) {
      e.stopPropagation();
      moreOpen = false;
    }
  }
  const rel = $derived.by(() => {
    if (view.date === view.today) return 'Today';
    if (view.date === addDays(view.today, 1)) return 'Tomorrow';
    if (view.date === addDays(view.today, -1)) return 'Yesterday';
    return null;
  });
</script>

<svelte:window onkeydown={onMoreKey} />

<header class="bar" class:mac data-tauri-drag-region>
  <div class="row" data-tauri-drag-region>
    <div class="when" data-tauri-drag-region>
      <h1 class="day" data-tauri-drag-region>
        <button class="clock tnum" onclick={() => view.goToday()} aria-label={`It's ${formatTime(clock.now, view.hour12)}. Go to today`} title="Now · T">{formatTime(clock.now, view.hour12)}</button>
        {#if rel}<span class="rel" data-tauri-drag-region>{rel}</span>{/if}
        <span class="date long" class:solo={!rel} data-tauri-drag-region>{title}</span>
        <span class="date short" class:solo={!rel} data-tauri-drag-region>{shortTitle}</span>
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
      <span class="fold-b wrap"><ThemeToggle /></span>
      <button class="icon-btn" onclick={() => (view.sheet = view.sheet?.kind === 'backlog' ? null : { kind: 'backlog' })} aria-pressed={view.sheet?.kind === 'backlog'} aria-label="Backlog (B)" title="Backlog · B">
        <Icon name="inbox" size={18} />
        {#if view.later.length}<span class="badge tnum">{view.later.length > 99 ? '99+' : view.later.length}</span>{/if}
      </button>
      <button class="icon-btn fold-b" onclick={() => (view.sheet = view.sheet?.kind === 'insights' ? null : { kind: 'insights' })} aria-pressed={view.sheet?.kind === 'insights'} aria-label="Your week (I)" title="Your week · I">
        <Icon name="chart" size={18} />
      </button>
      <button class="icon-btn fold-a" onclick={openFocus} aria-pressed={view.sheet?.kind === 'focus' || !!timer.active} aria-label="Focus (F)" title="Focus · F">
        <Icon name="focus" size={18} />
      </button>
      <button class="icon-btn fold-a" onclick={ontogglewidget} aria-pressed={settings.value.widget.visible} aria-label="Desktop widget (W)" title="Desktop widget · W">
        <Icon name="picture" size={18} />
      </button>
      <button class="icon-btn fold-c" onclick={() => (view.sheet = { kind: 'settings' })} aria-label="Settings" title="Settings · ,">
        <Icon name="settings" size={18} />
      </button>

      <div class="more-wrap">
        <button class="icon-btn more" class:on={moreOpen} onclick={() => (moreOpen = !moreOpen)} aria-expanded={moreOpen} aria-haspopup="menu" aria-label="More" title="More">
          <Icon name="more" size={18} />
        </button>
        {#if moreOpen}
          <div class="scrim" role="presentation" onclick={() => (moreOpen = false)}></div>
          <div class="menu" role="menu" transition:scale={{ start: 0.94, duration: view.reducedMotion ? 0 : 180, easing: cubicOut }}>
            <button class="item b" role="menuitem" onclick={(e) => { const el = e.currentTarget; pick(() => toggleTheme(el)); }}>
              <Icon name={view.dark ? 'sun' : 'moon'} size={16} /><span>{view.dark ? 'Light mode' : 'Dark mode'}</span>
            </button>
            <button class="item b" role="menuitem" onclick={() => pick(() => (view.sheet = { kind: 'insights' }))}>
              <Icon name="chart" size={16} /><span>Your week</span><kbd>I</kbd>
            </button>
            <button class="item a" role="menuitem" onclick={() => pick(openFocus)}>
              <Icon name="focus" size={16} /><span>Focus</span><kbd>F</kbd>
            </button>
            <button class="item a" role="menuitem" onclick={() => pick(ontogglewidget)}>
              <Icon name="picture" size={16} /><span>{settings.value.widget.visible ? 'Hide the widget' : 'Desktop widget'}</span><kbd>W</kbd>
            </button>
            <button class="item c" role="menuitem" onclick={() => pick(() => (view.sheet = { kind: 'settings' }))}>
              <Icon name="settings" size={16} /><span>Settings</span><kbd>,</kbd>
            </button>
          </div>
        {/if}
      </div>
    </div>
  </div>
</header>

<style>
  /* The bar sizes itself from its own width (container queries), so the macOS
     traffic-light inset and the window width are both accounted for. */
  .bar {
    container: topbar / inline-size;
    padding: var(--s-3) var(--s-5) var(--s-2);
    min-height: 60px;
    -webkit-user-select: none;
    user-select: none;
    --chip: 42px;
  }
  .row {
    display: grid;
    grid-template-columns: minmax(0, max-content) minmax(0, 1fr) max-content;
    grid-template-areas: 'when week actions';
    align-items: center;
    gap: var(--s-4);
  }
  .bar.mac {
    padding-left: 88px;
    padding-top: var(--s-3);
  }
  .when {
    grid-area: when;
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
    flex: none;
    padding: 2px 9px;
    border-radius: var(--r-pill);
    background: var(--ink);
    color: var(--ink-inverse);
    font: inherit;
    font-weight: 500;
    letter-spacing: 0.01em;
    transition: transform var(--dur-1) var(--ease-out);
  }
  .clock:hover {
    transform: scale(1.04);
  }
  .clock:active {
    transform: scale(0.97);
  }
  .rel {
    flex: none;
  }
  .date {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .rel + .date,
  .rel ~ .date {
    color: var(--ink-3);
    font-weight: 400;
    font-size: var(--t-md);
  }
  .date.short {
    display: none;
  }
  .week {
    grid-area: week;
    justify-self: center;
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
    width: var(--chip);
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
    width: var(--chip);
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
    grid-area: actions;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 2px;
  }
  .wrap {
    display: contents;
  }
  .more-wrap {
    position: relative;
    display: none;
  }
  .more.on {
    background: var(--sunken);
    color: var(--ink);
  }
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 44;
  }
  .menu {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 45;
    min-width: 210px;
    padding: 6px;
    border-radius: var(--r-lg);
    background: var(--raised);
    border: 1px solid var(--line);
    box-shadow: var(--shadow-3);
    transform-origin: top right;
  }
  .item {
    display: none;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 8px 10px;
    border-radius: var(--r-sm);
    font-size: var(--t-sm);
    color: var(--ink-2);
    text-align: left;
    transition: background var(--dur-1) var(--ease-out);
  }
  .item:hover {
    background: var(--sunken);
    color: var(--ink);
  }
  .item span {
    flex: 1;
  }
  .item kbd {
    font-family: var(--font-ui);
    font-size: var(--t-xs);
    color: var(--ink-3);
    padding: 1px 6px;
    border-radius: 5px;
    border: 1px solid var(--line);
  }

  /* One row while everything fits; the long date gives way to a short one first. */
  @container topbar (max-width: 1240px) {
    .date.long {
      display: none;
    }
    .date.short {
      display: inline;
    }
  }
  /* Two rows: the day and actions on top, the week centred underneath. */
  @container topbar (max-width: 1060px) {
    .row {
      grid-template-columns: minmax(0, 1fr) max-content;
      grid-template-areas: 'when actions' 'week week';
      row-gap: var(--s-2);
    }
    .week {
      justify-content: center;
    }
    .date.long {
      display: inline;
    }
    .date.short {
      display: none;
    }
  }
  @container topbar (max-width: 820px) {
    .date.long {
      display: none;
    }
    .date.short {
      display: inline;
    }
  }
  /* Narrow: the week below already says which day it is; quieter actions fold away. */
  @container topbar (max-width: 700px) {
    .date:not(.solo) {
      display: none !important;
    }
    .when :global(.chip > span:not(.off)) {
      display: none;
    }
    .fold-a {
      display: none;
    }
    .more-wrap {
      display: block;
    }
    .item.a {
      display: flex;
    }
  }
  @container topbar (max-width: 560px) {
    .fold-b {
      display: none;
    }
    .item.b {
      display: flex;
    }
    .today-btn {
      display: none;
    }
  }
  @container topbar (max-width: 440px) {
    .bar,
    .row {
      --chip: 38px;
    }
    .fold-c {
      display: none;
    }
    .item.c {
      display: flex;
    }
    .date.solo {
      display: none !important;
    }
  }
</style>
