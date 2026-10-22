<script lang="ts" module>
  export interface MenuEntry {
    id: string;
    label: string;
    icon: string;
    kbd?: string;
    /** A second, quieter line (a running timer, the zone you're in). */
    detail?: string;
    /** An on/off item: a check when on. */
    checked?: boolean;
    /** A small dot: something is waiting here. */
    dot?: boolean;
    /** Keep the menu open after it runs (the day arrows). */
    stay?: boolean;
    run: (from: HTMLElement) => void;
  }
  export interface MenuGroup {
    id: string;
    name: string;
    entries: MenuEntry[];
    /** Navigate: the day before, today and the day after, in one row. */
    days?: boolean;
  }
</script>

<script lang="ts">
  // The top bar's More menu: whatever doesn't fit (or you chose to hide), under small group
  // headings, then a few things that always live here. Arrow keys move, Home/End jump, Escape or
  // a click anywhere else closes it (and focus goes back to More). It opens with a spring and its
  // rows arrive one after another; when something folds into it, the button gives a small bump.
  import { tick } from 'svelte';
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { formatDayLong, fromISODate } from '../../lib/engine/time';
  import Icon from '../../lib/Icon.svelte';
  import { fitOnScreen } from '../../lib/fitOnScreen';
  import { popovers } from '../../lib/popovers.svelte';
  import { view } from '../../lib/stores/view.svelte';
  import { bump, springOut } from './motion';

  let {
    groups,
    footer,
    folded = 0,
    dot = false,
    ready = false,
  }: {
    groups: MenuGroup[];
    /** The last row, under a line (Customize the top bar). */
    footer?: MenuEntry;
    /** How many bar items are in here now (a rise bumps the button). */
    folded?: number;
    /** A dot on the button (an update waiting inside). */
    dot?: boolean;
    /** The bar has settled (no bump on the first fit). */
    ready?: boolean;
  } = $props();

  let open = $state(false);
  // Back (or Esc) closes it first.
  $effect(() => {
    if (open) return popovers.push(() => (open = false));
  });
  let btn = $state<HTMLButtonElement>();
  let menu = $state<HTMLDivElement>();
  const rm = $derived(view.reducedMotion);

  // Something new folded in while the menu is closed: say where it went.
  let last = 0;
  $effect(() => {
    const n = folded;
    if (ready && n > last && !open) bump(btn, rm);
    last = n;
  });

  const items = () => [...(menu?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])];

  async function show(focusFirst = true) {
    open = true;
    await tick();
    if (focusFirst) items()[0]?.focus();
  }
  function hide(refocus = false) {
    open = false;
    if (refocus) btn?.focus();
  }
  function run(e: MenuEntry, el: HTMLElement) {
    e.run(el);
    if (!e.stay) hide();
  }

  function onKey(e: KeyboardEvent) {
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLElement);
    const go = (j: number) => {
      e.preventDefault();
      list[(j + list.length) % list.length]?.focus();
    };
    if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i < 0 ? list.length - 1 : i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(list.length - 1);
    else if (e.key === 'Tab') hide();
  }

  // Escape and clicks outside, while open (capture: before the app's own Escape).
  $effect(() => {
    if (!open) return;
    // A press elsewhere closes it. On a control (another top-bar button) it also does its own
    // thing, so one click is enough; on open ground (the dial) it only closes the menu.
    const down = (e: PointerEvent) => {
      const t = e.target as Element;
      if (menu?.contains(t) || btn?.contains(t)) return;
      hide();
      if (t.closest?.('button, a[href], input, select, textarea, label, [role="button"], [role="tab"]')) return;
      e.preventDefault();
      e.stopPropagation();
      const swallow = (ev: Event) => {
        ev.preventDefault();
        ev.stopPropagation();
      };
      addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => removeEventListener('click', swallow, true), 400);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      e.preventDefault();
      hide(true);
    };
    addEventListener('pointerdown', down, true);
    addEventListener('keydown', key, true);
    return () => {
      removeEventListener('pointerdown', down, true);
      removeEventListener('keydown', key, true);
    };
  });

  function menuIn(_node: Element) {
    if (rm) return { duration: 0 };
    return { duration: 420, easing: springOut, css: (t: number) => `transform: translateY(${(1 - t) * -6}px) scale(${0.9 + 0.1 * t}); opacity: ${Math.min(1, t * 2)}` };
  }
  function menuOut(_node: Element) {
    if (rm) return { duration: 0 };
    return { duration: 140, easing: cubicOut, css: (t: number) => `transform: scale(${0.96 + 0.04 * t}); opacity: ${t}` };
  }
  /** Rows arrive one after another (a short, finite stagger). */
  const row = (i: number) => ({ y: -4, duration: rm ? 0 : 240, delay: rm ? 0 : Math.min(i, 10) * 16, easing: cubicOut });
  const offset = (gi: number) => groups.slice(0, gi).reduce((s, g) => s + g.entries.length + (g.days ? 1 : 0) + 1, 0);
  const dayLabel = $derived(fromISODate(view.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }));
</script>

<div class="more-wrap">
  <button
    bind:this={btn}
    class="icon-btn more"
    class:on={open}
    onclick={(e) => (open ? hide() : show(e.detail === 0))}
    onkeydown={(e) => {
      if (!open && e.key === 'ArrowDown') {
        e.preventDefault();
        void show(true);
      }
    }}
    aria-expanded={open}
    aria-haspopup="menu"
    aria-label={dot ? 'More (an update is ready)' : 'More'}
    title="More"
  >
    <Icon name="more" size={18} />
    {#if dot}<i class="dot" aria-hidden="true"></i>{/if}
  </button>

  {#if open}
    <div class="menu" role="menu" tabindex="-1" aria-label="More" bind:this={menu} use:fitOnScreen onkeydown={onKey} in:menuIn out:menuOut>
      {#each groups as g, gi (g.id)}
        <div role="group" aria-label={g.name}>
        <p class="head" aria-hidden="true" in:fly|global={row(offset(gi))}>{g.name}</p>
        {#if g.days}
          <div class="days" in:fly|global={row(offset(gi) + 1)}>
            <button class="day-step" role="menuitem" aria-label="Previous day" title="Previous day · ←" onclick={() => view.shiftDay(-1)}><Icon name="chevron-left" size={16} /></button>
            <button class="day-now" role="menuitem" title="Today · T" onclick={() => view.goToday()} aria-label={`${formatDayLong(view.date)}. Go to today`}>
              <span class="tnum">{dayLabel}</span>
              {#if view.date !== view.today}<span class="go">Today</span>{/if}
            </button>
            <button class="day-step" role="menuitem" aria-label="Next day" title="Next day · →" onclick={() => view.shiftDay(1)}><Icon name="chevron-right" size={16} /></button>
          </div>
        {/if}
        {#each g.entries as e, i (e.id)}
          <button
            class="item"
            role={e.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
            aria-checked={e.checked === undefined ? undefined : e.checked}
            onclick={(ev) => run(e, ev.currentTarget)}
            in:fly|global={row(offset(gi) + (g.days ? 2 : 1) + i)}
          >
            <span class="ic"><Icon name={e.icon} size={16} />{#if e.dot}<i class="dot" aria-hidden="true"></i>{/if}</span>
            <span class="txt">
              <span class="label">{e.label}</span>
              {#if e.detail}<span class="detail tnum">{e.detail}</span>{/if}
            </span>
            {#if e.checked}<span class="check"><Icon name="check" size={14} stroke={2.4} /></span>{:else if e.kbd}<kbd>{e.kbd}</kbd>{/if}
          </button>
        {/each}
        </div>
      {/each}
      {#if footer}
        <div class="sep" aria-hidden="true"></div>
        <button class="item quiet" role="menuitem" onclick={(ev) => run(footer, ev.currentTarget)}>
          <span class="ic"><Icon name={footer.icon} size={16} /></span>
          <span class="txt"><span class="label">{footer.label}</span></span>
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .more-wrap {
    position: relative;
  }
  .more {
    position: relative;
  }
  .more.on {
    background: var(--sunken);
    color: var(--ink);
  }
  .dot {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--ink);
    box-shadow: 0 0 0 2px var(--ground);
    pointer-events: none;
  }
  .menu {
    /* inside the top bar, which keeps its own items on one line */
    white-space: normal;
    position: absolute;
    top: calc(100% + 8px);
    right: -4px;
    /* Above the cards at the foot of the rail (the update card), below toasts. */
    z-index: 66;
    width: 256px;
    max-width: calc(100vw - 24px);
    max-height: calc(100vh - 76px);
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 6px;
    border-radius: var(--r-lg);
    background: var(--raised);
    border: 1px solid var(--line);
    box-shadow: var(--shadow-3);
    transform-origin: top right;
    outline: none;
    font-family: var(--font-ui);
  }
  .head {
    margin: 8px 10px 3px;
    font-size: var(--t-xs);
    font-weight: 500;
    color: var(--ink-3);
  }
  .menu > div:first-child .head {
    margin-top: 4px;
  }
  .item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 36px;
    padding: 6px 10px;
    border-radius: var(--r-sm);
    font-size: var(--t-sm);
    color: var(--ink-2);
    text-align: left;
    transition: background var(--dur-1) var(--ease-out);
  }
  .item:hover,
  .item:focus-visible {
    background: var(--sunken);
    color: var(--ink);
    outline: none;
  }
  .item:active {
    transform: scale(0.98);
  }
  .ic {
    position: relative;
    display: grid;
    place-items: center;
    flex: none;
    width: 18px;
  }
  .ic .dot {
    top: -3px;
    right: -4px;
    box-shadow: 0 0 0 2px var(--raised);
  }
  .txt {
    flex: 1;
    min-width: 0;
    display: grid;
  }
  .label,
  .detail {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .detail {
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .check {
    flex: none;
    width: 16px;
    color: var(--ink);
  }
  kbd {
    flex: none;
    font-family: var(--font-ui);
    font-size: var(--t-xs);
    color: var(--ink-3);
    padding: 1px 6px;
    border-radius: 5px;
    border: 1px solid var(--line);
  }
  .sep {
    height: 1px;
    margin: 6px 6px;
    background: var(--line);
  }
  .quiet {
    color: var(--ink-3);
  }
  .days {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 2px 4px;
  }
  .day-step {
    display: grid;
    place-items: center;
    flex: none;
    width: 32px;
    height: 32px;
    border-radius: var(--r-pill);
    color: var(--ink-2);
    transition: background var(--dur-1) var(--ease-out);
  }
  .day-now {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: 32px;
    border-radius: var(--r-pill);
    font-size: var(--t-sm);
    font-weight: 500;
    color: var(--ink);
    transition: background var(--dur-1) var(--ease-out);
  }
  .day-step:hover,
  .day-step:focus-visible,
  .day-now:hover,
  .day-now:focus-visible {
    background: var(--sunken);
    outline: none;
  }
  .go {
    padding: 1px 8px;
    border-radius: var(--r-pill);
    font-size: var(--t-xs);
    background: var(--ink);
    color: var(--ink-inverse);
  }
  .day-step:active,
  .day-now:active {
    transform: scale(0.95);
  }
</style>
