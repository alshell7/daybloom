<script lang="ts">
  // The week in the top bar: seven day chips with up to four dots in the colours of that day's
  // blocks, chevrons (or a swipe / sideways scroll) to look at the weeks before and after, the
  // month calendar, and "Today" when you are elsewhere. Looking at another week doesn't change
  // the day you're on: the chevron pointing back to it carries a dot until you return, and
  // picking a chip goes there. The selected day sits on an ink puck that slides between chips;
  // a new week slides in from the side you moved toward. The 1st of a month shows the month's
  // name. Its size comes from the bar (`chip`, see fit.ts), so it never measures itself to fit.
  import type { Action } from 'svelte/action';
  import { blocksInRange } from '../../lib/engine/blocks';
  import { addDays, formatDayLong, fromISODate, startOfDayMs } from '../../lib/engine/time';
  import type { Block, ISODate } from '../../lib/engine/types';
  import Icon from '../../lib/Icon.svelte';
  import { taskFile } from '../../lib/stores/tasks.svelte';
  import { view } from '../../lib/stores/view.svelte';
  import { sideOf, SwipeGate, weekStartOf } from '../calendar-view/month';
  import { springOut } from './motion';

  let {
    chip = 42,
    today = true,
    measure,
    calOpen = false,
    oncalendar,
  }: {
    /** Day-chip width in px. */
    chip?: number;
    /** Room for the Today button. */
    today?: boolean;
    /** The bar's measuring action (for the Today button's width). */
    measure: Action<HTMLElement, string>;
    /** The month calendar is open (from this button or elsewhere). */
    calOpen?: boolean;
    /** Open the month calendar, hanging from this element. */
    oncalendar: (from: HTMLElement) => void;
  } = $props();

  const rm = $derived(view.reducedMotion);

  // The week on show: the selected day's, moved by `n` weeks while you look around (only for
  // the day it was moved from: going to another day brings its own week back).
  let browse = $state<{ from: ISODate; n: number }>({ from: '', n: 0 });
  const offset = $derived(browse.from === view.date ? browse.n : 0);
  const weekStart = $derived(addDays(weekStartOf(view.date), offset * 7));
  // Which way the week last moved (a new week slides in from that side).
  let dir = $state(1);
  let lastStart = '';
  $effect.pre(() => {
    const w = weekStart;
    if (lastStart && w !== lastStart) dir = w > lastStart ? 1 : -1;
    lastStart = w;
  });
  const days = $derived(Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)));
  /** Where the day you're on is, from the week on show. */
  const side = $derived(sideOf(view.date, weekStart));
  const away = $derived(formatDayLong(view.date));

  function shift(n: number) {
    browse = { from: view.date, n: offset + n };
  }

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
    chip;
    placePuck();
    requestAnimationFrame(() => (puckReady = true));
  });
  // Fonts arriving or the strip moving rows: keep the puck under its chip.
  $effect(() => {
    if (!weekEl) return;
    const ro = new ResizeObserver(placePuck);
    ro.observe(weekEl);
    return () => ro.disconnect();
  });

  // A sideways swipe (trackpad, or Shift + wheel) moves one week per gesture; so does a
  // touch drag. Up-and-down scrolling is left alone.
  const swipe: Action<HTMLElement> = (node) => {
    const gate = new SwipeGate();
    const wheel = (e: WheelEvent) => {
      const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
      if (Math.abs(dx) <= Math.abs(e.deltaY) && !e.shiftKey) return;
      e.preventDefault();
      const step = gate.push(dx, e.timeStamp);
      if (step) shift(step);
    };
    let x0: number | null = null;
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'touch') x0 = e.clientX;
    };
    const up = (e: PointerEvent) => {
      if (x0 === null) return;
      const dx = e.clientX - x0;
      x0 = null;
      if (Math.abs(dx) > 40) shift(dx < 0 ? 1 : -1);
    };
    node.addEventListener('wheel', wheel, { passive: false });
    node.addEventListener('pointerdown', down);
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', () => (x0 = null));
    return {
      destroy() {
        node.removeEventListener('wheel', wheel);
        node.removeEventListener('pointerdown', down);
        node.removeEventListener('pointerup', up);
      },
    };
  };

  function slideIn(_n: Element, o: { i: number }) {
    if (rm || !puckReady) return { duration: 0 };
    return {
      duration: 460,
      delay: (dir > 0 ? o.i : 6 - o.i) * 14,
      easing: springOut,
      css: (t: number) => `transform: translateX(${(1 - t) * 26 * dir}px); opacity: ${Math.min(1, t * 1.5)}`,
    };
  }
  const mon = (d: Date) => d.toLocaleDateString(undefined, { month: 'short' });
  let calBtn = $state<HTMLButtonElement>();
</script>

<nav class="week" aria-label="Week" bind:this={weekEl} style:--chip={`${chip}px`} use:swipe>
  <span class="puck" class:ready={puckReady} style:transform={`translateX(${puckX}px)`} style:opacity={puckX < 0 ? 0 : 1} aria-hidden="true"></span>
  <button class="icon-btn step" class:toward={side < 0} onclick={() => shift(-1)} aria-label={side < 0 ? `Previous week (back toward ${away})` : 'Previous week'} title={side < 0 ? `Previous week · ${away} is this way` : 'Previous week'}>
    <Icon name="chevron-left" size={18} />
  </button>
  {#key weekStart}
    {#each days as d, i (d)}
      {@const blocks = byDay.get(d) ?? []}
      {@const date = fromISODate(d)}
      <button
        class="day-chip"
        class:selected={d === view.date}
        class:today={d === view.today}
        onclick={() => view.setDate(d)}
        aria-pressed={d === view.date}
        aria-label={`${date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}, ${blocks.length} blocks`}
        in:slideIn={{ i }}
      >
        <span class="dow" class:mon={date.getDate() === 1}>{date.getDate() === 1 ? mon(date) : date.toLocaleDateString(undefined, { weekday: 'narrow' })}</span>
        <span class="num tnum">{date.getDate()}</span>
        <span class="dots" aria-hidden="true">
          {#each blocks.slice(0, 4) as b (b.key)}
            <i style:background={b.color} class:done={b.done}></i>
          {/each}
        </span>
      </button>
    {/each}
  {/key}
  <button class="icon-btn step" class:toward={side > 0} onclick={() => shift(1)} aria-label={side > 0 ? `Next week (back toward ${away})` : 'Next week'} title={side > 0 ? `Next week · ${away} is this way` : 'Next week'}>
    <Icon name="chevron-right" size={18} />
  </button>
  <button
    bind:this={calBtn}
    class="icon-btn cal-btn"
    class:on={calOpen}
    onclick={() => calBtn && oncalendar(calBtn)}
    aria-haspopup="dialog"
    aria-expanded={calOpen}
    aria-label="Month (M)"
    title="Month · M"
  >
    <Icon name="calendar-days" size={17} />
  </button>
  {#if today && view.date !== view.today}
    <button class="btn btn-soft today-btn" onclick={() => view.goToday()} use:measure={'today'}>Today</button>
  {/if}
</nav>

<style>
  /* Sizes match BAR in fit.ts: 34px chevrons and calendar button, `--chip` chips, 2px gaps,
     8px before Today. */
  .week {
    position: relative;
    display: flex;
    align-items: center;
    gap: 2px;
    isolation: isolate;
    width: max-content;
    touch-action: pan-y;
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
      width var(--dur-2) var(--ease-out),
      opacity 0.2s;
  }
  /* The way back to the day you're on: a small ink dot on that chevron. */
  .step {
    position: relative;
  }
  .step.toward::after {
    content: '';
    position: absolute;
    top: 6px;
    right: 7px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--ink);
    box-shadow: 0 0 0 2px var(--ground);
    animation: dot-in 420ms var(--ease-settle);
  }
  @keyframes dot-in {
    from {
      transform: scale(0);
    }
    60% {
      transform: scale(1.4);
    }
  }
  .cal-btn.on {
    background: var(--sunken);
    color: var(--ink);
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
  /* The 1st: the month's name instead of the weekday, so a browsed week says where it is. */
  .dow.mon {
    font-weight: 500;
    color: var(--ink-2);
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
    margin-left: 8px;
  }
  :global([data-motion='calm']) .step.toward::after {
    animation: none;
  }
</style>
