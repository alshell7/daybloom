<script lang="ts">
  // "Your salah": a week or a month, drawn. What's going well comes first, in one sentence;
  // then the period as one stacked meter with its key, each day (stacks for a week, a heatmap
  // for a month), a ring per prayer with its run of on-time days, the on-time share week by
  // week, when you mark each prayer against its adhan, a few kind notes, and every number in a
  // table. Nothing still ahead is counted, nor the days before you started; nothing scolds.
  import { cubicOut } from 'svelte/easing';
  import { fly } from 'svelte/transition';
  import { minutesInWords, notes, summarize, timing, trend, type DayInput } from '../../../lib/addons/waqt/analytics';
  import { PRAYER_NAME } from '../../../lib/addons/waqt/types';
  import { waqt, waqtFile } from '../../../lib/addons/waqt/waqt.svelte';
  import { addDays, isoOf } from '../../../lib/engine/time';
  import Icon from '../../../lib/Icon.svelte';
  import { clock } from '../../../lib/stores/clock.svelte';
  import { view } from '../../../lib/stores/view.svelte';
  import Segmented from '../../Segmented.svelte';
  import DayStacks from './charts/DayStacks.svelte';
  import MarkTiming from './charts/MarkTiming.svelte';
  import MonthGrid from './charts/MonthGrid.svelte';
  import PrayerRings from './charts/PrayerRings.svelte';
  import WeekTrend from './charts/WeekTrend.svelte';

  let span = $state<'7' | '30'>('7');
  const rm = $derived(view.reducedMotion);
  // Once a minute is plenty: a prayer's time ending is the finest change here.
  const now = $derived(clock.minute);
  const today = $derived(isoOf(now));
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
  const sum = $derived(summarize(waqtFile.value, period(today, n), now));
  const prev = $derived(summarize(waqtFile.value, period(addDays(today, -n), n), now));
  // Twelve weeks back: the trend, and streaks longer than the period.
  const HISTORY = 84;
  const long = $derived(summarize(waqtFile.value, period(today, HISTORY), now));
  const weeks = $derived(trend(long.grid.slice(span === '7' ? -56 : -HISTORY), 7));
  const streaks = $derived(Object.fromEntries(long.byPrayer.map((p) => [p.id, p.streak])));
  const said = $derived(notes(sum, prev.counted ? prev : null, { jamaat: s.jamaat.on, remindBefore: s.remind.before, streaks, before: span === '7' ? 'the week before' : 'the 30 days before' }));
  const head = $derived(said.find((x) => x.tone === 'bright') ?? said[0]);
  const rest = $derived(said.filter((x) => x !== head).slice(0, 4));
  const when = $derived(timing(sum));

  const showJamaat = $derived(s.jamaat.on || sum.jamaat > 0);
  const parts = $derived(
    [
      { k: 'jamaat', label: 'In jamaat', n: sum.jamaat, show: showJamaat },
      { k: 'ontime', label: 'On time', n: sum.ontime, show: true },
      { k: 'late', label: 'Made up', n: sum.late, show: sum.late > 0 },
      { k: 'missed', label: 'Not marked', n: sum.missed, show: true },
    ].filter((p) => p.show),
  );
</script>

<section class="ss" aria-label="Your salah">
  <div class="head">
    <h3>Your salah</h3>
    <Segmented label="Period" value={span} onchange={(v) => (span = v)} options={[{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }]} />
  </div>

  {#key span}
    {#if !sum.counted}
      <p class="empty" in:fly={{ y: 6, duration: rm ? 0 : 320, easing: cubicOut }}><Icon name="sparkle" size={13} /> {head?.text}</p>
    {:else}
      <div class="lead" in:fly={{ y: 8, duration: rm ? 0 : 380, easing: cubicOut }}>
        {#if head}<p class="headline"><Icon name="sparkle" size={15} /> <span>{head.text}</span></p>{/if}
        <p class="sub tnum">{sum.prayed} of {sum.counted} prayed · {Math.round((sum.prayed / sum.counted) * 100)}%</p>
      </div>

      <div class="meter" class:still={rm} role="img" aria-label={parts.map((p) => `${p.n} ${p.label.toLowerCase()}`).join(', ')}>
        {#each parts.filter((p) => p.n > 0) as p, i (p.k)}
          <i style:flex-grow={p.n} style:background={`var(--k-${p.k})`} style:--d={`${120 + i * 90}ms`}></i>
        {/each}
      </div>
      <ul class="legend tnum">
        {#each parts as p (p.k)}
          <li><i style:background={`var(--k-${p.k})`}></i>{p.label}<b>{p.n}</b></li>
        {/each}
        {#if sum.qasr}<li><i class="q"></i>Qasr<b>{sum.qasr}</b></li>{/if}
      </ul>

      <figure>
        <figcaption>Each day</figcaption>
        {#if span === '7'}
          <DayStacks days={sum.grid} {today} reduced={rm} />
        {:else}
          <MonthGrid days={sum.grid} {today} reduced={rm} />
        {/if}
      </figure>

      <figure>
        <figcaption>Each prayer</figcaption>
        <PrayerRings prayers={sum.byPrayer} {streaks} reduced={rm} />
      </figure>

      {#if weeks.length >= 2}
        <figure>
          <figcaption>Week by week <span>on time or in jamaat</span></figcaption>
          <WeekTrend points={weeks} reduced={rm} />
        </figure>
      {/if}

      {#if when.all.length >= 3}
        <figure>
          <figcaption>When you mark it</figcaption>
          {#if when.within != null}<p class="usual">Usually within {minutesInWords(when.within)} of the adhan.</p>{/if}
          <MarkTiming prayers={when.byPrayer} all={when.all} reduced={rm} />
        </figure>
      {/if}

      {#if rest.length}
        <ul class="words">
          {#each rest as w, i (w.key)}
            <li class={w.tone} in:fly={{ y: 4, duration: rm ? 0 : 280, delay: rm ? 0 : 200 + i * 70 }}><Icon name={w.tone === 'tip' ? 'bell' : 'sparkle'} size={12} /> {w.text}</li>
          {/each}
        </ul>
      {/if}

      <details class="numbers">
        <summary><Icon name="chevron-down" size={13} /> See the numbers</summary>
        <table class="tnum">
          <caption class="visually-hidden">Your salah, the last {n} days</caption>
          <thead>
            <tr>
              <th scope="col"><span class="visually-hidden">Prayer</span></th>
              {#if showJamaat}<th scope="col">In jamaat</th>{/if}
              <th scope="col">On time</th>
              <th scope="col">Made up</th>
              <th scope="col">Not marked</th>
              <th scope="col">In a row</th>
            </tr>
          </thead>
          <tbody>
            {#each sum.byPrayer as p (p.id)}
              <tr>
                <th scope="row">{PRAYER_NAME[p.id]}</th>
                {#if showJamaat}<td>{p.jamaat}</td>{/if}
                <td>{p.ontime}</td>
                <td>{p.late}</td>
                <td>{p.missed}</td>
                <td>{streaks[p.id] ?? p.streak}</td>
              </tr>
            {/each}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">All</th>
              {#if showJamaat}<td>{sum.jamaat}</td>{/if}
              <td>{sum.ontime}</td>
              <td>{sum.late}</td>
              <td>{sum.missed}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </details>
    {/if}
  {/key}
</section>

<style>
  /* How a prayer went, as calm steps from bare to full ("more" leans toward ink). Checked on every
     theme: lightness steps in order, neighbours ΔE ≥ 15 (≥ 10 for red-green colour blindness). */
  .ss {
    --green-k: var(--green, #25976a);
    --k-jamaat: color-mix(in srgb, var(--green-k) 56%, var(--ink));
    --k-ontime: var(--green-k);
    --k-late: color-mix(in srgb, var(--warm) 80%, var(--raised));
    --k-missed: color-mix(in srgb, var(--ink) 11%, var(--raised));
    --k-open-line: color-mix(in srgb, var(--green-k) 60%, transparent);
    --k-ahead-line: var(--line-strong);
    --k-open: var(--k-open-line);
    --k-ahead: var(--k-ahead-line);
    --k-before: var(--line);
    display: grid;
    gap: var(--s-3);
    padding: var(--s-4) 0;
    border-top: 1px solid var(--line);
  }
  :global([data-theme='dark']) .ss {
    --k-jamaat: color-mix(in srgb, var(--green-k) 72%, var(--ink));
    --k-ontime: color-mix(in srgb, var(--green-k) 66%, var(--raised));
    --k-late: color-mix(in srgb, var(--warm) 42%, var(--raised));
    --k-missed: color-mix(in srgb, var(--ink) 12%, var(--raised));
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
  .empty {
    margin: 0;
    display: flex;
    gap: 8px;
    align-items: baseline;
    font-size: var(--t-sm);
    color: var(--ink-2);
  }
  .lead {
    display: grid;
    gap: 3px;
  }
  .headline {
    margin: 0;
    display: flex;
    gap: 8px;
    align-items: baseline;
    font-size: var(--t-lg);
    font-weight: 500;
    line-height: 1.3;
    letter-spacing: -0.01em;
    text-wrap: pretty;
  }
  .headline :global(svg),
  .empty :global(svg) {
    flex: none;
    color: var(--green-k);
    transform: translateY(2px);
  }
  .sub {
    margin: 0 0 0 23px;
    font-size: var(--t-sm);
    color: var(--ink-3);
  }
  .meter {
    display: flex;
    gap: 2px;
    height: 10px;
    margin-top: 2px;
  }
  .meter i {
    flex-basis: 0;
    min-width: 4px;
    border-radius: 3px;
    transform-origin: left center;
    animation: grow 700ms cubic-bezier(0.34, 1.3, 0.64, 1) var(--d) backwards;
  }
  .meter i:first-child {
    border-radius: 5px 3px 3px 5px;
  }
  .meter i:last-child {
    border-radius: 3px 5px 5px 3px;
  }
  .meter i:only-child {
    border-radius: 5px;
  }
  .legend {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
    font-size: var(--t-xs);
    color: var(--ink-2);
  }
  .legend li {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .legend i {
    width: 10px;
    height: 10px;
    border-radius: 3px;
  }
  .legend i.q {
    background: linear-gradient(135deg, var(--k-ontime) 62%, var(--raised) 62%);
  }
  .legend b {
    font-weight: 500;
    color: var(--ink);
  }
  figure {
    margin: var(--s-2) 0 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--s-2);
    min-width: 0;
  }
  figcaption {
    font-size: var(--t-sm);
    font-weight: 500;
    color: var(--ink-3);
  }
  figcaption span {
    font-weight: 400;
  }
  figcaption span::before {
    content: '· ';
  }
  .usual {
    margin: -2px 0 2px;
    font-size: var(--t-sm);
    color: var(--ink-2);
  }
  .words {
    list-style: none;
    margin: var(--s-2) 0 0;
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
    color: var(--green-k);
    transform: translateY(1px);
  }
  .words li.tip :global(svg),
  .words li.info :global(svg) {
    color: var(--ink-3);
  }
  .numbers {
    margin-top: var(--s-1);
    font-size: var(--t-sm);
  }
  .numbers summary {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px 4px 4px;
    border-radius: var(--r-pill);
    color: var(--ink-3);
    cursor: pointer;
    list-style: none;
  }
  .numbers summary::-webkit-details-marker {
    display: none;
  }
  .numbers summary:hover {
    background: var(--sunken);
    color: var(--ink);
  }
  .numbers summary :global(svg) {
    transform: rotate(-90deg);
    transition: transform var(--dur-2) var(--ease-out);
  }
  .numbers[open] summary :global(svg) {
    transform: none;
  }
  table {
    width: 100%;
    margin-top: var(--s-2);
    border-collapse: collapse;
    font-size: var(--t-xs);
  }
  th,
  td {
    padding: 5px 4px;
    text-align: right;
    border-bottom: 1px solid var(--line);
  }
  thead th {
    font-weight: 500;
    color: var(--ink-3);
    vertical-align: bottom;
    line-height: 1.2;
  }
  tbody th,
  tfoot th {
    text-align: left;
    font-weight: 500;
    color: var(--ink-2);
  }
  tfoot th,
  tfoot td {
    border-bottom: 0;
    font-weight: 500;
  }
  @keyframes grow {
    from {
      transform: scaleX(0);
    }
  }
  .meter.still i,
  :global([data-motion='calm']) .meter i {
    animation: none;
  }
</style>
