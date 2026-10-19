<script lang="ts">
  // Which of an account's events Daybloom takes in. Everything is in to start with; untick an
  // event to keep it (and every repeat of it) off the dial, the timeline and tracking.
  import { cubicOut } from 'svelte/easing';
  import { slide } from 'svelte/transition';
  import { calendarName, seriesKey } from '../../lib/calendar/service';
  import type { CalendarAccount } from '../../lib/calendar/types';
  import { calendarState, UPCOMING_DAYS } from '../../lib/calendarBridge.svelte';
  import { categoryColor, nearestCategory } from '../../lib/engine/categories';
  import { formatDayShort, formatTime, isoOf } from '../../lib/engine/time';
  import Icon from '../../lib/Icon.svelte';
  import { shownTitle } from '../../lib/privacy';
  import { clock } from '../../lib/stores/clock.svelte';
  import { view } from '../../lib/stores/view.svelte';

  let { account }: { account: CalendarAccount } = $props();

  let open = $state(false);
  const rm = $derived(view.reducedMotion);
  const svc = $derived(calendarState.service);

  interface Series {
    key: string;
    title: string;
    times: number;
    next: number;
    allDay: boolean;
    color: string;
    calendar: string;
  }

  const series = $derived.by((): Series[] => {
    void calendarState.accounts; // re-read after syncs and changes
    if (!svc) return [];
    const from = clock.minute;
    const events = svc.accountEvents(account.id, from, from + UPCOMING_DAYS * 86_400_000);
    const cals = new Map(account.calendars.map((c) => [c.id, c]));
    const out = new Map<string, Series>();
    for (const ev of events) {
      const key = seriesKey(ev);
      const s = out.get(key);
      if (s) {
        s.times++;
        continue;
      }
      const cal = cals.get(ev.calendarId);
      const cat = cal?.category ?? (ev.color ? nearestCategory(ev.color) : 'focus');
      out.set(key, {
        key,
        title: ev.title || '(busy)',
        times: 1,
        next: ev.startMs,
        allDay: ev.allDay,
        color: categoryColor(cat, view.finish.dark),
        calendar: cal ? calendarName(cal) : '',
      });
    }
    return [...out.values()];
  });

  const hidden = $derived(new Set(account.hidden ?? []));
  const included = $derived(series.filter((s) => !hidden.has(s.key)).length);

  function when(s: Series): string {
    const d = isoOf(s.next);
    const day = d === view.today ? 'Today' : (() => { const f = formatDayShort(d); return `${f.dow} ${f.day}`; })();
    return s.allDay ? `${day} · all day` : `${day} ${formatTime(s.next, view.hour12)}`;
  }
  const setAll = (on: boolean) => svc?.setSeriesIncluded(account.id, series.map((s) => s.key), on);
</script>

{#if series.length}
  <div class="inc">
    <button class="toggle" onclick={() => (open = !open)} aria-expanded={open}>
      <Icon name="filter" size={13} />
      <span>Events to include</span>
      <span class="tally tnum">{included === series.length ? `All ${series.length}` : `${included} of ${series.length}`}</span>
      <span class="chev" class:up={open}><Icon name="chevron-down" size={14} /></span>
    </button>

    {#if open}
      <div class="list" transition:slide={{ duration: rm ? 0 : 240, easing: cubicOut }}>
        <div class="bulk">
          <span>Next {UPCOMING_DAYS} days. Repeats count as one.</span>
          <button class="link" onclick={() => setAll(true)} disabled={included === series.length}>All</button>
          <button class="link" onclick={() => setAll(false)} disabled={included === 0}>None</button>
        </div>
        <ul>
          {#each series as s (s.key)}
            {@const on = !hidden.has(s.key)}
            <li class:off={!on}>
              <label>
                <input type="checkbox" class="tick" checked={on} onchange={(e) => svc?.setSeriesIncluded(account.id, [s.key], e.currentTarget.checked)} />
                <i class="dot" style:background={s.color}></i>
                <span class="t">{shownTitle(s.title, 'focus')}</span>
                {#if s.times > 1}<span class="rep tnum" title={`${s.times} times in the next ${UPCOMING_DAYS} days`}><Icon name="repeat" size={10} /> {s.times}</span>{/if}
                <span class="w tnum">{when(s)}</span>
              </label>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  </div>
{/if}

<style>
  .inc {
    border-top: 1px solid var(--line);
  }
  .toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-height: 38px;
    padding: 0 var(--s-3);
    font-size: var(--t-sm);
    color: var(--ink-2);
    text-align: left;
    transition: background var(--dur-1) var(--ease-out);
  }
  .toggle:hover {
    background: var(--sunken);
    color: var(--ink);
  }
  .toggle > span:nth-child(2) {
    flex: 1;
  }
  .tally {
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .chev {
    display: grid;
    transition: transform var(--dur-3) var(--ease-out);
  }
  .chev.up {
    transform: rotate(180deg);
  }
  .list {
    padding: 0 var(--s-3) var(--s-2);
  }
  .bulk {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    padding: 2px 0 6px;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .bulk span {
    flex: 1;
  }
  .link {
    font-size: var(--t-xs);
    font-weight: 500;
    color: var(--ink-2);
    padding: 2px 6px;
    border-radius: var(--r-pill);
  }
  .link:hover:not(:disabled) {
    background: var(--sunken);
    color: var(--ink);
  }
  .link:disabled {
    opacity: 0.45;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 260px;
    overflow: auto;
  }
  li label {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 32px;
    font-size: var(--t-sm);
    cursor: pointer;
  }
  .tick {
    appearance: none;
    flex: none;
    width: 16px;
    height: 16px;
    margin: 0;
    border-radius: 5px;
    box-shadow: inset 0 0 0 1.5px var(--line-strong);
    display: grid;
    place-items: center;
    cursor: pointer;
    transition:
      background var(--dur-1) var(--ease-out),
      box-shadow var(--dur-1) var(--ease-out);
  }
  .tick:checked {
    background: var(--ink);
    box-shadow: none;
  }
  .tick:checked::after {
    content: '';
    width: 8px;
    height: 4px;
    margin-top: -2px;
    border-left: 2px solid var(--ink-inverse);
    border-bottom: 2px solid var(--ink-inverse);
    transform: rotate(-45deg);
    animation: pop var(--dur-2) var(--ease-settle);
  }
  @keyframes pop {
    from {
      transform: rotate(-45deg) scale(0.4);
    }
  }
  .dot {
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    transition: opacity var(--dur-2) var(--ease-out);
  }
  .t {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    transition: color var(--dur-2) var(--ease-out);
  }
  .rep {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .w {
    flex: none;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .off .t {
    color: var(--ink-3);
    text-decoration: line-through;
    text-decoration-color: var(--line-strong);
  }
  .off .dot {
    opacity: 0.3;
  }
</style>
