<script lang="ts">
  // One of Daybloom's own models on this device: what it does, whether it's here, a progress
  // bar while it downloads, and Download or Remove. `inline` is the one-line version a picker
  // shows when you choose a model that isn't downloaded yet.
  import Icon from '../../../lib/Icon.svelte';
  import type { DeviceModel } from './device';

  let { model, inline = false }: { model: DeviceModel; inline?: boolean } = $props();

  const pct = $derived(Math.round(model.progress * 100));
  const busy = $derived(model.status === 'downloading' || model.status === 'loading');
  const mem = $derived(Math.round(model.memory / 1048576));
  const statusLine = $derived(
    model.status === 'downloading'
      ? `Downloading… ${pct}%`
      : model.status === 'loading'
        ? 'Waking up…'
        : model.status === 'ready'
          ? model.id === 'voice'
            ? 'Ready'
            : mem
              ? `Ready · ${mem} MB in use`
              : 'Ready · asleep until needed'
          : model.status === 'error'
            ? `Couldn't get it. ${model.error ?? ''}`.trim()
            : '',
  );
  const get = () => void model.get().catch(() => {});
</script>

{#if inline}
  <div class="inline" aria-live="polite">
    {#if busy}
      <span class="bar" aria-hidden="true"><i style:transform={`scaleX(${model.progress})`}></i></span>
      <span class="tnum">{statusLine}</span>
    {:else if model.status === 'error'}
      <span class="msg">{statusLine}</span>
      <button class="btn btn-soft sm" onclick={get}>Try again</button>
    {:else if model.status !== 'ready'}
      <span class="msg">{model.name} isn't on this computer yet.{model.until ? ` ${model.until}` : ''}</span>
      <button class="btn btn-soft sm" onclick={get}><Icon name="download" size={13} /> Get it · {model.mb} MB</button>
    {/if}
  </div>
{:else}
  <div class="dev" class:ready={model.status === 'ready'}>
    <span class="tile" aria-hidden="true"><Icon name={model.icon} size={16} /></span>
    <span class="text">
      <b>{model.name} <small class="tnum">{model.mb} MB</small></b>
      <small>{model.does}</small>
      {#if statusLine}
        <small class="status tnum" class:err={model.status === 'error'} aria-live="polite">
          {#if model.status === 'ready'}<i class="dot"></i>{/if}{statusLine}
        </small>
      {/if}
      {#if busy}<span class="bar" aria-hidden="true"><i style:transform={`scaleX(${model.status === 'loading' ? 1 : model.progress})`}></i></span>{/if}
    </span>
    {#if model.status === 'ready'}
      <button class="btn btn-quiet sm" onclick={() => void model.remove()}>Remove</button>
    {:else if model.status === 'error'}
      <button class="btn btn-soft sm" onclick={get}>Try again</button>
    {:else if !busy}
      <button class="btn btn-soft sm" onclick={get}><Icon name="download" size={13} /> Download</button>
    {/if}
  </div>
{/if}

<style>
  .dev {
    display: grid;
    grid-template-columns: 32px minmax(0, 1fr) auto;
    align-items: start;
    gap: 2px var(--s-3);
    padding: 10px 0;
  }
  .dev + :global(.dev) {
    border-top: 1px solid var(--line);
  }
  .tile {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: var(--r-sm);
    background: var(--sunken);
    color: var(--ink-2);
    transition:
      background var(--dur-3) var(--ease-out),
      color var(--dur-3) var(--ease-out);
  }
  .ready .tile {
    background: color-mix(in srgb, var(--lume) 16%, var(--sunken));
    color: var(--ink);
  }
  .text {
    display: grid;
    gap: 1px;
    min-width: 0;
  }
  b {
    font-family: var(--font-ui);
    font-size: var(--t-sm);
    font-weight: 500;
  }
  b small {
    margin-left: 4px;
    font-weight: 400;
    color: var(--ink-3);
  }
  small {
    font-size: var(--t-xs);
    color: var(--ink-3);
    line-height: 1.4;
  }
  .status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--ink-2);
  }
  .status.err {
    color: color-mix(in srgb, var(--warm) 70%, var(--ink));
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--lume);
    animation: pop 420ms var(--ease-settle) both;
  }
  .btn.sm {
    height: 30px;
    padding: 0 12px;
    font-size: var(--t-xs);
    gap: 6px;
    align-self: center;
  }
  .bar {
    display: block;
    position: relative;
    height: 4px;
    margin-top: 6px;
    border-radius: 2px;
    background: var(--line);
    overflow: hidden;
  }
  .bar i {
    position: absolute;
    inset: 0;
    border-radius: 2px;
    background: var(--focus-ring);
    transform-origin: left;
    transition: transform 0.25s linear;
  }
  .inline {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px var(--s-3);
    padding: 8px 2px 2px;
    font-size: var(--t-xs);
    color: var(--ink-2);
  }
  .inline .bar {
    flex: 1;
    min-width: 80px;
    margin: 0;
  }
  .msg {
    flex: 1;
    min-width: 140px;
  }
  @keyframes pop {
    from {
      transform: scale(0);
    }
    60% {
      transform: scale(1.35);
    }
  }
  :global([data-motion='calm']) .dot {
    animation: none;
  }
</style>
