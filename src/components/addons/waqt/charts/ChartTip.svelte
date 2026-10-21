<script lang="ts">
  // A chart's hover and focus tip: the value leads, the words follow. It sits above its
  // target (or beside it), and always inside the chart's width. Screen readers get the same
  // words from the focused mark's own label, so the tip itself stays quiet.
  import type { Snippet } from 'svelte';
  import type { Box } from './kinds';

  let { box, place = 'above', children }: { box: Box; place?: 'above' | 'beside'; children: Snippet } = $props();

  let w = $state(0);
  const left = $derived.by(() => {
    if (place === 'beside') return box.x2 + 8 + w <= box.width ? box.x2 + 8 : Math.max(0, box.x1 - 8 - w);
    return Math.min(Math.max(0, (box.x1 + box.x2) / 2 - w / 2), Math.max(0, box.width - w));
  });
</script>

<div class="tip tnum" class:beside={place === 'beside'} aria-hidden="true" bind:offsetWidth={w} style:left={`${left}px`} style:top={`${place === 'beside' ? box.mid : box.top}px`}>
  {@render children()}
</div>

<style>
  .tip {
    position: absolute;
    z-index: 3;
    display: grid;
    gap: 2px;
    min-width: 0;
    max-width: 240px;
    padding: 7px 10px;
    border-radius: 9px;
    background: var(--ink);
    color: var(--ink-inverse);
    font-size: var(--t-xs);
    line-height: 1.35;
    white-space: nowrap;
    pointer-events: none;
    box-shadow: var(--shadow-2);
    transform: translateY(calc(-100% - 7px));
    animation: tip-in 140ms var(--ease-out) both;
  }
  .tip.beside {
    transform: translateY(-50%);
  }
  .tip :global(b) {
    font-weight: 500;
    font-size: var(--t-sm);
  }
  .tip :global(.dim) {
    opacity: 0.72;
  }
  /* A row with a short line key in the kind's colour. */
  .tip :global(.k) {
    display: grid;
    grid-template-columns: 10px auto 1fr;
    align-items: center;
    gap: 7px;
  }
  .tip :global(.k i) {
    width: 10px;
    height: 4px;
    border-radius: 2px;
    /* Keeps the darkest steps visible on the ink tip. */
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--ink-inverse) 30%, transparent);
  }
  .tip :global(.k em) {
    font-style: normal;
    opacity: 0.72;
    text-align: right;
    padding-left: 10px;
  }
  @keyframes tip-in {
    from {
      opacity: 0;
    }
  }
  :global([data-motion='calm']) .tip {
    animation: none;
  }
</style>
