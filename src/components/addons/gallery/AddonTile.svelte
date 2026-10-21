<script lang="ts">
  // An addon's icon tile: a quiet tint of its colour while off, the full tint once on. When it
  // is switched on it hops (a one-shot spring) and a soft ring opens out of it.
  import Icon from '../../../lib/Icon.svelte';

  let {
    icon,
    accent,
    on,
    pop = false,
    size = 32,
  }: {
    icon: string;
    accent: string;
    on: boolean;
    /** Play the "just switched on" hop. */
    pop?: boolean;
    size?: number;
  } = $props();
</script>

<span class="tile" class:on class:pop style:--ac={accent} style:--sz={`${size}px`} aria-hidden="true">
  <Icon name={icon} size={Math.round(size * 0.5)} stroke={1.9} />
</span>

<style>
  .tile {
    position: relative;
    display: grid;
    place-items: center;
    flex: none;
    width: var(--sz);
    height: var(--sz);
    border-radius: calc(var(--sz) * 0.32);
    color: color-mix(in srgb, var(--ac) 50%, var(--ink-3));
    background: color-mix(in srgb, var(--ac) 9%, color-mix(in srgb, var(--ink) 4%, transparent));
    transition:
      background-color var(--dur-3) var(--ease-out),
      color var(--dur-3) var(--ease-out),
      box-shadow var(--dur-3) var(--ease-out);
  }
  .tile.on {
    color: color-mix(in srgb, var(--ac) 86%, var(--ink));
    background: color-mix(in srgb, var(--ac) 20%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ac) 30%, transparent);
  }
  /* The ring that opens out when it turns on: transform and opacity only, once. */
  .tile::after {
    content: '';
    position: absolute;
    inset: -1px;
    border-radius: inherit;
    border: 2px solid var(--ac);
    opacity: 0;
    pointer-events: none;
  }
  .tile.pop {
    animation: hop 680ms var(--ease-out);
  }
  .tile.pop::after {
    animation: ring 760ms var(--ease-out);
  }
  @keyframes hop {
    0% {
      transform: none;
    }
    28% {
      transform: scale(1.22) rotate(-9deg);
    }
    52% {
      transform: scale(0.93) rotate(4deg);
    }
    74% {
      transform: scale(1.05) rotate(-1.5deg);
    }
    100% {
      transform: none;
    }
  }
  @keyframes ring {
    0% {
      opacity: 0.55;
      transform: scale(1);
    }
    100% {
      opacity: 0;
      transform: scale(1.7);
    }
  }
  :global([data-motion='calm']) .tile.pop,
  :global([data-motion='calm']) .tile.pop::after {
    animation: none;
  }
</style>
