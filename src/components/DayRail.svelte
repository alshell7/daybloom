<script lang="ts">
  import { attention } from '../lib/native/attention.svelte';
  import { tick } from 'svelte';
  import { flip } from 'svelte/animate';
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { createNext, toggleDone } from '../lib/actions';
  import { blockKey } from '../lib/engine/blocks';
  import { formatDuration, formatTime, minutesOfDay, MINUTE, startOfDayMs } from '../lib/engine/time';
  import type { Block } from '../lib/engine/types';
  import Icon from '../lib/Icon.svelte';
  import { clock } from '../lib/stores/clock.svelte';
  import { taskFile, tasks } from '../lib/stores/tasks.svelte';
  import { view } from '../lib/stores/view.svelte';
  import RailBlock from './RailBlock.svelte';
  import Rolling from '../lib/dial/Rolling.svelte';
  import QuickAdd from './QuickAdd.svelte';
  import RhythmChip from './RhythmChip.svelte';
  import Capture from './backlog/Capture.svelte';
  import { dueNow } from '../lib/backlog';
  import { dragWidth, layout, RAIL_MIN, railDrag, railMax, shows } from '../lib/stores/layout.svelte';
  import RailFilter from './RailFilter.svelte';
  import { isOn } from '../lib/addons/registry';
  import { drainOf, handoffs, type Handoff } from '../lib/addons/landings/landings';
  import { landings } from '../lib/addons/landings/landings.svelte';
  import { landingsFile } from '../lib/addons/landings/pad.svelte';
  import { timelineMode } from '../lib/addons/views/views.svelte';
  import ViewSwitch from './addons/views/ViewSwitch.svelte';
  import BoardView from './addons/views/BoardView.svelte';
  import GanttView from './addons/views/GanttView.svelte';

  // Timeline views addon: the list can also show as a board or a Gantt chart.
  const viewsOn = $derived(isOn('views'));
  const alt = $derived(timelineMode());

  type Row =
    | { kind: 'block'; key: string; block: Block }
    | { kind: 'gap'; key: string; startMs: number; endMs: number; landing: boolean }
    | { kind: 'land'; key: string; h: Handoff }
    | { kind: 'now'; key: string };

  // Soft landings: back-to-back hand-offs after meetings, and gaps that are time to land.
  const landOn = $derived(isOn('landings') && landingsFile.value.settings.buffer > 0);
  const hands = $derived(landOn ? handoffs(view.dayBlocks, landingsFile.value.settings.buffer) : []);

  const dayStart = $derived(startOfDayMs(view.date));

  const allRows = $derived.by(() => {
    const out: Row[] = [];
    const blocks = view.dayBlocks.filter((b) => !b.floating);
    const now = clock.minute;
    let cursor = blocks.length ? Math.min(blocks[0].startMs, view.isToday ? now : Infinity) : dayStart;
    let nowPlaced = !view.isToday;
    let prev: Block | null = null;
    const lands = (b: Block | null) => landOn && !!b && drainOf(b) !== null;
    for (const b of blocks) {
      if (!nowPlaced && now < b.startMs) {
        if (b.startMs - cursor >= 15 * MINUTE && now > cursor) {
          out.push({ kind: 'gap', key: `gap:${cursor}`, startMs: cursor, endMs: now, landing: lands(prev) && prev!.endMs === cursor });
          cursor = now;
        }
        out.push({ kind: 'now', key: 'now' });
        nowPlaced = true;
      }
      if (b.startMs - cursor >= 15 * MINUTE) out.push({ kind: 'gap', key: `gap:${cursor}`, startMs: cursor, endMs: b.startMs, landing: lands(prev) && prev!.endMs === cursor });
      out.push({ kind: 'block', key: b.key, block: b });
      const h = hands.find((x) => x.from.key === b.key);
      if (h) out.push({ kind: 'land', key: `land:${b.key}`, h });
      prev = b;
      if (!nowPlaced && now >= b.startMs && now < b.endMs) nowPlaced = true; // the block itself shows progress
      cursor = Math.max(cursor, b.endMs);
    }
    if (!nowPlaced) out.push({ kind: 'now', key: 'now' });
    return out;
  });

  // The filter only changes what is listed: free time is worked out from everything.
  const filter = $derived(layout.value.filter);
  const rows = $derived(allRows.filter((r) => (r.kind === 'block' ? shows(r.block, filter) : r.kind === 'gap' ? !filter.free : true)));
  const anytime = $derived(view.floating.filter((b) => shows(b, filter)));
  const dayAll = $derived([...view.dayBlocks.filter((b) => !b.floating && b.date === view.date), ...view.floating]);
  const hiddenCount = $derived(dayAll.filter((b) => !shows(b, filter)).length);

  /** An empty glass for free time: taller for longer stretches, gently (a square root). */
  const ghost = (ms: number) => Math.round(Math.min(84, 16 + 10 * Math.sqrt(ms / MINUTE / 15)));

  // ── The track: the line through the capsules fills down to now, like a train's route. ──
  let tl = $state<HTMLDivElement>();
  let fill = $state(0);
  function measure() {
    if (!tl) return;
    if (view.date < view.today) return void (fill = 1);
    if (view.date > view.today) return void (fill = 0);
    const box = tl.getBoundingClientRect();
    const top = 14;
    const span = box.height - 28;
    if (span <= 0) return;
    let y: number | null = null;
    const nowEl = tl.querySelector<HTMLElement>('.now-line');
    if (nowEl) {
      const r = nowEl.getBoundingClientRect();
      y = r.top - box.top + r.height / 2;
    } else {
      const now = clock.now;
      const items = [...tl.querySelectorAll<HTMLElement>('li[data-s]')];
      for (const li of items) {
        const s = Number(li.dataset.s);
        const e = Number(li.dataset.e);
        if (now >= s && now < e) {
          const r = li.getBoundingClientRect();
          y = r.top - box.top + ((now - s) / (e - s)) * r.height;
          break;
        }
      }
      if (y === null && items.length) y = now >= Number(items[items.length - 1].dataset.e) ? box.height : 0;
    }
    fill = Math.min(1, Math.max(0, ((y ?? 0) - top) / span));
  }
  $effect(() => {
    void rows;
    void clock.minute;
    void view.date;
    void railW;
    let t: ReturnType<typeof setTimeout>;
    tick().then(() => {
      measure();
      // Again once rows have glided into place.
      t = setTimeout(measure, 380);
    });
    return () => clearTimeout(t);
  });
  $effect(() => {
    if (!tl) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(tl);
    return () => ro.disconnect();
  });

  // The day's tally: what's done and how much time it was worth. Counts up, never down-shames.
  const doneMs = $derived(
    view.dayBlocks
      .filter((b) => b.kind === 'task' && b.done && !b.floating)
      .reduce((sum, b) => sum + Math.max(0, Math.min(b.endMs, b.doneAt ?? b.endMs) - b.startMs), 0),
  );
  const ratio = $derived(view.tally.total ? view.tally.done / view.tally.total : 0);

  const due = $derived(dueNow(taskFile.value.tasks, view.today).length);

  // ── Resizing: drag the left edge; double-click (or Enter) fits it again ──
  let rail = $state<HTMLElement>();
  let railW = $state(0);
  let gripY = $state(0);
  let held: { id: number; grabX: number; start: number; auto: number; max: number; keep: number } | null = null;
  let settleTimer: ReturnType<typeof setTimeout> | undefined;

  /** The automatic width right now (the stage's --rail-auto, measured). */
  function autoWidth(): number {
    const stage = rail?.parentElement;
    if (!stage) return RAIL_MIN;
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;visibility:hidden;height:0;width:var(--rail-auto)';
    stage.append(probe);
    const w = probe.offsetWidth;
    probe.remove();
    return w;
  }
  function settle() {
    clearTimeout(settleTimer);
    if (view.reducedMotion) return;
    railDrag.settling = true;
    settleTimer = setTimeout(() => (railDrag.settling = false), 420);
  }
  function gripDown(e: PointerEvent) {
    if (e.button !== 0 || !rail) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const start = rail.offsetWidth;
    held = { id: e.pointerId, grabX: e.clientX, start, auto: autoWidth(), max: railMax(innerWidth), keep: start };
    clearTimeout(settleTimer);
    railDrag.settling = false;
    railDrag.width = start;
    railDrag.auto = layout.value.railWidth === 0;
    railDrag.active = true;
    document.documentElement.classList.add('col-resizing');
  }
  function gripMove(e: PointerEvent) {
    gripY = e.clientY - (rail?.getBoundingClientRect().top ?? 0);
    if (!held || e.pointerId !== held.id) return;
    const d = dragWidth(held.start + (held.grabX - e.clientX), held.auto, held.max);
    railDrag.width = d.shown;
    railDrag.auto = d.auto;
    held.keep = d.keep;
  }
  function gripUp(e: PointerEvent) {
    if (!held || e.pointerId !== held.id) return;
    layout.value.railWidth = railDrag.auto ? 0 : held.keep;
    held = null;
    settle();
    railDrag.active = false;
    document.documentElement.classList.remove('col-resizing');
  }
  function fit() {
    layout.value.railWidth = 0;
    settle();
  }
  function gripKey(e: KeyboardEvent) {
    const max = railMax(innerWidth);
    const step = e.shiftKey ? 48 : 16;
    const cur = rail?.offsetWidth ?? RAIL_MIN;
    const to = (w: number) => {
      e.preventDefault();
      layout.value.railWidth = Math.round(Math.min(max, Math.max(RAIL_MIN, w)));
      settle();
    };
    if (e.key === 'ArrowLeft') to(cur + step);
    else if (e.key === 'ArrowRight') to(cur - step);
    else if (e.key === 'Home') to(RAIL_MIN);
    else if (e.key === 'End') to(max);
    else if (e.key === 'Enter') {
      e.preventDefault();
      fit();
    }
  }

  function anytimeToggle(b: Block, e: MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    toggleDone(b.key, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
  }
</script>

<aside class="rail" aria-label="Day timeline" bind:this={rail} bind:clientWidth={railW}>
  <!-- A focusable window splitter (ARIA separator): drag it, or use the arrow keys. -->
  {#if alt === 'list'}
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <div
    class="grip"
    class:held={railDrag.active}
    class:snapped={railDrag.active && railDrag.auto}
    style:--y={`${gripY}px`}
    role="separator"
    aria-orientation="vertical"
    aria-label="Timeline width"
    aria-valuenow={railW}
    aria-valuemin={RAIL_MIN}
    aria-valuemax={railMax(innerWidth)}
    tabindex="0"
    title={layout.value.railWidth ? 'Drag to resize · double-click to fit' : 'Drag to resize'}
    onpointerdown={gripDown}
    onpointermove={gripMove}
    onpointerup={gripUp}
    onpointercancel={gripUp}
    ondblclick={fit}
    onkeydown={gripKey}
  >
    <span class="pill" aria-hidden="true"></span>
    <span class="tag" aria-hidden="true">Fit</span>
  </div>
  {/if}
  <div class="scroll" class:fill={alt !== 'list'}>
    {#if viewsOn}<ViewSwitch />{/if}
    <div class="quick-wrap"><QuickAdd /></div>

    {#if alt === 'board'}
      <BoardView />
    {:else if alt === 'gantt'}
      <GanttView />
    {:else}
    {#if view.tally.total}
      <header class="tally" class:all={ratio === 1}>
        <div class="tally-row">
          <button class="count" onclick={() => (view.sheet = { kind: 'insights', tab: 'done', date: view.date })} title="See what you've done" aria-label={`${view.tally.done} of ${view.tally.total} done: see your history`}><span class="big tnum"><Rolling text={String(view.tally.done)} reduced={view.reducedMotion} /></span> of {view.tally.total} done</button>
          {#if doneMs > 0}
            <span class="spent tnum"><Rolling text={formatDuration(doneMs)} reduced={view.reducedMotion} /> well spent</span>
          {/if}
        </div>
        <span class="bar" aria-hidden="true"><i style:transform={`scaleX(${ratio})`}></i></span>
        {#if view.isToday}<RhythmChip />{/if}
      </header>
    {/if}

    <!-- The filter sits on the first heading: Anytime, or Timeline when there are no anytime blocks. -->
    {#snippet head(title: string)}
      <div class="tl-head">
        <h2>{title}{#if hiddenCount}<span class="hid">{` · ${hiddenCount} hidden`}</span>{/if}</h2>
        <RailFilter blocks={dayAll} hidden={hiddenCount} />
      </div>
    {/snippet}
    {#if dayAll.length && !anytime.length}
      {@render head('Timeline')}
    {/if}

    {#if anytime.length}
      <section class="anytime" aria-label="Anytime">
        {@render head('Anytime')}
        <div class="chips">
          {#each anytime as b (b.key)}
            <div class="any" class:done={b.done} class:event={b.kind === 'event'} style:--c={b.color} title={b.kind === 'event' ? `All day · from your calendar${b.event?.calendarName ? `: ${b.event.calendarName}` : ''}` : undefined}>
              {#if b.kind === 'event'}
                <span class="cal-mark" aria-hidden="true"><Icon name="calendar" size={12} stroke={2.2} /></span>
              {:else}
                <button class="tick" onclick={(e) => anytimeToggle(b, e)} aria-label={b.done ? `Mark ${b.title} not done` : `Mark ${b.title} done`} aria-pressed={b.done}>
                  {#if b.done}<Icon name="check" size={13} stroke={3} />{/if}
                </button>
              {/if}
              <button class="any-title" onclick={() => { view.selected = b.key; if (b.kind === 'task') view.sheet = { kind: 'edit', key: b.key }; }}>
                {#if b.kind !== 'event'}<Icon name={b.icon} size={14} />{/if}
                <span>{b.title}</span>
              </button>
            </div>
          {/each}
        </div>
      </section>
    {/if}

    <div class="tl" bind:this={tl}>
    {#if rows.length}
      <span class="track" aria-hidden="true"><i style:transform={`scaleY(${fill})`}></i></span>
    {/if}
    <ol class="timeline">
      {#each rows as row (row.key)}
        <li
          animate:flip={{ duration: view.reducedMotion ? 0 : 320, easing: cubicOut }}
          in:fly={{ y: 8, duration: view.reducedMotion ? 0 : 280 }}
          data-s={row.kind === 'block' ? row.block.startMs : row.kind === 'gap' ? row.startMs : undefined}
          data-e={row.kind === 'block' ? row.block.endMs : row.kind === 'gap' ? row.endMs : undefined}
        >
          {#if row.kind === 'block'}
            <RailBlock block={row.block} />
          {:else if row.kind === 'gap'}
            {@const len = row.endMs - row.startMs}
            <div class="gap" class:gone={row.endMs <= clock.minute} style:--gh={`${ghost(len)}px`}>
              <span class="gap-time tnum">{formatTime(row.startMs, view.hour12)}</span>
              <span class="ghost" aria-hidden="true"></span>
              <span class="gap-label">{#if row.landing}<Icon name="leaf" size={11} /> {formatDuration(len)} to land{:else}{formatDuration(len)} free{/if}</span>
              <button
                class="gap-add"
                aria-label={`Add a block at ${formatTime(row.startMs, view.hour12)}`}
                onclick={() => {
                  const t = tasks.create({ title: '', date: view.date, start: Math.round(minutesOfDay(row.startMs)), duration: Math.min(30, Math.round(len / MINUTE)), alerts: [5] });
                  view.selected = blockKey(t.id, view.date);
                  view.sheet = { kind: 'edit', key: view.selected };
                }}
              >
                <Icon name="plus" size={14} stroke={2.2} />
              </button>
            </div>
          {:else if row.kind === 'land'}
            <div class="land">
              <span></span>
              <span class="land-mark" aria-hidden="true"><Icon name="leaf" size={11} stroke={2.2} /></span>
              <span class="land-label">{row.h.run > 1 ? `${row.h.run} meetings, then` : 'Then'} {row.h.gapMin ? `${row.h.gapMin}m` : 'no time'} to land</span>
              {#if row.h.to.kind === 'task' && !row.h.to.readOnly}
                <button class="land-room" onclick={() => landings.makeRoom(row.h)}>Make {row.h.needMin}m room</button>
              {/if}
            </div>
          {:else}
            <div class="now-line" aria-label={`Now, ${formatTime(clock.now, view.hour12)}`}>
              <span class="now-time tnum">{formatTime(clock.now, view.hour12)}</span>
              <span class="now-rule" aria-hidden="true">
                {#key attention.looking ? clock.minute : 0}<i class="now-dot"></i>{/key}
              </span>
            </div>
          {/if}
        </li>
      {/each}
    </ol>
    </div>

    {#if view.dayBlocks.length === 0 && view.floating.length === 0}
      <div class="empty">
        <svg class="sweep-demo" viewBox="0 0 64 64" aria-hidden="true">
          <circle cx="32" cy="32" r="24" class="ring" />
          <circle cx="32" cy="32" r="24" class="arc" pathLength="100" />
          <circle cx="32" cy="8" r="3.5" class="finger" />
        </svg>
        <p class="empty-title">A blank day.</p>
        <p class="empty-copy">Sweep around the dial's ring to paint a block of time, or add one here.</p>
      </div>
    {/if}

    <button class="add" onclick={() => createNext()}>
      <span class="add-icon"><Icon name="plus" size={16} stroke={2.2} /></span>
      Add a block
      <kbd>N</kbd>
    </button>

    <section class="later" class:drop={view.backlogDrop} aria-label="Backlog" data-drop="backlog">
      <button class="later-head" data-genie="backlog" onclick={() => (view.sheet = view.sheet?.kind === 'backlog' ? null : { kind: 'backlog' })}>
        <Icon name="inbox" size={16} />
        <span>Backlog</span>
        <span class="count tnum">{view.later.length || ''}</span>
        {#if due}<span class="due tnum">{due} due</span>{/if}
        <span class="open-link">Open <Icon name="chevron-right" size={14} /></span>
      </button>
      <div class="capture-wrap"><Capture target="inbox" /></div>
    </section>
    {/if}
  </div>
</aside>

<style>
  .rail {
    position: relative;
    min-height: 0;
    border-left: 1px solid var(--line);
    background: var(--surface);
    display: grid;
    container: rail / inline-size;
  }

  /* ── The resize handle: a quiet seam that wakes on hover ── */
  .grip {
    position: absolute;
    z-index: 4;
    top: 0;
    bottom: 0;
    left: -7px;
    width: 13px;
    cursor: col-resize;
    touch-action: none;
    outline: none;
  }
  .grip::before {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: 5px;
    width: 3px;
    border-radius: 2px;
    background: color-mix(in srgb, var(--ink) 22%, transparent);
    opacity: 0;
    transform: scaleY(0.7);
    transition:
      opacity var(--dur-2) var(--ease-out),
      transform var(--dur-3) var(--ease-out),
      background var(--dur-2) var(--ease-out);
  }
  .grip:hover::before {
    transition-delay: 120ms;
  }
  .grip:hover::before,
  .grip.held::before,
  .grip:focus-visible::before {
    opacity: 1;
    transform: none;
  }
  .grip.held::before {
    background: color-mix(in srgb, var(--ink) 34%, transparent);
  }
  .grip:focus-visible::before {
    background: var(--focus-ring);
  }
  .pill {
    position: absolute;
    left: 2px;
    top: clamp(24px, var(--y), calc(100% - 24px));
    width: 9px;
    height: 36px;
    margin-top: -18px;
    border-radius: 5px;
    background:
      radial-gradient(circle, var(--ink-3) 0 1px, transparent 1.5px) 50% 50% / 3px 6px repeat-y,
      var(--raised);
    box-shadow:
      var(--shadow-1),
      inset 0 0 0 1px var(--line-strong);
    opacity: 0;
    transform: scale(0.6);
    transition:
      opacity var(--dur-2) var(--ease-out),
      transform var(--dur-2) var(--ease-settle);
  }
  .grip:hover .pill {
    transition-delay: 120ms;
  }
  .grip:hover .pill,
  .grip.held .pill {
    opacity: 1;
    transform: none;
  }
  .grip.held .pill {
    transform: scaleY(1.15);
  }
  .tag {
    position: absolute;
    right: 15px;
    top: clamp(24px, var(--y), calc(100% - 24px));
    margin-top: -11px;
    padding: 3px 9px;
    border-radius: var(--r-pill);
    font-size: 11px;
    font-weight: 500;
    color: var(--ink-inverse);
    background: var(--ink);
    box-shadow: var(--shadow-2);
    white-space: nowrap;
    pointer-events: none;
    opacity: 0;
    transform: translateX(4px) scale(0.9);
    transition:
      opacity var(--dur-1) var(--ease-out),
      transform var(--dur-2) var(--ease-settle);
  }
  .grip.snapped .tag {
    opacity: 1;
    transform: none;
  }
  :global(html.col-resizing),
  :global(html.col-resizing *) {
    cursor: col-resize !important;
    user-select: none !important;
  }
  .scroll {
    overflow-y: auto;
    padding: var(--s-4) var(--s-4) var(--s-7);
    scroll-behavior: smooth;
  }
  .quick-wrap {
    margin-bottom: var(--s-4);
  }
  /* Board or Gantt (Timeline views addon): the view fills the rest of the rail and scrolls itself. */
  .scroll.fill {
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    overflow: hidden;
    padding-bottom: var(--s-4);
  }
  .scroll.fill .quick-wrap {
    width: min(100%, 640px);
    margin-bottom: var(--s-3);
  }
  .tally button.count {
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
    border-radius: 6px;
    transition: color var(--dur-2) var(--ease-out);
  }
  .tally button.count:hover {
    color: var(--ink);
    text-decoration: underline;
    text-decoration-color: var(--line-strong);
    text-underline-offset: 4px;
  }
  .tally {
    display: grid;
    gap: 8px;
    margin-bottom: var(--s-4);
  }
  .tally-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--s-3);
    font-size: var(--t-sm);
    color: var(--ink-2);
  }
  .count .big {
    font-family: var(--font-ui);
    font-size: var(--t-xl);
    font-weight: 400;
    color: var(--ink);
    margin-right: 2px;
  }
  .spent {
    display: inline-flex;
    gap: 4px;
    color: var(--ink-3);
    font-size: var(--t-xs);
  }
  .bar {
    position: relative;
    height: 4px;
    border-radius: 2px;
    background: var(--line);
    overflow: hidden;
  }
  .bar i {
    position: absolute;
    inset: 0;
    border-radius: 2px;
    background: var(--lume);
    transform-origin: left;
    transition: transform 0.9s var(--ease-out);
  }
  .tally.all .bar i {
    box-shadow: 0 0 10px var(--lume);
  }
  h2 {
    margin: 0 0 var(--s-2);
    font-family: var(--font-ui);
    font-size: var(--t-sm);
    font-weight: 500;
    color: var(--ink-3);
  }
  .anytime {
    margin-bottom: var(--s-4);
    padding-bottom: var(--s-4);
    border-bottom: 1px solid var(--line);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-2);
  }
  .any {
    display: inline-flex;
    align-items: center;
    max-width: 100%;
    min-width: 0;
    gap: 2px;
    height: 32px;
    padding: 0 var(--s-3) 0 5px;
    border-radius: var(--r-pill);
    background: color-mix(in srgb, var(--c) 14%, var(--raised));
    border: 1px solid color-mix(in srgb, var(--c) 30%, transparent);
  }
  .any.done {
    opacity: 0.6;
  }
  /* All-day calendar events: the same clear glass as calendar blocks, a calendar mark. */
  .any.event {
    background: color-mix(in srgb, var(--c) 6%, var(--raised));
    border-color: var(--c);
  }
  .cal-mark {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    color: color-mix(in srgb, var(--c) 72%, var(--ink));
  }
  .any.done .any-title span {
    text-decoration: line-through;
    text-decoration-color: color-mix(in srgb, var(--ink) 40%, transparent);
  }
  .tick {
    position: relative;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 2px solid var(--c);
    display: grid;
    place-items: center;
    color: white;
    transition: background var(--dur-2) var(--ease-out);
  }
  .any.done .tick {
    background: var(--c);
  }
  .any-title {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    padding-left: 4px;
    font-size: var(--t-sm);
  }
  .any-title span {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .any-title :global(svg),
  .tick,
  .cal-mark {
    flex: none;
  }
  .tl-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 0 0 var(--s-2);
  }
  .tl-head h2 {
    margin: 0;
  }
  .hid {
    font-weight: 400;
  }
  .tl {
    position: relative;
    /* Where the track runs: the middle of the capsule column. */
    --track-x: 73px;
  }
  .timeline {
    position: relative;
    list-style: none;
    margin: 0;
    padding: 0;
  }
  /* The track: dotted ahead, a calm solid line for the time already behind you. */
  .track {
    position: absolute;
    left: var(--track-x);
    top: 14px;
    bottom: 14px;
    width: 2px;
    background: radial-gradient(circle, var(--line-strong) 0 1px, transparent 1.3px) 50% 0 / 2px 6px repeat-y;
    pointer-events: none;
  }
  .track i {
    position: absolute;
    inset: 0;
    border-radius: 1px;
    background: linear-gradient(color-mix(in srgb, var(--ink) 12%, transparent), color-mix(in srgb, var(--ink) 30%, transparent));
    transform-origin: top;
    transition: transform 0.9s var(--ease-out);
  }
  .gap {
    display: grid;
    grid-template-columns: 52px 44px 1fr auto;
    align-items: center;
    min-height: calc(var(--gh) + 10px);
    color: var(--ink-3);
    font-size: var(--t-xs);
  }
  .gap-time {
    text-align: right;
    padding-right: var(--s-2);
    opacity: 0.8;
  }
  /* Free time is an empty glass on the track: taller for a longer stretch. */
  .ghost {
    justify-self: center;
    width: 22px;
    height: var(--gh);
    border-radius: 11px;
    border: 1.5px dashed color-mix(in srgb, var(--ink) 22%, transparent);
    transition:
      background var(--dur-2) var(--ease-out),
      border-color var(--dur-2) var(--ease-out),
      transform var(--dur-2) var(--ease-settle);
  }
  .gap:hover .ghost {
    border-color: var(--ink-3);
    background: color-mix(in srgb, var(--sunken) 70%, transparent);
    transform: scaleX(1.12);
  }
  .gap.gone .ghost {
    border-color: color-mix(in srgb, var(--ink) 12%, transparent);
  }
  .gap.gone .gap-label,
  .gap.gone .gap-time {
    opacity: 0.6;
  }
  .gap-label {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding-left: var(--s-2);
  }
  .gap-label :global(svg) {
    color: #8670e6;
  }
  /* Back-to-back after a meeting: a small lavender strip on the track. */
  .land {
    display: grid;
    grid-template-columns: 52px 44px 1fr auto;
    align-items: center;
    min-height: 28px;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .land-mark {
    justify-self: center;
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    color: #8670e6;
    background: color-mix(in srgb, #8670e6 16%, var(--surface));
    box-shadow: 0 0 0 3px var(--surface);
    position: relative;
    z-index: 1;
  }
  .land-label {
    padding-left: var(--s-2);
  }
  .land-room {
    padding: 3px 9px;
    border-radius: var(--r-pill);
    font-size: var(--t-xs);
    font-weight: 500;
    color: #6a55c9;
    background: color-mix(in srgb, #8670e6 12%, transparent);
    transition: background var(--dur-1) var(--ease-out);
  }
  :global([data-theme='dark']) .land-room {
    color: #c8bbff;
  }
  .land-room:hover {
    background: color-mix(in srgb, #8670e6 22%, transparent);
  }
  .gap-add {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    color: var(--ink-3);
    opacity: 0;
    transition:
      opacity var(--dur-2) var(--ease-out),
      background var(--dur-1) var(--ease-out);
  }
  .gap:hover .gap-add,
  .gap-add:focus-visible {
    opacity: 1;
  }
  .gap-add:hover {
    background: var(--sunken);
    color: var(--ink);
  }
  .now-line {
    display: grid;
    grid-template-columns: 52px 1fr;
    align-items: center;
    height: 22px;
  }
  .now-time {
    justify-self: end;
    padding: 1px 6px;
    margin-right: 4px;
    border-radius: var(--r-pill);
    background: var(--signal);
    color: white;
    font-size: 10.5px;
    font-weight: 600;
    font-family: var(--font-ui);
  }
  .now-rule {
    position: relative;
    /* Starts on the track, so the now dot sits on it. */
    margin-left: calc(var(--track-x) - 52px);
    height: 2px;
    border-radius: 2px;
    background: linear-gradient(90deg, var(--signal), color-mix(in srgb, var(--signal) 0%, transparent));
  }
  .now-dot {
    position: absolute;
    left: -3px;
    top: -3px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--signal);
  }
  .now-dot::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: var(--signal);
    /* two pings as each minute turns over, then still */
    animation: ping 2.4s var(--ease-out) 2;
    will-change: transform, opacity;
  }
  @keyframes ping {
    0% {
      transform: scale(1);
      opacity: 0.5;
    }
    70%,
    100% {
      transform: scale(3);
      opacity: 0;
    }
  }
  :global([data-motion='calm']) .now-dot::after {
    animation: none;
  }
  .empty {
    padding: var(--s-6) var(--s-4) var(--s-4);
    text-align: center;
  }
  .sweep-demo {
    width: 64px;
    height: 64px;
    margin-bottom: var(--s-2);
  }
  .sweep-demo .ring {
    fill: none;
    stroke: var(--line-strong);
    stroke-width: 7;
  }
  .sweep-demo .arc {
    fill: none;
    stroke: var(--ink-2);
    stroke-width: 7;
    stroke-linecap: round;
    stroke-dasharray: 0 100;
    transform: rotate(-90deg);
    transform-origin: 32px 32px;
    animation: demo-arc 3.2s var(--ease-in-out) 3;
  }
  .sweep-demo .finger {
    fill: var(--ink);
    transform-origin: 32px 32px;
    animation: demo-finger 3.2s var(--ease-in-out) 3;
  }
  @keyframes demo-arc {
    0%,
    10% {
      stroke-dasharray: 0 100;
      opacity: 1;
    }
    60%,
    80% {
      stroke-dasharray: 30 100;
      opacity: 1;
    }
    100% {
      stroke-dasharray: 30 100;
      opacity: 0;
    }
  }
  @keyframes demo-finger {
    0%,
    10% {
      transform: rotate(0deg);
      opacity: 1;
    }
    60%,
    80% {
      transform: rotate(108deg);
      opacity: 1;
    }
    100% {
      transform: rotate(108deg);
      opacity: 0;
    }
  }
  .empty-title {
    margin: 0;
    font-family: var(--font-ui);
    font-size: var(--t-lg);
    font-weight: 500;
  }
  .empty-copy {
    margin: var(--s-2) auto 0;
    max-width: 30ch;
    color: var(--ink-2);
    font-size: var(--t-sm);
  }
  .add {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    width: 100%;
    height: 44px;
    margin-top: var(--s-3);
    padding: 0 var(--s-3) 0 var(--s-5);
    border-radius: var(--r-md);
    color: var(--ink-2);
    font-family: var(--font-ui);
    font-size: var(--t-sm);
    transition: background var(--dur-1) var(--ease-out);
  }
  .add:hover {
    background: var(--sunken);
    color: var(--ink);
  }
  .add-icon {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    border: 1.5px dashed var(--ink-3);
    margin-left: 10px;
  }
  kbd {
    margin-left: auto;
    font-family: var(--font-ui);
    font-size: 10.5px;
    padding: 1px 6px;
    border-radius: 5px;
    border: 1px solid var(--line-strong);
    color: var(--ink-3);
  }
  .later {
    margin-top: var(--s-5);
    border-top: 1px solid var(--line);
    padding-top: var(--s-3);
    border-radius: var(--r-md);
    transition:
      background var(--dur-2) var(--ease-out),
      box-shadow var(--dur-2) var(--ease-out);
  }
  /* A block dragged over it: the backlog opens its arms. */
  .later.drop {
    background: color-mix(in srgb, var(--lume) 10%, var(--surface));
    box-shadow:
      0 0 0 2px color-mix(in srgb, var(--lume) 55%, transparent),
      0 8px 24px -10px color-mix(in srgb, var(--lume) 60%, transparent);
  }
  .later-head {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    width: 100%;
    height: 34px;
    padding: 0 var(--s-2);
    border-radius: var(--r-sm);
    font-family: var(--font-ui);
    font-size: var(--t-sm);
    font-weight: 500;
    color: var(--ink-2);
  }
  .later-head:hover {
    background: var(--sunken);
  }
  .count {
    color: var(--ink-3);
    font-weight: 400;
  }
  .due {
    padding: 1px 7px;
    border-radius: 999px;
    font-size: var(--t-xs);
    font-weight: 500;
    background: color-mix(in srgb, var(--warm) 20%, transparent);
    color: var(--ink);
  }
  .open-link {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    margin-left: auto;
    font-weight: 400;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .capture-wrap {
    margin-top: var(--s-2);
  }

  /* A narrow rail gives the words more room: slimmer time and capsule columns. */
  @container rail (max-width: 359px) {
    .tl {
      --track-x: 62px;
    }
    .gap,
    .land {
      grid-template-columns: 44px 38px 1fr auto;
    }
    .now-line {
      grid-template-columns: 44px 1fr;
    }
    .now-rule {
      margin-left: calc(var(--track-x) - 44px);
    }
  }

  @media (max-width: 860px) {
    /* The page scrolls as one; the rail just flows under the dial. */
    .rail {
      display: block;
      border-left: 0;
      border-top: 1px solid var(--line);
    }
    .grip {
      display: none;
    }
    .scroll {
      overflow: visible;
    }
    .scroll.fill {
      display: block;
      overflow: visible;
    }
  }

  /* A touch screen has no hover to reveal it: it always shows. */
  @media (hover: none) {
    .gap .gap-add {
      opacity: 1;
      visibility: visible;
    }
  }

  /* A finger: the done circle answers over 44 px, not just the 22 px drawn. */
  @media (pointer: coarse) {
    .tick::after {
      content: '';
      position: absolute;
      inset: -11px;
      border-radius: 50%;
    }
  }
</style>
