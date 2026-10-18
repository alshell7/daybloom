<script lang="ts">
  import { tick } from 'svelte';
  import { scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { activeTimeZone, formatTime, systemTimeZone, zoneCity, zoneOffsetLabel, zoneOffsetMs } from '../lib/engine/time';
  import Icon from '../lib/Icon.svelte';
  import { clock } from '../lib/stores/clock.svelte';
  import { settings } from '../lib/stores/settings.svelte';
  import { view } from '../lib/stores/view.svelte';

  // A traveller's dial: one click, type a city, the whole day re-reads in that zone.
  let open = $state(false);
  let q = $state('');
  let active = $state(0);
  let input: HTMLInputElement | undefined = $state();

  const system = systemTimeZone();
  const current = $derived((clock.zone, activeTimeZone()));
  const away = $derived(current !== system);

  const ALL: string[] = (() => {
    try {
      return (Intl as any).supportedValuesOf('timeZone') as string[];
    } catch {
      return [];
    }
  })();
  const POPULAR = ['America/Los_Angeles', 'America/New_York', 'Europe/London', 'Europe/Berlin', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney'];

  const results = $derived.by(() => {
    const needle = q.trim().toLowerCase().replace(/\s+/g, '_');
    if (!needle) {
      const seen = new Set<string>([system]);
      const list = [system];
      for (const z of [...settings.value.recentZones, ...POPULAR]) if (!seen.has(z)) seen.add(z), list.push(z);
      return list.slice(0, 12);
    }
    return ALL.filter((z) => z.toLowerCase().includes(needle)).slice(0, 30);
  });

  async function toggle() {
    open = !open;
    if (open) {
      q = '';
      active = 0;
      await tick();
      input?.focus();
    }
  }

  function choose(z: string) {
    settings.value.timeZone = z === system ? '' : z;
    if (z !== system) settings.value.recentZones = [z, ...settings.value.recentZones.filter((x) => x !== z)].slice(0, 5);
    open = false;
    view.say(z === system ? `Back on this computer's time · ${zoneCity(z)}` : `Showing your day in ${zoneCity(z)} time · ${zoneOffsetLabel(z)}`);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      active = Math.min(results.length - 1, active + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      active = Math.max(0, active - 1);
    } else if (e.key === 'Enter' && results[active]) {
      choose(results[active]);
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      open = false;
    }
  }

  function localTime(z: string) {
    // Wall time in another zone, independent of the app's active zone.
    const ms = clock.minute + zoneOffsetMs(clock.minute, z);
    const d = new Date(ms);
    const h = d.getUTCHours();
    const m = String(d.getUTCMinutes()).padStart(2, '0');
    if (!view.hour12) return `${String(h).padStart(2, '0')}:${m}`;
    return `${h % 12 === 0 ? 12 : h % 12}:${m}${h < 12 ? 'am' : 'pm'}`;
  }
</script>

<div class="zone">
  <button class="chip" class:away onclick={toggle} aria-expanded={open} title="Time zone">
    <Icon name="globe" size={15} stroke={1.9} />
    <span>{zoneCity(current)}</span>
    {#if away}<span class="off">{zoneOffsetLabel(current)}</span>{/if}
  </button>

  {#if open}
    <div class="scrim" role="presentation" onclick={() => (open = false)}></div>
    <div class="pop" role="dialog" aria-label="Choose time zone" transition:scale={{ start: 0.94, duration: view.reducedMotion ? 0 : 200, easing: cubicOut }}>
      <label class="search">
        <Icon name="search" size={15} />
        <input bind:this={input} bind:value={q} oninput={() => (active = 0)} onkeydown={onKey} placeholder="City or region…" aria-label="Search time zones" />
      </label>
      <ul role="listbox">
        {#each results as z, i (z)}
          <li>
            <button class="opt" class:on={z === current} class:hl={i === active} role="option" aria-selected={z === current} onclick={() => choose(z)} onpointerenter={() => (active = i)}>
              <span class="city">
                {zoneCity(z)}
                {#if z === system}<em>this computer</em>{/if}
              </span>
              <span class="meta tnum">{z.split('/')[0]} · {zoneOffsetLabel(z)}</span>
              <span class="time tnum">{localTime(z)}</span>
            </button>
          </li>
        {:else}
          <li class="none">No zone matches “{q}”.</li>
        {/each}
      </ul>
    </div>
  {/if}
</div>

<style>
  .zone {
    position: relative;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    padding: 0 10px;
    border-radius: var(--r-pill);
    font-family: var(--font-ui);
    font-size: var(--t-xs);
    color: var(--ink-3);
    transition:
      background var(--dur-1) var(--ease-out),
      color var(--dur-1) var(--ease-out);
  }
  .chip:hover {
    background: var(--sunken);
    color: var(--ink);
  }
  .chip.away {
    color: var(--ink);
    background: color-mix(in srgb, var(--focus-ring) 14%, transparent);
  }
  .off {
    opacity: 0.7;
  }
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 44;
  }
  .pop {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    z-index: 45;
    width: 320px;
    border-radius: var(--r-lg);
    background: var(--raised);
    border: 1px solid var(--line);
    box-shadow: var(--shadow-3);
    overflow: hidden;
    transform-origin: top left;
  }
  .search {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 14px;
    height: 44px;
    border-bottom: 1px solid var(--line);
    color: var(--ink-3);
  }
  .search input {
    flex: 1;
    border: 0;
    background: transparent;
    outline: none;
    font-size: var(--t-sm);
    color: var(--ink);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 6px;
    max-height: 340px;
    overflow-y: auto;
  }
  .opt {
    display: grid;
    grid-template-columns: 1fr auto;
    grid-template-areas: 'city time' 'meta time';
    width: 100%;
    padding: 7px 10px;
    border-radius: var(--r-sm);
    text-align: left;
  }
  .opt.hl {
    background: var(--sunken);
  }
  .opt.on .city {
    color: var(--focus-ring);
  }
  .city {
    grid-area: city;
    font-size: var(--t-sm);
    font-weight: 500;
  }
  .city em {
    font-style: normal;
    font-weight: 400;
    font-size: var(--t-xs);
    color: var(--ink-3);
    margin-left: 6px;
  }
  .meta {
    grid-area: meta;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .time {
    grid-area: time;
    align-self: center;
    font-family: var(--font-ui);
    font-size: var(--t-md);
    font-weight: 300;
  }
  .none {
    padding: 14px;
    font-size: var(--t-sm);
    color: var(--ink-3);
  }
</style>
