<script lang="ts">
  import { cubicOut } from 'svelte/easing';
  import { fade } from 'svelte/transition';
  import { attention } from '../native/attention.svelte';

  // Text whose characters roll like an odometer when they change. When the text
  // changes shape (e.g. "1h" → "25:00") the whole readout crossfades instead.
  // On a phone nobody is looking at, they just change (a countdown would roll every second).
  let { text, reduced: reducedMotion = false }: { text: string; reduced?: boolean } = $props();
  const reduced = $derived(reducedMotion || !attention.looking);
  const chars = $derived([...text]);
  const shape = $derived(text.replace(/\d/g, '0'));

  function roll(node: Element, { dir }: { dir: 1 | -1 }) {
    if (reduced) return { duration: 0 };
    return {
      duration: 420,
      easing: cubicOut,
      css: (t: number, u: number) => `transform: translateY(${dir * u * 55}%); opacity: ${t}; filter: blur(${u * 2}px)`,
    };
  }
</script>

<span class="visually-hidden">{text}</span>
<span class="stack" aria-hidden="true">
  {#key shape}
    <span class="rolling" transition:fade={{ duration: reduced ? 0 : 260 }}>
      {#each chars as ch, i (i)}
        <span class="slot">
          {#key ch}
            <span class="ch" in:roll={{ dir: 1 }} out:roll={{ dir: -1 }}>{ch === ' ' ? ' ' : ch}</span>
          {/key}
        </span>
      {/each}
    </span>
  {/key}
</span>

<style>
  .stack {
    display: inline-grid;
  }
  .rolling {
    grid-area: 1 / 1;
    display: inline-flex;
    justify-content: center;
    font-variant-numeric: tabular-nums;
  }
  .slot {
    display: inline-grid;
    overflow: hidden;
    padding: 0.06em 0;
    margin: -0.06em 0;
  }
  .ch {
    grid-area: 1 / 1;
    display: inline-block;
  }
</style>
