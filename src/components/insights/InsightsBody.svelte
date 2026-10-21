<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { categoryColor } from '../../lib/engine/categories';
  import { addDays, formatDuration, fromISODate, MINUTE, minutesOfDay } from '../../lib/engine/time';
  import type { ISODate } from '../../lib/engine/types';
  import { computeInsights, highlights, type Highlight, type Span } from '../../lib/insights';
  import Icon from '../../lib/Icon.svelte';
  import Rolling from '../../lib/dial/Rolling.svelte';
  import { clock } from '../../lib/stores/clock.svelte';
  import { progress, unlockNew } from '../../lib/stores/progress.svelte';
  import { settings } from '../../lib/stores/settings.svelte';
  import { taskFile } from '../../lib/stores/tasks.svelte';
  import { view } from '../../lib/stores/view.svelte';
  import Segmented from '../Segmented.svelte';
  import Badges from './Badges.svelte';
  import DayDial from './DayDial.svelte';
  import TimeBars from './TimeBars.svelte';
  import RhythmChip from '../RhythmChip.svelte';
  import { rhythm, routineStreaks } from '../../lib/streaks';

  let { onhistory }: { /** Show what was finished on a day (the Done tab). */ onhistory?: (date: ISODate) => void } = $props();

  let span = $state<Span>(7);

  const stats = $derived.by(() => {
    clock.zone;
    return computeInsights(taskFile.value.tasks, clock.minute, span);
  });
  const lines = $derived(highlights(stats, { hour12: view.hour12 }));
  const week = $derived(span === 7);
  const period = $derived(week ? 'this week' : 'in the last 4 weeks');
  const dark = $derived(view.finish.dark);
  const blockDays = $derived(stats.days.filter((d) => d.done > 0).length);

  // Earn anything already deserved, quietly, and remember what was new to this visit.
  let seenBefore = $state(Number.POSITIVE_INFINITY);
  let synced = false;
  $effect(() => {
    if (!progress.ready || synced) return;
    synced = true;
    untrack(() => {
      seenBefore = progress.viewedAt;
      unlockNew();
      progress.markViewed();
    });
  });
  onDestroy(() => {
    if (synced) progress.markViewed();
  });

  // The day readout under the dials follows the pointer, and rests on today.
  let hovered = $state<ISODate | null>(null);
  const readDay = $derived(stats.days.find((d) => d.date === hovered) ?? stats.days[stats.days.length - 1]);
  function dayName(d: ISODate) {
    if (d === stats.today) return 'Today';
    if (d === addDays(stats.today, -1)) return 'Yesterday';
    return fromISODate(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }
  const readout = $derived.by(() => {
    const d = readDay;
    const n = d.done + d.backlog;
    if (n === 0) return d.date === stats.today ? 'the day is still open' : 'a quiet day';
    return `${n} finished${d.spentMs >= MINUTE ? ` · ${formatDuration(d.spentMs)} well spent` : ''}`;
  });
  const initials = $derived(stats.days.slice(0, 7).map((d) => ({ date: d.date, label: fromISODate(d.date).toLocaleDateString(undefined, { weekday: 'narrow' }) })));
  const nowMin = $derived(minutesOfDay(clock.minute));

  function toneColor(h: Highlight) {
    if (h.tone === 'lume') return 'var(--lume)';
    if (h.tone === 'ink') return 'var(--ink-2)';
    return categoryColor(h.tone, dark);
  }
  const plural = (n: number, w: string) => (n === 1 ? w : `${w}s`);
  const earned = $derived(progress.unlocked.length);
  const rhy = $derived(rhythm(taskFile.value.tasks, clock.minute));
  const routines = $derived(routineStreaks(taskFile.value.tasks, clock.minute, view.finish.dark));
</script>

<div class="insights">
  <div class="top">
    <Segmented
      label="Period"
      value={String(span) as '7' | '28'}
      options={[
        { value: '7', label: 'This week' },
        { value: '28', label: 'Last 4 weeks' },
      ]}
      onchange={(v) => (span = Number(v) as Span)}
    />
  </div>

  <p class="lead">
    {#if stats.finished > 0}
      You finished <b><Rolling text={String(stats.finished)} reduced={view.reducedMotion} /> {plural(stats.finished, 'block')}</b>
      {period},
      {#if blockDays === 1}on <b>one day</b>.{:else}across <b><Rolling text={String(blockDays)} reduced={view.reducedMotion} /> days</b>.{/if}
    {:else if stats.backlogDone > 0}
      You cleared <b><Rolling text={String(stats.backlogDone)} reduced={view.reducedMotion} /> {stats.backlogDone === 1 ? 'thing' : 'things'}</b>
      from your backlog {period}.
    {:else}
      A blank page so far. Finished blocks will bloom here.
    {/if}
  </p>

  <section class="strip" aria-label="Days">
    {#if !week}
      <div class="grid heads" aria-hidden="true">
        {#each initials as d (d.date)}<span class="initial">{d.label}</span>{/each}
      </div>
    {/if}
    {#key span}
      <div class="grid" class:month={!week}>
        {#each stats.days as d, i (d.date)}
          {@const isToday = d.date === stats.today}
          <button
            class="day"
            class:today={isToday}
            style:--i={i}
            style:--step={week ? '22ms' : '5ms'}
            onpointerenter={() => (hovered = d.date)}
            onpointerleave={() => (hovered = null)}
            onfocus={() => (hovered = d.date)}
            onblur={() => (hovered = null)}
            onclick={() => view.setDate(d.date)}
            aria-label={`${fromISODate(d.date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}: ${d.done + d.backlog} finished. Show this day.`}
          >
            <DayDial day={d} finish={view.finish} wake={settings.value.wake} sleep={settings.value.sleep} nowMin={isToday ? nowMin : null} />
            {#if week}
              <span class="initial">{fromISODate(d.date).toLocaleDateString(undefined, { weekday: 'narrow' })}</span>
            {/if}
          </button>
        {/each}
      </div>
    {/key}
    <p class="readout tnum" aria-live="polite">
      <span class="when">{dayName(readDay.date)}</span> · {readout}
      {#if onhistory && readDay.done + readDay.backlog > 0}
        <button class="see" onclick={() => onhistory(readDay.date)} onpointerenter={() => (hovered = readDay.date)}>See them <Icon name="chevron-right" size={12} stroke={2.2} /></button>
      {/if}
    </p>
  </section>

  <ul class="lines">
    {#each lines as h (h.text)}
      <li>
        <span class="glyph" style:--c={toneColor(h)}><Icon name={h.icon} size={16} stroke={2} /></span>
        <span>{h.text}</span>
      </li>
    {/each}
  </ul>

  <section>
    <h3>Rhythm</h3>
    <RhythmChip />
    <p class="rhythm-note tnum">
      Best run {rhy.best} {plural(rhy.best, 'day')}{rhy.rest ? ` · ${rhy.rest} rest ${plural(rhy.rest, 'day')} banked` : ''}. Every 7 days earns a rest day, so one quiet day never breaks it.
    </p>
    {#if routines.length}
      <ul class="routines">
        {#each routines.slice(0, 4) as r (r.taskId)}
          <li style:--c={r.color}>
            <span class="glyph"><Icon name={r.icon} size={14} /></span>
            <span class="rt">{r.title}</span>
            <span class="rc tnum"><Icon name="flame" size={12} /> {r.count} in a row</span>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <section>
    <h3>Time well spent</h3>
    <TimeBars
      current={stats.spent}
      previous={stats.previous.spent}
      currentLabel={week ? 'This week' : 'Last 4 weeks'}
      previousLabel={week ? 'Week before' : 'Before that'}
      {dark}
      reduced={view.reducedMotion}
    />
  </section>

  <section>
    <h3>Badges {#if earned}<span class="count tnum">{earned} earned</span>{/if}</h3>
    <Badges items={progress.all} today={stats.today} {seenBefore} {dark} />
  </section>
</div>

<style>
  .rhythm-note {
    margin: 6px 0 0;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .routines {
    list-style: none;
    margin: 10px 0 0;
    padding: 0;
    display: grid;
    gap: 4px;
  }
  .routines li {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--t-sm);
  }
  .routines .glyph {
    color: var(--c);
  }
  .routines .rt {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .routines .rc {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    color: var(--ink-2);
    font-size: var(--t-xs);
  }
  .insights {
    display: grid;
    gap: var(--s-5);
    padding-top: var(--s-1);
  }
  .top {
    display: flex;
  }
  .lead {
    margin: calc(-1 * var(--s-2)) 0 0;
    font-family: var(--font-ui);
    font-size: var(--t-lg);
    font-weight: 400;
    line-height: 1.4;
    letter-spacing: -0.01em;
    color: var(--ink-2);
    text-wrap: pretty;
  }
  .lead b {
    font-weight: 500;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: var(--s-2);
  }
  .grid.month {
    row-gap: var(--s-2);
  }
  .heads {
    margin-bottom: var(--s-1);
  }
  .day {
    display: grid;
    justify-items: center;
    gap: 6px;
    padding: 4px 2px;
    border-radius: var(--r-sm);
    transition: background var(--dur-1) var(--ease-out);
    animation: rise 260ms var(--ease-out) both;
    animation-delay: calc(var(--i) * var(--step));
  }
  .day :global(.dial) {
    max-width: 62px;
  }
  .month .day :global(.dial) {
    max-width: 48px;
  }
  .day:hover {
    background: var(--sunken);
  }
  .initial {
    display: block;
    text-align: center;
    font-family: var(--font-ui);
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .today .initial {
    color: var(--signal);
    font-weight: 500;
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
  }
  :global([data-motion='calm']) .day {
    animation: none;
  }
  .readout {
    margin: var(--s-2) 0 0;
    font-family: var(--font-ui);
    font-size: var(--t-xs);
    color: var(--ink-3);
    text-align: center;
  }
  .readout .when {
    color: var(--ink-2);
    font-weight: 500;
  }
  .see {
    display: inline-flex;
    align-items: center;
    gap: 1px;
    margin-left: 4px;
    padding: 2px 6px 2px 8px;
    border-radius: var(--r-pill);
    font-size: var(--t-xs);
    font-weight: 500;
    color: var(--ink-2);
    transition: background var(--dur-1) var(--ease-out);
  }
  .see:hover {
    background: var(--sunken);
    color: var(--ink);
  }

  .lines {
    display: grid;
    gap: var(--s-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .lines li {
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr);
    align-items: center;
    gap: var(--s-3);
    font-size: var(--t-md);
    line-height: 1.4;
    color: var(--ink);
    text-wrap: pretty;
  }
  .glyph {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    color: var(--c);
    background: color-mix(in srgb, var(--c) 14%, transparent);
  }

  h3 {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin: 0 0 var(--s-3);
    font-family: var(--font-ui);
    font-size: var(--t-sm);
    font-weight: 500;
    color: var(--ink-3);
  }
  .count {
    font-size: var(--t-xs);
    font-weight: 400;
  }
</style>
