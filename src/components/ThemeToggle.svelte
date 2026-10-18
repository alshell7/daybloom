<script lang="ts">
  import { flushSync } from 'svelte';
  import { settings } from '../lib/stores/settings.svelte';
  import { view } from '../lib/stores/view.svelte';

  // Sun ↔ moon. The new theme spreads out from the button as a growing circle
  // (View Transitions where the webview supports them, a plain swap elsewhere).
  function toggle(e: MouseEvent) {
    const next = view.dark ? 'light' : 'dark';
    const apply = () => {
      settings.value.theme = next;
      document.documentElement.dataset.theme = next;
      flushSync();
    };
    const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };
    if (!doc.startViewTransition || view.reducedMotion) return apply();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    doc.startViewTransition(apply).ready.then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] },
        { duration: 620, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', pseudoElement: '::view-transition-new(root)' },
      );
    });
  }
</script>

<button class="icon-btn toggle" class:dark={view.dark} onclick={toggle} aria-label={view.dark ? 'Switch to light' : 'Switch to dark'} title={view.dark ? 'Light mode' : 'Dark mode'}>
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <mask id="moon-cut">
      <rect width="24" height="24" fill="white" />
      <circle class="cut" cx="24" cy="2" r="7" fill="black" />
    </mask>
    <circle class="core" cx="12" cy="12" r="5" mask="url(#moon-cut)" />
    <g class="rays">
      {#each [0, 45, 90, 135, 180, 225, 270, 315] as a (a)}
        <line x1="12" y1="2.2" x2="12" y2="4.4" transform={`rotate(${a} 12 12)`} />
      {/each}
    </g>
  </svg>
</button>

<style>
  svg {
    width: 19px;
    height: 19px;
    overflow: visible;
  }
  .core {
    fill: currentColor;
    transform-origin: 12px 12px;
    transition: transform 0.5s var(--ease-out);
  }
  .cut {
    transition: transform 0.5s var(--ease-out);
  }
  .rays {
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    transform-origin: 12px 12px;
    transition:
      transform 0.5s var(--ease-out),
      opacity 0.3s var(--ease-out);
  }
  .dark .core {
    transform: scale(1.55);
  }
  .dark .cut {
    transform: translate(-8px, 6px);
  }
  .dark .rays {
    transform: rotate(90deg) scale(0.4);
    opacity: 0;
  }
  .toggle:hover .rays {
    transform: rotate(30deg);
  }
  .dark.toggle:hover .core {
    transform: scale(1.55) rotate(-12deg);
  }
  :global(::view-transition-old(root)),
  :global(::view-transition-new(root)) {
    animation: none;
    mix-blend-mode: normal;
  }
</style>
