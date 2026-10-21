<script lang="ts">
  // Alef's words in the widget's wing, appearing letter by letter (wing.ts plans the pace: a
  // breath after a comma, a longer one after a sentence). The whole line is laid out from the
  // start and the letters still to come wait unseen in place, so no word ever jumps to the next
  // line as it types. The letters step on animation frames only while there are letters left
  // (and the window is shown); with typing off, or in Calm motion, the words are there at once.
  // Alef's buttons (offers) come up when the words are done; thinking is three soft dots.
  import Icon from '../../lib/Icon.svelte';
  import type { Offer } from '../../lib/addons/alef/coach';
  import { typedLength, typingPlan } from './wing';

  let {
    text = '',
    offers = [],
    thinking = false,
    typing = true,
    speed = 45,
    reduced = false,
    delay = 220,
    onact,
    ontyped,
  }: {
    text?: string;
    offers?: Offer[];
    /** Alef is thinking: dots instead of words. */
    thinking?: boolean;
    typing?: boolean;
    /** Letters a second. */
    speed?: number;
    reduced?: boolean;
    /** Wait this long before the first letter (the wing is still opening). */
    delay?: number;
    onact?: (index: number) => void;
    /** Every letter is showing. */
    ontyped?: () => void;
  } = $props();

  const instant = $derived(!typing || reduced);
  const plan = $derived(typingPlan(text, speed));
  let shown = $state(0);
  let caret = $state<HTMLSpanElement>();

  $effect(() => {
    const p = plan;
    const t = text;
    if (thinking || !t) return;
    if (instant) {
      shown = t.length;
      ontyped?.();
      return;
    }
    shown = 0;
    let raf = 0;
    let start = 0;
    let lastScroll = 0;
    const step = (now: number) => {
      if (!start) start = now + delay;
      const n = typedLength(p, now - start);
      if (n !== shown) {
        shown = n;
        // In a scrolling wing, keep the newest line in view.
        if (n - lastScroll > 10) {
          lastScroll = n;
          caret?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
      }
      if (n < t.length) raf = requestAnimationFrame(step);
      else ontyped?.();
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  });

  const done = $derived(shown >= text.length);
</script>

{#if thinking}
  <p class="think"><span class="dots" class:still={reduced} role="status" aria-label="Alef is thinking"><i></i><i></i><i></i></span></p>
{:else}
  <p class="say" aria-hidden="true"><span>{text.slice(0, shown)}</span>{#if !done}<span class="caret" bind:this={caret}></span><span class="later">{text.slice(shown)}</span>{/if}</p>
  <span class="visually-hidden" role="status">{text}</span>
  {#if offers.length}
    <p class="offers" class:on={done}>
      {#each offers as o, i (o.id + i)}
        <button class="offer" tabindex={done ? 0 : -1} onclick={() => onact?.(i)}><Icon name={o.icon} size={11} stroke={2.3} />{o.label}</button>
      {/each}
    </p>
  {/if}
{/if}

<style>
  .say {
    font-size: 13px;
    line-height: 1.45;
    text-wrap: pretty;
  }
  .later {
    color: transparent;
  }
  /* A thin caret in Alef's colour while it types: still, no blinking loop. */
  .caret {
    display: inline-block;
    width: 2px;
    height: 1.05em;
    /* Takes no room: the lines wrap the same while typing as when done. */
    margin: 0 -3px 0 1px;
    border-radius: 1px;
    vertical-align: -0.14em;
    background: var(--accent);
  }
  .offers {
    margin-top: 7px !important;
    opacity: 0;
    transform: translateY(4px);
    transition:
      opacity var(--dur-3) var(--ease-out),
      transform var(--dur-3) var(--ease-out);
  }
  .offers.on {
    opacity: 1;
    transform: none;
  }
  .offer {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin: 2px 4px 2px 0;
    padding: 3px 9px 3px 7px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--ink) 18%, transparent);
    background: color-mix(in srgb, var(--ink) 7%, transparent);
    color: inherit;
    font-size: 11.5px;
    line-height: 1.3;
    vertical-align: middle;
    transition: background var(--dur-1) var(--ease-out);
  }
  .offer:hover {
    background: color-mix(in srgb, var(--ink) 14%, transparent);
  }
  .offer:active {
    transform: scale(0.96);
  }
  .think {
    line-height: 20px;
  }
  .dots {
    display: inline-flex;
    gap: 5px;
    padding: 0 2px;
    vertical-align: middle;
  }
  .dots i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent);
    opacity: 0.35;
    animation: dot 1.1s ease-in-out infinite;
  }
  .dots i:nth-child(2) {
    animation-delay: 0.15s;
  }
  .dots i:nth-child(3) {
    animation-delay: 0.3s;
  }
  .dots.still i {
    animation: none;
  }
  .dots.still i:nth-child(2) {
    opacity: 0.6;
  }
  .dots.still i:nth-child(3) {
    opacity: 0.85;
  }
  @keyframes dot {
    40% {
      opacity: 1;
      transform: translateY(-3px);
    }
  }
</style>
