<script lang="ts">
  // The breathing guide in the dial's face. A soft sphere of light grows as you breathe in,
  // warming and brightening; stays full, luminous and still while you hold; shrinks and cools
  // on the breath out; and dims to rest. Around it, a ring: one breath goes once round it,
  // clockwise from the bottom left (in rises up the left, hold crosses the top, out falls down
  // the right, rest comes back along the bottom). Each phase is an arc as long as its time (box:
  // four equal quarters) with a small gap before the next. A glowing bead with a short comet
  // tail travels the ring at the breath's pace; the arc it is on fills with light behind it in
  // the phase's colour and stays softly lit until the round is done; a soft ripple leaves the
  // sphere and the bead swells at every turn. It all sits inside the time-left ring.
  // Only opacity and transform move, on HTML layers (the arcs are static SVG inside them): an
  // arc fills by turning inside its own quarter, which clips it (a plain rectangle, no mask).
  // Driven by the Web Animations API from the shared rhythm and joined where the guide is now,
  // the compositor runs it and it never drifts from the words. Under Calm only opacity moves,
  // slowly: the sphere warms and cools in place and each arc lights as its phase comes.
  import { onMount, untrack } from 'svelte';
  import { cubicOut } from 'svelte/easing';
  import { fade } from 'svelte/transition';
  import { breath, phaseSpans, type BreathPhaseId } from '../breath.svelte';
  import { arc, phaseArcs, pieces, pt, START } from '../breathPath';
  import { clock } from '../stores/clock.svelte';

  let {
    startAt,
    color,
    ink,
    dark = false,
    compact = false,
    reduced = false,
  }: {
    startAt: number;
    /** The rest category's colour for this finish: the guide's light. */
    color: string;
    /** The finish's ink, for the ring's faint track. */
    ink: string;
    dark?: boolean;
    compact?: boolean;
    reduced?: boolean;
  } = $props();

  // The rhythm this guide runs, and the dial's size (the orb is remade for each guide).
  const r = breath.rhythm;
  const small = untrack(() => compact);
  const D = r.cycleMs;
  const e = phaseSpans(r);

  // Geometry in cqi (1% of the dial's width): the ring sits just outside the full sphere and
  // inside the time-left ring (radius 22.2; 19.6 on the widget) and the Hour wedge (21.4).
  const G = small ? { ring: 17, sw: 0.95, track: 0.5, rs: 12.4, bloom: 17, dot: 1.25 } : { ring: 19.4, sw: 0.7, track: 0.34, rs: 14, bloom: 19.5, dot: 0.92 };
  /** Half the ring's drawing square (room for the glow). */
  const S = G.ring + 2.4;

  const f = (n: number) => Math.round(n * 1000) / 1000;
  const arcs = phaseArcs(r);
  /** Each phase's arc in pieces of at most a quarter, and when the bead crosses each piece. */
  const fills = arcs.flatMap((a) => pieces(a.a0, a.a1).map(([b0, b1]) => ({ id: a.id, b0, w: b1 - b0, from: (b0 - START) / 360, to: (b1 - START) / 360, phase: a })));
  /** A faint mark at each whole second inside a phase, just inside the ring. */
  const ticks = arcs.flatMap((a) => {
    const ms = r.phases.find((p) => p.id === a.id)!.ms;
    return Array.from({ length: Math.max(0, ms / 1000 - 1) }, (_, j) => pt(G.ring - G.sw * 2.2, START + 360 * (a.from + ((j + 1) * 1000) / D)));
  });

  let root: HTMLDivElement | undefined = $state();
  let sphere: HTMLDivElement | undefined = $state();
  let warm: HTMLDivElement | undefined = $state();
  let cool: HTMLDivElement | undefined = $state();
  let sheen: HTMLDivElement | undefined = $state();
  let rim: HTMLDivElement | undefined = $state();
  let bloom: HTMLDivElement | undefined = $state();
  let ripple: HTMLDivElement | undefined = $state();
  let spin: HTMLDivElement | undefined = $state();
  let beadCore: HTMLElement | undefined = $state();
  const trail: HTMLDivElement[] = $state([]);
  const quads: HTMLDivElement[] = $state([]);
  const fillEls: HTMLDivElement[] = $state([]);

  /** Trail beads, and how far (ms) each lags the bead. */
  const TRAIL = small ? 4 : 6;
  const LAG = 95;

  // In: a gentle start that fills smoothly and settles with no overshoot as the lungs are full.
  // Hold: nearly still. Out: long and even, with a soft landing. Rest: still.
  const IN = 'cubic-bezier(0.36, 0, 0.24, 1)';
  const HOLD = 'cubic-bezier(0.45, 0, 0.55, 1)';
  const OUT = 'cubic-bezier(0.4, 0.04, 0.3, 1)';
  const EASE = 'cubic-bezier(0.33, 0, 0.2, 1)';

  type K = Keyframe & { offset: number };
  const frac = (ms: number) => ms / D;
  const len = (id: BreathPhaseId) => e[id].to - e[id].from;

  function start(): () => void {
    if (!root || typeof root.animate !== 'function') return () => {};
    const opts: KeyframeAnimationOptions = { duration: D, iterations: r.rounds, fill: 'both' };
    const lin: KeyframeAnimationOptions = { ...opts, easing: 'linear' };
    const anims: Animation[] = [];
    const into = Math.max(0, Date.now() + clock.offset - startAt);
    const run = (el: Element | undefined, frames: K[], lag = 0, o: KeyframeAnimationOptions = opts) => {
      if (!el) return;
      const a = el.animate(frames, o);
      anims.push(a);
      a.currentTime = into - lag;
      // Once it is ready to run (a frame later), join the guide's clock exactly.
      a.ready.then(() => (a.currentTime = Date.now() + clock.offset - startAt - lag)).catch(() => {});
    };
    const restDim = e.rest.from + len('rest') * 0.45;
    const still = reduced;

    // The sphere: its size (not under Calm), and how bright it is.
    const scale = (s: number) => (still ? {} : { transform: `scale(${s})` });
    run(sphere, [
      { offset: 0, ...scale(0.55), opacity: 0.6, easing: IN },
      { offset: e.in.to, ...scale(1), opacity: 1, easing: HOLD },
      { offset: e.hold.to, ...scale(1.012), opacity: 1, easing: OUT },
      { offset: e.out.to, ...scale(0.56), opacity: 0.78, easing: EASE },
      { offset: restDim, ...scale(0.553), opacity: 0.6 },
      { offset: 1, ...scale(0.55), opacity: 0.6 },
    ]);
    // Warm light floods in on the in-breath and holds; it ebbs on the out-breath, and the cool
    // light beneath shows through.
    run(warm, [
      { offset: 0, opacity: 0, easing: IN },
      { offset: e.in.to, opacity: 1 },
      { offset: e.hold.to, opacity: 1, easing: OUT },
      { offset: e.out.from + len('out') * 0.55, opacity: 0.16, easing: EASE },
      { offset: e.out.to, opacity: 0 },
      { offset: 1, opacity: 0 },
    ]);
    run(cool, [
      { offset: 0, opacity: 0.8, easing: IN },
      { offset: e.in.to, opacity: 0.5 },
      { offset: e.hold.to, opacity: 0.5, easing: OUT },
      { offset: e.out.to, opacity: 1, easing: EASE },
      { offset: 1, opacity: 0.8 },
    ]);
    run(sheen, [
      { offset: 0, opacity: 0.1, easing: IN },
      { offset: e.in.to, opacity: 0.85, easing: HOLD },
      { offset: e.hold.to, opacity: 0.95, easing: OUT },
      { offset: e.out.to, opacity: 0.2 },
      { offset: 1, opacity: 0.1 },
    ]);
    run(rim, [
      { offset: 0, opacity: 0.2, easing: IN },
      { offset: e.in.to, opacity: 0.7, easing: HOLD },
      { offset: e.hold.to, opacity: 1, easing: OUT },
      { offset: e.out.to, opacity: 0.3 },
      { offset: 1, opacity: 0.2 },
    ]);
    run(bloom, [
      { offset: 0, ...scale(0.6), opacity: 0.18, easing: IN },
      { offset: e.in.to, ...scale(1), opacity: 0.9, easing: HOLD },
      { offset: e.hold.to, ...scale(1.03), opacity: 0.85, easing: OUT },
      { offset: e.out.to, ...scale(0.62), opacity: 0.3, easing: EASE },
      { offset: restDim, ...scale(0.605), opacity: 0.2 },
      { offset: 1, ...scale(0.6), opacity: 0.18 },
    ]);

    // The arcs. Each piece turns into view inside its quarter as the bead crosses it (so it
    // fills right behind the bead), is brightest while its phase lasts, settles to a soft glow,
    // and the whole ring lets go together as the round ends; then it turns back out of view
    // while unseen, ready for the next round.
    const settle = frac(700);
    const letGo = frac(600);
    const snap = frac(10);
    const DONE = 0.42;
    fills.forEach((p, i) => {
      const last = p.phase.to >= 1 - 1e-9;
      if (still) {
        // Calm: the whole arc lights as its phase begins (slowly), by opacity only.
        const frames: K[] = [{ offset: 0, opacity: 0, easing: 'ease-in-out' }];
        if (p.phase.from > 0) frames.push({ offset: p.phase.from, opacity: 0, easing: 'ease-in-out' });
        frames.push({ offset: p.phase.from + frac(1200), opacity: 1 });
        if (!last) frames.push({ offset: p.phase.to, opacity: 1, easing: 'ease-out' }, { offset: Math.min(p.phase.to + settle, 1 - letGo), opacity: DONE });
        frames.push({ offset: 1 - letGo, opacity: last ? 1 : DONE, easing: 'ease-in-out' }, { offset: 1, opacity: 0 });
        run(quads[i], frames);
        return;
      }
      const turn: K[] = [{ offset: 0, transform: 'rotate(0deg)' }];
      if (p.from > 0) turn.push({ offset: p.from, transform: 'rotate(0deg)' });
      turn.push({ offset: p.to, transform: `rotate(${f(p.w)}deg)` }, { offset: 1 - snap, transform: `rotate(${f(p.w)}deg)` }, { offset: 1, transform: 'rotate(0deg)' });
      run(fillEls[i], turn, 0, lin);
      const glow: K[] = [{ offset: 0, opacity: 1 }];
      if (!last) glow.push({ offset: p.phase.to, opacity: 1, easing: 'ease-out' }, { offset: Math.min(p.phase.to + settle, 1 - letGo), opacity: DONE });
      glow.push({ offset: 1 - letGo, opacity: last ? 1 : DONE, easing: 'ease-in-out' }, { offset: 1 - snap, opacity: 0 }, { offset: 1, opacity: 1 });
      run(quads[i], glow);
    });

    if (!still) {
      // The bead goes once round per breath, at an even pace: a second per mark.
      const round: K[] = [
        { offset: 0, transform: `rotate(${START}deg)` },
        { offset: 1, transform: `rotate(${START + 360}deg)` },
      ];
      run(spin, round, 0, lin);
      trail.forEach((el, i) => run(el, round, LAG * (i + 1), lin));
      // At each turn the bead swells a little and settles.
      const swell: K[] = [{ offset: 0, transform: 'scale(1.6)', easing: EASE }, { offset: frac(650), transform: 'scale(1)' }];
      for (const a of arcs.slice(1)) {
        swell.push({ offset: a.from - frac(220), transform: 'scale(1)', easing: 'ease-in' });
        swell.push({ offset: a.from, transform: 'scale(1.6)', easing: EASE });
        swell.push({ offset: a.from + frac(650), transform: 'scale(1)' });
      }
      swell.push({ offset: 1 - frac(220), transform: 'scale(1)', easing: 'ease-in' });
      swell.push({ offset: 1, transform: 'scale(1.6)' });
      run(beadCore, swell);
      // A ripple leaves the sphere's edge at each turn, strongest as a breath begins.
      const size: Record<BreathPhaseId, number> = { in: 0.55, hold: 1, out: 1.012, rest: 0.56 };
      const peak: Record<BreathPhaseId, number> = { in: 0.5, hold: 0.32, out: 0.45, rest: 0.26 };
      const wave: K[] = [];
      for (const a of arcs) {
        const s = size[a.id];
        const end = Math.min(a.to - frac(40), a.from + frac(1500));
        wave.push({ offset: a.from, transform: `scale(${s})`, opacity: 0, easing: 'ease-out' });
        wave.push({ offset: a.from + frac(160), transform: `scale(${f(s * 1.04)})`, opacity: peak[a.id], easing: 'cubic-bezier(0.2, 0.6, 0.3, 1)' });
        wave.push({ offset: end, transform: `scale(${f(s * 1.42)})`, opacity: 0 });
      }
      wave.push({ offset: 1, transform: 'scale(0.55)', opacity: 0 });
      run(ripple, wave);
    }
    return () => anims.forEach((a) => a.cancel());
  }

  onMount(() => {
    let stop = start();
    // Lengths are in cqi; if the dial is resized mid-breath, start again from where it is.
    let w = root?.clientWidth ?? 0;
    const ro =
      typeof ResizeObserver === 'function' && root
        ? new ResizeObserver(() => {
            const nw = root?.clientWidth ?? 0;
            if (Math.abs(nw - w) < 2) return;
            w = nw;
            stop();
            stop = start();
          })
        : null;
    if (ro && root) ro.observe(root);
    return () => {
      ro?.disconnect();
      stop();
    };
  });

  const TONE: Record<BreathPhaseId, string> = { in: 'var(--warm)', hold: 'var(--glow)', out: 'var(--cool)', rest: 'var(--soft)' };
</script>

<div
  class="orb"
  class:still={reduced}
  class:dark
  class:compact
  style:--c={color}
  style:--ink={ink}
  style:--q={`${S}cqi`}
  aria-hidden="true"
  bind:this={root}
  transition:fade={{ duration: reduced ? 0 : 900, easing: cubicOut }}
>
  <div class="ctr bloom" style:--s={`${G.bloom * 2}cqi`} bind:this={bloom}></div>
  <div class="ctr ripple" style:--s={`${G.rs * 2}cqi`} bind:this={ripple}></div>
  <div class="ctr sphere" style:--s={`${G.rs * 2}cqi`} bind:this={sphere}>
    <div class="cool" bind:this={cool}></div>
    <div class="warm" bind:this={warm}></div>
    <div class="rim" bind:this={rim}></div>
    <div class="sheen" bind:this={sheen}></div>
  </div>

  <!-- the ring: each phase's arc as a faint track, and a mark at each second -->
  <svg class="ctr ring" style:--s={`${S * 2}cqi`} viewBox={`${-S} ${-S} ${S * 2} ${S * 2}`}>
    {#each arcs as a (a.id)}<path d={arc(G.ring, a.a0, a.a1)} class="track" stroke-width={G.track} />{/each}
    {#each ticks as p, i (i)}<circle cx={p[0]} cy={p[1]} r={G.track * 0.62} class="mark" />{/each}
  </svg>
  <!-- each arc's light, in a quarter of its own that clips it while it turns into view -->
  {#each fills as p, i (i)}
    <div class="quad" style:transform={`rotate(${f(p.b0)}deg)`} style:--tone={TONE[p.id]} bind:this={quads[i]}>
      <div class="fill" style:transform={reduced ? `rotate(${f(p.w)}deg)` : undefined} bind:this={fillEls[i]}>
        <svg viewBox={`${-S} ${-S} ${S * 2} ${S * 2}`}>
          <path d={arc(G.ring, -p.w, 0)} class="halo-line" stroke-width={G.sw * 4.2} />
          <path d={arc(G.ring, -p.w, 0)} class="line" stroke-width={G.sw} />
        </svg>
      </div>
    </div>
  {/each}
  {#if !reduced}
    {#each Array(TRAIL) as _, i (i)}
      <div class="spin" bind:this={trail[i]}>
        <div class="bead trail" style:--s={`${G.dot * (2.2 - i * 0.2)}cqi`} style:--r={`${G.ring}cqi`} style:opacity={0.6 - i * (0.52 / TRAIL)}><i></i></div>
      </div>
    {/each}
    <div class="spin" bind:this={spin}>
      <div class="bead" style:--s={`${G.dot * 5.5}cqi`} style:--r={`${G.ring}cqi`}><i bind:this={beadCore}></i></div>
    </div>
  {/if}
</div>

<style>
  .orb {
    position: absolute;
    inset: 0;
    pointer-events: none;
    /* The guide's light, from the rest colour: warmer as you fill, cooler as you let go. */
    --warm: color-mix(in oklch, var(--c) 52%, #ff8a6a);
    --cool: color-mix(in oklch, var(--c) 58%, #2f9dff);
    --glow: var(--c);
    --soft: color-mix(in oklab, var(--c) 82%, var(--ink));
    --core: color-mix(in oklab, var(--c) 88%, var(--ink));
  }
  .orb.dark {
    --warm: color-mix(in oklch, var(--c) 50%, #ffb48f);
    --cool: color-mix(in oklch, var(--c) 56%, #7cc8ff);
    --glow: color-mix(in oklab, var(--c) 55%, white);
    --soft: color-mix(in oklab, var(--c) 78%, transparent);
    --core: color-mix(in oklab, var(--c) 16%, white);
  }
  /* Centred on the dial, sized by --s. */
  .ctr {
    position: absolute;
    left: 50%;
    top: 50%;
    width: var(--s);
    height: var(--s);
    margin: calc(var(--s) / -2) 0 0 calc(var(--s) / -2);
  }
  .bloom,
  .ripple,
  .sphere {
    will-change: transform, opacity;
  }

  /* Light, not paint: a wide glow with no edge. */
  .bloom {
    background: radial-gradient(
      50% 50% at 50% 50%,
      color-mix(in oklab, var(--c) 24%, transparent) 0%,
      color-mix(in oklab, var(--c) 13%, transparent) 42%,
      color-mix(in oklab, var(--c) 4%, transparent) 72%,
      transparent 100%
    );
    opacity: 0.18;
    transform: scale(0.6);
  }
  .dark .bloom {
    background: radial-gradient(
      50% 50% at 50% 50%,
      color-mix(in oklab, var(--c) 30%, transparent) 0%,
      color-mix(in oklab, var(--c) 15%, transparent) 42%,
      color-mix(in oklab, var(--c) 5%, transparent) 72%,
      transparent 100%
    );
  }

  /* The sphere: cool light beneath, warm light over it, a luminous rim and a soft sheen. */
  .sphere {
    opacity: 0.6;
    transform: scale(0.55);
  }
  .sphere > div {
    position: absolute;
    inset: 0;
  }
  .cool {
    background: radial-gradient(
      50% 50% at 50% 54%,
      color-mix(in oklab, var(--cool) 30%, transparent) 0%,
      color-mix(in oklab, var(--cool) 23%, transparent) 34%,
      color-mix(in oklab, var(--cool) 12%, transparent) 58%,
      color-mix(in oklab, var(--cool) 4%, transparent) 80%,
      transparent 100%
    );
  }
  .warm {
    opacity: 0;
    background: radial-gradient(
      50% 50% at 46% 42%,
      color-mix(in oklab, var(--warm) 44%, transparent) 0%,
      color-mix(in oklab, var(--warm) 32%, transparent) 32%,
      color-mix(in oklab, var(--c) 15%, transparent) 58%,
      color-mix(in oklab, var(--c) 5%, transparent) 80%,
      transparent 100%
    );
  }
  .rim {
    opacity: 0.2;
    background: radial-gradient(50% 50% at 50% 50%, transparent 58%, color-mix(in oklab, var(--glow) 9%, transparent) 76%, color-mix(in oklab, var(--glow) 17%, transparent) 89%, transparent 100%);
  }
  .sheen {
    opacity: 0.1;
    background: radial-gradient(30% 24% at 38% 30%, rgb(255 255 255 / 0.55), rgb(255 255 255 / 0) 100%);
  }
  .dark .cool {
    background: radial-gradient(
      50% 50% at 50% 54%,
      color-mix(in oklab, var(--cool) 40%, transparent) 0%,
      color-mix(in oklab, var(--cool) 27%, transparent) 34%,
      color-mix(in oklab, var(--cool) 13%, transparent) 58%,
      color-mix(in oklab, var(--cool) 4%, transparent) 80%,
      transparent 100%
    );
  }
  .dark .warm {
    background: radial-gradient(
      50% 50% at 46% 42%,
      color-mix(in oklab, var(--warm) 52%, transparent) 0%,
      color-mix(in oklab, var(--warm) 35%, transparent) 32%,
      color-mix(in oklab, var(--c) 15%, transparent) 58%,
      color-mix(in oklab, var(--c) 5%, transparent) 80%,
      transparent 100%
    );
  }
  .dark .sheen {
    background: radial-gradient(30% 24% at 38% 30%, rgb(255 255 255 / 0.3), rgb(255 255 255 / 0) 100%);
  }

  .ripple {
    opacity: 0;
    transform: scale(0.55);
    background: radial-gradient(50% 50% at 50% 50%, transparent 84%, color-mix(in oklab, var(--glow) 55%, transparent) 94%, transparent 100%);
  }

  /* The ring. */
  .ring {
    display: block;
    overflow: visible;
  }
  .track {
    fill: none;
    stroke: color-mix(in srgb, var(--ink) 13%, transparent);
  }
  .dark .track {
    stroke: color-mix(in srgb, var(--ink) 16%, transparent);
  }
  .mark {
    fill: color-mix(in srgb, var(--ink) 22%, transparent);
  }
  /* A quarter of the ring's square, corner on the centre, turned to where its piece begins. */
  .quad {
    position: absolute;
    left: 50%;
    top: calc(50% - var(--q));
    width: var(--q);
    height: var(--q);
    overflow: hidden;
    transform-origin: 0 100%;
    will-change: opacity;
  }
  /* The piece's light, drawn just before the quarter; turning about the centre brings it in. */
  .fill {
    position: absolute;
    left: calc(var(--q) * -1);
    top: 0;
    width: calc(var(--q) * 2);
    height: calc(var(--q) * 2);
    will-change: transform;
  }
  .fill svg {
    display: block;
    width: 100%;
    height: 100%;
    overflow: visible;
  }
  .line,
  .halo-line {
    fill: none;
    stroke: var(--tone);
  }
  .halo-line {
    opacity: 0.15;
  }
  .dark .halo-line {
    opacity: 0.24;
  }

  /* The bead rides the ring: a zero-size pivot on the centre turns, the bead sits at its top. */
  .spin {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 0;
    height: 0;
    transform: rotate(225deg);
    will-change: transform;
  }
  /* A bright core in a soft glow; the trail is fainter and smaller. */
  .bead {
    position: absolute;
    left: calc(var(--s) / -2);
    top: calc(var(--r) * -1 - var(--s) / 2);
    width: var(--s);
    height: var(--s);
  }
  .bead i {
    position: absolute;
    inset: 0;
    background: radial-gradient(
      closest-side,
      var(--core) 0%,
      var(--core) 20%,
      color-mix(in oklab, var(--glow) 60%, transparent) 34%,
      color-mix(in oklab, var(--glow) 14%, transparent) 64%,
      transparent 100%
    );
  }
  .trail i {
    background: radial-gradient(closest-side, var(--glow) 0%, color-mix(in oklab, var(--glow) 70%, transparent) 38%, transparent 100%);
  }
  .bead:not(.trail) i {
    will-change: transform;
  }

  /* Calm: a still sphere, mid-breath; only light comes and goes. */
  .still .sphere {
    transform: scale(0.8);
  }
  .still .bloom {
    transform: scale(0.85);
  }
</style>
