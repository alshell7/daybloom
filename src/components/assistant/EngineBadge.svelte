<script lang="ts">
  // A quiet line about where the understanding comes from: on-device Needle when its weights
  // are here, otherwise basic mode with an opt-in download (35 MB, once, verified).
  import { session } from '../../lib/assistant/session.svelte';
  import Icon from '../../lib/Icon.svelte';
  import Ring from './Ring.svelte';

  const pct = $derived(Math.round(session.progress * 100));
</script>

<div class="badge" aria-live="polite">
  {#if session.status === 'ready'}
    <span class="pill on" title="Needle by Cactus Compute (Apache-2.0) runs here, in WebAssembly. Nothing you type leaves this device.">
      <Icon name="sparkles" size={12} stroke={2} /> On-device · Needle by Cactus Compute (Apache-2.0)
    </span>
  {:else if session.status === 'downloading'}
    <span class="pill">
      <Ring fraction={session.progress} size={14} stroke={2.5} color="var(--ink-2)" label={`${pct}% downloaded`} />
      <span class="tnum">Downloading Needle · {pct}%</span>
    </span>
  {:else if session.status === 'loading'}
    <span class="pill"><span class="wake" aria-hidden="true"></span> Waking Needle…</span>
  {:else if session.status === 'error'}
    <button class="pill btn" onclick={() => session.download()} title={session.error ?? ''}>
      <Icon name="refresh" size={12} /> Needle couldn't start — try again
    </button>
  {:else if session.status === 'absent'}
    <button class="pill btn" onclick={() => session.download()} title="Needle is a 35 MB on-device model by Cactus Compute (Apache-2.0). Downloaded once and verified; everything stays on this device.">
      Basic mode · <b>Download Needle</b> (35 MB, once)
    </button>
  {:else}
    <span class="pill">Basic mode · works offline</span>
  {/if}
</div>

<style>
  .badge {
    display: flex;
    min-width: 0;
  }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 24px;
    padding: 0 9px;
    border-radius: var(--r-pill);
    background: transparent;
    color: var(--ink-3);
    font-family: var(--font-ui);
    font-size: var(--t-xs);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }
  .pill.on {
    color: var(--ink-2);
  }
  .btn {
    transition: background var(--dur-1) var(--ease-out);
  }
  .btn:hover {
    background: var(--sunken);
    color: var(--ink);
  }
  b {
    font-weight: 500;
    color: var(--ink-2);
  }
  /* A short wait indicator: one compositor-only turn loop, only while the model loads; Calm stills it. */
  .wake {
    width: 11px;
    height: 11px;
    border-radius: 50%;
    border: 2px solid var(--line-strong);
    border-top-color: var(--ink-2);
    animation: turn 0.9s linear infinite;
  }
  @keyframes turn {
    to {
      transform: rotate(1turn);
    }
  }
  :global([data-motion='calm']) .wake {
    animation: none;
  }
</style>
