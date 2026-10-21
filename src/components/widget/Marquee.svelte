<script lang="ts">
  // A title on the widget's dial, kept whole. Short words sit still and centred. Words too long
  // for their place glide along their line: a beat at the start, an unhurried slide to the end,
  // a rest, back, a longer rest (timing in wing.ts). Both ends fade out along the dial's round
  // centre (a radial mask around the dial's middle), so the words pass under the curve instead
  // of being cut. After a few minutes of passes it rests at its start until the pointer comes
  // over the dial. Each leg is one transform animation (WAAPI) on an HTML layer: between legs,
  // while the words fit, while they're paused, while the window is hidden and under Calm motion,
  // nothing runs. With
  // `wrap` (Calm) long words take up to two lines; with `slide` off they end with "…".
  import { chord, lineReach, marqueeLeg, marqueeRest } from './wing';

  let {
    text,
    slide = true,
    paused = false,
    wrap = false,
    round = 0.29,
    fade = 12,
  }: {
    text: string;
    /** Glide when too long (off: end with "…"). */
    slide?: boolean;
    /** Rest at the start for now (the words are showing in full elsewhere). */
    paused?: boolean;
    /** Instead of gliding, set long words on up to two lines. */
    wrap?: boolean;
    /** The round the line lives in: a circle around the dial's middle, as a share of the dial's width. */
    round?: number;
    /** The length of the fade at each end (px). */
    fade?: number;
  } = $props();

  let box = $state<HTMLSpanElement>();
  let run = $state<HTMLSpanElement>();
  let probe = $state<HTMLSpanElement>();
  type Fit = { mode: 'still' | 'slide' | 'clip' | 'wrap'; width: number; mask?: string; pad?: number; travel?: number };
  let fit = $state<Fit | null>(null);
  /** How much taller than wide the fade's oval is: a gentle curve that still reads as round. */
  const OVAL = 1.6;

  /** The dial this line sits in, and the line's top and bottom from the dial's middle (transforms aside: the title flies in). */
  function place(): { W: number; top: number; bottom: number } | null {
    const dial = box?.closest<HTMLElement>('.dial-wrap');
    if (!box || !dial) return null;
    let y = 0;
    let el: HTMLElement | null = box;
    while (el && el !== dial) {
      y += el.offsetTop;
      el = el.offsetParent as HTMLElement | null;
    }
    if (el !== dial) y = box.getBoundingClientRect().top - dial.getBoundingClientRect().top;
    const mid = dial.offsetHeight / 2;
    return { W: dial.offsetWidth, top: y - mid, bottom: y + box.offsetHeight - mid };
  }

  function measure() {
    const p = place();
    if (!p || !probe) return;
    const textW = probe.offsetWidth;
    // One line, whatever the box does (two lines in Calm).
    p.bottom = p.top + probe.offsetHeight;
    const r = round * p.W;
    // Never wider than the readout's own square in the middle of the dial.
    const most = p.W * 0.48;
    const { near, far } = lineReach(p.top, p.bottom, 0);
    const room = Math.min(most, chord(r - 2, far));
    let next: Fit;
    if (textW <= room) next = { mode: 'still', width: Math.ceil(textW) };
    // Two lines reach further from the middle: as wide as the round is halfway down the second.
    else if (wrap) next = { mode: 'wrap', width: Math.floor(Math.min(most, chord(r - 2, far + (p.bottom - p.top) / 2)) || room) };
    else if (!slide || near >= r - fade) next = { mode: 'clip', width: Math.floor(room) };
    else {
      // The fade: an upright oval around the dial's middle, through the box's ends at the top of
      // the letters, so the words fade earlier at their foot, as if passing under the round.
      const width = Math.floor(Math.min(most, chord(r, near)));
      const x = width / 2;
      const rx = Math.sqrt(x * x + (near / OVAL) ** 2);
      const mid = Math.abs((p.top + p.bottom) / 2);
      const clear = Math.max(0, Math.sqrt(rx * rx - (mid / OVAL) ** 2) - fade);
      const pad = Math.round(Math.max(0, x - clear));
      const travel = Math.ceil(textW - 2 * clear);
      const stop = Math.max(0, 100 * (1 - fade / rx));
      const mask = `radial-gradient(${rx.toFixed(1)}px ${(rx * OVAL).toFixed(1)}px at ${x.toFixed(1)}px ${(-p.top).toFixed(1)}px, #000 ${stop.toFixed(1)}%, transparent 100%)`;
      next = travel > 1 ? { mode: 'slide', width, mask, pad, travel } : { mode: 'still', width: Math.ceil(textW) };
    }
    if (JSON.stringify(next) !== JSON.stringify(fit)) fit = next;
  }

  // Measure when the words, the dial's size or the readout around this line change.
  $effect(() => {
    text;
    slide;
    wrap;
    round;
    fade;
    if (!box) return;
    let raf = requestAnimationFrame(measure);
    const again = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    const ro = new ResizeObserver(again);
    const dial = box.closest('.dial-wrap');
    const readout = box.parentElement?.closest('.readout');
    if (dial) ro.observe(dial);
    if (readout) ro.observe(readout);
    void document.fonts?.ready.then(again);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  });

  // The glide: one leg at a time, and nothing between legs.
  let hidden = $state(typeof document !== 'undefined' && document.hidden);
  $effect(() => {
    const f = fit;
    if (!run || !f || f.mode !== 'slide' || hidden || paused) return;
    const el = run;
    const leg = marqueeLeg(f.travel ?? 0);
    if (!leg) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let anim: Animation | null = null;
    let pass = 0;
    let at = 0;
    const go = (to: number, ms: number, then: () => void) => {
      anim = el.animate([{ transform: `translateX(${at}px)` }, { transform: `translateX(${to}px)` }], { duration: ms, easing: 'cubic-bezier(0.45, 0, 0.3, 1)', fill: 'forwards' });
      anim.onfinish = () => {
        at = to;
        el.style.transform = to ? `translateX(${to}px)` : '';
        anim?.cancel();
        anim = null;
        then();
      };
    };
    let resting = false;
    const loop = () => {
      const rest = marqueeRest(pass, 'start');
      // Enough passes: it rests at its start until the pointer comes over the dial.
      if (rest == null) return void (resting = true);
      timer = setTimeout(
        () =>
          go(-leg.travel, leg.there, () => {
            timer = setTimeout(() => go(0, leg.back, () => (pass++, loop())), marqueeRest(pass, 'end') ?? 0);
          }),
        rest,
      );
    };
    const wake = () => {
      if (!resting) return;
      resting = false;
      pass = 0;
      loop();
    };
    const dial = el.closest('.dial-wrap');
    dial?.addEventListener('pointerenter', wake);
    loop();
    return () => {
      dial?.removeEventListener('pointerenter', wake);
      if (timer) clearTimeout(timer);
      // Stopped mid-way (paused, or the words changed): glide back to the start, don't jump.
      const t = el.isConnected ? getComputedStyle(el).transform : 'none';
      const x = t && t !== 'none' ? new DOMMatrixReadOnly(t).m41 : 0;
      anim?.cancel();
      el.style.transform = '';
      if (Math.abs(x) > 1) el.animate([{ transform: `translateX(${x}px)` }, { transform: 'none' }], { duration: 480, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
    };
  });
</script>

<svelte:document onvisibilitychange={() => (hidden = document.hidden)} />

<span
  class="mq"
  class:measuring={!fit}
  data-mode={fit?.mode}
  bind:this={box}
  style:width={fit ? `${fit.width}px` : undefined}
  style:-webkit-mask-image={fit?.mask}
  style:mask-image={fit?.mask}
>
  <span class="run" bind:this={run} style:padding-left={fit?.pad ? `${fit.pad}px` : undefined}>{text}</span>
  <span class="probe" bind:this={probe} aria-hidden="true">{text}</span>
</span>

<style>
  .mq {
    position: relative;
    display: block;
    max-width: 100%;
    overflow: hidden;
    white-space: nowrap;
    line-height: 1.25;
  }
  /* Until it's measured (one frame), it waits unseen. */
  .mq.measuring {
    visibility: hidden;
  }
  /* The words at their natural width, for measuring. */
  .probe {
    position: absolute;
    white-space: nowrap;
    left: 0;
    top: 0;
    visibility: hidden;
    pointer-events: none;
  }
  .run {
    display: inline-block;
  }
  [data-mode='still'] {
    text-align: center;
  }
  [data-mode='slide'] {
    max-width: none;
  }
  [data-mode='clip'] .run {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    text-align: center;
  }
  [data-mode='wrap'] {
    white-space: normal;
    text-align: center;
  }
  [data-mode='wrap'] .run {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    text-wrap: balance;
  }
</style>
