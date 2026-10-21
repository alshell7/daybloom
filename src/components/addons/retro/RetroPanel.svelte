<script lang="ts">
  // Retrospection: a week (or a month) looked back on, kindly. The story in a few lines, the
  // bright spots, your days as columns (how full, how kept), the rhythm of your day, where the
  // time went; then what could be easier — each with a gentle tip and a one-tap fix — a few
  // things to try, and three short lines of your own: keep, change, try.
  import { cubicOut } from 'svelte/easing';
  import { fly } from 'svelte/transition';
  import { landingsFile } from '../../../lib/addons/landings/pad.svelte';
  import { realityFile } from '../../../lib/addons/reality/reality.svelte';
  import { summarize as realitySummary } from '../../../lib/addons/reality/reality';
  import { isOn, setOn } from '../../../lib/addons/registry';
  import { analyse, type Pattern } from '../../../lib/addons/retro/retro';
  import { periodKey, retroFile } from '../../../lib/addons/retro/retro.svelte';
  import { openItems } from '../../../lib/backlog';
  import { blockKey } from '../../../lib/engine/blocks';
  import { categoryColor, CATEGORY_BY_ID } from '../../../lib/engine/categories';
  import { addDays, formatDuration, isoOf, MINUTE, startOfDayMs } from '../../../lib/engine/time';
  import Icon from '../../../lib/Icon.svelte';
  import { clock } from '../../../lib/stores/clock.svelte';
  import { settings } from '../../../lib/stores/settings.svelte';
  import { taskFile, tasks } from '../../../lib/stores/tasks.svelte';
  import { view } from '../../../lib/stores/view.svelte';
  import Panel from '../../Panel.svelte';
  import Segmented from '../../Segmented.svelte';

  const open = $derived(view.sheet?.kind === 'retro');
  const rm = $derived(view.reducedMotion);
  let which = $state<'week' | 'last' | 'month'>('week');
  const today = $derived(isoOf(clock.minute));
  const range = $derived(which === 'week' ? { from: addDays(today, -6), to: today } : which === 'last' ? { from: addDays(today, -13), to: addDays(today, -7) } : { from: addDays(today, -29), to: today });

  const r = $derived.by(() => {
    if (!open) return null;
    const rs = isOn('reality') && realityFile.value.samples.length ? realitySummary(realityFile.value.samples) : null;
    const fromMs = startOfDayMs(range.from);
    const toMs = startOfDayMs(addDays(range.to, 1));
    return analyse({
      tasks: taskFile.value.tasks,
      events: view.calendarEvents,
      from: range.from,
      to: range.to,
      nowMs: clock.minute,
      wake: settings.value.wake,
      sleep: settings.value.sleep,
      journal: retroFile.value.journal,
      reality: rs ? { ratio: rs.ratio, byTitle: rs.byTitle.map((g) => ({ label: g.label, ratio: g.ratio, n: g.n })) } : null,
      landingsTaken: isOn('landings') ? landingsFile.value.log.filter((l) => l.stone && l.at >= fromMs && l.at < toMs).length : 0,
      backlogOpen: openItems(taskFile.value.tasks).length,
      checkIns: settings.value.nudges.checkIn,
    });
  });

  const dur = (min: number) => formatDuration(Math.round(min) * MINUTE);
  const maxMin = $derived(r ? Math.max(60, ...r.days.map((d) => d.plannedMin + d.meetingMin)) : 60);
  const wakingMin = $derived(Math.max(60, (((settings.value.sleep - settings.value.wake) % 1440) + 1440) % 1440 || 960));
  const dayLetter = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'narrow' });
  const dayNum = (d: string) => Number(d.slice(8));

  // Reflection for this period: three short lines, saved as you type.
  const key = $derived(periodKey(range.from, range.to));
  const note = $derived(retroFile.value.notes[key] ?? { keep: '', change: '', try: '' });
  function setNote(field: 'keep' | 'change' | 'try', v: string) {
    retroFile.value.notes = { ...retroFile.value.notes, [key]: { ...note, [field]: v.slice(0, 600) } };
  }
  const trying = $derived(new Set(retroFile.value.tries.map((t) => t.id)));
  function toggleTry(id: string, text: string) {
    const f = retroFile.value;
    f.tries = trying.has(id) ? f.tries.filter((t) => t.id !== id) : [...f.tries, { id, text, at: Date.now() }].slice(-40);
  }

  function act(p: NonNullable<Pattern['action']>) {
    const d = p.do;
    if (d === 'landings') {
      setOn('landings', true);
      view.sheet = { kind: 'landings' };
    } else if (d === 'reality') {
      setOn('reality', true);
      view.sheet = { kind: 'reality' };
    } else if (d === 'checkins') {
      settings.value.nudges.checkIn = true;
      view.say('Check-ins are on: when a block ends unticked, Daybloom asks kindly.');
    } else if (d === 'cycles') {
      settings.value.focus.rhythm = 'cycles';
      view.say(`Focus now runs in rounds of ${settings.value.cycles.focus} minutes with short breaks.`);
    } else if (d === 'winddown') {
      settings.value.nudges.windDown = Math.max(0, settings.value.sleep - 60);
      view.say('An evening wind-down is offered an hour before sleep.');
    } else if (d === 'backlog') {
      view.sheet = { kind: 'backlog' };
    } else if (d.startsWith('smaller:')) {
      const id = d.slice(8);
      const t = tasks.get(id);
      if (!t) return;
      setOn('smaller', true);
      view.sheet = { kind: 'edit', key: t.date ? blockKey(t.id, t.date) : `later:${t.id}`, smaller: true };
    }
  }
</script>

{#if open && r}
  <Panel title="Retrospection" onclose={() => (view.sheet = null)} accent="#138FA6" wide>
    <div class="rp">
      <Segmented label="Period" value={which} onchange={(v) => (which = v)} options={[{ value: 'week', label: 'This week' }, { value: 'last', label: 'Last week' }, { value: 'month', label: '30 days' }]} />

      {#key which}
        <!-- the story -->
        <section class="story" in:fly={{ y: 8, duration: rm ? 0 : 380, easing: cubicOut }}>
          <div class="st">
            <h3>{r.story.title}</h3>
            <p>{r.story.text}</p>
          </div>
          <svg viewBox="0 0 80 80" class="kept" role="img" aria-label={`${Math.round(r.kept * 100)}% of plans kept`}>
            <circle cx="40" cy="40" r="32" class="track" />
            <circle cx="40" cy="40" r="32" pathLength="1" class="fill" stroke-dasharray={`${r.kept} 1`} />
            <text x="40" y="44" class="tnum">{Math.round(r.kept * 100)}%</text>
            <text x="40" y="57" class="cap">kept</text>
          </svg>
        </section>

        {#if r.bright.length}
          <section>
            <h4>Bright spots</h4>
            <div class="bright">
              {#each r.bright as b, i (b.id)}
                <div class="tile" in:fly={{ y: 8, duration: rm ? 0 : 340, delay: rm ? 0 : 80 + i * 70, easing: cubicOut }}>
                  <span class="ic"><Icon name={b.icon} size={15} stroke={2.1} /></span>
                  <b class="tnum">{b.value}</b>
                  <span>{b.label}</span>
                </div>
              {/each}
            </div>
          </section>
        {/if}

        <!-- your days -->
        <section>
          <h4>Your days <small>how full, and how kept</small></h4>
          <div class="days" class:month={r.days.length > 7} role="img" aria-label="Each day: planned time, what was kept, let go, or left open">
            {#if (wakingMin * 0.85) / maxMin <= 0.95}<i class="full" style:bottom={`${((wakingMin * 0.85) / maxMin) * 100}%`} title="A full day"></i>{/if}
            {#each r.days as d, i (d.date)}
              {@const h = (d.plannedMin / maxMin) * 100}
              {@const m = (d.meetingMin / maxMin) * 100}
              {@const doneShare = d.planned ? d.done / d.planned : 0}
              {@const letShare = d.planned ? d.letGo / d.planned : 0}
              <div class="day" class:today={d.date === today} title={`${new Date(`${d.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}: ${d.done} of ${d.planned} kept${d.letGo ? `, ${d.letGo} let go` : ''}${d.open ? `, ${d.open} open` : ''} · ${dur(d.plannedMin)} planned${d.meetingMin ? ` · ${dur(d.meetingMin)} meetings` : ''}`}>
                <div class="col" style:--d={`${i * (r.days.length > 7 ? 12 : 50)}ms`}>
                  {#if m}<span class="mtg" style:height={`${m}%`}></span>{/if}
                  <span class="plan" style:height={`${h}%`}>
                    <span class="done" style:height={`${doneShare * 100}%`}></span>
                    <span class="let" style:height={`${letShare * 100}%`}></span>
                  </span>
                </div>
                <span class="lbl" class:dim={r.days.length > 7 && (i % 7 !== 0) && d.date !== today}>{r.days.length > 7 ? dayNum(d.date) : dayLetter(d.date)}</span>
              </div>
            {/each}
          </div>
          <p class="legend"><i class="k done"></i> kept <i class="k let"></i> let go <i class="k plan"></i> left open {#if r.meetingMin}<i class="k mtg"></i> meetings{/if}</p>
        </section>

        <!-- rhythm + where time went -->
        <section class="two">
          <div>
            <h4>Rhythm of your day</h4>
            <div class="parts">
              {#each r.byPart.filter((p) => p.planned) as p, i (p.id)}
                <div class="part" title={`${p.done} of ${p.planned} kept`}>
                  <span class="pc"><span class="pf" style:height={`${p.rate * 100}%`} style:--d={`${i * 60}ms`}></span></span>
                  <b class="tnum">{Math.round(p.rate * 100)}%</b>
                  <small>{p.label}</small>
                </div>
              {:else}
                <p class="quiet">Plan a few blocks to see it.</p>
              {/each}
            </div>
          </div>
          <div>
            <h4>Where the time went</h4>
            <ul class="cats">
              {#each [...r.byCategory].sort((a, b) => b.plannedMin - a.plannedMin).slice(0, 6) as c, i (c.id)}
                <li>
                  <span class="cn"><i style:background={categoryColor(c.id, view.finish.dark)}></i>{CATEGORY_BY_ID[c.id].label}</span>
                  <span class="cb"><span class="cp" style:width="100%" style:background={`color-mix(in srgb, ${categoryColor(c.id, view.finish.dark)} 22%, transparent)`}><span class="cd" style:width={`${Math.min(100, (c.doneMin / Math.max(1, c.plannedMin)) * 100)}%`} style:background={categoryColor(c.id, view.finish.dark)} style:--d={`${i * 60}ms`}></span></span></span>
                  <small class="tnum">{dur(c.doneMin)} / {dur(c.plannedMin)}</small>
                </li>
              {:else}
                <li class="quiet">Nothing planned yet.</li>
              {/each}
            </ul>
          </div>
        </section>

        <!-- could be easier -->
        {#if r.patterns.length}
          <section>
            <h4>Could be easier</h4>
            <ul class="pats">
              {#each r.patterns.slice(0, 5) as p, i (p.id)}
                <li in:fly={{ y: 8, duration: rm ? 0 : 320, delay: rm ? 0 : 120 + i * 70, easing: cubicOut }}>
                  <span class="pi"><Icon name={p.icon} size={16} stroke={2} /></span>
                  <div class="pt">
                    <b>{p.title}</b>
                    <span>{p.detail}</span>
                    <em><Icon name="lightbulb" size={12} /> {p.tip}</em>
                  </div>
                  {#if p.action}<button class="btn btn-soft sm" onclick={() => act(p.action!)}>{p.action.label}</button>{/if}
                </li>
              {/each}
            </ul>
          </section>
        {/if}

        <!-- try -->
        {#if r.experiments.length}
          <section>
            <h4>Try next {which === 'month' ? 'month' : 'week'}</h4>
            <ul class="tries">
              {#each r.experiments as e (e.id)}
                <li>
                  <button class="tb" class:on={trying.has(e.id)} onclick={() => toggleTry(e.id, e.text)} aria-pressed={trying.has(e.id)}>
                    <span class="box"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 8.4l2.6 2.6L12 5.4" /></svg></span>
                    {e.text}
                  </button>
                </li>
              {/each}
            </ul>
          </section>
        {/if}

        <!-- reflect -->
        <section>
          <h4>In your words</h4>
          <div class="ref">
            <label><span>Keep</span><input class="field" value={note.keep} oninput={(e) => setNote('keep', e.currentTarget.value)} placeholder="What worked, to do again" /></label>
            <label><span>Change</span><input class="field" value={note.change} oninput={(e) => setNote('change', e.currentTarget.value)} placeholder="What got in the way" /></label>
            <label><span>Try</span><input class="field" value={note.try} oninput={(e) => setNote('try', e.currentTarget.value)} placeholder="One small experiment" /></label>
          </div>
          <p class="quiet">Stays on this computer.</p>
        </section>
      {/key}
    </div>
  </Panel>
{/if}

<style>
  .rp {
    --teal: #138fa6;
    display: grid;
    gap: var(--s-2);
  }
  :global([data-theme='dark']) .rp {
    --teal: #4fd3e6;
  }
  section {
    padding: var(--s-4) 0 0;
  }
  h4 {
    margin: 0 0 var(--s-3);
    font-family: var(--font-ui);
    font-size: var(--t-md);
    font-weight: 500;
  }
  h4 small {
    margin-left: 6px;
    font-size: var(--t-xs);
    font-weight: 400;
    color: var(--ink-3);
  }
  .quiet {
    margin: 4px 0 0;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  /* the story */
  .story {
    display: grid;
    grid-template-columns: 1fr 96px;
    gap: var(--s-4);
    align-items: center;
    margin-top: var(--s-3);
    padding: var(--s-4);
    border-radius: var(--r-lg);
    background:
      radial-gradient(120% 140% at 100% 0%, color-mix(in srgb, var(--teal) 18%, transparent), transparent 60%),
      color-mix(in srgb, var(--teal) 5%, var(--surface));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--teal) 18%, var(--line));
  }
  .story h3 {
    margin: 0 0 6px;
    font-family: var(--font-ui);
    font-size: var(--t-xl);
    font-weight: 500;
    letter-spacing: -0.01em;
  }
  .story p {
    margin: 0;
    font-family: var(--font-read);
    font-size: var(--t-sm);
    line-height: 1.55;
    color: var(--ink-2);
  }
  .kept {
    width: 96px;
    height: 96px;
  }
  .kept .track {
    fill: none;
    stroke: var(--sunken);
    stroke-width: 8;
  }
  .kept .fill {
    fill: none;
    stroke: var(--teal);
    stroke-width: 8;
    stroke-linecap: round;
    transform: rotate(-90deg);
    transform-origin: 40px 40px;
    animation: draw 1.1s var(--ease-out) both;
  }
  @keyframes draw {
    from {
      stroke-dasharray: 0 1;
    }
  }
  .kept text {
    text-anchor: middle;
    font-family: var(--font-ui);
    font-size: 17px;
    font-weight: 500;
    fill: var(--ink);
  }
  .kept .cap {
    font-size: 9px;
    font-weight: 400;
    fill: var(--ink-3);
  }
  /* bright spots */
  .bright {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }
  .tile {
    display: grid;
    grid-template-columns: 30px 1fr;
    grid-template-rows: auto auto;
    column-gap: 10px;
    align-items: center;
    padding: 10px 12px;
    border-radius: var(--r-md);
    background: var(--surface);
    box-shadow: inset 0 0 0 1px var(--line);
  }
  .tile .ic {
    grid-row: 1 / 3;
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    color: var(--teal);
    background: color-mix(in srgb, var(--teal) 14%, transparent);
  }
  .tile b {
    font-size: var(--t-lg);
    font-weight: 500;
  }
  .tile span:last-child {
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  /* your days */
  .days {
    position: relative;
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 1fr;
    gap: 8px;
    height: 150px;
    padding: 0 2px;
  }
  .days.month {
    gap: 3px;
  }
  .full {
    position: absolute;
    left: 0;
    right: 0;
    height: 0;
    border-top: 1px dashed color-mix(in srgb, var(--ink) 22%, transparent);
    margin-bottom: 18px;
    pointer-events: none;
  }
  .day {
    display: grid;
    grid-template-rows: 1fr 18px;
    min-width: 0;
  }
  .col {
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    align-items: stretch;
  }
  .plan {
    position: relative;
    display: flex;
    flex-direction: column-reverse;
    min-height: 3px;
    border-radius: 6px 6px 3px 3px;
    background: color-mix(in srgb, var(--ink) 9%, transparent);
    overflow: hidden;
    transform-origin: bottom;
    animation: rise 0.7s var(--ease-out) var(--d) both;
  }
  .month .plan {
    border-radius: 3px 3px 2px 2px;
  }
  .done {
    background: var(--teal);
  }
  /* Let go: a quiet outline, no texture. */
  .let {
    background: color-mix(in srgb, var(--ink) 6%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ink) 28%, transparent);
  }
  .mtg {
    display: block;
    margin-bottom: 2px;
    border-radius: 4px;
    background: color-mix(in srgb, #8670e6 45%, transparent);
    transform-origin: bottom;
    animation: rise 0.7s var(--ease-out) var(--d) both;
  }
  @keyframes rise {
    from {
      transform: scaleY(0);
    }
  }
  .lbl {
    align-self: end;
    text-align: center;
    font-size: 10.5px;
    color: var(--ink-3);
  }
  .lbl.dim {
    opacity: 0;
  }
  .day.today .lbl {
    color: var(--ink);
    font-weight: 600;
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 12px;
    margin: 8px 0 0;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .k {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 3px;
    margin-right: -6px;
    vertical-align: -1px;
  }
  .k.done {
    background: var(--teal);
  }
  .k.let {
    background: color-mix(in srgb, var(--ink) 6%, transparent);
    box-shadow: inset 0 0 0 1px var(--line-strong);
  }
  .k.plan {
    background: color-mix(in srgb, var(--ink) 12%, transparent);
  }
  .k.mtg {
    background: color-mix(in srgb, #8670e6 45%, transparent);
  }
  /* rhythm + categories */
  .two {
    display: grid;
    grid-template-columns: 1fr 1.25fr;
    gap: var(--s-5);
  }
  .parts {
    display: flex;
    gap: 10px;
    height: 120px;
    align-items: flex-end;
  }
  .part {
    flex: 1;
    display: grid;
    grid-template-rows: 1fr auto auto;
    justify-items: center;
    gap: 2px;
    height: 100%;
  }
  .pc {
    position: relative;
    width: 16px;
    height: 100%;
    border-radius: 8px;
    background: var(--sunken);
    overflow: hidden;
  }
  .pf {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    border-radius: 8px;
    background: var(--teal);
    transform-origin: bottom;
    animation: rise 0.7s var(--ease-out) var(--d) both;
  }
  .part b {
    font-size: var(--t-xs);
    font-weight: 500;
  }
  .part small {
    font-size: 10px;
    color: var(--ink-3);
  }
  .cats {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 8px;
  }
  .cats li {
    display: grid;
    grid-template-columns: 74px 1fr auto;
    align-items: center;
    gap: 8px;
    font-size: var(--t-xs);
  }
  .cn {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .cn i {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
  .cb .cp {
    display: block;
    height: 8px;
    border-radius: 4px;
    overflow: hidden;
  }
  .cd {
    display: block;
    height: 100%;
    border-radius: 4px;
    transform-origin: left;
    animation: grow 0.7s var(--ease-out) var(--d) both;
  }
  @keyframes grow {
    from {
      transform: scaleX(0);
    }
  }
  .cats small {
    color: var(--ink-3);
  }
  /* patterns */
  .pats {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 8px;
  }
  .pats li {
    display: grid;
    grid-template-columns: 34px 1fr auto;
    gap: 12px;
    align-items: start;
    padding: 12px;
    border-radius: var(--r-md);
    background: color-mix(in srgb, var(--warm) 6%, var(--surface));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--warm) 18%, var(--line));
  }
  .pi {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    color: color-mix(in srgb, var(--warm) 80%, var(--ink));
    background: color-mix(in srgb, var(--warm) 16%, transparent);
  }
  .pt {
    display: grid;
    gap: 3px;
    font-size: var(--t-sm);
  }
  .pt b {
    font-weight: 500;
  }
  .pt span {
    color: var(--ink-2);
  }
  .pt em {
    display: flex;
    gap: 6px;
    align-items: baseline;
    margin-top: 2px;
    font-style: normal;
    font-size: var(--t-xs);
    color: var(--ink-2);
  }
  .pt em :global(svg) {
    flex: none;
    color: var(--teal);
    transform: translateY(1px);
  }
  /* tries */
  .tries {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 4px;
  }
  .tb {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 8px 10px;
    border-radius: var(--r-sm);
    text-align: left;
    font-size: var(--t-sm);
    color: var(--ink-2);
  }
  .tb:hover {
    background: var(--sunken);
  }
  .tb.on {
    color: var(--ink);
  }
  .box {
    display: grid;
    place-items: center;
    flex: none;
    width: 18px;
    height: 18px;
    border-radius: 6px;
    box-shadow: inset 0 0 0 1.5px var(--line-strong);
    transition: background var(--dur-2) var(--ease-out);
  }
  .tb.on .box {
    background: var(--teal);
    box-shadow: none;
  }
  .box svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: #fff;
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-dasharray: 14;
    stroke-dashoffset: 14;
    transition: stroke-dashoffset var(--dur-3) var(--ease-out);
  }
  .tb.on .box svg {
    stroke-dashoffset: 0;
  }
  /* reflect */
  .ref {
    display: grid;
    gap: 8px;
  }
  .ref label {
    display: grid;
    grid-template-columns: 64px 1fr;
    align-items: center;
    gap: 10px;
    font-size: var(--t-sm);
    color: var(--ink-2);
  }
  :global([data-motion='calm']) .rp :is(.plan, .mtg, .pf, .cd, .kept .fill) {
    animation: none;
  }
</style>
