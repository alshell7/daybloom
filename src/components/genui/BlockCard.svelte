<script lang="ts">
  // One real block, live by its key: icon in its category colour, its day and time, and a ring
  // of its length (what's left while it runs; lume once done). Buttons act at once, with Undo
  // here and in the toast; a block that moves to another day is followed by its new key. A key
  // that names no block draws nothing; a block removed after it was shown says so quietly.
  import type { ComponentRenderProps } from '@openuidev/svelte-lang';
  import { scale } from 'svelte/transition';
  import { act, blockOf, fmt, type Did } from '../../lib/ai/genui/act';
  import { shortLen, valid } from '../../lib/ai/genui/read';
  import { BlockCardProps, type BlockAction } from '../../lib/ai/genui/schema';
  import { dayWord } from '../../lib/assistant/tools';
  import { formatDuration, MINUTE } from '../../lib/engine/time';
  import Icon from '../../lib/Icon.svelte';
  import { clock } from '../../lib/stores/clock.svelte';
  import { timer } from '../../lib/stores/timer.svelte';
  import { view } from '../../lib/stores/view.svelte';
  import Ring from '../assistant/Ring.svelte';

  let { props }: ComponentRenderProps<Record<string, unknown>> = $props();
  const p = $derived(valid(BlockCardProps, props));

  /** The key after a move to another day. */
  let rekey = $state<string | null>(null);
  let last = $state<{ what: BlockAction; did: Did } | null>(null);
  let seen = $state(false);
  // Re-read on the minute (and a zone change), so "25m left" and the ring stay true.
  const b = $derived((clock.zone, clock.minute, blockOf(rekey ?? p?.key)));
  $effect(() => {
    if (b) seen = true;
  });

  const len = $derived(b ? b.endMs - b.startMs : 0);
  /** A focus session on this block (started here or anywhere). */
  const running = $derived(!!b && timer.active?.target?.key === b.key && !timer.status(clock.minute)?.finished);
  const live = $derived(!!b && !b.floating && !b.done && b.startMs <= clock.now && clock.now < b.endMs);
  const past = $derived(!!b && !b.floating && !b.done && b.endMs <= clock.now);
  const left = $derived(live && b ? b.endMs - clock.minute : len);
  const ringColor = $derived(!b ? 'var(--ink)' : b.done ? 'var(--lume)' : past ? `color-mix(in srgb, ${b.color} 45%, var(--line-strong))` : b.color);

  const ACTIONS: Record<BlockAction, { label: string; icon: string }> = {
    start: { label: 'Start 2 min', icon: 'play' },
    done: { label: 'Done', icon: 'check' },
    move: { label: 'Move to free time', icon: 'route' },
    tomorrow: { label: 'Tomorrow', icon: 'move-later' },
    more: { label: '+15 min', icon: 'plus' },
    open: { label: 'Open', icon: 'pen' },
  };

  const buttons = $derived.by((): BlockAction[] => {
    if (!b) return [];
    const own = b.kind === 'task' && !b.readOnly;
    const fits = (a: BlockAction) => (a === 'open' ? own : a === 'start' ? !b.done : own && !b.done && (a !== 'more' || !b.floating));
    const asked = p?.actions?.length ? [...new Set(p.actions)] : live ? (['start', 'done', 'more'] as BlockAction[]) : past ? (['move', 'done', 'tomorrow'] as BlockAction[]) : (['start', 'done', 'move'] as BlockAction[]);
    return asked.filter(fits).slice(0, 4);
  });

  function run(a: BlockAction, e: MouseEvent) {
    if (!b) return;
    const k = b.key;
    if (a === 'open') return act.open(k);
    const did =
      a === 'done' ? act.done(k, { x: e.clientX, y: e.clientY }) : a === 'start' ? act.start(k) : a === 'move' ? act.move(k) : a === 'tomorrow' ? act.tomorrow(k) : act.more(k);
    if (!did) return;
    if (did.key && did.key !== k) rekey = did.key;
    last = { what: a, did };
  }

  function undo() {
    if (!last) return;
    last.did.undo();
    if (last.what === 'move' || last.what === 'tomorrow') rekey = null;
    last = null;
  }

  const meta = $derived.by(() => {
    if (!b) return '';
    if (b.floating) return `${dayWord(b.date)} · any time`;
    if (live) return `now · ${formatDuration(left)} left · until ${fmt(b.endMs)}`;
    return `${dayWord(b.date)} · ${fmt(b.startMs)}–${fmt(b.endMs)} · ${formatDuration(len)}`;
  });
  const DID: Partial<Record<BlockAction, string>> = { done: 'Ticked. Nicely done.', move: 'Moved', tomorrow: 'Moved to tomorrow', more: '15 more minutes' };
</script>

{#if b}
  <div class="a-card gu-block" class:done={b.done} class:past class:live style:--c={b.color}>
    <div class="head">
      <span class="a-ico" class:lume={b.done}>
        {#key b.done}
          <span class="glyph" in:scale={{ start: 0.6, duration: view.reducedMotion ? 0 : 260 }}><Icon name={b.done ? 'check' : b.icon} size={15} stroke={b.done ? 2.6 : 2} /></span>
        {/key}
      </span>
      <div class="txt">
        <button class="a-title link two" onclick={() => act.show(b.key)} title="Show on the dial">{b.title || 'Untitled block'}</button>
        <span class="a-meta">{meta}</span>
      </div>
      {#if !b.floating}
        <Ring fraction={live ? left / len : 1} color={ringColor} size={44} stroke={4} label={live ? `${formatDuration(left)} left` : formatDuration(len)}>
          {#if b.done}<Icon name="check" size={14} stroke={2.6} />{:else}{shortLen((live ? left : len) / MINUTE)}{/if}
        </Ring>
      {/if}
    </div>
    {#if p?.note?.trim()}<p class="note">{p.note.trim().slice(0, 160)}</p>{/if}

    {#if last && last.what !== 'start'}
      <div class="a-actions">
        <span class="a-meta"><Icon name="circle-check" size={12} /> {DID[last.what]}</span>
        <button class="a-chip quiet" onclick={undo}><Icon name="undo" size={13} /> Undo</button>
      </div>
    {:else if buttons.length || running}
      <!-- While a session runs on it, the other buttons stay (tick it when two minutes turn into more). -->
      <div class="a-actions">
        {#if running}
          <span class="a-meta"><Icon name="timer" size={12} /> Timer running</span>
          <button class="a-chip quiet" onclick={() => timer.stop()}>Stop</button>
        {/if}
        {#each buttons.filter((a) => !running || a !== 'start') as a, i (a)}
          <button class="a-chip" class:primary={i === 0 && !running} onclick={(e) => run(a, e)}><Icon name={ACTIONS[a].icon} size={13} stroke={2.2} /> {ACTIONS[a].label}</button>
        {/each}
      </div>
    {/if}
  </div>
{:else if seen}
  <div class="a-card gone"><span class="a-meta"><Icon name="circle-dashed" size={13} /> This block isn’t on the dial any more.</span></div>
{/if}

<style>
  .head {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: var(--s-3);
    align-items: center;
  }
  .txt {
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  .link {
    justify-self: start;
    max-width: 100%;
    text-align: left;
  }
  .link:hover {
    text-decoration: underline;
    text-decoration-color: var(--line-strong);
    text-underline-offset: 3px;
  }
  .glyph {
    display: grid;
  }
  /* The block you're in: a soft wash of its colour, like the rail's live row. */
  .live {
    background: color-mix(in srgb, var(--c) 7%, var(--surface));
    border-color: color-mix(in srgb, var(--c) 24%, var(--line));
  }
  .done .a-title {
    color: var(--ink-2);
  }
  /* A block that didn't happen: soft, dashed, never red. */
  .past .a-ico {
    background: color-mix(in srgb, var(--c) 10%, transparent);
    border: 1.5px dashed color-mix(in srgb, var(--c) 50%, transparent);
  }
  .note {
    margin: -2px 0 0;
    font-size: var(--t-sm);
    color: var(--ink-2);
    line-height: 1.4;
  }
  .gone {
    padding-block: 10px;
  }
  :global(.gu-block) :global(.ring .in) {
    font-size: 10.5px;
  }
  /* Long titles wrap to two lines instead of cutting off. */
  .two {
    white-space: normal;
    overflow-wrap: anywhere;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }
</style>
