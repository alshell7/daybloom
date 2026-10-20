<script lang="ts">
  // A small, still Alef: one pose of a feeling, drawn in SVG (no timers, no motion), for chat
  // avatars and the feelings gallery.
  import { BEHAVIORS, type BehaviorId, type Eye } from '../../../lib/addons/alef/behaviors';

  let { feeling = 'pleased', eyes = '#5CE1E6', size = 28 }: { feeling?: BehaviorId; eyes?: string; size?: number } = $props();

  const b = $derived(BEHAVIORS[feeling]);
  // The pose that says it best: the first one held longest.
  const pose = $derived(b.poses.reduce((a, p) => (p.hold > a.hold ? p : a), b.poses[0]));
  const id = $props.id();

  function eyePath(e: Eye, cx: number) {
    const w = 46 * e.sx;
    const h = 56 * e.sy;
    const x = cx + e.x - w / 2;
    const y = 54 + e.y - h / 2;
    return { x, y, w, h, rx: w * 0.24, cx: cx + e.x, cy: 54 + e.y };
  }
  const L = $derived(eyePath(pose.l, 64));
  const R = $derived(eyePath(pose.r, 136));
</script>

{#snippet one(g: ReturnType<typeof eyePath>, e: Eye, side: string)}
  <g transform={`rotate(${e.rot} ${g.cx} ${g.cy})`}>
    <clipPath id={`${id}-${side}`}><rect x={g.x} y={g.y} width={g.w} height={g.h} rx={g.rx} /></clipPath>
    <g clip-path={`url(#${id}-${side})`}>
      <rect x={g.x} y={g.y} width={g.w} height={g.h} fill={eyes} />
      {#if e.lid > 0}
        <rect x={g.x - g.w * 0.35} y={g.y - g.h * 1.04 + e.lid * g.h * 1.04} width={g.w * 1.7} height={g.h * 1.04} fill="#04060b" transform={`rotate(${e.slant} ${g.cx} ${g.y + e.lid * g.h * 1.04})`} />
      {/if}
      {#if e.smile > 0}
        <ellipse cx={g.cx} cy={g.y + g.h - e.smile * g.h * 0.912 + g.h * 0.6} rx={g.w * 0.6} ry={g.h * 0.6} fill="#04060b" />
      {/if}
    </g>
  </g>
{/snippet}

<svg class="mini" width={size} height={size * 0.6} viewBox="0 0 200 120" role="img" aria-label={`Alef, ${b.label.toLowerCase()}`}>
  <rect width="200" height="120" rx="30" fill="#04060b" />
  {@render one(L, pose.l, 'l')}
  {@render one(R, pose.r, 'r')}
</svg>

<style>
  .mini {
    display: block;
    flex: none;
    border-radius: 22%;
    box-shadow: 0 0 0 1.5px #1b2230;
  }
</style>
