<script lang="ts">
  import { toggleTheme } from '../lib/themeToggle';
  import { view } from '../lib/stores/view.svelte';

  // Sun ↔ moon. The new theme spreads out from the button as a growing circle.
  const toggle = (e: MouseEvent) => toggleTheme(e.currentTarget as HTMLElement);
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
