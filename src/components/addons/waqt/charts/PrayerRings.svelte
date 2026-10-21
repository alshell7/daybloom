<script lang="ts">
  // A ring per prayer, like a small dial: its arcs are how that prayer went this period (in
  // jamaat, on time, made up), the bare track is what wasn't marked, the centre says how many
  // were prayed, and its current run of on-time days sits beneath. The arcs sweep in once
  // with a little overshoot; hover or arrow keys give the numbers.
  import { untrack } from 'svelte';
  import { backOut, linear } from 'svelte/easing';
  import { Tween } from 'svelte/motion';
  import type { PrayerStat } from '../../../../lib/addons/waqt/analytics';
  import { PRAYER_ICON, PRAYER_NAME, type PrayerId } from '../../../../lib/addons/waqt/types';
  import Icon from '../../../../lib/Icon.svelte';
  import ChartTip from './ChartTip.svelte';
  import { boxIn, KIND_WORD, step, type Box } from './kinds';

  let { prayers, streaks, reduced = false }: { prayers: PrayerStat[]; streaks: Partial<Record<PrayerId, number>>; reduced?: boolean } = $props();

  const GAP = 1.6;
  const rings = $derived(
    prayers.map((p) => {
      const total = Math.max(1, p.counted);
      const raw = (['jamaat', 'ontime', 'late'] as const).map((k) => ({ k, len: (p[k] / total) * 100 })).filter((s) => s.len > 0);
      let at = 0;
      const segs = raw.map((s) => {
        const out = { ...s, at };
        at += s.len;
        return out;
      });
      const streak = streaks[p.id] ?? p.streak;
      const label = p.counted
        ? `${PRAYER_NAME[p.id]}: ${p.prayed} of ${p.counted} prayed — ${p.jamaat} in jamaat, ${p.ontime} on time, ${p.late} made up, ${p.missed} not marked.${streak >= 2 ? ` On time ${streak} days in a row.` : ''}`
        : `${PRAYER_NAME[p.id]}: nothing counted yet.`;
      return { p, segs, filled: at, streak, label };
    }),
  );

  // One clock for the sweep; each ring starts a beat after the one before.
  const SWEEP = 900;
  const BEAT = 90;
  const t = new Tween(0, { duration: SWEEP + BEAT * 4, easing: linear });
  $effect(() => {
    untrack(() => (reduced ? t.set(1, { duration: 0 }) : t.set(1)));
  });
  const progress = (i: number) => backOut(Math.min(1, Math.max(0, (t.current * (SWEEP + BEAT * 4) - i * BEAT) / SWEEP)));
  function dash(seg: { at: number; len: number }, i: number, last: boolean, n: number) {
    const f = progress(i) * rings[i].filled;
    const room = (last ? 100 - seg.at : seg.len) - (n > 1 ? GAP : 0);
    const vis = Math.max(0, Math.min(f - seg.at, room));
    return `${vis} ${100 - vis}`;
  }

  let chart = $state<HTMLDivElement>();
  let cells: HTMLElement[] = $state([]);
  let active = $state(0);
  let shown = $state<{ i: number; box: Box } | null>(null);
  function show(i: number) {
    if (!chart || !cells[i]) return;
    shown = { i, box: boxIn(cells[i], chart) };
  }
  function onkey(e: KeyboardEvent) {
    const next = step(e.key, active, rings.length);
    if (next == null) return;
    e.preventDefault();
    active = next;
    cells[next]?.focus();
  }
</script>

<div class="rings" class:still={reduced} bind:this={chart} role="presentation" onpointerleave={() => (shown = null)}>
  <div class="row" role="grid" aria-label="Each prayer this period" tabindex="-1" onkeydown={onkey}>
    <div class="cells" role="row">
      {#each rings as r, i (r.p.id)}
        <div
          class="ring"
          class:on={shown?.i === i}
          role="gridcell"
          tabindex={i === active ? 0 : -1}
          aria-label={r.label}
          bind:this={cells[i]}
          onpointerenter={() => show(i)}
          onfocus={() => ((active = i), show(i))}
          onblur={() => (shown = null)}
        >
          <span class="dial" aria-hidden="true">
            <svg viewBox="0 0 64 64">
              <g transform="rotate(-90 32 32)">
                <circle class="track" cx="32" cy="32" r="27" pathLength="100" />
                {#each r.segs as s, j (s.k)}
                  <circle class="seg" cx="32" cy="32" r="27" pathLength="100" stroke={`var(--k-${s.k})`} stroke-dasharray={dash(s, i, j === r.segs.length - 1, r.segs.length)} stroke-dashoffset={-s.at} />
                {/each}
              </g>
            </svg>
            <span class="mid tnum" style:--d={`${i * BEAT + 380}ms`}>
              {#if r.p.counted}<b>{r.p.prayed}</b><small>of {r.p.counted}</small>{:else}<small>–</small>{/if}
            </span>
          </span>
          <span class="nm" aria-hidden="true"><Icon name={PRAYER_ICON[r.p.id]} size={12} />{PRAYER_NAME[r.p.id]}</span>
          <span class="st tnum" aria-hidden="true">{#if r.streak >= 2}<Icon name="flame" size={11} />{r.streak} days{/if}</span>
        </div>
      {/each}
    </div>
  </div>
  {#if shown && rings[shown.i]}
    {@const r = rings[shown.i]}
    <ChartTip box={shown.box}>
      <b>{r.p.counted ? `${r.p.prayed} of ${r.p.counted} prayed` : 'Nothing counted yet'}</b>
      <span class="dim">{PRAYER_NAME[r.p.id]}</span>
      {#each [['jamaat', r.p.jamaat], ['ontime', r.p.ontime], ['late', r.p.late], ['missed', r.p.missed]] as const as [k, v] (k)}
        {#if v}<span class="k"><i style:background={`var(--k-${k})`}></i>{KIND_WORD[k]}<em>{v}</em></span>{/if}
      {/each}
      {#if r.streak >= 2}<span class="dim">On time {r.streak} days in a row</span>{/if}
    </ChartTip>
  {/if}
</div>

<style>
  .rings {
    position: relative;
    container-type: inline-size;
  }
  .row {
    outline: none;
  }
  .cells {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 6px;
  }
  .ring {
    display: grid;
    justify-items: center;
    gap: 3px;
    min-width: 0;
    padding: 6px 0 4px;
    border-radius: var(--r-md);
    transition: background var(--dur-1) var(--ease-out);
  }
  .ring.on {
    background: color-mix(in srgb, var(--ink) 5%, transparent);
  }
  .ring:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 0;
  }
  .dial {
    position: relative;
    display: block;
    width: min(68px, 100%);
    aspect-ratio: 1;
  }
  svg {
    display: block;
    width: 100%;
    height: 100%;
  }
  circle {
    fill: none;
    stroke-width: 7;
  }
  .track {
    stroke: var(--k-missed);
  }
  .seg {
    stroke-linecap: butt;
  }
  .mid {
    position: absolute;
    inset: 0;
    display: grid;
    place-content: center;
    justify-items: center;
    line-height: 1;
    animation: up 360ms var(--ease-out) var(--d) backwards;
  }
  .mid b {
    font-size: var(--t-md);
    font-weight: 500;
  }
  .mid small {
    margin-top: 2px;
    font-size: 10px;
    color: var(--ink-3);
  }
  .nm {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    max-width: 100%;
    font-size: var(--t-xs);
    font-weight: 500;
    color: var(--ink-2);
    white-space: nowrap;
  }
  .nm :global(svg) {
    flex: none;
    color: var(--ink-3);
  }
  .st {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    min-height: 14px;
    font-size: 10.5px;
    color: var(--ink-3);
    white-space: nowrap;
  }
  .st :global(svg) {
    color: var(--green);
  }
  /* Narrow panels: the names alone. */
  @container (max-width: 370px) {
    .nm :global(svg) {
      display: none;
    }
  }
  @keyframes up {
    from {
      opacity: 0;
      transform: translateY(3px);
    }
  }
  .still .mid,
  :global([data-motion='calm']) .mid {
    animation: none;
  }
</style>
