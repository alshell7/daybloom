<script lang="ts">
  import { adjust, duplicateBlock, moveToNextGap, moveToTomorrow, removeBlock, toBacklog, toggleDone } from '../lib/actions';
  import { categoryColor, inkOn, mix, onColor } from '../lib/engine/categories';
  import { formatDuration, formatTime, MINUTE } from '../lib/engine/time';
  import type { Block } from '../lib/engine/types';
  import Icon from '../lib/Icon.svelte';
  import { detent } from '../lib/sound';
  import { clock } from '../lib/stores/clock.svelte';
  import { tasks } from '../lib/stores/tasks.svelte';
  import { view } from '../lib/stores/view.svelte';
  import { accountLabel } from '../lib/calendarBridge.svelte';
  import { isOn } from '../lib/addons/registry';
  import { crumbs } from '../lib/addons/crumbs/crumbs.svelte';
  import { meetingOf } from '../lib/calendar/meeting';
  import { platform } from '../lib/platform';

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

  /** Over the Backlog section (or the top bar's backlog button) while moving: drop to park it. */
  let overBacklog = $state(false);
  const backlogAt = (x: number, y: number) => document.elementsFromPoint(x, y).some((el) => (el as HTMLElement).closest?.('[data-drop="backlog"]'));

  function move(e: PointerEvent) {
    if (!drag) return;
    drag.dy = e.clientY - drag.y0;
    if (!drag.moved && Math.abs(drag.dy) > 5) drag.moved = true;
    if (!drag.moved) return;
    const over = drag.mode === 'move' && block.kind === 'task' && backlogAt(e.clientX, e.clientY);
    if (over !== overBacklog) {
      overBacklog = over;
      view.backlogDrop = over;
      if (over) detent();
    }
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
    if (overBacklog) {
      overBacklog = false;
      view.backlogDrop = false;
      toBacklog(block.key);
      return;
    }
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
  // Colours for the timeline's own light or dark theme (the dial follows its finish), with an
  // ink for each background the icon sits on: the soft glass, the washed fill, the full fill.
  const dark = $derived(view.dark);
  const color = $derived(block.kind === 'task' ? categoryColor(block.category, dark) : block.event?.category ? categoryColor(block.event.category, dark) : block.color);
  const soft = $derived(mix(color, dark ? '#131a27' : '#ffffff', 0.8));
  const fg = $derived(onColor(color));
  const inkSoft = $derived(inkOn(soft, color));
  const inkWashed = $derived(inkOn(mix(color, soft, 0.66), color));
  const inkEvent = $derived(inkOn(mix(color, soft, 0.72), color));
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
    // Tasks open their editor; calendar events their details (salah too, for Waqt).
    view.sheet = { kind: 'edit', key: block.key };
  }

  // A video meeting: a Join button, lit from 10 minutes before until it ends.
  const meet = $derived(block.event ? meetingOf(block.event) : null);
  const joinSoon = $derived(!!meet && clock.now < block.endMs && block.startMs - clock.now <= 10 * MINUTE);
  function join(e: MouseEvent) {
    e.stopPropagation();
    if (meet) void platform.openExternal(meet.url);
  }

  function check(e: MouseEvent) {
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    toggleDone(block.key, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
  }
  // Breadcrumbs addon: the last note left on this task.
  const crumb = $derived(isOn('crumbs') && block.taskId ? crumbs.latest(block.taskId) : null);
</script>

<div
  class="row"
  class:selected
  class:done={block.done}
  class:missed
  class:past
  class:full={past || block.done}
  class:live
  class:dragging={drag?.moved}
  class:pouring
  style:--from={pourFrom}
  class:event={block.kind === 'event'}
  class:prayer={block.event?.provider === 'salah'}
  style:--c={color}
  style:--c-soft={soft}
  style:--fg={fg}
  style:--ink-soft={inkSoft}
  style:--ink-washed={inkWashed}
  style:--ink-event={inkEvent}
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
      {#if crumb}<span class="glyph crumb" title={`Where you left off: ${crumb.text}`}><Icon name="pin" size={12} /></span>{/if}
    </span>
    {#if missed && !acked}
      <span class="waiting">check in?</span>
    {/if}
    {#if block.event}
      <span class="src" title={block.event.provider === 'salah' ? 'Salah · from Waqt' : `From your calendar${block.event.calendarName ? `: ${block.event.calendarName}` : ''} · read-only`}>
        <Icon name={block.event.provider === 'salah' ? 'moon' : 'calendar'} size={11} stroke={2.2} />
        <span>{block.event.calendarName ?? accountLabel(block.event.accountId)}</span>
        {#if block.event.alsoIn?.length}<span class="also">+{block.event.alsoIn.length}</span>{/if}
      </span>
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
    <span class="drag-pill tnum">{#if overBacklog}<Icon name="inbox" size={12} /> To the backlog{:else}{formatTime(shown.startMs, view.hour12)} → {formatTime(shown.endMs, view.hour12)} · {formatDuration(len)}{/if}</span>
  {/if}

  <div class="side">
    {#if editable && !drag}
      <!-- Shown on hover, over the end of the text: they never take room from the words. -->
      <div class="tools">
        {#if !missed}
          <button class="icon-btn" onclick={() => moveToTomorrow(block.key)} title="Move to tomorrow" aria-label="Move to tomorrow"><Icon name="arrow-right" size={15} /></button>
        {/if}
        <button class="icon-btn" onclick={() => toBacklog(block.key)} title="Move to the backlog (or drag it there)" aria-label="Move to the backlog"><Icon name="inbox" size={15} /></button>
        <button class="icon-btn" onclick={() => duplicateBlock(block.key)} title="Duplicate" aria-label="Duplicate"><Icon name="plus" size={15} /></button>
        <button class="icon-btn" onclick={() => removeBlock(block.key)} title="Remove" aria-label="Remove"><Icon name="trash-ui" size={15} /></button>
      </div>
      {#if missed}
        <button class="icon-btn slide" onclick={() => moveToNextGap(block.key)} title="Slide into the next free gap" aria-label="Move to the next free gap"><Icon name="move-later" size={15} /></button>
      {/if}
    {/if}
    {#if meet}
      <button class="join" class:hot={joinSoon} onclick={join} title={`Join ${meet.label}`} aria-label={`Join ${meet.label}`}>
        <Icon name="video" size={14} stroke={2.2} />{#if joinSoon}<span>Join</span>{/if}
      </button>
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
    /* The row's own colour, for things laid over it (the hover tools' fade). */
    --row-bg: var(--surface);
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
    --row-bg: color-mix(in srgb, var(--sunken) 55%, var(--surface));
    background: var(--row-bg);
  }
  .row.selected {
    --row-bg: var(--raised);
    background: var(--row-bg);
    box-shadow: var(--shadow-1);
  }
  .row.dragging {
    --row-bg: var(--raised);
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
    /* Ahead of you: an empty glass in the block's colour. It fills while the block runs and
       stays full once its time has passed, like stops on a train line. */
    background: var(--c-soft);
    color: var(--ink-soft);
    box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--c) 55%, transparent);
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
    color: var(--ink-soft);
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
  /* Time passed (or finished early): the glass is full. */
  .full .liquid {
    transform: none;
  }
  .full .cap-icon {
    color: var(--fg);
  }
  .live .cap-icon {
    color: var(--ink-soft);
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

  /* Done: the glass pours to the brim and stays full, with the lume ring (finished time). */
  .pouring .liquid {
    animation: pour 0.9s var(--ease-out) forwards;
  }
  @keyframes pour {
    from {
      transform: translateY(var(--from, 60%));
    }
    to {
      transform: translateY(0);
    }
  }
  .done .capsule {
    box-shadow:
      inset 0 0 0 2px color-mix(in srgb, var(--lume) 75%, transparent),
      0 0 0 3px color-mix(in srgb, var(--lume) 16%, transparent);
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
  /* From a calendar: a striped glass with an outline, never a solid fill like your own blocks,
     so the two read apart at a glance (stripes mean "from a calendar, read-only"). */
  .event .capsule {
    background:
      repeating-linear-gradient(135deg, color-mix(in srgb, var(--c) 42%, transparent) 0 3px, transparent 3px 8px),
      var(--c-soft);
    color: var(--ink-event);
    box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--c) 72%, transparent);
  }
  .event .liquid {
    background: color-mix(in srgb, var(--c) 38%, transparent);
  }
  .event.full .cap-icon {
    color: var(--ink-event);
  }
  .event .title .t {
    font-weight: 400;
  }
  /* Salah (Waqt addon): a calm glass with a faint eight-point star pattern, not calendar stripes. */
  .prayer .capsule {
    background: var(--c-soft);
    box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--c) 60%, transparent);
  }
  .prayer .capsule::before {
    content: '';
    position: absolute;
    inset: 0;
    background: var(--c);
    opacity: 0.3;
    -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14'%3E%3Cpath d='M4 4h6v6H4zM7 2.8 11.2 7 7 11.2 2.8 7z'/%3E%3C/svg%3E") 0 0 / 14px 14px repeat;
    mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14'%3E%3Cpath d='M4 4h6v6H4zM7 2.8 11.2 7 7 11.2 2.8 7z'/%3E%3C/svg%3E") 0 0 / 14px 14px repeat;
    pointer-events: none;
  }
  .prayer .title .t {
    font-weight: 500;
  }
  /* Its time passed without a tick: full, but in a washed colour, with the dashed edge the
     dial uses for the same thing. */
  .missed .capsule {
    box-shadow: none;
    outline: 2px dashed color-mix(in srgb, var(--c) 50%, transparent);
    outline-offset: -2px;
  }
  .missed .liquid {
    background: color-mix(in srgb, var(--c) 34%, var(--c-soft));
  }
  .missed .cap-icon {
    color: var(--ink-washed);
  }
  /* Behind you: the words step back a little. */
  .past:not(.selected):not(:hover) .title {
    color: var(--ink-2);
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
  .glyph.crumb {
    color: #b07e06;
  }
  :global([data-theme='dark']) .glyph.crumb {
    color: #e2b44a;
  }
  .src,
  .clash {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .src {
    justify-self: start;
    max-width: 100%;
    height: 20px;
    padding: 0 7px 0 6px;
    border-radius: var(--r-pill);
    background: color-mix(in srgb, var(--c) 12%, transparent);
    color: var(--ink-soft);
  }
  .src span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .src .also {
    flex: none;
    color: var(--ink-3);
  }
  .clash {
    color: var(--ink-2);
  }
  .waiting {
    justify-self: start;
    white-space: nowrap;
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
    position: relative;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 6px var(--s-2) 0 0;
  }
  .tools {
    position: absolute;
    right: 100%;
    top: 6px;
    z-index: 1;
    display: flex;
    gap: 0;
    padding-left: 22px;
    pointer-events: none;
  }
  /* A soft fade so the tools sit cleanly over the end of a long title. */
  .tools::before {
    content: '';
    position: absolute;
    inset: -4px 0 -4px 0;
    z-index: -1;
    background: linear-gradient(90deg, transparent, var(--row-bg) 22px);
    opacity: 0;
    transition: opacity var(--dur-2) var(--ease-out);
  }
  .row:hover .tools,
  .tools:focus-within {
    pointer-events: auto;
  }
  .row:hover .tools::before,
  .tools:focus-within::before {
    opacity: 1;
  }
  .slide {
    width: 28px;
    height: 28px;
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
  .tools .icon-btn:nth-child(4) {
    transition-delay: 90ms;
  }
  .row:hover .tools .icon-btn,
  .tools .icon-btn:focus-visible {
    opacity: 1;
    transform: none;
  }
  .tools:focus-within .icon-btn {
    opacity: 1;
    transform: none;
  }

  /* A narrow rail gives the words more room: slimmer time and capsule columns. */
  @container rail (max-width: 359px) {
    .row {
      grid-template-columns: 44px 38px minmax(0, 1fr) auto;
    }
    .capsule {
      width: 34px;
    }
    .body {
      padding-inline: var(--s-2);
    }
  }
  .join {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 28px;
    min-width: 28px;
    padding: 0 7px;
    border-radius: var(--r-pill);
    font-size: var(--t-xs);
    font-weight: 500;
    color: var(--ink-soft);
    background: color-mix(in srgb, var(--c) 14%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c) 35%, transparent);
    transition:
      background var(--dur-2) var(--ease-out),
      transform var(--dur-1) var(--ease-out);
  }
  .join:hover {
    background: color-mix(in srgb, var(--c) 24%, transparent);
  }
  .join:active {
    transform: scale(0.95);
  }
  /* Starting soon or on now: the button steps forward. */
  .join.hot {
    padding: 0 11px;
    color: var(--ink-inverse);
    background: color-mix(in srgb, var(--lume) 80%, var(--ink));
    box-shadow: 0 4px 14px -6px var(--lume);
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
