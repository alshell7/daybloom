<script module lang="ts">
  import type { ListId, SortMode } from '../lib/backlog';

  // Remembered while the app runs, so reopening the panel lands where you left it.
  const prefs = $state<{ tab: ListId; sort: SortMode; nudgeHiddenOn: string }>({ tab: 'inbox', sort: 'manual', nudgeHiddenOn: '' });
</script>

<script lang="ts">
  import { tick } from 'svelte';
  import { flip } from 'svelte/animate';
  import { fly, slide } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import {
    backlog,
    busyFor,
    counts,
    dueLabel,
    dueNow,
    filterActive,
    filterItems,
    freeTime,
    itemsIn,
    openItems,
    sortItems,
    windowFor,
    type Filter,
    type Plan,
    type Span,
  } from '../lib/backlog';
  import { addDays, formatDuration, MINUTE } from '../lib/engine/time';
  import type { BacklogList } from '../lib/engine/types';
  import Icon from '../lib/Icon.svelte';
  import { detent } from '../lib/sound';
  import { clock } from '../lib/stores/clock.svelte';
  import { taskFile } from '../lib/stores/tasks.svelte';
  import { view } from '../lib/stores/view.svelte';
  import BacklogRow from './backlog/BacklogRow.svelte';
  import Capture from './backlog/Capture.svelte';
  import FindBar from './backlog/FindBar.svelte';
  import ListTabs from './backlog/ListTabs.svelte';
  import PlanView from './backlog/PlanView.svelte';
  import Panel from './Panel.svelte';

  let filter = $state<Filter>({ query: '', categories: [], energy: [], priority: [] });
  let mode = $state<'list' | 'plan'>('list');

  const rm = $derived(view.reducedMotion);
  const all = $derived(taskFile.value.tasks);
  const today = $derived(view.today);
  const nowMs = $derived(clock.minute);
  const tally = $derived(counts(all));
  const items = $derived(sortItems(filterItems(itemsIn(all, prefs.tab), filter), prefs.sort, prefs.tab));
  const target = $derived<BacklogList>(prefs.tab === 'done' ? 'inbox' : prefs.tab);
  const reorderable = $derived(prefs.sort === 'manual' && prefs.tab !== 'done');
  const filtered = $derived(filterActive(filter));

  // ── Gentle urgency ──
  const due = $derived(dueNow(all, today));
  const showNudge = $derived(mode === 'list' && due.length > 0 && prefs.nudgeHiddenOn !== today);
  const nudgeText = $derived.by(() => {
    const late = due.some((t) => t.due! < today);
    if (due.length === 1) {
      const t = due[0];
      return late ? `“${t.title}” is still waiting (due ${dueLabel(t.due!, today).toLowerCase()}). Want to place it today?` : `“${t.title}” is due today. Want to place it?`;
    }
    return `${due.length} things are due ${late ? 'by' : ''} today. Want to place them?`.replace('  ', ' ');
  });

  // ── Free time left today (footer) ──
  const freeToday = $derived.by(() => {
    const w = windowFor(today, clock.minute);
    return w.toMs > w.fromMs ? freeTime(busyFor(today), w.fromMs, w.toMs) : 0;
  });

  // ── Capture → staggered entrance ──
  let fresh = $state<Record<string, number>>({});
  function captured(ids: string[]) {
    if (prefs.tab === 'done') prefs.tab = 'inbox';
    fresh = Object.fromEntries(ids.map((id, i) => [id, i]));
    setTimeout(() => (fresh = {}), 1200);
  }

  // ── Keyboard focus (roving tabindex) ──
  let listEl: HTMLUListElement | undefined = $state();
  let findBar: FindBar | undefined = $state();
  let focusId = $state<string | null>(null);

  function focusRow(id: string) {
    focusId = id;
    tick().then(() => listEl?.querySelector<HTMLElement>(`li[data-id="${id}"] .row`)?.focus());
  }

  function rowKey(e: KeyboardEvent, id: string) {
    const i = shown.findIndex((t) => t.id === id);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      if (e.altKey) {
        if (!reorderable) return;
        const n = shown[i + dir];
        if (!n) return;
        if (dir < 0) backlog.reorder(id, n.id);
        else backlog.reorder(id, null, n.id);
        focusRow(id);
        return;
      }
      const n = shown[i + dir];
      if (n) focusRow(n.id);
      else if (dir < 0) findBar?.focusSearch();
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      e.stopPropagation();
      const n = e.key === 'Home' ? shown[0] : shown[shown.length - 1];
      if (n) focusRow(n.id);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      e.stopPropagation();
      removeRow(id, true);
    }
  }

  // A focused row that leaves the list (done, placed, moved) hands focus to its neighbour.
  // (Svelte makes an outroing row inert, so its focus is already gone by then: remember
  // which row held focus and whether a key was just pressed instead.)
  let focusIndex = 0;
  let holding: string | null = null;
  let lastKeyAt = 0;
  $effect(() => {
    const mark = () => (lastKeyAt = performance.now());
    window.addEventListener('keydown', mark, true);
    return () => window.removeEventListener('keydown', mark, true);
  });
  $effect(() => {
    const list = shown;
    if (!focusId || list.some((t) => t.id === focusId)) return;
    const gone = focusId;
    focusId = null;
    const had = holding === gone && performance.now() - lastKeyAt < 1500;
    const n = list[Math.min(focusIndex, list.length - 1)];
    if (had && n) focusRow(n.id);
  });
  function listFocusOut(e: FocusEvent) {
    const to = e.relatedTarget as Node | null;
    if (to && !listEl?.contains(to)) holding = null;
  }

  function removeRow(id: string, keyboard = false) {
    const i = shown.findIndex((t) => t.id === id);
    const n = shown[i + 1] ?? shown[i - 1];
    backlog.remove(id);
    if (keyboard && n) focusRow(n.id);
  }

  // ── Pointer reorder (grip, 5px threshold, FLIP via animate:flip) ──
  let drag = $state<null | { id: string; ids: string[]; ty: number }>(null);
  let grab: null | { id: string; y0: number; offset: number; height: number; order: string[]; mids: number[] } = null;

  const byId = $derived(new Map(items.map((t) => [t.id, t])));
  const shown = $derived(drag ? drag.ids.map((id) => byId.get(id)).filter((t) => !!t) : items);
  const tabbableId = $derived(shown.some((t) => t.id === focusId) ? focusId : (shown[0]?.id ?? null));

  function startReorder(e: PointerEvent, id: string) {
    if (!reorderable || !listEl || e.button !== 0) return;
    const lis = [...listEl.querySelectorAll<HTMLElement>(':scope > li')];
    const li = lis.find((l) => l.dataset.id === id);
    if (!li) return;
    e.preventDefault();
    const order = shown.map((t) => t.id);
    const mids = order.map((x) => {
      const el = lis.find((l) => l.dataset.id === x);
      return el ? el.offsetTop + el.offsetHeight / 2 : 0;
    });
    const top = listEl.getBoundingClientRect().top;
    grab = { id, y0: e.clientY, offset: e.clientY - top - li.offsetTop, height: li.offsetHeight, order, mids };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', cancelDrag);
    window.addEventListener('keydown', onDragKey, true);
  }

  function onMove(e: PointerEvent) {
    const g = grab;
    if (!g || !listEl) return;
    if (!drag) {
      if (Math.abs(e.clientY - g.y0) < 5) return;
      drag = { id: g.id, ids: g.order, ty: 0 };
    }
    const y = e.clientY - listEl.getBoundingClientRect().top;
    const center = y - g.offset + g.height / 2;
    const others = g.order.filter((x) => x !== g.id);
    let at = 0;
    for (const x of others) if (center > g.mids[g.order.indexOf(x)]) at++;
    const ids = [...others];
    ids.splice(at, 0, g.id);
    if (ids.join() !== drag.ids.join()) {
      drag.ids = ids;
      detent();
    }
    tick().then(() => {
      const li = listEl?.querySelector<HTMLElement>(`li[data-id="${g.id}"]`);
      if (drag && li) drag.ty = y - g.offset - li.offsetTop;
    });
  }

  function stopListening() {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', cancelDrag);
    window.removeEventListener('keydown', onDragKey, true);
  }

  function onUp() {
    stopListening();
    const g = grab;
    grab = null;
    if (!drag || !g) return;
    const ids = drag.ids;
    const i = ids.indexOf(g.id);
    if (ids.join() !== g.order.join()) backlog.reorder(g.id, ids[i + 1] ?? null, ids[i - 1] ?? null);
    drag = null;
  }

  function cancelDrag() {
    stopListening();
    grab = null;
    drag = null;
  }

  function onDragKey(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    cancelDrag();
  }

  $effect(() => () => stopListening());

  // ── Plan my day ──
  let plan = $state<Plan | null>(null);
  let planBusy = $state<Span[]>([]);
  let shuffle = $state(0);
  let only = $state<string[] | null>(null);
  let planFor = $state<'today' | 'tomorrow'>('today');
  let excluded = $state<string[]>([]);
  let landed = $state(-1);

  function openPlan(ids: string[] | null = null) {
    only = ids;
    shuffle = 0;
    excluded = [];
    planFor = 'today';
    landed = -1;
    mode = 'plan';
  }

  // Re-plan as the minute moves, after a shuffle, or when the day changes — never mid-placement.
  $effect(() => {
    if (mode !== 'plan' || landed >= 0) return;
    clock.minute;
    const date = planFor === 'today' ? view.today : addDays(view.today, 1);
    plan = backlog.plan({ date, shuffle, only: only ?? undefined });
    planBusy = busyFor(date);
  });

  const chosen = $derived(plan ? plan.items.filter((i) => !excluded.includes(i.taskId)) : []);
  const emptyReason = $derived.by(() => {
    if (!plan || plan.items.length) return null;
    const pool = openItems(all).filter((t) => !only || only.includes(t.id));
    if (!pool.length) return 'no-items' as const;
    if (plan.freeMs < 15 * MINUTE) return 'no-time' as const;
    return 'no-fit' as const;
  });

  function toggleItem(id: string) {
    excluded = excluded.includes(id) ? excluded.filter((x) => x !== id) : [...excluded, id];
  }

  async function place() {
    const p = plan;
    if (!p || landed >= 0 || !chosen.length) return;
    const list = chosen;
    landed = 0;
    await backlog.place(list, { onEach: (k) => (landed = p.items.indexOf(list[k]) + 1) });
    await new Promise((r) => setTimeout(r, rm ? 0 : 700));
    mode = 'list';
    landed = -1;
    plan = null;
  }

  function back() {
    mode = 'list';
    plan = null;
  }

  // "/" finds, from anywhere while the panel is open.
  function onWindowKey(e: KeyboardEvent) {
    if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || mode !== 'list') return;
    const el = e.target as HTMLElement;
    if (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return;
    e.preventDefault();
    findBar?.focusSearch();
  }

  const EMPTY: Record<ListId, { icon: string; title: string; sub: string }> = {
    inbox: { icon: 'inbox', title: 'Inbox is clear.', sub: 'Dump anything on your mind above, and sort it later.' },
    next: { icon: 'arrow-right', title: 'Nothing lined up next.', sub: 'Move things here from the Inbox when you know they’re coming up.' },
    someday: { icon: 'sunrise', title: 'Someday is empty.', sub: 'A home for ideas with no deadline.' },
    done: { icon: 'circle-check', title: 'Nothing finished here yet.', sub: 'Tick things off in the backlog and they gather here.' },
  };
</script>

<svelte:window onkeydown={onWindowKey} />

{#if view.sheet?.kind === 'backlog'}
  <Panel title="Backlog" onclose={() => (view.sheet = null)} wide>
    <div class="backlog">
      {#if mode === 'plan' && plan}
        <div class="mode" in:fly={{ x: 16, duration: rm ? 0 : 300, easing: cubicOut }}>
          <PlanView
            {plan}
            busy={planBusy}
            {excluded}
            {landed}
            day={planFor}
            only={!!only}
            empty={emptyReason}
            ontoggle={toggleItem}
            onplantomorrow={() => {
              planFor = 'tomorrow';
              only = null;
            }}
          />
        </div>
      {:else}
        <div class="mode" in:fly={{ x: -16, duration: rm ? 0 : 300, easing: cubicOut }}>
          {#if showNudge}
            <div class="nudge" role="status" transition:slide={{ duration: rm ? 0 : 240, easing: cubicOut }}>
              <span class="nudge-ico"><Icon name="calendar-clock" size={16} /></span>
              <span class="nudge-text">{nudgeText}</span>
              <button class="nudge-go" onclick={() => openPlan(due.map((t) => t.id))}>Place {due.length === 1 ? 'it' : 'them'}</button>
              <button class="nudge-x" onclick={() => (prefs.nudgeHiddenOn = today)} aria-label="Not now" title="Not now"><Icon name="x" size={14} /></button>
            </div>
          {/if}

          <Capture {target} oncaptured={captured} />

          <div class="tabs-row">
            <ListTabs value={prefs.tab} counts={tally} onchange={(v) => (prefs.tab = v)} />
          </div>

          <FindBar bind:this={findBar} bind:filter sort={prefs.sort} onsort={(s) => (prefs.sort = s)} showSort={prefs.tab !== 'done'} onarrowdown={() => shown[0] && focusRow(shown[0].id)} />

          {#key prefs.tab}
            <div class="list-wrap" in:fly={{ y: 6, duration: rm ? 0 : 240, easing: cubicOut }}>
              {#if shown.length}
                <ul class="rows" bind:this={listEl} aria-label={`${prefs.tab} items`} onfocusout={listFocusOut}>
                  {#each shown as t (t.id)}
                    <li
                      data-id={t.id}
                      animate:flip={{ duration: rm || drag?.id === t.id ? 0 : 240, easing: cubicOut }}
                      in:fly={{ y: 8, duration: rm ? 0 : 280, delay: rm ? 0 : (fresh[t.id] ?? 0) * 55, easing: cubicOut }}
                      out:fly={{ x: -24, duration: rm ? 0 : 220, easing: cubicOut }}
                    >
                      <BacklogRow
                        task={t}
                        list={prefs.tab}
                        {today}
                        {nowMs}
                        tabbable={tabbableId === t.id}
                        {reorderable}
                        dragging={drag?.id === t.id}
                        ty={drag?.id === t.id ? drag.ty : 0}
                        onkey={(e) => rowKey(e, t.id)}
                        ongrip={(e) => startReorder(e, t.id)}
                        onfocused={() => {
                          focusId = t.id;
                          holding = t.id;
                          focusIndex = shown.findIndex((x) => x.id === t.id);
                        }}
                        onremove={() => removeRow(t.id)}
                      />
                    </li>
                  {/each}
                </ul>
                {#if prefs.tab !== 'done'}
                  <p class="foot-hint">
                    Drag a row onto the dial to place it. <kbd>↑</kbd><kbd>↓</kbd> move · <kbd>⏎</kbd> rename · <kbd>Space</kbd> done · <kbd>T</kbd> today
                  </p>
                {:else}
                  <button class="btn btn-quiet clear-done" onclick={() => backlog.clearDone()}>
                    <Icon name="archive" size={15} />Clear {tally.done} finished
                  </button>
                {/if}
              {:else if filtered && tally[prefs.tab]}
                <div class="empty">
                  <span class="halo"><Icon name="search" size={18} /></span>
                  <p class="lede">Nothing matches.</p>
                  <button class="btn btn-quiet" onclick={() => (filter = { query: '', categories: [], energy: [], priority: [] })}>Clear search and filters</button>
                </div>
              {:else}
                {@const e = EMPTY[prefs.tab]}
                <div class="empty">
                  <span class="halo"><Icon name={e.icon} size={18} /></span>
                  <p class="lede">{e.title}</p>
                  <p class="sub">{e.sub}</p>
                </div>
              {/if}
            </div>
          {/key}
        </div>
      {/if}
    </div>

    {#snippet footer()}
      {#if mode === 'plan'}
        <button class="btn btn-quiet" onclick={back} disabled={landed >= 0}><Icon name="chevron-left" size={16} />Back</button>
        {#if plan && plan.items.length + plan.skipped.length > 1}
          <button class="btn btn-quiet" onclick={() => shuffle++} disabled={landed >= 0} title="Try another arrangement">
            <Icon name="shuffle" size={15} />Shuffle
          </button>
        {/if}
        <span class="grow"></span>
        {#if plan?.items.length}
          <button class="btn btn-primary" onclick={place} disabled={!chosen.length || landed >= 0}>
            {landed >= 0 ? 'Placing…' : `Place ${chosen.length} ${chosen.length === 1 ? 'block' : 'blocks'}`}
          </button>
        {/if}
      {:else}
        <span class="free tnum">
          {#if freeToday >= 5 * MINUTE}<b>{formatDuration(freeToday)}</b> free today{:else}The day is full{/if}
        </span>
        <span class="grow"></span>
        <button class="btn btn-primary" onclick={() => openPlan()}><Icon name="wand-sparkles" size={15} />Plan my day</button>
      {/if}
    {/snippet}
  </Panel>
{/if}

<style>
  .backlog {
    container: backlog / inline-size;
    /* Gentle urgency: warm amber, never red. */
    --warm-ink: #8a5300;
    --warm-wash: color-mix(in srgb, #f0a521 17%, transparent);
  }
  :global([data-theme='dark']) .backlog {
    --warm-ink: #f6c77a;
    --warm-wash: color-mix(in srgb, #f0a521 16%, transparent);
  }
  .mode {
    display: grid;
    gap: var(--s-3);
  }

  .nudge {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    min-height: 40px;
    padding: 5px 5px 5px 10px;
    border-radius: var(--r-md);
    background: var(--warm-wash);
    color: var(--ink);
    font-size: var(--t-sm);
    line-height: 1.35;
  }
  .nudge-ico {
    display: grid;
    flex: none;
    color: var(--warm-ink);
  }
  .nudge-text {
    flex: 1;
    min-width: 0;
  }
  .nudge-go {
    flex: none;
    height: 30px;
    padding: 0 12px;
    border-radius: var(--r-pill);
    background: var(--raised);
    box-shadow: var(--shadow-1);
    font-family: var(--font-ui);
    font-size: var(--t-xs);
    font-weight: 500;
    transition: box-shadow var(--dur-1) var(--ease-out), transform var(--dur-1) var(--ease-out);
  }
  .nudge-go:hover {
    box-shadow: var(--shadow-2);
  }
  .nudge-go:active {
    transform: scale(0.97);
  }
  .nudge-x {
    display: grid;
    place-items: center;
    flex: none;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    color: var(--ink-2);
  }
  .nudge-x:hover {
    background: color-mix(in srgb, var(--ink) 7%, transparent);
  }

  .tabs-row {
    margin-top: var(--s-1);
  }

  .rows {
    position: relative;
    list-style: none;
    margin: 0 -10px;
    padding: 0;
    display: grid;
    gap: 1px;
  }
  .foot-hint {
    margin: var(--s-2) 0 0;
    font-size: 11px;
    line-height: 1.8;
    color: var(--ink-3);
  }
  kbd {
    font-family: var(--font-ui);
    font-size: 10px;
    padding: 0 4px;
    margin: 0 1px;
    border-radius: 4px;
    border: 1px solid var(--line-strong);
    color: var(--ink-3);
  }

  .clear-done {
    margin: var(--s-2) 0 0 -6px;
    height: 32px;
    padding: 0 12px;
    font-size: var(--t-xs);
  }

  .empty {
    display: grid;
    justify-items: center;
    gap: 4px;
    padding: var(--s-6) var(--s-4) var(--s-5);
    text-align: center;
  }
  .halo {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    margin-bottom: 6px;
    border-radius: 50%;
    background: var(--sunken);
    color: var(--ink-2);
  }
  .lede {
    margin: 0;
    font-family: var(--font-ui);
    font-size: var(--t-md);
    font-weight: 500;
  }
  .sub {
    margin: 0;
    max-width: 32ch;
    font-size: var(--t-sm);
    color: var(--ink-3);
  }

  .grow {
    flex: 1;
  }
  .free {
    font-size: var(--t-sm);
    color: var(--ink-3);
  }
  .free b {
    font-weight: 500;
    color: var(--ink-2);
  }
</style>
