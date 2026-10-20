<script lang="ts">
  import { tick } from 'svelte';
  import { slide } from 'svelte/transition';
  import { celebrateBadges, removeBlock, suggest, toBacklog, toggleDone } from '../lib/actions';
  import { blockKey, parseBlockKey } from '../lib/engine/blocks';
  import { CATEGORIES, categoryColor } from '../lib/engine/categories';
  import { describeRecurrence } from '../lib/engine/recurrence';
  import { addDays, formatDuration, formatMinutes, formatTime, MINUTE, weekday } from '../lib/engine/time';
  import type { Recurrence, Task } from '../lib/engine/types';
  import Icon from '../lib/Icon.svelte';
  import { ICON_GROUPS } from '../lib/icons.generated';
  import { sounds } from '../lib/sound';
  import { tasks, uid } from '../lib/stores/tasks.svelte';
  import { view } from '../lib/stores/view.svelte';
  import Panel from './Panel.svelte';
  import DateField from './pickers/DateField.svelte';
  import EventDetails from './calendars/EventDetails.svelte';
  import TimeField from './pickers/TimeField.svelte';
  import AddonBlockFields from './addons/AddonBlockFields.svelte';
  import MakeSmaller from './addons/smaller/MakeSmaller.svelte';
  import CrumbFields from './addons/crumbs/CrumbFields.svelte';
  import { realityHint } from '../lib/addons/reality/reality.svelte';
  import { isOn } from '../lib/addons/registry';

  const sheetKey = $derived(view.sheet?.kind === 'edit' ? view.sheet.key : null);
  // Opened from the backlog's "Too big?" tool: the step breaker starts open.
  let smallerOpen = $state(false);
  $effect(() => {
    smallerOpen = view.sheet?.kind === 'edit' && !!view.sheet.smaller;
  });
  const target = $derived.by(() => {
    if (!sheetKey) return null;
    if (sheetKey.startsWith('later:')) {
      const t = tasks.get(sheetKey.slice(6));
      return t ? { task: t, date: null as string | null } : null;
    }
    const p = parseBlockKey(sheetKey);
    if (!p) return null;
    const t = tasks.get(p.taskId);
    return t ? { task: t, date: p.date as string | null } : null;
  });
  const event = $derived(sheetKey?.startsWith('cal:') ? view.blockByKey(sheetKey) : null);

  const task = $derived(target?.task ?? null);
  const occDate = $derived(target?.date ?? null);
  const override = $derived(task && occDate ? (task.overrides[occDate] ?? {}) : {});
  const start = $derived(task ? (override.start !== undefined ? override.start : task.start) : null);
  const duration = $derived(task ? (override.duration ?? task.duration) : 30);
  const color = $derived(task ? categoryColor(task.category, view.finish.dark) : undefined);
  const done = $derived(!!task && !!occDate && task.completions.includes(occDate));
  // Reality check addon: "usually ~45m" for tasks like this one.
  let usedHint = $state('');
  const hint = $derived(isOn('reality') && task && !done && task.title.trim() && usedHint !== task.id ? realityHint({ title: task.title, category: task.category, minutes: duration }) : null);

  let iconOpen = $state(false);
  let iconTouched = $state(false);
  let scope = $state<'all' | 'one'>('all');
  let titleEl: HTMLInputElement | undefined = $state();
  let lastKey: string | null = null;

  // New (untitled) blocks open with the cursor in the title.
  $effect(() => {
    if (sheetKey !== lastKey) {
      lastKey = sheetKey;
      iconOpen = false;
      scope = 'all';
      iconTouched = !!task?.title;
      if (task && !task.title) tick().then(() => titleEl?.focus());
    }
  });

  function close() {
    // A sweep that never got a name was a doodle — let it go quietly.
    if (task && !task.title.trim() && !task.notes.trim() && task.subtasks.length === 0) tasks.remove(task.id);
    const fromBacklog = sheetKey?.startsWith('later:') && task?.date === null;
    view.sheet = fromBacklog ? { kind: 'backlog' } : null;
    view.selected = null;
  }

  function setTitle(v: string) {
    if (!task) return;
    tasks.update(task.id, { title: v });
    if (!iconTouched) {
      const s = suggest(v);
      if (s) tasks.update(task.id, { icon: s.icon, category: s.category });
    }
  }

  function setTime(next: { start?: number | null; duration?: number }) {
    if (!task) return;
    if (task.recurrence && occDate && scope === 'one') tasks.editOccurrence(task.id, occDate, next);
    else tasks.update(task.id, next);
  }

  function onStartInput(v: string) {
    if (!v) return;
    const [h, m] = v.split(':').map(Number);
    setTime({ start: h * 60 + m });
  }

  function onDateInput(v: string) {
    if (!task || !v) return;
    tasks.update(task.id, { date: v });
    if (sheetKey && !sheetKey.startsWith('later:')) {
      const key = blockKey(task.id, v);
      view.selected = key;
      view.sheet = { kind: 'edit', key };
      view.date = v;
    }
  }

  const DURATIONS = [5, 15, 30, 45, 60, 90, 120];

  // Repeat presets
  type RepeatKind = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'custom';
  const repeatKind = $derived.by((): RepeatKind => {
    const r = task?.recurrence;
    if (!r) return 'none';
    if (r.freq === 'daily' && r.interval === 1 && !r.count && !r.until) return 'daily';
    if (r.freq === 'weekly' && r.interval === 1 && r.byWeekday?.slice().sort().join() === '1,2,3,4,5' && !r.count && !r.until) return 'weekdays';
    if (r.freq === 'weekly' && r.interval === 1 && (!r.byWeekday || r.byWeekday.length <= 1) && !r.count && !r.until) return 'weekly';
    if (r.freq === 'monthly' && r.interval === 1 && !r.count && !r.until) return 'monthly';
    return 'custom';
  });
  let customOpen = $state(false);

  function setRepeat(kind: RepeatKind) {
    if (!task) return;
    const anchor = task.date ?? view.today;
    const map: Record<RepeatKind, Recurrence | null> = {
      none: null,
      daily: { freq: 'daily', interval: 1 },
      weekdays: { freq: 'weekly', interval: 1, byWeekday: [1, 2, 3, 4, 5] },
      weekly: { freq: 'weekly', interval: 1, byWeekday: [weekday(anchor)] },
      monthly: { freq: 'monthly', interval: 1 },
      custom: task.recurrence ?? { freq: 'weekly', interval: 1, byWeekday: [weekday(anchor)] },
    };
    // Starting a series from an occurrence anchors it on that day.
    tasks.update(task.id, { recurrence: map[kind], date: task.date ?? anchor });
    customOpen = kind === 'custom';
  }

  function patchRule(p: Partial<Recurrence>) {
    if (!task?.recurrence) return;
    tasks.update(task.id, { recurrence: { ...task.recurrence, ...p } });
  }

  function toggleWeekday(d: number) {
    const r = task?.recurrence;
    if (!r) return;
    const cur = r.byWeekday?.length ? r.byWeekday : [weekday(task!.date ?? view.today)];
    const next = cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d];
    if (next.length) patchRule({ byWeekday: next.sort() });
  }

  let newStep = $state('');
  function addStep(e: SubmitEvent) {
    e.preventDefault();
    if (!task || !newStep.trim()) return;
    task.subtasks.push({ id: uid(), title: newStep.trim(), done: false });
    newStep = '';
  }
  function toggleStep(id: string) {
    if (!task) return;
    tasks.toggleSubtask(task.id, id);
    sounds.tick();
    celebrateBadges();
  }

  function toggleAlert(m: number) {
    if (!task) return;
    const a = task.alerts.includes(m) ? task.alerts.filter((x) => x !== m) : [...task.alerts, m].sort((x, y) => x - y);
    tasks.update(task.id, { alerts: a });
  }

  const startStr = $derived(start == null ? '' : `${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}`);
  const WD = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
</script>

{#if task}
  <Panel title={task.date === null ? 'Later' : task.recurrence ? 'Repeating block' : 'Block'} onclose={close} accent={color}>
    <div class="title-row">
      <button
        class="icon-pick"
        style:--c={color}
        onclick={() => (iconOpen = !iconOpen)}
        aria-expanded={iconOpen}
        aria-label="Choose icon"
      >
        {#key task.icon}
          <span class="pop-in"><Icon name={task.icon} size={22} stroke={2} /></span>
        {/key}
      </button>
      <input
        bind:this={titleEl}
        class="title-input"
        value={task.title}
        oninput={(e) => setTitle(e.currentTarget.value)}
        onkeydown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
        placeholder="What's this block for?"
        aria-label="Title"
      />
    </div>

    {#if iconOpen}
      <div class="icons" transition:slide={{ duration: 200 }}>
        {#each Object.entries(ICON_GROUPS) as [group, names] (group)}
          <div class="icon-group">
            <span class="group-label">{group}</span>
            <div class="icon-grid">
              {#each names as n (n)}
                <button
                  class="icon-cell"
                  class:on={task.icon === n}
                  style:--c={color}
                  onclick={() => {
                    tasks.update(task.id, { icon: n });
                    iconTouched = true;
                    iconOpen = false;
                  }}
                  aria-label={n}
                >
                  <Icon name={n} size={18} />
                </button>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    {/if}

    <div class="cats" role="radiogroup" aria-label="Kind">
      {#each CATEGORIES as c (c.id)}
        {@const col = view.finish.dark ? c.dark : c.light}
        <button
          class="cat"
          class:on={task.category === c.id}
          style:--c={col}
          role="radio"
          aria-checked={task.category === c.id}
          onclick={() => {
            tasks.update(task.id, { category: c.id });
            iconTouched = true;
          }}
        >
          <i></i>{c.label}
        </button>
      {/each}
    </div>

    <section class="group">
      <div class="when">
        <div class="mini">
          <span>Day</span>
          <DateField label="Day" value={task.date ?? ''} onchange={onDateInput} busy placeholder="Pick a day" />
        </div>
        <div class="mini">
          <span>Starts</span>
          <TimeField label="Start" value={startStr} disabled={start == null} onchange={onStartInput} date={task.date} length={duration} exclude={sheetKey} accent={color} placeholder="Anytime" />
        </div>
        <label class="anytime">
          <input type="checkbox" checked={start == null} onchange={(e) => setTime({ start: e.currentTarget.checked ? null : 9 * 60 })} />
          Anytime
        </label>
      </div>
      {#if task.date === null}
        <p class="note">In the Later tray. Pick a day to put it on the dial.</p>
      {/if}

      {#if start != null}
        <div class="durations" role="group" aria-label="Duration">
          {#each DURATIONS as d (d)}
            <button class="chip tnum" class:on={duration === d} onclick={() => setTime({ duration: d })}>{formatDuration(d * MINUTE)}</button>
          {/each}
          <span class="stepper">
            <button class="icon-btn" onclick={() => setTime({ duration: Math.max(5, duration - 5) })} aria-label="5 minutes shorter">−</button>
            <span class="tnum">{formatDuration(duration * MINUTE)}</span>
            <button class="icon-btn" onclick={() => setTime({ duration: duration + 5 })} aria-label="5 minutes longer">+</button>
          </span>
        </div>
        <p class="ends tnum">
          {formatMinutes(start, view.hour12)} → {formatMinutes((start + duration) % 1440, view.hour12)}
        </p>
        {#if hint}
          <div class="usually" transition:slide={{ duration: view.reducedMotion ? 0 : 200 }}>
            <Icon name="hourglass" size={13} />
            <span>{hint.est.scope === 'title' ? 'This usually takes' : `${hint.est.label} blocks usually take`} <b class="tnum">~{formatDuration(hint.minutes * MINUTE)}</b></span>
            <button class="chip" onclick={() => (setTime({ duration: hint.minutes }), (usedHint = task.id))}>Use {formatDuration(hint.minutes * MINUTE)}</button>
          </div>
        {/if}
        {#if task.recurrence && occDate}
          <div class="scope">
            <span>Time changes apply to</span>
            <div class="segmented">
              <button aria-pressed={scope === 'all'} onclick={() => (scope = 'all')}>Every time</button>
              <button aria-pressed={scope === 'one'} onclick={() => (scope = 'one')}>Just this day</button>
            </div>
          </div>
        {/if}
      {/if}
    </section>

    <section class="group">
      <h3><Icon name="repeat" size={14} /> Repeat</h3>
      <div class="repeat">
        {#each [['none', 'Once'], ['daily', 'Daily'], ['weekdays', 'Weekdays'], ['weekly', 'Weekly'], ['monthly', 'Monthly'], ['custom', 'Custom']] as [k, l] (k)}
          <button class="chip" class:on={repeatKind === k} onclick={() => setRepeat(k as RepeatKind)}>{l}</button>
        {/each}
      </div>
      {#if task.recurrence && (repeatKind === 'custom' || customOpen)}
        {@const r = task.recurrence}
        <div class="custom" transition:slide={{ duration: 200 }}>
          <div class="every">
            Every
            <input class="field num tnum" type="number" min="1" max="99" value={r.interval} onchange={(e) => patchRule({ interval: Math.max(1, +e.currentTarget.value || 1) })} />
            <select class="field" value={r.freq} onchange={(e) => patchRule({ freq: e.currentTarget.value as Recurrence['freq'] })}>
              <option value="daily">{r.interval > 1 ? 'days' : 'day'}</option>
              <option value="weekly">{r.interval > 1 ? 'weeks' : 'week'}</option>
              <option value="monthly">{r.interval > 1 ? 'months' : 'month'}</option>
              <option value="yearly">{r.interval > 1 ? 'years' : 'year'}</option>
            </select>
          </div>
          {#if r.freq === 'weekly'}
            <div class="weekdays" role="group" aria-label="On days">
              {#each [1, 2, 3, 4, 5, 6, 0] as d (d)}
                {@const on = (r.byWeekday?.length ? r.byWeekday : [weekday(task.date ?? view.today)]).includes(d)}
                <button class="wd" class:on onclick={() => toggleWeekday(d)} aria-pressed={on}>{WD[d]}</button>
              {/each}
            </div>
          {/if}
          <div class="ends-rule">
            <span>Ends</span>
            <div class="segmented">
              <button aria-pressed={!r.until && !r.count} onclick={() => patchRule({ until: undefined, count: undefined })}>Never</button>
              <button aria-pressed={!!r.until} onclick={() => patchRule({ until: addDays(task.date ?? view.today, 30), count: undefined })}>On a date</button>
              <button aria-pressed={!!r.count} onclick={() => patchRule({ count: 10, until: undefined })}>After</button>
            </div>
            {#if r.until}
              <DateField label="Repeat until" value={r.until} onchange={(v) => v && patchRule({ until: v })} min={task.date} quick={false} />
            {:else if r.count}
              <input type="number" class="field num tnum" min="1" value={r.count} onchange={(e) => patchRule({ count: Math.max(1, +e.currentTarget.value || 1) })} /> times
            {/if}
          </div>
        </div>
      {/if}
      {#if task.recurrence}
        <p class="note">{describeRecurrence(task.recurrence, task.date)}</p>
      {/if}
    </section>

    <section class="group">
      <h3><Icon name="list" size={14} /> Steps</h3>
      <ul class="steps">
        {#each task.subtasks as s (s.id)}
          <li class:done={s.done}>
            <button class="step-check" onclick={() => toggleStep(s.id)} aria-pressed={s.done} aria-label={s.done ? 'Undo step' : 'Finish step'} style:--c={color}>
              {#if s.done}<Icon name="check" size={12} stroke={3} />{/if}
            </button>
            <input class="step-title" bind:value={s.title} aria-label="Step" />
            <button class="icon-btn rm" onclick={() => (task.subtasks = task.subtasks.filter((x) => x.id !== s.id))} aria-label="Remove step"><Icon name="x" size={14} /></button>
          </li>
        {/each}
      </ul>
      <form onsubmit={addStep}>
        <input class="field step-add" bind:value={newStep} placeholder="Break it into a small first step…" aria-label="Add a step" />
      </form>
      {#if isOn('smaller') && task.title.trim()}
        <div class="smaller">
          <MakeSmaller {task} blockKey={sheetKey && !sheetKey.startsWith('later:') ? sheetKey : null} minutes={duration} bind:open={smallerOpen} />
        </div>
      {/if}
    </section>

    <section class="group">
      <h3><Icon name="bell" size={14} /> Nudge before it starts</h3>
      <div class="repeat">
        {#each [0, 5, 10, 15, 30] as m (m)}
          <button class="chip" class:on={task.alerts.includes(m)} onclick={() => toggleAlert(m)}>{m === 0 ? 'At start' : `${m}m before`}</button>
        {/each}
      </div>
    </section>

    <AddonBlockFields taskId={task.id} blockKey={sheetKey && !sheetKey.startsWith('later:') ? sheetKey : null} minutes={duration} {done} />
    {#if isOn('crumbs')}<CrumbFields taskId={task.id} />{/if}

    <section class="group">
      <textarea class="field notes" placeholder="Notes, links, how you'll know it's done…" bind:value={task.notes} rows="3" aria-label="Notes"></textarea>
    </section>

    {#snippet footer()}
      {#if occDate && sheetKey && !sheetKey.startsWith('later:')}
        <button class="btn btn-quiet" class:is-done={done} onclick={() => sheetKey && toggleDone(sheetKey)}>
          <Icon name="check" size={16} stroke={2.2} /> {done ? 'Done' : 'Mark done'}
        </button>
      {/if}
      {#if occDate && sheetKey && !sheetKey.startsWith('later:') && !done}
        <button class="btn btn-quiet" onclick={() => sheetKey && toBacklog(sheetKey)} title="Take it off the day and keep it in the backlog">
          <Icon name="inbox" size={16} /> To backlog
        </button>
      {/if}
      <span class="spacer"></span>
      {#if task.recurrence && sheetKey && !sheetKey.startsWith('later:')}
        <button class="btn btn-danger" onclick={() => sheetKey && removeBlock(sheetKey)}>Skip today</button>
        <button class="btn btn-danger" onclick={() => sheetKey && removeBlock(sheetKey, true)}>Delete all</button>
      {:else}
        <button class="btn btn-danger" onclick={() => { if (sheetKey?.startsWith('later:')) { tasks.remove(task.id); view.sheet = null; } else if (sheetKey) removeBlock(sheetKey); }}>Delete</button>
      {/if}
      <button class="btn btn-primary" onclick={close}>Close</button>
    {/snippet}
  </Panel>
{:else if event}
  {#if event.event?.provider === 'salah'}
    <Panel title="Salah" onclose={() => (view.sheet = null)} accent={event.color}>
      <p class="event-title">{event.title}</p>
      <p class="note tnum">{formatTime(event.startMs, view.hour12)} – {formatTime(event.endMs, view.hour12)}{event.event.calendarName && event.event.calendarName !== 'Salah' ? ` · ${event.event.calendarName}` : ''}</p>
      <p class="note">Time kept free for salah. Times, jamaat and how much time to keep are set in Waqt.</p>
      <button class="btn btn-soft" onclick={() => (view.sheet = { kind: 'waqt' })}><Icon name="moon" size={14} /> Open Waqt</button>
    </Panel>
  {:else}
    <Panel title="From your calendar" onclose={() => (view.sheet = null)} accent={event.color}>
      <EventDetails block={event} />
    </Panel>
  {/if}
{/if}

<style>
  .title-row {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    margin-bottom: var(--s-3);
  }
  .icon-pick {
    flex: none;
    width: 46px;
    height: 46px;
    border-radius: 15px;
    display: grid;
    place-items: center;
    background: var(--c);
    color: white;
    transition:
      transform var(--dur-2) var(--ease-settle),
      background var(--dur-3) var(--ease-out);
  }
  .pop-in {
    display: grid;
    animation: pop-in 0.42s var(--ease-out);
  }
  @keyframes pop-in {
    0% {
      transform: scale(0.3) rotate(-30deg);
      opacity: 0;
    }
    60% {
      transform: scale(1.18) rotate(6deg);
      opacity: 1;
    }
    100% {
      transform: none;
    }
  }
  .icon-pick:hover {
    transform: rotate(-6deg) scale(1.05);
  }
  .title-input {
    flex: 1;
    min-width: 0;
    border: 0;
    background: transparent;
    font-family: var(--font-read);
    font-size: var(--t-xl);
    font-weight: 500;
    letter-spacing: -0.01em;
    padding: 4px 0;
    outline: none;
    border-bottom: 2px solid transparent;
    transition: border-color var(--dur-2) var(--ease-out);
  }
  .title-input:focus {
    border-bottom-color: var(--line-strong);
  }
  .icons {
    display: grid;
    gap: var(--s-3);
    padding: var(--s-3);
    margin-bottom: var(--s-3);
    border-radius: var(--r-md);
    background: var(--surface);
    max-height: 260px;
    overflow-y: auto;
  }
  .group-label {
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .icon-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(36px, 1fr));
    gap: 4px;
    margin-top: 4px;
  }
  .icon-cell {
    aspect-ratio: 1;
    border-radius: 10px;
    display: grid;
    place-items: center;
    color: var(--ink-2);
  }
  .icon-cell:hover {
    background: var(--sunken);
    color: var(--ink);
  }
  .icon-cell.on {
    background: var(--c);
    color: white;
  }
  .cats {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: var(--s-4);
  }
  .cat {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 10px 0 8px;
    border-radius: var(--r-pill);
    font-size: var(--t-xs);
    font-family: var(--font-ui);
    color: var(--ink-2);
    border: 1px solid var(--line);
    transition: all var(--dur-2) var(--ease-out);
  }
  .cat i {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--c);
  }
  .cat:hover {
    border-color: var(--c);
  }
  .cat.on {
    background: color-mix(in srgb, var(--c) 16%, transparent);
    border-color: var(--c);
    color: var(--ink);
  }
  .cat i {
    transition: transform var(--dur-2) var(--ease-out);
  }
  .cat.on i {
    animation: dot-pop 0.4s var(--ease-out);
  }
  @keyframes dot-pop {
    50% {
      transform: scale(1.7);
    }
  }
  .group {
    padding: var(--s-4) 0;
    border-top: 1px solid var(--line);
  }
  h3 {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0 0 var(--s-3);
    font-family: var(--font-ui);
    font-size: var(--t-sm);
    font-weight: 500;
    color: var(--ink-2);
  }
  .when {
    display: grid;
    grid-template-columns: 1fr 1fr auto;
    gap: var(--s-2);
    align-items: end;
  }
  .mini {
    display: grid;
    gap: 4px;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .mini :global(.field) {
    height: 36px;
    font-size: var(--t-sm);
    color: var(--ink);
  }
  .anytime {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 36px;
    font-size: var(--t-sm);
    color: var(--ink-2);
  }
  .usually {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: var(--s-2);
    padding: 6px 6px 6px 10px;
    border-radius: var(--r-pill);
    font-size: var(--t-xs);
    color: var(--ink-2);
    background: color-mix(in srgb, #8670e6 9%, transparent);
  }
  .usually span {
    flex: 1;
  }
  .usually b {
    font-weight: 600;
    color: var(--ink);
  }
  .usually .chip {
    height: 24px;
  }
  .smaller {
    margin-top: var(--s-3);
  }
  .durations,
  .repeat {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: var(--s-3);
  }
  .repeat {
    margin-top: 0;
  }
  .chip {
    height: 30px;
    padding: 0 11px;
    border-radius: var(--r-pill);
    border: 1px solid var(--line-strong);
    font-size: var(--t-xs);
    font-family: var(--font-ui);
    color: var(--ink-2);
    transition:
      background var(--dur-1) var(--ease-out),
      color var(--dur-1) var(--ease-out),
      border-color var(--dur-1) var(--ease-out);
  }
  .chip:hover {
    border-color: var(--ink-3);
    color: var(--ink);
  }
  .chip.on {
    background: var(--ink);
    border-color: var(--ink);
    color: var(--ink-inverse);
  }
  .stepper {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    margin-left: auto;
    font-size: var(--t-sm);
  }
  .stepper .icon-btn {
    width: 28px;
    height: 28px;
    font-size: 16px;
  }
  .ends {
    margin: var(--s-2) 0 0;
    font-size: var(--t-sm);
    color: var(--ink-2);
  }
  .scope,
  .ends-rule {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--s-2);
    margin-top: var(--s-3);
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .custom {
    margin-top: var(--s-3);
    padding: var(--s-3);
    border-radius: var(--r-md);
    background: var(--surface);
    display: grid;
    gap: var(--s-2);
  }
  .every {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    font-size: var(--t-sm);
  }
  .field.num {
    width: 64px;
    height: 32px;
  }
  .every select {
    width: auto;
    height: 32px;
  }
  .ends-rule .field {
    width: auto;
    height: 32px;
  }
  .weekdays {
    display: flex;
    gap: 4px;
  }
  .wd {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    font-size: var(--t-xs);
    font-family: var(--font-ui);
    border: 1px solid var(--line-strong);
    color: var(--ink-2);
  }
  .wd.on {
    background: var(--ink);
    color: var(--ink-inverse);
    border-color: var(--ink);
  }
  .note {
    margin: var(--s-2) 0 0;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .steps {
    list-style: none;
    margin: 0 0 var(--s-2);
    padding: 0;
    display: grid;
    gap: 2px;
  }
  .steps li {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    min-height: 34px;
  }
  .step-check {
    flex: none;
    width: 20px;
    height: 20px;
    border-radius: 6px;
    border: 2px solid color-mix(in srgb, var(--c) 70%, var(--line-strong));
    display: grid;
    place-items: center;
    color: white;
    transition: background var(--dur-2) var(--ease-out);
  }
  .steps li.done .step-check {
    background: var(--c);
  }
  .step-title {
    flex: 1;
    min-width: 0;
    border: 0;
    background: transparent;
    font-size: var(--t-sm);
    padding: 4px 0;
    outline: none;
  }
  .steps li.done .step-title {
    color: var(--ink-3);
    text-decoration: line-through;
  }
  .rm {
    width: 26px;
    height: 26px;
    opacity: 0;
  }
  .steps li:hover .rm {
    opacity: 1;
  }
  .step-add {
    height: 34px;
    font-size: var(--t-sm);
  }
  .notes {
    height: auto;
    padding: var(--s-2) var(--s-3);
    resize: vertical;
    font-size: var(--t-sm);
    line-height: 1.5;
  }
  .spacer {
    flex: 1;
  }
  .btn.is-done {
    color: var(--lume);
  }
  .event-title {
    margin: 0;
    font-size: var(--t-xl);
    font-weight: 500;
  }
</style>
