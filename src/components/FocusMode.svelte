<script lang="ts">
  import { fade, fly, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { celebrateBadges, toggleDone } from '../lib/actions';
  import { parseBlockKey } from '../lib/engine/blocks';
  import Dial from '../lib/dial/Dial.svelte';
  import Readout from '../lib/dial/Readout.svelte';
  import { formatDuration, formatTime, MINUTE } from '../lib/engine/time';
  import Icon from '../lib/Icon.svelte';
  import { sounds } from '../lib/sound';
  import { clock } from '../lib/stores/clock.svelte';
  import { settings } from '../lib/stores/settings.svelte';
  import { tasks } from '../lib/stores/tasks.svelte';
  import { timer } from '../lib/stores/timer.svelte';
  import { view } from '../lib/stores/view.svelte';
  import { isOn } from '../lib/addons/registry';
  import MakeSmaller from './addons/smaller/MakeSmaller.svelte';
  import CrumbNote from './addons/crumbs/CrumbNote.svelte';
  import ParkSpot from './addons/crumbs/ParkSpot.svelte';
  import { prayerMarks, waqt } from '../lib/addons/waqt/waqt.svelte';

  // One thing fills the screen; the next is a glance away.
  const cur = $derived(view.now.current);
  const next = $derived(view.now.next);
  const task = $derived(cur?.taskId ? tasks.get(cur.taskId) : undefined);
  const ts = $derived(timer.active ? timer.status(clock.now) : null);

  const wedge = $derived.by(() => {
    if (ts && !ts.finished) {
      const seg = view.timerBlocks[ts.index];
      return seg ? { key: seg.key, startMs: clock.now, endMs: clock.now + ts.remainingMs, color: seg.color } : null;
    }
    if (cur) return { key: cur.key, startMs: cur.startMs, endMs: cur.endMs, color: cur.color };
    return null;
  });

  function extend() {
    if (!cur) return;
    const p = parseBlockKey(cur.key);
    if (!p) return;
    tasks.editOccurrence(p.taskId, p.date, { duration: Math.round((cur.endMs - cur.startMs) / MINUTE) + 5 });
    view.say('Five more minutes. No rush.');
  }

  function finish(e: MouseEvent) {
    if (!cur) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    toggleDone(cur.key, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
  }
</script>

<div class="focus" role="dialog" aria-label="Focus" style:--c={wedge?.color ?? 'var(--ink-3)'} transition:fade={{ duration: view.reducedMotion ? 0 : 260 }}>
  <button class="icon-btn close" onclick={() => (view.focus = false)} aria-label="Leave focus (Esc)"><Icon name="minimize" size={18} /></button>

  <div class="center">
    <div class="dial" in:scale={{ start: 0.92, duration: view.reducedMotion ? 0 : 520, easing: cubicOut }}>
      <Dial
        presetId="timer60"
        finish={view.finish}
        blocks={ts ? view.timerBlocks : view.pool}
        now={clock.now}
        date={view.today}
        isToday={true}
        {wedge}
        hideKey={wedge?.key ?? null}
        showSeconds={settings.value.showSeconds}
        reduced={view.reducedMotion}
        interactive={false}
        label="Focus dial"
        prayers={isOn('waqt') ? prayerMarks(clock.minute) : []}
        prayerBloom={waqt.bloom}
      >
        <Readout
          state={view.now}
          now={clock.now}
          date={view.today}
          isToday={true}
          hour12={view.hour12}
          tally={view.tally}
          timer={ts && !ts.finished && timer.active ? { label: ts.segment.label, remainingMs: ts.remainingMs, paused: ts.paused, index: ts.index, count: Math.ceil(timer.active.segments.length / (timer.active.kind === 'cycles' ? 2 : 1)), kind: timer.active.kind, segment: ts.segment.kind } : null}
          reduced={view.reducedMotion}
          ontimer={(a) => (a === 'pause' ? timer.pause() : a === 'resume' ? timer.resume() : a === 'skip' ? timer.skip() : timer.stop())}
        />
      </Dial>
    </div>

    <div class="info" in:fly={{ y: 12, duration: view.reducedMotion ? 0 : 420, delay: 120, easing: cubicOut }}>
      {#if cur}
        <h2><Icon name={cur.icon} size={26} stroke={2} /> {cur.title || 'Untitled block'}</h2>
        <p class="when tnum">until {formatTime(cur.endMs, view.hour12)} · {formatDuration(cur.endMs - clock.now)} left</p>
        {#if task && isOn('crumbs')}<div class="crumb"><CrumbNote taskId={task.id} tone="focus" /></div>{/if}
        {#if task?.subtasks.length}
          <ul class="steps">
            {#each task.subtasks as s (s.id)}
              <li>
                <button
                  class:done={s.done}
                  onclick={() => {
                    tasks.toggleSubtask(task.id, s.id);
                    sounds.tick();
                    celebrateBadges();
                  }}
                  aria-pressed={s.done}
                >
                  <span class="box">{#if s.done}<Icon name="check" size={12} stroke={3} />{/if}</span>
                  {s.title}
                </button>
              </li>
            {/each}
          </ul>
        {:else if task && isOn('smaller') && !cur.done && task.title.trim()}
          <div class="smaller"><MakeSmaller {task} blockKey={cur.key} minutes={Math.round((cur.endMs - cur.startMs) / MINUTE)} tone="focus" /></div>
        {/if}
        <div class="actions">
          {#if cur.kind === 'task'}
            <button class="btn btn-primary big" onclick={finish} disabled={cur.done}>
              <Icon name="check" size={16} stroke={2.4} /> {cur.done ? 'Done' : 'Finished'}
            </button>
            <button class="btn btn-soft big" onclick={extend}>+5 min</button>
            {#if !timer.active && !cur.done}
              <button class="btn btn-quiet big" onclick={() => timer.startCountdown(2, `Just start: ${cur.title}`, cur.category, cur.icon)} title="Hard to begin? Two minutes of the first tiny step.">
                <Icon name="timer" size={16} /> Just 2 minutes
              </button>
            {/if}
          {/if}
          {#if !timer.active}
            <button class="btn btn-quiet big" onclick={() => ((view.focus = false), (view.sheet = { kind: 'focus', key: cur.key }))}>
              <Icon name="target" size={16} /> Focus session…
            </button>
          {/if}
        </div>
      {:else if ts && !ts.finished && timer.active}
        <h2><Icon name={ts.segment.kind === 'break' ? 'coffee' : 'target'} size={26} stroke={2} /> {ts.segment.kind === 'break' ? 'Break' : ts.segment.label}</h2>
        <p class="when tnum">
          {#if timer.active.kind === 'cycles'}Round {Math.floor(ts.index / 2) + 1} of {Math.ceil(timer.active.segments.length / 2)} · {/if}ends {formatTime(clock.now + ts.remainingMs, view.hour12)}
        </p>
        {#if timer.active.target?.taskId && isOn('crumbs')}<div class="crumb"><CrumbNote taskId={timer.active.target.taskId} tone="focus" /></div>{/if}
        <div class="actions">
          <button class="btn btn-soft big" onclick={() => timer.addMinutes(5)}>+5 min</button>
          <button class="btn btn-quiet big" onclick={() => timer.stop()}>Stop timer</button>
        </div>
      {/if}
      {#if isOn('crumbs') && (cur || (ts && !ts.finished && timer.active))}
        <div class="park"><ParkSpot from={cur?.title ?? timer.active?.label} /></div>
      {/if}
      {#if !cur && !(ts && !ts.finished && timer.active)}
        <h2>Free time</h2>
        <p class="when">{next ? `${formatDuration(next.startMs - clock.now)} until ${next.title}` : 'Nothing else planned today.'}</p>
        <div class="actions">
          {#if !timer.active}
            <button class="btn btn-primary big" onclick={() => timer.startCountdown(25, 'Focus')}><Icon name="play" size={14} stroke={2.4} /> 25 minute focus</button>
          {/if}
        </div>
      {/if}
    </div>
  </div>

  {#if next}
    <div class="next" in:fly={{ y: 20, duration: view.reducedMotion ? 0 : 420, delay: 240, easing: cubicOut }}>
      <span class="next-dot" style:background={next.color}></span>
      <span>Next · <strong>{next.title}</strong> at {formatTime(next.startMs, view.hour12)}</span>
    </div>
  {/if}
</div>

<style>
  .crumb {
    max-width: 460px;
    margin: var(--s-3) 0 var(--s-2);
  }
  .park {
    max-width: 460px;
    margin-top: var(--s-4);
  }
  .smaller {
    max-width: 460px;
    margin: var(--s-4) 0 var(--s-2);
  }
  .focus {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: grid;
    grid-template-rows: 1fr auto;
    background:
      radial-gradient(120% 90% at 30% 40%, color-mix(in srgb, var(--c) 10%, var(--ground)) 0%, var(--ground) 60%);
  }
  .close {
    position: absolute;
    top: 16px;
    right: 16px;
  }
  .center {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(280px, 420px);
    align-items: center;
    gap: var(--s-7);
    padding: var(--s-7) var(--s-7) 0;
    max-width: 1200px;
    width: 100%;
    margin: 0 auto;
  }
  .dial {
    width: min(100%, 70vh, 620px);
    justify-self: end;
  }
  h2 {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    margin: 0;
    font-family: var(--font-read);
    font-size: var(--t-2xl);
    font-weight: 500;
    letter-spacing: -0.02em;
    line-height: 1.15;
  }
  .when {
    margin: var(--s-2) 0 0;
    color: var(--ink-2);
  }
  .steps {
    list-style: none;
    padding: 0;
    margin: var(--s-5) 0 0;
    display: grid;
    gap: var(--s-2);
  }
  .steps button {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    text-align: left;
    font-size: var(--t-lg);
  }
  .steps button.done {
    color: var(--ink-3);
    text-decoration: line-through;
  }
  .box {
    width: 22px;
    height: 22px;
    flex: none;
    border-radius: 7px;
    border: 2px solid var(--c);
    display: grid;
    place-items: center;
    color: white;
  }
  .done .box {
    background: var(--c);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-2);
    margin-top: var(--s-6);
  }
  .big {
    height: 44px;
    padding: 0 var(--s-5);
    font-size: var(--t-md);
  }
  .next {
    justify-self: center;
    display: flex;
    align-items: center;
    gap: var(--s-2);
    margin: var(--s-5) 0 var(--s-6);
    padding: 10px 18px;
    border-radius: var(--r-pill);
    background: var(--raised);
    box-shadow: var(--shadow-2);
    color: var(--ink-2);
    font-size: var(--t-sm);
  }
  .next strong {
    color: var(--ink);
    font-weight: 500;
  }
  .next-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }
  @media (max-width: 860px) {
    .center {
      grid-template-columns: 1fr;
      justify-items: center;
      text-align: center;
      padding: var(--s-6) var(--s-4) 0;
      gap: var(--s-5);
    }
    .dial {
      justify-self: center;
      width: min(100%, 46vh);
    }
    h2,
    .actions {
      justify-content: center;
    }
  }
</style>
