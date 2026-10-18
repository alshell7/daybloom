<script lang="ts">
  import { view } from '../lib/stores/view.svelte';

  // Completion sparks: a ring pulse plus a few motes that drift up and fade.
  // Deterministic per spark so re-renders don't reshuffle them mid-flight.
  function motes(id: number, big = false) {
    const n = big ? 14 : 8;
    let seed = Math.floor(id * 1e9);
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    return Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.6;
      const d = 22 + rnd() * (big ? 46 : 26);
      return { x: Math.cos(a) * d, y: Math.sin(a) * d - 10 - rnd() * 14, s: 3 + rnd() * 4, delay: rnd() * 60 };
    });
  }
</script>

{#if !view.reducedMotion}
  <div class="layer" aria-hidden="true">
    {#each view.sparks as sp (sp.id)}
      <div class="spark" style:left={`${sp.x}px`} style:top={`${sp.y}px`} style:--c={sp.color}>
        <span class="ring"></span>
        {#if sp.label}<span class="score tnum">{sp.label}</span>{/if}
        {#each motes(sp.id, sp.big) as m, i (i)}
          <span class="mote" style:--x={`${m.x}px`} style:--y={`${m.y}px`} style:--s={`${m.s}px`} style:animation-delay={`${m.delay}ms`}></span>
        {/each}
      </div>
    {/each}
  </div>
{/if}

<style>
  .layer {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 60;
  }
  .spark {
    position: absolute;
    width: 0;
    height: 0;
  }
  .ring {
    position: absolute;
    left: -16px;
    top: -16px;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 2px solid var(--c);
    animation: ring 0.6s var(--ease-out) forwards;
  }
  @keyframes ring {
    from {
      transform: scale(0.6);
      opacity: 0.9;
    }
    to {
      transform: scale(2.1);
      opacity: 0;
    }
  }
  .score {
    position: absolute;
    left: 0;
    top: -12px;
    transform: translateX(-50%);
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--c);
    color: white;
    font-family: var(--font-ui);
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
    box-shadow: 0 4px 12px -4px var(--c);
    animation: score 1.3s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
  }
  @keyframes score {
    0% {
      transform: translate(-50%, 6px) scale(0.6);
      opacity: 0;
    }
    18% {
      transform: translate(-50%, -14px) scale(1.08);
      opacity: 1;
    }
    70% {
      transform: translate(-50%, -30px) scale(1);
      opacity: 1;
    }
    100% {
      transform: translate(-50%, -44px) scale(0.96);
      opacity: 0;
    }
  }
  .mote {
    position: absolute;
    left: calc(var(--s) / -2);
    top: calc(var(--s) / -2);
    width: var(--s);
    height: var(--s);
    border-radius: 50%;
    background: var(--c);
    opacity: 0;
    animation: mote 0.95s cubic-bezier(0.2, 0.7, 0.3, 1) forwards;
  }
  @keyframes mote {
    0% {
      transform: translate(0, 0) scale(0.4);
      opacity: 1;
    }
    60% {
      opacity: 0.9;
    }
    100% {
      transform: translate(var(--x), calc(var(--y) - 12px)) scale(1);
      opacity: 0;
    }
  }
</style>
