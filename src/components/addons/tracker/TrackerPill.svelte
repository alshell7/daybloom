<script lang="ts">
  // In the top bar while the stopwatch runs: a beating dot, the time, the name. Tap opens the
  // tracker; the square stops it.
  import { cubicOut } from 'svelte/easing';
  import { scale } from 'svelte/transition';
  import { clockText, targetColor, targetTitle } from '../../../lib/addons/labels';
  import { tracker } from '../../../lib/addons/tracker/tracker.svelte';
  import Icon from '../../../lib/Icon.svelte';
  import { shownTitle } from '../../../lib/privacy';
  import { view } from '../../../lib/stores/view.svelte';

  const r = $derived(tracker.running);
</script>

{#if r}
  <span class="pill" style:--c={targetColor(r)} in:scale={{ start: 0.85, duration: view.reducedMotion ? 0 : 240, easing: cubicOut }}>
    <button class="open" onclick={() => (view.sheet = { kind: 'tracker' })} title="Open the Time Tracker" aria-label={`Tracking ${targetTitle(r)}, ${clockText(tracker.elapsedMs)}`}>
      <i class="dot"></i>
      <span class="time tnum">{clockText(tracker.elapsedMs)}</span>
      <span class="name">{shownTitle(targetTitle(r), 'focus')}</span>
    </button>
    <button class="stop" onclick={() => tracker.stop()} aria-label="Stop tracking" title="Stop"><Icon name="square" size={10} stroke={3} /></button>
  </span>
{/if}

<style>
  .pill {
    display: inline-flex;
    align-items: center;
    height: 30px;
    margin-right: 4px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--c) 12%, var(--raised));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c) 35%, transparent);
  }
  .open {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    height: 100%;
    padding: 0 6px 0 11px;
    border-radius: 999px 0 0 999px;
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--c);
    animation: beat 2s ease-in-out infinite;
  }
  @keyframes beat {
    50% {
      opacity: 0.35;
      transform: scale(0.75);
    }
  }
  .time {
    font-size: var(--t-xs);
    font-weight: 600;
    color: var(--ink);
  }
  .name {
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--t-xs);
    color: var(--ink-2);
  }
  .stop {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    margin-right: 2px;
    border-radius: 50%;
    color: var(--ink);
    transition: background var(--dur-1) var(--ease-out);
  }
  .stop:hover {
    background: color-mix(in srgb, var(--c) 22%, transparent);
  }
  @container topbar (max-width: 820px) {
    .name {
      display: none;
    }
  }
</style>
