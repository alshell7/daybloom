<script lang="ts">
  // The breathing guide in the dial's face: a soft orb of light that fills as you breathe in,
  // stays full while you hold, and empties slowly on the long breath out; a faint ring ripples
  // outward as each breath begins. Transform and opacity only (compositor-friendly), driven by
  // the Web Animations API from the shared rhythm and started where the minute is now, so it
  // and the words never drift apart. Under Calm it holds still and the words lead.
  import { onMount } from 'svelte';
  import { cubicOut } from 'svelte/easing';
  import { fade } from 'svelte/transition';
  import { CYCLE_MS, phaseEnds, ROUNDS } from '../breath.svelte';
  import { clock } from '../stores/clock.svelte';

  let { startAt, color, dark = false, reduced = false }: { startAt: number; color: string; dark?: boolean; reduced?: boolean } = $props();

  let halo: HTMLDivElement | undefined = $state();
  let core: HTMLDivElement | undefined = $state();
  let ripple: HTMLDivElement | undefined = $state();

  onMount(() => {
    if (reduced || !halo || !core || !ripple || typeof halo.animate !== 'function') return;
    const e = phaseEnds();
    // In: a gentle start that fills smoothly and settles as the lungs are full. Hold: a touch
    // of continued fullness, never a hard stop. Out: long and even, with a soft landing.
    const IN = 'cubic-bezier(0.33, 0, 0.2, 1)';
    const HOLD = 'cubic-bezier(0.45, 0, 0.55, 1)';
    const OUT = 'cubic-bezier(0.42, 0.04, 0.36, 1)';
    const opts: KeyframeAnimationOptions = { duration: CYCLE_MS, iterations: ROUNDS, fill: 'both' };
    const anims = [
      core.animate(
        [
          { offset: 0, transform: 'scale(0.56)', opacity: 0.5, easing: IN },
          { offset: e.in, transform: 'scale(1)', opacity: 1, easing: HOLD },
          { offset: e.hold, transform: 'scale(1.03)', opacity: 1, easing: OUT },
          { offset: e.out, transform: 'scale(0.56)', opacity: 0.5 },
          { offset: 1, transform: 'scale(0.55)', opacity: 0.46 },
        ],
        opts,
      ),
      halo.animate(
        [
          { offset: 0, transform: 'scale(0.5)', opacity: 0.25, easing: IN },
          { offset: e.in, transform: 'scale(1)', opacity: 0.9, easing: HOLD },
          { offset: e.hold, transform: 'scale(1.06)', opacity: 0.8, easing: OUT },
          { offset: e.out, transform: 'scale(0.5)', opacity: 0.25 },
          { offset: 1, transform: 'scale(0.48)', opacity: 0.2 },
        ],
        opts,
      ),
      ripple.animate(
        [
          { offset: 0, transform: 'scale(0.55)', opacity: 0 },
          { offset: 0.03, transform: 'scale(0.62)', opacity: 0.55, easing: 'cubic-bezier(0.2, 0.6, 0.3, 1)' },
          { offset: e.in + 0.06, transform: 'scale(1.32)', opacity: 0 },
          { offset: 1, transform: 'scale(1.32)', opacity: 0 },
        ],
        opts,
      ),
    ];
    // Join the minute where it is (e.g. after the window was hidden).
    const into = Math.max(0, Date.now() + clock.offset - startAt);
    for (const a of anims) a.currentTime = into;
    return () => anims.forEach((a) => a.cancel());
  });
</script>

<div class="orb" class:still={reduced} class:dark style:--c={color} aria-hidden="true" transition:fade={{ duration: reduced ? 0 : 900, easing: cubicOut }}>
  <div class="halo" bind:this={halo}></div>
  <div class="ripple" bind:this={ripple}></div>
  <div class="core" bind:this={core}></div>
</div>

<style>
  .orb {
    position: absolute;
    left: 19%;
    top: 19%;
    width: 62%;
    height: 62%;
    pointer-events: none;
  }
  .halo,
  .core,
  .ripple {
    position: absolute;
    border-radius: 50%;
    will-change: transform, opacity;
  }
  /* Light, not paint: a wide glow with no edge… */
  .halo {
    inset: 0;
    background: radial-gradient(
      circle,
      color-mix(in srgb, var(--c) 30%, transparent) 0%,
      color-mix(in srgb, var(--c) 14%, transparent) 40%,
      color-mix(in srgb, var(--c) 5%, transparent) 58%,
      transparent 70%
    );
    opacity: 0.25;
    transform: scale(0.5);
  }
  /* …and a soft sphere, lit from above-left, whose rim fades into the face. */
  .core {
    inset: 19%;
    background: radial-gradient(
      circle at 40% 34%,
      color-mix(in srgb, var(--c) 20%, white) 0%,
      color-mix(in srgb, var(--c) 34%, transparent) 46%,
      color-mix(in srgb, var(--c) 18%, transparent) 64%,
      transparent 71%
    );
    opacity: 0.5;
    transform: scale(0.56);
  }
  .dark .core {
    background: radial-gradient(
      circle at 40% 34%,
      color-mix(in srgb, var(--c) 46%, transparent) 0%,
      color-mix(in srgb, var(--c) 30%, transparent) 46%,
      color-mix(in srgb, var(--c) 14%, transparent) 64%,
      transparent 71%
    );
  }
  .ripple {
    inset: 21%;
    box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--c) 55%, transparent);
    opacity: 0;
    transform: scale(0.55);
  }
  /* Calm: a still glow; the words carry the rhythm. */
  .still .halo {
    opacity: 0.6;
    transform: scale(0.85);
  }
  .still .core {
    opacity: 0.8;
    transform: scale(0.8);
  }
</style>
