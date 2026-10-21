<script module lang="ts">
  import { NO_FILTER, type HistoryFilter } from '../../lib/history';

  // Remembered while the app runs, so reopening the history keeps your filters (not the search).
  const prefs = $state<{ filter: HistoryFilter }>({ filter: { ...NO_FILTER } });
</script>

<script lang="ts">
  // The Done tab of Your week: everything you finished, newest first, by day. Each day has a
  // sticky header with its tiny dial (finished time drawn as arcs, the count in the middle)
  // and what it added up to; each row opens what was done or un-ticks it, with Undo. Search
  // and filters sit on top and stay in reach while you scroll. Days load 14 at a time.
  import { tick, untrack } from 'svelte';
  import { fly, slide } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { createNext } from '../../lib/actions';
  import { isOn } from '../../lib/addons/registry';
  import { CATEGORIES, categoryColor } from '../../lib/engine/categories';
  import { addDays, daysBetween, formatDuration, fromISODate, MINUTE } from '../../lib/engine/time';
  import type { CategoryId, ISODate } from '../../lib/engine/types';
  import { arcOf, completedItems, counts, filterActive, filterDone, groupByDay, type DoneDay, type HistoryKind } from '../../lib/history';
  import Icon from '../../lib/Icon.svelte';
  import Rolling from '../../lib/dial/Rolling.svelte';
  import { clock } from '../../lib/stores/clock.svelte';
  import { settings } from '../../lib/stores/settings.svelte';
  import { view } from '../../lib/stores/view.svelte';
  import DayDial from '../insights/DayDial.svelte';
  import HistoryRow from './HistoryRow.svelte';
  import { canOpen, historySources, openItem, undoDone } from './sources';

  let { jump = null }: { /** Open on this day (and clear the filters, so its items show). */ jump?: ISODate | null } = $props();

  const PAGE = 14;
  let pages = $state(1);
  const rm = $derived(view.reducedMotion);
  const f = prefs.filter;
  f.query = '';

  const today = $derived(view.today);
  const all = $derived.by(() => {
    clock.zone;
    return completedItems(historySources(), null, today, clock.minute);
  });
  const items = $derived(filterDone(all, f));
  const days = $derived(groupByDay(items));
  const shown = $derived(days.slice(0, pages * PAGE));
  const more = $derived(days.length > shown.length);
  const filtered = $derived(filterActive(f));
  const onlySalah = $derived(f.kind === 'salah');

  const total = $derived.by(() => {
    let n = 0;
    let ms = 0;
    let salah = 0;
    for (const i of items) {
      if (!counts(i)) salah++;
      else {
        n++;
        ms += i.spentMs;
      }
    }
    return { n, ms, salah };
  });

  const kinds = $derived.by(() => {
    const out: { id: HistoryKind; label: string; icon?: string }[] = [
      { id: 'all', label: 'All' },
      { id: 'tasks', label: 'Tasks', icon: 'check' },
    ];
    if (f.kind === 'events' || all.some((i) => i.source === 'event')) out.push({ id: 'events', label: 'Calendar', icon: 'calendar' });
    if (f.kind === 'salah' || isOn('waqt') || all.some((i) => i.source === 'salah')) out.push({ id: 'salah', label: 'Salah', icon: 'moon' });
    return out;
  });
  const cats = $derived(CATEGORIES.filter((c) => c.id === f.category || all.some((i) => i.category === c.id)));

  function setKind(k: HistoryKind) {
    f.kind = k;
    pages = 1;
  }
  function setCategory(c: CategoryId) {
    f.category = f.category === c ? null : c;
    pages = 1;
  }
  function clearAll() {
    f.kind = 'all';
    f.category = null;
    f.query = '';
  }
  function searchKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && f.query) {
      e.preventDefault();
      e.stopPropagation();
      f.query = '';
    }
  }

  // ── Days ──
  const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);
  function dayTitle(d: ISODate): string {
    if (d === today) return 'Today';
    if (d === addDays(today, -1)) return 'Yesterday';
    const date = fromISODate(d);
    if (daysBetween(d, today) < 7) return date.toLocaleDateString(undefined, { weekday: 'long' });
    const year = date.getFullYear() !== fromISODate(today).getFullYear();
    return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}) });
  }
  /** The date beside a relative title ("Today · 21 Oct"); older days carry it in the title. */
  function dayDate(d: ISODate): string {
    if (daysBetween(d, today) >= 7) return '';
    return fromISODate(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }
  function daySum(d: DoneDay): string {
    if (onlySalah) return `${d.salah} ${plural(d.salah, 'prayer')}`;
    const bits: string[] = [];
    if (d.done) bits.push(`${d.done} done`);
    if (d.spentMs >= MINUTE) bits.push(`${formatDuration(d.spentMs)} well spent`);
    if (d.salah) bits.push(`${d.salah} ${plural(d.salah, 'prayer')}`);
    return bits.join(' · ');
  }
  function ring(d: DoneDay) {
    if (!onlySalah) return { arcs: d.arcs, done: d.done - d.backlog, backlog: d.backlog };
    return { arcs: d.items.map(arcOf).filter((a) => !!a), done: d.salah, backlog: 0 };
  }
  const first = $derived(all.length ? all[all.length - 1].date : null);
  const endLine = $derived.by(() => {
    if (!first || first === today) return "That's everything so far.";
    const d = fromISODate(first);
    const year = d.getFullYear() !== fromISODate(today).getFullYear();
    return `That's everything, back to ${d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', ...(year ? { year: 'numeric' } : {}) })}.`;
  });
  /** What an empty filter says: specific to what you asked for. */
  const emptyLine = $derived.by(() => {
    const q = f.query.trim();
    if (q) return { title: `Nothing matches “${q}”.`, sub: '' };
    if (f.kind === 'salah') return { title: 'No prayers marked yet.', sub: 'Mark a prayer on its block or in Waqt, and it shows here with how it went.' };
    if (f.kind === 'events') return { title: 'No calendar events done yet.', sub: 'Mark a meeting done on its block, and it counts like any other.' };
    return { title: 'Nothing here yet.', sub: '' };
  });

  // ── Load earlier days as the list nears its end ──
  let sentinel = $state<HTMLElement>();
  $effect(() => {
    const el = sentinel;
    if (!el) return;
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) pages++;
    }, { rootMargin: '240px 0px' });
    io.observe(el);
    return () => io.disconnect();
  });

  // ── Sticky offsets, and landing on a day ──
  let toolsH = $state(0);
  let listEl = $state<HTMLElement>();
  let flash = $state<ISODate | null>(null);
  $effect(() => {
    const d = jump;
    if (!d) return;
    untrack(async () => {
      if (filtered) clearAll();
      await tick();
      const idx = days.findIndex((x) => x.date <= d);
      if (idx < 0) return;
      pages = Math.max(pages, Math.ceil((idx + 1) / PAGE));
      await tick();
      const sec = listEl?.querySelector<HTMLElement>(`[data-date="${days[idx].date}"]`);
      if (!sec) return;
      if (idx > 0) sec.scrollIntoView({ block: 'start', behavior: rm ? 'auto' : 'smooth' });
      flash = days[idx].date;
      setTimeout(() => (flash = null), 1400);
    });
  });
</script>

<div class="history" style:--th={`${toolsH}px`}>
  {#if all.length}
    <div class="tools" bind:offsetHeight={toolsH}>
      <label class="search">
        <Icon name="search" size={15} />
        <input bind:value={f.query} placeholder="Find something you did" aria-label="Search what you finished" autocomplete="off" spellcheck="false" onkeydown={searchKey} />
        {#if f.query}
          <button class="clear" onclick={() => (f.query = '')} aria-label="Clear search" in:fly={{ x: 4, duration: rm ? 0 : 160 }}><Icon name="x" size={13} /></button>
        {/if}
      </label>
      <div class="chips" role="group" aria-label="Show">
        {#each kinds as k (k.id)}
          <button class="chip" aria-pressed={f.kind === k.id} onclick={() => setKind(k.id)}>
            {#if k.icon}<Icon name={k.icon} size={13} stroke={2.2} />{/if}{k.label}
          </button>
        {/each}
        {#if cats.length > 1}
          <span class="sep" aria-hidden="true"></span>
          {#each cats as c (c.id)}
            <button
              class="chip dot-chip"
              style:--c={categoryColor(c.id, view.finish.dark)}
              aria-pressed={f.category === c.id}
              onclick={() => setCategory(c.id)}
              title={c.label}
              aria-label={`Only ${c.label}`}
            >
              <i class="dot"></i><span class="cl">{c.label}</span>
            </button>
          {/each}
        {/if}
      </div>
    </div>

    <p class="sum tnum" aria-live="polite" class:hidden={!items.length}>
      {#if filtered}
        {@const n = total.n + total.salah}
        <b><Rolling text={String(n)} reduced={rm} /></b> {plural(n, 'match', 'matches')}{#if !onlySalah && total.ms >= MINUTE}&nbsp;· <b>{formatDuration(total.ms)}</b> well spent{/if}
        <button class="reset" onclick={clearAll}>Show all</button>
      {:else}
        <b><Rolling text={String(total.n)} reduced={rm} /></b> {plural(total.n, 'thing')} done{#if total.ms >= MINUTE}&nbsp;· <b>{formatDuration(total.ms)}</b> well spent{/if}{#if total.salah}&nbsp;· <b>{total.salah}</b> {plural(total.salah, 'prayer')}{/if}
      {/if}
    </p>

    {#if days.length}
      <div class="days" bind:this={listEl}>
        {#each shown as d (d.date)}
          <section class="day" data-date={d.date} aria-label={`${dayTitle(d.date)}: ${daySum(d)}`} out:slide={{ duration: rm ? 0 : 260, easing: cubicOut }}>
            <header class="dh" class:flash={flash === d.date}>
              <span class="ring"><DayDial day={ring(d)} finish={view.finish} wake={settings.value.wake} sleep={settings.value.sleep} small /></span>
              <span class="dt">
                <span class="dn">{dayTitle(d.date)}{#if dayDate(d.date)}<span class="dd">{dayDate(d.date)}</span>{/if}</span>
                <span class="ds tnum">{daySum(d)}</span>
              </span>
            </header>
            <ul class="rows">
              {#each d.items as it, i (it.key)}
                <li out:slide={{ duration: rm ? 0 : 260, easing: cubicOut }}>
                  <HistoryRow item={it} index={i} canOpen={canOpen(it)} onopen={() => openItem(it)} onundo={() => undoDone(it)} />
                </li>
              {/each}
            </ul>
          </section>
        {/each}
      </div>
      {#if more}
        <div class="more" bind:this={sentinel}>
          <button class="btn btn-quiet" onclick={() => pages++}><Icon name="chevron-down" size={15} />Earlier days</button>
        </div>
      {:else if !filtered && first}
        <p class="end"><Icon name="plant" size={15} />{endLine}</p>
      {/if}
    {:else}
      <div class="empty" in:fly={{ y: 6, duration: rm ? 0 : 240, easing: cubicOut }}>
        <span class="halo"><Icon name={f.query.trim() ? 'search' : f.kind === 'salah' ? 'moon' : f.kind === 'events' ? 'calendar' : 'circle-dashed'} size={18} /></span>
        <p class="lede">{emptyLine.title}</p>
        {#if emptyLine.sub}<p class="sub">{emptyLine.sub}</p>{/if}
        <button class="btn btn-quiet" onclick={clearAll}>Show everything</button>
      </div>
    {/if}
  {:else}
    <div class="empty first" in:fly={{ y: 8, duration: rm ? 0 : 320, easing: cubicOut }}>
      <span class="bloom" aria-hidden="true">
        <svg viewBox="0 0 100 100">
          <circle class="track" cx="50" cy="50" r="42" />
          <path class="arc a1" d="M50 8 A42 42 0 0 1 88.6 33.5" pathLength="1" />
          <path class="arc a2" d="M91.3 57.5 A42 42 0 0 1 72 86" pathLength="1" />
          <path class="arc a3" d="M30 87 A42 42 0 0 1 9.4 60" pathLength="1" />
        </svg>
        <span class="sprout"><Icon name="plant" size={26} stroke={1.8} /></span>
      </span>
      <p class="lede">What you finish gathers here</p>
      <p class="sub">Tick a block, clear something from your backlog or mark a meeting done. Each one lands here, with when you did it and how long it took.</p>
      <button class="btn btn-soft" onclick={() => createNext(view.today)}><Icon name="plus" size={15} />Plan a block</button>
    </div>
  {/if}
</div>

<style>
  .history {
    --spring: cubic-bezier(0.34, 1.45, 0.64, 1);
    display: grid;
    align-content: start;
    gap: var(--s-2);
  }
  /* As a bottom sheet (78vh at most), keep a steady height while filters change what's listed:
     the sheet less its header, the tabs above and the bottom padding. */
  @media (max-width: 860px) {
    .history {
      min-height: calc(78vh - 150px);
    }
  }

  /* Search and filters stay in reach while the days scroll under them. */
  .tools {
    position: sticky;
    top: 0;
    z-index: 3;
    display: grid;
    gap: var(--s-2);
    margin: 0 calc(-1 * var(--s-5));
    padding: var(--s-2) var(--s-5) var(--s-2);
    background: var(--raised);
  }
  .search {
    display: flex;
    align-items: center;
    gap: 7px;
    height: 36px;
    padding: 0 6px 0 12px;
    border-radius: var(--r-pill);
    border: 1px solid var(--line);
    background: var(--surface);
    color: var(--ink-3);
    transition:
      border-color var(--dur-1) var(--ease-out),
      box-shadow var(--dur-1) var(--ease-out),
      background var(--dur-1) var(--ease-out);
  }
  .search:focus-within {
    border-color: var(--focus-ring);
    background: var(--raised);
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
    width: 24px;
    height: 24px;
    border-radius: 50%;
    color: var(--ink-3);
  }
  .clear:hover {
    background: var(--sunken);
    color: var(--ink);
  }

  .chips {
    display: flex;
    align-items: center;
    gap: 5px;
    overflow-x: auto;
    scrollbar-width: none;
    /* Room for the pressed chip's pop, and a soft fade where the row runs off. */
    margin: -3px calc(-1 * var(--s-5));
    padding: 3px var(--s-5);
    mask-image: linear-gradient(90deg, transparent, #000 var(--s-5), #000 calc(100% - var(--s-5)), transparent);
  }
  .chips::-webkit-scrollbar {
    display: none;
  }
  .chip {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 28px;
    padding: 0 11px;
    border-radius: var(--r-pill);
    border: 1px solid var(--line);
    font-family: var(--font-ui);
    font-size: var(--t-xs);
    color: var(--ink-2);
    transition:
      background var(--dur-1) var(--ease-out),
      border-color var(--dur-1) var(--ease-out),
      color var(--dur-1) var(--ease-out),
      transform var(--dur-2) var(--spring);
  }
  .chip:hover {
    border-color: var(--line-strong);
    color: var(--ink);
  }
  .chip:active {
    transform: scale(0.94);
  }
  .chip[aria-pressed='true'] {
    background: var(--ink);
    border-color: var(--ink);
    color: var(--ink-inverse);
  }
  .dot-chip[aria-pressed='true'] {
    background: color-mix(in srgb, var(--c) 14%, transparent);
    border-color: color-mix(in srgb, var(--c) 60%, transparent);
    color: var(--ink);
  }
  .dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--c);
  }
  .dot-chip[aria-pressed='true'] .dot {
    animation: dot-pop 340ms var(--spring);
  }
  @keyframes dot-pop {
    50% {
      transform: scale(1.45);
    }
  }
  .sep {
    flex: none;
    width: 1px;
    height: 16px;
    margin: 0 3px;
    background: var(--line-strong);
  }

  .sum {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 4px;
    margin: var(--s-1) 0 var(--s-1);
    font-family: var(--font-ui);
    font-size: var(--t-md);
    color: var(--ink-2);
  }
  .sum b {
    font-weight: 500;
    color: var(--ink);
  }
  .sum.hidden {
    display: none;
  }
  .reset {
    margin-left: auto;
    height: 26px;
    padding: 0 10px;
    border-radius: var(--r-pill);
    font-size: var(--t-xs);
    color: var(--ink-2);
  }
  .reset:hover {
    background: var(--sunken);
    color: var(--ink);
  }

  .days {
    display: grid;
    gap: var(--s-3);
  }
  .day {
    scroll-margin-top: var(--th);
  }
  /* Each day's header sticks under the tools until the next day pushes it on. */
  .dh {
    position: sticky;
    top: var(--th);
    z-index: 2;
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr);
    align-items: center;
    gap: var(--s-3);
    margin: 0 calc(-1 * var(--s-5));
    padding: 6px var(--s-5) 6px calc(var(--s-5) + 4px);
    background: var(--raised);
    box-shadow: 0 1px 0 var(--line);
  }
  .dh::after {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    background: color-mix(in srgb, var(--lume) 16%, transparent);
    opacity: 0;
    transition: opacity 0.9s var(--ease-out);
  }
  .dh.flash::after {
    opacity: 1;
    transition-duration: 0.2s;
  }
  .ring {
    display: block;
    width: 42px;
  }
  .dt {
    min-width: 0;
    display: grid;
    gap: 1px;
  }
  .dn {
    display: flex;
    align-items: baseline;
    gap: 8px;
    font-family: var(--font-ui);
    font-size: var(--t-md);
    font-weight: 500;
    color: var(--ink);
  }
  .dd {
    font-size: var(--t-xs);
    font-weight: 400;
    color: var(--ink-3);
  }
  .ds {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-ui);
    font-size: var(--t-xs);
    color: var(--ink-2);
  }
  .rows {
    display: grid;
    gap: 1px;
    margin: 4px 0 0;
    padding: 0;
    list-style: none;
  }

  .more {
    display: flex;
    justify-content: center;
    padding: var(--s-2) 0;
  }
  .end {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    margin: var(--s-3) 0 0;
    font-family: var(--font-ui);
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .end :global(svg) {
    color: var(--lume);
  }

  /* Empty states */
  .empty {
    display: grid;
    justify-items: center;
    gap: var(--s-2);
    padding: var(--s-6) var(--s-4);
    text-align: center;
  }
  .halo {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    color: var(--ink-3);
    background: var(--sunken);
  }
  .lede {
    margin: var(--s-2) 0 0;
    font-family: var(--font-ui);
    font-size: var(--t-lg);
    font-weight: 500;
    color: var(--ink);
  }
  .empty .sub {
    max-width: 36ch;
    margin: 0 0 var(--s-3);
    font-size: var(--t-sm);
    line-height: 1.5;
    color: var(--ink-2);
    text-wrap: pretty;
  }
  .empty.first {
    padding-top: var(--s-7);
  }
  /* A bezel with three finished inserts drawing on, and a sprout that springs up once. */
  .bloom {
    position: relative;
    display: grid;
    place-items: center;
    width: 112px;
    height: 112px;
  }
  .bloom svg {
    position: absolute;
    inset: 0;
    overflow: visible;
  }
  .track {
    fill: none;
    stroke: var(--sunken);
    stroke-width: 9;
  }
  .arc {
    fill: none;
    stroke: var(--lume);
    stroke-width: 9;
    stroke-linecap: round;
    stroke-dasharray: 1;
    stroke-dashoffset: 1;
    animation: draw 900ms var(--ease-out) forwards;
  }
  .a2 {
    animation-delay: 160ms;
    opacity: 0.7;
  }
  .a3 {
    animation-delay: 320ms;
    opacity: 0.45;
  }
  @keyframes draw {
    to {
      stroke-dashoffset: 0;
    }
  }
  .sprout {
    display: grid;
    place-items: center;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    color: var(--lume);
    background: color-mix(in srgb, var(--lume) 14%, transparent);
    animation: sprout 640ms var(--spring) 380ms both;
  }
  @keyframes sprout {
    from {
      opacity: 0;
      transform: scale(0.4) translateY(10px);
    }
  }
  :global([data-motion='calm']) .arc {
    animation: none;
    stroke-dashoffset: 0;
  }
  :global([data-motion='calm']) .sprout {
    animation: none;
  }
</style>
