<script lang="ts">
  // The dial as Alef's body: while a feeling plays, it leans, lifts or shrinks a little, and
  // can hop or shiver once. Transform only, one-shot; at rest it's just the dial.
  import type { Snippet } from 'svelte';
  import { alef, alefFile } from '../../../lib/addons/alef/alef.svelte';
  import { BEHAVIORS } from '../../../lib/addons/alef/behaviors';

  let { on, reduced = false, compact = false, children }: { on: boolean; reduced?: boolean; compact?: boolean; children: Snippet } = $props();

  const p = $derived(on && !reduced && alef.performing ? BEHAVIORS[alef.perf.id].posture : null);
  // A dial tells the time: it only leans a little, so the hand still reads true.
  const transform = $derived(p ? `translateY(${(p.y * (compact ? 0.7 : 1)).toFixed(1)}px) rotate(${(p.tilt * 0.4).toFixed(2)}deg) scale(${1 + (p.scale - 1) * 0.6})` : null);
  // Two copies of each keyframe, alternating, restart the move for each new feeling.
  const k = $derived(alef.perf.seq % 2);
  const animation = $derived(p?.shake ? `shake-${k} 560ms ease-in-out 1` : p?.bounce ? `hop-${k} 760ms cubic-bezier(0.3, 1.4, 0.5, 1) 1` : null);
</script>

<div class="posture" style:transform style:--alef-eye={alefFile.value.settings.eyes}>
  <div class="move" style:animation>
    {@render children()}
  </div>
</div>

<style>
  .posture {
    transition: transform 640ms cubic-bezier(0.34, 1.35, 0.64, 1);
    transform-origin: 50% 55%;
  }
  @keyframes -global-shake-0 {
    0%,
    100% {
      translate: 0 0;
    }
    20%,
    60% {
      translate: -3px 0;
    }
    40%,
    80% {
      translate: 3px 0;
    }
  }
  @keyframes -global-shake-1 {
    0%,
    100% {
      translate: 0 0;
    }
    20%,
    60% {
      translate: -3px 0;
    }
    40%,
    80% {
      translate: 3px 0;
    }
  }
  @keyframes -global-hop-0 {
    0%,
    100% {
      translate: 0 0;
    }
    28% {
      translate: 0 -9px;
    }
    52% {
      translate: 0 0;
    }
    72% {
      translate: 0 -4px;
    }
  }
  @keyframes -global-hop-1 {
    0%,
    100% {
      translate: 0 0;
    }
    28% {
      translate: 0 -9px;
    }
    52% {
      translate: 0 0;
    }
    72% {
      translate: 0 -4px;
    }
  }
</style>
