<script lang="ts">
  import { scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import Icon from '../lib/Icon.svelte';
  import { installUpdate, updates } from '../lib/updater.svelte';
  import { view } from '../lib/stores/view.svelte';

  // Appears only when a new version is ready. One tap: download (the ring fills), restart.
  const busy = $derived(updates.status === 'downloading' || updates.status === 'installing');
  const show = $derived(updates.status === 'available' || busy);
  const R = 8;
  const C = 2 * Math.PI * R;
</script>

{#if show}
  <button
    class="chip"
    class:busy
    onclick={() => !busy && installUpdate()}
    title={updates.notes || `Daybloom ${updates.version} is ready`}
    aria-label={busy ? `Updating to ${updates.version}` : `Update to Daybloom ${updates.version} and restart`}
    transition:scale={{ start: 0.6, duration: view.reducedMotion ? 0 : 280, easing: cubicOut }}
  >
    {#if busy}
      <svg viewBox="0 0 20 20" class="ring" aria-hidden="true">
        <circle cx="10" cy="10" r={R} class="track" />
        <circle cx="10" cy="10" r={R} class="fill" style:stroke-dashoffset={C * (1 - updates.progress)} style:stroke-dasharray={C} />
      </svg>
      <span>{updates.status === 'installing' ? 'Restarting…' : 'Updating…'}</span>
    {:else}
      <Icon name="sparkles" size={14} stroke={2} />
      <span>Update {updates.version}</span>
    {/if}
  </button>
{/if}

<style>
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    padding: 0 12px;
    border-radius: var(--r-pill);
    background: color-mix(in srgb, var(--lume) 18%, transparent);
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--t-xs);
    font-weight: 500;
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--lume) 45%, transparent);
    transition:
      background var(--dur-1) var(--ease-out),
      transform var(--dur-2) var(--ease-settle);
  }
  .chip:hover {
    background: color-mix(in srgb, var(--lume) 28%, transparent);
    transform: translateY(-1px);
  }
  .chip.busy {
    cursor: progress;
  }
  .ring {
    width: 16px;
    height: 16px;
    transform: rotate(-90deg);
  }
  .track {
    fill: none;
    stroke: var(--line-strong);
    stroke-width: 2.5;
  }
  .fill {
    fill: none;
    stroke: var(--lume);
    stroke-width: 2.5;
    stroke-linecap: round;
    transition: stroke-dashoffset 0.3s var(--ease-out);
  }
</style>
