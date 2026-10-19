<script lang="ts">
  // Set a focus length the way you'd turn a kitchen timer: drag round the ring. One lap is an
  // hour; keep going past 12 and a second, inner lap starts (up to two hours). Detents every
  // 5 minutes (1 under 10), a soft tick on each, and the wedge springs when a chip sets it.
  import { Tween } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';
  import { formatTime, MINUTE } from '../../lib/engine/time';
  import { sounds } from '../../lib/sound';
  import { clock } from '../../lib/stores/clock.svelte';
  import { settings } from '../../lib/stores/settings.svelte';
  import { view } from '../../lib/stores/view.svelte';

  let {
    minutes = $bindable(25),
    color = 'var(--focus-ring)',
    max = 120,
    size = 232,
    total = null,
  }: { minutes?: number; color?: string; max?: number; size?: number; total?: number | null } = $props();

  const C = 120; // viewBox centre
  const R = 80; // first lap
  const R2 = 64; // second lap
  const shown = new Tween(minutes, { duration: 420, easing: cubicOut });
  let dragging = $state(false);
  $effect(() => {
    const m = minutes;
    if (dragging || view.reducedMotion) shown.set(m, { duration: 0 });
    else shown.set(m);
  });

  const snap = (m: number) => {
    const step = m < 10 ? 1 : 5;
    return Math.max(1, Math.min(max, Math.round(m / step) * step));
  };

  function point(r: number, deg: number) {
    const a = ((deg - 90) * Math.PI) / 180;
    return [C + r * Math.cos(a), C + r * Math.sin(a)];
  }
  function wedge(r: number, mins: number) {
    if (mins <= 0) return '';
    if (mins >= 60) return `M ${C} ${C - r} A ${r} ${r} 0 1 1 ${C - 0.01} ${C - r} Z`;
    const deg = (mins / 60) * 360;
    const [x, y] = point(r, deg);
    return `M ${C} ${C} L ${C} ${C - r} A ${r} ${r} 0 ${deg > 180 ? 1 : 0} 1 ${x} ${y} Z`;
  }
  function arc(r: number, mins: number) {
    if (mins <= 0) return '';
    const deg = Math.min(359.99, (mins / 60) * 360);
    const [x, y] = point(r, deg);
    return `M ${C} ${C - r} A ${r} ${r} 0 ${deg > 180 ? 1 : 0} 1 ${x} ${y}`;
  }

  const first = $derived(Math.min(60, shown.current));
  const second = $derived(Math.max(0, shown.current - 60));
  const knob = $derived(point(shown.current > 60 ? R2 : R, ((shown.current % 60 || (shown.current > 0 ? 60 : 0)) / 60) * 360));
  const ends = $derived(clock.now + (total ?? minutes) * MINUTE);

  // ---- dragging: unwrap the angle across 12 o'clock so a second lap is reachable.
  let svg: SVGSVGElement | undefined = $state();
  let lastDeg = 0;
  let laps = 0;
  function degAt(e: PointerEvent) {
    const r = svg!.getBoundingClientRect();
    const x = e.clientX - (r.left + r.width / 2);
    const y = e.clientY - (r.top + r.height / 2);
    return ((Math.atan2(y, x) * 180) / Math.PI + 450) % 360;
  }
  function setFrom(deg: number) {
    const m = snap(((laps * 360 + deg) / 360) * 60);
    if (m !== minutes) {
      minutes = m;
      if (settings.value.sound) sounds.tick();
    }
  }
  function down(e: PointerEvent) {
    dragging = true;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const d = degAt(e);
    laps = minutes > 60 && d < 180 ? 1 : 0;
    lastDeg = d;
    setFrom(d);
  }
  function move(e: PointerEvent) {
    if (!dragging) return;
    const d = degAt(e);
    if (lastDeg > 270 && d < 90) laps = Math.min(1, laps + 1);
    else if (lastDeg < 90 && d > 270) laps = Math.max(0, laps - 1);
    lastDeg = d;
    if (laps === 0 && d > 330 && minutes <= 5) return; // don't wrap backwards past zero
    setFrom(d);
  }
  function up() {
    dragging = false;
  }
  function wheel(e: WheelEvent) {
    e.preventDefault();
    const step = minutes < 10 ? 1 : 5;
    minutes = snap(minutes + (e.deltaY < 0 ? step : -step));
  }
  function key(e: KeyboardEvent) {
    const step = e.shiftKey ? 1 : minutes < 10 ? 1 : 5;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') minutes = snap(minutes + step);
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') minutes = snap(minutes - step);
    else if (e.key === 'Home') minutes = 5;
    else if (e.key === 'End') minutes = max;
    else return;
    e.preventDefault();
  }

  const label = $derived(minutes >= 60 ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}` : ''}` : `${minutes}`);
</script>

<div class="td" style:--c={color} style:width={`${size}px`}>
  <svg
    bind:this={svg}
    viewBox="0 0 240 240"
    role="slider"
    tabindex="0"
    aria-label="Focus length"
    aria-valuemin={1}
    aria-valuemax={max}
    aria-valuenow={minutes}
    aria-valuetext={`${minutes} minutes`}
    class:dragging
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={up}
    onwheel={wheel}
    onkeydown={key}
  >
    <circle class="face" cx={C} cy={C} r={R + 18} />
    {#each Array.from({ length: 60 }, (_, i) => i) as i (i)}
      {@const major = i % 5 === 0}
      {@const [x1, y1] = point(R + 15, i * 6)}
      {@const [x2, y2] = point(R + (major ? 9 : 12), i * 6)}
      <line class="tick" class:major class:lit={i < Math.round(first)} x1={x1} y1={y1} x2={x2} y2={y2} />
    {/each}
    {#each [0, 15, 30, 45] as n (n)}
      {@const [x, y] = point(R + 31, n * 6)}
      <text class="num" {x} y={y + 4}>{n}</text>
    {/each}
    <circle class="track" cx={C} cy={C} r={R} />
    <path class="wedge" d={wedge(R, first)} />
    {#if second > 0}
      <circle class="lap" cx={C} cy={C} r={R2} />
      <path class="lap-arc" d={arc(R2, second)} />
    {/if}
    <circle class="hub" cx={C} cy={C} r={44} />
    <circle class="knob" cx={knob[0]} cy={knob[1]} r={dragging ? 9 : 7.5} />
  </svg>
  <div class="read" aria-hidden="true">
    <span class="big tnum">{label}</span>
    <span class="unit">{minutes >= 60 ? '' : minutes === 1 ? 'minute' : 'minutes'}</span>
    <span class="ends tnum">until {formatTime(ends, view.hour12)}</span>
  </div>
</div>

<style>
  .td {
    position: relative;
    aspect-ratio: 1;
    margin: 0 auto;
    touch-action: none;
  }
  svg {
    width: 100%;
    height: 100%;
    display: block;
    cursor: grab;
    outline: none;
    border-radius: 50%;
  }
  svg.dragging {
    cursor: grabbing;
  }
  svg:focus-visible {
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--focus-ring) 40%, transparent);
  }
  .face {
    fill: var(--raised);
    stroke: var(--line);
  }
  .tick {
    stroke: var(--line-strong);
    stroke-width: 1.2;
    stroke-linecap: round;
    transition: stroke 160ms ease;
  }
  .tick.major {
    stroke-width: 2;
    stroke: var(--ink-3);
  }
  .tick.lit {
    stroke: var(--c);
  }
  .num {
    font-family: var(--font-ui);
    font-size: 11px;
    font-weight: 300;
    fill: var(--ink-3);
    text-anchor: middle;
  }
  .track {
    fill: var(--sunken);
  }
  .wedge {
    fill: var(--c);
    opacity: 0.88;
  }
  .lap {
    fill: none;
    stroke: color-mix(in srgb, var(--raised) 60%, transparent);
    stroke-width: 10;
  }
  .lap-arc {
    fill: none;
    stroke: color-mix(in srgb, var(--c) 55%, var(--ink));
    stroke-width: 10;
    stroke-linecap: round;
  }
  .hub {
    fill: var(--raised);
  }
  .knob {
    fill: var(--raised);
    stroke: var(--c);
    stroke-width: 3;
    filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.25));
    transition: r 160ms var(--ease-out);
  }
  .read {
    position: absolute;
    inset: 0;
    display: grid;
    place-content: center;
    justify-items: center;
    pointer-events: none;
    line-height: 1.05;
  }
  .big {
    font-size: 40px;
    font-weight: 300;
    letter-spacing: -0.02em;
    color: var(--ink);
  }
  .unit {
    font-size: var(--t-xs);
    color: var(--ink-3);
    min-height: 1em;
  }
  .ends {
    margin-top: 6px;
    font-size: var(--t-xs);
    color: var(--ink-2);
  }
</style>
