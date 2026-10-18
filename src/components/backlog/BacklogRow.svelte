<script lang="ts">
  import { celebrateBadges } from '../../lib/actions';
  import { tick } from 'svelte';
  import { slide } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import {
    ageLabel,
    backlog,
    doneLabel,
    dueLabel,
    dueState,
    ENERGY_ICON,
    ENERGY_LABEL,
    LISTS,
    nextDuration,
    nextLevel,
    PRIORITY_LABEL,
    type Level,
    type ListId,
  } from '../../lib/backlog';
  import { categoryColor } from '../../lib/engine/categories';
  import { addDays, formatDuration, formatMinutes, MINUTE, minutesOfDay, weekday } from '../../lib/engine/time';
  import type { BacklogList, ISODate, Task } from '../../lib/engine/types';
  import Icon from '../../lib/Icon.svelte';
  import { sounds } from '../../lib/sound';
  import { view } from '../../lib/stores/view.svelte';

  let {
    task,
    list,
    today,
    nowMs,
    tabbable = false,
    reorderable = false,
    dragging = false,
    ty = 0,
    onkey,
    ongrip,
    onfocused,
    onremove,
  }: {
    task: Task;
    list: ListId;
    today: ISODate;
    nowMs: number;
    tabbable?: boolean;
    reorderable?: boolean;
    dragging?: boolean;
    ty?: number;
    /** Keys the row doesn't handle itself (arrows, delete). */
    onkey?: (e: KeyboardEvent) => void;
    ongrip?: (e: PointerEvent) => void;
    onfocused?: () => void;
    onremove?: () => void;
  } = $props();

  let row: HTMLDivElement | undefined = $state();
  let checkEl: HTMLButtonElement | undefined = $state();
  let titleInput: HTMLInputElement | undefined = $state();
  let timeInput: HTMLInputElement | undefined = $state();

  let editing = $state(false);
  let draft = $state('');
  let tray = $state<null | 'due' | 'time' | 'move'>(null);
  let checking = $state(false);
  let time = $state('');
  let gripDown = false;

  const color = $derived(categoryColor(task.category, view.finish.dark));
  const isDone = $derived(list === 'done');
  const ds = $derived(dueState(task.due, today));
  const age = $derived(list === 'inbox' ? ageLabel(task.createdAt, nowMs) : null);
  const warm = $derived(ds === 'today' || ds === 'overdue');

  // ── Complete ──
  function toggle() {
    if (isDone) {
      backlog.restore(task.id);
      const back = LISTS.find((l) => l.id === (task.list ?? 'inbox'))?.label ?? 'Inbox';
      view.say(`“${task.title || 'Item'}” is back in ${back}`);
      return;
    }
    if (checking) return;
    checking = true;
    const r = checkEl?.getBoundingClientRect();
    if (r) view.spark(r.left + r.width / 2, r.top + r.height / 2, color, false, 'Done');
    sounds.done();
    // Let the check pop and the strike draw before the row leaves.
    setTimeout(() => {
      backlog.complete(task.id);
      celebrateBadges();
    }, view.reducedMotion ? 0 : 460);
  }

  // ── Title ──
  async function startEdit() {
    if (isDone) return;
    draft = task.title;
    editing = true;
    await tick();
    titleInput?.focus();
    titleInput?.select();
  }
  function commit(keepFocus = true) {
    if (!editing) return;
    const v = draft.trim();
    if (v && v !== task.title) backlog.update(task.id, { title: v });
    editing = false;
    if (keepFocus) tick().then(() => row?.focus());
  }
  function titleKey(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      editing = false;
      tick().then(() => row?.focus());
    }
  }

  // ── Chips ──
  function cycleDuration(e: MouseEvent) {
    backlog.update(task.id, { duration: nextDuration(task.duration, e.shiftKey) });
  }
  function cycleEnergy() {
    backlog.update(task.id, { energy: nextLevel(task.energy) });
  }
  function cyclePriority() {
    backlog.update(task.id, { priority: nextLevel(task.priority) });
  }

  // ── Trays ──
  async function open(kind: 'due' | 'time' | 'move') {
    if (tray === kind) {
      tray = null;
      return;
    }
    if (kind === 'time') {
      const at = backlog.suggestSlot(task.id);
      const m = at !== null ? Math.round(minutesOfDay(at)) : Math.ceil(minutesOfDay(nowMs) / 5) * 5;
      time = `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    }
    tray = kind;
    if (kind === 'time') {
      await tick();
      timeInput?.focus();
    }
  }
  function trayKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      tray = null;
      row?.focus();
    }
  }

  const dueChoices = $derived.by(() => {
    const wd = weekday(today);
    const fri = addDays(today, (5 - wd + 7) % 7);
    const nextMon = addDays(today, 7 - ((wd + 6) % 7));
    const out: { label: string; date: ISODate }[] = [
      { label: 'Today', date: today },
      { label: 'Tomorrow', date: addDays(today, 1) },
    ];
    if (fri !== today && fri !== addDays(today, 1)) out.push({ label: dueLabel(fri, today), date: fri });
    out.push({ label: 'Next week', date: nextMon });
    return out;
  });
  function setDue(date: ISODate | null) {
    backlog.update(task.id, { due: date });
    tray = null;
    row?.focus();
  }

  function placeAt() {
    const [h, m] = time.split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return;
    backlog.schedule(task.id, today, h * 60 + m);
    tray = null;
  }

  function moveTo(l: BacklogList) {
    tray = null;
    if ((task.list ?? 'inbox') === l) return;
    backlog.moveTo(task.id, l);
    view.say(`Moved to ${LISTS.find((x) => x.id === l)?.label}`);
  }

  // ── Keyboard ──
  function keydown(e: KeyboardEvent) {
    if (e.target !== row || e.metaKey || e.ctrlKey) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      startEdit();
    } else if (e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      toggle();
    } else if (e.key.toLowerCase() === 't' && !isDone && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      backlog.fitToday(task.id);
    } else onkey?.(e);
  }

  // ── Drag onto the dial (HTML5) vs. reorder (pointer, via the grip) ──
  function dragStart(e: DragEvent) {
    if (gripDown || editing || isDone || !e.dataTransfer) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('application/x-daybloom-task', task.id);
    e.dataTransfer.setData(`application/x-daybloom-min-${task.duration}`, '');
    e.dataTransfer.setData('text/plain', task.title);
    e.dataTransfer.effectAllowed = 'move';
  }
  function grip(e: PointerEvent) {
    if (e.button !== 0) return;
    gripDown = true;
    const up = () => {
      gripDown = false;
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    ongrip?.(e);
  }

  const durLabel = $derived(formatDuration(task.duration * MINUTE));
  const label = $derived(
    [task.title || 'Untitled', durLabel, task.priority ? PRIORITY_LABEL[task.priority as Level] : '', task.due ? `due ${dueLabel(task.due, today)}` : '']
      .filter(Boolean)
      .join(', '),
  );
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  bind:this={row}
  class="row"
  class:checking
  class:done={isDone}
  class:dragging
  class:editing
  class:tray-open={!!tray}
  style:--c={color}
  style:transform={dragging ? `translateY(${ty}px)` : undefined}
  role="group"
  aria-label={label}
  tabindex={tabbable ? 0 : -1}
  draggable={!isDone && !editing}
  ondragstart={dragStart}
  onkeydown={keydown}
  onfocusin={() => onfocused?.()}
>
  <div class="line">
    {#if reorderable}
      <span class="grip" onpointerdown={grip} title="Drag to reorder" aria-hidden="true"><Icon name="grip" size={14} /></span>
    {:else}
      <span class="grip off" aria-hidden="true"></span>
    {/if}

    <button
      bind:this={checkEl}
      class="check"
      onclick={toggle}
      tabindex="-1"
      aria-label={isDone ? `Restore ${task.title}` : `Mark ${task.title} done`}
      aria-pressed={isDone || checking}
    >
      <span class="tick"><Icon name="check" size={13} stroke={3} /></span>
    </button>

    <button class="tile" onclick={() => (view.sheet = { kind: 'edit', key: `later:${task.id}` })} tabindex="-1" title="Open details">
      <Icon name={task.icon} size={15} stroke={2} />
    </button>

    <div class="body">
      {#if editing}
        <input
          bind:this={titleInput}
          bind:value={draft}
          class="title-input"
          aria-label="Title"
          onkeydown={titleKey}
          onblur={() => commit(false)}
        />
      {:else}
        <button class="title" onclick={startEdit} tabindex="-1" title={isDone ? task.title : 'Click to rename'}>
          <span class="tx">{task.title || 'Untitled'}</span>
        </button>
      {/if}

      <div class="meta">
        {#if isDone}
          <span class="cap tnum">{durLabel}</span>
          {#if task.doneAt}<span class="cap">· done {doneLabel(task.doneAt, nowMs)}</span>{/if}
        {:else}
          <button class="chip tnum" tabindex={tabbable ? 0 : -1} onclick={cycleDuration} title="Length — click to change (shift-click goes back)" aria-label={`Length ${durLabel}, change`}>
            {durLabel}
          </button>
          {#if task.priority}
            <button class="chip prio p{task.priority}" tabindex={tabbable ? 0 : -1} onclick={cyclePriority} title="Priority — click to change">
              <Icon name="flag" size={11} stroke={2} />{PRIORITY_LABEL[task.priority as Level]}
            </button>
          {/if}
          {#if task.energy}
            <button class="chip" tabindex={tabbable ? 0 : -1} onclick={cycleEnergy} title={`${ENERGY_LABEL[task.energy as Level]} — click to change`} aria-label={`${ENERGY_LABEL[task.energy as Level]}, change`}>
              <Icon name={ENERGY_ICON[task.energy as Level]} size={14} stroke={1.9} />
            </button>
          {/if}
          {#if task.due}
            <button class="chip due" tabindex={tabbable ? 0 : -1} class:warm aria-expanded={tray === 'due'} onclick={() => open('due')} title={warm ? 'Due — whenever you’re ready' : 'Due date'}>
              <Icon name="calendar-clock" size={11} stroke={2} />{dueLabel(task.due, today)}
            </button>
          {/if}
          {#if age}
            <span class="cap age" title={`In your inbox for ${age}`}><Icon name="hourglass" size={11} /> {age}</span>
          {/if}
          <!-- Unset fields: quiet ghosts that only show on hover/focus, appended so nothing shifts. -->
          {#if !task.priority}
            <button class="chip ghost" tabindex={tabbable ? 0 : -1} onclick={cyclePriority} title="Set priority" aria-label="Set priority"><Icon name="flag" size={11} /></button>
          {/if}
          {#if !task.energy}
            <button class="chip ghost" tabindex={tabbable ? 0 : -1} onclick={cycleEnergy} title="Set energy" aria-label="Set energy"><Icon name="battery-medium" size={14} /></button>
          {/if}
          {#if !task.due}
            <button class="chip ghost" tabindex={tabbable ? 0 : -1} aria-expanded={tray === 'due'} onclick={() => open('due')} title="Set a due date" aria-label="Set a due date"><Icon name="calendar-clock" size={11} /></button>
          {/if}
        {/if}
      </div>
    </div>

    <div class="tools">
      {#if isDone}
        <button tabindex={tabbable ? 0 : -1} class="tool" onclick={toggle} title="Restore" aria-label="Restore"><Icon name="undo" size={15} /></button>
        <button tabindex={tabbable ? 0 : -1} class="tool" onclick={() => onremove?.()} title="Delete" aria-label="Delete"><Icon name="trash-ui" size={15} /></button>
      {:else}
        <button tabindex={tabbable ? 0 : -1} class="tool wide" onclick={() => backlog.fitToday(task.id)} title="Put it in the next free gap today (T)">
          <Icon name="sun" size={14} />Today
        </button>
        <button tabindex={tabbable ? 0 : -1} class="tool" class:on={tray === 'time'} onclick={() => open('time')} title="Pick a time today" aria-label="Pick a time today"><Icon name="clock" size={15} /></button>
        <button tabindex={tabbable ? 0 : -1} class="tool" class:on={tray === 'move'} onclick={() => open('move')} title="Move to another list" aria-label="Move to another list"><Icon name="move-later" size={15} /></button>
        <button tabindex={tabbable ? 0 : -1} class="tool" onclick={() => onremove?.()} title="Delete (⌫)" aria-label="Delete"><Icon name="trash-ui" size={15} /></button>
      {/if}
    </div>
  </div>

  {#if tray}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="tray" transition:slide={{ duration: view.reducedMotion ? 0 : 200, easing: cubicOut }} onkeydown={trayKey}>
      {#if tray === 'due'}
        {#each dueChoices as c (c.label)}
          <button class="pill" aria-pressed={task.due === c.date} onclick={() => setDue(c.date)}>{c.label}</button>
        {/each}
        <input
          class="pill date"
          type="date"
          aria-label="Pick a due date"
          value={task.due ?? ''}
          min={today}
          onchange={(e) => e.currentTarget.value && setDue(e.currentTarget.value)}
        />
        {#if task.due}<button class="pill quiet" onclick={() => setDue(null)}>Clear</button>{/if}
      {:else if tray === 'time'}
        <span class="lbl">Today at</span>
        <input
          bind:this={timeInput}
          bind:value={time}
          class="pill time tnum"
          type="time"
          step="300"
          aria-label="Start time today"
          onkeydown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.stopPropagation();
              placeAt();
            }
          }}
        />
        <span class="lbl tnum">for {durLabel}</span>
        <button class="pill strong" onclick={placeAt}>Place</button>
        {#if time}<span class="lbl until tnum">until {formatMinutes(((Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) + task.duration) % 1440), view.hour12)}</span>{/if}
      {:else}
        <span class="lbl">Move to</span>
        {#each LISTS.filter((l) => l.id !== 'done') as l (l.id)}
          <button class="pill" aria-pressed={(task.list ?? 'inbox') === l.id} onclick={() => moveTo(l.id as BacklogList)}>
            <Icon name={l.icon} size={13} />{l.label}
          </button>
        {/each}
      {/if}
    </div>
  {/if}
</div>

<style>
  .row {
    --row-bg: var(--raised);
    position: relative;
    border-radius: var(--r-md);
    background: var(--row-bg);
    outline: none;
    user-select: none;
    -webkit-user-select: none;
    transition:
      background var(--dur-1) var(--ease-out),
      box-shadow var(--dur-2) var(--ease-out),
      transform var(--dur-2) var(--ease-settle);
  }
  .row:hover,
  .row:focus-within,
  .row.tray-open {
    --row-bg: color-mix(in srgb, var(--sunken) 62%, var(--raised));
  }
  .row:focus-visible {
    box-shadow: 0 0 0 2px var(--focus-ring);
  }
  .row[draggable='true'] {
    cursor: grab;
  }
  .row.dragging {
    z-index: 2;
    cursor: grabbing;
    transition: box-shadow var(--dur-2) var(--ease-out);
    box-shadow: var(--shadow-3);
    --row-bg: var(--raised);
  }
  .line {
    position: relative;
    display: grid;
    grid-template-columns: 14px 22px 28px minmax(0, 1fr);
    align-items: center;
    column-gap: 9px;
    padding: 7px 8px 7px 2px;
  }

  /* grip */
  .grip {
    display: grid;
    place-items: center;
    height: 28px;
    color: var(--ink-3);
    opacity: 0;
    cursor: grab;
    touch-action: none;
    transition: opacity var(--dur-1) var(--ease-out);
  }
  .row:hover .grip:not(.off),
  .row.dragging .grip {
    opacity: 0.8;
  }
  .row.dragging .grip {
    cursor: grabbing;
  }

  /* the round check */
  .check {
    position: relative;
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 1.5px solid var(--line-strong);
    color: var(--ink-inverse);
    transition:
      border-color var(--dur-1) var(--ease-out),
      background var(--dur-2) var(--ease-out),
      transform var(--dur-1) var(--ease-out);
  }
  .check:hover {
    border-color: color-mix(in srgb, var(--lume) 75%, var(--ink-3));
  }
  .check:active {
    transform: scale(0.88);
  }
  .tick {
    display: grid;
    opacity: 0;
    transform: scale(0.4);
  }
  .check:hover .tick {
    opacity: 0.35;
    transform: scale(0.8);
    color: var(--lume);
  }
  .row.checking .check,
  .row.done .check {
    background: var(--lume);
    border-color: var(--lume);
  }
  .row.checking .tick,
  .row.done .tick {
    opacity: 1;
    transform: none;
    color: var(--ink-inverse);
  }
  .row.checking .tick {
    animation: pop 420ms var(--ease-settle) both;
  }
  .row.checking .check::after {
    content: '';
    position: absolute;
    inset: -2px;
    border-radius: 50%;
    border: 2px solid var(--lume);
    pointer-events: none;
    animation: pulse 700ms var(--ease-out) forwards;
  }
  @keyframes pop {
    0% {
      transform: scale(0.3);
      opacity: 0;
    }
    60% {
      transform: scale(1.18);
      opacity: 1;
    }
    100% {
      transform: scale(1);
    }
  }
  @keyframes pulse {
    from {
      transform: scale(1);
      opacity: 0.75;
    }
    to {
      transform: scale(2.1);
      opacity: 0;
    }
  }

  /* category tile */
  .tile {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 9px;
    background: color-mix(in srgb, var(--c) 17%, transparent);
    color: color-mix(in srgb, var(--c) 78%, var(--ink));
    transition: transform var(--dur-1) var(--ease-out);
  }
  .tile:hover {
    transform: scale(1.06);
  }
  .tile:active {
    transform: scale(0.94);
  }
  .row.done .tile {
    opacity: 0.6;
  }

  /* title + meta */
  .body {
    min-width: 0;
    display: grid;
    gap: 3px;
  }
  .title {
    position: relative;
    justify-self: start;
    max-width: 100%;
    text-align: left;
    font-family: var(--font-read);
    font-size: 14px;
    font-weight: 500;
    line-height: 1.3;
    color: var(--ink);
    cursor: text;
  }
  .row.done .title {
    cursor: default;
  }
  .tx {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .title::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    top: 52%;
    height: 1.5px;
    border-radius: 1px;
    background: var(--ink-3);
    transform: scaleX(0);
    transform-origin: left;
  }
  .row.checking .title,
  .row.done .title {
    color: var(--ink-3);
  }
  .row.checking .title::after {
    animation: strike 420ms var(--ease-out) forwards;
  }
  .row.done .title::after {
    transform: none;
  }
  @keyframes strike {
    to {
      transform: scaleX(1);
    }
  }
  .title-input {
    width: 100%;
    height: 24px;
    margin: -2px 0 -1px -6px;
    padding: 0 6px;
    border-radius: 7px;
    border: 1px solid var(--focus-ring);
    background: var(--raised);
    outline: none;
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--focus-ring) 20%, transparent);
    font-family: var(--font-read);
    font-size: 14px;
    font-weight: 500;
    user-select: text;
    -webkit-user-select: text;
  }
  .meta {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
    min-height: 20px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 20px;
    padding: 0 7px;
    border-radius: var(--r-pill);
    background: var(--sunken);
    font-family: var(--font-ui);
    font-size: 11px;
    color: var(--ink-2);
    transition:
      background var(--dur-1) var(--ease-out),
      color var(--dur-1) var(--ease-out),
      opacity var(--dur-2) var(--ease-out),
      transform var(--dur-1) var(--ease-out);
  }
  .chip:hover {
    color: var(--ink);
    background: color-mix(in srgb, var(--sunken) 70%, var(--ink) 9%);
  }
  .chip:active {
    transform: scale(0.94);
  }
  .row:hover .chip,
  .row:focus-within .chip {
    background: color-mix(in srgb, var(--sunken) 80%, var(--raised));
  }
  .prio.p1 {
    color: var(--ink);
    font-weight: 500;
  }
  .prio.p1 :global(svg) {
    fill: currentColor;
  }
  .prio.p3 {
    color: var(--ink-3);
  }
  /* Gentle urgency: warm amber, never red. */
  .due.warm {
    color: var(--warm-ink);
    background: var(--warm-wash);
  }
  .ghost {
    visibility: hidden;
    opacity: 0;
    background: transparent;
    border: 1px dashed var(--line-strong);
    color: var(--ink-3);
    padding: 0 6px;
  }
  .row:hover .ghost,
  .row:focus-within .ghost {
    visibility: visible;
    opacity: 1;
    background: transparent;
  }
  .ghost:hover {
    border-style: solid;
  }
  .cap {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-family: var(--font-ui);
    font-size: 11px;
    color: var(--ink-3);
  }
  .age {
    margin: 0 2px;
  }

  /* hover tools */
  .tools {
    position: absolute;
    top: 50%;
    right: 6px;
    display: flex;
    align-items: center;
    gap: 2px;
    padding-left: 18px;
    transform: translateY(-50%);
    background: linear-gradient(to right, transparent, var(--row-bg) 18px);
    pointer-events: none;
  }
  .tool {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    width: 28px;
    height: 28px;
    border-radius: var(--r-pill);
    color: var(--ink-2);
    opacity: 0;
    transform: translateX(4px);
    transition:
      opacity var(--dur-2) var(--ease-out),
      transform var(--dur-2) var(--ease-out),
      background var(--dur-1) var(--ease-out);
  }
  .tool.wide {
    width: auto;
    padding: 0 10px 0 8px;
    font-family: var(--font-ui);
    font-size: var(--t-xs);
    font-weight: 500;
    background: var(--raised);
    box-shadow: var(--shadow-1);
    color: var(--ink);
  }
  .tool:hover,
  .tool.on {
    background: var(--sunken);
    color: var(--ink);
  }
  .tool.wide:hover {
    background: var(--raised);
    box-shadow: var(--shadow-2);
  }
  .tool:active {
    transform: scale(0.92);
  }
  .row:hover .tools,
  .row:focus-within .tools,
  .row.tray-open .tools {
    pointer-events: auto;
  }
  .row:hover .tool,
  .row:focus-within .tool,
  .row.tray-open .tool {
    opacity: 1;
    transform: none;
  }
  .row:hover .tool:nth-child(2) {
    transition-delay: 30ms, 30ms, 0ms;
  }
  .row:hover .tool:nth-child(3) {
    transition-delay: 60ms, 60ms, 0ms;
  }
  .row:hover .tool:nth-child(4) {
    transition-delay: 90ms, 90ms, 0ms;
  }
  .row.dragging .tools,
  .row.editing .tools,
  .row.checking .tools {
    display: none;
  }

  /* inline trays */
  .tray {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    padding: 0 10px 10px 75px;
  }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 28px;
    padding: 0 11px;
    border-radius: var(--r-pill);
    border: 1px solid var(--line-strong);
    background: var(--raised);
    font-family: var(--font-ui);
    font-size: var(--t-xs);
    color: var(--ink-2);
    transition:
      background var(--dur-1) var(--ease-out),
      border-color var(--dur-1) var(--ease-out);
  }
  .pill:hover {
    border-color: var(--ink-3);
    color: var(--ink);
  }
  .pill[aria-pressed='true'] {
    background: var(--ink);
    border-color: var(--ink);
    color: var(--ink-inverse);
  }
  .pill.quiet {
    border-color: transparent;
    background: transparent;
  }
  .pill.strong {
    background: var(--ink);
    border-color: var(--ink);
    color: var(--ink-inverse);
    font-weight: 500;
  }
  .pill.strong:hover {
    background: color-mix(in srgb, var(--ink) 88%, var(--signal));
  }
  .pill.date,
  .pill.time {
    padding: 0 8px;
    color: var(--ink);
    user-select: text;
    -webkit-user-select: text;
  }
  .pill.date:focus,
  .pill.time:focus {
    outline: none;
    border-color: var(--focus-ring);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--focus-ring) 20%, transparent);
  }
  .lbl {
    font-family: var(--font-ui);
    font-size: var(--t-xs);
    color: var(--ink-3);
  }

  :global([data-motion='calm']) .row.checking .tick,
  :global([data-motion='calm']) .row.checking .title::after {
    animation-duration: 1ms;
  }
  :global([data-motion='calm']) .row.checking .check::after {
    display: none;
  }

  @container backlog (max-width: 420px) {
    .tray {
      padding-left: 12px;
    }
    .tool.wide {
      width: 28px;
      padding: 0;
      font-size: 0;
      gap: 0;
    }
  }
</style>
