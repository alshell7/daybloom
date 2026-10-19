<script lang="ts">
  import { adjust, duplicateBlock, moveToNextGap, moveToTomorrow, removeBlock, toggleDone } from '../lib/actions';
  import { mix, onColor } from '../lib/engine/categories';
  import { formatDuration, formatTime, MINUTE } from '../lib/engine/time';
  import type { Block } from '../lib/engine/types';
  import Icon from '../lib/Icon.svelte';
  import { detent } from '../lib/sound';
  import { clock } from '../lib/stores/clock.svelte';
  import { tasks } from '../lib/stores/tasks.svelte';
  import { view } from '../lib/stores/view.svelte';
  import { accountLabel } from '../lib/calendarBridge.svelte';

  let { block }: { block: Block } = $props();

  // ---- drag to move / resize (Structured-style) ----------------------------
  const PX_PER_MIN = 1.4;
  const STEP = 5;
  let drag = $state<null | { mode: 'move' | 'resize'; y0: number; dy: number; moved: boolean; startMs: number; endMs: number }>(null);
  let lastSlot = 0;

  const editable = $derived(block.kind === 'task' && !block.readOnly);
  const shown = $derived(drag?.moved ? { startMs: drag.startMs, endMs: drag.endMs } : { startMs: block.startMs, endMs: block.endMs });

  function down(e: PointerEvent, mode: 'move' | 'resize') {
    if (e.button !== 0) return;
    if (!editable) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag = { mode, y0: e.clientY, dy: 0, moved: false, startMs: block.startMs, endMs: block.endMs };
    lastSlot = 0;
  }

  function move(e: PointerEvent) {
    if (!drag) return;
    drag.dy = e.clientY - drag.y0;
    if (!drag.moved && Math.abs(drag.dy) > 5) drag.moved = true;
    if (!drag.moved) return;
    const steps = Math.round(drag.dy / PX_PER_MIN / STEP);
    if (steps !== lastSlot) {
      lastSlot = steps;
      detent();
    }
    const delta = steps * STEP * MINUTE;
    if (drag.mode === 'move') {
      drag.startMs = block.startMs + delta;
      drag.endMs = block.endMs + delta;
    } else {
      drag.startMs = block.startMs;
      drag.endMs = Math.max(block.startMs + STEP * MINUTE, block.endMs + delta);
    }
    view.railPreview = { key: block.key, startMs: drag.startMs, endMs: drag.endMs };
  }

  function up() {
    if (!drag) return;
    const d = drag;
    drag = null;
    view.railPreview = null;
    if (d.moved) {
      if (d.startMs !== block.startMs || d.endMs !== block.endMs) adjust(block.key, d.startMs, d.endMs);
    } else if (d.mode === 'move') open();
  }

  // ---- state ---------------------------------------------------------------
  const len = $derived(shown.endMs - shown.startMs);
  // Capsule height carries duration, Structured-style, within readable bounds.
  const height = $derived(Math.round(Math.max(48, Math.min(170, (len / MINUTE) * 1.15))));
  const live = $derived(view.isToday && clock.now >= block.startMs && clock.now < block.endMs && !block.done);
  const past = $derived(clock.now >= block.endMs);
  const missed = $derived(past && !block.done && block.kind === 'task');
  // Minute resolution: the liquid level moves once a minute; only the wave surface animates.
  const progress = $derived(live ? Math.min(1, Math.max(0.04, (clock.minute - block.startMs) / (block.endMs - block.startMs))) : 0);
  const task = $derived(block.taskId ? tasks.get(block.taskId) : undefined);
  const subs = $derived(task?.subtasks ?? []);
  const subsDone = $derived(subs.filter((s) => s.done).length);
  const selected = $derived(view.selected === block.key);
  const fg = $derived(onColor(block.color));
  const acked = $derived(!!task?.acks?.includes(block.date));
  const overlaps = $derived(
    view.dayBlocks.filter((o) => o.key !== block.key && !o.floating && o.startMs < block.endMs && o.endMs > block.startMs),
  );
  // Revealed on hover: the next step, else the first line of the notes.
  const peek = $derived.by(() => {
    const next = subs.find((s) => !s.done)?.title;
    if (next && !block.done) return `Next: ${next}`;
    return (task?.notes ?? '').split('\n').find((l) => l.trim())?.trim() ?? '';
  });

  // The pour plays only at the moment a block is finished, from wherever the liquid was.
  let pouring = $state(false);
  let pourFrom = $state('100%');
  let level = 1;
  let prevDone: boolean | null = null;
  $effect(() => {
    if (live) level = 1 - progress;
  });
  $effect(() => {
    const d = block.done;
    if (prevDone === false && d && !view.reducedMotion) {
      pourFrom = `${Math.round(level * 100)}%`;
      pouring = true;
      setTimeout(() => (pouring = false), 1400);
    }
    prevDone = d;
  });

  function open() {
    view.selected = block.key;
    if (block.kind === 'task') view.sheet = { kind: 'edit', key: block.key };
  }

  function check(e: MouseEvent) {
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    toggleDone(block.key, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
  }
</script>

<div
  class="row"
  class:selected
  class:done={block.done}
  class:missed
  class:live
  class:dragging={drag?.moved}
  class:pouring
  style:--from={pourFrom}
  class:event={block.kind === 'event'}
  style:--c={block.color}
  style:--c-soft={mix(block.color, view.finish.dark ? '#131a27' : '#ffffff', 0.8)}
  style:--fg={fg}
  style:--h={`${height}px`}
  style:--p={progress}
  style:transform={drag?.moved && drag.mode === 'move' ? `translateY(${drag.dy}px)` : undefined}
>
  <div class="time tnum">{formatTime(shown.startMs, view.hour12)}</div>

  <div
    class="capsule"
    class:grab={editable}
    role="button"
    tabindex="-1"
    aria-label={editable ? `${block.title}: drag to move, click to open` : `Open ${block.title}`}
    onpointerdown={(e) => down(e, 'move')}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={up}
    onclick={() => !editable && open()}
    onkeydown={(e) => e.key === 'Enter' && open()}
  >
    <!-- liquid: rises with elapsed time; a two-layer wave rolls on its surface -->
    <span class="liquid" aria-hidden="true">
      <!-- re-mounted each minute: the surface sloshes once as the level rises, then rests
           (and keeps rolling while hovered) — lively without a forever-running animation -->
      {#key clock.minute}
        <span class="wave a"></span>
        <span class="wave b"></span>
      {/key}
    </span>
    <span class="cap-icon"><Icon name={block.done ? 'check' : block.icon} size={18} stroke={2.1} /></span>
    {#if editable}
      <span
        class="resize"
        role="slider"
        tabindex="-1"
        aria-label="Drag to change length"
        aria-valuenow={Math.round(len / MINUTE)}
        onpointerdown={(e) => down(e, 'resize')}
        onpointermove={move}
        onpointerup={up}
        onpointercancel={up}
      ></span>
    {/if}
  </div>

  <button class="body" onclick={open}>
    <span class="title"><span class="t">{block.title || 'Untitled block'}</span></span>
    <span class="meta tnum">
      {formatTime(shown.startMs, view.hour12)}–{formatTime(shown.endMs, view.hour12)}
      <span class="dot">·</span>
      {live && !drag ? `${formatDuration(block.endMs - clock.now)} left` : formatDuration(len)}
      {#if block.recurring}<span class="glyph" title="Repeats"><Icon name="repeat" size={12} /></span>{/if}
      {#if block.kind === 'event'}<span class="glyph" title="From your calendar"><Icon name="calendar" size={12} /></span>{/if}
    </span>
    {#if missed && !acked}
      <span class="waiting">check in?</span>
    {/if}
    {#if block.event}
      <span class="src">{accountLabel(block.event.accountId)}{block.event.alsoIn?.length ? ` + ${block.event.alsoIn.length} more` : ''}</span>
    {/if}
    {#if overlaps.length}
      <span class="clash"><Icon name="shuffle" size={11} /> same time as {overlaps[0].title}{overlaps.length > 1 ? ` +${overlaps.length - 1}` : ''}</span>
    {/if}
    {#if peek}
      <span class="peek">{peek}</span>
    {/if}
    {#if subs.length}
      <span class="subs tnum">
        <span class="subbar" style:--s={subsDone / subs.length}></span>
        {subsDone}/{subs.length} steps
      </span>
    {/if}
  </button>

  {#if drag?.moved}
    <span class="drag-pill tnum">{formatTime(shown.startMs, view.hour12)} → {formatTime(shown.endMs, view.hour12)} · {formatDuration(len)}</span>
  {/if}

  <div class="side">
    {#if editable && !drag}
      <div class="tools">
        {#if missed}
          <button class="icon-btn" onclick={() => moveToNextGap(block.key)} title="Slide into the next free gap" aria-label="Move to the next free gap"><Icon name="move-later" size={15} /></button>
        {:else}
          <button class="icon-btn" onclick={() => moveToTomorrow(block.key)} title="Move to tomorrow" aria-label="Move to tomorrow"><Icon name="arrow-right" size={15} /></button>
        {/if}
        <button class="icon-btn" onclick={() => duplicateBlock(block.key)} title="Duplicate" aria-label="Duplicate"><Icon name="plus" size={15} /></button>
        <button class="icon-btn" onclick={() => removeBlock(block.key)} title="Remove" aria-label="Remove"><Icon name="trash-ui" size={15} /></button>
      </div>
    {/if}
    {#if block.kind === 'task'}
      <button class="check" onclick={check} aria-pressed={block.done} aria-label={block.done ? `Mark ${block.title} not done` : `Mark ${block.title} done`}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6.5 12.5l3.6 3.6 7.4-7.6" />
        </svg>
      </button>
    {/if}
  </div>
</div>

<style>
  .row {
    position: relative;
    display: grid;
    grid-template-columns: 52px 44px minmax(0, 1fr) auto;
    align-items: start;
    min-height: var(--h);
    padding: 3px 0;
    border-radius: var(--r-md);
    transition:
      background var(--dur-2) var(--ease-out),
      box-shadow var(--dur-2) var(--ease-out),
      transform var(--dur-3) var(--ease-out);
  }
  .row:hover {
    background: color-mix(in srgb, var(--sunken) 55%, transparent);
  }
  .row.selected {
    background: var(--raised);
    box-shadow: var(--shadow-1);
  }
  .row.dragging {
    z-index: 5;
    background: var(--raised);
    box-shadow: var(--shadow-3);
    transition: background var(--dur-2), box-shadow var(--dur-2);
  }
  .time {
    padding: 10px var(--s-2) 0 0;
    text-align: right;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }

  /* --- the capsule ------------------------------------------------------- */
  .capsule {
    position: relative;
    justify-self: center;
    width: 40px;
    height: var(--h);
    border-radius: 20px;
    background: var(--c);
    color: var(--fg);
    overflow: hidden;
    display: grid;
    align-content: start;
    justify-items: center;
    padding-top: 11px;
    touch-action: none;
    transition:
      transform var(--dur-2) var(--ease-settle),
      background var(--dur-3) var(--ease-out),
      box-shadow var(--dur-3) var(--ease-out);
  }
  .capsule.grab {
    cursor: grab;
  }
  .dragging .capsule {
    cursor: grabbing;
    transform: scale(1.08) rotate(-2deg);
  }
  .row:hover .capsule {
    transform: scale(1.05);
  }
  .cap-icon {
    position: relative;
    z-index: 1;
    transition: transform var(--dur-3) var(--ease-settle);
  }
  .pouring .cap-icon {
    animation: pop 0.5s var(--ease-out) 0.35s both;
  }

  /* Live block: the capsule is a glass of liquid that fills as the time is spent. */
  .live .capsule {
    background: var(--c-soft);
    color: color-mix(in srgb, var(--c) 75%, var(--ink));
    box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--c) 45%, transparent);
  }
  .liquid {
    position: absolute;
    inset: 0;
    transform-origin: bottom;
    transform: translateY(100%);
    background: var(--c);
    transition: transform 0.9s var(--ease-out);
  }
  .live .liquid {
    transform: translateY(calc((1 - var(--p)) * 100%));
  }
  .live .cap-icon {
    color: color-mix(in srgb, var(--c) 70%, var(--ink));
  }
  /* Two scalloped strips in the block colour roll in opposite directions (gradients,
     no masks, so the compositor just slides a texture). */
  .wave {
    position: absolute;
    left: 0;
    top: -6px;
    width: calc(100% + 40px);
    height: 7px;
    background: radial-gradient(circle at 10px 0, transparent 8px, var(--c) 8.5px) repeat-x 0 0 / 20px 7px;
    opacity: 0;
    will-change: transform;
  }
  .wave.a {
    animation: roll 1.6s var(--ease-out) 2;
  }
  .wave.b {
    top: -5px;
    background-position: 10px 0;
    animation: roll 2.7s var(--ease-out) 1 reverse;
  }
  .row:hover .wave.a {
    animation: roll 1.6s linear infinite;
  }
  .row:hover .wave.b {
    animation: roll 2.7s linear infinite reverse;
  }
  .live .wave.a {
    opacity: 1;
  }
  .live .wave.b {
    opacity: 0.45;
  }
  @keyframes roll {
    to {
      transform: translateX(-20px);
    }
  }

  /* Done: the glass fills to the brim, then settles into its quiet finished look. */
  .done .liquid {
    opacity: 0;
  }
  .pouring .liquid {
    animation: pour 1.3s var(--ease-out) forwards;
  }
  @keyframes pour {
    0% {
      transform: translateY(var(--from, 60%));
      opacity: 1;
    }
    45% {
      transform: translateY(0);
      opacity: 1;
    }
    100% {
      transform: translateY(0);
      opacity: 0;
    }
  }
  .done .capsule {
    background: var(--c-soft);
    color: var(--c);
    box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--lume) 70%, transparent);
  }
  @keyframes pop {
    0% {
      transform: scale(0.4);
    }
    60% {
      transform: scale(1.25);
    }
    100% {
      transform: scale(1);
    }
  }
  .event .capsule {
    background: repeating-linear-gradient(135deg, var(--c) 0 7px, color-mix(in srgb, var(--c) 82%, white) 7px 11px);
  }
  .missed .capsule {
    background: var(--c-soft);
    color: color-mix(in srgb, var(--c) 80%, var(--ink));
    outline: 2px dashed color-mix(in srgb, var(--c) 50%, transparent);
    outline-offset: -2px;
  }
  .resize {
    position: absolute;
    left: 8px;
    right: 8px;
    bottom: 3px;
    height: 10px;
    border-radius: 5px;
    cursor: ns-resize;
    z-index: 2;
  }
  .resize::after {
    content: '';
    position: absolute;
    left: 6px;
    right: 6px;
    top: 4px;
    height: 2px;
    border-radius: 1px;
    background: currentColor;
    opacity: 0;
    transition: opacity var(--dur-2) var(--ease-out);
  }
  .row:hover .resize::after,
  .dragging .resize::after {
    opacity: 0.55;
  }

  /* --- text ---------------------------------------------------------------- */
  .body {
    display: grid;
    align-content: start;
    gap: 2px;
    padding: 8px var(--s-3) 6px;
    text-align: left;
    min-width: 0;
  }
  .title {
    font-family: var(--font-read);
    font-weight: 500;
    font-size: var(--t-md);
    line-height: 1.3;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  /* The strike draws itself left to right when a block is finished. */
  .t {
    background: linear-gradient(currentColor, currentColor) no-repeat 0 58% / 0% 1.5px;
    -webkit-box-decoration-break: clone;
    box-decoration-break: clone;
    transition:
      background-size 0.5s var(--ease-out) 0.15s,
      color var(--dur-3) var(--ease-out);
  }
  .done .t {
    color: var(--ink-3);
    background-size: 100% 1.5px;
  }
  .meta {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .live .meta,
  .dragging .meta {
    color: var(--ink-2);
  }
  .dot {
    opacity: 0.6;
  }
  .glyph {
    display: inline-grid;
    margin-left: 2px;
  }
  .src,
  .clash {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .clash {
    color: var(--ink-2);
  }
  .waiting {
    justify-self: start;
    margin-top: 2px;
    padding: 1px 8px;
    border-radius: 999px;
    font-size: var(--t-xs);
    background: color-mix(in srgb, var(--warm) 20%, transparent);
    color: var(--ink);
  }
  /* the peek line appears on hover/selection */
  .peek {
    display: none;
    font-size: var(--t-xs);
    color: var(--ink-2);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .row:hover .peek,
  .row.selected .peek {
    display: block;
    animation: peek-in var(--dur-2) var(--ease-out);
  }
  @keyframes peek-in {
    from {
      opacity: 0;
      transform: translateY(-3px);
    }
  }
  .subs {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .subbar {
    position: relative;
    width: 34px;
    height: 4px;
    border-radius: 2px;
    background: var(--line-strong);
    overflow: hidden;
  }
  .subbar::after {
    content: '';
    position: absolute;
    inset: 0;
    background: var(--c);
    transform-origin: left;
    transform: scaleX(var(--s));
    transition: transform 0.5s var(--ease-out);
  }
  .drag-pill {
    position: absolute;
    left: 100px;
    top: -14px;
    padding: 3px 10px;
    border-radius: var(--r-pill);
    background: var(--ink);
    color: var(--ink-inverse);
    font-size: var(--t-xs);
    font-weight: 500;
    white-space: nowrap;
    box-shadow: var(--shadow-2);
    pointer-events: none;
    animation: rise 0.2s var(--ease-out);
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
  }

  /* --- actions --------------------------------------------------------------- */
  .side {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 6px var(--s-2) 0 0;
  }
  .tools {
    display: flex;
    gap: 0;
  }
  .tools .icon-btn {
    width: 28px;
    height: 28px;
    opacity: 0;
    transform: translateX(6px);
    transition:
      opacity var(--dur-2) var(--ease-out),
      transform var(--dur-2) var(--ease-out),
      background var(--dur-1) var(--ease-out);
  }
  .tools .icon-btn:nth-child(2) {
    transition-delay: 30ms;
  }
  .tools .icon-btn:nth-child(3) {
    transition-delay: 60ms;
  }
  .row:hover .tools .icon-btn,
  .tools .icon-btn:focus-visible {
    opacity: 1;
    transform: none;
  }
  .missed .tools .icon-btn:first-child {
    opacity: 1;
    transform: none;
  }
  .check {
    position: relative;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 2px solid color-mix(in srgb, var(--c) 70%, var(--line-strong));
    display: grid;
    place-items: center;
    transition:
      border-color var(--dur-2) var(--ease-out),
      transform var(--dur-2) var(--ease-settle);
  }
  .check::before {
    content: '';
    position: absolute;
    inset: -2px;
    border-radius: 50%;
    background: var(--c);
    transform: scale(0);
    transition: transform 0.35s var(--ease-out);
  }
  .check:hover {
    transform: scale(1.1);
  }
  .check:hover::before {
    transform: scale(0.35);
    opacity: 0.25;
  }
  .check:active {
    transform: scale(0.88);
  }
  .check svg {
    position: relative;
    width: 18px;
    height: 18px;
    fill: none;
    stroke: var(--fg);
    stroke-width: 2.6;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 20;
    stroke-dashoffset: 20;
    transition: stroke-dashoffset var(--dur-3) var(--ease-out) 120ms;
  }
  .done .check {
    border-color: var(--c);
  }
  .pouring .check {
    animation: pop 0.45s var(--ease-out);
  }
  .done .check::before {
    transform: scale(1);
    opacity: 1;
  }
  .done .check svg {
    stroke-dashoffset: 0;
  }
  @media (prefers-reduced-motion: reduce) {
    .wave {
      animation: none !important;
    }
  }
  :global([data-motion='calm']) .wave {
    animation: none;
  }
</style>
