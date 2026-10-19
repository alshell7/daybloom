<script lang="ts">
  // The screen-cues window: transparent, click-through, over the whole display.
  //  · Edge glow — the screen's edge breathes in the colour of what you're doing; slower when
  //    there's time, quicker in the last five minutes and the last minute. Opacity only.
  //  · Time bar — a thin bar on any edge drains as the time goes, with the minutes at its tip.
  //  · HUD — a small pill in a corner: a ring, the name, the time left.
  // Per-second values are set without transitions; every loop is compositor-only.
  import { onMount } from 'svelte';
  import { cubicOut } from 'svelte/easing';
  import { fade, fly } from 'svelte/transition';
  import { formatTime } from '../lib/engine/time';
  import Icon from '../lib/Icon.svelte';
  import { platform, type ScreenMetrics } from '../lib/platform';
  import { cueSubject } from '../lib/screenCues.svelte';
  import { clock } from '../lib/stores/clock.svelte';
  import { settings } from '../lib/stores/settings.svelte';
  import { view } from '../lib/stores/view.svelte';

  const cfg = $derived(settings.value.screen);
  const s = $derived(cueSubject(clock.now));
  const reduced = $derived(view.reducedMotion);

  // Work area (menu bar, Dock, taskbar) so the bar and HUD never hide under them.
  let metrics = $state<ScreenMetrics | null>(null);
  const inset = $derived.by(() => {
    if (!metrics) return { top: 0, right: 0, bottom: 0, left: 0 };
    const { screen, work } = metrics;
    return { top: work.y, left: work.x, right: screen.width - work.x - work.width, bottom: screen.height - work.y - work.height };
  });
  onMount(() => {
    const read = () => platform.screenMetrics().then((m) => (metrics = m)).catch(() => {});
    read();
    const t = setInterval(read, 30_000);
    addEventListener('resize', read);
    return () => {
      clearInterval(t);
      removeEventListener('resize', read);
    };
  });

  const stage = $derived.by(() => {
    if (!s) return 'none';
    if (s.paused) return 'paused';
    if (s.kind === 'break') return 'break';
    if (s.remainingMs <= 60_000) return 'final';
    if (s.remainingMs <= 5 * 60_000) return 'urgent';
    return 'calm';
  });

  function left(ms: number): string {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const sec = total % 60;
    if (h) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    return `${m}:${String(sec).padStart(2, '0')}`;
  }
  function short(ms: number): string {
    if (ms < 60_000) return `${Math.ceil(ms / 1000)}s`;
    const m = Math.ceil(ms / 60_000);
    return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
  }

  // The bar's tip gives one soft drip each minute.
  const minuteMark = $derived(s ? Math.ceil(s.remainingMs / 60_000) : 0);

  const vertical = $derived(cfg.barDock === 'left' || cfg.barDock === 'right');
  // When the HUD shares an edge with the bar, it steps clear of the bar and its label.
  const hudShift = $derived.by(() => {
    if (!cfg.bar) return { x: 0, y: 0 };
    const [v, h] = cfg.hudCorner.split('-');
    if (cfg.barDock === v) return { x: 0, y: 26 };
    if (cfg.barDock === h) return { x: 46, y: 0 };
    return { x: 0, y: 0 };
  });
  const R = 13;
  const CIRC = 2 * Math.PI * R;
</script>

<div
  class="ov"
  style:--c={s?.color ?? 'transparent'}
  style:--in-top={`${inset.top}px`}
  style:--in-right={`${inset.right}px`}
  style:--in-bottom={`${inset.bottom}px`}
  style:--in-left={`${inset.left}px`}
  aria-hidden="true"
>
  {#if s && cfg.glow}
    <div class="glow {cfg.glowStrength} {stage}" class:reduced transition:fade={{ duration: reduced ? 0 : 900 }}></div>
  {/if}

  {#if s && cfg.bar}
    <div class="bar {cfg.barDock} {cfg.barSize} {stage}" class:vertical transition:fade={{ duration: reduced ? 0 : 500 }}>
      <span class="track"></span>
      <span class="fill" style:transform={vertical ? `scaleY(${s.left})` : `scaleX(${s.left})`}></span>
      <span class="tip" style={vertical ? `bottom: calc(${s.left * 100}% - 5px)` : `left: calc(${s.left * 100}% - 5px)`}>
        {#key minuteMark}<i class:drip={!reduced}></i>{/key}
      </span>
      <span class="label tnum" style={vertical ? `bottom: calc(${s.left * 100}% + 8px)` : `left: calc(${s.left * 100}% + 10px)`}>{short(s.remainingMs)}</span>
    </div>
  {/if}

  {#if s && cfg.hud}
    <div class="hud {cfg.hudCorner} {stage}" style:--sx={`${hudShift.x}px`} style:--sy={`${hudShift.y}px`} in:fly={{ y: cfg.hudCorner.startsWith('top') ? -12 : 12, duration: reduced ? 0 : 420, easing: cubicOut }} out:fade={{ duration: reduced ? 0 : 200 }}>
      <svg class="ring" viewBox="0 0 32 32">
        <circle class="r-track" cx="16" cy="16" r={R} />
        <circle class="r-fill" cx="16" cy="16" r={R} stroke-dasharray={CIRC} stroke-dashoffset={CIRC * (1 - s.left)} />
      </svg>
      <span class="icon"><Icon name={s.icon} size={13} stroke={2.2} /></span>
      <span class="txt">
        <b>{s.title}</b>
        <small class="tnum">{s.paused ? 'Paused' : s.round ?? `until ${formatTime(s.endMs, view.hour12)}`}</small>
      </span>
      <span class="time tnum">{left(s.remainingMs)}</span>
    </div>
  {/if}
</div>

<style>
  :global(html.widget-mode),
  :global(html.widget-mode body) {
    background: transparent !important;
  }
  .ov {
    position: fixed;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
    font-family: var(--font-ui);
  }

  /* ---- edge glow: painted once, then only its opacity breathes */
  .glow {
    position: absolute;
    inset: 0;
    --w: 90px;
    --a: 0.5;
    box-shadow:
      inset 0 0 var(--w) calc(var(--w) * 0.18) color-mix(in srgb, var(--c) calc(var(--a) * 100%), transparent),
      inset 0 0 calc(var(--w) * 0.25) 0 color-mix(in srgb, var(--c) calc(var(--a) * 70%), transparent);
    opacity: 0.35;
    will-change: opacity;
    animation: breathe 6s ease-in-out infinite;
  }
  .glow.soft {
    --w: 56px;
    --a: 0.38;
  }
  .glow.strong {
    --w: 140px;
    --a: 0.62;
  }
  .glow.break {
    animation-duration: 8s;
  }
  .glow.urgent {
    animation-duration: 3.6s;
    --a: 0.7;
  }
  .glow.final {
    animation-duration: 1.9s;
    --a: 0.8;
  }
  .glow.paused,
  .glow.reduced {
    animation: none;
    opacity: 0.3;
  }
  @keyframes breathe {
    0%,
    100% {
      opacity: 0.22;
    }
    42% {
      opacity: 0.95;
    }
    55% {
      opacity: 0.95;
    }
  }

  /* ---- time bar */
  .bar {
    position: absolute;
    --t: 4px;
  }
  .bar.bold {
    --t: 8px;
  }
  .bar.top {
    top: var(--in-top);
    left: var(--in-left);
    right: var(--in-right);
    height: var(--t);
  }
  .bar.bottom {
    bottom: var(--in-bottom);
    left: var(--in-left);
    right: var(--in-right);
    height: var(--t);
  }
  .bar.left {
    left: var(--in-left);
    top: var(--in-top);
    bottom: var(--in-bottom);
    width: var(--t);
  }
  .bar.right {
    right: var(--in-right);
    top: var(--in-top);
    bottom: var(--in-bottom);
    width: var(--t);
  }
  .track,
  .fill {
    position: absolute;
    inset: 0;
  }
  .track {
    background: color-mix(in srgb, var(--c) 16%, transparent);
  }
  .fill {
    background: linear-gradient(90deg, color-mix(in srgb, var(--c) 82%, white), var(--c));
    transform-origin: left center;
    animation: sweep 900ms var(--ease-out) both;
  }
  .vertical .fill {
    background: linear-gradient(0deg, var(--c), color-mix(in srgb, var(--c) 82%, white));
    transform-origin: center bottom;
  }
  @keyframes sweep {
    from {
      clip-path: inset(0 100% 0 0);
    }
    to {
      clip-path: inset(0 0 0 0);
    }
  }
  .tip {
    position: absolute;
    width: 10px;
    height: 10px;
    top: calc(50% - 5px);
  }
  .vertical .tip {
    top: auto;
    left: calc(50% - 5px);
  }
  .tip i {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: var(--c);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--c) 30%, transparent);
  }
  .tip i.drip {
    animation: drip 1.2s var(--ease-out);
  }
  @keyframes drip {
    0% {
      transform: scale(1);
    }
    30% {
      transform: scale(1.8);
      box-shadow: 0 0 0 6px color-mix(in srgb, var(--c) 18%, transparent);
    }
    100% {
      transform: scale(1);
    }
  }
  .urgent .tip i,
  .final .tip i {
    animation: tick 2s ease-in-out infinite;
  }
  .final .tip i {
    animation-duration: 1s;
  }
  @keyframes tick {
    50% {
      transform: scale(1.5);
    }
  }
  .label {
    position: absolute;
    top: calc(100% + 4px);
    padding: 1px 7px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 500;
    color: #fff;
    background: color-mix(in srgb, var(--c) 88%, black);
    white-space: nowrap;
  }
  .bottom .label {
    top: auto;
    bottom: calc(100% + 4px);
  }
  .vertical .label {
    top: auto;
    left: calc(100% + 6px);
  }
  .right .label {
    left: auto;
    right: calc(100% + 6px);
  }

  /* ---- HUD */
  .hud {
    position: absolute;
    display: flex;
    align-items: center;
    gap: 9px;
    max-width: 320px;
    padding: 7px 14px 7px 7px;
    border-radius: 999px;
    color: #f5f7fb;
    background: rgb(18 22 32 / 0.84);
    box-shadow:
      0 1px 0 rgb(255 255 255 / 0.08) inset,
      0 10px 30px -10px rgb(0 0 0 / 0.5);
  }
  .hud.top-left {
    top: calc(var(--in-top) + 14px + var(--sy, 0px));
    left: calc(var(--in-left) + 14px + var(--sx, 0px));
  }
  .hud.top-right {
    top: calc(var(--in-top) + 14px + var(--sy, 0px));
    right: calc(var(--in-right) + 14px + var(--sx, 0px));
  }
  .hud.bottom-left {
    bottom: calc(var(--in-bottom) + 14px + var(--sy, 0px));
    left: calc(var(--in-left) + 14px + var(--sx, 0px));
  }
  .hud.bottom-right {
    bottom: calc(var(--in-bottom) + 14px + var(--sy, 0px));
    right: calc(var(--in-right) + 14px + var(--sx, 0px));
  }
  .ring {
    width: 32px;
    height: 32px;
    flex: none;
    transform: rotate(-90deg);
  }
  .r-track {
    fill: none;
    stroke: rgb(255 255 255 / 0.16);
    stroke-width: 3;
  }
  .r-fill {
    fill: none;
    stroke: var(--c);
    stroke-width: 3;
    stroke-linecap: round;
  }
  .icon {
    position: absolute;
    left: 7px;
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    color: var(--c);
  }
  .txt {
    display: grid;
    min-width: 0;
    line-height: 1.2;
  }
  .txt b {
    font-size: 12.5px;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .txt small {
    font-size: 10.5px;
    color: rgb(245 247 251 / 0.62);
  }
  .time {
    margin-left: 4px;
    font-size: 15px;
    font-weight: 500;
    letter-spacing: 0.01em;
  }
  .hud.urgent .time,
  .hud.final .time {
    color: color-mix(in srgb, var(--c) 45%, white);
  }
  .hud.paused {
    opacity: 0.7;
  }
</style>
