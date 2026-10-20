<script lang="ts">
  // A small 24-hour dial for picking a time, in Daybloom's own language: midnight at the top,
  // night shaded, the day's other blocks as thin arcs (so free time shows), and, when the
  // block has a length, its span on the ring. Drag anywhere on the face; it snaps to `step`
  // with a soft detent. Arrow keys nudge it (Shift: an hour).
  import { formatMinutes } from '../../lib/engine/time';
  import Icon from '../../lib/Icon.svelte';
  import { detent } from '../../lib/sound';

  let {
    value,
    step = 5,
    length = 0,
    busy = [],
    night = null,
    hour12,
    accent = 'var(--ink)',
    label,
    onchange,
    oncommit,
  }: {
    value: number;
    step?: number;
    /** Minutes; draws the span from `value` when set. */
    length?: number;
    busy?: { start: number; end: number; color: string }[];
    /** Sleeping hours [from, to), shaded. */
    night?: { from: number; to: number } | null;
    hour12: boolean;
    accent?: string;
    label: string;
    /** While dragging. */
    onchange: (m: number) => void;
    /** On release, and on each key. */
    oncommit: (m: number) => void;
  } = $props();

  const C = 120;
  const R = 100;
  const ang = (m: number) => (m / 1440) * 2 * Math.PI - Math.PI / 2;
  const pt = (m: number, r: number) => [C + r * Math.cos(ang(m)), C + r * Math.sin(ang(m))] as const;
  function arc(m0: number, m1: number, r: number) {
    let span = (((m1 - m0) % 1440) + 1440) % 1440;
    if (span === 0) span = 1439.9;
    const [x0, y0] = pt(m0, r);
    const [x1, y1] = pt(m0 + span, r);
    return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${span > 720 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  }

  const snap = (m: number) => ((Math.round(m / step) * step) % 1440 + 1440) % 1440;
  const LABELS = $derived(
    [0, 360, 720, 1080].map((m) => ({ m, text: hour12 ? ['12am', '6am', 'noon', '6pm'][m / 360] : ['00', '06', '12', '18'][m / 360] })),
  );

  let svg = $state<SVGSVGElement>();
  let held = false;
  let last = -1;

  function fromPointer(e: PointerEvent): number {
    const r = svg!.getBoundingClientRect();
    const x = e.clientX - (r.left + r.width / 2);
    const y = e.clientY - (r.top + r.height / 2);
    let a = Math.atan2(y, x) + Math.PI / 2;
    if (a < 0) a += 2 * Math.PI;
    return snap((a / (2 * Math.PI)) * 1440);
  }
  function setFrom(e: PointerEvent) {
    const m = fromPointer(e);
    if (m === last) return;
    if (last >= 0) detent();
    last = m;
    onchange(m);
  }
  function down(e: PointerEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    svg!.setPointerCapture(e.pointerId);
    svg!.focus();
    held = true;
    last = value;
    setFrom(e);
  }
  function move(e: PointerEvent) {
    if (held) setFrom(e);
  }
  function up() {
    if (!held) return;
    held = false;
    oncommit(value);
  }
  function key(e: KeyboardEvent) {
    const big = e.shiftKey || e.key === 'PageUp' || e.key === 'PageDown' ? 60 : step;
    const d = e.key === 'ArrowUp' || e.key === 'ArrowRight' || e.key === 'PageUp' ? big : e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'PageDown' ? -big : 0;
    if (!d) return;
    e.preventDefault();
    oncommit(snap(value + d));
  }
  function nudge(d: number) {
    oncommit(snap(value + d));
  }

  const hand = $derived(pt(value, R));
  const handIn = $derived(pt(value, 58));
  const ends = $derived(length ? formatMinutes((value + length) % 1440, hour12) : '');
</script>

<div class="dialwrap">
  <svg
    bind:this={svg}
    viewBox="0 0 240 240"
    role="slider"
    tabindex="0"
    aria-label={label}
    aria-valuemin={0}
    aria-valuemax={1435}
    aria-valuenow={value}
    aria-valuetext={formatMinutes(value, hour12)}
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={up}
    onkeydown={key}
  >
    <circle cx={C} cy={C} r="116" class="face" />
    <circle cx={C} cy={C} r={R} class="band" />
    {#if night}<path d={arc(night.from, night.to, R)} class="night" />{/if}
    {#each Array.from({ length: 24 }, (_, i) => i) as h (h)}
      {@const [x0, y0] = pt(h * 60, h % 6 ? 111 : 109)}
      {@const [x1, y1] = pt(h * 60, 115)}
      <line x1={x0} y1={y0} x2={x1} y2={y1} class="tick" class:major={h % 6 === 0} />
    {/each}
    {#each busy as b, i (i)}
      <path d={arc(b.start, b.end, 84)} stroke={b.color} class="busy" />
    {/each}
    {#if length}
      <path d={arc(value, value + length, R)} stroke={accent} class="span" />
    {/if}
    {#each LABELS as l (l.m)}
      {@const [x, y] = pt(l.m, 68)}
      <text {x} y={y + 3.5} class="lbl">{l.text}</text>
    {/each}
    <line x1={handIn[0]} y1={handIn[1]} x2={hand[0]} y2={hand[1]} stroke={accent} class="hand" />
    <circle cx={hand[0]} cy={hand[1]} r="10" fill={accent} class="knob" />
  </svg>
  <div class="center">
    <div class="read tnum">
      <b>{formatMinutes(value, hour12)}</b>
      {#if ends}<small>to {ends}</small>{/if}
    </div>
    <div class="nudges">
      <button class="nudge" onclick={() => nudge(-step)} aria-label={`${step} minutes earlier`} tabindex="-1"><Icon name="chevron-left" size={14} stroke={2.4} /></button>
      <button class="nudge" onclick={() => nudge(step)} aria-label={`${step} minutes later`} tabindex="-1"><Icon name="chevron-right" size={14} stroke={2.4} /></button>
    </div>
  </div>
</div>

<style>
  .dialwrap {
    position: relative;
    width: 228px;
    height: 228px;
    margin: 4px auto 0;
  }
  svg {
    width: 100%;
    height: 100%;
    touch-action: none;
    cursor: grab;
    outline: none;
    border-radius: 50%;
  }
  svg:active {
    cursor: grabbing;
  }
  svg:focus-visible {
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--focus-ring) 45%, transparent);
  }
  .face {
    fill: var(--surface);
    stroke: var(--line);
  }
  .band {
    fill: none;
    stroke: var(--sunken);
    stroke-width: 16;
  }
  .night {
    fill: none;
    stroke: color-mix(in srgb, var(--ink) 12%, var(--sunken));
    stroke-width: 16;
  }
  .tick {
    stroke: var(--line-strong);
    stroke-width: 1.2;
    stroke-linecap: round;
  }
  .tick.major {
    stroke: var(--ink-3);
    stroke-width: 1.6;
  }
  .busy {
    fill: none;
    stroke-width: 5;
    stroke-linecap: round;
    opacity: 0.7;
  }
  .span {
    fill: none;
    stroke-width: 16;
    opacity: 0.35;
  }
  .lbl {
    font-size: 9.5px;
    fill: var(--ink-3);
    text-anchor: middle;
    font-family: var(--font-ui);
    pointer-events: none;
  }
  .hand {
    stroke-width: 2.5;
    stroke-linecap: round;
  }
  .knob {
    stroke: var(--raised);
    stroke-width: 3;
    filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.25));
  }
  .center {
    position: absolute;
    left: 50%;
    top: 50%;
    display: grid;
    justify-items: center;
    gap: 2px;
    transform: translate(-50%, -42%);
    pointer-events: none;
  }
  .nudges {
    display: flex;
    gap: 14px;
  }
  .read {
    display: grid;
    justify-items: center;
    min-width: 76px;
  }
  .read b {
    font-size: 21px;
    font-weight: 500;
    letter-spacing: -0.01em;
  }
  .read small {
    font-size: 11px;
    color: var(--ink-3);
  }
  .nudge {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    color: var(--ink-3);
    pointer-events: auto;
    transition:
      background var(--dur-1) var(--ease-out),
      color var(--dur-1) var(--ease-out);
  }
  .nudge:hover {
    background: var(--sunken);
    color: var(--ink);
  }
</style>
