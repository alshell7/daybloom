<script lang="ts">
  import { scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import Icon from '../lib/Icon.svelte';
  import { installUpdate, updates } from '../lib/updater.svelte';
  import { countLine, parseNotes } from '../lib/releaseNotes';
  import { view } from '../lib/stores/view.svelte';
  import NotesList from './NotesList.svelte';
  import Popover from './pickers/Popover.svelte';

  // Appears only when a new version is ready. A tap shows what it brings (from the release's
  // notes) with "Update and restart"; then the ring fills while it downloads.
  const busy = $derived(updates.status === 'downloading' || updates.status === 'installing');
  const show = $derived(updates.status === 'available' || busy);
  const groups = $derived(parseNotes(updates.notes));
  const R = 8;
  const C = 2 * Math.PI * R;
  let btn = $state<HTMLButtonElement>();
  let open = $state(false);

  function tap() {
    if (busy) return;
    if (groups.length) open = !open;
    else installUpdate();
  }
</script>

{#if show}
  <button
    class="chip"
    class:busy
    bind:this={btn}
    onclick={tap}
    title={groups.length ? `Daybloom ${updates.version}: ${countLine(groups)}` : `Daybloom ${updates.version} is ready`}
    aria-label={busy ? `Updating to ${updates.version}` : groups.length ? `See what Daybloom ${updates.version} brings` : `Update to Daybloom ${updates.version} and restart`}
    aria-haspopup={groups.length ? 'dialog' : undefined}
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
      {#if groups.length}<i class="n tnum">{groups.reduce((s, g) => s + g.items.length, 0)}</i>{/if}
    {/if}
  </button>
{/if}

{#if open && btn && !busy}
  <Popover anchor={btn} onclose={() => (open = false)} label={`What's new in Daybloom ${updates.version}`} width={360}>
    <div class="card">
      <p class="cap">Daybloom <b class="tnum">{updates.version}</b> is ready</p>
      <div class="scroll"><NotesList {groups} compact /></div>
      <div class="acts">
        <button class="btn btn-quiet" onclick={() => (open = false)}>Later</button>
        <button
          class="btn btn-primary"
          onclick={() => {
            open = false;
            installUpdate();
          }}><Icon name="sparkles" size={14} /> Update and restart</button
        >
      </div>
    </div>
  </Popover>
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
  .n {
    display: grid;
    place-items: center;
    min-width: 17px;
    height: 17px;
    padding: 0 4px;
    border-radius: var(--r-pill);
    font-style: normal;
    font-size: 10.5px;
    color: var(--ink-inverse);
    background: var(--lume);
  }
  .card {
    display: grid;
    gap: var(--s-3);
  }
  .cap {
    margin: 0;
    font-size: var(--t-md);
    color: var(--ink-2);
  }
  .cap b {
    color: var(--ink);
    font-weight: 500;
  }
  .scroll {
    max-height: min(52vh, 420px);
    overflow: auto;
    padding-right: 4px;
  }
  .acts {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  .acts .btn {
    gap: 6px;
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
