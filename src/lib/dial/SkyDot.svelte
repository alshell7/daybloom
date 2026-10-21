<script lang="ts">
  // A tiny disc of a city's sky right now: day, dawn or dusk, or night, with a sun or a moon.
  // Used beside city names in the zone picker and Settings; repaints once a minute.
  import Icon from '../Icon.svelte';
  import type { Finish } from '../presets';
  import { solarAltitude } from './sun';
  import { placeOf, skyColor, skyFor } from './world';

  let { zone, now, finish, size = 18, icon = true }: { zone: string; now: number; finish: Finish; size?: number; icon?: boolean } = $props();

  const sky = $derived(skyFor(finish));
  const alt = $derived.by(() => {
    const p = placeOf(zone, now);
    return solarAltitude(now, p.lat, p.lng);
  });
  const color = $derived(skyColor(alt, sky));
  const up = $derived(alt > -3);
  const phase = $derived(alt >= 5 ? 'Daytime' : alt <= -10 ? 'Night' : 'Twilight');
</script>

<span class="sky" style:--c={color} style:width={`${size}px`} style:height={`${size}px`} title={phase} aria-label={phase} role="img">
  {#if icon}<Icon name={up ? 'sun' : 'moon'} size={Math.round(size * 0.62)} stroke={2.4} color={up ? sky.sun : sky.moon} />{/if}
</span>

<style>
  .sky {
    flex: none;
    display: inline-grid;
    place-items: center;
    border-radius: 50%;
    background: linear-gradient(160deg, color-mix(in srgb, var(--c) 78%, white), var(--c));
    box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.1);
  }
</style>
