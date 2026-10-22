<script lang="ts">
  import { tick } from 'svelte';
  import { fly, slide } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { ENERGY_ICON, ENERGY_LABEL, PRIORITY_LABEL, SORTS, type Filter, type Level, type SortMode } from '../../lib/backlog';
  import { CATEGORIES, categoryColor } from '../../lib/engine/categories';
  import type { CategoryId } from '../../lib/engine/types';
  import Icon from '../../lib/Icon.svelte';
  import { fitOnScreen } from '../../lib/fitOnScreen';
  import { view } from '../../lib/stores/view.svelte';

  let {
    filter = $bindable(),
    sort,
    onsort,
    showSort = true,
    onarrowdown,
  }: {
    filter: Filter;
    sort: SortMode;
    onsort: (s: SortMode) => void;
    showSort?: boolean;
    /** ArrowDown from the search box: hand focus to the list. */
    onarrowdown?: () => void;
  } = $props();

  let trayOpen = $state(false);
  let menuOpen = $state(false);
  let menuEl: HTMLDivElement | undefined = $state();
  let sortBtn: HTMLButtonElement | undefined = $state();
  let search: HTMLInputElement | undefined = $state();

  const chips = $derived(filter.categories.length + filter.energy.length + filter.priority.length);
  const LEVELS: Level[] = [1, 2, 3];

  function flip<T>(arr: T[], v: T) {
    const i = arr.indexOf(v);
    if (i >= 0) arr.splice(i, 1);
    else arr.push(v);
  }
  function clearChips() {
    filter.categories = [];
    filter.energy = [];
    filter.priority = [];
  }

  function searchKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && filter.query) {
      e.preventDefault();
      e.stopPropagation();
      filter.query = '';
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      onarrowdown?.();
    }
  }

  async function openMenu() {
    menuOpen = !menuOpen;
    if (!menuOpen) return;
    await tick();
    menuEl?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
  }
  function pick(s: SortMode) {
    onsort(s);
    menuOpen = false;
    sortBtn?.focus();
  }
  function menuKey(e: KeyboardEvent) {
    const items = [...(menuEl?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      menuOpen = false;
      sortBtn?.focus();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
    }
  }

  // Click anywhere else closes the sort menu.
  $effect(() => {
    if (!menuOpen) return;
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menuEl?.contains(t) && !sortBtn?.contains(t)) menuOpen = false;
    };
    window.addEventListener('pointerdown', away, true);
    return () => window.removeEventListener('pointerdown', away, true);
  });

  /** Focus the search box (the panel's "/" shortcut). */
  export function focusSearch() {
    search?.focus();
  }

  const sortLabel = $derived(SORTS.find((s) => s.id === sort)?.label ?? 'Manual');
</script>

<div class="bar">
  <label class="search">
    <Icon name="search" size={15} />
    <input bind:this={search} bind:value={filter.query} placeholder="Find" aria-label="Search the backlog" autocomplete="off" spellcheck="false" onkeydown={searchKey} />
    {#if filter.query}
      <button class="clear" onclick={() => (filter.query = '')} aria-label="Clear search" in:fly={{ x: 4, duration: view.reducedMotion ? 0 : 160 }}><Icon name="x" size={13} /></button>
    {/if}
  </label>

  <button class="icon-btn small" class:lit={chips > 0} aria-pressed={trayOpen} aria-expanded={trayOpen} onclick={() => (trayOpen = !trayOpen)} title="Filter" aria-label="Filter">
    <Icon name="filter" size={15} />
    {#if chips > 0}<span class="badge tnum">{chips}</span>{/if}
  </button>

  {#if showSort}
    <div class="sort-wrap">
      <button bind:this={sortBtn} class="sort" aria-haspopup="menu" aria-expanded={menuOpen} onclick={openMenu} title="Sort">
        <Icon name="sort" size={14} />
        <span>{sortLabel}</span>
      </button>
      {#if menuOpen}
        <div
          class="menu"
          bind:this={menuEl}
          use:fitOnScreen
          role="menu"
          tabindex="-1"
          aria-label="Sort by"
          onkeydown={menuKey}
          transition:fly={{ y: -4, duration: view.reducedMotion ? 0 : 160, easing: cubicOut }}
        >
          {#each SORTS as s (s.id)}
            <button role="menuitemradio" aria-checked={s.id === sort} onclick={() => pick(s.id)}>
              <span class="mark">{#if s.id === sort}<Icon name="check" size={13} stroke={2.4} />{/if}</span>
              {s.label}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

{#if trayOpen}
  <div class="tray" transition:slide={{ duration: view.reducedMotion ? 0 : 220, easing: cubicOut }}>
    <div class="group" role="group" aria-label="Category">
      {#each CATEGORIES as c (c.id)}
        <button
          class="fchip"
          style:--c={categoryColor(c.id, view.finish.dark)}
          aria-pressed={filter.categories.includes(c.id)}
          onclick={() => flip<CategoryId>(filter.categories, c.id)}
        >
          <i class="dot"></i>{c.label}
        </button>
      {/each}
    </div>
    <div class="group" role="group" aria-label="Energy and priority">
      {#each LEVELS as l (l)}
        <button class="fchip" aria-pressed={filter.energy.includes(l)} onclick={() => flip<Level>(filter.energy, l)} title={ENERGY_LABEL[l]}>
          <Icon name={ENERGY_ICON[l]} size={14} />{ENERGY_LABEL[l].split(' ')[0]}
        </button>
      {/each}
      <span class="sep" aria-hidden="true"></span>
      {#each LEVELS as l (l)}
        <button class="fchip" class:must={l === 1} aria-pressed={filter.priority.includes(l)} onclick={() => flip<Level>(filter.priority, l)}>
          <Icon name="flag" size={12} />{PRIORITY_LABEL[l]}
        </button>
      {/each}
      {#if chips > 0}
        <button class="reset" onclick={clearChips} in:fly={{ x: -4, duration: view.reducedMotion ? 0 : 160 }}>Clear</button>
      {/if}
    </div>
  </div>
{/if}

<style>
  .bar {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .search {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 7px;
    height: 34px;
    padding: 0 6px 0 11px;
    border-radius: var(--r-sm);
    border: 1px solid var(--line);
    background: var(--raised);
    color: var(--ink-3);
    transition:
      border-color var(--dur-1) var(--ease-out),
      box-shadow var(--dur-1) var(--ease-out);
  }
  .search:focus-within {
    border-color: var(--focus-ring);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--focus-ring) 20%, transparent);
  }
  .search input {
    flex: 1;
    min-width: 0;
    height: 100%;
    border: 0;
    outline: none;
    background: transparent;
    font-size: var(--t-sm);
    color: var(--ink);
  }
  .clear {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    color: var(--ink-3);
  }
  .clear:hover {
    background: var(--sunken);
    color: var(--ink);
  }
  .icon-btn.small {
    position: relative;
    width: 34px;
    height: 34px;
    flex: none;
  }
  .icon-btn.lit {
    color: var(--ink);
  }
  .badge {
    position: absolute;
    top: 3px;
    right: 2px;
    min-width: 15px;
    height: 15px;
    padding: 0 4px;
    border-radius: var(--r-pill);
    background: var(--ink);
    color: var(--ink-inverse);
    font-family: var(--font-ui);
    font-size: 9.5px;
    font-weight: 600;
    line-height: 15px;
    text-align: center;
  }
  .icon-btn[aria-pressed='true'] .badge {
    background: var(--ink-inverse);
    color: var(--ink);
  }
  .sort-wrap {
    position: relative;
    flex: none;
  }
  .sort {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 34px;
    padding: 0 12px 0 10px;
    border-radius: var(--r-pill);
    font-family: var(--font-ui);
    font-size: var(--t-xs);
    font-weight: 500;
    color: var(--ink-2);
    transition: background var(--dur-1) var(--ease-out);
  }
  .sort:hover,
  .sort[aria-expanded='true'] {
    background: var(--sunken);
    color: var(--ink);
  }
  .menu {
    position: absolute;
    z-index: 5;
    top: calc(100% + 6px);
    right: 0;
    min-width: 170px;
    padding: 5px;
    border-radius: var(--r-md);
    border: 1px solid var(--line);
    background: var(--raised);
    box-shadow: var(--shadow-2);
    display: grid;
    outline: none;
  }
  .menu button {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    padding: 0 10px 0 6px;
    border-radius: var(--r-sm);
    font-family: var(--font-ui);
    font-size: var(--t-sm);
    color: var(--ink-2);
    text-align: left;
  }
  .menu button:hover,
  .menu button:focus-visible {
    background: var(--sunken);
    color: var(--ink);
    outline: none;
  }
  .menu button[aria-checked='true'] {
    color: var(--ink);
  }
  .mark {
    display: grid;
    place-items: center;
    width: 16px;
  }
  .tray {
    display: grid;
    gap: 6px;
    padding-top: var(--s-2);
  }
  .group {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 5px;
  }
  .fchip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 26px;
    padding: 0 10px;
    border-radius: var(--r-pill);
    border: 1px solid var(--line);
    font-family: var(--font-ui);
    font-size: var(--t-xs);
    color: var(--ink-2);
    transition:
      background var(--dur-1) var(--ease-out),
      border-color var(--dur-1) var(--ease-out),
      color var(--dur-1) var(--ease-out);
  }
  .fchip:hover {
    border-color: var(--line-strong);
    color: var(--ink);
  }
  .fchip[aria-pressed='true'] {
    background: color-mix(in srgb, var(--c, var(--ink)) 12%, transparent);
    border-color: color-mix(in srgb, var(--c, var(--ink)) 55%, transparent);
    color: var(--ink);
  }
  .fchip.must :global(svg) {
    fill: currentColor;
  }
  .dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--c);
  }
  .fchip[aria-pressed='true'] .dot {
    animation: dot-pop 320ms var(--ease-settle);
  }
  @keyframes dot-pop {
    50% {
      transform: scale(1.4);
    }
  }
  .sep {
    width: 1px;
    height: 16px;
    margin: 0 3px;
    background: var(--line-strong);
  }
  .reset {
    height: 26px;
    padding: 0 10px;
    border-radius: var(--r-pill);
    font-family: var(--font-ui);
    font-size: var(--t-xs);
    color: var(--ink-2);
  }
  .reset:hover {
    background: var(--sunken);
    color: var(--ink);
  }
</style>
