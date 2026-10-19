<script lang="ts">
  // Right now: the block you're in as a countdown ring that's eaten as time passes, what's
  // next, or — when free — how long until the next thing and something that fits the gap.
  import { extendBlock, toggleDone } from '../../lib/actions';
  import { blockKey } from '../../lib/engine/blocks';
  import { formatDuration, formatTime, MINUTE, minutesOfDay } from '../../lib/engine/time';
  import Icon from '../../lib/Icon.svelte';
  import Rolling from '../../lib/dial/Rolling.svelte';
  import { nudges } from '../../lib/nudges.svelte';
  import { sounds } from '../../lib/sound';
  import { clock } from '../../lib/stores/clock.svelte';
  import { tasks } from '../../lib/stores/tasks.svelte';
  import { timer } from '../../lib/stores/timer.svelte';
  import { view } from '../../lib/stores/view.svelte';
  import Ring from './Ring.svelte';
  import TimerCard from './TimerCard.svelte';

  const st = $derived(view.now);
  const cur = $derived(st.current);
  const next = $derived(st.next);
  const now = $derived(clock.now);
  const ts = $derived(timer.active ? timer.status(now) : null);
  const left = $derived(cur ? cur.endMs - now : next ? next.startMs - now : 0);
  const frac = $derived(cur ? left / Math.max(MINUTE, cur.endMs - cur.startMs) : next ? Math.min(1, left / (60 * MINUTE)) : 0);
  const idea = $derived(!cur ? (nudges.gapIdea?.options[0] ?? null) : null);
  const fmt = (ms: number) => formatTime(ms, view.hour12);

  function done(e: MouseEvent) {
    if (!cur) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    toggleDone(cur.key, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
  }

  function startIdea() {
    if (!idea) return;
    const start = Math.ceil(clock.now / (5 * MINUTE)) * 5 * MINUTE;
    tasks.schedule(idea.id, view.today, Math.round(minutesOfDay(start)));
    view.selected = blockKey(idea.id, view.today);
    sounds.begin();
  }
</script>

{#if ts && !ts.finished}
  <TimerCard />
{/if}

<div class="a-card now">
  {#if cur}
    <div class="hero" style:--c={cur.color}>
      <Ring fraction={frac} color={cur.color} size={58} label={`${formatDuration(left)} left`}>
        <Rolling text={formatDuration(left)} reduced={view.reducedMotion} />
      </Ring>
      <div class="txt">
        <span class="a-meta">Now · until {fmt(cur.endMs)}</span>
        <strong class="a-title">{cur.title || 'Untitled block'}</strong>
        <span class="a-meta">{fmt(cur.startMs)}–{fmt(cur.endMs)} · {formatDuration(left)} left</span>
      </div>
      <span class="a-ico"><Icon name={cur.icon} size={15} stroke={2} /></span>
    </div>
    {#if cur.kind === 'task'}
      <div class="a-actions">
        <button class="a-chip primary" onclick={done}><Icon name="check" size={13} stroke={2.4} /> Done</button>
        <button class="a-chip" onclick={() => extendBlock(cur.key, 15)}>+15m</button>
        <button class="a-chip quiet" onclick={() => (view.focus = true)}><Icon name="focus" size={13} /> Focus mode</button>
      </div>
    {/if}
  {:else if next}
    <div class="hero">
      <Ring fraction={frac} color={view.finish.track} tip={next.color} size={58} label={`${formatDuration(left)} until ${next.title}`}>
        <Rolling text={formatDuration(left)} reduced={view.reducedMotion} />
      </Ring>
      <div class="txt">
        <span class="a-meta">Free time</span>
        <strong class="a-title">Free until {next.title}</strong>
        <span class="a-meta">{next.title} at {fmt(next.startMs)} · in {formatDuration(left)}</span>
      </div>
    </div>
    {#if idea}
      <div class="idea">
        <Icon name="sparkles" size={14} />
        <span class="a-meta">This fits: <b>{idea.title}</b> · {formatDuration(idea.duration * MINUTE)}</span>
        <button class="a-chip" onclick={startIdea}><Icon name="play" size={12} stroke={2.4} /> Do it now</button>
      </div>
    {/if}
  {:else}
    <div class="hero">
      <span class="a-ico quiet"><Icon name="moon" size={15} /></span>
      <div class="txt">
        <strong class="a-title">Nothing else today</strong>
        <span class="a-meta">The rest of the day is yours.</span>
      </div>
    </div>
  {/if}

  {#if cur && next}
    <div class="next" style:--c={next.color}>
      <span class="a-dot"></span>
      <span class="a-meta">Then <b>{next.title}</b> at {fmt(next.startMs)}</span>
    </div>
  {/if}
</div>

<style>
  .hero {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: var(--s-3);
    align-items: center;
  }
  .txt {
    display: grid;
    gap: 1px;
    min-width: 0;
  }
  .idea,
  .next {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    color: var(--ink-3);
  }
  .idea .a-chip {
    margin-left: auto;
  }
  b {
    font-weight: 500;
    color: var(--ink);
  }
</style>
