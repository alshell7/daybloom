<script lang="ts">
  import type { Snippet } from 'svelte';

  // A small countdown ring: the coloured arc is what's left, starting at 12 o'clock, so the
  // edge walks back toward 12 as time is spent (like the dial's remain ring). It steps with
  // the clock and never animates on its own.
  let {
    fraction,
    color = 'var(--ink)',
    size = 46,
    stroke = 4.5,
    tip = null,
    label,
    children,
  }: {
    fraction: number;
    color?: string;
    size?: number;
    stroke?: number;
    /** A short edge in another colour at the arc's end (free time tipped with what's next). */
    tip?: string | null;
    label?: string;
    children?: Snippet;
  } = $props();

  const r = $derived((size - stroke) / 2);
  const c = $derived(2 * Math.PI * r);
  const f = $derived(Math.max(0, Math.min(1, fraction)));
  const tipLen = $derived(Math.min(c * 0.03, c * f));
</script>

<span class="ring" style:width={`${size}px`} style:height={`${size}px`} role={label ? 'img' : undefined} aria-label={label}>
  <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
    <circle cx={size / 2} cy={size / 2} {r} fill="none" stroke="var(--line-strong)" stroke-width={stroke} />
    {#if f > 0}
      <circle
        cx={size / 2}
        cy={size / 2}
        {r}
        fill="none"
        stroke={color}
        stroke-width={stroke}
        stroke-linecap="round"
        stroke-dasharray={`${c * f} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      {#if tip}
        <circle
          cx={size / 2}
          cy={size / 2}
          {r}
          fill="none"
          stroke={tip}
          stroke-width={stroke}
          stroke-dasharray={`${tipLen} ${c}`}
          stroke-dashoffset={-(c * f - tipLen)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      {/if}
    {/if}
  </svg>
  {#if children}<span class="in tnum">{@render children()}</span>{/if}
</span>

<style>
  .ring {
    position: relative;
    display: inline-grid;
    place-items: center;
    flex: none;
  }
  svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }
  .in {
    position: relative;
    font-family: var(--font-ui);
    font-size: 11.5px;
    font-weight: 500;
    color: var(--ink);
    line-height: 1;
  }
</style>
