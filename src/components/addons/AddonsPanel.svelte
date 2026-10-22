<script lang="ts">
  // The addon gallery: a calm, grouped list you can search and filter. Choose an addon to read
  // about it without losing your place: beside the list when the panel has room, in its own row
  // when it doesn't. Its switch turns it on with a small celebration; it then joins the top bar.
  // `view.sheet = { kind: 'addons', id }` opens it on that addon.
  import { tick, untrack } from 'svelte';
  import { flip } from 'svelte/animate';
  import { cubicOut } from 'svelte/easing';
  import { fade, fly, scale } from 'svelte/transition';
  import { ADDON_GROUPS, ADDONS, isOn, setOn, type AddonGroup, type AddonId, type AddonMeta } from '../../lib/addons/registry';
  import Icon from '../../lib/Icon.svelte';
  import { sounds } from '../../lib/sound';
  import { settings } from '../../lib/stores/settings.svelte';
  import { view } from '../../lib/stores/view.svelte';
  import Panel from '../Panel.svelte';
  import AddonDetail from './gallery/AddonDetail.svelte';
  import AddonRow from './gallery/AddonRow.svelte';
  import FilterChips from './gallery/FilterChips.svelte';

  type Filter = 'all' | 'on' | AddonGroup;

  /** From this content width the details sit beside the list. */
  const SPLIT_AT = 460;

  const open = $derived(view.sheet?.kind === 'addons');
  let query = $state('');
  let filter = $state<Filter>('all');
  /** What "On" shows: the addons on when it was chosen, so one you switch off there stays put. */
  let onSet = $state<AddonId[]>([]);
  let selected = $state<AddonId | null>(null);
  /** The row holding the list's one tab stop. */
  let cursor = $state<AddonId | null>(null);
  /** Just switched on: its tile and switch play their spring. */
  let fresh = $state<AddonId | null>(null);
  /** The details slide in from the side the choice moved to. */
  let dir = $state(1);
  /** The first moments after opening: rows arrive one after another. */
  let entering = $state(false);
  let width = $state(0);
  let barH = $state(0);
  /** Height of the panel's scrolling area. */
  let viewH = $state(0);
  let stuck = $state(false);
  let root = $state<HTMLDivElement>();
  let listEl = $state<HTMLDivElement>();
  let searchEl = $state<HTMLInputElement>();

  const split = $derived(width >= SPLIT_AT);
  const ms = (n: number) => (view.reducedMotion ? 0 : n);
  const onCount = $derived(ADDONS.filter((a) => isOn(a.id)).length);

  const HAY = new Map(
    ADDONS.map((a) => [
      a.id,
      [a.name, a.tagline, a.description, a.where ?? '', ...a.features.map((f) => f.text), ADDON_GROUPS.find((g) => g.id === a.group)?.name ?? '']
        .join(' ')
        .toLowerCase(),
    ]),
  );
  const words = $derived(query.trim().toLowerCase().split(/\s+/).filter(Boolean));
  const shown = $derived(
    ADDONS.filter(
      (a) =>
        (filter === 'all' || (filter === 'on' ? onSet.includes(a.id) : a.group === filter)) &&
        words.every((w) => HAY.get(a.id)!.includes(w)),
    ),
  );
  const sections = $derived(
    [
      ...ADDON_GROUPS.map((g) => ({ id: g.id as string, name: g.name, items: shown.filter((a) => a.group === g.id) })),
      { id: 'more', name: 'More', items: shown.filter((a) => !a.group) },
    ].filter((s) => s.items.length),
  );
  const order = $derived(sections.flatMap((s) => s.items));
  const rove = $derived.by(() => {
    const ids = order.map((a) => a.id);
    if (cursor && ids.includes(cursor)) return cursor;
    if (selected && ids.includes(selected)) return selected;
    return ids[0] ?? null;
  });
  const sel = $derived(order.find((a) => a.id === selected) ?? null);

  const chips = $derived([
    { id: 'all' as Filter, label: 'All' },
    { id: 'on' as Filter, label: 'On', title: 'On now', count: onCount },
    ...ADDON_GROUPS.filter((g) => ADDONS.some((a) => a.group === g.id)).map((g) => ({ id: g.id as Filter, label: g.short, title: g.name })),
  ]);

  function choose(f: Filter) {
    if (f === 'on') onSet = ADDONS.filter((a) => isOn(a.id)).map((a) => a.id);
    if (f !== filter) settlePill();
    filter = f;
  }

  let freshTimer: ReturnType<typeof setTimeout> | undefined;
  function toggle(a: AddonMeta, on: boolean, from: HTMLElement) {
    setOn(a.id, on);
    if (!on) return;
    if (filter === 'on' && !onSet.includes(a.id)) onSet = [...onSet, a.id];
    // Beside the list, the details follow it, so "Open" is right there.
    if (split && selected !== a.id) pick(a.id);
    fresh = a.id;
    const r = from.getBoundingClientRect();
    view.spark(r.left + r.width / 2, r.top + r.height / 2, a.accent, true);
    sounds.done();
    clearTimeout(freshTimer);
    freshTimer = setTimeout(() => (fresh = null), 1300);
  }

  function pick(id: AddonId) {
    cursor = id;
    const ids = order.map((a) => a.id);
    dir = selected && ids.indexOf(id) < ids.indexOf(selected) ? -1 : 1;
    if (split) {
      selected = id;
      return;
    }
    // Narrow: the row opens in place (or closes again), then settles into view.
    selected = selected === id ? null : id;
    if (selected) setTimeout(() => reveal(id), ms(480));
  }

  /** Bring a row into view inside the panel. */
  async function reveal(id: AddonId, smooth = true) {
    await tick();
    requestAnimationFrame(() => {
      listEl
        ?.querySelector<HTMLElement>(`[data-addon="${id}"]`)
        ?.scrollIntoView({ block: 'nearest', behavior: smooth && !view.reducedMotion ? 'smooth' : 'auto' });
    });
  }

  function focusRow(id: AddonId | null, part: string = 'pick') {
    if (!id) return;
    cursor = id;
    void tick().then(() => listEl?.querySelector<HTMLElement>(`[data-addon="${id}"] [data-part="${part}"]`)?.focus());
  }

  // Opening: a clean slate (but the last addon you looked at stays chosen). An `id` picks that
  // addon and scrolls it into view, also while the gallery is already open.
  let wasOpen = false;
  let enterTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const s = view.sheet;
    const want = s?.kind === 'addons' ? (s.id ?? '') : null;
    untrack(() => {
      if (want === null) {
        wasOpen = false;
        return;
      }
      const first = !wasOpen;
      wasOpen = true;
      if (first) {
        query = '';
        filter = 'all';
        entering = true;
        clearTimeout(enterTimer);
        enterTimer = setTimeout(() => (entering = false), 900);
      }
      const a = ADDONS.find((x) => x.id === want);
      if (a) {
        if (!shown.includes(a)) {
          query = '';
          filter = 'all';
        }
        selected = a.id;
        cursor = a.id;
        void reveal(a.id, !first);
        // A row opening in place grows; look again once it has.
        if (!split) setTimeout(() => reveal(a.id, true), ms(500));
      }
    });
  });

  // Beside the list, something is always chosen.
  $effect(() => {
    if (!open || !split || !order.length) return;
    if (!selected || !order.some((a) => a.id === selected)) selected = order[0].id;
  });

  // The selection pill behind the chosen row: it springs to its row (transform only).
  let ind = $state<{ y: number; h: number } | null>(null);
  let indReady = $state(false);
  /** While the list rearranges (a filter or a search), the pill steps out and comes back on its row. */
  let indAway = $state(false);
  let awayTimer: ReturnType<typeof setTimeout> | undefined;
  function settlePill() {
    indAway = true;
    clearTimeout(awayTimer);
    awayTimer = setTimeout(() => (indAway = false), ms(400));
  }
  $effect(() => {
    words.join(' ');
    untrack(settlePill);
  });
  function measureInd() {
    const el = selected ? listEl?.querySelector<HTMLElement>(`[data-addon="${selected}"]`) : null;
    if (!el || !listEl) {
      ind = null;
      return;
    }
    let y = 0;
    for (let n: HTMLElement | null = el; n && n !== listEl; n = n.offsetParent as HTMLElement | null) y += n.offsetTop;
    ind = { y, h: el.offsetHeight };
    if (!indReady) requestAnimationFrame(() => requestAnimationFrame(() => (indReady = true)));
  }
  $effect(() => {
    if (!open || !split) {
      ind = null;
      indReady = false;
      return;
    }
    selected;
    order;
    width;
    void tick().then(measureInd);
  });

  // The search bar stays on top while the list scrolls; a hairline shows once it's over rows.
  $effect(() => {
    let sc = root?.parentElement ?? null;
    while (sc && !/(auto|scroll)/.test(getComputedStyle(sc).overflowY)) sc = sc.parentElement;
    if (!sc) return;
    const el = sc;
    const onScroll = () => (stuck = el.scrollTop > 2);
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    // The pinned details never grow past what's in view.
    viewH = el.clientHeight;
    const ro = new ResizeObserver(() => (viewH = el.clientHeight));
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', onScroll);
      ro.disconnect();
    };
  });

  function listKey(e: KeyboardEvent) {
    const t = e.target as HTMLElement;
    const part = t.dataset.part;
    if (!part) return;
    const ids = order.map((a) => a.id);
    const i = ids.indexOf(t.closest<HTMLElement>('[data-addon]')?.dataset.addon as AddonId);
    if (i < 0) return;
    let j: number;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') j = Math.min(ids.length - 1, i + 1);
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') j = i - 1;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = ids.length - 1;
    else return;
    e.preventDefault();
    e.stopPropagation();
    if (j < 0) {
      searchEl?.focus();
      return;
    }
    if (j === i) return;
    if (split) pick(ids[j]);
    focusRow(ids[j], part);
  }

  // Keys the day uses elsewhere (Space ticks a block, ←/→ change the day) stay in the gallery.
  // On the document: after the gallery's own handlers, before the window's shortcuts.
  function rootKey(e: KeyboardEvent) {
    const t = e.target as HTMLElement;
    if (!root?.contains(t)) return;
    if ((e.key === ' ' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') && (t.tagName === 'BUTTON' || t.tagName === 'INPUT')) e.stopPropagation();
  }

  function searchKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && query) {
      e.preventDefault();
      e.stopPropagation();
      query = '';
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusRow(rove);
    } else if (e.key === 'Enter' && order.length) {
      e.preventDefault();
      if (selected !== order[0].id || !split) pick(order[0].id);
      focusRow(order[0].id);
    }
  }

  // "/" finds an addon, like the backlog.
  function slash(e: KeyboardEvent) {
    if (!open || e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target as HTMLElement;
    if (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return;
    e.preventDefault();
    searchEl?.focus();
  }

  // The list's arrow keys live on a plain wrapper (not a control), so it's attached here.
  $effect(() => {
    const l = listEl;
    l?.addEventListener('keydown', listKey);
    return () => l?.removeEventListener('keydown', listKey);
  });

  const stagger = (i: number) => (entering ? ms(50 + i * 30) : ms(40));
</script>

<svelte:window onkeydown={slash} />
<svelte:document onkeydown={rootKey} />

{#if open}
  <Panel title="Addons" onclose={() => (view.sheet = null)} wide>
    <div class="gallery" class:split bind:this={root} bind:clientWidth={width} style:--bar-h={`${barH}px`} style:--view-h={viewH ? `${viewH}px` : undefined}>
      <div class="bar" class:stuck bind:offsetHeight={barH} in:fade|global={{ duration: ms(240) }}>
        <label class="search">
          <Icon name="search" size={15} />
          <input
            bind:this={searchEl}
            bind:value={query}
            placeholder="Find an addon"
            aria-label="Find an addon"
            autocomplete="off"
            spellcheck="false"
            onkeydown={searchKey}
          />
          {#if query}
            <button type="button" class="clear" onclick={() => ((query = ''), searchEl?.focus())} aria-label="Clear search" in:scale={{ start: 0.6, duration: ms(200), easing: cubicOut }}>
              <Icon name="x" size={13} />
            </button>
          {:else}
            <kbd aria-hidden="true">/</kbd>
          {/if}
        </label>
        <FilterChips options={chips} value={filter} onchange={choose} label="Show addons" />
      </div>

      {#if order.length}
        <div class="body">
          <div class="list" bind:this={listEl}>
            {#if split && ind}
              <span class="ind" class:ready={indReady} class:away={indAway} style:--ac={sel?.accent} style:transform={`translateY(${ind.y}px)`} style:height={`${ind.h}px`} aria-hidden="true"></span>
            {/if}
            {#each sections as s (s.id)}
              <section aria-label={s.name} animate:flip={{ duration: ms(380), easing: cubicOut }} out:fade={{ duration: ms(140) }}>
                <h3 in:fly|global={{ y: 6, duration: ms(320), delay: stagger(order.indexOf(s.items[0])), easing: cubicOut }}>{s.name}</h3>
                {#each s.items as a (a.id)}
                  <div
                    class="slot"
                    animate:flip={{ duration: ms(380), easing: cubicOut }}
                    in:fly|global={{ y: 10, duration: ms(380), delay: stagger(order.indexOf(a)), easing: cubicOut }}
                    out:scale={{ start: 0.97, duration: ms(150), opacity: 0 }}
                  >
                    <AddonRow
                      addon={a}
                      on={isOn(a.id)}
                      selected={selected === a.id}
                      {split}
                      tabbable={rove === a.id}
                      fresh={fresh === a.id}
                      onselect={() => pick(a.id)}
                      ontoggle={(on, from) => toggle(a, on, from)}
                      onfocus={() => (cursor = a.id)}
                    />
                  </div>
                {/each}
              </section>
            {/each}
            {#if filter === 'all' && !words.length}
              <p class="note" in:fade|global={{ duration: ms(300), delay: stagger(order.length) }}>
                <Icon name="puzzle" size={13} /> Turning one off never changes your day. More are on the way.
              </p>
            {/if}
          </div>

          {#if split && sel}
            <aside class="side" aria-label={`About ${sel.name}`}>
              {#key sel.id}
                <div class="card" style:--ac={sel.accent} in:fly|global={{ y: dir * 10, duration: ms(340), delay: entering ? ms(120) : 0, easing: cubicOut }}>
                  <AddonDetail addon={sel} on={isOn(sel.id)} fresh={fresh === sel.id} onturnon={(from) => toggle(sel, true, from)} />
                </div>
              {/key}
            </aside>
          {/if}
        </div>
      {:else}
        <div class="empty" in:fly={{ y: 6, duration: ms(260), easing: cubicOut }}>
          <span class="empty-ic"><Icon name={words.length ? 'search' : 'puzzle'} size={18} /></span>
          {#if words.length}
            <p>No addons match “{query.trim()}”.</p>
            <button type="button" class="btn btn-quiet" onclick={() => ((query = ''), searchEl?.focus())}>Clear search</button>
          {:else}
            <p>None are on yet. Pick one you like and flip its switch.</p>
            <button type="button" class="btn btn-quiet" onclick={() => choose('all')}>See all addons</button>
          {/if}
        </div>
      {/if}
    </div>
  </Panel>
{/if}

<style>
  .gallery {
    min-width: 0;
  }
  /* The search and the chips stay on top while the list scrolls under them. */
  .bar {
    position: sticky;
    top: 0;
    z-index: 3;
    display: grid;
    gap: 10px;
    padding: 2px 0 12px;
    background: var(--raised);
  }
  .bar::after {
    content: '';
    position: absolute;
    left: calc(-1 * var(--s-5));
    right: calc(-1 * var(--s-5));
    bottom: 0;
    height: 1px;
    background: var(--line);
    opacity: 0;
    transition: opacity var(--dur-2) var(--ease-out);
  }
  .bar.stuck::after {
    opacity: 1;
  }
  .search {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    height: 36px;
    padding: 0 8px 0 12px;
    border-radius: var(--r-sm);
    border: 1px solid var(--line);
    background: var(--surface);
    color: var(--ink-3);
    transition:
      border-color var(--dur-1) var(--ease-out),
      box-shadow var(--dur-1) var(--ease-out),
      background-color var(--dur-1) var(--ease-out);
  }
  .search:hover {
    border-color: var(--line-strong);
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
    flex: none;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    color: var(--ink-3);
  }
  .clear:hover {
    background: var(--sunken);
    color: var(--ink);
  }
  kbd {
    display: grid;
    place-items: center;
    flex: none;
    min-width: 20px;
    height: 20px;
    padding: 0 5px;
    border-radius: 6px;
    border: 1px solid var(--line);
    font-family: var(--font-ui);
    font-size: 11px;
    color: var(--ink-3);
    transition: opacity var(--dur-2) var(--ease-out);
  }
  .search:focus-within kbd {
    opacity: 0;
  }

  .body {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
    gap: var(--s-4);
    padding-top: 2px;
  }
  .split .body {
    grid-template-columns: minmax(0, 0.84fr) minmax(0, 1fr);
    gap: var(--s-3);
  }
  .list {
    position: relative;
    isolation: isolate;
    container: gallery-list / inline-size;
    min-width: 0;
  }
  section {
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  section + section {
    margin-top: 14px;
  }
  h3 {
    margin: 0 0 3px;
    padding: 0 8px;
    font-family: var(--font-ui);
    font-size: var(--t-xs);
    font-weight: 500;
    color: var(--ink-3);
  }
  .slot {
    min-width: 0;
  }
  /* The selection pill: a soft tint of the chosen addon's colour that springs between rows. */
  .ind {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 0;
    border-radius: var(--r-md);
    background: color-mix(in srgb, var(--ac) 9%, var(--raised));
    box-shadow:
      inset 0 0 0 1px color-mix(in srgb, var(--ac) 22%, transparent),
      var(--shadow-1);
    opacity: 0;
    pointer-events: none;
  }
  .ind.ready {
    opacity: 1;
    transition:
      transform 480ms cubic-bezier(0.3, 1.32, 0.5, 1),
      background-color var(--dur-3) var(--ease-out),
      box-shadow var(--dur-3) var(--ease-out),
      opacity var(--dur-3) var(--ease-out);
  }
  .ind.ready.away {
    opacity: 0;
    transition: opacity 90ms var(--ease-out);
  }
  .note {
    display: flex;
    align-items: flex-start;
    gap: 7px;
    margin: 18px 0 0;
    padding: 0 8px;
    font-size: var(--t-xs);
    line-height: 1.45;
    color: var(--ink-3);
  }
  .note :global(svg) {
    flex: none;
    margin-top: 1px;
  }

  /* The details beside the list stay in view while it scrolls. */
  .side {
    position: sticky;
    top: calc(var(--bar-h) + 6px);
    min-width: 0;
  }
  /* It never grows past what's in view; the details scroll inside it, their footer stays. */
  .card {
    --card-pad: 14px;
    display: flex;
    flex-direction: column;
    max-height: calc(var(--view-h, 100vh) - var(--bar-h) - 6px - var(--s-5));
    overflow: hidden;
    border-radius: var(--r-lg);
    border: 1px solid color-mix(in srgb, var(--ac) 14%, var(--line));
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--ac) 7%, transparent), transparent 150px),
      var(--surface);
  }

  .empty {
    display: grid;
    justify-items: center;
    gap: var(--s-2);
    padding: var(--s-6) var(--s-4);
    text-align: center;
  }
  .empty-ic {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    margin-bottom: 2px;
    border-radius: 13px;
    color: var(--ink-3);
    background: color-mix(in srgb, var(--ink) 6%, transparent);
  }
  .empty p {
    margin: 0;
    max-width: 30ch;
    font-size: var(--t-sm);
    color: var(--ink-2);
    line-height: 1.5;
  }
  :global([data-motion='calm']) .ind.ready {
    transition-timing-function: var(--ease-out);
  }
</style>
