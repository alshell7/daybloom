<script lang="ts">
  // A phone's + button, where the thumb rests: tap to jot something down, hold to say it. Its
  // shape, colour and side are yours (Settings › Phone). With the dial and timeline as two pages
  // it shares one row with the page switcher: the same height, the same baseline, opposite sides.
  import { scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { categoryColor, onColor } from '../../lib/engine/categories';
  import type { CategoryId } from '../../lib/engine/types';
  import { haptic } from '../../lib/haptics';
  import Icon from '../../lib/Icon.svelte';
  import { layout } from '../../lib/stores/layout.svelte';
  import { view } from '../../lib/stores/view.svelte';

  let { docked = false }: { docked?: boolean } = $props();

  const HOLD_MS = 420;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let held = false;
  let pressing = $state(false);

  const fab = $derived(layout.value.fab);
  const bg = $derived(fab.color === 'accent' ? 'var(--signal)' : fab.color === 'ink' ? 'var(--ink)' : categoryColor(fab.color as CategoryId, view.finish.dark));
  const fg = $derived(fab.color === 'accent' ? 'var(--on-signal, #fff)' : fab.color === 'ink' ? 'var(--ground)' : onColor(categoryColor(fab.color as CategoryId, view.finish.dark)));

  function down(e: PointerEvent) {
    if (e.button !== 0) return;
    held = false;
    pressing = true;
    timer = setTimeout(() => {
      held = true;
      haptic('pick');
      view.sheet = { kind: 'jot', voice: true };
    }, HOLD_MS);
  }
  function up() {
    pressing = false;
    clearTimeout(timer);
  }
  function click() {
    if (held) return;
    haptic('tick');
    view.sheet = { kind: 'jot' };
  }
</script>

{#if !view.sheet && fab.on}
  <button
    class="fab {fab.shape}"
    class:left={fab.side === 'left'}
    class:docked
    class:pressing
    style:--fab-bg={bg}
    style:--fab-fg={fg}
    data-genie="jot"
    aria-label="Jot something down (hold to say it)"
    title="Jot it down · hold to say it"
    onpointerdown={down}
    onpointerup={up}
    onpointercancel={up}
    onpointerleave={up}
    oncontextmenu={(e) => e.preventDefault()}
    onclick={click}
    transition:scale={{ start: 0.6, duration: view.reducedMotion ? 0 : 220, easing: cubicOut }}
  >
    <Icon name="plus" size={docked ? 24 : 26} stroke={2.4} />
  </button>
{/if}

<style>
  .fab {
    --size: 58px;
    position: fixed;
    right: calc(var(--safe-right, 0px) + 16px);
    bottom: calc(var(--safe-bottom, 0px) + 16px);
    z-index: 21;
    display: grid;
    place-items: center;
    width: var(--size);
    height: var(--size);
    color: var(--fab-fg);
    background: var(--fab-bg);
    box-shadow:
      0 10px 24px -8px color-mix(in srgb, var(--fab-bg) 70%, transparent),
      0 2px 6px rgb(0 0 0 / 0.18);
    transition:
      transform var(--dur-2) var(--ease-out),
      border-radius var(--dur-2) var(--ease-out);
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
  }
  .fab.left {
    right: auto;
    left: calc(var(--safe-left, 0px) + 16px);
  }
  /* Beside the page switcher: the same 52 px row, on the same baseline. */
  .fab.docked {
    --size: 52px;
    bottom: calc(var(--safe-bottom, 0px) + 14px);
  }
  .circle {
    border-radius: 50%;
  }
  .rounded {
    border-radius: 18px;
  }
  .docked.rounded {
    border-radius: 16px;
  }
  .square {
    border-radius: 8px;
  }
  .fab.pressing {
    transform: scale(0.94);
  }
  .fab:focus-visible {
    outline: 3px solid var(--focus-ring);
    outline-offset: 3px;
  }
</style>
