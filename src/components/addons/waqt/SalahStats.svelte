<script lang="ts">
  // "Your salah": a week or a month at a glance. A ring of how the prayers went (in jamaat,
  // on time, made up late, not marked), each prayer's own bar and streak, the month as rows of
  // pearls, and a few kind lines. Nothing still ahead is counted; nothing scolds.
  import { cubicOut } from 'svelte/easing';
  import { fly } from 'svelte/transition';
  import { lines, summarize, type DayInput, type Kind } from '../../../lib/addons/waqt/analytics';
  import { PRAYER_ICON, PRAYER_NAME } from '../../../lib/addons/waqt/types';
  import { waqt, waqtFile } from '../../../lib/addons/waqt/waqt.svelte';
  import { addDays, isoOf } from '../../../lib/engine/time';
  import Icon from '../../../lib/Icon.svelte';
  import { clock } from '../../../lib/stores/clock.svelte';
  import { view } from '../../../lib/stores/view.svelte';
  import Segmented from '../../Segmented.svelte';

  let span = $state<'7' | '30'>('7');
  const rm = $derived(view.reducedMotion);
  const today = $derived(isoOf(clock.minute));
  const s = $derived(waqtFile.value.settings);

  function period(endDate: string, n: number): DayInput[] {
    return Array.from({ length: n }, (_, i) => addDays(endDate, i - n + 1))
      .map((date) => {
        const d = waqt.day(date);
        return d ? { date, prayers: d.prayers.map((p) => ({ id: p.id, at: p.at, end: p.end })) } : null;
      })
      .filter((x): x is DayInput => !!x);
  }
  const n = $derived(Number(span));
  const sum = $derived((void waqtFile.value.prayed, void waqtFile.value.detail, summarize(waqtFile.value, period(today, n), clock.now)));
  const prev = $derived((void waqtFile.value.prayed, summarize(waqtFile.value, period(addDays(today, -n), n), clock.now)));
  const words = $derived(lines(sum, prev.counted ? prev : null, { jamaat: s.jamaat.on, remindBefore: s.remind.before }));

  // The ring: four arcs in order around a circle of circumference 1 (pathLength).
  const parts = $derived.by(() => {
    const total = Math.max(1, sum.counted);
    const seg = [
      { key: 'jamaat', n: sum.jamaat, label: 'In jamaat' },
      { key: 'ontime', n: sum.ontime, label: 'On time' },
      { key: 'late', n: sum.late, label: 'Made up late' },
      { key: 'missed', n: sum.missed, label: 'Not marked' },
    ];
    let at = 0;
    return seg.map((x) => {
      const len = x.n / total;
      const out = { ...x, len, at };
      at += len;
      return out;
    });
  });
  const pct = $derived(sum.counted ? Math.round((sum.prayed / sum.counted) * 100) : 0);
  const color = (k: Kind) => `var(--k-${k})`;
</script>

<section class="ss" aria-label="Your salah">
  <div class="head">
    <h3>Your salah</h3>
    <Segmented label="Period" value={span} onchange={(v) => (span = v)} options={[{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }]} />
  </div>

  {#key span}
    <div class="hero" in:fly={{ y: 6, duration: rm ? 0 : 320, easing: cubicOut }}>
      <svg viewBox="0 0 120 120" class="ring" role="img" aria-label={`${sum.prayed} of ${sum.counted} prayers prayed`}>
        <circle cx="60" cy="60" r="48" class="track" />
        {#each parts.filter((p) => p.key !== 'missed' && p.len > 0) as p, i (p.key)}
          <circle
            cx="60"
            cy="60"
            r="48"
            pathLength="1"
            class="seg"
            stroke={color(p.key as Kind)}
            stroke-dasharray={`${Math.max(0, p.len - 0.006)} 1`}
            stroke-dashoffset={-p.at}
            style:--d={`${i * 120}ms`}
          />
        {/each}
        <text x="60" y="58" class="big tnum">{sum.prayed}</text>
        <text x="60" y="76" class="small tnum">of {sum.counted}</text>
      </svg>
      <ul class="legend">
        {#each parts as p (p.key)}
          {#if p.key !== 'jamaat' || s.jamaat.on || p.n}
            <li><i style:background={color(p.key as Kind)}></i><span>{p.label}</span><b class="tnum">{p.n}</b></li>
          {/if}
        {/each}
        {#if sum.qasr}<li><i class="q"></i><span>Qasr</span><b class="tnum">{sum.qasr}</b></li>{/if}
        <li class="pct tnum">{pct}% prayed{sum.fullDays ? ` · ${sum.fullDays} full ${sum.fullDays === 1 ? 'day' : 'days'}` : ''}</li>
      </ul>
    </div>

    <ul class="rows">
      {#each sum.byPrayer as p, i (p.id)}
        {@const t = Math.max(1, p.counted)}
        <li in:fly={{ x: -8, duration: rm ? 0 : 300, delay: rm ? 0 : 60 + i * 50, easing: cubicOut }}>
          <span class="ic"><Icon name={PRAYER_ICON[p.id]} size={14} /></span>
          <span class="nm">{PRAYER_NAME[p.id]}</span>
          <span class="bar" aria-hidden="true">
            <i style:width={`${(p.jamaat / t) * 100}%`} style:background={color('jamaat')}></i><i style:width={`${(p.ontime / t) * 100}%`} style:background={color('ontime')}></i><i style:width={`${(p.late / t) * 100}%`} style:background={color('late')}></i>
          </span>
          <span class="rt tnum">{p.counted ? `${p.prayed}/${p.counted}` : '–'}</span>
          <span class="st tnum" class:on={p.streak >= 2} title={p.streak >= 2 ? `On time ${p.streak} days in a row` : ''}>{#if p.streak >= 2}<Icon name="flame" size={11} />{p.streak}{/if}</span>
        </li>
      {/each}
    </ul>

    {#if span === '30'}
      <div class="month" role="img" aria-label="The last 30 days of prayers">
        {#each sum.grid as d (d.date)}
          <div class="day" class:today={d.date === today} title={new Date(`${d.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}>
            {#each Object.entries(d.kinds) as [id, k] (id)}
              <i class={k} class:qasr={d.qasr[id as keyof typeof d.qasr]}></i>
            {/each}
          </div>
        {/each}
      </div>
    {/if}

    {#if words.length}
      <ul class="words">
        {#each words as w, i (w)}
          <li in:fly={{ y: 4, duration: rm ? 0 : 280, delay: rm ? 0 : 200 + i * 70 }}><Icon name="sparkle" size={12} /> {w}</li>
        {/each}
      </ul>
    {/if}
  {/key}
</section>

<style>
  .ss {
    --k-jamaat: var(--green);
    --k-ontime: color-mix(in srgb, var(--green) 55%, var(--surface));
    --k-late: color-mix(in srgb, var(--warm) 75%, var(--surface));
    --k-missed: var(--line-strong);
    --k-open: transparent;
    --k-ahead: transparent;
    display: grid;
    gap: var(--s-3);
    padding: var(--s-4) 0;
    border-top: 1px solid var(--line);
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-3);
  }
  h3 {
    margin: 0;
    font-family: var(--font-ui);
    font-size: var(--t-md);
    font-weight: 500;
  }
  .hero {
    display: grid;
    grid-template-columns: 124px 1fr;
    align-items: center;
    gap: var(--s-4);
  }
  .ring {
    width: 124px;
    height: 124px;
    transform: rotate(-90deg);
  }
  .ring text {
    transform: rotate(90deg);
    transform-origin: 60px 60px;
    text-anchor: middle;
    font-family: var(--font-ui);
    fill: var(--ink);
  }
  .ring .big {
    font-size: 26px;
    font-weight: 500;
  }
  .ring .small {
    font-size: 11px;
    fill: var(--ink-3);
  }
  .track {
    fill: none;
    stroke: var(--sunken);
    stroke-width: 12;
  }
  .seg {
    fill: none;
    stroke-width: 12;
    stroke-linecap: butt;
    animation: draw 0.9s var(--ease-out) var(--d) both;
  }
  @keyframes draw {
    from {
      stroke-dasharray: 0 1;
    }
  }
  .legend {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 5px;
    font-size: var(--t-sm);
  }
  .legend li {
    display: grid;
    grid-template-columns: 10px 1fr auto;
    align-items: center;
    gap: 8px;
  }
  .legend i {
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }
  .legend i.q {
    border-radius: 3px;
    background: transparent;
    box-shadow: inset 0 0 0 2px var(--green);
  }
  .legend span {
    color: var(--ink-2);
  }
  .legend .pct {
    display: block;
    margin-top: 4px;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .rows {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
  }
  .rows li {
    display: grid;
    grid-template-columns: 22px 64px 1fr 44px 34px;
    align-items: center;
    gap: 8px;
    font-size: var(--t-sm);
  }
  .rows .ic {
    display: grid;
    place-items: center;
    color: var(--ink-3);
  }
  .bar {
    display: flex;
    height: 8px;
    border-radius: 4px;
    background: var(--sunken);
    overflow: hidden;
  }
  .bar i {
    height: 100%;
    transform-origin: left;
    animation: grow 0.7s var(--ease-out) both;
  }
  @keyframes grow {
    from {
      transform: scaleX(0);
    }
  }
  .rt {
    text-align: right;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .st {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .st.on {
    color: var(--green);
  }
  .month {
    display: grid;
    grid-template-columns: repeat(30, 1fr);
    gap: 3px;
    padding: 10px;
    border-radius: var(--r-md);
    background: var(--surface);
  }
  .day {
    display: grid;
    justify-items: center;
    gap: 3px;
  }
  .day i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--k-missed);
  }
  .day i.jamaat {
    background: var(--k-jamaat);
  }
  .day i.ontime {
    background: var(--k-ontime);
  }
  .day i.late {
    background: var(--k-late);
  }
  .day i.open,
  .day i.ahead {
    background: transparent;
    box-shadow: inset 0 0 0 1px var(--line-strong);
  }
  .day i.qasr {
    border-radius: 2px;
  }
  .day.today i {
    outline: 1px solid color-mix(in srgb, var(--ink) 25%, transparent);
    outline-offset: 1px;
  }
  .words {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
  }
  .words li {
    display: flex;
    gap: 8px;
    align-items: baseline;
    font-size: var(--t-sm);
    color: var(--ink-2);
    line-height: 1.45;
  }
  .words li :global(svg) {
    flex: none;
    color: var(--green);
    transform: translateY(1px);
  }
  :global([data-motion='calm']) .ss .seg,
  :global([data-motion='calm']) .ss .bar i {
    animation: none;
  }
</style>
