<script lang="ts">
  import { MINUTE } from '../engine/time';
  import type { Finish } from '../presets';
  import { degFor, polar, sectorPath } from './geometry';

  // The block you're in, as a whole circle that gets eaten. It starts full at 12 o'clock and
  // the edge moves counter-clockwise back to 12 as time is spent, in countable slices — so
  // "how much is left" is a shape you feel, not a number you work out. Free time gets the
  // same ring in a neutral tone, running down to the next block.
  let {
    id,
    start,
    end,
    now,
    color,
    free = false,
    finish,
    rIn,
    rOut,
    reduced = false,
  }: {
    id: string;
    start: number;
    end: number;
    now: number;
    color: string;
    free?: boolean;
    finish: Finish;
    rIn: number;
    rOut: number;
    reduced?: boolean;
  } = $props();

  const len = $derived(Math.max(MINUTE, end - start));
  // Countable slices: 5 min for blocks up to an hour, 15 min up to three, else 30.
  const chunk = $derived((len <= 60 * MINUTE ? 5 : len <= 180 * MINUTE ? 15 : 30) * MINUTE);
  const n = $derived(Math.ceil(len / chunk - 1e-9));
  const left = $derived(Math.min(len, Math.max(0, end - now)));
  const remDeg = $derived((left / len) * 360);
  const gap = $derived(degFor(7, (rIn + rOut) / 2));

  // Slice k covers the remaining-time interval [k·chunk, (k+1)·chunk] counted back from the end,
  // i.e. angles [k·cd, (k+1)·cd] clockwise from 12. The first slice spent is the last one drawn.
  const slices = $derived.by(() => {
    const out: { a0: number; a1: number; fillTo: number }[] = [];
    for (let k = 0; k < n; k++) {
      const t0 = k * chunk;
      const t1 = Math.min(len, (k + 1) * chunk);
      const a0 = (t0 / len) * 360;
      const a1 = (t1 / len) * 360;
      out.push({ a0, a1, fillTo: Math.min(a1, remDeg) });
    }
    return out;
  });

  const fullLeft = $derived(Math.floor(left / chunk + 1e-9));
  const fill = $derived(free ? finish.track : color);
  const fillOpacity = $derived(free ? 0.42 : finish.dark ? 0.85 : 0.78);
  const edge = $derived(polar((rIn + rOut) / 2, remDeg));

  // A slice was just spent: its crumbs scatter once.
  let bite = $state<{ epoch: number; mid: number } | null>(null);
  let lastFull: number | null = null;
  let lastId: string | null = null;
  $effect(() => {
    const f = fullLeft;
    if (lastId === id && lastFull !== null && f < lastFull && !reduced) {
      const s = slices[f];
      if (s) bite = { epoch: (bite?.epoch ?? 0) + 1, mid: (s.a0 + s.a1) / 2 };
    }
    lastFull = f;
    lastId = id;
  });
  const crumbs = [-14, 0, 14];
</script>

<g class="remain" class:free aria-hidden="true">
  {#key id}
    <g class="refill" class:still={reduced}>
      {#each slices as s, k (k)}
        <!-- the spent part of a slice stays as a quiet outline -->
        <path d={sectorPath(s.a0 + gap / 2, s.a1 - gap / 2, rIn, rOut)} fill="none" stroke={finish.track} stroke-opacity="0.35" stroke-width="2" style:--d={`${k * 28}ms`} class="slot" />
        {#if s.fillTo > s.a0 + gap}
          <path d={sectorPath(s.a0 + gap / 2, s.fillTo - (s.fillTo >= s.a1 - 0.01 ? gap / 2 : 0), rIn, rOut)} fill={fill} fill-opacity={fillOpacity} style:--d={`${k * 28}ms`} class="slice" />
        {/if}
      {/each}
    </g>
  {/key}

  {#if left > 0}
    <!-- the edge where time is being eaten -->
    <circle cx={edge[0]} cy={edge[1]} r={(rOut - rIn) / 2 + 3} fill={finish.face} />
    <circle cx={edge[0]} cy={edge[1]} r={(rOut - rIn) / 2 - 4} fill={free ? finish.track : color} class="edge" />
  {/if}

  {#if bite}
    {#key bite.epoch}
      {#each crumbs as spread, i (i)}
        {@const p = polar((rIn + rOut) / 2, bite.mid + spread / 4)}
        <circle cx={p[0]} cy={p[1]} r="5" fill={fill} class="crumb" style:--dx={`${Math.sin(((bite.mid + spread) * Math.PI) / 180) * 26}px`} style:--dy={`${-Math.cos(((bite.mid + spread) * Math.PI) / 180) * 26}px`} style:--i={i} />
      {/each}
    {/key}
  {/if}
</g>

<style>
  .remain {
    pointer-events: none;
  }
  .refill .slot,
  .refill .slice {
    transform-origin: 500px 500px;
    transform-box: view-box;
    animation: refill 0.55s cubic-bezier(0.16, 1, 0.3, 1) both;
    animation-delay: var(--d);
  }
  .refill.still .slot,
  .refill.still .slice {
    animation: none;
  }
  @keyframes refill {
    from {
      opacity: 0;
      transform: scale(0.86) rotate(-12deg);
    }
  }
  .crumb {
    transform-box: fill-box;
    transform-origin: center;
    animation: crumb 0.7s cubic-bezier(0.2, 0.7, 0.3, 1) forwards;
    animation-delay: calc(var(--i) * 40ms);
    opacity: 0;
  }
  @keyframes crumb {
    0% {
      opacity: 0.95;
      transform: translate(0, 0) scale(1);
    }
    100% {
      opacity: 0;
      transform: translate(var(--dx), var(--dy)) scale(0.3);
    }
  }
</style>
