<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onMount, untrack } from 'svelte';
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import Icon from '../lib/Icon.svelte';
  import { genie, lamp } from '../lib/genie';
  import { view } from '../lib/stores/view.svelte';
  import { pushCloser } from '../lib/sheets';

  const CONTROLS = 'button, a[href], input, select, textarea, label, summary, [role="button"], [role="slider"], [role="tab"], [role="menuitem"], [role="option"], [contenteditable="true"]';

  let {
    title,
    onclose,
    children,
    footer,
    accent = undefined,
    wide = false,
    genieFrom = undefined,
    dismissOutside = true,
  }: {
    title: string;
    onclose: () => void;
    children: Snippet;
    footer?: Snippet;
    accent?: string;
    wide?: boolean;
    /** Opens out of (and closes into) the button marked `data-genie="<name>"`. */
    genieFrom?: string;
    /** A click outside the panel closes it (on by default). */
    dismissOutside?: boolean;
  } = $props();

  let panel = $state<HTMLDivElement>();

  // The lamp it last came from: a sheet's subject can be gone by the time it closes (the block
  // sheet's key clears as it shuts), and it should still pour back into it.
  let lampName: string | undefined = untrack(() => genieFrom);
  $effect.pre(() => {
    if (genieFrom) lampName = genieFrom;
  });

  function enter(node: HTMLElement) {
    if (lampName) return genie(node, { from: () => lamp(lampName!), reduced: view.reducedMotion });
    return fly(node, { x: 40, duration: view.reducedMotion ? 0 : 340, easing: cubicOut, opacity: 0 });
  }
  function leave(node: HTMLElement) {
    if (lampName) return genie(node, { from: () => lamp(lampName!), reduced: view.reducedMotion, duration: 480 });
    return fly(node, { x: 30, duration: view.reducedMotion ? 0 : 200, easing: cubicOut, opacity: 0 });
  }

  // Esc closes the open panel through its own `onclose` (so a sheet can tidy up first).
  onMount(() => pushCloser(() => onclose()));

  // A press outside closes it: anywhere but the panel, its pop-up cards, messages (Undo) and
  // what opens it. Controls outside keep their own meaning (another block opens in this
  // sheet, a top-bar button opens its own), so only a press on open ground closes it.
  onMount(() => {
    if (!dismissOutside) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || !panel || panel.contains(t) || e.button > 0) return;
      if (t.closest('.pop, [data-keep-sheet], [role="dialog"], [data-genie]')) return;
      if (t.closest(CONTROLS)) return;
      // That press only closes the panel (it doesn't also sweep a block on the dial).
      e.preventDefault();
      e.stopPropagation();
      const swallow = (ev: Event) => {
        ev.preventDefault();
        ev.stopPropagation();
      };
      addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => removeEventListener('click', swallow, true), 400);
      onclose();
    };
    // After the press that opened it has finished.
    const id = setTimeout(() => addEventListener('pointerdown', onDown, true), 0);
    return () => {
      clearTimeout(id);
      removeEventListener('pointerdown', onDown, true);
    };
  });
</script>

<!-- An inspector, not a modal: the dial stays live beside it. -->
<div class="panel" class:wide role="dialog" aria-label={title} style:--accent={accent} bind:this={panel} in:enter out:leave>
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
    bottom: calc(12px + var(--safe-bottom));
    width: min(400px, calc(100vw - 24px));
    display: grid;
    grid-template-rows: auto 1fr auto;
    /* Never wider than its frame: a long row wraps or shrinks instead of widening the panel. */
    grid-template-columns: minmax(0, 1fr);
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
    box-shadow: var(--shadow-3);
    /* clip, not hidden: a focused field can't scroll the whole panel sideways. */
    overflow: hidden;
    overflow: clip;
  }
  .panel.wide {
    width: min(540px, calc(100vw - 24px));
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
    min-width: 0;
    overflow-x: hidden;
    overflow-y: auto;
    padding: 0 var(--s-5) var(--s-5);
  }
  footer {
    display: flex;
    flex-wrap: wrap;
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
