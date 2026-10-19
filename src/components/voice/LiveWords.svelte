<script lang="ts">
  // Words as Whistle hears them, laid over a text field while you dictate: each word settles in
  // from a soft blur, the tail it is still deciding on shimmers, and the line keeps the newest
  // words in view. The field gets the final text when you stop.
  import { cubicOut } from 'svelte/easing';
  import { view } from '../../lib/stores/view.svelte';
  import { voice } from '../../lib/voice/voice.svelte';

  let { placeholder = 'Listening…' }: { placeholder?: string } = $props();
  let line: HTMLSpanElement | undefined = $state();

  const reduced = $derived(view.reducedMotion);
  const quiet = $derived(!voice.words.length && !voice.pending);

  function rise(_node: Element) {
    return {
      duration: reduced ? 0 : 380,
      easing: cubicOut,
      css: (t: number) => `opacity:${t};transform:translateY(${(1 - t) * 6}px);filter:blur(${(1 - t) * 4}px)`,
    };
  }

  $effect(() => {
    void voice.words.length;
    void voice.pending;
    if (line) line.scrollLeft = line.scrollWidth;
  });
</script>

<span class="live" bind:this={line} aria-live="polite">
  {#if quiet}
    <span class="ph">{voice.warming ? 'Warming up… keep talking' : placeholder}</span>
  {:else}
    {#each voice.words as w (w.id)}<span class="w" in:rise>{w.text}</span>{/each}
    {#if voice.pending}<span class="w pending" class:still={reduced}>{voice.pending}</span>{/if}
  {/if}
</span>

<style>
  .live {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    gap: 0.28em;
    overflow: hidden;
    white-space: nowrap;
    pointer-events: none;
    font-size: var(--t-sm);
    color: var(--ink);
    scrollbar-width: none;
  }
  .w {
    flex: none;
    display: inline-block;
  }
  .ph {
    color: var(--ink-3);
  }
  /* The tail Whistle is still deciding on breathes softly (opacity only). */
  .pending {
    color: var(--ink-3);
    animation: deciding 1.1s ease-in-out infinite alternate;
  }
  .pending.still {
    animation: none;
  }
  @keyframes deciding {
    from {
      opacity: 0.55;
    }
    to {
      opacity: 1;
    }
  }
</style>
