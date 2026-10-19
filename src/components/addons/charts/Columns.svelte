<script lang="ts">
  // Columns over a time axis (days of a week or month). One series, one colour, so the
  // title names it and there's no legend box. The tallest column carries its value; every
  // column has a hover tip; columns grow from the baseline once, on first show.
  let {
    items,
    color = '#3D6FE3',
    format = (v: number) => String(v),
    height = 132,
    label = 'Chart',
    reduced = false,
  }: {
    items: { key: string; label: string; value: number; tip?: string; muted?: boolean }[];
    color?: string;
    format?: (v: number) => string;
    height?: number;
    label?: string;
    reduced?: boolean;
  } = $props();

  let w = $state(320);
  let hover = $state<number | null>(null);
  const top = 18;
  const axis = 18;
  const plotH = $derived(height - top - axis);
  const max = $derived(Math.max(1e-9, ...items.map((i) => i.value)));
  const maxIndex = $derived(items.findIndex((i) => i.value === max && i.value > 0));
  const band = $derived(items.length ? w / items.length : w);
  const barW = $derived(Math.min(24, Math.max(4, band * 0.62)));
  // Every label when they fit; otherwise every 2nd/5th/7th, plus the last.
  const every = $derived(band >= 26 ? 1 : band >= 13 ? 2 : band >= 6 ? 5 : 7);

  function bar(i: number, v: number) {
    const h = Math.max(v > 0 ? 3 : 0, (v / max) * plotH);
    const x = i * band + (band - barW) / 2;
    const y = top + plotH - h;
    const r = Math.min(4, h, barW / 2);
    return `M${x},${top + plotH} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + barW - r},${y} Q${x + barW},${y} ${x + barW},${y + r} L${x + barW},${top + plotH} Z`;
  }
</script>

<div class="cols" bind:clientWidth={w} style:height={`${height}px`}>
  <svg width={w} {height} role="img" aria-label={label}>
    <line class="base" x1="0" x2={w} y1={top + plotH + 0.5} y2={top + plotH + 0.5} />
    {#each items as it, i (it.key)}
      <g class="col" class:dim={hover !== null && hover !== i} style:--d={`${reduced ? 0 : i * 22}ms`}>
        <path d={bar(i, it.value)} fill={color} opacity={it.muted ? 0.45 : 1} class:grow={!reduced} />
        {#if i === maxIndex}
          <text class="cap tnum" x={i * band + band / 2} y={top + plotH - (it.value / max) * plotH - 5}>{format(it.value)}</text>
        {/if}
        {#if i % every === 0 || i === items.length - 1}
          <text class="tick" x={i * band + band / 2} y={height - 4}>{it.label}</text>
        {/if}
        <rect
          class="hit"
          x={i * band}
          y="0"
          width={band}
          height={height}
          role="presentation"
          onpointerenter={() => (hover = i)}
          onpointerleave={() => (hover = null)}
        />
      </g>
    {/each}
  </svg>
  {#if hover !== null && items[hover]}
    {@const it = items[hover]}
    <div class="tip tnum" style:left={`${Math.min(w - 8, Math.max(8, hover * band + band / 2))}px`}>
      <b>{format(it.value)}</b>{#if it.tip}<span>{it.tip}</span>{/if}
    </div>
  {/if}
</div>

<style>
  .cols {
    position: relative;
    width: 100%;
  }
  svg {
    display: block;
    overflow: visible;
  }
  .base {
    stroke: var(--line);
    stroke-width: 1;
  }
  .col path {
    transition: opacity 160ms ease;
  }
  .col.dim path {
    opacity: 0.45;
  }
  .grow {
    transform-box: fill-box;
    transform-origin: 50% 100%;
    animation: grow 620ms var(--ease-out) both;
    animation-delay: var(--d);
  }
  @keyframes grow {
    from {
      transform: scaleY(0);
    }
  }
  .cap {
    font-size: 11px;
    font-weight: 500;
    fill: var(--ink-2);
    text-anchor: middle;
  }
  .tick {
    font-size: 10.5px;
    fill: var(--ink-3);
    text-anchor: middle;
  }
  .hit {
    fill: transparent;
  }
  .tip {
    position: absolute;
    top: -6px;
    transform: translate(-50%, -100%);
    display: grid;
    gap: 1px;
    padding: 6px 9px;
    border-radius: 8px;
    background: var(--ink);
    color: var(--ink-inverse);
    font-size: var(--t-xs);
    white-space: nowrap;
    pointer-events: none;
    box-shadow: var(--shadow-2);
  }
  .tip span {
    opacity: 0.75;
  }
</style>
