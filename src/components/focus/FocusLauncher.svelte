<script lang="ts">
  // Start a focus session: pick what it's for, turn the dial to how long, choose one stretch
  // or cycles with breaks, and go. Smart picks come from the day: the rest of the block you're
  // in, the time until the next one, and backlog items that fit.
  import { cubicOut } from 'svelte/easing';
  import { fly } from 'svelte/transition';
  import { blockKey } from '../../lib/engine/blocks';
  import { categoryColor } from '../../lib/engine/categories';
  import { formatDuration, formatTime, MINUTE, minutesOfDay } from '../../lib/engine/time';
  import type { CategoryId } from '../../lib/engine/types';
  import Icon from '../../lib/Icon.svelte';
  import { platform } from '../../lib/platform';
  import { sounds } from '../../lib/sound';
  import { clock } from '../../lib/stores/clock.svelte';
  import { settings } from '../../lib/stores/settings.svelte';
  import { tasks } from '../../lib/stores/tasks.svelte';
  import { timer } from '../../lib/stores/timer.svelte';
  import { view } from '../../lib/stores/view.svelte';
  import Panel from '../Panel.svelte';
  import Segmented from '../Segmented.svelte';
  import TimeDial from './TimeDial.svelte';

  const sheet = $derived(view.sheet?.kind === 'focus' ? view.sheet : null);

  interface Target {
    id: string;
    kind: 'now' | 'next' | 'block' | 'item' | 'free';
    title: string;
    meta: string;
    icon: string;
    category: CategoryId;
    key?: string;
    taskId?: string;
    /** A natural length for this target, in minutes. */
    fit?: number;
  }

  const dark = $derived(view.finish.dark);
  const cur = $derived(view.now.current);
  const nxt = $derived(view.now.next);
  const round5 = (m: number) => Math.max(5, Math.round(m / 5) * 5);

  const targets = $derived.by(() => {
    const out: Target[] = [];
    const now = clock.now;
    if (sheet?.key && sheet.key !== cur?.key) {
      const b = [...view.dayBlocks, ...view.todayBlocks].find((x) => x.key === sheet.key);
      if (b) out.push({ id: b.key, kind: 'block', title: b.title || 'Untitled block', meta: `${formatTime(b.startMs, view.hour12)} · ${formatDuration(b.endMs - b.startMs)}`, icon: b.icon, category: b.category, key: b.key, taskId: b.taskId, fit: round5((b.endMs - b.startMs) / MINUTE) });
    }
    if (cur && cur.kind === 'task' && !cur.done) {
      out.push({ id: cur.key, kind: 'now', title: cur.title || 'Untitled block', meta: `Now · ${formatDuration(cur.endMs - now)} left`, icon: cur.icon, category: cur.category, key: cur.key, taskId: cur.taskId, fit: round5((cur.endMs - now) / MINUTE) });
    }
    if (nxt && nxt.kind === 'task' && out.length < 2) {
      out.push({ id: nxt.key, kind: 'next', title: nxt.title || 'Untitled block', meta: `Next · ${formatTime(nxt.startMs, view.hour12)}`, icon: nxt.icon, category: nxt.category, key: nxt.key, taskId: nxt.taskId, fit: round5((nxt.endMs - nxt.startMs) / MINUTE) });
    }
    const items = view.later
      .slice()
      .sort((a, b) => (a.id === sheet?.taskId ? -1 : b.id === sheet?.taskId ? 1 : 0) || (a.due ?? '9999').localeCompare(b.due ?? '9999') || (a.priority ?? 9) - (b.priority ?? 9))
      .slice(0, 3);
    for (const t of items) out.push({ id: t.id, kind: 'item', title: t.title || 'Untitled', meta: `Backlog · ${formatDuration(t.duration * MINUTE)}`, icon: t.icon, category: t.category, taskId: t.id, fit: Math.max(5, t.duration) });
    out.push({ id: 'free', kind: 'free', title: 'Just focus', meta: 'No task, only time', icon: 'target', category: 'focus' });
    return out;
  });

  let picked = $state<string | null>(null);
  let more = $state(false);
  /** Now / next / the first backlog pick / just focus; the rest of the backlog folds away. */
  const visible = $derived.by(() => {
    if (more) return targets;
    const items = targets.filter((t) => t.kind === 'item');
    const keep = new Set([...targets.filter((t) => t.kind !== 'item').map((t) => t.id), items[0]?.id, picked]);
    return targets.filter((t) => keep.has(t.id));
  });
  const hidden = $derived(targets.length - visible.length);
  let minutes = $state(25);
  let rhythm = $state<'single' | 'cycles'>('single');
  let rounds = $state(4);

  const target = $derived(targets.find((t) => t.id === picked) ?? targets[0]);
  const color = $derived(categoryColor(target?.category ?? 'focus', dark));
  const untilNext = $derived(nxt ? Math.floor((nxt.startMs - clock.now) / MINUTE) : null);

  // Opening the launcher: a sensible pick and length every time.
  let opened = false;
  $effect(() => {
    if (!sheet) {
      opened = false;
      return;
    }
    if (opened) return;
    opened = true;
    const first = targets.find((t) => (sheet.taskId ? t.taskId === sheet.taskId : sheet.key ? t.key === sheet.key : true)) ?? targets[0];
    picked = first?.id ?? null;
    rhythm = settings.value.focus.rhythm;
    rounds = settings.value.cycles.rounds;
    minutes = first?.fit && first.kind !== 'free' && rhythm === 'single' ? Math.min(120, first.fit) : settings.value.focus.minutes;
  });

  function pick(t: Target) {
    picked = t.id;
    if (t.fit && rhythm === 'single') minutes = Math.min(120, t.fit);
  }

  const chips = $derived.by(() => {
    const out: { label: string; minutes: number; hint?: string }[] = [];
    if (target?.kind === 'now' && target.fit) out.push({ label: `Rest of block · ${formatDuration(target.fit * MINUTE)}`, minutes: Math.min(120, target.fit) });
    if (untilNext && untilNext >= 10 && untilNext <= 120) out.push({ label: `Until ${nxt?.title || 'next'} · ${formatDuration(untilNext * MINUTE)}`, minutes: Math.floor(untilNext / 5) * 5 });
    for (const m of settings.value.focus.presets) out.push({ label: m >= 60 ? formatDuration(m * MINUTE) : `${m}m`, minutes: m });
    return out;
  });

  const segments = $derived(rhythm === 'cycles' ? rounds : 1);
  const breaks = $derived(rhythm === 'cycles' ? (rounds - 1) * settings.value.cycles.short : 0);
  const total = $derived(minutes * segments + breaks);
  const summary = $derived(
    rhythm === 'cycles'
      ? `${rounds} × ${formatDuration(minutes * MINUTE)} focus · ${settings.value.cycles.short}m breaks · ends ${formatTime(clock.now + total * MINUTE, view.hour12)}`
      : `One stretch · ends ${formatTime(clock.now + minutes * MINUTE, view.hour12)}`,
  );

  function start() {
    const t = target;
    if (!t) return;
    let key = t.key;
    // A backlog task becomes a block on the dial for the length of the session.
    if (t.kind === 'item' && t.taskId) {
      const nowMin = Math.floor(minutesOfDay(clock.now));
      tasks.update(t.taskId, { date: view.today, start: nowMin, duration: total });
      key = blockKey(t.taskId, view.today);
    }
    timer.startSession({
      minutes,
      rhythm,
      label: t.kind === 'free' ? 'Focus' : t.title,
      icon: t.icon,
      category: t.category,
      target: t.kind === 'free' ? null : { key, taskId: t.taskId },
      cycles: { short: settings.value.cycles.short, long: settings.value.cycles.long, rounds },
    });
    settings.value.focus.minutes = minutes;
    settings.value.focus.rhythm = rhythm;
    if (settings.value.sound) sounds.begin();
    view.sheet = null;
    if (settings.value.focus.fullscreen) view.focus = true;
    view.say(`Focus started · until ${formatTime(clock.now + total * MINUTE, view.hour12)}`);
  }

  const cueToggles = $derived([
    { id: 'glow', label: 'Edge glow', icon: 'scan', on: settings.value.screen.glow },
    { id: 'bar', label: 'Time bar', icon: 'panel-top', on: settings.value.screen.bar },
    { id: 'hud', label: 'HUD', icon: 'gauge', on: settings.value.screen.hud },
  ] as const);
  function toggleCue(id: 'glow' | 'bar' | 'hud') {
    settings.value.screen[id] = !settings.value.screen[id];
  }

  function onKey(e: KeyboardEvent) {
    if (!sheet) return;
    if (e.key === 'Enter' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault();
      start();
    }
  }
</script>

<svelte:window onkeydown={onKey} />

{#if sheet}
  <Panel title="Focus" onclose={() => (view.sheet = null)} accent={color}>
    <div class="fl" style:--c={color}>
      <section>
        <h3>Focus on</h3>
        <div class="targets" role="radiogroup" aria-label="Focus on">
          {#each visible as t, i (t.id)}
            {@const c = categoryColor(t.category, dark)}
            <button
              class="target"
              class:on={t.id === target?.id}
              role="radio"
              aria-checked={t.id === target?.id}
              style:--tc={c}
              onclick={() => pick(t)}
              in:fly={{ y: 6, duration: view.reducedMotion ? 0 : 260, delay: view.reducedMotion ? 0 : i * 35, easing: cubicOut }}
            >
              <span class="tile"><Icon name={t.icon} size={15} stroke={2.1} /></span>
              <span class="txt"><b>{t.title}</b><small>{t.meta}</small></span>
              <span class="radio" aria-hidden="true"></span>
            </button>
          {/each}
          {#if hidden > 0}
            <button class="more" onclick={() => (more = true)}>+ {hidden} more from your backlog</button>
          {/if}
        </div>
      </section>

      <section class="time">
        <h3>For how long</h3>
        <TimeDial bind:minutes {color} total={rhythm === 'cycles' ? total : null} />
        <div class="chips">
          {#each chips as c (c.label)}
            <button class="chip" class:on={c.minutes === minutes} onclick={() => (minutes = c.minutes)}>{c.label}</button>
          {/each}
          <button class="chip" class:on={minutes === 2} onclick={() => ((minutes = 2), (rhythm = 'single'))} title="Hard to begin? Two minutes of the first tiny step.">Just 2 min</button>
        </div>
      </section>

      <section>
        <h3>Rhythm</h3>
        <Segmented
          label="Rhythm"
          value={rhythm}
          options={[
            { value: 'single', label: 'One stretch' },
            { value: 'cycles', label: 'Cycles with breaks' },
          ]}
          onchange={(v) => (rhythm = v as 'single' | 'cycles')}
        />
        {#if rhythm === 'cycles'}
          <div class="rounds" in:fly={{ y: -4, duration: view.reducedMotion ? 0 : 200 }}>
            <span>Rounds</span>
            <div class="stepper">
              <button class="icon-btn" onclick={() => (rounds = Math.max(2, rounds - 1))} aria-label="Fewer rounds" disabled={rounds <= 2}>−</button>
              <span class="tnum">{rounds}</span>
              <button class="icon-btn" onclick={() => (rounds = Math.min(8, rounds + 1))} aria-label="More rounds" disabled={rounds >= 8}>+</button>
            </div>
            <span class="pips" aria-hidden="true">
              {#each Array.from({ length: rounds }, (_, i) => i) as i (i)}<i></i>{/each}
            </span>
          </div>
        {/if}
        <p class="summary tnum">{summary}</p>
      </section>

      {#if platform.isNative}
        <section>
          <h3>Screen cues</h3>
          <div class="cues">
            {#each cueToggles as c (c.id)}
              <button class="cue" class:on={c.on} aria-pressed={c.on} onclick={() => toggleCue(c.id)}>
                <Icon name={c.icon} size={15} /> {c.label}
              </button>
            {/each}
          </div>
          <p class="hint">Gentle cues at the edge of your screen while you focus. More in Settings › Screen cues.</p>
        </section>
      {/if}
    </div>

    {#snippet footer()}
      <div class="go">
        <button class="btn btn-primary start" onclick={start}>
          <Icon name="play" size={15} stroke={2.4} /> Start focus
          <span class="until tnum">· {formatDuration(total * MINUTE)}</span>
        </button>
      </div>
    {/snippet}
  </Panel>
{/if}

<style>
  .fl {
    display: grid;
    gap: var(--s-5);
  }
  h3 {
    margin: 0 0 var(--s-2);
    font-size: var(--t-xs);
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--ink-3);
  }
  .targets {
    display: grid;
    gap: 4px;
  }
  .target {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 8px 10px;
    border-radius: var(--r-md);
    text-align: left;
    border: 1px solid transparent;
    transition:
      background var(--dur-1) var(--ease-out),
      border-color var(--dur-2) var(--ease-out);
  }
  .target:hover {
    background: var(--sunken);
  }
  .target.on {
    background: color-mix(in srgb, var(--tc) 9%, var(--raised));
    border-color: color-mix(in srgb, var(--tc) 45%, transparent);
  }
  .tile {
    display: grid;
    place-items: center;
    flex: none;
    width: 30px;
    height: 30px;
    border-radius: 9px;
    color: var(--tc);
    background: color-mix(in srgb, var(--tc) 16%, transparent);
  }
  .txt {
    flex: 1;
    min-width: 0;
    display: grid;
  }
  .txt b {
    font-weight: 500;
    font-size: var(--t-sm);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .txt small {
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .radio {
    flex: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    box-shadow: inset 0 0 0 1.5px var(--line-strong);
    transition: box-shadow var(--dur-2) var(--ease-out);
  }
  .target.on .radio {
    box-shadow: inset 0 0 0 5px var(--tc);
  }
  .time {
    display: grid;
    justify-items: center;
  }
  .time h3 {
    justify-self: start;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 6px;
    margin-top: var(--s-3);
  }
  .chip {
    height: 30px;
    padding: 0 12px;
    border-radius: var(--r-pill);
    font-size: var(--t-xs);
    color: var(--ink-2);
    background: var(--sunken);
    transition:
      background var(--dur-1) var(--ease-out),
      color var(--dur-1) var(--ease-out),
      transform var(--dur-1) var(--ease-out);
  }
  .chip:hover {
    color: var(--ink);
  }
  .chip:active {
    transform: scale(0.96);
  }
  .chip.on {
    background: color-mix(in srgb, var(--c) 18%, var(--raised));
    color: var(--ink);
    box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--c) 60%, transparent);
  }
  .rounds {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    margin-top: var(--s-3);
    font-size: var(--t-sm);
  }
  .stepper {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 2px;
    border-radius: var(--r-pill);
    background: var(--sunken);
  }
  .stepper .icon-btn {
    width: 28px;
    height: 28px;
    font-size: 16px;
  }
  .stepper .tnum {
    min-width: 18px;
    text-align: center;
    font-weight: 500;
  }
  .pips {
    display: flex;
    gap: 4px;
  }
  .pips i {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--c);
    opacity: 0.8;
  }
  .summary {
    margin: var(--s-2) 0 0;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .cues {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .cue {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    padding: 0 12px;
    border-radius: var(--r-pill);
    font-size: var(--t-sm);
    color: var(--ink-2);
    border: 1px solid var(--line-strong);
    transition:
      background var(--dur-1) var(--ease-out),
      color var(--dur-1) var(--ease-out),
      border-color var(--dur-1) var(--ease-out);
  }
  .cue.on {
    color: var(--ink-inverse);
    background: var(--ink);
    border-color: var(--ink);
  }
  .hint {
    margin: var(--s-2) 0 0;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .go {
    display: flex;
    width: 100%;
  }
  .more {
    justify-self: start;
    padding: 4px 10px;
    font-size: var(--t-xs);
    color: var(--ink-3);
    border-radius: var(--r-pill);
  }
  .more:hover {
    background: var(--sunken);
    color: var(--ink);
  }
  .start {
    flex: 1;
    justify-content: center;
    height: 44px;
    font-size: var(--t-md);
  }
  .until {
    opacity: 0.7;
    font-weight: 400;
  }
</style>
