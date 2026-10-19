<script lang="ts">
  // The running timer or focus rounds: a ring that's eaten as the segment runs, and the
  // controls you'd reach for. Nothing running → a few quick starts.
  import { categoryColor } from '../../lib/engine/categories';
  import { formatClockCountdown, formatDuration } from '../../lib/engine/time';
  import Icon from '../../lib/Icon.svelte';
  import Rolling from '../../lib/dial/Rolling.svelte';
  import { sounds } from '../../lib/sound';
  import { clock } from '../../lib/stores/clock.svelte';
  import { settings } from '../../lib/stores/settings.svelte';
  import { timer } from '../../lib/stores/timer.svelte';
  import { view } from '../../lib/stores/view.svelte';
  import Ring from './Ring.svelte';

  const a = $derived(timer.active);
  const ts = $derived(a ? timer.status(clock.now) : null);
  const running = $derived(!!a && !!ts && !ts.finished);
  const color = $derived(a && ts ? categoryColor(ts.segment.kind === 'break' ? 'rest' : a.category, view.finish.dark) : 'var(--ink)');
  const rounds = $derived(a?.kind === 'cycles' ? Math.ceil(a.segments.length / 2) : 0);

  function start(min: number) {
    timer.startCountdown(min, `${min} minutes`, 'focus', 'timer');
    settings.value.preset = 'timer60';
    sounds.begin();
  }
</script>

<div class="a-card timer">
  {#if running && a && ts}
    <div class="hero">
      <Ring fraction={ts.remainingMs / ts.segment.ms} {color} size={58} label={`${formatClockCountdown(ts.remainingMs)} left`}>
        <Rolling text={formatClockCountdown(ts.remainingMs)} reduced={view.reducedMotion} />
      </Ring>
      <div class="txt">
        <span class="a-meta">
          {#if ts.paused}Paused{:else if a.kind === 'cycles'}Round {Math.floor(ts.index / 2) + 1} of {rounds}{ts.segment.kind === 'break' ? ' · break' : ''}{:else}Timer{/if}
        </span>
        <strong class="a-title">{ts.segment.label}</strong>
        <span class="a-meta">{formatDuration(ts.segment.ms)} {ts.segment.kind === 'break' ? 'break' : 'block'}</span>
      </div>
    </div>
    <div class="a-actions">
      {#if ts.paused}
        <button class="a-chip primary" onclick={() => timer.resume()}><Icon name="play" size={12} stroke={2.4} /> Resume</button>
      {:else}
        <button class="a-chip" onclick={() => timer.pause()}><Icon name="pause" size={12} stroke={2.4} /> Pause</button>
      {/if}
      <button class="a-chip tnum" onclick={() => timer.addMinutes(5)}>+5m</button>
      {#if a.kind === 'cycles'}<button class="a-chip" onclick={() => timer.skip()}><Icon name="skip" size={12} /> Skip</button>{/if}
      <button class="a-chip quiet" onclick={() => timer.stop()}>Stop</button>
    </div>
  {:else}
    <div class="hero">
      <span class="a-ico quiet"><Icon name="timer" size={15} /></span>
      <div class="txt">
        <strong class="a-title">No timer running</strong>
        <span class="a-meta">Time-box something:</span>
      </div>
    </div>
    <div class="a-actions">
      {#each [5, 10, 25, 45] as m (m)}
        <button class="a-chip tnum" onclick={() => start(m)}>{m}m</button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .hero {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--s-3);
    align-items: center;
  }
  .txt {
    display: grid;
    gap: 1px;
    min-width: 0;
  }
</style>
