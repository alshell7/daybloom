<script lang="ts">
  // The voice, drawn like time: a bezel of ticks around a small core. While listening, the
  // newest loudness enters at 12 o'clock and the last second travels clockwise, fading. Waiting
  // shimmers, thinking sweeps a hand, a download lights the ticks in order like a filling dial.
  // Only transform and opacity change per frame.
  import Icon from '../../lib/Icon.svelte';
  import { RING } from '../../lib/voice/voice.svelte';

  type Mode = 'idle' | 'listening' | 'opening' | 'thinking' | 'progress' | 'done' | 'error';

  let {
    size = 56,
    mode = 'idle',
    ring = [],
    level = 0,
    progress = 0,
    color = 'currentColor',
    speaking = false,
    icon = 'mic',
    reduced = false,
  }: {
    size?: number;
    mode?: Mode;
    ring?: number[];
    level?: number;
    progress?: number;
    color?: string;
    speaking?: boolean;
    icon?: string;
    reduced?: boolean;
  } = $props();

  const ticks = Array.from({ length: RING }, (_, i) => i);
  const lit = $derived(Math.round(progress * RING));

  function scale(i: number): number {
    if (mode === 'listening') return 0.18 + 0.82 * (ring[i] ?? 0);
    if (mode === 'progress') return i < lit ? 1 : 0.22;
    if (mode === 'done') return 0.55;
    return 0.22;
  }
  function alpha(i: number): number {
    if (mode === 'listening') return 1 - (i / RING) * 0.72;
    if (mode === 'progress') return i < lit ? 1 : 0.28;
    if (mode === 'done') return 0.9;
    return 0.38;
  }
</script>

<span
  class="vr {mode}"
  class:speaking
  class:reduced
  style:--size={`${size}px`}
  style:--c={color}
  aria-hidden="true"
>
  <span class="ticks">
    {#each ticks as i (i)}
      <span class="tick" style:transform={`rotate(${i * (360 / RING)}deg)`}>
        <i style:transform={`scaleY(${scale(i)})`} style:opacity={alpha(i)}></i>
      </span>
    {/each}
  </span>
  {#if mode === 'thinking' || mode === 'opening'}<span class="sweep"></span>{/if}
  <span class="core" style:transform={mode === 'listening' ? `scale(${1 + level * 0.16})` : undefined}>
    <Icon name={icon} size={Math.round(size * 0.3)} stroke={2.1} />
  </span>
</span>

<style>
  .vr {
    --tick-h: calc(var(--size) * 0.16);
    position: relative;
    display: inline-grid;
    place-items: center;
    width: var(--size);
    height: var(--size);
    flex: none;
    color: var(--c);
  }
  .ticks {
    position: absolute;
    inset: 0;
  }
  .tick {
    position: absolute;
    left: 50%;
    top: 0;
    width: 2px;
    height: 50%;
    margin-left: -1px;
    transform-origin: 50% 100%;
  }
  .tick i {
    display: block;
    width: 2px;
    height: var(--tick-h);
    border-radius: 2px;
    background: var(--c);
    transform-origin: 50% 0;
    transition: opacity 160ms linear;
  }
  /* Settled states ease between shapes; live listening is set every frame, so no transition. */
  .vr:not(.listening) .tick i {
    transition:
      transform 420ms var(--ease-out),
      opacity 300ms var(--ease-out);
  }
  .progress .tick i {
    transition-duration: 180ms;
  }
  .core {
    position: relative;
    display: grid;
    place-items: center;
    width: 58%;
    height: 58%;
    border-radius: 50%;
    background: var(--c);
    color: var(--core-ink, var(--ink-inverse));
    transition: background 300ms var(--ease-out);
  }
  .opening .core,
  .idle .core {
    background: color-mix(in srgb, var(--c) 22%, transparent);
    color: var(--c);
  }
  .error .core {
    background: color-mix(in srgb, var(--c) 18%, transparent);
    color: var(--c);
    animation: nope 420ms var(--ease-out);
  }
  @keyframes nope {
    20% {
      transform: translateX(-3px);
    }
    45% {
      transform: translateX(3px);
    }
    70% {
      transform: translateX(-1.5px);
    }
  }
  .done .core {
    animation: pop 460ms var(--ease-out);
  }
  @keyframes pop {
    40% {
      transform: scale(1.14);
    }
  }
  /* A soft halo while words are coming in. */
  .core::after {
    content: '';
    position: absolute;
    inset: -5px;
    border-radius: 50%;
    border: 1.5px solid var(--c);
    opacity: 0;
    transform: scale(0.9);
    transition:
      opacity 220ms ease,
      transform 320ms var(--ease-out);
  }
  .speaking .core::after {
    opacity: 0.35;
    transform: scale(1);
  }
  .sweep {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: conic-gradient(from 0deg, transparent 0 78%, color-mix(in srgb, var(--c) 55%, transparent) 96%, transparent 100%);
    -webkit-mask: radial-gradient(circle, transparent 0 60%, #000 61% 100%);
    mask: radial-gradient(circle, transparent 0 60%, #000 61% 100%);
    animation: spin 1.1s linear infinite;
  }
  .opening .sweep {
    animation-duration: 1.8s;
    opacity: 0.7;
  }
  .reduced .sweep {
    animation: none;
    opacity: 0.4;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
