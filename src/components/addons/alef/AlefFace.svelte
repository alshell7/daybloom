<script lang="ts">
  // Alef's face. On the dial it is just the eyes, living on the dial's own glass screen; in the
  // panel and the gallery it brings its own round screen with a mood-lit rim. A feeling plays as
  // a run of poses the eyes spring toward (AlefEyes); between feelings the face rests in the
  // mood, blinks, glances at the pointer and bobs while it talks. Overlays (hearts, zzz, a
  // tear…) are one-shot, transform and opacity only.
  import { onMount, untrack } from 'svelte';
  import type { Affect } from '../../../lib/addons/alef/affect';
  import { ACTS, type ActId, type Eye } from '../../../lib/addons/alef/behaviors';
  import { moodGlow, moodLed, restPose, STICKY } from '../../../lib/addons/alef/face';
  import AlefEyes from './AlefEyes.svelte';
  import type { ScreenPalette } from '../../../lib/addons/alef/palette';
  import { gesture, type Gesture, type Sample } from '../../../lib/addons/alef/pet';

  let {
    perf,
    performing = false,
    affect,
    talk = null,
    eyes = '#5CE1E6',
    led = 'feeling',
    line = null,
    framed = true,
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
    screen = null,
    attend = null,
    ontouch,
  }: {
    perf: { id: ActId; seq: number };
    performing?: boolean;
    affect: Affect;
    talk?: { seq: number; starts: number[]; total: number } | null;
    eyes?: string;
    /** 'feeling' or a fixed colour. */
    led?: string;
    /** A short readout under the eyes (framed faces only; on the dial the readout shows it). */
    line?: string | null;
    /** Its own round screen (panel, gallery); false on the dial, which is the screen. */
    framed?: boolean;
    compact?: boolean;
    reduced?: boolean;
    interactive?: boolean;
    /** Lean and hop the face itself (where there's no dial to move). */
    posture?: boolean;
    /** Glance toward the pointer when it's near. */
    gaze?: boolean;
    bubble?: { text: string; seq: number } | null;
    onpoke?: () => void;
    onopen?: () => void;
    ondismiss?: () => void;
    label?: string;
    /** The screen's colours (the dial's finish, or black glass). */
    screen?: ScreenPalette | null;
    /** Somewhere to look (−1..1 each way), e.g. the field you're typing in. */
    attend?: { x: number; y: number } | null;
    /** Stroking the face (petting), a fast wiggle (tickling), or a press held (a squeeze). */
    ontouch?: (kind: Gesture | 'squish') => void;
  } = $props();

  // ── Touch: strokes and wiggles over the face, and a long press ──
  let samples: Sample[] = [];
  let hold: ReturnType<typeof setTimeout> | null = null;
  let held = false;
  let downAt: { x: number; y: number } | null = null;
  function faceMove(e: PointerEvent) {
    if (!ontouch || !root) return;
    const r = root.getBoundingClientRect();
    const now = performance.now();
    samples.push({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.width, t: now });
    if (samples.length > 60) samples.splice(0, samples.length - 60);
    if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 8 && hold) {
      clearTimeout(hold);
      hold = null;
    }
    const g = gesture(samples, now);
    if (g) {
      samples = [];
      ontouch(g);
    }
  }
  function faceDown(e: PointerEvent) {
    held = false;
    downAt = { x: e.clientX, y: e.clientY };
    if (!ontouch || e.button > 0) return;
    hold = setTimeout(() => {
      hold = null;
      held = true;
      ontouch('squish');
    }, 650);
  }
  function faceUp() {
    if (hold) clearTimeout(hold);
    hold = null;
    downAt = null;
  }
  function faceClick() {
    if (held) {
      held = false;
      return;
    }
    onpoke?.();
  }
  const eyeColor = $derived(screen?.eye ?? eyes);
  const eyeGlow = $derived(screen ? screen.glow : 1);
  const scan = $derived(screen ? screen.scan : 0.13);

  type Pose = { l: Eye; r: Eye; ms: number };
  const rest = $derived(restPose(affect));
  let pose = $state<Pose | null>(null);
  let asleep = $state(false);
  const shown = $derived<Pose>(pose ?? { ...rest, ms: 480 });
  const b = $derived(ACTS[perf.id]);
  const ledColor = $derived(led === 'feeling' ? moodLed(affect, performing ? perf.id : null) : led);
  const glow = $derived(moodGlow(affect, performing ? perf.id : null));

  let timers: ReturnType<typeof setTimeout>[] = [];
  const clear = () => {
    timers.forEach(clearTimeout);
    timers = [];
  };

  function play(id: ActId) {
    clear();
    const beh = ACTS[id];
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

  // ── Glancing toward the pointer ──
  let root = $state<HTMLElement>();
  let follow = $state<{ x: number; y: number } | null>(null);
  let frame = 0;
  let idle: ReturnType<typeof setTimeout> | null = null;
  function onMove(e: PointerEvent) {
    if (!gaze || reduced || frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (!root || pose || asleep) return;
      const r = root.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy);
      if (d > Math.max(460, r.width * 3)) return;
      const k = Math.min(1, d / (r.width * 1.4));
      follow = { x: (dx / (d || 1)) * k, y: (dy / (d || 1)) * k };
      if (idle) clearTimeout(idle);
      idle = setTimeout(() => (follow = null), 2000);
    });
  }

  onMount(() => {
    if (interactive && gaze) addEventListener('pointermove', onMove, { passive: true });
    return () => {
      clear();
      if (idle) clearTimeout(idle);
      if (frame) cancelAnimationFrame(frame);
      removeEventListener('pointermove', onMove);
    };
  });

  const postureStyle = $derived.by(() => {
    if (!posture || reduced || !performing) return '';
    const p = b.posture;
    // In % of its own size: there may be no container around it to measure by.
    return `translateY(${p.y * 0.5}%) rotate(${p.tilt}deg) scale(${p.scale})`;
  });
  const k = $derived(perf.seq % 2);
  const move = $derived(posture && performing && !reduced ? (b.posture.shake ? `alef-shake-${k} 520ms ease-in-out 1` : b.posture.bounce ? `alef-hop-${k} 700ms cubic-bezier(.3,1.5,.5,1) 1` : null) : null);

  // Overlays for the moment (hearts, zzz, a tear…), once per performance.
  const overlay = $derived(performing && !reduced ? (b.overlay ?? null) : asleep && !reduced ? 'zzz' : null);
  const CONFETTI = ['#FFD84A', '#5CF2B0', '#FF7AB8', '#7AA7FF', '#FFB14A', '#A58BFF'];
</script>

<div
  class="alef"
  class:framed
  class:compact
  class:asleep
  class:light={screen ? !screen.dark : false}
  style:--eye={eyeColor}
  style:--led={ledColor}
  style:--glow={glow}
  style:--scan={scan}
  style:--well={screen?.well}
  style:--well-edge={screen?.wellEdge}
  style:--bezel={screen?.bezel}
  style:--shade-top={screen?.shadeTop}
  style:--shade-bottom={screen?.shadeBottom}
  style:transform={postureStyle || null}
  bind:this={root}
>
  {#if bubble && !compact}
    {#key bubble.seq}
      <button class="bubble" onclick={() => ondismiss?.()} aria-live="polite" title="Click to talk">{bubble.text}</button>
    {/key}
  {/if}

  <svelte:element
    this={interactive ? 'button' : 'div'}
    class="face"
    style:animation={move}
    aria-label={interactive ? `${label}. Click to say hello, double-click to talk.` : label}
    role={interactive ? undefined : 'img'}
    onclick={interactive ? faceClick : undefined}
    ondblclick={interactive ? () => onopen?.() : undefined}
    onpointermove={interactive ? faceMove : undefined}
    onpointerdown={interactive ? faceDown : undefined}
    onpointerup={interactive ? faceUp : undefined}
    onpointerleave={interactive ? faceUp : undefined}
  >
    {#if framed}<i class="rim" aria-hidden="true"></i>{/if}
    <div class="eyes">
      <AlefEyes pose={shown} color={eyeColor} glow={(0.35 + glow * 0.5) * eyeGlow} shadow={screen && !screen.dark ? 'rgba(20, 28, 42, 0.22)' : null} look={pose ? null : (attend ?? follow)} {talk} alive={!pose && !asleep} {asleep} {reduced} />
      {#if scan > 0}<i class="scan" aria-hidden="true"></i>{/if}
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
    </div>
    {#if framed && line}<span class="line tnum">{line}</span>{/if}
  </svelte:element>
</div>

<style>
  .alef {
    position: relative;
    display: grid;
    justify-items: center;
    width: 100%;
    container-type: inline-size;
    transition: transform 560ms cubic-bezier(0.34, 1.4, 0.64, 1);
    pointer-events: none;
  }
  .face {
    position: relative;
    display: grid;
    place-items: center;
    width: 100%;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    pointer-events: auto;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    border-radius: 999px;
  }
  div.face {
    cursor: default;
    pointer-events: none;
  }
  button.face:focus-visible {
    outline: 2px solid var(--eye);
    outline-offset: 2px;
  }
  /* A press squashes the face a little, like poking something soft. */
  button.face:active .eyes {
    scale: 1.05 0.9;
    transition: scale 90ms ease-out;
  }
  .eyes {
    position: relative;
    width: 100%;
    transition: scale 260ms cubic-bezier(0.3, 1.6, 0.5, 1);
  }
  .scan {
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(to bottom, rgba(0, 0, 0, var(--scan)) 0 1px, transparent 1px 3px);
    pointer-events: none;
  }

  /* Its own screen: a round pane of dark glass, edge-lit in the mood's colour. */
  .framed .face {
    aspect-ratio: 1;
    background: radial-gradient(70% 62% at 50% 40%, var(--well, #111722) 0%, var(--well-edge, #05070b) 100%);
    box-shadow:
      0 0 0 3.2cqi var(--bezel, #12161e),
      0 2.4cqi 7cqi rgba(5, 10, 20, 0.18),
      inset 0 2.2cqi 3.6cqi var(--shade-top, rgba(0, 0, 0, 0.6)),
      inset 0 -1.4cqi 2.6cqi var(--shade-bottom, rgba(255, 255, 255, 0.06));
    overflow: hidden;
    overflow: clip;
  }
  .framed.light .face::after {
    display: none;
  }
  .framed .face::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: linear-gradient(155deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.025) 30%, transparent 48%);
    pointer-events: none;
  }
  .framed .eyes {
    width: 76%;
    margin-top: -4%;
  }
  .rim {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: radial-gradient(closest-side, transparent 86%, color-mix(in srgb, var(--led) 18%, transparent) 95%, color-mix(in srgb, var(--led) 50%, transparent) 100%);
    opacity: calc(0.35 + var(--glow) * 0.65);
    transition: opacity 700ms ease;
    pointer-events: none;
  }
  .line {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 17%;
    text-align: center;
    font-family: var(--font-ui);
    font-size: 9cqi;
    font-weight: 600;
    letter-spacing: 0.03em;
    color: color-mix(in srgb, var(--eye) 85%, white);
    text-shadow: 0 0 3cqi color-mix(in srgb, var(--eye) 55%, transparent);
  }

  /* Overlays: one-shot, transform and opacity only */
  .fx {
    position: absolute;
    inset: -12% -6%;
    pointer-events: none;
  }
  .g {
    position: absolute;
    fill: currentColor;
  }
  .heart {
    width: 13cqi;
    color: #ff7ab8;
    right: calc(4cqi + var(--i) * 11cqi);
    top: 52%;
    filter: drop-shadow(0 0 1.5cqi rgba(255, 122, 184, 0.6));
    animation: rise 1700ms calc(var(--i) * 180ms) cubic-bezier(0.2, 0.7, 0.3, 1) both;
  }
  .star {
    width: 11cqi;
    color: #ffd84a;
    left: calc(2cqi + var(--i) * 28cqi);
    top: calc(4% + var(--row) * 56%);
    filter: drop-shadow(0 0 1.6cqi rgba(255, 216, 74, 0.7));
    animation: twinkle 1300ms calc(var(--i) * 140ms) ease-out both;
  }
  .z {
    right: calc(2cqi + var(--i) * 7cqi);
    top: calc(10% - var(--i) * 6%);
    font: 700 calc(9cqi + var(--i) * 3cqi) / 1 var(--font-ui);
    color: color-mix(in srgb, var(--eye) 85%, white);
    opacity: 0;
    animation: zzz 2400ms calc(var(--i) * 420ms) ease-out both;
  }
  .drop {
    width: 9cqi;
    left: 4cqi;
    top: 8%;
    color: #8fd3ff;
    animation: slide 1500ms ease-in both;
  }
  .tear {
    width: 7cqi;
    left: 26%;
    top: 62%;
    color: #8fd3ff;
    animation: tear 2000ms 300ms ease-in both;
  }
  .mark {
    right: 2cqi;
    top: 0;
    font: 800 20cqi / 1 var(--font-ui);
    color: color-mix(in srgb, var(--eye) 70%, white);
    animation: pop 1400ms cubic-bezier(0.3, 1.6, 0.5, 1) both;
  }
  .mark.ex {
    color: #ffd84a;
  }
  .vein {
    width: 15cqi;
    right: 2cqi;
    top: 2%;
    fill: none;
    stroke: #ff8a4c;
    stroke-width: 2.6;
    stroke-linecap: round;
    animation: throb 900ms ease-in-out 2 both;
  }
  .bit {
    width: 3cqi;
    height: 5cqi;
    left: 50%;
    top: 40%;
    border-radius: 0.7cqi;
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
      transform: translateY(-5cqi) scale(1.05);
    }
    100% {
      transform: translateY(-34cqi) scale(0.8);
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
      transform: translate(0, 5cqi);
      opacity: 0;
    }
    30% {
      opacity: 0.9;
    }
    100% {
      transform: translate(6cqi, -16cqi);
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
      transform: translateY(14cqi);
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
      transform: translateY(20cqi) scale(0.9);
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
      transform: translate(calc(-50% + var(--dx) * 6cqi), calc(34cqi - (var(--dx) * var(--dx)) * 0.18cqi)) rotate(var(--rot)) scale(1);
      opacity: 0;
    }
  }
  @keyframes -global-alef-shake-0 {
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
  @keyframes -global-alef-shake-1 {
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
  @keyframes -global-alef-hop-0 {
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
  @keyframes -global-alef-hop-1 {
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

  /* The speech bubble: rises out of the face with a little spring */
  .bubble {
    position: absolute;
    bottom: calc(100% + 10px);
    left: 50%;
    z-index: 3;
    translate: -50% 0;
    width: max-content;
    max-width: min(280px, 170%);
    padding: 9px 14px;
    border-radius: 18px;
    background: var(--raised);
    color: var(--ink);
    box-shadow:
      0 10px 30px -8px rgba(10, 20, 40, 0.28),
      0 0 0 1px var(--line);
    font-family: var(--font-ui);
    font-size: 14px;
    line-height: 1.35;
    text-align: center;
    /* Long answers stay short here; the whole of it is in the chat. */
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    overflow: hidden;
    pointer-events: auto;
    animation: speak 480ms cubic-bezier(0.3, 1.5, 0.5, 1) both;
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
    box-shadow: 1px 1px 0 var(--line);
  }
  @keyframes speak {
    0% {
      transform: scale(0.5) translateY(10px);
      opacity: 0;
    }
    100% {
      transform: none;
      opacity: 1;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .bubble,
    .g {
      animation: none;
    }
  }
</style>
