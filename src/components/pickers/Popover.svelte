<script lang="ts">
  // A small floating card anchored to a field: it lives on <body> (so panels that scroll or
  // clip never cut it), opens below the field or above when there is no room, follows it on
  // scroll, and closes on Escape or a click outside.
  import type { Snippet } from 'svelte';
  import { onMount } from 'svelte';
  import { cubicOut } from 'svelte/easing';
  import { scale } from 'svelte/transition';
  import { view } from '../../lib/stores/view.svelte';

  let {
    anchor,
    onclose,
    children,
    label,
    width = 300,
  }: { anchor: HTMLElement; onclose: () => void; children: Snippet; label: string; width?: number } = $props();

  let card = $state<HTMLDivElement>();
  let pos = $state({ x: 0, y: 0, up: false });

  function place() {
    if (!card) return;
    const r = anchor.getBoundingClientRect();
    const h = card.offsetHeight;
    const w = Math.min(width, innerWidth - 16);
    const below = innerHeight - r.bottom - 8;
    const up = below < h + 8 && r.top > below;
    const x = Math.min(Math.max(8, r.left), innerWidth - w - 8);
    const y = up ? Math.max(8, r.top - h - 6) : Math.min(r.bottom + 6, innerHeight - h - 8);
    pos = { x, y, up };
  }

  /** Move the card to <body>, out of any clipping or transformed parent. */
  function portal(node: HTMLElement) {
    document.body.append(node);
    return { destroy: () => node.remove() };
  }

  onMount(() => {
    place();
    const ro = new ResizeObserver(place);
    if (card) ro.observe(card);
    const onScroll = () => place();
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (card?.contains(t) || anchor.contains(t)) return;
      onclose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onclose();
        anchor.focus();
      }
    };
    addEventListener('scroll', onScroll, true);
    addEventListener('resize', onScroll);
    addEventListener('pointerdown', onDown, true);
    addEventListener('keydown', onKey, true);
    return () => {
      ro.disconnect();
      removeEventListener('scroll', onScroll, true);
      removeEventListener('resize', onScroll);
      removeEventListener('pointerdown', onDown, true);
      removeEventListener('keydown', onKey, true);
    };
  });
</script>

<div
  class="pop"
  class:up={pos.up}
  role="dialog"
  aria-label={label}
  bind:this={card}
  use:portal
  style:left={`${pos.x}px`}
  style:top={`${pos.y}px`}
  style:width={`${Math.min(width, innerWidth - 16)}px`}
  transition:scale={{ start: 0.96, duration: view.reducedMotion ? 0 : 180, easing: cubicOut, opacity: 0 }}
>
  {@render children()}
</div>

<style>
  .pop {
    position: fixed;
    z-index: 200;
    padding: 12px;
    border-radius: var(--r-lg);
    background: var(--raised);
    border: 1px solid var(--line);
    box-shadow: var(--shadow-3);
    transform-origin: top left;
    font-family: var(--font-ui);
    color: var(--ink);
  }
  .pop.up {
    transform-origin: bottom left;
  }
</style>
