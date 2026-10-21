<script lang="ts">
  // One finished thing in the history: its icon in its category colour, its title, when it ran
  // and how long it took, and when it was done. The row opens it; the lume check at the end
  // un-ticks it ("Not done after all"): the tick undraws, the ring empties, then the row goes.
  import { categoryColor } from '../../lib/engine/categories';
  import { formatDayShort, formatDuration, formatTime, isoOf, MINUTE } from '../../lib/engine/time';
  import type { DoneItem } from '../../lib/history';
  import Icon from '../../lib/Icon.svelte';
  import { view } from '../../lib/stores/view.svelte';

  let {
    item,
    index = 0,
    canOpen = true,
    onopen,
    onundo,
  }: {
    item: DoneItem;
    /** Position in its day, for the entrance stagger. */
    index?: number;
    canOpen?: boolean;
    onopen: () => void;
    onundo: () => void;
  } = $props();

  const color = $derived(categoryColor(item.category, view.finish.dark));
  const h12 = $derived(view.hour12);

  const HOW: Record<NonNullable<DoneItem['how']>, string> = { jamaat: 'In jamaat', ontime: 'On time', late: 'Made up later' };

  const meta = $derived.by(() => {
    const i = item;
    if (i.source === 'salah') return [i.startMs != null ? formatTime(i.startMs, h12) : '', i.how ? HOW[i.how] : 'Prayed', i.qasr ? 'qasr' : ''].filter(Boolean).join(' · ');
    if (i.source === 'backlog') return 'From your backlog';
    const bits: string[] = [];
    if (i.kind === 'timed' && i.startMs != null && i.spentEndMs != null) {
      bits.push(`${formatTime(i.startMs, h12)}–${formatTime(i.spentEndMs, h12)}`);
      if (i.spentMs >= MINUTE) bits.push(formatDuration(i.spentMs));
    } else bits.push(i.source === 'event' ? 'All day' : 'Anytime');
    if (i.note) bits.push(i.note);
    return bits.join(' · ');
  });

  /** When it was done: the tick or the mark (with its day when that was another day). */
  const when = $derived.by(() => {
    const i = item;
    const at = i.doneAt;
    if (at == null) return '';
    const t = formatTime(at, h12);
    if (isoOf(at) === i.date) return t;
    const d = formatDayShort(isoOf(at));
    return `${d.dow} ${t}`;
  });
  const whenLabel = $derived(item.source === 'salah' ? 'Marked at' : 'Done at');

  // Un-ticking plays out on the check first, then the row leaves.
  let leaving = $state(false);
  function undo() {
    if (leaving) return;
    if (view.reducedMotion) return onundo();
    leaving = true;
    setTimeout(onundo, 260);
  }
</script>

<div class="row" class:leaving class:salah={item.source === 'salah'} style:--c={color} style:--i={Math.min(index, 12)}>
  <button class="open" onclick={onopen} disabled={!canOpen} aria-label={`${item.title || 'Untitled'}, ${meta}${when ? `, ${whenLabel.toLowerCase()} ${when}` : ''}${canOpen ? '. Open it.' : ''}`}>
    <span class="tile" aria-hidden="true"><Icon name={item.icon} size={17} stroke={2} /></span>
    <span class="txt">
      <span class="title">{item.title || 'Untitled'}</span>
      <span class="meta tnum">{meta}</span>
    </span>
    {#if when}<span class="when tnum" title={whenLabel}>{when}</span>{/if}
  </button>
  <button class="check" data-how={item.how} onclick={undo} title="Not done after all" aria-label={`${item.title || 'Untitled'}: not done after all`}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 12.5l3.6 3.6 7.4-7.6" /></svg>
  </button>
</div>

<style>
  .row {
    --spring: cubic-bezier(0.34, 1.45, 0.64, 1);
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    border-radius: var(--r-md);
    transition: background var(--dur-1) var(--ease-out);
    animation: arrive 420ms var(--spring) both;
    animation-delay: calc(var(--i) * 22ms);
  }
  .row:hover,
  .row:focus-within {
    background: var(--sunken);
  }
  @keyframes arrive {
    from {
      opacity: 0;
      transform: translateY(8px) scale(0.97);
    }
  }
  :global([data-motion='calm']) .row {
    animation: none;
  }

  .open {
    min-width: 0;
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--s-3);
    padding: 7px 4px 7px 8px;
    border-radius: var(--r-md);
    text-align: left;
    color: inherit;
  }
  .open:disabled {
    cursor: default;
    opacity: 1;
  }
  .open:active:not(:disabled) .tile {
    transform: scale(0.92);
  }
  .tile {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border-radius: 12px;
    color: var(--c);
    background: color-mix(in srgb, var(--c) 15%, transparent);
    box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--c) 22%, transparent);
    transition: transform var(--dur-2) var(--spring);
  }
  .row:hover .tile {
    transform: scale(1.04) rotate(-3deg);
  }
  .txt {
    min-width: 0;
    display: grid;
    gap: 1px;
  }
  .title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-read);
    font-size: var(--t-md);
    font-weight: 500;
    line-height: 1.3;
    color: var(--ink);
  }
  .meta {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-ui);
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .when {
    font-family: var(--font-ui);
    font-size: var(--t-xs);
    color: var(--ink-2);
    white-space: nowrap;
  }

  /* The lume check, the rail's check in its done state; pressing it plays the un-tick. */
  .check {
    position: relative;
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    margin: 0 6px 0 4px;
    border-radius: 50%;
    border: 2px solid var(--lume);
    transition:
      border-color var(--dur-2) var(--ease-out),
      transform var(--dur-2) var(--spring);
  }
  .check::before {
    content: '';
    position: absolute;
    inset: -2px;
    border-radius: 50%;
    background: var(--lume);
    transition:
      transform 0.3s var(--ease-out),
      opacity 0.3s var(--ease-out);
  }
  .check:hover {
    transform: scale(1.1);
  }
  .check:hover::before {
    opacity: 0.8;
  }
  .check:active {
    transform: scale(0.88);
  }
  .check svg {
    position: relative;
    width: 18px;
    height: 18px;
    fill: none;
    stroke: var(--ink-inverse);
    stroke-width: 2.6;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 20;
    stroke-dashoffset: 0;
    transition: stroke-dashoffset 220ms var(--ease-out);
  }
  /* A prayer: jamaat wears a ring of company, made up a dashed edge (as in the rail). */
  .check[data-how='jamaat'] {
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--lume) 26%, transparent);
  }
  .check[data-how='late'] {
    border-style: dashed;
  }
  .check[data-how='late']::before {
    opacity: 0.72;
  }
  .leaving .check {
    border-color: var(--line-strong);
    box-shadow: none;
  }
  .leaving .check::before {
    transform: scale(0);
  }
  .leaving .check svg {
    stroke-dashoffset: 20;
  }
  .leaving .tile {
    transform: scale(0.94);
  }
</style>
