<script lang="ts">
  // The Time Tracker: a live stopwatch for what you're working on, today's entries (edit
  // any time by tapping it), the week at a glance, app activity (opt-in) and exports.
  import { cubicOut } from 'svelte/easing';
  import { fly, slide } from 'svelte/transition';
  import { clockText, targetColor, targetSub, targetTitle } from '../../../lib/addons/labels';
  import { isOn } from '../../../lib/addons/registry';
  import { activityCapabilities, activitySummary, entriesCsv, weekSummary, type Entry, type StartInput } from '../../../lib/addons/tracker';
  import { tracker } from '../../../lib/addons/tracker/tracker.svelte';
  import { work } from '../../../lib/addons/work/work.svelte';
  import { atMinutes, formatDuration, formatTime, fromISODate, minutesOfDay, MINUTE, todayISO } from '../../../lib/engine/time';
  import Icon from '../../../lib/Icon.svelte';
  import TimeField from '../../pickers/TimeField.svelte';
  import { platform } from '../../../lib/platform';
  import { clock } from '../../../lib/stores/clock.svelte';
  import { view } from '../../../lib/stores/view.svelte';
  import Panel from '../../Panel.svelte';
  import Segmented from '../../Segmented.svelte';
  import Columns from '../charts/Columns.svelte';
  import RankBars from '../charts/RankBars.svelte';
  import StatTile from '../charts/StatTile.svelte';

  const sheet = $derived(view.sheet?.kind === 'tracker' ? view.sheet : null);
  let tab = $state<'today' | 'week' | 'activity' | 'settings'>('today');
  $effect(() => {
    if (sheet?.tab === 'week' || sheet?.tab === 'activity' || sheet?.tab === 'settings' || sheet?.tab === 'today') tab = sheet.tab;
  });
  $effect(() => {
    if (sheet && !tracker.ready) void tracker.load();
  });

  const running = $derived(tracker.running);
  const caps = activityCapabilities();
  const hm = (ms: number) => formatDuration(Math.round(ms / MINUTE) * MINUTE);

  // ---- targets to start
  interface Pick extends StartInput {
    id: string;
    label: string;
    meta: string;
    color: string;
  }
  const picks = $derived.by(() => {
    const out: Pick[] = [];
    const cur = view.now.current;
    const nxt = view.now.next;
    for (const [b, meta] of [[cur, 'Now'], [nxt, 'Next']] as const) {
      if (b && b.kind === 'task' && !b.done) out.push({ id: b.key, blockKey: b.key, taskId: b.taskId, label: b.title || 'Untitled block', meta, color: b.color });
    }
    for (const b of view.todayBlocks) {
      if (out.length >= 5) break;
      if (b.kind !== 'task' || b.done || out.some((o) => o.id === b.key)) continue;
      out.push({ id: b.key, blockKey: b.key, taskId: b.taskId, label: b.title || 'Untitled block', meta: formatTime(b.startMs, view.hour12), color: b.color });
    }
    if (isOn('work')) for (const p of work.projects.filter((x) => !x.archived).slice(0, 3)) out.push({ id: `p:${p.id}`, projectId: p.id, label: p.name, meta: 'Project', color: '#25976A' });
    return out;
  });
  let pickId = $state<string | null>(null);
  let note = $state('');
  const pick = $derived(picks.find((p) => p.id === pickId) ?? picks[0] ?? null);

  function start() {
    const t = pick;
    tracker.start(t ? { blockKey: t.blockKey, taskId: t.taskId, projectId: t.projectId, note: note.trim() || undefined } : { note: note.trim() || undefined });
    note = '';
  }

  // ---- today
  const today = $derived(tracker.entries.filter((e) => fromDay(e) === todayISO()).sort((a, b) => b.startMs - a.startMs));
  function fromDay(e: Entry) {
    return isoDay(e.startMs);
  }
  function isoDay(ms: number) {
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  const todayMs = $derived(today.reduce((s, e) => s + ((e.endMs ?? clock.now) - e.startMs), 0));
  const goalMin = $derived(tracker.settings.dailyGoalMinutes);

  // inline edit
  let editId = $state<string | null>(null);
  let edS = $state('');
  let edE = $state('');
  let edErr = $state('');
  const hhmm = (ms: number) => {
    const m = Math.floor(minutesOfDay(ms));
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  };
  const toMs = (date: string, v: string) => {
    const [h, m] = v.split(':').map(Number);
    return atMinutes(date, h * 60 + (m || 0));
  };
  function edit(e: Entry) {
    editId = e.id;
    edS = hhmm(e.startMs);
    edE = e.endMs ? hhmm(e.endMs) : '';
    edErr = '';
  }
  function saveEdit(e: Entry) {
    const d = isoDay(e.startMs);
    const r = tracker.update(e.id, { startMs: toMs(d, edS), ...(e.endMs && edE ? { endMs: toMs(d, edE) } : {}) });
    if (!r.ok) edErr = r.error === 'overlap' ? 'That overlaps another entry.' : r.error === 'invalid-range' ? 'The end must be after the start.' : 'Could not save.';
    else editId = null;
  }

  // manual add
  let adding = $state(false);
  let addPick = $state<string>('');
  let addS = $state('09:00');
  let addE = $state('10:00');
  let addNote = $state('');
  let addErr = $state('');
  function openAdd() {
    adding = true;
    addPick = picks[0]?.id ?? '';
    const now = Math.floor(minutesOfDay(clock.now) / 5) * 5;
    const s = Math.max(0, now - 60);
    addS = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    addE = `${String(Math.floor(now / 60)).padStart(2, '0')}:${String(now % 60).padStart(2, '0')}`;
    addNote = '';
    addErr = '';
  }
  function saveAdd(ev: SubmitEvent) {
    ev.preventDefault();
    const p = picks.find((x) => x.id === addPick);
    const r = tracker.addManual({ blockKey: p?.blockKey, taskId: p?.taskId, projectId: p?.projectId, note: addNote.trim() || undefined, startMs: toMs(todayISO(), addS), endMs: toMs(todayISO(), addE), source: 'manual' });
    if (!r.ok) addErr = r.error === 'overlap' ? 'That overlaps time you already tracked.' : r.error === 'invalid-range' ? 'The end must be after the start.' : 'Could not add it.';
    else adding = false;
  }

  // ---- week
  const week = $derived(weekSummary(tracker.entries, clock.minute, { goalMinutes: goalMin }));
  const weekCols = $derived(
    week.days.map((d) => {
      const dt = fromISODate(d.date);
      return { key: d.date, label: dt.toLocaleDateString(undefined, { weekday: 'narrow' }), value: d.ms / 3_600_000, tip: dt.toLocaleDateString(undefined, { weekday: 'long' }), muted: d.date > todayISO() };
    }),
  );
  const byTask = $derived(
    week.byBlock.length
      ? week.byBlock
          .filter((t) => t.ms > 0)
          .slice(0, 8)
          .map((t) => {
            const e = tracker.entries.find((x) => (x.blockKey ?? null) === t.id);
            return { key: t.id ?? 'none', label: e ? targetTitle(e) : 'Without a block', value: t.ms, color: e ? targetColor(e) : '#9AA4B8' };
          })
      : [],
  );
  const apps = $derived(activitySummary(tab === 'activity' ? tracker.entries.filter((e) => e.startMs >= Date.parse(week.from)) : [], { limit: 8 }));

  async function exportCsv() {
    const csv = entriesCsv(tracker.entries.filter((e) => isoDay(e.startMs) >= week.from && isoDay(e.startMs) <= week.to), {
      now: clock.now,
      roundTo: tracker.settings.roundTo,
      taskName: (e) => targetTitle(e),
      projectName: (e) => (e.projectId && isOn('work') ? (work.project(e.projectId)?.name ?? '') : ''),
    });
    const where = await platform.exportFile(`Daybloom timesheet ${week.from} to ${week.to}.csv`, csv, 'reveal');
    view.say(`Saved ${where.split(/[\\/]/).pop()}`);
  }
</script>

{#if sheet}
  <Panel title="Time Tracker" onclose={() => (view.sheet = null)} accent="#3D6FE3" wide>
    <div class="tp">
      <!-- the stopwatch -->
      {#if running}
        <section class="live" style:--c={targetColor(running)} in:fly={{ y: 6, duration: view.reducedMotion ? 0 : 260, easing: cubicOut }}>
          <span class="tag"><i class="dot"></i> Tracking</span>
          <span class="clock tnum">{clockText(tracker.elapsedMs)}</span>
          <span class="what"><b>{targetTitle(running)}</b>{#if targetSub(running)}<small>{targetSub(running)}</small>{/if}</span>
          <span class="since">since {formatTime(running.startMs, view.hour12)}</span>
          <div class="acts">
            <button class="btn btn-primary" onclick={() => tracker.stop()}><Icon name="square" size={13} stroke={2.6} /> Stop</button>
          </div>
        </section>
      {:else}
        <section class="start" in:fly={{ y: 6, duration: view.reducedMotion ? 0 : 260, easing: cubicOut }}>
          <h4>Track</h4>
          {#if picks.length}
            <div class="picks" role="radiogroup" aria-label="What to track">
              {#each picks as p (p.id)}
                <button class="pick" class:on={pick?.id === p.id} style:--c={p.color} role="radio" aria-checked={pick?.id === p.id} onclick={() => (pickId = p.id)}>
                  <i></i><span><b>{p.label}</b><small>{p.meta}</small></span>
                </button>
              {/each}
            </div>
          {/if}
          <div class="go">
            <input class="field" placeholder={picks.length ? 'Add a note (optional)' : 'What are you working on?'} bind:value={note} aria-label="Note" onkeydown={(e) => e.key === 'Enter' && start()} />
            <button class="btn btn-primary" onclick={start}><Icon name="play" size={13} stroke={2.6} /> Start</button>
          </div>
        </section>
      {/if}

      <Segmented
        label="Tracker view"
        value={tab}
        options={[
          { value: 'today', label: 'Today' },
          { value: 'week', label: 'Week' },
          { value: 'activity', label: 'Activity' },
          { value: 'settings', label: 'Settings' },
        ]}
        onchange={(v) => (tab = v as typeof tab)}
      />

      {#if tab === 'today'}
        <section>
          <div class="sumrow">
            <StatTile label="Tracked today" value={hm(todayMs)} hint={goalMin ? `${Math.round((todayMs / (goalMin * MINUTE)) * 100)}% of your ${formatDuration(goalMin * MINUTE)} goal` : ''} />
            <button class="btn btn-soft sm" onclick={openAdd}><Icon name="plus" size={13} /> Add time</button>
          </div>
          {#if goalMin}
            <span class="goal" aria-hidden="true"><i style:transform={`scaleX(${Math.min(1, todayMs / (goalMin * MINUTE))})`}></i></span>
          {/if}
          {#if adding}
            <form class="form" onsubmit={saveAdd} transition:slide={{ duration: view.reducedMotion ? 0 : 200 }}>
              <select class="field" bind:value={addPick} aria-label="For">
                {#each picks as p (p.id)}<option value={p.id}>{p.label}</option>{/each}
                <option value="">Something else</option>
              </select>
              <div class="pair">
                <TimeField label="Start" bind:value={addS} nowChip step={1} /><span>to</span><TimeField label="End" bind:value={addE} nowChip step={1} />
              </div>
              <input class="field" placeholder="Note (optional)" bind:value={addNote} aria-label="Note" />
              {#if addErr}<p class="error">{addErr}</p>{/if}
              <div class="actions"><button type="button" class="btn btn-quiet" onclick={() => (adding = false)}>Cancel</button><button class="btn btn-primary">Add</button></div>
            </form>
          {/if}
          {#if today.length}
            <ul class="entries">
              {#each today as e (e.id)}
                <li style:--c={targetColor(e)} class:live={e.endMs == null}>
                  <i></i>
                  <span class="t"><b>{targetTitle(e)}</b><small>{targetSub(e) || (e.note ?? '')}</small></span>
                  {#if editId === e.id}
                    <span class="ed">
                      <TimeField label="Start" bind:value={edS} compact step={1} />
                      {#if e.endMs}<TimeField label="End" bind:value={edE} compact nowChip step={1} />{/if}
                      <button class="icon-btn" onclick={() => saveEdit(e)} aria-label="Save"><Icon name="check" size={14} stroke={2.4} /></button>
                      <button class="icon-btn" onclick={() => (editId = null)} aria-label="Cancel"><Icon name="x" size={14} /></button>
                    </span>
                  {:else}
                    <button class="range tnum" onclick={() => edit(e)} title="Change the times">{formatTime(e.startMs, view.hour12)}–{e.endMs ? formatTime(e.endMs, view.hour12) : 'now'}</button>
                    <span class="dur tnum">{e.endMs ? hm(e.endMs - e.startMs) : clockText(clock.now - e.startMs)}</span>
                    <button class="icon-btn del" onclick={() => tracker.remove(e.id)} aria-label="Remove entry" title="Remove"><Icon name="trash-ui" size={13} /></button>
                  {/if}
                </li>
                {#if editId === e.id && edErr}<li class="err">{edErr}</li>{/if}
              {/each}
            </ul>
          {:else}
            <p class="empty">Nothing tracked yet today. Start the stopwatch, or start a focus session — it tracks itself.</p>
          {/if}
        </section>
      {:else if tab === 'week'}
        <section>
          <div class="tiles">
            <StatTile label="This week" value={hm(week.ms)} />
            <StatTile label="Daily average" value={hm(week.averageMs)} />
            {#if goalMin}<StatTile label="Days at goal" value={`${week.days.filter((d) => d.goal?.met).length} of 7`} />{/if}
          </div>
          <h4>Hours each day</h4>
          <Columns items={weekCols} color="#3D6FE3" format={(v) => formatDuration(Math.round(v * 60) * MINUTE)} label="Hours tracked each day this week" reduced={view.reducedMotion} />
          <h4>By block</h4>
          <RankBars items={byTask} format={hm} empty="Nothing tracked this week." reduced={view.reducedMotion} />
          <div class="actions start-row">
            <button class="btn btn-soft sm" onclick={exportCsv}><Icon name="download" size={13} /> Export timesheet (CSV)</button>
          </div>
        </section>
      {:else if tab === 'activity'}
        <section>
          {#if !caps.apps}
            <p class="empty">App activity needs the desktop app on macOS or Windows.</p>
          {:else if !tracker.settings.trackApps}
            <div class="opt">
              <Icon name="app-window" size={20} />
              <div>
                <b>See which apps you used while tracking</b>
                <p>Daybloom notes the name of the app in front every 30 seconds, only while the stopwatch runs. It stays on this computer.</p>
                <button class="btn btn-soft sm" onclick={() => tracker.setSettings({ trackApps: true })}>Turn on app activity</button>
              </div>
            </div>
          {:else}
            <h4>Apps this week, while tracking</h4>
            <RankBars items={apps.map((a, i) => ({ key: a.app, label: a.app, value: a.ms, color: ['#3D6FE3', '#25976A', '#B07E06', '#DB4F94', '#8670E6', '#138FA6', '#D65A20', '#9AA4B8'][i % 8] }))} format={hm} empty="No app time yet. It appears after a few minutes of tracking." reduced={view.reducedMotion} />
          {/if}
        </section>
      {:else}
        <section class="settings">
          <div class="row"><span>Ask when I was away for</span>
            <Segmented label="Idle minutes" value={String(tracker.settings.idleMinutes)} options={[3, 5, 10, 15].map((m) => ({ value: String(m), label: `${m}m` }))} onchange={(v) => tracker.setSettings({ idleMinutes: Number(v) })} />
          </div>
          <label class="row"><span>Ask what to do with time away</span><input type="checkbox" class="switch" checked={tracker.settings.askOnIdle} onchange={(e) => tracker.setSettings({ askOnIdle: e.currentTarget.checked })} /></label>
          <label class="row"><span>Focus sessions track themselves</span><input type="checkbox" class="switch" checked={tracker.settings.followFocus} onchange={(e) => tracker.setSettings({ followFocus: e.currentTarget.checked })} /></label>
          <label class="row"><span>Remind me when I forget to track</span><input type="checkbox" class="switch" checked={tracker.settings.remindWhenNotTracking} onchange={(e) => tracker.setSettings({ remindWhenNotTracking: e.currentTarget.checked })} /></label>
          {#if caps.apps}<label class="row"><span>Note the apps I use while tracking</span><input type="checkbox" class="switch" checked={tracker.settings.trackApps} onchange={(e) => tracker.setSettings({ trackApps: e.currentTarget.checked })} /></label>{/if}
          {#if caps.titles}<label class="row"><span>Also note window titles</span><input type="checkbox" class="switch" checked={tracker.settings.trackTitles} disabled={!tracker.settings.trackApps} onchange={(e) => tracker.setSettings({ trackTitles: e.currentTarget.checked })} /></label>{/if}
          <div class="row"><span>Daily goal</span>
            <Segmented label="Daily goal" value={String(tracker.settings.dailyGoalMinutes)} options={[0, 240, 360, 480].map((m) => ({ value: String(m), label: m ? `${m / 60}h` : 'None' }))} onchange={(v) => tracker.setSettings({ dailyGoalMinutes: Number(v) })} />
          </div>
          <div class="row"><span>Round exports to</span>
            <Segmented label="Rounding" value={String(tracker.settings.roundTo)} options={[0, 5, 6, 15].map((m) => ({ value: String(m), label: m ? `${m}m` : 'Exact' }))} onchange={(v) => tracker.setSettings({ roundTo: Number(v) as 0 | 5 | 6 | 15 })} />
          </div>
          <p class="hint">Everything stays on this computer. Window titles can contain private text; they are off unless you turn them on.</p>
        </section>
      {/if}
    </div>
  </Panel>
{/if}

<style>
  .tp {
    display: grid;
    gap: var(--s-4);
  }
  section {
    display: grid;
    gap: var(--s-3);
  }
  h4 {
    margin: 0;
    font-size: var(--t-xs);
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--ink-3);
  }
  .sm {
    height: 28px;
    padding: 0 10px;
    font-size: var(--t-xs);
  }
  .live {
    position: relative;
    justify-items: start;
    gap: 2px;
    padding: var(--s-4);
    border-radius: var(--r-lg);
    background: color-mix(in srgb, var(--c) 8%, var(--raised));
    border: 1px solid color-mix(in srgb, var(--c) 35%, var(--line));
    overflow: hidden;
  }
  .tag {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ink-2);
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--c);
    animation: beat 2s ease-in-out infinite;
  }
  @keyframes beat {
    50% {
      opacity: 0.35;
      transform: scale(0.8);
    }
  }
  .clock {
    font-size: 48px;
    font-weight: 300;
    letter-spacing: -0.02em;
    line-height: 1.1;
  }
  .what {
    display: grid;
  }
  .what b {
    font-weight: 500;
  }
  .what small,
  .since {
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .acts {
    position: absolute;
    right: var(--s-4);
    bottom: var(--s-4);
  }
  .picks {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 6px;
  }
  .pick {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-radius: var(--r-md);
    border: 1px solid var(--line);
    text-align: left;
    transition:
      border-color var(--dur-2) var(--ease-out),
      background var(--dur-1) var(--ease-out);
  }
  .pick:hover {
    background: var(--sunken);
  }
  .pick.on {
    border-color: color-mix(in srgb, var(--c) 60%, transparent);
    background: color-mix(in srgb, var(--c) 8%, var(--raised));
  }
  .pick i {
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--c);
  }
  .pick span {
    display: grid;
    min-width: 0;
  }
  .pick b {
    font-size: var(--t-sm);
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pick small {
    font-size: 11px;
    color: var(--ink-3);
  }
  .go {
    display: flex;
    gap: 6px;
  }
  .go .field {
    flex: 1;
  }
  .sumrow {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
  }
  .goal {
    display: block;
    height: 6px;
    border-radius: 3px;
    background: color-mix(in srgb, #3d6fe3 16%, transparent);
    overflow: hidden;
  }
  .goal i {
    display: block;
    height: 100%;
    background: #3d6fe3;
    transform-origin: left;
    transition: transform 600ms var(--ease-out);
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--s-3);
  }
  .entries {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .entries li {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 4px;
    border-bottom: 1px solid var(--line);
    font-size: var(--t-sm);
  }
  .entries li > i {
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--c);
  }
  .entries li.live > i {
    animation: beat 2s ease-in-out infinite;
  }
  .entries .t {
    flex: 1;
    min-width: 0;
    display: grid;
  }
  .entries .t b {
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .entries .t small {
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .range {
    font-size: var(--t-xs);
    color: var(--ink-2);
    padding: 2px 6px;
    border-radius: 6px;
  }
  .range:hover {
    background: var(--sunken);
  }
  .dur {
    min-width: 54px;
    text-align: right;
    font-weight: 500;
  }
  .del {
    opacity: 0;
  }
  .entries li:hover .del,
  .entries li:focus-within .del {
    opacity: 1;
  }
  .ed {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .ed :global(.field) {
    width: 96px;
    height: 30px;
  }
  .err {
    color: var(--danger);
    font-size: var(--t-xs);
    border: 0 !important;
  }
  .form {
    display: grid;
    gap: var(--s-2);
    padding: var(--s-3);
    border-radius: var(--r-md);
    background: var(--sunken);
  }
  .pair {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--t-sm);
  }
  .pair :global(.field) {
    flex: 1;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
  }
  .start-row {
    justify-content: flex-start;
  }
  .opt {
    display: flex;
    gap: 12px;
    padding: var(--s-3);
    border-radius: var(--r-md);
    background: var(--sunken);
    color: var(--ink-2);
  }
  .opt b {
    color: var(--ink);
    font-weight: 500;
  }
  .opt p {
    margin: 4px 0 10px;
    font-size: var(--t-sm);
  }
  .settings .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-2);
    font-size: var(--t-sm);
  }
  .empty,
  .hint {
    margin: 0;
    font-size: var(--t-sm);
    color: var(--ink-3);
  }
  .hint {
    font-size: var(--t-xs);
  }
  .error {
    margin: 0;
    color: var(--danger);
    font-size: var(--t-xs);
  }
</style>
