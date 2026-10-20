<script lang="ts">
  // Alef's face: two OLED eyes on a dark visor. A behaviour plays as a run of eye poses (each
  // a CSS transition on transform only); lids drawn in the screen's black cut its shapes: a
  // slanted top lid frowns, a round bottom lid rising makes a happy crescent. Blinks, glances
  // and speech bobs are one-shot transitions on their own layers, so nothing loops while Alef
  // rests. A mood light under the visor glows in the feeling's colour.
  import { onMount, untrack } from 'svelte';
  import type { Affect } from '../../../lib/addons/alef/affect';
  import { BEHAVIORS, type BehaviorId, type Eye } from '../../../lib/addons/alef/behaviors';
  import { moodGlow, moodLed, restPose, STICKY } from '../../../lib/addons/alef/face';

  let {
    perf,
    performing = false,
    affect,
    talk = null,
    eyes = '#5CE1E6',
    led = 'feeling',
    line = null,
    compact = false,
    reduced = false,
    interactive = true,
    posture = false,
    gaze = true,
    bubble = null,
    onpoke,
    onopen,
    ondismiss,
    label = 'Alef',
  }: {
    perf: { id: BehaviorId; seq: number };
    performing?: boolean;
    affect: Affect;
    talk?: { seq: number; starts: number[]; total: number } | null;
    eyes?: string;
    /** 'feeling' or a fixed colour. */
    led?: string;
    /** A short readout on the screen, under the eyes ("45m"). */
    line?: string | null;
    compact?: boolean;
    reduced?: boolean;
    interactive?: boolean;
    /** Tilt and bob the face itself (where there's no dial to move). */
    posture?: boolean;
    /** Glance toward the pointer now and then. */
    gaze?: boolean;
    bubble?: { text: string; seq: number } | null;
    onpoke?: () => void;
    onopen?: () => void;
    ondismiss?: () => void;
    label?: string;
  } = $props();

  type Pose = { l: Eye; r: Eye; ms: number };
  const rest = $derived(restPose(affect));
  let pose = $state<Pose | null>(null);
  let asleep = $state(false);
  const shown = $derived<Pose>(pose ?? { ...rest, ms: 520 });
  const b = $derived(BEHAVIORS[perf.id]);
  const ledColor = $derived(led === 'feeling' ? moodLed(affect, performing ? perf.id : null) : led);
  const glow = $derived(moodGlow(affect, performing ? perf.id : null));

  let timers: ReturnType<typeof setTimeout>[] = [];
  const clear = () => {
    timers.forEach(clearTimeout);
    timers = [];
  };

  function play(id: BehaviorId) {
    clear();
    const beh = BEHAVIORS[id];
    asleep = false;
    if (reduced) {
      const last = beh.poses.at(-1)!;
      pose = STICKY.includes(id) ? { l: last.l, r: last.r, ms: 0 } : null;
      asleep = STICKY.includes(id);
      return;
    }
    let t = 0;
    for (const p of beh.poses) {
      timers.push(setTimeout(() => (pose = { l: p.l, r: p.r, ms: p.ms }), t));
      t += p.ms + p.hold;
    }
    timers.push(
      setTimeout(() => {
        if (STICKY.includes(id)) asleep = true;
        else pose = null;
      }, t),
    );
  }

  let lastSeq = -1;
  $effect(() => {
    const { id, seq } = perf;
    untrack(() => {
      if (seq === lastSeq) return;
      const first = lastSeq === -1;
      lastSeq = seq;
      // A face that just appeared starts calm, unless it's asleep.
      if (first && !STICKY.includes(id)) return;
      play(id);
    });
  });

  // ── Blinks and glances: one-shot, a few seconds apart, never while performing ──
  let blink = $state(false);
  let glance = $state({ x: 0, y: 0 });
  let follow = $state<{ x: number; y: number } | null>(null);
  let life: ReturnType<typeof setTimeout> | null = null;
  function live() {
    const ms = 2400 + Math.random() * 4200;
    life = setTimeout(() => {
      const busy = !!pose || asleep || document.hidden;
      if (!busy && !reduced) {
        if (Math.random() < 0.72) {
          blink = true;
          setTimeout(() => (blink = false), 120);
          if (Math.random() < 0.18) setTimeout(() => ((blink = true), setTimeout(() => (blink = false), 110)), 260);
        } else if (!follow) {
          glance = { x: (Math.random() - 0.5) * 10, y: (Math.random() - 0.5) * 5 };
          setTimeout(() => (glance = { x: 0, y: 0 }), 900 + Math.random() * 900);
        }
      }
      live();
    }, ms);
  }

  // ── Speech: the eyes bob a little on each syllable ──
  let bob = $state(0);
  let bobTimers: ReturnType<typeof setTimeout>[] = [];
  $effect(() => {
    const t = talk;
    untrack(() => {
      bobTimers.forEach(clearTimeout);
      bobTimers = [];
      bob = 0;
      if (!t || reduced) return;
      for (const s of t.starts.slice(0, 60)) {
        bobTimers.push(setTimeout(() => (bob = 1), s * 1000));
        bobTimers.push(setTimeout(() => (bob = 0), s * 1000 + 85));
      }
    });
  });

  // ── Glancing toward the pointer when it moves nearby ──
  let root = $state<HTMLElement>();
  let frame = 0;
  let idleFollow: ReturnType<typeof setTimeout> | null = null;
  function onMove(e: PointerEvent) {
    if (!gaze || reduced || frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (!root || pose || asleep) return;
      const r = root.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const d = Math.hypot(dx, dy);
      if (d > Math.max(420, r.width * 3)) return;
      const k = Math.min(1, d / (r.width * 1.6));
      follow = { x: (dx / (d || 1)) * 12 * k, y: (dy / (d || 1)) * 7 * k };
      if (idleFollow) clearTimeout(idleFollow);
      idleFollow = setTimeout(() => (follow = null), 2200);
    });
  }

  onMount(() => {
    live();
    if (interactive && gaze) addEventListener('pointermove', onMove, { passive: true });
    return () => {
      clear();
      bobTimers.forEach(clearTimeout);
      if (life) clearTimeout(life);
      if (idleFollow) clearTimeout(idleFollow);
      if (frame) cancelAnimationFrame(frame);
      removeEventListener('pointermove', onMove);
    };
  });

  const look = $derived(follow ?? glance);
  const ease = (ms: number) => (ms <= 180 ? 'cubic-bezier(.3, 1.6, .55, 1)' : 'cubic-bezier(.45, .05, .25, 1)');
  const bloomOf = (e: Eye) => Math.max(0.12, (1 - e.lid) * (1 - e.smile * 0.45));

  const postureStyle = $derived.by(() => {
    if (!posture || reduced || !performing) return '';
    const p = b.posture;
    return `translateY(${p.y * 0.5}cqi) rotate(${p.tilt}deg) scale(${p.scale})`;
  });

  // Overlays: a few glyphs for the moment (hearts, zzz, a tear…), once per performance.
  const overlay = $derived(performing && !reduced ? (b.overlay ?? null) : asleep && !reduced ? 'zzz' : null);
  const CONFETTI = ['#FFD84A', '#5CF2B0', '#FF7AB8', '#7AA7FF', '#FFB14A', '#A58BFF'];
</script>

{#snippet eye(e: Eye, side: 'l' | 'r', ms: number)}
  <div
    class="eye {side}"
    style:--x={e.x}
    style:--y={e.y}
    style:--sx={e.sx}
    style:--sy={e.sy}
    style:--rot={e.rot}
    style:--lid={e.lid}
    style:--slant={e.slant}
    style:--smile={e.smile}
    style:--ms={`${ms}ms`}
    style:--ease={ease(ms)}
  >
    <i class="bloom" style:opacity={bloomOf(e) * 0.55}></i>
    <div class="ball">
      <i class="lid top"></i>
      <i class="lid bottom"></i>
    </div>
  </div>
{/snippet}

<div
  class="alef"
  class:compact
  class:asleep
  class:has-line={!!line}
  style:--eye={eyes}
  style:--led={ledColor}
  style:--glow={glow}
  style:transform={postureStyle || null}
  bind:this={root}
>
  {#if bubble && !compact}
    {#key bubble.seq}
      <button class="bubble" onclick={() => ondismiss?.()} aria-live="polite" title="Click to hide">
        {bubble.text}
      </button>
    {/key}
  {/if}

  <i class="halo" aria-hidden="true"></i>
  <svelte:element
    this={interactive ? 'button' : 'div'}
    class="visor"
    class:shake={performing && b.posture.shake && posture && !reduced}
    class:bounce={performing && b.posture.bounce && posture && !reduced}
    aria-label={interactive ? `${label}. Click to say hello, double-click to talk.` : label}
    role={interactive ? undefined : 'img'}
    onclick={interactive ? () => onpoke?.() : undefined}
    ondblclick={interactive ? () => onopen?.() : undefined}
  >
    <div class="eyes" style:--gx={look.x} style:--gy={look.y}>
      <div class="pair" class:blink class:bob={bob === 1}>
        {@render eye(shown.l, 'l', shown.ms)}
        {@render eye(shown.r, 'r', shown.ms)}
      </div>
    </div>
    {#if line}<span class="line tnum">{line}</span>{/if}
    <i class="scan" aria-hidden="true"></i>
    <i class="sheen" aria-hidden="true"></i>

    {#if overlay}
      {#key `${perf.seq}:${overlay}`}
        <div class="fx {overlay}" aria-hidden="true">
          {#if overlay === 'hearts'}
            {#each [0, 1, 2] as i (i)}<svg class="g heart" style:--i={i} viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-9.6-9.1C.9 8.6 2.8 4.5 6.6 4.5c2.2 0 3.6 1.2 5.4 3.2 1.8-2 3.2-3.2 5.4-3.2 3.8 0 5.7 4.1 4.2 7.4C19.5 16.4 12 21 12 21z" /></svg>{/each}
          {:else if overlay === 'stars' || overlay === 'spark'}
            {#each [0, 1, 2, 3] as i (i)}<svg class="g star" style:--i={i} style:--row={i % 2} viewBox="0 0 24 24"><path d="M12 1.5l2.6 7.9 7.9 2.6-7.9 2.6L12 22.5l-2.6-7.9L1.5 12l7.9-2.6z" /></svg>{/each}
          {:else if overlay === 'zzz'}
            {#each [0, 1, 2] as i (i)}<span class="g z" style:--i={i}>z</span>{/each}
          {:else if overlay === 'sweat'}
            <svg class="g drop" viewBox="0 0 24 24"><path d="M12 2.5c3.5 5 6 8.2 6 11.5a6 6 0 0 1-12 0c0-3.3 2.5-6.5 6-11.5z" /></svg>
          {:else if overlay === 'tear'}
            <svg class="g tear" viewBox="0 0 24 24"><path d="M12 2.5c3.5 5 6 8.2 6 11.5a6 6 0 0 1-12 0c0-3.3 2.5-6.5 6-11.5z" /></svg>
          {:else if overlay === 'question'}
            <span class="g mark">?</span>
          {:else if overlay === 'exclaim'}
            <span class="g mark ex">!</span>
          {:else if overlay === 'vein'}
            <svg class="g vein" viewBox="0 0 24 24"><path d="M4 9.5c3 .3 5-1.6 5.5-5M14.5 4.5c.5 3.4 2.5 5.3 5.5 5M20 14.5c-3-.3-5 1.6-5.5 5M9.5 19.5c-.5-3.4-2.5-5.3-5.5-5" /></svg>
          {:else if overlay === 'confetti'}
            {#each Array(14) as _, i (i)}<i class="g bit" style:--i={i} style:--c={CONFETTI[i % CONFETTI.length]} style:--dx={`${((i * 37) % 21) - 10}`} style:--rot={`${(i * 53) % 360}deg`}></i>{/each}
          {/if}
        </div>
      {/key}
    {/if}
  </svelte:element>
  <div class="leds" aria-hidden="true">
    {#key perf.seq}
      <i style:--d="0ms" class:chase={performing && !reduced}></i><i style:--d="70ms" class:chase={performing && !reduced}></i><i style:--d="140ms" class:chase={performing && !reduced}></i>
    {/key}
  </div>
</div>

<style>
  .alef {
    --screen: #04060b;
    position: relative;
    display: grid;
    justify-items: center;
    width: 100%;
    container-type: inline-size;
    transition: transform 520ms cubic-bezier(0.34, 1.4, 0.64, 1);
    pointer-events: none;
  }
  .halo {
    position: absolute;
    left: 50%;
    top: 30%;
    width: 120%;
    aspect-ratio: 1.9;
    translate: -50% -50%;
    border-radius: 50%;
    background: radial-gradient(closest-side, color-mix(in srgb, var(--led) 34%, transparent), transparent 72%);
    opacity: calc(var(--glow) * 0.75);
    transition: opacity 600ms ease;
    pointer-events: none;
  }
  .visor {
    position: relative;
    display: block;
    width: 100%;
    border: 0;
    color: inherit;
    aspect-ratio: 200 / 120;
    padding: 0;
    border-radius: 15cqi / 20cqi;
    /* Flat, so the lids (drawn in the same black) never show their edges. */
    background: var(--screen);
    box-shadow:
      0 0 0 1.4cqi #1b2230,
      0 0 0 1.9cqi color-mix(in srgb, var(--led) 45%, #2a3242),
      0 1.6cqi 5cqi rgba(5, 10, 20, 0.35),
      inset 0 0 6cqi rgba(0, 0, 0, 0.9);
    overflow: hidden;
    overflow: clip;
    container-type: inline-size;
    pointer-events: auto;
    cursor: pointer;
    transition: box-shadow 500ms ease;
    -webkit-tap-highlight-color: transparent;
  }
  div.visor {
    cursor: default;
    pointer-events: none;
  }
  button.visor:focus-visible {
    outline: 2px solid var(--eye);
    outline-offset: 4cqi;
  }
  button.visor:active .pair {
    scale: 1.04 0.92;
  }
  /* 200 × 120 screen units: 1 unit = 0.5cqi of the visor. */
  .eyes {
    position: absolute;
    inset: 0;
    transform: translate(calc(var(--gx) * 0.5cqi), calc(var(--gy) * 0.5cqi));
    transition: transform 380ms cubic-bezier(0.3, 1.25, 0.5, 1);
  }
  .pair {
    position: absolute;
    inset: 0;
    transition:
      scale 110ms ease-out,
      translate 110ms ease-out;
  }
  .pair.blink {
    scale: 1 0.08;
    translate: 0 1.5cqi;
    transition-duration: 70ms;
  }
  .pair.bob {
    scale: 1.03 0.9;
    translate: 0 1cqi;
    transition-duration: 70ms;
  }
  .eye {
    position: absolute;
    top: calc(50% - 14cqi);
    width: 23cqi;
    height: 28cqi;
    transform: translate(calc(var(--x) * 0.5cqi), calc(var(--y) * 0.5cqi)) rotate(calc(var(--rot) * 1deg)) scale(var(--sx), var(--sy));
    transition: transform var(--ms) var(--ease);
  }
  .has-line .eye {
    top: calc(44% - 14cqi);
  }
  .eye.l {
    left: calc(32% - 11.5cqi);
  }
  .eye.r {
    left: calc(68% - 11.5cqi);
  }
  .bloom {
    position: absolute;
    inset: -30% -34%;
    border-radius: 40%;
    background: radial-gradient(closest-side, color-mix(in srgb, var(--eye) 70%, transparent), transparent 75%);
    transition: opacity var(--ms) var(--ease);
  }
  .ball {
    position: absolute;
    inset: 0;
    border-radius: 24% / 21%;
    background:
      radial-gradient(90% 70% at 50% 35%, color-mix(in srgb, var(--eye) 65%, white) 0%, var(--eye) 55%, color-mix(in srgb, var(--eye) 82%, black) 100%);
    overflow: hidden;
    overflow: clip;
  }
  .lid {
    position: absolute;
    background: var(--screen);
    transition: transform var(--ms) var(--ease);
  }
  .lid.top {
    left: -35%;
    width: 170%;
    height: 104%;
    bottom: 100%;
    transform-origin: 50% 100%;
    transform: translateY(calc(var(--lid) * 100%)) rotate(calc(var(--slant) * 1deg));
  }
  /* A round lid rising from below: its arc cuts the eye into a happy crescent. */
  .lid.bottom {
    left: -10%;
    width: 120%;
    height: 120%;
    top: 100%;
    border-radius: 50%;
    transform: translateY(calc(var(--smile) * -76%));
  }
  .line {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 7cqi;
    text-align: center;
    font-family: var(--font-ui);
    font-size: 8.4cqi;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: color-mix(in srgb, var(--eye) 82%, white);
    text-shadow: 0 0 2.4cqi color-mix(in srgb, var(--eye) 60%, transparent);
    opacity: 0.86;
    white-space: nowrap;
  }
  .asleep .line {
    opacity: 0.4;
  }
  .scan {
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(to bottom, rgba(255, 255, 255, 0.05) 0 1px, transparent 1px 3px);
    mix-blend-mode: overlay;
    pointer-events: none;
  }
  /* Glass over the screen: a soft glow in the middle and a highlight, over eyes and lids alike. */
  .sheen {
    position: absolute;
    inset: 0;
    background:
      linear-gradient(160deg, rgba(255, 255, 255, 0.09) 0%, rgba(255, 255, 255, 0.02) 28%, transparent 46%),
      radial-gradient(120% 90% at 50% 38%, rgba(120, 150, 200, 0.06) 0%, transparent 64%);
    pointer-events: none;
  }
  .leds {
    display: flex;
    gap: 2.2cqi;
    margin-top: 4.6cqi;
  }
  .leds i {
    width: 7cqi;
    height: 1.9cqi;
    border-radius: 2cqi;
    background: var(--led);
    opacity: calc(0.22 + var(--glow) * 0.7);
    box-shadow: 0 0 2.6cqi color-mix(in srgb, var(--led) 70%, transparent);
    transition:
      opacity 500ms ease,
      background 500ms ease;
  }
  .leds i.chase {
    animation: chase 900ms var(--d) ease-out both;
  }
  @keyframes chase {
    0% {
      opacity: 0.15;
    }
    35% {
      opacity: 1;
    }
    100% {
      opacity: calc(0.22 + var(--glow) * 0.7);
    }
  }
  .compact .leds {
    display: none;
  }

  /* Posture moves (the gallery's faces; on the dial the whole dial moves) */
  .visor.shake {
    animation: shake 520ms ease-in-out 1;
  }
  .visor.bounce {
    animation: bounce 700ms cubic-bezier(0.3, 1.5, 0.5, 1) 1;
  }
  @keyframes shake {
    0%,
    100% {
      translate: 0 0;
    }
    20%,
    60% {
      translate: -2.5cqi 0;
    }
    40%,
    80% {
      translate: 2.5cqi 0;
    }
  }
  @keyframes bounce {
    0%,
    100% {
      translate: 0 0;
    }
    30% {
      translate: 0 -5cqi;
    }
    55% {
      translate: 0 0;
    }
    75% {
      translate: 0 -2cqi;
    }
  }

  /* Overlays: one-shot, transform and opacity only */
  .fx {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .g {
    position: absolute;
    fill: currentColor;
  }
  .heart {
    width: 11cqi;
    color: #ff7ab8;
    right: calc(10cqi + var(--i) * 9cqi);
    top: 34cqi;
    filter: drop-shadow(0 0 1.5cqi rgba(255, 122, 184, 0.6));
    animation: rise 1700ms calc(var(--i) * 180ms) cubic-bezier(0.2, 0.7, 0.3, 1) both;
  }
  .star {
    width: 9cqi;
    color: #ffd84a;
    left: calc(8cqi + var(--i) * 25cqi);
    top: calc(8cqi + var(--row) * 32cqi);
    filter: drop-shadow(0 0 1.6cqi rgba(255, 216, 74, 0.7));
    animation: twinkle 1300ms calc(var(--i) * 140ms) ease-out both;
  }
  .z {
    right: calc(9cqi + var(--i) * 6cqi);
    top: calc(14cqi - var(--i) * 3cqi);
    font: 700 calc(7cqi + var(--i) * 2.4cqi) / 1 var(--font-ui);
    color: color-mix(in srgb, var(--eye) 85%, white);
    opacity: 0;
    animation: zzz 2400ms calc(var(--i) * 420ms) ease-out both;
  }
  .drop {
    width: 8cqi;
    left: 7cqi;
    top: 6cqi;
    color: #8fd3ff;
    animation: slide 1500ms ease-in both;
  }
  .tear {
    width: 6.5cqi;
    left: calc(32% - 3cqi);
    top: 34cqi;
    color: #8fd3ff;
    animation: tear 2000ms 300ms ease-in both;
  }
  .mark {
    right: 8cqi;
    top: 2cqi;
    font: 800 17cqi / 1 var(--font-ui);
    color: color-mix(in srgb, var(--eye) 70%, white);
    animation: pop 1400ms cubic-bezier(0.3, 1.6, 0.5, 1) both;
  }
  .mark.ex {
    color: #ffd84a;
  }
  .vein {
    width: 13cqi;
    right: 6cqi;
    top: 4cqi;
    fill: none;
    stroke: #ff8a4c;
    stroke-width: 2.6;
    stroke-linecap: round;
    animation: throb 900ms ease-in-out 2 both;
  }
  .bit {
    width: 2.6cqi;
    height: 4.2cqi;
    left: 50%;
    top: 30%;
    border-radius: 0.6cqi;
    background: var(--c);
    animation: burst 1500ms calc(var(--i) * 18ms) cubic-bezier(0.15, 0.7, 0.3, 1) both;
  }
  @keyframes rise {
    0% {
      transform: translateY(0) scale(0.4);
      opacity: 0;
    }
    20% {
      opacity: 1;
      transform: translateY(-4cqi) scale(1.05);
    }
    100% {
      transform: translateY(-30cqi) scale(0.8);
      opacity: 0;
    }
  }
  @keyframes twinkle {
    0% {
      transform: scale(0) rotate(-40deg);
      opacity: 0;
    }
    40% {
      transform: scale(1.15) rotate(10deg);
      opacity: 1;
    }
    100% {
      transform: scale(0.6) rotate(30deg);
      opacity: 0;
    }
  }
  @keyframes zzz {
    0% {
      transform: translate(0, 4cqi);
      opacity: 0;
    }
    30% {
      opacity: 0.9;
    }
    100% {
      transform: translate(5cqi, -14cqi);
      opacity: 0;
    }
  }
  @keyframes slide {
    0% {
      transform: translateY(-3cqi);
      opacity: 0;
    }
    25% {
      opacity: 1;
    }
    100% {
      transform: translateY(12cqi);
      opacity: 0;
    }
  }
  @keyframes tear {
    0% {
      transform: translateY(0) scale(0.5);
      opacity: 0;
    }
    25% {
      opacity: 1;
      transform: translateY(2cqi) scale(1);
    }
    100% {
      transform: translateY(22cqi) scale(0.9);
      opacity: 0;
    }
  }
  @keyframes pop {
    0% {
      transform: scale(0) rotate(-20deg);
      opacity: 0;
    }
    25% {
      transform: scale(1.2) rotate(8deg);
      opacity: 1;
    }
    80% {
      transform: scale(1) rotate(0);
      opacity: 1;
    }
    100% {
      transform: scale(0.9);
      opacity: 0;
    }
  }
  @keyframes throb {
    0%,
    100% {
      transform: scale(0.85);
      opacity: 0.6;
    }
    50% {
      transform: scale(1.12);
      opacity: 1;
    }
  }
  @keyframes burst {
    0% {
      transform: translate(-50%, 0) rotate(0) scale(0.4);
      opacity: 0;
    }
    15% {
      opacity: 1;
    }
    100% {
      transform: translate(calc(-50% + var(--dx) * 5cqi), calc(30cqi - (var(--dx) * var(--dx)) * 0.15cqi)) rotate(var(--rot)) scale(1);
      opacity: 0;
    }
  }

  /* The speech bubble */
  .bubble {
    position: absolute;
    bottom: calc(100% + 3cqi);
    left: 50%;
    z-index: 3;
    translate: -50% 0;
    width: max-content;
    max-width: 150%;
    padding: 1.2em 1.4em;
    padding: 9px 13px;
    border-radius: 16px;
    background: var(--raised);
    color: var(--ink);
    box-shadow: var(--shadow-3);
    border: 1px solid var(--line);
    font-family: var(--font-ui);
    font-size: clamp(12px, 7cqi, 15px);
    line-height: 1.35;
    text-align: center;
    pointer-events: auto;
    animation: speak 420ms cubic-bezier(0.3, 1.5, 0.5, 1) both;
    transform-origin: 50% 100%;
    cursor: pointer;
  }
  .bubble::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 100%;
    width: 12px;
    height: 12px;
    translate: -50% -6px;
    rotate: 45deg;
    background: var(--raised);
    border-right: 1px solid var(--line);
    border-bottom: 1px solid var(--line);
  }
  @keyframes speak {
    0% {
      transform: scale(0.6) translateY(8px);
      opacity: 0;
    }
    100% {
      transform: none;
      opacity: 1;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .bubble,
    .g,
    .leds i.chase {
      animation: none;
    }
  }
</style>
