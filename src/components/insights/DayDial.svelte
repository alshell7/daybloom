<script lang="ts">
  // One day as a tiny 24-hour dial (noon on top, like the 24 h face): finished time
  // drawn as lume-rimmed inserts in category colours, free time left bare.
  import { categoryColor, mix } from '../../lib/engine/categories';
  import type { DayStat } from '../../lib/insights';
  import type { Finish } from '../../lib/presets';

  let {
    day,
    finish,
    wake,
    sleep,
    nowMin = null,
    small = false,
  }: {
    day: Pick<DayStat, 'arcs' | 'done' | 'backlog'>;
    finish: Finish;
    wake: number;
    sleep: number;
    /** Minutes into today, when this dial is today (draws the now-hand). */
    nowMin?: number | null;
    /** Drawn at icon size (the History's day headers): a bolder count. */
    small?: boolean;
  } = $props();

  const C = 50;
  const R_OUT = 47;
  const R_IN = 30;
  const R_FACE = 28.5;
  const GAP = 1.1; // degrees trimmed off each end, so neighbours read as separate inserts

  const deg = (min: number) => ((min - 720) / 1440) * 360;
  const f = (n: number) => Math.round(n * 100) / 100;

  function polar(r: number, a: number): [number, number] {
    const t = ((a - 90) * Math.PI) / 180;
    return [C + r * Math.cos(t), C + r * Math.sin(t)];
  }

  function sector(a0: number, a1: number, rIn: number, rOut: number) {
    const sweep = Math.min(a1 - a0, 359.9);
    if (sweep <= 0) return '';
    const large = sweep > 180 ? 1 : 0;
    const [x0, y0] = polar(rOut, a0);
    const [x1, y1] = polar(rOut, a0 + sweep);
    const [x2, y2] = polar(rIn, a0 + sweep);
    const [x3, y3] = polar(rIn, a0);
    return `M${f(x0)} ${f(y0)}A${rOut} ${rOut} 0 ${large} 1 ${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}A${rIn} ${rIn} 0 ${large} 0 ${f(x3)} ${f(y3)}Z`;
  }

  function arc(r: number, a0: number, a1: number) {
    const sweep = Math.min(a1 - a0, 359.9);
    if (sweep <= 0) return '';
    const [x0, y0] = polar(r, a0);
    const [x1, y1] = polar(r, a0 + sweep);
    return `M${f(x0)} ${f(y0)}A${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${f(x1)} ${f(y1)}`;
  }

  const night = $derived.by(() => {
    const a0 = deg(sleep);
    let a1 = deg(wake);
    if (a1 <= a0) a1 += 360;
    return sector(a0, a1, R_IN, R_OUT);
  });

  const inserts = $derived(
    day.arcs.map((a) => {
      const a0 = deg(a.start) + GAP;
      const a1 = Math.max(deg(a.end) - GAP, a0 + 2.4);
      const color = categoryColor(a.category, finish.dark);
      return {
        key: a.key,
        d: sector(a0, a1, R_IN, R_OUT - 1.6),
        rim: arc(R_OUT - 0.4, a0, a1),
        fill: mix(color, finish.face, finish.dark ? 0.16 : 0.2),
      };
    }),
  );

  const count = $derived(day.done + day.backlog);
  const hand = $derived(nowMin == null ? null : [polar(R_FACE - 3, deg(nowMin)), polar(R_OUT + 1.5, deg(nowMin))]);
</script>

<svg viewBox="0 0 100 100" class="dial" class:glow={finish.dark} class:small style:--fl={finish.lume} aria-hidden="true">
  <circle cx={C} cy={C} r={R_OUT + 1.5} fill={finish.bezel} stroke={finish.track} stroke-opacity={finish.dark ? 0.45 : 0.25} stroke-width="1" />
  <path d={night} fill={mix(finish.bezel, finish.dark ? '#000000' : finish.ink, finish.dark ? 0.28 : 0.05)} />
  <circle cx={C} cy={C} r={R_FACE} fill={finish.face} stroke={finish.track} stroke-opacity={finish.dark ? 0.35 : 0.18} stroke-width="0.8" />
  <!-- quarter marks: noon, six, midnight, six -->
  {#each [0, 90, 180, 270] as a (a)}
    {@const [p, q] = [polar(R_FACE - (a === 0 ? 6 : 4.5), a), polar(R_FACE - 1.5, a)]}
    <line x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} stroke={finish.track} stroke-width="1.6" stroke-linecap="round" />
  {/each}

  {#each inserts as s (s.key)}
    <path d={s.d} fill={s.fill} />
  {/each}
  <g class="lume">
    {#each inserts as s (s.key)}
      <path d={s.rim} stroke={finish.lume} stroke-width="2.2" stroke-linecap="round" fill="none" />
    {/each}
  </g>

  {#if count > 0}
    <text x={C} y={C} class="count" fill={finish.ink} text-anchor="middle" dominant-baseline="central">{count}</text>
  {:else}
    <circle cx={C} cy={C} r="1.8" fill={finish.track} opacity="0.6" />
  {/if}

  {#if hand}
    <line x1={hand[0][0]} y1={hand[0][1]} x2={hand[1][0]} y2={hand[1][1]} stroke={finish.signal} stroke-width="1.8" stroke-linecap="round" />
  {/if}
</svg>

<style>
  .dial {
    display: block;
    width: 100%;
    height: auto;
    overflow: visible;
  }
  .glow .lume {
    filter: drop-shadow(0 0 1.5px var(--fl));
  }
  .count {
    font-family: var(--font-ui);
    font-size: 20px;
    font-weight: 300;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }
  .small .count {
    font-size: 31px;
    font-weight: 500;
  }
</style>
