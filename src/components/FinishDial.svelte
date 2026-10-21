<script module lang="ts">
  import { MINUTE, minutesOfDay, startOfDayMs } from '../lib/engine/time';
  import type { Block, CategoryId, ISODate } from '../lib/engine/types';

  export interface MiniArc {
    key: string;
    /** Minutes after midnight. */
    start: number;
    end: number;
    category: CategoryId;
    done: boolean;
  }

  /** Stand-in day for an empty plan, so every swatch still shows the category colours. */
  const SAMPLE: MiniArc[] = [
    { key: 'a', start: 450, end: 470, category: 'care', done: true },
    { key: 'b', start: 540, end: 690, category: 'focus', done: true },
    { key: 'c', start: 750, end: 810, category: 'routine', done: false },
    { key: 'd', start: 900, end: 960, category: 'move', done: false },
    { key: 'e', start: 1080, end: 1140, category: 'social', done: false },
    { key: 'f', start: 1260, end: 1320, category: 'rest', done: false },
  ];

  /** A day's own timed blocks as mini-dial arcs; the sample day when there are fewer than three. */
  export function miniArcs(blocks: Block[], date: ISODate): MiniArc[] {
    const s = startOfDayMs(date);
    const e = s + 1440 * MINUTE;
    const arcs = blocks
      .filter((b) => b.kind === 'task' && !b.floating && b.endMs > s && b.startMs < e)
      .map((b) => ({ key: b.key, start: b.startMs < s ? 0 : minutesOfDay(b.startMs), end: Math.min(1440, (b.endMs - s) / MINUTE), category: b.category, done: b.done }));
    return arcs.length >= 3 ? arcs : SAMPLE;
  }
</script>

<script lang="ts">
  // A dial finish as a tiny watch: rim, bezel with the day's inserts (24 h, noon on top, night
  // shaded), the face, ink indices and the signal hand at the current time. Static between minutes.
  import { categoryColor, mix } from '../lib/engine/categories';
  import type { Finish } from '../lib/presets';

  let { finish, arcs, nowMin, wake = 420, sleep = 1380, size = 40 }: { finish: Finish; arcs: MiniArc[]; nowMin: number; wake?: number; sleep?: number; size?: number } = $props();

  const C = 20;
  const R_RIM = 19.6;
  const R_OUT = 18.6;
  const R_IN = 13.6;
  const R_FACE = 13;
  const f = (n: number) => Math.round(n * 100) / 100;
  const deg = (min: number) => ((min - 720) / 1440) * 360;
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
  function arcPath(r: number, a0: number, a1: number) {
    const [x0, y0] = polar(r, a0);
    const [x1, y1] = polar(r, a1);
    return `M${f(x0)} ${f(y0)}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${f(x1)} ${f(y1)}`;
  }

  const night = $derived.by(() => {
    const a0 = deg(sleep);
    let a1 = deg(wake);
    if (a1 <= a0) a1 += 360;
    return sector(a0, a1, R_IN, R_OUT);
  });
  const inserts = $derived(
    arcs.map((a) => {
      const a0 = deg(a.start) + 1.4;
      const a1 = Math.max(deg(a.end) - 1.4, a0 + 3);
      const c = categoryColor(a.category, finish.dark);
      return { key: a.key, d: sector(a0, a1, R_IN, R_OUT), fill: a.done ? mix(c, finish.face, finish.dark ? 0.42 : 0.5) : c, rim: a.done ? arcPath(R_OUT - 0.5, a0, a1) : '' };
    }),
  );
  const hand = $derived([polar(-2.2, deg(nowMin)), polar(R_OUT + 0.4, deg(nowMin))]);
</script>

<svg viewBox="0 0 40 40" width={size} height={size} class="fd" aria-hidden="true">
  <circle cx={C} cy={C} r={R_RIM} fill={finish.rim} />
  <circle cx={C} cy={C} r={R_OUT} fill={finish.bezel} />
  <path d={night} fill={mix(finish.bezel, finish.dark ? '#000000' : finish.ink, finish.dark ? 0.35 : 0.08)} />
  {#each inserts as s (s.key)}<path d={s.d} fill={s.fill} />{/each}
  {#each inserts as s (s.key)}{#if s.rim}<path d={s.rim} stroke={finish.lume} stroke-width="1" fill="none" stroke-linecap="round" />{/if}{/each}
  <circle cx={C} cy={C} r={R_FACE} fill={finish.face} />
  {#each [0, 90, 180, 270] as a (a)}
    {@const p = polar(R_FACE - (a === 0 ? 4 : 3.2), a)}
    {@const q = polar(R_FACE - 1.2, a)}
    <line x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} stroke={finish.ink} stroke-width={a === 0 ? 1.5 : 1.1} stroke-linecap="round" opacity="0.8" />
  {/each}
  <line x1={hand[0][0]} y1={hand[0][1]} x2={hand[1][0]} y2={hand[1][1]} stroke={finish.signal} stroke-width="1.5" stroke-linecap="round" />
  <circle cx={C} cy={C} r="1.6" fill={finish.signal} />
</svg>

<style>
  .fd {
    display: block;
    flex: none;
    overflow: visible;
  }
</style>
