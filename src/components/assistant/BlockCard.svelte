<script lang="ts">
  // A block the assistant just added, moved, extended or ticked — live, with chips to tweak
  // its time and length right here, plus Undo and Open.
  import { scale } from 'svelte/transition';
  import { blockFor, dayWord, placeOccurrence, type BlockVerb } from '../../lib/assistant/tools';
  import { describeRecurrence } from '../../lib/engine/recurrence';
  import { addDays, formatDuration, formatMinutes, formatTime, MINUTE, minutesOfDay } from '../../lib/engine/time';
  import Icon from '../../lib/Icon.svelte';
  import { clock } from '../../lib/stores/clock.svelte';
  import { tasks } from '../../lib/stores/tasks.svelte';
  import { view } from '../../lib/stores/view.svelte';

  let {
    card,
    canUndo,
    undone,
    onundo,
  }: { card: { kind: 'block'; key: string; verb: BlockVerb; from?: string }; canUndo: boolean; undone: boolean; onundo: () => void } = $props();

  /** "Tomorrow instead" re-keys a one-off block. */
  let rekey = $state<string | null>(null);
  const key = $derived(rekey ?? card.key);
  const b = $derived((clock.zone, blockFor(key)));
  const task = $derived(b?.taskId ? tasks.get(b.taskId) : undefined);
  const len = $derived(b ? Math.round((b.endMs - b.startMs) / MINUTE) : 0);
  const start = $derived(b && !b.floating ? Math.round(minutesOfDay(b.startMs)) : null);
  const editable = $derived(!!b && !!task && !b.done && !b.readOnly && (card.verb === 'added' || card.verb === 'moved' || card.verb === 'extended'));
  const passed = $derived(!!b && !b.floating && !b.recurring && b.date === view.today && b.endMs <= clock.minute);
  const DURS = [15, 30, 45, 60, 90];
  const fmt = (ms: number) => formatTime(ms, view.hour12);

  /** A new routine changes as a whole; anything else changes just this occurrence. */
  function edit(o: { start?: number; duration?: number }) {
    if (!b || !task) return;
    if (card.verb === 'added' && task.recurrence) tasks.update(task.id, o);
    else tasks.editOccurrence(task.id, b.date, o);
  }

  function shift(m: number) {
    if (start === null) return;
    edit({ start: Math.max(0, Math.min(1435, start + m)) });
  }

  function tomorrow() {
    if (!b) return;
    const r = placeOccurrence(key, addDays(b.date, 1), start);
    if (r) rekey = r.key;
  }

  function open() {
    if (!b) return;
    view.setDate(b.date);
    view.selected = key;
    view.sheet = { kind: 'edit', key };
  }

  function show() {
    if (!b) return;
    view.setDate(b.date);
    view.selected = key;
  }
</script>

{#if b}
  <div class="a-card block" class:done={b.done} style:--c={b.color}>
    <div class="head">
      <span class="a-ico" class:lume={b.done}>
        {#key b.done}
          <span class="glyph" in:scale={{ start: 0.6, duration: view.reducedMotion ? 0 : 260 }}><Icon name={b.done ? 'check' : b.icon} size={15} stroke={b.done ? 2.6 : 2} /></span>
        {/key}
      </span>
      <div class="txt">
        <button class="a-title link" onclick={show} title="Show on the dial">{b.title || 'Untitled block'}</button>
        <span class="a-meta">
          {#if b.floating}
            {dayWord(b.date)} · any time
          {:else}
            {dayWord(b.date)} · {fmt(b.startMs)}–{fmt(b.endMs)} · {formatDuration(b.endMs - b.startMs)}
          {/if}
        </span>
        {#if task?.recurrence}
          <span class="a-meta"><Icon name="repeat" size={11} /> {describeRecurrence(task.recurrence, task.date)}</span>
        {/if}
      </div>
      {#if b.done}
        <span class="badge done"><Icon name="circle-check" size={12} stroke={2.2} /> Done</span>
      {:else if card.verb === 'moved' && card.from}
        <span class="badge">from {card.from}</span>
      {/if}
    </div>

    {#if editable}
      <div class="tweak">
        {#if start !== null}
          <div class="a-actions" role="group" aria-label="Start time">
            <button class="a-chip tnum" onclick={() => shift(-15)} aria-label="15 minutes earlier">−15m</button>
            <span class="a-chip still tnum" aria-live="polite">{formatMinutes(start, view.hour12)}</span>
            <button class="a-chip tnum" onclick={() => shift(15)} aria-label="15 minutes later">+15m</button>
          </div>
        {/if}
        <div class="a-actions" role="group" aria-label="Length">
          {#each DURS as d (d)}
            <button class="a-chip tnum" aria-pressed={len === d} onclick={() => edit({ duration: d })}>{formatDuration(d * MINUTE)}</button>
          {/each}
        </div>
      </div>
    {/if}

    <div class="a-actions">
      {#if canUndo && !undone}
        <button class="a-chip quiet" onclick={onundo}><Icon name="undo" size={13} /> Undo</button>
      {:else if undone}
        <span class="a-meta"><Icon name="undo" size={12} /> Undone</span>
      {/if}
      {#if passed && card.verb === 'added' && !rekey}
        <button class="a-chip" onclick={tomorrow}><Icon name="move-later" size={13} /> Tomorrow instead</button>
      {/if}
      {#if !b.readOnly}
        <button class="a-chip quiet" onclick={open}><Icon name="pen" size={13} /> Open</button>
      {/if}
    </div>
  </div>
{:else}
  <div class="a-card gone">
    <span class="a-meta"><Icon name="circle-dashed" size={13} /> {undone ? 'Undone — it’s off the dial.' : 'This block isn’t on the dial any more.'}</span>
  </div>
{/if}

<style>
  .head {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: var(--s-3);
    align-items: start;
  }
  .txt {
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  .link {
    text-align: left;
    justify-self: start;
    max-width: 100%;
  }
  .link:hover {
    text-decoration: underline;
    text-decoration-color: var(--line-strong);
    text-underline-offset: 3px;
  }
  .done .a-title {
    color: var(--ink-2);
  }
  .glyph {
    display: grid;
  }
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 22px;
    padding: 0 8px;
    border-radius: var(--r-pill);
    background: var(--sunken);
    color: var(--ink-2);
    font-size: var(--t-xs);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .badge.done {
    background: color-mix(in srgb, var(--lume) 20%, transparent);
    color: var(--ink);
  }
  .tweak {
    display: grid;
    gap: 6px;
  }
  .gone {
    padding-block: 10px;
  }
</style>
