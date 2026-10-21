<script lang="ts">
  import { untrack } from 'svelte';
  import { Spring } from 'svelte/motion';
  import { inkOn, mix, onColor } from '../engine/categories';
  import type { Block } from '../engine/types';
  import Icon from '../Icon.svelte';
  import type { Finish } from '../presets';
  import { arcLength, arcPath, degFor, laneRadii, nearestTurn, polar, sectorPath } from './geometry';

  let {
    block,
    a0,
    a1,
    lane = 0,
    lanes = 1,
    elapsed = 0,
    selected = false,
    dimmed = false,
    headsUp = false,
    current = false,
    past = false,
    handAngle = null,
    finish,
    compact = false,
    reduced = false,
    interactive = true,
    enterDelay = 0,
    onpick,
    onhover,
  }: {
    block: Block;
    /** Target start angle (deg). */
    a0: number;
    /** Target end angle (deg), a1 > a0. */
    a1: number;
    lane?: number;
    lanes?: number;
    /** Degrees of this arc already behind the now-hand. */
    elapsed?: number;
    selected?: boolean;
    dimmed?: boolean;
    headsUp?: boolean;
    /** Under the now-hand: gets a small lift when it takes over. */
    current?: boolean;
    /** Its time is over: it steps back so what's ahead reads first. */
    past?: boolean;
    /** Where the now-hand crosses the bezel; labels keep clear of it. */
    handAngle?: number | null;
    finish: Finish;
    compact?: boolean;
    reduced?: boolean;
    interactive?: boolean;
    /** ms before the first draw-on (staggered entrance). */
    enterDelay?: number;
    onpick?: (e: PointerEvent, block: Block) => void;
    onhover?: (block: Block | null) => void;
  } = $props();

  const uid = `arc-${Math.random().toString(36).slice(2, 9)}`;
  const springy = { stiffness: 0.14, damping: 0.72 };
  const geo = $derived(laneRadii(lane, lanes));

  // Mount with zero sweep, then grow: every new block draws itself onto the bezel.
  // svelte-ignore state_referenced_locally
  const s0 = new Spring(a0, springy);
  // svelte-ignore state_referenced_locally
  const s1 = new Spring(reduced ? a1 : a0, springy);
  // svelte-ignore state_referenced_locally
  const rOut = new Spring(laneRadii(lane, lanes).rOut, springy);
  // svelte-ignore state_referenced_locally
  const rIn = new Spring(laneRadii(lane, lanes).rIn, springy);

  // The first placement waits its turn so a fresh dial blooms clockwise, arc by arc.
  let mounted = false;
  $effect(() => {
    const opts = reduced ? { instant: true } : undefined;
    const start = nearestTurn(untrack(() => s0.current), a0);
    const end = start + (a1 - a0);
    if (!mounted && !reduced && enterDelay > 0) {
      mounted = true;
      const t = setTimeout(() => {
        s0.set(start);
        s1.set(end);
      }, enterDelay);
      return () => clearTimeout(t);
    }
    mounted = true;
    s0.set(start, opts);
    s1.set(end, opts);
  });

  let hover = $state(false);
  let pulse = $state(0);
  $effect(() => {
    const lift = selected ? 10 : hover && interactive ? 4 : 0;
    const opts = reduced ? { instant: true } : undefined;
    rOut.set(geo.rOut + lift + pulse, opts);
    rIn.set(geo.rIn + (selected ? 2 : 0), opts);
  });

  // Handoff: when a block becomes "now" it rises out of the bezel and settles back.
  let wasCurrent: boolean | null = null;
  $effect(() => {
    if (wasCurrent === false && current && !reduced) {
      pulse = 16;
      setTimeout(() => (pulse = 0), 420);
    }
    wasCurrent = current;
  });

  // Gap so neighbouring blocks read as separate inserts.
  const gap = $derived(degFor(compact ? 5 : 3.5, rOut.current));
  const A0 = $derived(s0.current + gap);
  const A1 = $derived(Math.max(A0 + 0.3, s1.current - gap));
  const sweep = $derived(A1 - A0);
  const E = $derived(Math.min(A1, A0 + Math.max(0, elapsed - gap)));

  const missed = $derived(!block.done && elapsed >= a1 - a0 - 0.01 && block.kind === 'task');
  const isEvent = $derived(block.kind === 'event');
  const isPrayer = $derived(block.event?.provider === 'salah');
  const isGlass = $derived(isEvent && !isPrayer);
  // Three materials, no texture. Your blocks are solid colour. A calendar event is glass: a pale
  // wash of its colour inside a crisp edge. A salah is soft light: a lamp lit in its window,
  // brightest at its heart and feathering out, with no edge. States lay over any of them: done
  // mutes toward the face and gets the lume rim, missed washes out behind a dashed edge, and a
  // skipped event leaves only a faint outline over bare bezel (its time is free).
  // Glass and light are translucent, so what lies under them (sleep hours, the spent film) shows.
  const glassAlpha = $derived(finish.dark ? 0.28 : 0.2);
  const lampTint = $derived(block.done ? mix(block.color, finish.face, finish.dark ? 0.42 : 0.5) : block.color);
  /** The lamp's opacity at its heart, halfway out, and at its rim. */
  const lampAlpha = $derived(block.done ? [0.9, 0.6, 0.32] : [0.74, 0.42, 0.14]);
  const glassy = $derived(isGlass && !block.done);
  const baseFill = $derived(
    isPrayer
      ? mix(lampTint, finish.bezel, 1 - lampAlpha[0])
      : block.done
        ? mix(block.color, finish.face, finish.dark ? 0.42 : 0.5)
        : missed
          ? mix(block.color, finish.bezel, 0.68)
          : glassy
            ? mix(block.color, finish.bezel, 1 - glassAlpha)
            : block.color,
  );
  const edge = $derived(block.done ? mix(block.color, finish.face, 0.45) : block.color);
  const lampId = `lamp-${Math.random().toString(36).slice(2, 9)}`;
  const elapsedFill = $derived(mix(block.color, finish.bezel, finish.dark ? 0.6 : 0.55));
  // Lettering on glass and light keeps the block's hue; on solid colour it is white or ink.
  const ink = $derived(isEvent && !block.done ? inkOn(baseFill, block.color) : onColor(baseFill));

  // Labels: icon when there is room for it, title along the arc when there is room for words.
  const rMid = $derived((rOut.current + rIn.current) / 2);
  const thick = $derived(rOut.current - rIn.current);
  // Glass and missed edges sit just inside the insert, so neighbours keep their gap.
  const edgeW = $derived(compact ? 5 : block.skipped ? 2.5 : 3);
  const edgePath = $derived.by(() => {
    const i = edgeW / 2;
    const d = degFor(i, rOut.current);
    return sectorPath(A0 + d, A1 - d, rIn.current + i, rOut.current - i);
  });
  // Salah: the lamp is centred in its window, and its light reaches just past the ends.
  const lamp = $derived.by(() => {
    const [cx, cy] = polar(rMid, (A0 + A1) / 2);
    return { cx, cy, r: Math.max(thick / 2, arcLength(rMid, sweep) / 2) * 1.5 };
  });
  // When the hand crosses this arc, words sit on the stretch still ahead of it.
  const LA0 = $derived.by(() => {
    if (handAngle == null) return A0;
    const h = A0 + ((((handAngle - A0) % 360) + 360) % 360);
    return h > A0 && h < A1 ? h + degFor(16, rMid) : A0;
  });
  const len = $derived(arcLength(rMid, Math.max(0, A1 - LA0)));
  const iconSize = $derived(Math.min(thick * 0.5, compact ? 46 : 34));
  const showIcon = $derived(len > iconSize * 1.5);
  const fontSize = $derived(Math.min(thick * 0.34, 25));
  const midA = $derived((LA0 + A1) / 2);
  const textRoom = $derived(len - iconSize * 1.9 - 14);
  const charW = $derived(fontSize * 0.6);
  // Whole words only — a stub like "Lun…" reads worse than the icon alone.
  const title = $derived.by(() => {
    if (compact || lanes > 2 || textRoom < fontSize * 2.4) return '';
    const max = Math.floor(textRoom / charW);
    const t = block.title.trim();
    if (t.length <= max) return t;
    let out = '';
    for (const word of t.split(/\s+/)) {
      const next = out ? `${out} ${word}` : word;
      if (next.length > max) break;
      out = next;
    }
    return out.length >= 3 ? out : '';
  });
  // Upright text: read clockwise from the start when the words land on the top half,
  // counter-clockwise from the end when they land on the bottom half.
  const lower = (a: number) => {
    const n = ((a % 360) + 360) % 360;
    return n > 90 && n < 270;
  };
  const flip = $derived.by(() => {
    if (!title) return lower(midA);
    const iconDeg = degFor(iconSize * 1.75, rMid);
    const textDeg = degFor(title.length * charW, rMid);
    if (!lower(LA0 + iconDeg + textDeg / 2)) return false;
    return lower(A1 - iconDeg - textDeg / 2);
  });
  const iconAngle = $derived(
    title ? (flip ? A1 - degFor(iconSize * 0.95, rMid) : LA0 + degFor(iconSize * 0.95, rMid)) : midA,
  );
  const iconPos = $derived(polar(rMid, iconAngle));
  // Text sits on a baseline just inside the mid-radius; on the lower half it runs
  // counter-clockwise (so it stays upright) and its baseline moves outward instead.
  const textPath = $derived(
    flip
      ? arcPath(rMid + fontSize * 0.36, LA0 + degFor(10, rMid), A1 - degFor(iconSize * 1.75, rMid), true)
      : arcPath(rMid - fontSize * 0.36, LA0 + degFor(iconSize * 1.75, rMid), A1 - degFor(10, rMid)),
  );

  // Done → a band of light sweeps along the arc once ("lume charge").
  let chargeEpoch = $state(0);
  let wasDone: boolean | null = null;
  $effect(() => {
    if (wasDone === null) {
      wasDone = block.done;
      return;
    }
    if (block.done && !wasDone && !reduced) chargeEpoch++;
    wasDone = block.done;
  });

  function pick(e: PointerEvent) {
    if (!interactive || !onpick) return;
    e.stopPropagation();
    onpick(e, block);
  }
</script>

<!-- role is "button" exactly when the arc is focusable -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<g
  class="arc"
  data-genie={`block:${block.key}`}
  class:selected
  class:dimmed
  class:past
  class:done={block.done}
  class:skipped={block.skipped}
  class:event={block.kind === 'event'}
  class:interactive
  data-key={block.key}
  onpointerdown={pick}
  onpointerenter={() => {
    hover = true;
    onhover?.(block);
  }}
  onpointerleave={() => {
    hover = false;
    onhover?.(null);
  }}
  role={interactive ? 'button' : undefined}
  tabindex={interactive ? 0 : undefined}
  aria-label={interactive ? `${block.title || 'Untitled block'}${block.done ? ', done' : ''}` : undefined}
  onkeydown={(e) => {
    if (interactive && onpick && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      e.stopPropagation();
      onpick(new PointerEvent('pointerdown'), block);
    }
  }}
  onfocus={() => (hover = true)}
  onblur={() => (hover = false)}
>
  <title>{block.title || 'Untitled block'}{block.done ? ' · done' : ''}</title>
  {#if selected}
    <path d={sectorPath(A0 - 0.2, A1 + 0.2, rIn.current - 6, rOut.current + 6)} class="halo" fill={block.color} />
  {/if}

  {#if isPrayer}
    <!-- Salah: soft light, brightest at its heart, no edge -->
    <defs>
      <radialGradient id={lampId} gradientUnits="userSpaceOnUse" cx={lamp.cx} cy={lamp.cy} r={lamp.r}>
        <stop offset="0" stop-color={lampTint} stop-opacity={lampAlpha[0]} />
        <stop offset="0.55" stop-color={lampTint} stop-opacity={lampAlpha[1]} />
        <stop offset="1" stop-color={lampTint} stop-opacity={lampAlpha[2]} />
      </radialGradient>
    </defs>
  {/if}
  <!-- A skipped event keeps a clear body (still hoverable): the bare bezel shows through. -->
  <path
    d={sectorPath(A0, A1, rIn.current, rOut.current)}
    fill={block.skipped ? 'transparent' : isPrayer ? `url(#${lampId})` : glassy ? block.color : baseFill}
    fill-opacity={glassy && !block.skipped ? glassAlpha : undefined}
    class="body"
  />

  {#if E > A0 + 0.05 && !block.done && !missed && !block.skipped}
    {#if isEvent}
      <!-- glass and light: the spent part dims under a film of bezel -->
      <path d={sectorPath(A0, E, rIn.current, rOut.current)} fill={finish.bezel} opacity="0.5" class="elapsed" />
    {:else}
      <path d={sectorPath(A0, E, rIn.current, rOut.current)} fill={elapsedFill} class="elapsed" />
    {/if}
  {/if}

  {#if isGlass}
    <!-- Glass: one crisp edge in the event's colour -->
    <path d={edgePath} fill="none" stroke={edge} stroke-width={edgeW} stroke-linejoin="round" class="edge" />
  {/if}

  {#if block.done}
    <!-- the lume rim: finished time glows -->
    <path
      d={arcPath(rOut.current - 3.5, A0 + 0.4, A1 - 0.4)}
      stroke={finish.lume}
      stroke-width="5"
      stroke-linecap="round"
      fill="none"
      class="lume"
      filter={finish.dark ? 'url(#dial-glow)' : undefined}
    />
  {/if}

  {#key chargeEpoch}
    {#if chargeEpoch > 0}
      <path
        d={arcPath(rMid, A0, A1)}
        pathLength="1"
        stroke="white"
        stroke-width={thick}
        fill="none"
        class="charge"
      />
    {/if}
  {/key}

  {#if missed}
    <!-- Missed: washed out behind a dashed edge, never red -->
    <path d={edgePath} fill="none" stroke={mix(block.color, finish.bezel, 0.25)} stroke-width={compact ? 4 : 2.5} stroke-dasharray={compact ? '10 9' : '7 7'} class="edge" />
  {/if}

  {#if showIcon}
    <Icon
      name={block.done ? 'check' : block.icon}
      size={iconSize}
      x={iconPos[0] - iconSize / 2}
      y={iconPos[1] - iconSize / 2}
      color={block.done ? finish.ink : ink}
      stroke={compact ? 2.4 : 2}
    />
  {/if}

  {#if title}
    <path id={uid} d={textPath} fill="none" stroke="none" />
    <text class="label" font-size={fontSize} fill={block.done ? finish.ink : ink} opacity={block.done || missed ? (finish.dark ? 0.9 : 0.72) : 1}>
      <textPath href={`#${uid}`}>{title}</textPath>
    </text>
  {/if}
</g>

<style>
  .arc {
    transition: opacity 0.3s var(--ease-out);
  }
  .arc.interactive {
    cursor: pointer;
    outline: none;
  }
  .arc.interactive:focus-visible .body {
    stroke: var(--focus-ring);
    stroke-width: 4;
  }
  .arc.dimmed {
    opacity: 0.4;
  }
  /* An event you're skipping: a faint outline of where it was, over bare bezel. */
  .arc.skipped {
    opacity: 0.42;
  }
  /* Behind you: quieter, so what's ahead reads first. Finished time keeps more of its glow. */
  .arc.past {
    opacity: 0.5;
  }
  .arc.past.done {
    opacity: 0.78;
  }
  .arc.past.dimmed {
    opacity: 0.3;
  }
  .arc.past:hover,
  .arc.past.selected,
  .arc.past:focus-visible {
    opacity: 1;
  }
  .halo {
    opacity: 0.22;
    filter: blur(6px);
  }
  .body,
  .elapsed {
    stroke: none;
  }
  .label {
    font-family: var(--font-ui);
    font-weight: 500;
    letter-spacing: 0.01em;
    pointer-events: none;
    user-select: none;
  }
  .edge {
    pointer-events: none;
  }

  .lume {
    opacity: 0.9;
    pointer-events: none;
  }
  .charge {
    pointer-events: none;
    stroke-dasharray: 0.18 1.4;
    stroke-dashoffset: 0.18;
    opacity: 0.85;
    mix-blend-mode: soft-light;
    animation: charge 0.95s cubic-bezier(0.3, 0.7, 0.2, 1) forwards;
  }
  @keyframes charge {
    to {
      stroke-dashoffset: -1.05;
      opacity: 0.2;
    }
  }

</style>
