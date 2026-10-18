<script lang="ts">
  import { flip } from 'svelte/animate';
  import { fly, slide } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { createNext, scheduleSoon, suggest, toggleDone } from '../lib/actions';
  import { blockKey } from '../lib/engine/blocks';
  import { formatDuration, formatTime, minutesOfDay, MINUTE, startOfDayMs } from '../lib/engine/time';
  import type { Block } from '../lib/engine/types';
  import Icon from '../lib/Icon.svelte';
  import { clock } from '../lib/stores/clock.svelte';
  import { tasks } from '../lib/stores/tasks.svelte';
  import { view } from '../lib/stores/view.svelte';
  import { categoryColor } from '../lib/engine/categories';
  import RailBlock from './RailBlock.svelte';
  import Rolling from '../lib/dial/Rolling.svelte';
  import QuickAdd from './QuickAdd.svelte';

  type Row =
    | { kind: 'block'; key: string; block: Block }
    | { kind: 'gap'; key: string; startMs: number; endMs: number }
    | { kind: 'now'; key: string };

  const dayStart = $derived(startOfDayMs(view.date));

  const rows = $derived.by(() => {
    const out: Row[] = [];
    const blocks = view.dayBlocks.filter((b) => !b.floating);
    const now = clock.minute;
    let cursor = blocks.length ? Math.min(blocks[0].startMs, view.isToday ? now : Infinity) : dayStart;
    let nowPlaced = !view.isToday;
    for (const b of blocks) {
      if (!nowPlaced && now < b.startMs) {
        if (b.startMs - cursor >= 15 * MINUTE && now > cursor) {
          out.push({ kind: 'gap', key: `gap:${cursor}`, startMs: cursor, endMs: now });
          cursor = now;
        }
        out.push({ kind: 'now', key: 'now' });
        nowPlaced = true;
      }
      if (b.startMs - cursor >= 15 * MINUTE) out.push({ kind: 'gap', key: `gap:${cursor}`, startMs: cursor, endMs: b.startMs });
      out.push({ kind: 'block', key: b.key, block: b });
      if (!nowPlaced && now >= b.startMs && now < b.endMs) nowPlaced = true; // the block itself shows progress
      cursor = Math.max(cursor, b.endMs);
    }
    if (!nowPlaced) out.push({ kind: 'now', key: 'now' });
    return out;
  });

  // The day's tally: what's done and how much time it was worth. Counts up, never down-shames.
  const doneMs = $derived(
    view.dayBlocks
      .filter((b) => b.kind === 'task' && b.done && !b.floating)
      .reduce((sum, b) => sum + Math.max(0, Math.min(b.endMs, b.doneAt ?? b.endMs) - b.startMs), 0),
  );
  const ratio = $derived(view.tally.total ? view.tally.done / view.tally.total : 0);

  let laterOpen = $state(true);
  let laterText = $state('');

  function addLater(e: SubmitEvent) {
    e.preventDefault();
    const title = laterText.trim();
    if (!title) return;
    const s = suggest(title);
    tasks.create({ title, date: null, start: null, duration: 30, ...(s ?? {}) });
    laterText = '';
  }

  function anytimeToggle(b: Block, e: MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    toggleDone(b.key, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
  }
</script>

<aside class="rail" aria-label="Day timeline">
  <div class="scroll">
    <div class="quick-wrap"><QuickAdd /></div>

    {#if view.tally.total}
      <header class="tally" class:all={ratio === 1}>
        <div class="tally-row">
          <span class="count"><span class="big tnum"><Rolling text={String(view.tally.done)} reduced={view.reducedMotion} /></span> of {view.tally.total} done</span>
          {#if doneMs > 0}
            <span class="spent tnum"><Rolling text={formatDuration(doneMs)} reduced={view.reducedMotion} /> well spent</span>
          {/if}
        </div>
        <span class="bar" aria-hidden="true"><i style:transform={`scaleX(${ratio})`}></i></span>
      </header>
    {/if}

    {#if view.floating.length}
      <section class="anytime" aria-label="Anytime">
        <h2>Anytime</h2>
        <div class="chips">
          {#each view.floating as b (b.key)}
            <div class="any" class:done={b.done} style:--c={b.color}>
              <button class="tick" onclick={(e) => anytimeToggle(b, e)} aria-label={b.done ? `Mark ${b.title} not done` : `Mark ${b.title} done`} aria-pressed={b.done}>
                {#if b.done}<Icon name="check" size={13} stroke={3} />{/if}
              </button>
              <button class="any-title" onclick={() => { view.selected = b.key; if (b.kind === 'task') view.sheet = { kind: 'edit', key: b.key }; }}>
                <Icon name={b.icon} size={14} />
                <span>{b.title}</span>
              </button>
            </div>
          {/each}
        </div>
      </section>
    {/if}

    <ol class="timeline">
      {#each rows as row (row.key)}
        <li animate:flip={{ duration: view.reducedMotion ? 0 : 320, easing: cubicOut }} in:fly={{ y: 8, duration: view.reducedMotion ? 0 : 280 }}>
          {#if row.kind === 'block'}
            <RailBlock block={row.block} />
          {:else if row.kind === 'gap'}
            {@const len = row.endMs - row.startMs}
            <div class="gap">
              <span class="gap-time tnum">{formatTime(row.startMs, view.hour12)}</span>
              <span class="gap-line" aria-hidden="true"></span>
              <span class="gap-label">{formatDuration(len)} free</span>
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
          {:else}
            <div class="now-line" aria-label={`Now, ${formatTime(clock.now, view.hour12)}`}>
              <span class="now-time tnum">{formatTime(clock.now, view.hour12)}</span>
              <span class="now-rule" aria-hidden="true">
                {#key clock.minute}<i class="now-dot"></i>{/key}
              </span>
            </div>
          {/if}
        </li>
      {/each}
    </ol>

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

    <section class="later" aria-label="Later">
      <button class="later-head" onclick={() => (laterOpen = !laterOpen)} aria-expanded={laterOpen}>
        <Icon name="inbox" size={16} />
        <span>Later</span>
        <span class="count tnum">{view.later.length || ''}</span>
        <span class="chev" class:open={laterOpen}><Icon name="chevron-down" size={16} /></span>
      </button>
      {#if laterOpen}
        <div transition:slide={{ duration: view.reducedMotion ? 0 : 220 }}>
          <ul class="later-list">
            {#each view.later as t (t.id)}
              <li
                class="later-item"
                style:--c={categoryColor(t.category, view.finish.dark)}
                animate:flip={{ duration: 260 }}
                out:fly={{ x: -16, duration: 200 }}
                draggable="true"
                ondragstart={(e) => {
                  e.dataTransfer?.setData('application/x-daybloom-task', t.id);
                  e.dataTransfer?.setData(`application/x-daybloom-min-${t.duration}`, '');
                  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
                }}
                title="Drag onto the dial to schedule"
              >
                <span class="later-icon"><Icon name={t.icon} size={14} /></span>
                <button class="later-title" onclick={() => (view.sheet = { kind: 'edit', key: `later:${t.id}` })}>{t.title}</button>
                <button class="btn btn-quiet schedule" onclick={() => scheduleSoon(t.id)} title="Put it in the next free gap today">
                  Fit in today
                </button>
              </li>
            {/each}
          </ul>
          <form class="later-add" onsubmit={addLater}>
            <input class="field" placeholder="Something for later…" bind:value={laterText} aria-label="Add something for later" />
          </form>
        </div>
      {/if}
    </section>
  </div>
</aside>

<style>
  .rail {
    min-height: 0;
    border-left: 1px solid var(--line);
    background: var(--surface);
    display: grid;
  }
  .scroll {
    overflow-y: auto;
    padding: var(--s-4) var(--s-4) var(--s-7);
    scroll-behavior: smooth;
  }
  .quick-wrap {
    margin-bottom: var(--s-4);
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
  .any.done .any-title span {
    text-decoration: line-through;
    text-decoration-color: color-mix(in srgb, var(--ink) 40%, transparent);
  }
  .tick {
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
    padding-left: 4px;
    font-size: var(--t-sm);
  }
  .timeline {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .gap {
    display: grid;
    grid-template-columns: 52px 44px 1fr auto;
    align-items: center;
    min-height: 34px;
    color: var(--ink-3);
    font-size: var(--t-xs);
  }
  .gap-time {
    text-align: right;
    padding-right: var(--s-2);
    opacity: 0.8;
  }
  .gap-line {
    justify-self: center;
    width: 0;
    height: 100%;
    min-height: 34px;
    border-left: 2px dotted var(--line-strong);
  }
  .gap-label {
    padding-left: var(--s-2);
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
  .chev {
    margin-left: auto;
    transition: transform var(--dur-2) var(--ease-out);
    transform: rotate(-90deg);
  }
  .chev.open {
    transform: rotate(0);
  }
  .later-list {
    list-style: none;
    margin: var(--s-1) 0 var(--s-2);
    padding: 0;
  }
  .later-item {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    min-height: 38px;
    padding: 0 var(--s-1) 0 var(--s-2);
    border-radius: var(--r-sm);
  }
  .later-item:hover {
    background: var(--sunken);
  }
  .later-item[draggable='true'] {
    cursor: grab;
  }
  .later-icon {
    width: 24px;
    height: 24px;
    border-radius: 7px;
    display: grid;
    place-items: center;
    background: color-mix(in srgb, var(--c) 18%, transparent);
    color: color-mix(in srgb, var(--c) 75%, var(--ink));
  }
  .later-title {
    flex: 1;
    text-align: left;
    font-size: var(--t-sm);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .schedule {
    height: 28px;
    padding: 0 var(--s-3);
    font-size: var(--t-xs);
    opacity: 0;
  }
  .later-item:hover .schedule,
  .schedule:focus-visible {
    opacity: 1;
  }
  .later-add {
    padding: 0 var(--s-1);
  }
  .later-add .field {
    height: 34px;
    font-size: var(--t-sm);
    background: transparent;
    border-style: dashed;
  }
  .later-add .field:focus {
    background: var(--raised);
    border-style: solid;
  }

  @media (max-width: 860px) {
    /* The page scrolls as one; the rail just flows under the dial. */
    .rail {
      display: block;
      border-left: 0;
      border-top: 1px solid var(--line);
    }
    .scroll {
      overflow: visible;
    }
  }
</style>
