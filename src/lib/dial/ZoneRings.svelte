<script lang="ts">
  // The world clock on the dial: a thin ring just outside the bezel for each compare city,
  // painted with that city's real day, twilight and night across the dial's own span (sun
  // maths in sun.ts), its hours marked, a sun at its noon and a moon at its midnight. The now
  // hand's arrow reads across every ring. Drawn once a minute: no animation runs here.
  import { fade } from 'svelte/transition';
  import { activeTimeZone, zoneCity } from '../engine/time';
  import type { Finish } from '../presets';
  import { clock } from '../stores/clock.svelte';
  import { angleOf, C, polar, radiusOf, sectorPath } from './geometry';
  import { solarAltitude } from './sun';
  import { aheadLabel, compareList, dayShift, gradientAxis, hourMarks, placeOf, skyColor, skyFor, skyPieces, timeIn, weekdayIn, type RingSpan } from './world';

  let {
    zones,
    span,
    now,
    finish,
    compact = false,
    reduced = false,
    hour12 = false,
    interactive = true,
  }: {
    /** Compare zones (IANA), in ring order: the first sits nearest the bezel. */
    zones: string[];
    /** The dial's turn: time at 12 o'clock, time per turn, and where the turn starts. */
    span: RingSpan;
    /** The minute (ms); the rings redraw when it changes. */
    now: number;
    finish: Finish;
    compact?: boolean;
    reduced?: boolean;
    hour12?: boolean;
    /** Hovering a ring reads its time under the pointer. */
    interactive?: boolean;
  } = $props();

  const uid = `zr-${Math.random().toString(36).slice(2, 8)}`;
  const primary = $derived((clock.zone, activeTimeZone()));
  const list = $derived(compareList(zones, primary));
  const sky = $derived(skyFor(finish));

  /** Ring radii outside the bezel (468), inside the case (497): one ring sits wider than two. */
  function radii(n: number): { rIn: number; rOut: number }[] {
    if (compact) return n === 1 ? [{ rIn: 479, rOut: 495 }] : [{ rIn: 478, rOut: 487 }, { rIn: 488.5, rOut: 497 }];
    return n === 1 ? [{ rIn: 479, rOut: 497 }] : [{ rIn: 477.5, rOut: 489.5 }, { rIn: 491.5, rOut: 503.5 }];
  }

  // The turn starts at the window's start: a hair of a gap there says where the ring begins.
  const seam = $derived(compact ? 2.2 : 1.2);
  const a0 = $derived(((span.startMs - span.originMs) / span.spanMs) * 360);

  const rings = $derived.by(() => {
    const geo = radii(list.length);
    return list.map((zone, i) => {
      const place = placeOf(zone, now);
      const { rIn, rOut } = geo[i];
      const rMid = (rIn + rOut) / 2;
      const pieces = skyPieces(span, place, sky, compact ? 2 : 1).map((p, k, all) => {
        // Pieces overlap a little so no hairline of desk shows between them.
        const s = k === 0 ? p.a0 + seam / 2 : p.a0;
        const e = k === all.length - 1 ? p.a1 - seam / 2 : p.a1 + 0.35;
        return { d: sectorPath(s, e, rIn, rOut), color: p.color, grad: p.stops ? gradientAxis(p, rMid) : null };
      });
      // Its hours: hairlines at 6 and 18, small notches between, a sun at noon and a moon at midnight.
      const marks = hourMarks(span, zone);
      let major = '';
      let minor = '';
      let majorDark = '';
      let minorDark = '';
      const glyphs: { kind: 'sun' | 'moon'; x: number; y: number }[] = [];
      for (const m of marks) {
        if (Math.abs(((m.a - a0 + 360) % 360)) < seam) continue;
        const dark = solarAltitude(m.t, place.lat, place.lng) < -3;
        if (m.hour === 12 || m.hour === 0) {
          const [x, y] = polar(rMid, m.a);
          glyphs.push({ kind: m.hour === 12 ? 'sun' : 'moon', x, y });
          continue;
        }
        const isMajor = m.hour % 6 === 0;
        if (compact && !isMajor) continue;
        const inset = isMajor ? 1.2 : (rOut - rIn) * 0.32;
        const [x0, y0] = polar(rIn + inset, m.a);
        const [x1, y1] = polar(rOut - inset, m.a);
        const seg = `M${x0.toFixed(1)} ${y0.toFixed(1)}L${x1.toFixed(1)} ${y1.toFixed(1)}`;
        if (isMajor) dark ? (majorDark += seg) : (major += seg);
        else dark ? (minorDark += seg) : (minor += seg);
      }
      const alt = solarAltitude(now, place.lat, place.lng);
      const shift = dayShift(now, zone, primary);
      return {
        zone,
        city: zoneCity(zone),
        rIn,
        rOut,
        rMid,
        pieces,
        outline: sectorPath(a0 + seam / 2, a0 + 360 - seam / 2, rIn, rOut),
        major,
        minor,
        majorDark,
        minorDark,
        glyphs,
        glyph: Math.min(rOut - rIn, 12) * 0.62,
        nowColor: skyColor(alt, sky),
        up: alt > -3,
        time: timeIn(now, zone, hour12),
        day: shift ? weekdayIn(now, zone) : '',
        ahead: aheadLabel(now, zone, primary),
      };
    });
  });

  // ---- hover: that city's time under the pointer ----------------------------
  let hover = $state<null | { ring: number; deg: number }>(null);
  function onMove(e: PointerEvent) {
    const svg = (e.currentTarget as SVGElement).ownerSVGElement;
    const m = svg?.getScreenCTM();
    if (!m) return;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    const r = radiusOf(p.x, p.y);
    let best = 0;
    rings.forEach((g, i) => {
      if (Math.abs(r - g.rMid) < Math.abs(r - rings[best].rMid)) best = i;
    });
    hover = { ring: best, deg: angleOf(p.x, p.y) };
  }
  const tip = $derived.by(() => {
    if (!hover || !rings[hover.ring]) return null;
    const g = rings[hover.ring];
    const t = span.startMs + ((((hover.deg - a0) % 360) + 360) % 360 / 360) * span.spanMs;
    const shift = dayShift(t, g.zone, primary);
    const there = `${g.city} ${timeIn(t, g.zone, hour12)}${shift ? ` ${weekdayIn(t, g.zone)}` : ''}`;
    const here = `${timeIn(t, primary, hour12)} here`;
    const fs = 25;
    const w = (there.length * 0.6 + here.length * 0.52 + 1.2) * fs + 36;
    const [x, y] = polar(Math.min(...rings.map((x) => x.rIn)) - 52, hover.deg);
    const [mx0, my0] = polar(g.rIn - 3, hover.deg);
    const [mx1, my1] = polar(g.rOut + 3, hover.deg);
    // Keep the pill inside the dial.
    const cx = Math.max(C - 470 + w / 2, Math.min(C + 470 - w / 2, x));
    return { there, here, w, x: cx, y, fs, mark: `M${mx0} ${my0}L${mx1} ${my1}` };
  });

  /** A small sun: a disc with eight short rays. */
  function sunPath(x: number, y: number, s: number) {
    let d = '';
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const c = Math.cos(a);
      const n = Math.sin(a);
      d += `M${(x + c * s * 1.45).toFixed(2)} ${(y + n * s * 1.45).toFixed(2)}L${(x + c * s * 1.95).toFixed(2)} ${(y + n * s * 1.95).toFixed(2)}`;
    }
    return d;
  }
  /** Lucide's moon, filled, centred on (x, y) with radius ≈ s. */
  const moonD = 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z';
  const moonAt = (x: number, y: number, s: number) => `translate(${(x - 12 * (s / 9)).toFixed(2)} ${(y - 12 * (s / 9)).toFixed(2)}) scale(${(s / 9).toFixed(3)})`;

  const said = $derived(rings.map((g) => `${g.city} ${g.time}${g.day ? ` ${g.day}` : ''}, ${g.ahead}`).join('; '));
</script>

{#if rings.length}
  <g class="zone-rings" class:compact role="img" aria-label={`World clock: ${said}`} in:fade={{ duration: reduced ? 0 : 420 }} out:fade={{ duration: reduced ? 0 : 200 }}>
    <defs>
      {#each rings as g, i (g.zone)}
        {#each g.pieces as p, k (k)}
          {#if p.grad}
            <linearGradient id={`${uid}-${i}-${k}`} gradientUnits="userSpaceOnUse" x1={p.grad.x1} y1={p.grad.y1} x2={p.grad.x2} y2={p.grad.y2}>
              {#each p.grad.stops as s, j (j)}<stop offset={s.offset} stop-color={s.color} />{/each}
            </linearGradient>
          {/if}
        {/each}
      {/each}
    </defs>

    {#each rings as g, i (g.zone)}
      <g class="ring">
        <title>{g.city} · {g.time}{g.day ? ` ${g.day}` : ''} · {g.ahead}</title>
        {#each g.pieces as p, k (k)}
          <path d={p.d} fill={p.grad ? `url(#${uid}-${i}-${k})` : p.color} />
        {/each}
        <path d={g.outline} fill="none" stroke={sky.edge} stroke-opacity={finish.dark ? 0.16 : 0.26} stroke-width={compact ? 2 : 1} />
        {#if g.minor}<path d={g.minor} stroke={sky.markDay} stroke-width={compact ? 3 : 1.6} stroke-linecap="round" />{/if}
        {#if g.minorDark}<path d={g.minorDark} stroke={sky.markNight} stroke-width={compact ? 3 : 1.6} stroke-linecap="round" />{/if}
        {#if g.major}<path d={g.major} stroke={sky.markDay} stroke-width={compact ? 4 : 2.4} stroke-linecap="round" />{/if}
        {#if g.majorDark}<path d={g.majorDark} stroke={sky.markNight} stroke-width={compact ? 4 : 2.4} stroke-linecap="round" />{/if}
        {#each g.glyphs as s (s.kind + s.x)}
          {#if s.kind === 'sun'}
            <circle cx={s.x} cy={s.y} r={g.glyph * 1.02} fill={sky.sun} stroke={sky.day} stroke-width={compact ? 2 : 1.2} />
            {#if !compact}<path d={sunPath(s.x, s.y, g.glyph * 0.72)} stroke={sky.sun} stroke-width="1.5" stroke-linecap="round" />{/if}
          {:else}
            <path d={moonD} transform={moonAt(s.x, s.y, g.glyph * 1.05)} fill={sky.moon} />
          {/if}
        {/each}
      </g>
    {/each}

    {#if interactive && !compact}
      <!-- One quiet hit band over every ring: hovering reads the time there. -->
      <path
        class="hit"
        d={sectorPath(0, 360, rings[0].rIn - 4, rings.at(-1)!.rOut + 4)}
        fill="transparent"
        fill-rule="evenodd"
        role="presentation"
        onpointermove={onMove}
        onpointerleave={() => (hover = null)}
      />
    {/if}

    {#if !compact}
      <!-- Each city's name and time, in the dial's top corners: clear of the numerals and blocks. -->
      <g class="labels" aria-hidden="true">
        {#each rings as g, i (g.zone)}
          {@const right = i === 1}
          {@const gx = right ? 958 : 42}
          {@const tx = right ? 926 : 74}
          {@const end = polar(g.rMid, right ? 45 : 315)}
          {@const start = [gx + (right ? -1 : 1) * 14, 44 + 14]}
          <g class="label" class:hot={hover?.ring === i}>
            <!-- A hairline from the label to its own ring. -->
            <path d={`M${start[0]} ${start[1]}L${end[0]} ${end[1]}`} stroke={sky.edge} stroke-opacity="0.55" stroke-width="1.4" stroke-dasharray="1 4" stroke-linecap="round" />
            <circle cx={end[0]} cy={end[1]} r="3.8" fill={finish.face} stroke={finish.ink} stroke-opacity="0.8" stroke-width="1.6" />
            <circle cx={gx} cy={44} r="17" fill={g.nowColor} stroke={sky.edge} stroke-opacity="0.45" stroke-width="1.2" />
            {#if g.up}
              <circle cx={gx} cy={44} r="5.2" fill={sky.sun} />
              <path d={sunPath(gx, 44, 4.6)} stroke={sky.sun} stroke-width="1.8" stroke-linecap="round" />
            {:else}
              <path d={moonD} transform={moonAt(gx, 44, 8)} fill={sky.moon} />
            {/if}
            <text x={tx} y={40} text-anchor={right ? 'end' : 'start'} class="city">{g.city}</text>
            <text x={tx} y={70} text-anchor={right ? 'end' : 'start'} class="when">{g.time}{g.day ? ` ${g.day}` : ''} · {g.ahead}</text>
          </g>
        {/each}
      </g>
    {/if}

    {#if tip}
      <g class="tip" aria-hidden="true">
        <path d={tip.mark} stroke={finish.ink} stroke-width="3" stroke-linecap="round" />
        <rect x={tip.x - tip.w / 2} y={tip.y - 23} width={tip.w} height="46" rx="23" fill={finish.ink} />
        <text x={tip.x} y={tip.y + 1} text-anchor="middle" dominant-baseline="central" font-size={tip.fs} fill={finish.face}>
          <tspan class="strong">{tip.there}</tspan><tspan dx="10" opacity="0.62">{tip.here}</tspan>
        </text>
      </g>
    {/if}
  </g>
{/if}

<style>
  .zone-rings text {
    font-family: var(--font-ui);
    font-variant-numeric: tabular-nums;
    user-select: none;
    pointer-events: none;
  }
  .hit {
    cursor: crosshair;
  }
  .ring {
    pointer-events: none;
  }
  .city {
    font-size: 25px;
    font-weight: 500;
    fill: var(--ink-2);
  }
  .when {
    font-size: 22px;
    font-weight: 400;
    fill: var(--ink-3);
  }
  .label.hot .city {
    fill: var(--focus-ring);
  }
  .strong {
    font-weight: 500;
  }
  .tip {
    pointer-events: none;
  }
  /* Too small to read: the rings stay, the corner labels go. */
  @container (max-width: 380px) {
    .labels {
      display: none;
    }
  }
  @container (max-width: 300px) {
    .tip {
      display: none;
    }
  }
</style>
