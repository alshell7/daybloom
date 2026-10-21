<script lang="ts">
  // One card on the board (Timeline views addon): the block's colour along its edge, its icon,
  // title, time and a small ring for its length (a full ring is an hour, like the Hour dial;
  // while it runs the ring shows the time left). Calendar events are clear glass and salah is
  // soft light, both with a lock: they show where your time goes, but never move. Just the
  // look; BoardView drags it.
  import type { Card } from '../../../lib/addons/views/board';
  import { categoryColor, inkOn, mix, onColor } from '../../../lib/engine/categories';
  import { formatDuration, formatTime, MINUTE } from '../../../lib/engine/time';
  import Icon from '../../../lib/Icon.svelte';
  import { view } from '../../../lib/stores/view.svelte';

  let { card, now, ghost = false, onopen }: { card: Card; now: number; ghost?: boolean; onopen?: () => void } = $props();

  const b = $derived(card.block);
  const dark = $derived(view.dark);
  const color = $derived(b && b.kind === 'event' ? (b.event?.category ? categoryColor(b.event.category, dark) : b.color) : categoryColor(card.category, dark));
  const soft = $derived(mix(color, dark ? '#131a27' : '#ffffff', 0.8));
  const ink = $derived(inkOn(soft, color));
  const fg = $derived(onColor(color));
  const prayer = $derived(b?.event?.provider === 'salah');
  const len = $derived(card.minutes * MINUTE);
  const left = $derived(card.live && card.endMs ? Math.max(0, card.endMs - now) : 0);
  /** Ring: an hour is a full turn; a running block shows what is left of it. */
  const ring = $derived(card.live && card.startMs !== null && card.endMs ? left / Math.max(MINUTE, card.endMs - card.startMs) : Math.min(1, card.minutes / 60));
  const elapsed = $derived(card.live && card.startMs !== null && card.endMs ? Math.min(1, Math.max(0.03, (now - card.startMs) / (card.endMs - card.startMs))) : 0);
  const LIST: Record<string, string> = { inbox: 'Inbox', next: 'Next', someday: 'Someday' };

  const when = $derived.by(() => {
    if (card.locked && b?.floating) return 'All day';
    if (card.anytime) return 'Anytime';
    if (card.startMs === null || card.endMs === null) return '';
    return formatTime(card.startMs, view.hour12);
  });
  /** The end time, dropped on a narrow card (the length still says it). */
  const until = $derived(card.startMs !== null && card.endMs !== null && !card.anytime ? `–${formatTime(card.endMs, view.hour12)}` : '');
  const howLong = $derived(card.live ? `${formatDuration(left)} left` : card.minutes ? formatDuration(len) : '');
  const source = $derived(b?.event ? (prayer ? 'Salah' : (b.event.calendarName ?? 'Calendar')) : null);
  const label = $derived(
    [card.title || 'Untitled block', `${when}${until}`, howLong, card.locked ? `${source}, read-only` : card.done ? 'done' : ''].filter(Boolean).join(', '),
  );
</script>

<!-- Keys are the board's (Enter opens, Space ticks, arrows move): see BoardView. -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  class="card"
  onclick={onopen}
  class:ghost
  class:locked={card.locked}
  class:skipped={!!b?.skipped}
  class:prayer
  class:done={card.done}
  class:live={card.live}
  class:earlier={card.earlier}
  style:--c={color}
  style:--c-soft={soft}
  style:--c-ink={ink}
  style:--fg={fg}
  style:--p={elapsed}
  data-card={ghost ? undefined : card.id}
  data-fly={ghost ? undefined : card.fly}
  data-genie={ghost ? undefined : `block:${card.key ?? card.id}`}
  role="button"
  tabindex={ghost ? -1 : 0}
  aria-label={label}
  aria-roledescription="card"
>
  <span class="tile" data-genie-anchor aria-hidden="true">
    <Icon name={card.done ? 'check' : card.icon} size={15} stroke={card.done ? 2.6 : 2} />
  </span>
  <span class="text">
    <span class="title"><span class="t">{card.title || 'Untitled block'}</span></span>
    <span class="meta tnum">
      {#if card.minutes && !card.locked}
        <svg class="ring" viewBox="0 0 14 14" aria-hidden="true">
          <circle cx="7" cy="7" r="5.25" class="track" />
          <circle cx="7" cy="7" r="5.25" class="arc" pathLength="100" style:stroke-dashoffset={100 - ring * 100} />
        </svg>
      {/if}
      {#if when}<span class="when">{when}{#if until}<span class="until">{until}</span>{/if}</span>{/if}
      {#if when && howLong}<span class="sep">·</span>{/if}
      {#if howLong}<span class:left={card.live}>{howLong}</span>{/if}
      {#if card.list && !card.done}<span class="sep">·</span><span>{LIST[card.list] ?? ''}</span>{/if}
      {#if b?.recurring && !card.locked}<span class="glyph" title="Repeats"><Icon name="repeat" size={11} /></span>{/if}
    </span>
    {#if source}
      <span class="src"><Icon name={prayer ? 'moon' : 'calendar'} size={11} stroke={2.2} />{source}</span>
    {/if}
  </span>
  {#if card.locked}
    <span class="lock" title="From {source ?? 'your calendar'} · read-only"><Icon name="lock" size={12} stroke={2.2} /></span>
  {/if}
  {#if card.live}<span class="bar" aria-hidden="true"></span>{/if}
</div>

<style>
  .card {
    position: relative;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: start;
    gap: 10px;
    padding: 9px 12px 9px 12px;
    border-radius: 12px;
    background: var(--raised);
    /* The kind's colour along the left edge; a hairline for the rest. */
    box-shadow:
      inset 3px 0 0 var(--c),
      inset 0 0 0 1px var(--line),
      var(--shadow-1);
    cursor: grab;
    user-select: none;
    -webkit-user-select: none;
    touch-action: none;
    overflow: hidden;
    transition:
      box-shadow var(--dur-2) var(--ease-out),
      transform var(--dur-2) var(--ease-settle),
      background var(--dur-2) var(--ease-out);
  }
  .card:hover {
    transform: translateY(-1px);
    box-shadow:
      inset 3px 0 0 var(--c),
      inset 0 0 0 1px var(--line-strong),
      var(--shadow-2);
  }
  .card:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }
  .tile {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 9px;
    background: var(--c-soft);
    color: var(--c-ink);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c) 28%, transparent);
    transition:
      background var(--dur-3) var(--ease-out),
      color var(--dur-3) var(--ease-out);
  }
  .text {
    display: grid;
    gap: 3px;
    min-width: 0;
    padding-top: 1px;
  }
  .title {
    font-family: var(--font-read);
    font-size: 13.5px;
    font-weight: 500;
    line-height: 1.3;
    color: var(--ink);
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow-wrap: anywhere;
  }
  /* The strike draws itself left to right once a card is done. */
  .t {
    background: linear-gradient(currentColor, currentColor) no-repeat 0 58% / 0% 1.5px;
    -webkit-box-decoration-break: clone;
    box-decoration-break: clone;
    transition:
      background-size 0.5s var(--ease-out) 0.15s,
      color var(--dur-3) var(--ease-out);
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px 5px;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .sep {
    opacity: 0.6;
  }
  .left {
    color: var(--ink-2);
  }
  .glyph {
    display: inline-grid;
  }
  .ring {
    width: 13px;
    height: 13px;
    flex: none;
    transform: rotate(-90deg);
  }
  .ring circle {
    fill: none;
    stroke-width: 2.4;
  }
  .ring .track {
    stroke: var(--line-strong);
  }
  .ring .arc {
    stroke: var(--c);
    stroke-dasharray: 100 100;
    stroke-linecap: round;
    transition: stroke-dashoffset 0.9s var(--ease-out);
  }
  .src {
    justify-self: start;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    max-width: 100%;
    font-size: var(--t-xs);
    color: var(--c-ink);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .lock {
    position: absolute;
    top: 10px;
    right: 11px;
    color: color-mix(in srgb, var(--c) 60%, var(--ink-3));
  }

  /* Running: the tile fills with the colour, and a thin level runs along the foot. */
  .live .tile {
    background: var(--c);
    color: var(--fg);
    box-shadow: none;
  }
  .bar {
    position: absolute;
    left: 3px;
    right: 0;
    bottom: 0;
    height: 3px;
    background: var(--c);
    opacity: 0.85;
    transform-origin: left;
    transform: scaleX(var(--p));
    transition: transform 0.9s var(--ease-out);
  }
  .live {
    background: color-mix(in srgb, var(--c) 6%, var(--raised));
  }

  /* Done: the check, a lume ring on the tile, and the strike. */
  .done {
    background: color-mix(in srgb, var(--raised) 55%, transparent);
    box-shadow:
      inset 3px 0 0 color-mix(in srgb, var(--c) 45%, transparent),
      inset 0 0 0 1px var(--line);
  }
  .done .tile {
    background: color-mix(in srgb, var(--lume) 14%, var(--raised));
    color: color-mix(in srgb, var(--lume) 70%, var(--ink));
    box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--lume) 70%, transparent);
  }
  .done .t {
    color: var(--ink-3);
    background-size: 100% 1.5px;
  }

  /* Its time went by: the words step back, the edge thins. Nothing turns red. */
  .earlier {
    box-shadow:
      inset 3px 0 0 color-mix(in srgb, var(--c) 40%, transparent),
      inset 0 0 0 1px var(--line),
      var(--shadow-1);
  }
  .earlier .title {
    color: var(--ink-2);
  }

  /* From a calendar: glass, locked, never dragged. It lies flat on the board (no shadow: it
     can't be picked up), a clear pane with one crisp edge in its colour. */
  .locked {
    cursor: default;
    padding-right: 28px;
    background: color-mix(in srgb, var(--c) 5%, var(--surface));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c) 62%, transparent);
  }
  .locked:hover {
    transform: none;
    box-shadow: inset 0 0 0 1px var(--c);
  }
  .locked .title {
    font-weight: 400;
  }
  .locked .tile,
  .locked.live .tile {
    background: transparent;
    color: var(--c-ink);
    box-shadow: inset 0 0 0 1.5px var(--c);
  }
  /* Salah: soft light instead of glass. A glow that rises from its tile and fades across the
     card, with no edge. */
  .locked.prayer {
    background:
      radial-gradient(ellipse 70% 140% at 0% 50%, color-mix(in srgb, var(--c) 16%, transparent), transparent 72%),
      color-mix(in srgb, var(--c) 3%, var(--surface));
    box-shadow: inset 0 0 0 1px var(--line);
  }
  .locked.prayer:hover {
    box-shadow: inset 0 0 0 1px var(--line-strong);
  }
  .locked.prayer .tile {
    background: radial-gradient(circle at 50% 32%, color-mix(in srgb, var(--c) 46%, transparent), color-mix(in srgb, var(--c) 14%, transparent));
    box-shadow: none;
  }
  /* Skipped: only a faint outline of where it was (its time is free), the words crossed. */
  .locked.skipped {
    background: transparent;
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c) 34%, transparent);
  }
  .locked.skipped .tile {
    opacity: 0.5;
    box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--c) 50%, transparent);
  }
  .locked.skipped .t {
    color: var(--ink-3);
    background-size: 100% 1.5px;
  }
  .locked.done .tile {
    background: color-mix(in srgb, var(--lume) 14%, var(--raised));
    color: color-mix(in srgb, var(--lume) 70%, var(--ink));
    box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--lume) 70%, transparent);
  }

  /* Held: lifted off the board. */
  .ghost {
    cursor: grabbing;
    box-shadow:
      inset 3px 0 0 var(--c),
      inset 0 0 0 1px var(--line-strong),
      var(--shadow-3);
  }

  /* Narrow columns: a tighter card. */
  :global(.board.compact) .card {
    gap: 8px;
    padding: 8px 10px;
  }
  :global(.board.compact) .until {
    display: none;
  }
  :global(.board.compact) .tile {
    width: 24px;
    height: 24px;
    border-radius: 8px;
  }
  :global(.board.compact) .ring {
    display: none;
  }
</style>
