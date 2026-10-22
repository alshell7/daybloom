<script lang="ts">
  // Settings › Rhythm › World clock: your own city and up to two to compare. Each city gets a
  // bar of today (your midnight to midnight) in its real day and night, aligned so you read
  // "9 pm there when it's 4 pm here" straight down; hovering the bars reads any moment.
  import { thisDevice } from '../../lib/platform';
  import { flip } from 'svelte/animate';
  import { slide } from 'svelte/transition';
  import { tick } from 'svelte';
  import { activeTimeZone, addDays, formatTime, startOfDayMs, systemTimeZone, todayISO, zoneCity } from '../../lib/engine/time';
  import Icon from '../../lib/Icon.svelte';
  import SkyDot from '../../lib/dial/SkyDot.svelte';
  import { solarAltitude } from '../../lib/dial/sun';
  import { aheadLabel, dayShift, hourMarks, MAX_COMPARE, pinZone, placeOf, replaceZone, skyColor, skyFor, timeIn, weekdayIn } from '../../lib/dial/world';
  import { clock } from '../../lib/stores/clock.svelte';
  import { settings } from '../../lib/stores/settings.svelte';
  import { view } from '../../lib/stores/view.svelte';

  const system = systemTimeZone();
  const now = $derived(clock.minute);
  const primary = $derived((clock.zone, activeTimeZone()));
  const compare = $derived(settings.value.worldClock.zones.filter((z) => z !== primary));
  const rm = $derived(view.reducedMotion);

  // ---- today, side by side ---------------------------------------------------
  const day = $derived.by(() => {
    void clock.zone;
    const iso = todayISO(now);
    const start = startOfDayMs(iso);
    return { start, span: startOfDayMs(addDays(iso, 1)) - start };
  });
  const pct = (t: number) => ((t - day.start) / day.span) * 100;

  /** A city's day as a CSS gradient, sampled every 10 minutes, plus its 0 / 6 / 12 / 18 marks. */
  function barOf(zone: string) {
    const sky = skyFor(view.finish);
    const place = placeOf(zone, now);
    const n = Math.round(day.span / 600_000);
    const c: string[] = [];
    for (let i = 0; i <= n; i++) c.push(skyColor(solarAltitude(day.start + (day.span * i) / n, place.lat, place.lng), sky));
    // Keep a sample only where a colour run starts or ends: flat day and night need two stops.
    const stops: string[] = [];
    for (let i = 0; i <= n; i++) if (i === 0 || i === n || c[i] !== c[i - 1] || c[i] !== c[i + 1]) stops.push(`${c[i]} ${((i / n) * 100).toFixed(2)}%`);
    // Its own 0 / 6 / 12 / 18 (a moon, ticks and a sun); none on the bar's very ends.
    const marks = hourMarks({ originMs: day.start, spanMs: day.span, startMs: day.start }, zone)
      .filter((m) => m.hour % 6 === 0 && pct(m.t) > 1.5 && pct(m.t) < 98.5)
      .map((m) => ({
        at: pct(m.t),
        kind: m.hour === 12 ? 'sun' : m.hour === 0 ? 'moon' : 'tick',
        color: solarAltitude(m.t, place.lat, place.lng) < -3 ? sky.markNight : sky.markDay,
      }));
    return { bg: `linear-gradient(90deg, ${stops.join(', ')})`, marks, sky };
  }

  const rows = $derived([primary, ...compare].map((z, i) => ({ zone: z, main: i === 0, bar: barOf(z) })));
  const nowAt = $derived(pct(now));
  const axis = $derived([0, 6, 12, 18, 24].map((h) => ({ at: (h / 24) * 100, label: h === 24 ? '' : formatTime(day.start + h * 3_600_000, view.hour12).replace(':00', '') })));

  // Hovering the bars reads every city at that moment.
  let hoverAt = $state<number | null>(null);
  function onHover(e: PointerEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    hoverAt = Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100));
  }
  const hoverT = $derived(hoverAt == null ? null : day.start + (hoverAt / 100) * day.span);

  function timeOf(z: string, t: number) {
    const d = dayShift(t, z, primary);
    return `${timeIn(t, z, view.hour12)}${d ? ` ${weekdayIn(t, z)}` : ''}`;
  }

  // ---- add, remove, reorder ------------------------------------------------------
  let adding = $state(false);
  let q = $state('');
  let active = $state(0);
  let replacing = $state<string | null>(null);
  let input: HTMLInputElement | undefined = $state();

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
    const skip = (z: string) => z === primary || compare.includes(z);
    if (!needle) return [...settings.value.recentZones, ...POPULAR].filter((z, i, all) => !skip(z) && all.indexOf(z) === i).slice(0, 6);
    return ALL.filter((z) => !skip(z) && z.toLowerCase().includes(needle)).slice(0, 6);
  });

  async function startAdd() {
    adding = true;
    q = '';
    active = 0;
    await tick();
    input?.focus();
  }
  function add(z: string) {
    const r = pinZone(compare, z, primary);
    if (r.full) {
      replacing = z;
      return;
    }
    settings.value.worldClock.zones = r.zones;
    adding = false;
    replacing = null;
  }
  function replaceWith(old: string) {
    if (!replacing) return;
    settings.value.worldClock.zones = replaceZone(compare, old, replacing);
    replacing = null;
    adding = false;
  }
  function remove(z: string) {
    settings.value.worldClock.zones = settings.value.worldClock.zones.filter((x) => x !== z);
  }
  function swap() {
    if (compare.length === 2) settings.value.worldClock.zones = [compare[1], compare[0]];
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      active = Math.min(results.length - 1, active + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      active = Math.max(0, active - 1);
    } else if (e.key === 'Enter' && results[active]) {
      e.preventDefault();
      add(results[active]);
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      if (replacing) replacing = null;
      else adding = false;
    }
  }
</script>

<section aria-labelledby="world-heading">
  <h3 id="world-heading">World clock</h3>
  <p class="hint top">Compare your time with up to {MAX_COMPARE} other cities. Each bar is today, from your midnight to midnight, in that city's real daylight.</p>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="cities" onpointermove={onHover} onpointerleave={() => (hoverAt = null)}>
    {#each rows as r, i (r.zone)}
      <div class="city" class:main={r.main} animate:flip={{ duration: rm ? 0 : 260 }}>
        <SkyDot zone={r.zone} {now} finish={view.finish} size={20} />
        <span class="name">
          <strong>{zoneCity(r.zone)}</strong>
          <small>{r.main ? `Your time${r.zone === system ? ` · ${thisDevice}` : ''}` : `${aheadLabel(now, r.zone, primary)} · ${r.zone.split('/')[0].replaceAll('_', ' ')}`}</small>
        </span>
        <span class="time tnum" class:reading={hoverT != null}>{timeOf(r.zone, hoverT ?? now)}</span>
        <span class="tools">
          {#if !r.main}
            {#if compare.length === 2}
              <button class="icon-btn sm" onclick={swap} aria-label={i === 1 ? `Move ${zoneCity(r.zone)} down` : `Move ${zoneCity(r.zone)} up`} title={i === 1 ? 'Move down (outer ring)' : 'Move up (inner ring)'}>
                <Icon name={i === 1 ? 'chevron-down' : 'chevron-up'} size={15} stroke={2.1} />
              </button>
            {/if}
            <button class="icon-btn sm" onclick={() => remove(r.zone)} aria-label={`Stop comparing ${zoneCity(r.zone)}`} title="Remove">
              <Icon name="x" size={15} stroke={2.1} />
            </button>
          {/if}
        </span>
        <span class="bar" style:background={r.bar.bg} aria-hidden="true">
          {#each r.bar.marks as m (m.at)}
            {#if m.kind === 'tick'}
              <i class="tick" style:left={`${m.at}%`} style:background={m.color}></i>
            {:else}
              <i class="glyph" style:left={`${m.at}%`}><Icon name={m.kind} size={9} stroke={2.6} color={m.kind === 'sun' ? r.bar.sky.sun : r.bar.sky.moon} /></i>
            {/if}
          {/each}
          <i class="now" style:left={`${nowAt}%`}></i>
          {#if hoverAt != null}<i class="probe" style:left={`${hoverAt}%`}></i>{/if}
        </span>
      </div>
    {/each}
    <div class="axis tnum" aria-hidden="true">
      {#each axis as a (a.at)}<span style:left={`${a.at}%`}>{a.label}</span>{/each}
    </div>
  </div>

  {#if replacing}
    <div class="replace" transition:slide={{ duration: rm ? 0 : 180 }}>
      <p>You can compare two cities. Replace one with <strong>{zoneCity(replacing)}</strong>?</p>
      <div class="choices">
        {#each compare as z (z)}<button class="btn btn-soft small" onclick={() => replaceWith(z)}>{zoneCity(z)}</button>{/each}
        <button class="btn btn-quiet small" onclick={() => (replacing = null)}>Cancel</button>
      </div>
    </div>
  {:else if adding}
    <div class="adder" transition:slide={{ duration: rm ? 0 : 180 }}>
      <label class="search">
        <Icon name="search" size={15} />
        <input bind:this={input} bind:value={q} oninput={() => (active = 0)} onkeydown={onKey} placeholder="City or region…" aria-label="Find a city to compare" />
        <button class="icon-btn sm" onclick={() => (adding = false)} aria-label="Close"><Icon name="x" size={14} /></button>
      </label>
      <ul role="listbox" aria-label="Cities">
        {#each results as z, i (z)}
          <li>
            <button class="opt" class:hl={i === active} role="option" aria-selected={i === active} onclick={() => add(z)} onpointerenter={() => (active = i)}>
              <span>{zoneCity(z)} <em>{z.split('/')[0]}</em></span>
              <span class="tnum">{timeIn(now, z, view.hour12)} · {aheadLabel(now, z, primary)}</span>
            </button>
          </li>
        {:else}
          <li class="none">No zone matches “{q}”.</li>
        {/each}
      </ul>
    </div>
  {:else}
    <button class="btn btn-soft add" onclick={startAdd}>
      <Icon name="plus" size={15} stroke={2.1} />
      {compare.length >= MAX_COMPARE ? 'Replace a city' : 'Add a city'}
    </button>
  {/if}

  <label class="row">
    <span>Show on the dial</span>
    <input type="checkbox" class="switch" bind:checked={settings.value.worldClock.onDial} disabled={!compare.length} />
  </label>
  <p class="hint">
    {#if compare.length}The first city rings the dial nearest the bezel.{/if}
    Your time is the one the whole app follows: change it from the globe chip in the top bar, where you can also pin cities. Picking a compared city there swaps the two.
  </p>
</section>

<style>
  section {
    padding: var(--s-4) 0;
    border-top: 1px solid var(--line);
  }
  h3 {
    margin: 0 0 var(--s-3);
    font-family: var(--font-ui);
    font-size: var(--t-md);
    font-weight: 500;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-3);
    min-height: 40px;
    font-size: var(--t-sm);
  }
  /* A phone: a control that doesn't fit beside its label goes under it, on the right. */
  @media (max-width: 480px) {
    .row {
      flex-wrap: wrap;
      row-gap: var(--s-2);
    }
    .row > :last-child:not(:first-child) {
      margin-left: auto;
    }
    /* A switch stays beside its words; the words wrap instead. */
    .row:has(> .switch) > :first-child {
      flex: 1 1 0;
      min-width: 0;
    }
  }
  .row > span:first-child {
    color: var(--ink-2);
  }
  .hint {
    margin: var(--s-2) 0 0;
    font-size: var(--t-xs);
    color: var(--ink-3);
    line-height: 1.5;
  }
  .hint.top {
    margin: -6px 0 var(--s-3);
  }

  .cities {
    display: grid;
    gap: 10px;
    padding: 12px 12px 6px;
    border-radius: var(--r-md);
    background: var(--surface);
    border: 1px solid var(--line);
  }
  .city {
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr) auto auto;
    grid-template-areas: 'dot name time tools' '. bar bar bar';
    align-items: center;
    column-gap: 10px;
    row-gap: 6px;
  }
  .city :global(.sky) {
    grid-area: dot;
  }
  .name {
    grid-area: name;
    display: grid;
    min-width: 0;
    line-height: 1.25;
  }
  .name strong {
    font-family: var(--font-ui);
    font-size: var(--t-sm);
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .name small {
    font-size: var(--t-xs);
    color: var(--ink-3);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .time {
    grid-area: time;
    font-family: var(--font-ui);
    font-size: var(--t-md);
    font-weight: 300;
    transition: color var(--dur-1) var(--ease-out);
  }
  .time.reading {
    color: var(--focus-ring);
  }
  .tools {
    grid-area: tools;
    display: flex;
    gap: 2px;
    min-width: 0;
  }
  .icon-btn.sm {
    width: 28px;
    height: 28px;
  }
  .bar {
    grid-area: bar;
    position: relative;
    height: 12px;
    border-radius: 6px;
    box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.06);
    cursor: crosshair;
  }
  .bar i {
    position: absolute;
    top: 50%;
    pointer-events: none;
  }
  .tick {
    width: 2px;
    height: 6px;
    margin: -3px 0 0 -1px;
    border-radius: 1px;
  }
  .glyph {
    display: grid;
    place-items: center;
    width: 9px;
    height: 9px;
    margin: -4.5px 0 0 -4.5px;
  }
  .glyph :global(svg) {
    display: block;
  }
  .now {
    width: 2px;
    height: 18px;
    margin: -9px 0 0 -1px;
    border-radius: 1px;
    background: var(--signal);
    box-shadow: 0 0 0 1.5px var(--surface);
  }
  .probe {
    width: 1.5px;
    height: 18px;
    margin: -9px 0 0 -0.75px;
    border-radius: 1px;
    background: var(--ink);
  }
  .axis {
    position: relative;
    height: 14px;
    margin-left: 30px;
    font-size: 10.5px;
    color: var(--ink-3);
  }
  .axis span {
    position: absolute;
    transform: translateX(-50%);
  }
  .axis span:first-child {
    transform: none;
  }

  .add {
    margin-top: var(--s-3);
    height: 32px;
    padding: 0 14px;
  }
  .adder,
  .replace {
    margin-top: var(--s-3);
    border-radius: var(--r-md);
    border: 1px solid var(--line-strong);
    background: var(--raised);
    overflow: hidden;
  }
  .search {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 6px 0 12px;
    height: 40px;
    border-bottom: 1px solid var(--line);
    color: var(--ink-3);
  }
  .search input {
    flex: 1;
    min-width: 0;
    border: 0;
    background: transparent;
    outline: none;
    font-size: var(--t-sm);
    color: var(--ink);
  }
  .adder ul {
    list-style: none;
    margin: 0;
    padding: 4px;
  }
  .opt {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    width: 100%;
    padding: 7px 10px;
    border-radius: var(--r-sm);
    font-size: var(--t-sm);
    text-align: left;
  }
  .opt.hl {
    background: var(--sunken);
  }
  .opt em {
    font-style: normal;
    font-size: var(--t-xs);
    color: var(--ink-3);
    margin-left: 4px;
  }
  .opt .tnum {
    color: var(--ink-3);
    font-size: var(--t-xs);
    white-space: nowrap;
  }
  .none {
    padding: 10px;
    font-size: var(--t-sm);
    color: var(--ink-3);
  }
  .replace {
    padding: 12px 14px;
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
</style>
