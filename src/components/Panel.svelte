<script lang="ts">
  import type { Snippet } from 'svelte';
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import Icon from '../lib/Icon.svelte';
  import { view } from '../lib/stores/view.svelte';

  let {
    title,
    onclose,
    children,
    footer,
    accent = undefined,
  }: { title: string; onclose: () => void; children: Snippet; footer?: Snippet; accent?: string } = $props();
</script>

<!-- An inspector, not a modal: the dial stays live beside it. -->
<div
  class="panel"
  role="dialog"
  aria-label={title}
  style:--accent={accent}
  in:fly={{ x: 40, duration: view.reducedMotion ? 0 : 340, easing: cubicOut, opacity: 0 }}
  out:fly={{ x: 30, duration: view.reducedMotion ? 0 : 200, easing: cubicOut, opacity: 0 }}
>
  <header>
    <h2>{title}</h2>
    <button class="icon-btn" onclick={onclose} aria-label="Close"><Icon name="x" size={18} /></button>
  </header>
  <div class="content">
    {@render children()}
  </div>
  {#if footer}
    <footer>{@render footer()}</footer>
  {/if}
</div>

<style>
  .panel {
    position: fixed;
    z-index: 30;
    top: 64px;
    right: 12px;
    bottom: 12px;
    width: min(400px, calc(100vw - 24px));
    display: grid;
    grid-template-rows: auto 1fr auto;
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
    box-shadow: var(--shadow-3);
    overflow: hidden;
  }
  .panel::before {
    content: '';
    position: absolute;
    inset: 0 0 auto;
    height: 4px;
    background: var(--accent, transparent);
    transition: background var(--dur-3) var(--ease-out);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--s-4) var(--s-3) var(--s-2) var(--s-5);
  }
  h2 {
    margin: 0;
    font-family: var(--font-ui);
    font-size: var(--t-sm);
    font-weight: 500;
    color: var(--ink-3);
  }
  .content {
    overflow-y: auto;
    padding: 0 var(--s-5) var(--s-5);
  }
  footer {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    padding: var(--s-3) var(--s-4);
    border-top: 1px solid var(--line);
    background: var(--surface);
  }
  @media (max-width: 860px) {
    .panel {
      top: auto;
      left: 8px;
      right: 8px;
      bottom: 8px;
      width: auto;
      max-height: 78vh;
    }
  }
</style>
