<script lang="ts">
  import { view } from '../../lib/stores/view.svelte';

  let { size = 14 }: { size?: number } = $props();
</script>

<!-- Turns only while work is in flight; under Calm it holds still. -->
<span class="spinner" class:still={view.reducedMotion} style:--size="{size}px" aria-hidden="true"></span>

<style>
  .spinner {
    display: inline-block;
    flex: none;
    width: var(--size);
    height: var(--size);
    border-radius: 50%;
    border: 2px solid color-mix(in srgb, currentColor 22%, transparent);
    border-top-color: currentColor;
    animation: turn 0.9s linear infinite;
  }
  .spinner.still {
    animation: none;
    border-top-color: color-mix(in srgb, currentColor 22%, transparent);
    border-right-color: currentColor;
  }
  @keyframes turn {
    to {
      transform: rotate(1turn);
    }
  }
</style>
