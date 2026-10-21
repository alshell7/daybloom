<script lang="ts">
  // The wing: a translucent panel beside the widget's dial for the words that don't fit inside
  // it. Its inner edge follows the dial's case at a small gap (wing.ts draws the outline); its
  // glass is the dial's own colours, most opaque next to the dial and more see-through outward;
  // and the words wrap along the curve (an invisible float shaped like the dial, through
  // `shape-outside`) once the wing is tall enough for its corners to reach well around the dial,
  // so those lines reach back around it too; shorter words sit in a straight column. It opens
  // from the dial's side with a small spring and grows or shrinks with its words; words too long
  // for the tallest wing scroll. The words keep one place relative to the dial's middle whatever
  // the wing's height, so nothing reflows while the outline springs.
  import { tick, untrack, type Snippet } from 'svelte';
  import { Spring } from 'svelte/motion';
  import Icon from '../../lib/Icon.svelte';
  import { clamp, GAP, HEIGHT_MIN, wingShape, type Circle, type Side, type WingPalette } from './wing';

  let {
    circle,
    side,
    width,
    maxH,
    palette,
    reduced = false,
    contentKey,
    curve = true,
    label,
    onclose,
    onhold,
    children,
  }: {
    /** The dial's case, in this page's coordinates. */
    circle: Circle;
    side: Side;
    /** From the dial's side outward. */
    width: number;
    /** The tallest it may grow. */
    maxH: number;
    palette: WingPalette;
    reduced?: boolean;
    /** Changes when the words are new: the wing measures them again. */
    contentKey: string;
    /** Tall words may wrap along the dial's curve (else always a straight column). */
    curve?: boolean;
    label: string;
    onclose: () => void;
    /** The pointer rests on the wing (true) or has left it (false). */
    onhold?: (on: boolean) => void;
    children: Snippet;
  } = $props();

  const PAD_X = 16;
  const PAD_Y = 12;
  /** The slimmest top and bottom margin, before the words scroll instead. */
  const PAD_TIGHT = 7;
  /** Words keep this far from the inner edge. */
  const TEXT_GAP = 9;

  let root = $state<HTMLDivElement>();
  let txt = $state<HTMLDivElement>();
  /** The words' height, measured where they sit. */
  let textH = $state(0);
  /**
   * How the words sit: a plain column past the curve; wrapped along the curve (`hug`, for a tall
   * wing whose corners reach well around the dial); or a scrolling column past the tallest wing.
   */
  let mode = $state<'column' | 'hug' | 'scroll'>('column');
  const scroll = $derived(mode === 'scroll');
  let ready = $state(false);

  const want = $derived(scroll ? maxH : clamp(textH + 2 * PAD_Y, HEIGHT_MIN, maxH));
  // The glass springs to its height and width (a few dots, then a reply that unfurls outward).
  const spring = { stiffness: 0.16, damping: 0.74 };
  const h = new Spring(HEIGHT_MIN, spring);
  const ws = new Spring(untrack(() => width), spring);
  $effect(() => {
    const t = want;
    const tw = width;
    if (!ready) return;
    const instant = reduced || !shown;
    void h.set(t, { instant });
    void ws.set(tw, { instant });
  });
  const height = $derived(ready ? h.current : want);
  /** The glass, as it springs. */
  const shape = $derived(wingShape(circle, side, ready ? ws.current : width, height));
  /** Where the words go: the wing at its full width, so they never reflow while it springs. */
  const lay = $derived(wingShape(circle, side, width, height));
  const w = $derived(shape.box.width);
  /** The inner edge's middle, in the glass's and the words' box coordinates. */
  const apex = $derived(side === 'right' ? w - shape.width : shape.width);
  const lapex = $derived(side === 'right' ? lay.box.width - width : width);
  const shift = $derived(lay.box.left - shape.box.left);
  const flowTop = $derived(scroll ? PAD_TIGHT : (shape.height - textH) / 2);
  // Along the curve the words start at the corners; otherwise in a column just past the curve.
  const flowAt = $derived(mode !== 'hug' ? (side === 'right' ? lapex + TEXT_GAP : PAD_X) : side === 'right' ? 0 : PAD_X);
  const flowLeft = $derived(flowAt + shift);
  const flowW = $derived(mode !== 'hug' ? (side === 'right' ? lay.box.width - lapex - TEXT_GAP - PAD_X : lapex - TEXT_GAP - PAD_X) : lay.box.width - PAD_X);
  // The float that the words wrap around: the dial, a little wider.
  const hugW = $derived(side === 'right' ? lapex + TEXT_GAP + 2 : lay.box.width - lapex + TEXT_GAP + 2);
  const hug = $derived.by(() => {
    const fx = side === 'right' ? lay.centre.x : lay.centre.x - flowAt - (flowW - hugW);
    return `circle(${(lay.ri + TEXT_GAP).toFixed(1)}px at ${fx.toFixed(1)}px ${(lay.centre.y - flowTop).toFixed(1)}px)`;
  });

  /** How far the curve falls back over a block of words this tall (px): the corners' reach. */
  const reachBack = (th: number) => {
    const r = circle.r + GAP + TEXT_GAP;
    return th / 2 >= r ? r : r - Math.sqrt(r * r - (th / 2) ** 2);
  };

  // Measure the words where they sit (along the curve, their lines depend on where it is, so a
  // few rounds until the height holds).
  let settling = 0;
  async function measure(run: number) {
    await tick();
    for (let i = 0; i < 6 && run === settling && txt; i++) {
      const m = txt.offsetHeight;
      if (Math.abs(m - textH) < 0.5) break;
      textH = m;
      await tick();
    }
  }
  async function settle() {
    const run = ++settling;
    mode = 'column';
    await measure(run);
    if (run !== settling || !txt) return;
    // Tall words: along the curve, where the corners reach well around the dial (and give room).
    if (curve && (reachBack(textH) >= 22 || textH + 2 * PAD_Y > maxH + 0.5)) {
      mode = 'hug';
      await measure(run);
      if (run !== settling || !txt) return;
    }
    // Only words that don't fit even with slim margins scroll.
    if (textH + 2 * PAD_TIGHT > maxH + 0.5) {
      mode = 'scroll';
      await measure(run);
    }
    if (run === settling) ready = true;
  }
  $effect(() => {
    contentKey;
    width;
    maxH;
    circle.r;
    void settle();
  });

  // Opening: out from the dial's side, a small spring; a content change cross-fades.
  let shown = $state(false);
  $effect(() => {
    if (!ready || shown || !root) return;
    shown = true;
    if (reduced) return;
    root.animate(
      [
        { opacity: 0, transform: 'scale(0.84, 0.92)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 520, easing: 'cubic-bezier(0.3, 1.45, 0.55, 1)' },
    );
  });
  let lastKey = '';
  $effect(() => {
    const k = contentKey;
    if (!shown || !txt || reduced) {
      lastKey = k;
      return;
    }
    if (k === lastKey) return;
    lastKey = k;
    txt.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' });
  });

  function shut(_node: Element) {
    return reduced ? { duration: 0 } : { duration: 190, css: (t: number) => `opacity: ${t}; transform: scale(${0.9 + 0.1 * t}, ${0.96 + 0.04 * t})` };
  }

  const gid = `wing-glass-${Math.random().toString(36).slice(2, 8)}`;
  let held = false;
  function hold(on: boolean) {
    if (on === held) return;
    held = on;
    onhold?.(on);
  }
</script>

<div
  bind:this={root}
  class="wing"
  class:left={side === 'left'}
  class:dark={palette.dark}
  class:scroll
  role="group"
  aria-label={label}
  style:left={`${shape.box.left}px`}
  style:top={`${shape.box.top}px`}
  style:width={`${w}px`}
  style:height={`${shape.height}px`}
  style:visibility={ready ? 'visible' : 'hidden'}
  style:transform-origin={`${apex}px 50%`}
  style:--ink={palette.ink}
  style:--fill={palette.fill}
  style:--accent={palette.accent}
  onpointerover={() => hold(true)}
  onpointerout={(e) => {
    if (!root?.contains(e.relatedTarget as Node | null)) hold(false);
  }}
  out:shut
>
  <svg class="glass" width={w} height={shape.height} viewBox={`0 0 ${w} ${shape.height}`} aria-hidden="true">
    <defs>
      <linearGradient id={gid} x1="0" x2="1" y1="0" y2="0">
        <stop offset="0" stop-color={palette.fill} stop-opacity={palette.near} />
        <stop offset="1" stop-color={palette.fill} stop-opacity={palette.far} />
      </linearGradient>
    </defs>
    <g transform={side === 'left' ? `matrix(-1 0 0 1 ${w} 0)` : undefined}>
      <path class="pane" d={shape.path} fill={`url(#${gid})`} />
    </g>
  </svg>

  <div
    class="flow"
    style:left={`${flowLeft}px`}
    style:top={`${flowTop}px`}
    style:width={`${flowW}px`}
    style:height={scroll ? `${shape.height - 2 * PAD_TIGHT}px` : undefined}
  >
    {#if mode === 'hug'}
      <div class="hug" style:float={side === 'right' ? 'left' : 'right'} style:width={`${hugW}px`} style:height={`${maxH}px`} style:shape-outside={hug}></div>
    {/if}
    <div class="txt" bind:this={txt}>{@render children()}</div>
  </div>

  <button class="close" onclick={onclose} aria-label="Close" title="Close (Esc)"><Icon name="x" size={11} stroke={2.6} /></button>
</div>

<style>
  .wing {
    position: absolute;
    z-index: 4;
    color: var(--ink);
    font-family: var(--font-ui);
    pointer-events: none;
    cursor: default;
  }
  .glass {
    position: absolute;
    inset: 0;
    overflow: visible;
    filter: drop-shadow(0 1px 1.5px rgb(0 0 0 / 0.16)) drop-shadow(0 8px 16px rgb(0 0 0 / 0.22));
  }
  .pane {
    pointer-events: auto;
    stroke: color-mix(in srgb, var(--ink) 13%, transparent);
    stroke-width: 1;
  }
  .dark .pane {
    stroke: color-mix(in srgb, var(--ink) 10%, transparent);
  }
  .flow {
    position: absolute;
    pointer-events: none;
  }
  .scroll .flow {
    overflow-y: auto;
    overscroll-behavior: contain;
    pointer-events: auto;
    scrollbar-width: none;
    -webkit-mask-image: linear-gradient(#000 calc(100% - 16px), transparent);
    mask-image: linear-gradient(#000 calc(100% - 16px), transparent);
  }
  .scroll .flow::-webkit-scrollbar {
    display: none;
  }
  .hug {
    pointer-events: none;
  }
  .txt {
    font-size: 12.5px;
    line-height: 1.42;
    overflow-wrap: break-word;
  }
  .txt :global(p) {
    margin: 0;
  }
  .txt :global(span),
  .txt :global(button),
  .txt :global(strong) {
    pointer-events: auto;
  }
  /* A small badge on the outer top corner, shown while the pointer is on the wing. */
  .close {
    position: absolute;
    top: -6px;
    right: -6px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    color: color-mix(in srgb, var(--ink) 70%, var(--fill));
    background: var(--fill);
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--ink) 16%, transparent),
      0 2px 6px rgb(0 0 0 / 0.22);
    opacity: 0;
    transform: scale(0.8);
    pointer-events: auto;
    transition:
      opacity var(--dur-2) var(--ease-out),
      transform var(--dur-2) var(--ease-settle);
  }
  .left .close {
    right: auto;
    left: -6px;
  }
  .wing:hover .close,
  .close:focus-visible {
    opacity: 1;
    transform: none;
  }
  .close:hover {
    color: var(--ink);
  }
  .close:active {
    transform: scale(0.9);
  }
</style>
