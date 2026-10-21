<script lang="ts">
  import { flip } from 'svelte/animate';
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { acknowledge, extendBlock, toBacklog, toggleDone } from '../lib/actions';
  import { formatDuration, formatTime, minutesOfDay, MINUTE } from '../lib/engine/time';
  import { blockKey } from '../lib/engine/blocks';
  import Icon from '../lib/Icon.svelte';
  import { dismiss, nudges } from '../lib/nudges.svelte';
  import { sounds } from '../lib/sound';
  import { clock } from '../lib/stores/clock.svelte';
  import { tasks } from '../lib/stores/tasks.svelte';
  import { timer } from '../lib/stores/timer.svelte';
  import { view } from '../lib/stores/view.svelte';
  import { isOn } from '../lib/addons/registry';
  import { clearSample, keepSample, offerClear } from '../lib/sample';
  import { starter } from '../lib/starter.svelte';
  import { settings } from '../lib/stores/settings.svelte';

  // A small, kind stack of things worth a moment: check-ins, a nudge to start,
  // something that fits the free time, and the evening wind-down. One at a time.
  let expanded = $state(false);
  let gapPick = $state(0);

  const first = $derived(nudges.checkIns[0] ?? null);
  const more = $derived(nudges.checkIns.length - 1);
  const urgent = $derived(nudges.overdueMin >= 10);
  const gap = $derived(nudges.gapIdea);
  const idea = $derived(gap ? gap.options[gapPick % gap.options.length] : null);

  function done(e: MouseEvent, key: string) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    toggleDone(key, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
  }

  function startIdea() {
    if (!idea) return;
    const start = Math.ceil(clock.now / (5 * MINUTE)) * 5 * MINUTE;
    tasks.schedule(idea.id, view.today, Math.round(minutesOfDay(start)));
    view.selected = blockKey(idea.id, view.today);
    sounds.begin();
    view.say(`“${idea.title}” — go for it. ${formatDuration(idea.duration * MINUTE)} on the clock.`);
  }

  function justStart(b: { key: string; taskId?: string; title: string; category: string; icon: string }) {
    // Aimed at the block, so its end can offer "keep going" and the dial knows what's on.
    timer.startSession({ minutes: 2, rhythm: 'single', label: b.title || 'Just start', icon: b.icon, category: b.category as never, target: { key: b.key, taskId: b.taskId } });
    dismiss(`start:${b.key}`);
    sounds.begin();
    view.say('Two minutes. Only the first tiny step — you can stop after.');
  }
</script>

<div class="stack" aria-live="polite">
  {#if first}
    <article class="card" class:urgent style:--c={first.color} in:fly={{ x: -24, duration: view.reducedMotion ? 0 : 320, easing: cubicOut }} out:fly={{ x: -16, duration: 180 }}>
      <header>
        <span class="ico"><Icon name={first.icon} size={16} stroke={2.1} /></span>
        <div class="txt">
          <p class="q">How did <strong>{first.title || 'this block'}</strong> go?</p>
          <p class="meta tnum">{formatTime(first.startMs, view.hour12)}–{formatTime(first.endMs, view.hour12)} · any answer is fine</p>
        </div>
      </header>
      <div class="actions">
        <button class="btn btn-primary" onclick={(e) => done(e, first.key)}><Icon name="check" size={14} stroke={2.4} /> Done</button>
        <button class="btn btn-soft" onclick={() => extendBlock(first.key, 15)} title="Still going — 15 more minutes">+15m</button>
        <button class="btn btn-soft" onclick={() => toBacklog(first.key)} title="Not today — keep it in the backlog">Later</button>
        <button class="btn btn-quiet" onclick={() => acknowledge(first.key)} title="It didn't happen, and that's ok">Let go</button>
      </div>
      {#if more > 0}
        <button class="more" onclick={() => (expanded = !expanded)} aria-expanded={expanded}>
          {more} more waiting <Icon name="chevron-down" size={13} />
        </button>
        {#if expanded}
          <ul class="rest">
            {#each nudges.checkIns.slice(1) as b (b.key)}
              <li animate:flip={{ duration: 220 }} style:--c={b.color}>
                <i></i>
                <span class="t">{b.title}</span>
                <button class="mini" onclick={(e) => done(e, b.key)} aria-label={`${b.title} done`}><Icon name="check" size={13} stroke={2.4} /></button>
                <button class="mini" onclick={() => acknowledge(b.key)} aria-label={`Let go of ${b.title}`}><Icon name="x" size={13} /></button>
              </li>
            {/each}
          </ul>
        {/if}
      {/if}
    </article>
  {:else if starter.offer}
    <!-- Help me start: one tiny, concrete first step for the block that's on, one tap to begin. -->
    {@const b = starter.offer}
    {@const fs = starter.of(b.key)}
    {@const busy = !!starter.making[b.key]}
    <article class="card first" style:--c={b.color} in:fly={{ x: -24, duration: view.reducedMotion ? 0 : 320, easing: cubicOut }} out:fly={{ x: -16, duration: 180 }}>
      <header>
        <span class="ico"><Icon name="rocket" size={16} stroke={2.1} /></span>
        <div class="txt">
          <p class="q"><strong>{b.title}</strong> is on.</p>
          <p class="meta">{fs ? fs.nudge : 'Finding the tiniest way in…'}</p>
        </div>
      </header>
      {#key fs?.step}
        <button class="stepchip" class:ghost={!fs} disabled={!fs} onclick={() => starter.start(b)} in:fly={{ y: 6, duration: view.reducedMotion ? 0 : 260, easing: cubicOut }}>
          <span class="ring tnum">{fs?.minutes ?? 2}<small>m</small></span>
          <span class="st">{fs ? fs.step : ' '}</span>
          {#if fs?.via === 'ai'}<Icon name="sparkles" size={12} />{/if}
        </button>
      {/key}
      <div class="actions">
        <button class="btn btn-primary" disabled={!fs} onclick={() => starter.start(b)}><Icon name="play" size={13} stroke={2.4} /> Start · {fs?.minutes ?? 2} min</button>
        <button class="btn btn-soft" disabled={busy} onclick={() => void starter.prepare(b, true)} title="A different first step"><Icon name="shuffle" size={13} /> {busy ? 'Thinking…' : 'Another idea'}</button>
        <button class="btn btn-quiet" onclick={() => starter.dismiss(b)}>Not now</button>
      </div>
    </article>
  {:else if nudges.starter && !settings.value.nudges.firstStep}
    {@const s = nudges.starter}
    <article class="card" style:--c={s.color} in:fly={{ x: -24, duration: view.reducedMotion ? 0 : 320, easing: cubicOut }} out:fly={{ x: -16, duration: 180 }}>
      <header>
        <span class="ico"><Icon name="rocket" size={16} stroke={2.1} /></span>
        <div class="txt">
          <p class="q">Time for <strong>{s.title}</strong>.</p>
          <p class="meta">Hard to begin? Just do two minutes of it.</p>
        </div>
      </header>
      <div class="actions">
        <button class="btn btn-primary" onclick={() => justStart(s)}><Icon name="timer" size={14} /> Just 2 minutes</button>
        {#if isOn('smaller') && s.endMs - s.startMs >= 30 * MINUTE}
          <button class="btn btn-soft" onclick={() => (dismiss(`start:${s.key}`), (view.sheet = { kind: 'edit', key: s.key, smaller: true }))}><Icon name="layers" size={13} /> Make it smaller</button>
        {/if}
        <button class="btn btn-quiet" onclick={() => dismiss(`start:${s.key}`)}>I'm on it</button>
      </div>
    </article>
  {:else if gap && idea}
    <article class="card idea" in:fly={{ x: -24, duration: view.reducedMotion ? 0 : 320, easing: cubicOut }} out:fly={{ x: -16, duration: 180 }}>
      <header>
        <span class="ico"><Icon name="sparkles" size={16} stroke={2.1} /></span>
        <div class="txt">
          <p class="q"><strong class="tnum">{formatDuration(gap.gapMin * MINUTE)}</strong> free{gap.nextTitle ? ` before ${gap.nextTitle}` : ''}.</p>
          <p class="meta">This fits: <strong>{idea.title}</strong> · {formatDuration(idea.duration * MINUTE)}</p>
        </div>
      </header>
      <div class="actions">
        <button class="btn btn-primary" onclick={startIdea}><Icon name="play" size={13} stroke={2.4} /> Do it now</button>
        {#if gap.options.length > 1}<button class="btn btn-soft" onclick={() => gapPick++}>Another</button>{/if}
        <button class="btn btn-quiet" onclick={() => dismiss(gap.id)}>Not now</button>
      </div>
    </article>
  {:else if nudges.keepRhythm}
    {@const k = nudges.keepRhythm}
    <article class="card rhythm" in:fly={{ x: -24, duration: view.reducedMotion ? 0 : 320, easing: cubicOut }} out:fly={{ x: -16, duration: 180 }}>
      <header>
        <span class="ico"><Icon name="flame" size={16} stroke={2.1} /></span>
        <div class="txt">
          <p class="q">Keep your <strong>{k.days}-day rhythm</strong> going?</p>
          <p class="meta">{k.small ? `One small thing counts — like “${k.small.title}” (${formatDuration(k.small.duration * MINUTE)}).` : 'One small finished thing today counts.'}{k.rest ? ` (A rest day is banked if today doesn't happen.)` : ''}</p>
        </div>
      </header>
      <div class="actions">
        {#if k.small}
          <button class="btn btn-primary" onclick={() => { tasks.schedule(k.small!.id, view.today, Math.round(minutesOfDay(Math.ceil(clock.now / (5 * MINUTE)) * 5 * MINUTE))); dismiss('rhythm'); sounds.begin(); }}><Icon name="play" size={13} stroke={2.4} /> Do it now</button>
        {:else}
          <button class="btn btn-primary" onclick={() => { dismiss('rhythm'); view.sheet = { kind: 'backlog' }; }}>Find something small</button>
        {/if}
        <button class="btn btn-quiet" onclick={() => dismiss('rhythm')}>Rest tonight</button>
      </div>
    </article>
  {:else if settings.value.onboarded && offerClear()}
    <article class="card" in:fly={{ x: -24, duration: view.reducedMotion ? 0 : 320, easing: cubicOut }} out:fly={{ x: -16, duration: 180 }}>
      <header>
        <span class="ico"><Icon name="sparkles" size={16} stroke={2.1} /></span>
        <div class="txt">
          <p class="q">Your own day is starting</p>
          <p class="meta">Clear the sample blocks so only yours are on the dial?</p>
        </div>
      </header>
      <div class="actions">
        <button class="btn btn-primary" onclick={() => clearSample()}><Icon name="wand-sparkles" size={13} /> Clear the sample</button>
        <button class="btn btn-quiet" onclick={() => keepSample()}>Keep them</button>
      </div>
    </article>
  {:else if nudges.windDown}
    <article class="card evening" in:fly={{ x: -24, duration: view.reducedMotion ? 0 : 320, easing: cubicOut }} out:fly={{ x: -16, duration: 180 }}>
      <header>
        <span class="ico"><Icon name="sunset" size={16} stroke={2.1} /></span>
        <div class="txt">
          <p class="q">Wind down?</p>
          <p class="meta">A minute to see what you did and move the rest to tomorrow.</p>
        </div>
      </header>
      <div class="actions">
        <button class="btn btn-primary" onclick={() => (view.sheet = { kind: 'winddown' })}>Close the day</button>
        <button class="btn btn-quiet" onclick={() => dismiss('winddown')}>Not tonight</button>
      </div>
    </article>
  {/if}
</div>

<style>
  /* Help me start: the first step as a chip you can tap to begin. */
  .stepchip {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    margin: 2px 0 var(--s-3);
    padding: 8px 12px 8px 8px;
    border-radius: var(--r-md);
    border: 1px solid color-mix(in srgb, var(--c) 35%, var(--line));
    background: color-mix(in srgb, var(--c) 8%, var(--raised));
    color: var(--ink);
    font: inherit;
    font-size: var(--t-sm);
    text-align: left;
    cursor: pointer;
    transition:
      transform var(--dur-2) cubic-bezier(0.3, 1.5, 0.5, 1),
      background var(--dur-2) var(--ease-out);
  }
  .stepchip:hover:not(:disabled) {
    transform: translateY(-1px);
    background: color-mix(in srgb, var(--c) 14%, var(--raised));
  }
  .stepchip.ghost {
    opacity: 0.55;
    cursor: default;
  }
  .stepchip .ring {
    display: grid;
    place-items: center;
    flex: none;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    border: 2px solid var(--c);
    font-weight: 600;
    font-size: var(--t-sm);
    line-height: 1;
  }
  .stepchip .ring small {
    font-size: 9px;
    font-weight: 500;
  }
  .stepchip .st {
    flex: 1;
    min-width: 0;
  }
  .stepchip :global(svg) {
    flex: none;
    color: var(--c);
  }
  .stack {
    position: fixed;
    left: 20px;
    bottom: 20px;
    z-index: 35;
    width: min(340px, calc(100vw - 40px));
    pointer-events: none;
  }
  .card {
    pointer-events: auto;
    position: relative;
    display: grid;
    gap: var(--s-3);
    padding: 14px 14px 12px;
    border-radius: var(--r-lg);
    background: var(--raised);
    border: 1px solid var(--line);
    box-shadow: var(--shadow-3);
    overflow: hidden;
  }
  .card::before {
    content: '';
    position: absolute;
    inset: 0 auto 0 0;
    width: 4px;
    background: var(--c, var(--lume));
  }
  .card.idea {
    --c: var(--focus-ring);
  }
  .card.rhythm {
    --c: var(--lume);
  }
  .card.evening {
    --c: var(--warm);
  }
  /* Unanswered for a while: a warm amber edge — attention without alarm. */
  .card.urgent {
    border-color: color-mix(in srgb, var(--warm) 60%, var(--line));
    box-shadow:
      0 0 0 3px color-mix(in srgb, var(--warm) 18%, transparent),
      var(--shadow-3);
  }
  header {
    display: flex;
    gap: 10px;
    align-items: flex-start;
  }
  .ico {
    flex: none;
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--c, var(--lume)) 18%, transparent);
    color: var(--c, var(--lume));
  }
  .q {
    margin: 0;
    font-size: var(--t-md);
    line-height: 1.35;
  }
  .q strong {
    font-weight: 600;
  }
  .meta {
    margin: 2px 0 0;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .meta strong {
    color: var(--ink-2);
    font-weight: 500;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .actions .btn {
    height: 32px;
    padding: 0 12px;
  }
  .more {
    justify-self: start;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .rest {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 2px;
  }
  .rest li {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 30px;
    font-size: var(--t-sm);
  }
  .rest i {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--c);
  }
  .rest .t {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mini {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    color: var(--ink-2);
  }
  .mini:hover {
    background: var(--sunken);
    color: var(--ink);
  }
</style>
