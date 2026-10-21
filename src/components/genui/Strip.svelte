<script lang="ts">
  // A stretch of a day as one thin bar (used by DayStrip and FreeSlots): taken time in its
  // category colours (calendar time striped, finished time rimmed in lume), free time bare
  // with a dotted hairline, and the now line in signal. Static: it redraws when the data
  // changes, never animates on its own.
  import type { Block } from '../../lib/engine/types';
  import { fmt, type Span } from '../../lib/ai/genui/act';

  let {
    span,
    blocks,
    gaps,
    nowMs = null,
    picked = null,
    lit = null,
    onpick,
  }: {
    span: Span;
    blocks: Block[];
    gaps: Span[];
    nowMs?: number | null;
    /** Blocks to pick out; the rest fade. */
    picked?: Set<string> | null;
    /** Free stretches to pick out (the ones long enough). */
    lit?: Set<number> | null;
    onpick?: (key: string) => void;
  } = $props();

  const len = $derived(Math.max(60_000, span.endMs - span.startMs));
  const pct = (ms: number) => `${(Math.max(0, Math.min(1, (ms - span.startMs) / len)) * 100).toFixed(2)}%`;
  const width = (s: Span) => `calc(${pct(s.endMs)} - ${pct(s.startMs)})`;
  const shown = $derived(blocks.filter((b) => !b.floating && b.endMs > span.startMs && b.startMs < span.endMs));
</script>

<div class="strip" role="img" aria-label={`${fmt(span.startMs)} to ${fmt(span.endMs)}: ${shown.length} planned, ${gaps.length} free`}>
  {#each gaps as g (g.startMs)}
    <span class="gap" class:lit={lit?.has(g.startMs)} style:left={pct(g.startMs)} style:width={width(g)}></span>
  {/each}
  {#each shown as b (b.key)}
    <button
      class="busy"
      class:done={b.done}
      class:cal={b.readOnly}
      class:faded={!!picked && !picked.has(b.key)}
      style:--c={b.color}
      style:left={pct(b.startMs)}
      style:width={width(b)}
      title={`${b.title || 'Untitled'} · ${fmt(b.startMs)}–${fmt(b.endMs)}`}
      tabindex="-1"
      onclick={() => onpick?.(b.key)}
      aria-hidden="true"
    ></button>
  {/each}
  {#if nowMs !== null && nowMs > span.startMs && nowMs < span.endMs}
    <span class="now" style:left={pct(nowMs)}></span>
  {/if}
</div>
<div class="ends"><span>{fmt(span.startMs)}</span><span>{fmt(span.endMs)}</span></div>

<style>
  .strip {
    position: relative;
    height: 20px;
    border-radius: var(--r-pill);
    background: var(--sunken);
    overflow: hidden;
  }
  .busy {
    position: absolute;
    top: 3px;
    bottom: 3px;
    min-width: 3px;
    padding: 0;
    border-radius: 6px;
    background: var(--c);
    /* A 2px surface gap keeps neighbours apart without drawing a border. */
    box-shadow: 0 0 0 1px var(--sunken);
    cursor: pointer;
    transition: opacity var(--dur-2) var(--ease-out);
  }
  .busy.done {
    background: color-mix(in srgb, var(--c) 50%, var(--surface));
    box-shadow:
      0 0 0 1px var(--sunken),
      inset 0 0 0 1.5px var(--lume);
  }
  /* From a calendar: striped, read-only. */
  /* A calendar event: clear glass with one crisp edge (never a texture). */
  .busy.cal {
    background: color-mix(in srgb, var(--c) 22%, var(--surface));
    box-shadow: inset 0 0 0 1.5px var(--c);
  }
  .busy.faded {
    opacity: 0.32;
  }
  /* Free time stays bare: a dotted hairline, never a fill. */
  .gap {
    position: absolute;
    top: 50%;
    height: 0;
    border-top: 2px dotted var(--line-strong);
  }
  .gap.lit {
    border-top-color: var(--ink-3);
  }
  .now {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    margin-left: -1px;
    border-radius: 1px;
    background: var(--signal);
  }
  .ends {
    display: flex;
    justify-content: space-between;
    margin-top: -4px;
    font-size: var(--t-xs);
    color: var(--ink-3);
    font-variant-numeric: tabular-nums;
  }
</style>
