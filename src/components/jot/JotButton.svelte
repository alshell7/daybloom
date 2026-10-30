<script lang="ts">
  // A phone's + button, where the thumb rests: tap to jot something down, hold to say it.
  import { scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { haptic } from '../../lib/haptics';
  import Icon from '../../lib/Icon.svelte';
  import { view } from '../../lib/stores/view.svelte';

  const HOLD_MS = 420;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let held = false;
  let pressing = $state(false);

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

{#if !view.sheet}
  <button
    class="fab"
    class:pressing
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
    <Icon name="plus" size={26} stroke={2.4} />
  </button>
{/if}

<style>
  .fab {
    position: fixed;
    right: calc(var(--safe-right, 0px) + 16px);
    bottom: calc(var(--safe-bottom, 0px) + 16px);
    z-index: 21;
    display: grid;
    place-items: center;
    width: 58px;
    height: 58px;
    border-radius: 20px;
    color: var(--on-signal, #fff);
    background: var(--signal);
    box-shadow:
      0 10px 24px -8px color-mix(in srgb, var(--signal) 70%, transparent),
      0 2px 6px rgb(0 0 0 / 0.18);
    transition:
      transform var(--dur-2) var(--ease-out),
      border-radius var(--dur-2) var(--ease-out);
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
  }
  .fab.pressing {
    transform: scale(0.94);
    border-radius: 24px;
  }
  .fab:focus-visible {
    outline: 3px solid var(--focus-ring);
    outline-offset: 3px;
  }
</style>
