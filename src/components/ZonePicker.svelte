<script lang="ts">
  import { tick } from 'svelte';
  import { scale, slide } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { activeTimeZone, systemTimeZone, zoneCity, zoneOffsetLabel } from '../lib/engine/time';
  import Icon from '../lib/Icon.svelte';
  import SkyDot from '../lib/dial/SkyDot.svelte';
  import { aheadLabel, dayShift, MAX_COMPARE, pinZone, promoteZone, replaceZone, timeIn, weekdayIn } from '../lib/dial/world';
  import { fitOnScreen } from '../lib/fitOnScreen';
  import { popovers } from '../lib/popovers.svelte';
  import { platform, thisDevice } from '../lib/platform';
  import { clock } from '../lib/stores/clock.svelte';
  import { settings } from '../lib/stores/settings.svelte';
  import { view } from '../lib/stores/view.svelte';

  // A traveller's dial: one click, type a city, the whole day re-reads in that zone. Pin up to
  // two more cities to compare: they show here with their live time, and ring the dial with
  // their day and night.
  let open = $state(false);
  let q = $state('');
  let active = $state(0);
  let input: HTMLInputElement | undefined = $state();
  /** A third city waiting to be pinned: which one should it replace? */
  let replacing = $state<string | null>(null);

  const system = systemTimeZone();
  const current = $derived((clock.zone, activeTimeZone()));
  const away = $derived(current !== system);
  const pinned = $derived(settings.value.worldClock.zones.filter((z) => z !== current));

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
      // Pinned cities already sit in "Comparing" above.
      const seen = new Set<string>([system, ...pinned]);
      const list = pinned.includes(system) ? [] : [system];
      for (const z of [...settings.value.recentZones, ...POPULAR]) if (!seen.has(z)) seen.add(z), list.push(z);
      return list.slice(0, 12);
    }
    return ALL.filter((z) => z.toLowerCase().includes(needle)).slice(0, 30);
  });

  // Back (or Esc) closes it first.
  $effect(() => {
    if (open) return popovers.push(() => (open = false));
  });

  async function toggle() {
    open = !open;
    if (open) {
      q = '';
      active = 0;
      replacing = null;
      await tick();
      // A phone: no keyboard over the list unless asked for (a tap on the search field).
      if (!platform.isMobile) input?.focus();
    }
  }

  function choose(z: string) {
    // A pinned city becoming the primary swaps places with the old primary.
    if (settings.value.worldClock.zones.includes(z)) settings.value.worldClock.zones = promoteZone(settings.value.worldClock.zones, z, current);
    settings.value.timeZone = z === system ? '' : z;
    if (z !== system) settings.value.recentZones = [z, ...settings.value.recentZones.filter((x) => x !== z)].slice(0, 5);
    open = false;
    view.say(z === system ? `Back on ${thisDevice}'s time · ${zoneCity(z)}` : `Showing your day in ${zoneCity(z)} time · ${zoneOffsetLabel(z)}`);
  }

  function pin(z: string) {
    if (z === current) return;
    const wc = settings.value.worldClock;
    if (wc.zones.includes(z)) {
      wc.zones = wc.zones.filter((x) => x !== z);
      replacing = null;
      return;
    }
    const r = pinZone(pinned, z, current);
    if (r.full) {
      replacing = z;
      return;
    }
    wc.zones = r.zones;
    replacing = null;
    view.say(`Comparing ${zoneCity(z)} · ${aheadLabel(clock.minute, z, current)}${wc.onDial ? ' · on the dial' : ''}`);
  }

  function replaceWith(old: string) {
    if (!replacing) return;
    const z = replacing;
    settings.value.worldClock.zones = replaceZone(pinned, old, z);
    replacing = null;
    view.say(`Comparing ${zoneCity(z)} instead of ${zoneCity(old)}`);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      active = Math.min(results.length - 1, active + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      active = Math.max(0, active - 1);
    } else if (e.key === 'Enter' && results[active]) {
      if (e.shiftKey) pin(results[active]);
      else choose(results[active]);
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      if (replacing) replacing = null;
      else open = false;
    }
  }

  // Wall time in another zone, independent of the app's active zone.
  const localTime = (z: string) => timeIn(clock.minute, z, view.hour12);
  const ahead = (z: string) => {
    const d = dayShift(clock.minute, z, current);
    return `${aheadLabel(clock.minute, z, current)}${d ? ` · ${weekdayIn(clock.minute, z)}` : ''}`;
  };
</script>

<div class="zone">
  <button class="chip" class:away onclick={toggle} aria-expanded={open} title="Time zone">
    <Icon name="globe" size={15} stroke={1.9} />
    <span>{zoneCity(current)}</span>
    {#if away}<span class="off">{zoneOffsetLabel(current)}</span>{/if}
    {#if pinned.length}
      <span class="dots" aria-label={`Comparing ${pinned.map(zoneCity).join(' and ')}`}>
        {#each pinned as z (z)}<SkyDot zone={z} now={clock.minute} finish={view.finish} size={9} icon={false} />{/each}
      </span>
    {/if}
  </button>

  {#if open}
    <div class="scrim" role="presentation" onclick={() => (open = false)}></div>
    <div class="pop" role="dialog" aria-label="Choose time zone" use:fitOnScreen transition:scale={{ start: 0.94, duration: view.reducedMotion ? 0 : 200, easing: cubicOut }}>
      <label class="search">
        <Icon name="search" size={15} />
        <input bind:this={input} bind:value={q} oninput={() => (active = 0)} onkeydown={onKey} placeholder="City or region…" aria-label="Search time zones" />
      </label>

      {#if replacing}
        <div class="replace" transition:slide={{ duration: view.reducedMotion ? 0 : 180 }}>
          <p>You can compare two cities. Replace one with <strong>{zoneCity(replacing)}</strong>?</p>
          <div class="choices">
            {#each pinned as z (z)}
              <button class="btn btn-soft small" onclick={() => replaceWith(z)}>{zoneCity(z)}</button>
            {/each}
            <button class="btn btn-quiet small" onclick={() => (replacing = null)}>Cancel</button>
          </div>
        </div>
      {:else if pinned.length && !q.trim()}
        <div class="comparing" transition:slide={{ duration: view.reducedMotion ? 0 : 180 }}>
          <p class="head">
            Comparing
            {#if !settings.value.worldClock.onDial}<span>· not on the dial</span>{/if}
          </p>
          <ul>
            {#each pinned as z (z)}
              <li class="row">
                <button class="opt cmp" onclick={() => choose(z)} title={`Make ${zoneCity(z)} the main time`}>
                  <SkyDot zone={z} now={clock.minute} finish={view.finish} />
                  <span class="city">{zoneCity(z)}</span>
                  <span class="meta tnum">{ahead(z)}</span>
                  <span class="time tnum">{localTime(z)}</span>
                </button>
                <button class="pin on" onclick={() => pin(z)} aria-label={`Stop comparing ${zoneCity(z)}`} title="Stop comparing">
                  <Icon name="x" size={14} stroke={2.2} />
                </button>
              </li>
            {/each}
          </ul>
        </div>
      {/if}

      <ul role="listbox">
        {#each results as z, i (z)}
          {@const isPinned = settings.value.worldClock.zones.includes(z) && z !== current}
          <li class="row" class:hl={i === active}>
            <button class="opt" class:on={z === current} role="option" aria-selected={z === current} onclick={() => choose(z)} onpointerenter={() => (active = i)}>
              <span class="city">
                {zoneCity(z)}
                {#if z === system}<em>{thisDevice}</em>{/if}
              </span>
              <span class="meta tnum">{z.split('/')[0]} · {zoneOffsetLabel(z)}</span>
              <span class="time tnum">{localTime(z)}</span>
            </button>
            {#if z !== current}
              <button
                class="pin"
                class:on={isPinned}
                aria-pressed={isPinned}
                onclick={() => pin(z)}
                onpointerenter={() => (active = i)}
                aria-label={isPinned ? `Stop comparing ${zoneCity(z)}` : `Compare ${zoneCity(z)}`}
                title={isPinned ? 'Stop comparing' : `Compare beside ${zoneCity(current)} (Shift+Enter)`}
              >
                <Icon name="pin" size={14} stroke={2.1} />
              </button>
            {:else}
              <span class="pin-space" aria-hidden="true"></span>
            {/if}
          </li>
        {:else}
          <li class="none">No zone matches “{q}”.</li>
        {/each}
      </ul>
      {#if !pinned.length && !q.trim()}
        <p class="foot"><Icon name="pin" size={12} stroke={2.1} /> Pin up to {MAX_COMPARE} cities to compare their day and night on the dial.</p>
      {/if}
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
  .dots {
    display: inline-flex;
    gap: 3px;
    margin-left: 1px;
  }
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 44;
  }
  .pop {
    /* inside the top bar, which keeps its own items on one line */
    white-space: normal;
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    z-index: 45;
    width: min(330px, calc(100vw - 32px));
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
    /* Both lists keep the scrollbar's room, so their times and pins line up. */
    scrollbar-gutter: stable;
  }
  .pin-space {
    flex: none;
    width: 28px;
    margin-right: 4px;
  }
  .comparing {
    border-bottom: 1px solid var(--line);
    background: var(--surface);
  }
  .comparing ul {
    padding-top: 0;
  }
  .head {
    margin: 0;
    padding: 10px 16px 4px;
    font-size: var(--t-xs);
    font-weight: 500;
    color: var(--ink-3);
  }
  .head span {
    font-weight: 400;
  }
  .row {
    position: relative;
    display: flex;
    align-items: center;
    border-radius: var(--r-sm);
  }
  .row.hl,
  .row:has(.cmp:hover) {
    background: var(--sunken);
  }
  .opt {
    flex: 1;
    min-width: 0;
    display: grid;
    grid-template-columns: 1fr auto;
    grid-template-areas: 'city time' 'meta time';
    column-gap: 10px;
    padding: 7px 4px 7px 10px;
    border-radius: var(--r-sm);
    text-align: left;
  }
  .opt.cmp {
    grid-template-columns: auto 1fr auto;
    grid-template-areas: 'dot city time' 'dot meta time';
  }
  .opt.cmp :global(.sky) {
    grid-area: dot;
    align-self: center;
  }
  .opt.on .city {
    color: var(--focus-ring);
  }
  .city {
    grid-area: city;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
  .pin {
    flex: none;
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    margin-right: 4px;
    border-radius: var(--r-pill);
    color: var(--ink-3);
    opacity: 0;
    transition:
      opacity var(--dur-1) var(--ease-out),
      background var(--dur-1) var(--ease-out),
      color var(--dur-1) var(--ease-out),
      transform var(--dur-1) var(--ease-out);
  }
  .row.hl .pin,
  .row:hover .pin,
  .pin:focus-visible,
  .pin.on {
    opacity: 1;
  }
  /* A touch screen has no hover to reveal the pin: it always shows. */
  @media (hover: none) {
    .pin {
      opacity: 1;
    }
  }
  .pin:hover {
    background: color-mix(in srgb, var(--ink) 8%, transparent);
    color: var(--ink);
  }
  .pin:active {
    transform: scale(0.9);
  }
  .pin.on[aria-pressed='true'] {
    color: var(--focus-ring);
    background: color-mix(in srgb, var(--focus-ring) 14%, transparent);
  }
  .replace {
    padding: 12px 16px 14px;
    border-bottom: 1px solid var(--line);
    background: var(--surface);
    font-size: var(--t-sm);
  }
  .replace p {
    margin: 0 0 10px;
    color: var(--ink-2);
    line-height: 1.4;
  }
  .replace strong {
    color: var(--ink);
    font-weight: 500;
  }
  .choices {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .btn.small {
    height: 30px;
    padding: 0 12px;
  }
  .none {
    padding: 14px;
    font-size: var(--t-sm);
    color: var(--ink-3);
  }
  .foot {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    padding: 8px 16px 12px;
    border-top: 1px solid var(--line);
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
</style>
