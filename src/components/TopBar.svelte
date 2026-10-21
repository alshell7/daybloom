<script lang="ts">
  import { platform } from '../lib/platform';
  // The top bar: the day on the left (the clock, the date, the zone), the week, and the actions
  // on the right. It never overlaps or clips. Every item has a group and a priority
  // (topbar/items.ts); a ResizeObserver reports the bar's width and each item's natural width
  // (only when one changes), and fitBar() decides from those numbers what stays out: the long date
  // shortens, the quietest actions fold into More, the week drops to a row of its own. A wider
  // window brings them back in the same order. Items spring aside as others fold or return, and
  // the week glides between rows (FLIP, transform only). What you hide in Settings › Screen ›
  // Top bar waits in More too.
  import { flip } from 'svelte/animate';
  import type { Action } from 'svelte/action';
  import { calendarState } from '../lib/calendarBridge.svelte';
  import { activeTimeZone, addDays, formatDayLong, formatTime, fromISODate, zoneCity } from '../lib/engine/time';
  import Icon from '../lib/Icon.svelte';
  import { toggleTheme } from '../lib/themeToggle';
  import { tracker } from '../lib/addons/tracker/tracker.svelte';
  import { clock } from '../lib/stores/clock.svelte';
  import { settings } from '../lib/stores/settings.svelte';
  import { timer } from '../lib/stores/timer.svelte';
  import { view } from '../lib/stores/view.svelte';
  import { updates } from '../lib/updater.svelte';
  import ThemeToggle from './ThemeToggle.svelte';
  import ZonePicker from './ZonePicker.svelte';
  import TrackerPill from './addons/tracker/TrackerPill.svelte';
  import SessionPill from './focus/SessionPill.svelte';
  import BacklogButton from './backlog/BacklogButton.svelte';
  import CalendarButton from './calendars/CalendarButton.svelte';
  import { fitBar } from './topbar/fit';
  import { barCatalog, GROUPS, KBD, type BarItemDef, type GroupId } from './topbar/items';
  import { barLive } from './topbar/live.svelte';
  import MoreMenu, { type MenuEntry, type MenuGroup } from './topbar/MoreMenu.svelte';
  import { popIn, popOut, slideFrom, springOut } from './topbar/motion';
  import { showUpdate, updateWaiting } from './topbar/updateNotice.svelte';
  import WeekStrip from './topbar/WeekStrip.svelte';
  import Popover from './pickers/Popover.svelte';
  import MonthCalendar from './calendar-view/MonthCalendar.svelte';
  import type { ISODate } from '../lib/engine/types';

  let { mac = false, ontogglewidget }: { mac?: boolean; ontogglewidget: () => void } = $props();

  /** The traffic lights' room on macOS (row one only; the week's own row runs full width). */
  const MAC_INSET = 64;
  /** Widths to assume until an item has been measured. */
  const GUESS: Record<string, number> = { clock: 66, rel: 48, long: 170, short: 96, 'zone:full': 120, 'zone:compact': 40, today: 70, more: 34, 'it:private': 92, 'it:session': 170, 'it:tracker': 150 };

  const rm = $derived(view.reducedMotion);
  const hidden = $derived(new Set(settings.value.topBar.hidden));
  const catalog = $derived(barCatalog());
  const connected = $derived(calendarState.accounts.some((a) => a.enabled !== false));

  /** Whether an item has anything to show right now (the pills only while they're live). */
  function present(id: string): boolean {
    if (id === 'private') return settings.value.privacy.on;
    if (id === 'session') return !!timer.active && !view.focus;
    if (id === 'tracker') return !!tracker.running;
    if (id === 'calendars') return connected;
    // A phone has no desktop to put the widget on (its home-screen widget is set up there).
    if (id === 'widget') return !platform.isMobile;
    return true;
  }

  // --- measuring -------------------------------------------------------------------------
  // One observer for the row and every item. Natural widths only: items never shrink (flex: none,
  // nowrap), and the variants not in use (the other date, a hidden "Today") are laid out off to
  // the side, invisible, so they can still be measured.
  let rowW = $state(0);
  let widths = $state<Record<string, number>>({});
  let ready = $state(false);
  const keys = new WeakMap<Element, string>();
  let rowEl = $state<HTMLElement>();

  const ro =
    typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver((entries) => {
          let next: Record<string, number> | null = null;
          for (const e of entries) {
            if (e.target === rowEl) {
              rowW = e.contentRect.width;
              continue;
            }
            const key = keys.get(e.target);
            if (!key) continue;
            const w = e.borderBoxSize?.[0]?.inlineSize ?? (e.target as HTMLElement).offsetWidth;
            if (Math.abs((widths[key] ?? -1) - w) > 0.5) (next ??= { ...widths })[key] = w;
          }
          if (next) widths = next;
          if (!ready && rowW > 0) requestAnimationFrame(() => requestAnimationFrame(() => (ready = true)));
        });

  const measure: Action<HTMLElement, string> = (node, key) => {
    keys.set(node, key);
    ro?.observe(node);
    return {
      update: (k: string) => void keys.set(node, k),
      destroy: () => ro?.unobserve(node),
    };
  };
  $effect(() => {
    if (!rowEl || !ro) return;
    ro.observe(rowEl);
    return () => ro.disconnect();
  });
  const w = (key: string, guess = 34) => widths[key] ?? GUESS[key] ?? guess;

  // --- deciding --------------------------------------------------------------------------
  const rel = $derived.by(() => {
    if (view.date === view.today) return 'Today';
    if (view.date === addDays(view.today, 1)) return 'Tomorrow';
    if (view.date === addDays(view.today, -1)) return 'Yesterday';
    return null;
  });
  const dateOn = $derived(!hidden.has('date'));
  const zoneOn = $derived(!hidden.has('zone'));
  const weekOn = $derived(!hidden.has('week'));
  const actions = $derived(catalog.filter((d) => !d.lead && present(d.id) && !hidden.has(d.id)));

  const fit = $derived(
    fitBar({
      row: Math.max(0, rowW - (mac ? MAC_INSET : 0)),
      row2: rowW,
      date: dateOn ? { clock: w('clock'), rel: rel ? w('rel') : 0, long: w('long'), short: w('short') } : null,
      zone: zoneOn ? { full: w('zone:full'), compact: w('zone:compact') } : null,
      week: weekOn ? { today: w('today') } : null,
      items: actions.map((d) => ({ id: d.id, priority: d.priority, group: d.group, width: w(`it:${d.id}`) })),
      more: w('more'),
    }),
  );
  const inBar = $derived(actions.filter((d) => fit.shown.includes(d.id)));
  const showLong = $derived(fit.date === 'long');
  const showShort = $derived(fit.date === 'short' || (fit.date === 'rel' && !rel));
  const showRel = $derived(!!rel && fit.date !== 'clock');
  const weekIn = $derived(fit.week === 'inline' || fit.week === 'below');

  $effect(() => {
    barLive.folded = fit.folded;
    barLive.week = fit.week;
    barLive.zone = fit.zone;
  });

  // The week gliding between rows: where it was, then where it is (FLIP).
  let weekEl = $state<HTMLElement>();
  let weekWas: DOMRect | null = null;
  let lastWeek: string | null = null;
  $effect.pre(() => {
    const m = fit.week;
    if (ready && lastWeek && m !== lastWeek && weekEl?.isConnected) weekWas = weekEl.getBoundingClientRect();
  });
  $effect(() => {
    const m = fit.week;
    if (weekWas && weekEl && m !== lastWeek) {
      const now = weekEl.getBoundingClientRect();
      slideFrom(weekEl, weekWas.left - now.left, weekWas.top - now.top, rm);
    }
    weekWas = null;
    lastWeek = m;
  });

  // --- what the items do -----------------------------------------------------------------
  const title = $derived(formatDayLong(view.date));
  const shortTitle = $derived(fromISODate(view.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }));

  function toggleSheet(kind: 'assistant' | 'insights' | 'addons' | 'backlog' | 'calendars') {
    view.sheet = view.sheet?.kind === kind ? null : { kind };
  }
  function openSheet(kind: string) {
    view.sheet = view.sheet?.kind === kind ? null : ({ kind } as typeof view.sheet);
  }
  function openFocus() {
    if (timer.active) view.focus = true;
    else view.sheet = view.sheet?.kind === 'focus' ? null : { kind: 'focus' };
  }
  function togglePrivacy() {
    const on = !settings.value.privacy.on;
    settings.value.privacy.on = on;
    view.say(on ? 'Privacy mode on · Daybloom stays out of screenshots and recordings' : 'Privacy mode off');
  }

  /** The More menu's row for an item. */
  function entryFor(d: BarItemDef): MenuEntry | null {
    const base = { id: d.id, label: d.label, icon: d.icon, kbd: d.kbd };
    switch (d.id) {
      case 'private':
        return null; // "Privacy mode" is always in More.
      case 'session':
        return { ...base, label: 'Back to focus', detail: timer.active?.label, kbd: 'F', run: () => (view.focus = true) };
      case 'tracker':
        return { ...base, detail: 'Tracking now', run: () => (view.sheet = { kind: 'tracker' }) };
      case 'ask':
        return { ...base, run: () => toggleSheet('assistant') };
      case 'backlog':
        return { ...base, detail: view.later.length ? `${view.later.length} waiting` : undefined, run: () => toggleSheet('backlog') };
      case 'focus':
        return { ...base, run: openFocus };
      case 'insights':
        return { ...base, run: () => toggleSheet('insights') };
      case 'calendars':
        return { ...base, run: () => toggleSheet('calendars') };
      case 'theme':
        return { ...base, label: view.dark ? 'Light mode' : 'Dark mode', icon: view.dark ? 'sun' : 'moon', run: (el) => toggleTheme(el) };
      case 'widget':
        return { ...base, label: settings.value.widget.visible ? 'Hide the widget' : 'Desktop widget', run: ontogglewidget };
      case 'addons':
        return { ...base, label: 'Browse addons', run: () => toggleSheet('addons') };
      case 'settings':
        return { ...base, kbd: ',', run: () => (view.sheet = { kind: 'settings' }) };
      default:
        return d.sheet ? { ...base, run: () => openSheet(d.sheet!) } : null;
    }
  }

  const menuGroups = $derived.by((): MenuGroup[] => {
    const by = new Map<GroupId, MenuEntry[]>();
    const add = (g: GroupId, e: MenuEntry | null) => e && by.set(g, [...(by.get(g) ?? []), e]);
    for (const d of catalog) {
      if (d.lead) continue;
      if (d.id === 'calendars' && !connected) {
        add('see', { id: 'calendars', label: 'Calendars', icon: 'calendar', detail: 'Connect Google or a calendar link', run: () => toggleSheet('calendars') });
        continue;
      }
      if (present(d.id) && (hidden.has(d.id) || fit.folded.includes(d.id))) add(d.group, entryFor(d));
    }
    if (!weekIn) add('navigate', { id: 'month', label: 'Month', icon: 'calendar-days', kbd: 'M', run: () => openCal(moreBtn()) });
    if (!zoneOn || fit.zone === 'menu') {
      add('navigate', { id: 'zone', label: 'Time zone', icon: 'globe', detail: (clock.zone, zoneCity(activeTimeZone())), run: () => (view.sheet = { kind: 'settings', section: 'world' }) });
    }
    add('app', { id: 'privacy', label: 'Privacy mode', icon: 'eye-off', checked: settings.value.privacy.on, kbd: KBD.privacy, run: togglePrivacy });
    if (updateWaiting()) add('app', { id: 'update', label: `Version ${updates.version} is ready`, icon: 'sparkles', dot: true, run: showUpdate });
    const days = !weekOn || fit.week === 'menu' || !dateOn;
    return GROUPS.map((g) => ({ id: g.id, name: g.name, entries: by.get(g.id) ?? [], days: g.id === 'navigate' && days })).filter((g) => g.entries.length || g.days);
  });
  const footer: MenuEntry = { id: 'customize', label: 'Customize the top bar', icon: 'panel-top', run: () => (view.sheet = { kind: 'settings', section: 'topbar' }) };

  const motion = $derived({ reduced: rm || !ready });

  // --- the month calendar ----------------------------------------------------------------
  // It hangs from whatever opened it: the date, the week's calendar button, or More (when
  // both are folded away). M opens it from the first of those that is in the bar.
  // `calFrom` stays set after closing, so the popover can still hand the focus back to it.
  let calOpen = $state(false);
  let calFrom = $state<HTMLElement | null>(null);
  let whenEl = $state<HTMLButtonElement>();
  let moreEl = $state<HTMLElement>();
  const dateShown = $derived(dateOn && (showRel || showLong || showShort));
  const moreBtn = () => moreEl?.querySelector<HTMLElement>('button.more') ?? moreEl!;
  function openCal(from: HTMLElement) {
    if (calOpen) return void (calOpen = false);
    calFrom = from;
    calOpen = true;
  }
  function closeCal(refocus = false) {
    calOpen = false;
    if (refocus && calFrom?.isConnected) calFrom.focus();
  }
  function pickDay(d: ISODate) {
    view.setDate(d);
    closeCal(true);
  }
  function calAnchor(): HTMLElement {
    if (whenEl && dateShown) return whenEl;
    return weekEl?.querySelector<HTMLElement>('.cal-btn') ?? moreBtn();
  }
  function onKey(e: KeyboardEvent) {
    if (e.key.toLowerCase() !== 'm' || e.metaKey || e.ctrlKey || e.altKey || e.repeat || view.focus) return;
    const t = e.target;
    if (t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.closest('[role="dialog"]'))) return;
    e.preventDefault();
    openCal(calAnchor());
  }
  const flipMs = $derived(rm || !ready ? 0 : 520);
</script>

{#snippet action(d: BarItemDef)}
  {#if d.id === 'private'}
    <button class="private" onclick={togglePrivacy} title={`Privacy mode is on: Daybloom stays out of screenshots and recordings. Click to turn it off · ${KBD.privacy}`} aria-label="Privacy mode is on. Turn it off">
      <Icon name="eye-off" size={14} stroke={2.1} /><span>Private</span>
    </button>
  {:else if d.id === 'session'}
    <SessionPill />
  {:else if d.id === 'tracker'}
    <TrackerPill />
  {:else if d.id === 'ask'}
    <button class="icon-btn" onclick={() => toggleSheet('assistant')} aria-pressed={view.sheet?.kind === 'assistant'} aria-label={`Ask Daybloom (${KBD.ask})`} title={`Ask Daybloom · ${KBD.ask}`}>
      <Icon name="sparkles" size={18} />
    </button>
  {:else if d.id === 'backlog'}
    <BacklogButton />
  {:else if d.id === 'focus'}
    <button class="icon-btn" onclick={openFocus} aria-pressed={view.sheet?.kind === 'focus' || !!timer.active} aria-label="Focus (F)" title="Focus · F">
      <Icon name="focus" size={18} />
    </button>
  {:else if d.id === 'insights'}
    <button class="icon-btn" onclick={() => toggleSheet('insights')} aria-pressed={view.sheet?.kind === 'insights'} aria-label="Your week (I)" title="Your week · I">
      <Icon name="chart" size={18} />
    </button>
  {:else if d.id === 'calendars'}
    <CalendarButton />
  {:else if d.id === 'theme'}
    <ThemeToggle />
  {:else if d.id === 'widget'}
    <button class="icon-btn" onclick={ontogglewidget} aria-pressed={settings.value.widget.visible} aria-label="Desktop widget (W)" title="Desktop widget · W">
      <Icon name="picture" size={18} />
    </button>
  {:else if d.id === 'addons'}
    <button class="icon-btn" onclick={() => toggleSheet('addons')} aria-pressed={view.sheet?.kind === 'addons'} aria-label="Addons" title="Addons">
      <Icon name="puzzle" size={18} />
    </button>
  {:else if d.id === 'settings'}
    <button class="icon-btn" onclick={() => (view.sheet = { kind: 'settings' })} aria-pressed={view.sheet?.kind === 'settings'} aria-label="Settings" title="Settings · ,">
      <Icon name="settings" size={18} />
    </button>
  {:else if d.sheet}
    <button class="icon-btn" onclick={() => openSheet(d.sheet!)} aria-pressed={view.sheet?.kind === d.sheet} aria-label={d.label} title={d.label}>
      <Icon name={d.icon} size={18} />
    </button>
  {/if}
{/snippet}

<svelte:window onkeydown={onKey} />

<header class="bar" class:mac data-tauri-drag-region>
  <div class="row" class:below={fit.week === 'below'} bind:this={rowEl} data-tauri-drag-region>
    <div class="lead" data-tauri-drag-region>
      {#if dateOn}
        <h1 class="day" data-tauri-drag-region>
          <button class="clock tnum" onclick={() => view.goToday()} aria-label={`It's ${formatTime(clock.now, view.hour12)}. Go to today`} title="Now · T" use:measure={'clock'}>{formatTime(clock.now, view.hour12)}</button>
          <!-- The date opens the month. Its padding is taken back by margins, so it measures as
               its words (see fit.ts); with only the clock showing it takes no room at all. -->
          <button
            class="when"
            class:bare={!dateShown}
            class:on={calOpen && calFrom === whenEl}
            bind:this={whenEl}
            onclick={() => whenEl && openCal(whenEl)}
            tabindex={dateShown ? 0 : -1}
            aria-hidden={!dateShown}
            aria-haspopup="dialog"
            aria-expanded={calOpen}
            aria-label={`${title}. Open the month (M)`}
            title="Open the month · M"
          >
            {#if rel}<span class="rel" class:ghost={!showRel} aria-hidden={!showRel} use:measure={'rel'}>{rel}</span>{/if}
            <span class="date" class:solo={!showRel} class:ghost={!showLong} aria-hidden={!showLong} use:measure={'long'}>{title}</span>
            <span class="date" class:solo={!showRel} class:ghost={!showShort} aria-hidden={!showShort} use:measure={'short'}>{shortTitle}</span>
          </button>
        </h1>
      {/if}
      {#if zoneOn && fit.zone && fit.zone !== 'menu'}
        <div class="zone-slot" class:compact={fit.zone === 'compact'} use:measure={fit.zone === 'compact' ? 'zone:compact' : 'zone:full'}>
          <ZonePicker />
        </div>
      {/if}
    </div>

    {#if weekOn && weekIn}
      <div class="week-slot" bind:this={weekEl}>
        <WeekStrip chip={fit.chip} today={fit.weekToday} {measure} {calOpen} oncalendar={openCal} />
      </div>
    {/if}

    <div class="actions" data-tauri-drag-region>
      {#each inBar as d, i (d.id)}
        <div class="it" class:gs={i > 0 && inBar[i - 1].group !== d.group} use:measure={`it:${d.id}`} animate:flip={{ duration: flipMs, easing: springOut }} in:popIn={motion} out:popOut={motion}>
          {@render action(d)}
        </div>
      {/each}
      <div class="it more-it" use:measure={'more'} bind:this={moreEl}>
        <MoreMenu groups={menuGroups} {footer} folded={fit.folded.length} dot={updateWaiting()} {ready} />
      </div>
    </div>
  </div>
</header>

{#if calOpen && calFrom}
  <Popover anchor={calFrom} onclose={() => closeCal()} label="Month" width={324}>
    <MonthCalendar onpick={pickDay} />
  </Popover>
{/if}

<style>
  /* Sizes match BAR in topbar/fit.ts: 16px between the day, the week and the actions; 8px inside
     the day; 2px after each action and 6px more where one group meets the next. */
  /* min-width: 0 — the bar's width is the window's, never its content's (else the measured
     width would follow what it holds, and nothing would ever fold). */
  .bar {
    min-width: 0;
    padding: var(--s-3) var(--s-5) var(--s-2);
    min-height: 60px;
    -webkit-user-select: none;
    user-select: none;
  }
  .row {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr) max-content;
    grid-template-areas: 'lead week actions';
    align-items: center;
    column-gap: var(--s-4);
    row-gap: var(--s-2);
  }
  /* The week on a row of its own, full width (no traffic-light inset down there). */
  .row.below {
    grid-template-columns: minmax(0, 1fr) max-content;
    grid-template-areas: 'lead actions' 'week week';
  }
  .lead {
    grid-area: lead;
    display: flex;
    align-items: center;
    gap: var(--s-2);
    min-width: 0;
    min-height: 34px;
  }
  .bar.mac .lead {
    padding-left: 64px;
  }
  .day {
    position: relative;
    margin: 0;
    display: flex;
    align-items: baseline;
    gap: var(--s-2);
    font-family: var(--font-ui);
    font-size: var(--t-lg);
    font-weight: 500;
    letter-spacing: -0.01em;
    white-space: nowrap;
  }
  .day > * {
    flex: none;
  }
  .clock {
    padding: 2px 9px;
    border-radius: var(--r-pill);
    background: var(--ink);
    color: var(--ink-inverse);
    font: inherit;
    font-weight: 500;
    letter-spacing: 0.01em;
    transition: transform var(--dur-1) var(--ease-out);
  }
  .clock:hover {
    transform: scale(1.04);
  }
  .clock:active {
    transform: scale(0.97);
  }
  .rel {
    color: var(--ink);
  }
  .date:not(.solo) {
    color: var(--ink-3);
    font-weight: 400;
    font-size: var(--t-md);
  }
  /* A variant not in use: laid out off to the side so it can still be measured. */
  .ghost {
    position: absolute;
    left: 0;
    top: 0;
    visibility: hidden;
    pointer-events: none;
  }
  .when {
    display: inline-flex;
    align-items: baseline;
    gap: var(--s-2);
    padding: 1px 8px;
    margin: -1px -8px;
    border-radius: var(--r-pill);
    font: inherit;
    letter-spacing: inherit;
    white-space: nowrap;
    transition:
      background var(--dur-1) var(--ease-out),
      transform var(--dur-1) var(--ease-out);
  }
  .when:hover,
  .when.on {
    background: var(--sunken);
  }
  .when:active {
    transform: scale(0.98);
  }
  .when.bare {
    padding: 0;
    margin: 0 0 0 calc(-1 * var(--s-2));
    pointer-events: none;
  }
  .when > :not(.ghost) {
    animation: text-in 320ms var(--ease-out);
  }
  @keyframes text-in {
    from {
      opacity: 0;
      transform: translateX(-4px);
    }
  }
  .zone-slot {
    flex: none;
    white-space: nowrap;
  }
  /* The zone chip down to its globe (and the offset when you're away). */
  .zone-slot.compact :global(.chip > span:not(.off)) {
    display: none;
  }
  .week-slot {
    grid-area: week;
    justify-self: center;
    min-width: 0;
  }
  .actions {
    grid-area: actions;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: flex-end;
  }
  .it {
    flex: none;
    display: flex;
    align-items: center;
    white-space: nowrap;
    margin-right: 2px;
  }
  .it:empty {
    display: none;
  }
  .it.gs {
    margin-left: 6px;
  }
  .it.more-it {
    margin-right: 0;
  }
  .it :global(.icon-btn) {
    position: relative;
  }
  .private {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 28px;
    padding: 0 10px;
    margin-right: 4px;
    border-radius: var(--r-pill);
    font-size: var(--t-xs);
    font-weight: 500;
    color: var(--ink);
    background: var(--sunken);
    box-shadow: inset 0 0 0 1px var(--line-strong);
    transition: background var(--dur-1) var(--ease-out);
  }
  .private:hover {
    background: color-mix(in srgb, var(--ink) 8%, var(--sunken));
  }
  @media (max-width: 560px) {
    .bar {
      padding-left: var(--s-4);
      padding-right: var(--s-4);
    }
  }
  :global([data-motion='calm']) .when > * {
    animation: none;
  }
</style>
