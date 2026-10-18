<script lang="ts">
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { view } from '../lib/stores/view.svelte';
</script>

<div class="dock" class:beside={!!view.sheet} class:wide={view.sheet?.kind === 'backlog' || view.sheet?.kind === 'insights'} aria-live="polite">
  {#if view.toast}
    {#key view.toast.id}
      <div class="toast" in:fly={{ y: 16, duration: view.reducedMotion ? 0 : 280, easing: cubicOut }} out:fly={{ y: 8, duration: 160 }}>
        <span>{view.toast.text}</span>
        {#if view.toast.action}
          <span class="countdown" style:animation-duration={`${view.toast.ms}ms`} aria-hidden="true"></span>
          <button
            onclick={() => {
              view.toast?.action?.run();
              view.toast = null;
            }}>{view.toast.action.label}</button
          >
        {/if}
      </div>
    {/key}
  {/if}
</div>

<style>
  /* Bottom of the rail: clear of the dial and its controls. */
  .dock {
    position: fixed;
    right: 16px;
    bottom: 16px;
    width: min(400px, calc(100vw - 32px));
    display: grid;
    justify-items: end;
    pointer-events: none;
    z-index: 70;
  }
  /* with an inspector open, the toast sits beside it instead of over its footer */
  .dock.beside {
    right: 428px;
  }
  .dock.beside.wide {
    right: 568px;
  }
  @media (max-width: 860px) {
    .dock,
    .dock.beside,
    .dock.beside.wide {
      right: 16px;
      left: 16px;
      width: auto;
      justify-items: center;
    }
  }
  .toast {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: var(--s-4);
    max-width: min(480px, calc(100vw - 32px));
    padding: 10px 10px 10px 18px;
    border-radius: var(--r-lg);
    background: var(--ink);
    color: var(--ink-inverse);
    font-size: var(--t-sm);
    line-height: 1.4;
    box-shadow: var(--shadow-3);
  }
  .toast {
    position: relative;
    overflow: hidden;
  }
  .toast span {
    padding: 4px 0;
  }
  .countdown {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 2px;
    padding: 0 !important;
    background: color-mix(in srgb, var(--ink-inverse) 45%, transparent);
    transform-origin: left;
    animation: count linear forwards;
  }
  @keyframes count {
    to {
      transform: scaleX(0);
    }
  }
  .toast:not(:has(button)) {
    padding-right: 18px;
  }
  button {
    height: 30px;
    padding: 0 14px;
    border-radius: var(--r-pill);
    background: color-mix(in srgb, var(--ink-inverse) 14%, transparent);
    font-weight: 600;
    font-size: var(--t-sm);
  }
  button:hover {
    background: color-mix(in srgb, var(--ink-inverse) 24%, transparent);
  }
</style>
