<script lang="ts">
  // A small, still Alef: the pose that says a feeling best, drawn once with the same eyes as
  // the live face (no timers, no motion), for chat avatars and the feelings gallery.
  import { BEHAVIORS, type BehaviorId } from '../../../lib/addons/alef/behaviors';
  import { drawEyes, eyeOf } from '../../../lib/addons/alef/eyes';
  import type { ScreenPalette } from '../../../lib/addons/alef/palette';

  let { feeling = 'pleased', screen, size = 28 }: { feeling?: BehaviorId; screen: ScreenPalette; size?: number } = $props();

  const b = $derived(BEHAVIORS[feeling]);
  // The pose held longest is the one that reads best still.
  const pose = $derived(b.poses.reduce((a, p) => (p.hold > a.hold ? p : a), b.poses[0]));

  let canvas = $state<HTMLCanvasElement>();
  const scratch = typeof document !== 'undefined' ? document.createElement('canvas') : null;

  $effect(() => {
    const c = canvas;
    const p = pose;
    const pal = screen;
    if (!c || !scratch) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(size * dpr);
    c.height = Math.round(size * dpr * 0.62);
    const ctx = c.getContext('2d');
    if (!ctx) return;
    // The eyes fill about three quarters of the little screen.
    drawEyes(ctx, [eyeOf(p.l, -1), eyeOf(p.r, 1)], { scale: (c.width / 200) * 1.08, color: pal.eye, glow: 0.55 * pal.glow, scratch, shadow: pal.dark ? null : 'rgba(20, 28, 42, 0.2)' });
  });
</script>

<span class="mini" class:light={!screen.dark} style:width={`${size}px`} style:height={`${size * 0.62}px`} style:--well={screen.well} style:--well-edge={screen.wellEdge} style:--bezel={screen.bezel} style:--scan={screen.scan} role="img" aria-label={`Alef, ${b.label.toLowerCase()}`}>
  <canvas bind:this={canvas}></canvas>
</span>

<style>
  .mini {
    position: relative;
    display: block;
    flex: none;
    border-radius: 999px;
    background: radial-gradient(80% 70% at 50% 40%, var(--well), var(--well-edge));
    box-shadow:
      0 0 0 1.5px var(--bezel),
      inset 0 2px 4px rgba(0, 0, 0, 0.25);
    overflow: hidden;
  }
  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  .mini::after {
    content: '';
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(to bottom, rgba(0, 0, 0, var(--scan)) 0 1px, transparent 1px 3px);
  }
</style>
