<script lang="ts">
  // The month, one click from the top bar (the date, the calendar button by the week, More, or
  // M). Each day is a little dial: a ring in the colours of its blocks, as full as the day is
  // planned (calendar events and salah quieter); a day with every task done glows softly. Today's
  // number is in signal, the day you're on sits on the ink puck, and its week is shaded. Type to
  // jump ("fri", "next week", "12 nov"), arrows / Page Up / Page Down / Home / End to move, Enter
  // to go. The line at the foot says what the day under the pointer (or the focus) holds.
  import { untrack } from 'svelte';
  import { cubicOut } from 'svelte/easing';
  import { fly } from 'svelte/transition';
  import { blocksInRange } from '../../lib/engine/blocks';
  import { addDays, formatDuration, fromISODate, MINUTE, startOfDayMs } from '../../lib/engine/time';
  import type { ISODate } from '../../lib/engine/types';
  import Icon from '../../lib/Icon.svelte';
  import { dayLabel, monthGrid, parseDayText } from '../../lib/pickers';
  import { settings } from '../../lib/stores/settings.svelte';
  import { taskFile } from '../../lib/stores/tasks.svelte';
  import { view } from '../../lib/stores/view.svelte';
  import { springOut } from '../topbar/motion';
  import { addMonths, dayLoads, moveDay } from './month';

  let { onpick }: { onpick: (d: ISODate) => void } = $props();

  const rm = $derived(view.reducedMotion);
  const today = $derived(view.today);
  const firstOf = (d: ISODate) => `${d.slice(0, 8)}01` as ISODate;

  /** The month on show (its 1st), the day with the keyboard focus, and which way we last moved. */
  let shown = $state<ISODate>(firstOf(untrack(() => view.date)));
  let focusDay = $state<ISODate>(untrack(() => view.date));
  let hover = $state<ISODate | null>(null);
  let dir = $state(1);
  let q = $state('');
  let gridEl = $state<HTMLDivElement>();
  let input = $state<HTMLInputElement>();

  const year = $derived(Number(shown.slice(0, 4)));
  const month = $derived(Number(shown.slice(5, 7)) - 1);
  const days = $derived(monthGrid(year, month));
  const weeks = $derived(Array.from({ length: 6 }, (_, i) => days.slice(i * 7, i * 7 + 7)));
  const typed = $derived(q.trim() ? parseDayText(q, today) : null);

  const waking = $derived((((settings.value.sleep - settings.value.wake) % 1440) + 1440) % 1440 || 960);
  const loads = $derived(
    dayLoads(blocksInRange(taskFile.value.tasks, view.events, startOfDayMs(days[0]), startOfDayMs(addDays(days[41], 1)), view.finish.dark), waking),
  );

  /** Bring a day into view (sliding toward it) and give it the focus. */
  function show(d: ISODate, focus = true) {
    const f = firstOf(d);
    if (f !== shown) {
      dir = f > shown ? 1 : -1;
      shown = f;
    }
    focusDay = d;
    if (focus) queueMicrotask(() => gridEl?.querySelector<HTMLButtonElement>(`[data-day="${d}"]`)?.focus());
  }
  function go(n: number) {
    dir = n;
    shown = addMonths(shown, n);
    focusDay = addMonths(focusDay, n);
  }

  // Typing a day shows it (outlined) before you press Enter.
  $effect(() => {
    const t = typed;
    if (t) untrack(() => show(t, false));
  });
  // Open on the day you're on, with the keyboard in the grid (once: later, typing keeps it).
  // After a beat: the popover moves itself to <body> first, and moving a node drops its focus.
  let focused = false;
  $effect(() => {
    if (!gridEl || focused) return;
    focused = true;
    const t = setTimeout(() => gridEl?.querySelector<HTMLButtonElement>(`[data-day="${untrack(() => focusDay)}"]`)?.focus(), 0);
    return () => clearTimeout(t);
  });

  function onGridKey(e: KeyboardEvent) {
    const to = moveDay(focusDay, e.key, e.shiftKey);
    if (to) {
      e.preventDefault();
      show(to);
      return;
    }
    // Any other letter or digit starts a jump: "f" "r" "i"…
    if (e.key.length === 1 && e.key !== ' ' && !e.metaKey && !e.ctrlKey && !e.altKey && /[\p{L}\p{N}+/.-]/u.test(e.key)) {
      e.preventDefault();
      q += e.key;
      input?.focus();
    }
  }
  function onInputKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && typed) {
      e.preventDefault();
      onpick(typed);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      show(typed ?? focusDay);
    }
  }

  const info = $derived.by(() => {
    const d = hover ?? typed ?? focusDay;
    const l = loads.get(d);
    const parts: string[] = [];
    if (l?.tasks) parts.push(l.tasks === 1 ? '1 block' : `${l.tasks} blocks`);
    if (l?.minutes) parts.push(formatDuration(l.minutes * MINUTE));
    if (l?.done) parts.push(l.complete ? 'all done' : `${l.done} done`);
    if (l?.events) parts.push(l.events === 1 ? '1 event' : `${l.events} events`);
    return { day: dayLabel(d, today), text: parts.length ? parts.join(' · ') : 'Nothing planned', glow: !!l?.complete };
  });

  const R = 15;
  const C = 2 * Math.PI * R;
  const label = (d: ISODate) => {
    const l = loads.get(d);
    const what = !l ? 'nothing planned' : [l.tasks && `${l.tasks} blocks`, l.minutes && formatDuration(l.minutes * MINUTE), l.done && `${l.done} done`, l.events && `${l.events} events`].filter(Boolean).join(', ');
    return `${fromISODate(d).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}, ${what}`;
  };
  const monthName = $derived(fromISODate(shown).toLocaleDateString(undefined, { month: 'long' }));
  function slide(_n: Element, o: { dir: number }) {
    if (rm) return { duration: 0 };
    return { duration: 420, easing: springOut, css: (t: number) => `transform: translateX(${(1 - t) * 22 * o.dir}px); opacity: ${Math.min(1, t * 1.6)}` };
  }
</script>

<!-- Keys pressed in here are the calendar's: the app's own shortcuts (F, I, Space, ← →) stay
     out of it. Escape still closes it (the popover listens first). -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="cal" onkeydown={(e) => e.key !== 'Escape' && e.key !== 'Tab' && e.stopPropagation()}>
  <label class="jump" class:hit={!!typed}>
    <Icon name="search" size={14} />
    <input bind:this={input} bind:value={q} onkeydown={onInputKey} placeholder="Jump to… fri, next week, 12 nov" aria-label="Jump to a day" spellcheck="false" autocomplete="off" />
    {#if typed}<button class="go" onclick={() => onpick(typed!)} in:fly={{ x: 6, duration: rm ? 0 : 200, easing: cubicOut }}>{dayLabel(typed, today)} <Icon name="arrow-right" size={12} stroke={2.4} /></button>{/if}
  </label>

  <div class="head">
    {#key shown}
      <p class="title" in:fly={{ y: 6 * dir, duration: rm ? 0 : 260, easing: cubicOut }}>{monthName} <span class="tnum">{year}</span></p>
    {/key}
    <div class="nav">
      <button class="step" onclick={() => go(-1)} aria-label="Previous month" title="Previous month · Page Up"><Icon name="chevron-left" size={16} /></button>
      <button class="btn btn-soft today" onclick={() => onpick(today)} title="Today · T">Today</button>
      <button class="step" onclick={() => go(1)} aria-label="Next month" title="Next month · Page Down"><Icon name="chevron-right" size={16} /></button>
    </div>
  </div>

  <div class="dow" aria-hidden="true">
    {#each ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as d (d)}<span>{d}</span>{/each}
  </div>

  {#key shown}
    <!-- Arrow keys between the days are handled once, here (a roving focus). -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="grid" role="group" aria-label={`${monthName} ${year}`} bind:this={gridEl} onkeydown={onGridKey} onpointerleave={() => (hover = null)} in:slide={{ dir }}>
      {#each weeks as wk (wk[0])}
        <div class="wk" class:cur={wk.includes(view.date)}>
          {#each wk as d (d)}
            {@const l = loads.get(d)}
            <button
              class="day tnum"
              class:out={Number(d.slice(5, 7)) - 1 !== month}
              class:today={d === today}
              class:sel={d === view.date}
              class:pre={d === typed && d !== view.date}
              class:complete={l?.complete}
              data-day={d}
              tabindex={d === focusDay ? 0 : -1}
              aria-pressed={d === view.date}
              aria-current={d === today ? 'date' : undefined}
              aria-label={label(d)}
              onclick={() => onpick(d)}
              onfocus={() => (focusDay = d)}
              onpointerenter={() => (hover = d)}
            >
              {#if l}
                <svg class="ring" viewBox="0 0 36 36" aria-hidden="true">
                  <circle class="track" cx="18" cy="18" r={R} />
                  {#each l.arcs as a, i (i)}
                    <circle
                      class="arc"
                      class:done={a.done}
                      class:quiet={a.quiet}
                      cx="18"
                      cy="18"
                      r={R}
                      style:stroke={a.done ? undefined : a.color}
                      stroke-dasharray={`${a.length * C} ${C}`}
                      stroke-dashoffset={-a.start * C}
                    />
                  {/each}
                </svg>
              {/if}
              <span class="n">{Number(d.slice(8))}</span>
            </button>
          {/each}
        </div>
      {/each}
    </div>
  {/key}

  <p class="foot" aria-live="polite">
    <b class:glow={info.glow}>{info.day}</b>
    <span class="tnum">{info.text}</span>
  </p>
</div>

<style>
  .cal {
    display: grid;
    gap: 8px;
    font-family: var(--font-ui);
  }
  .jump {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 34px;
    padding: 0 6px 0 10px;
    border-radius: var(--r-sm);
    border: 1px solid var(--line-strong);
    background: var(--raised);
    color: var(--ink-3);
    transition:
      border-color var(--dur-1) var(--ease-out),
      box-shadow var(--dur-1) var(--ease-out);
  }
  .jump:focus-within {
    border-color: var(--focus-ring);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--focus-ring) 20%, transparent);
  }
  .jump input {
    flex: 1;
    min-width: 0;
    height: 100%;
    border: 0;
    outline: none;
    background: none;
    font-size: var(--t-sm);
    color: var(--ink);
  }
  .jump input::placeholder {
    font-size: var(--t-xs);
  }
  .go {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 24px;
    padding: 0 8px;
    border-radius: var(--r-pill);
    font-size: var(--t-xs);
    font-weight: 500;
    color: var(--ink-inverse);
    background: var(--ink);
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 2px 2px 0 4px;
  }
  .title {
    margin: 0;
    font-size: var(--t-md);
    font-weight: 500;
    color: var(--ink);
  }
  .title span {
    color: var(--ink-3);
    font-weight: 400;
  }
  .nav {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .step {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    color: var(--ink-2);
    transition:
      background var(--dur-1) var(--ease-out),
      transform var(--dur-1) var(--ease-out);
  }
  .step:hover {
    background: var(--sunken);
    color: var(--ink);
  }
  .step:active {
    transform: scale(0.9);
  }
  .today {
    height: 28px;
    padding: 0 12px;
    font-size: var(--t-xs);
  }
  .dow,
  .wk {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    justify-items: center;
  }
  .dow span {
    font-size: 10.5px;
    color: var(--ink-3);
  }
  .grid {
    display: grid;
    gap: 1px;
    outline: none;
  }
  .wk {
    border-radius: var(--r-md);
  }
  /* The week the bar shows. */
  .wk.cur {
    background: color-mix(in srgb, var(--ink) 5%, transparent);
  }
  .day {
    position: relative;
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    border-radius: 50%;
    font-size: var(--t-sm);
    color: var(--ink);
    transition: transform var(--dur-1) var(--ease-out);
  }
  .day::before {
    content: '';
    position: absolute;
    inset: 6px;
    border-radius: 50%;
    transition: background var(--dur-1) var(--ease-out);
  }
  .day:hover::before {
    background: var(--sunken);
  }
  .day:active {
    transform: scale(0.9);
  }
  .day:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: -1px;
  }
  .n {
    position: relative;
    line-height: 1;
  }
  .day.out {
    opacity: 0.42;
  }
  .day.today .n {
    color: var(--signal);
    font-weight: 600;
  }
  .day.sel::before {
    background: var(--ink);
  }
  .day.sel .n {
    color: var(--ink-inverse);
    font-weight: 500;
  }
  .day.pre::before {
    box-shadow: inset 0 0 0 1.5px var(--ink-2);
  }
  /* Every task done: lume, softly. */
  .day.complete::after {
    content: '';
    position: absolute;
    inset: 3px;
    border-radius: 50%;
    box-shadow: 0 0 8px -1px color-mix(in srgb, var(--lume) 70%, transparent);
    pointer-events: none;
  }
  .ring {
    position: absolute;
    inset: 1px;
    width: 36px;
    height: 36px;
    transform: rotate(-90deg);
    pointer-events: none;
  }
  .ring circle {
    fill: none;
    stroke-width: 2.8;
  }
  .track {
    stroke: var(--line);
  }
  .arc.quiet {
    opacity: 0.42;
  }
  .arc.done {
    stroke: var(--lume);
  }
  .foot {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-height: 20px;
    margin: 2px 4px 0;
    font-size: var(--t-xs);
    color: var(--ink-3);
    white-space: nowrap;
    overflow: hidden;
  }
  .foot b {
    flex: none;
    font-weight: 500;
    color: var(--ink);
  }
  .foot b.glow {
    color: color-mix(in srgb, var(--lume) 70%, var(--ink));
  }
  .foot span {
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
