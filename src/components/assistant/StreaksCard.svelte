<script lang="ts">
  // Rhythm: seven beads (lit = something finished, moon = a rest day you'd earned, hollow =
  // today, still open) and the routines you keep. Nothing here ever turns red.
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { fromISODate } from '../../lib/engine/time';
  import Icon from '../../lib/Icon.svelte';
  import Rolling from '../../lib/dial/Rolling.svelte';
  import { rhythm, routineStreaks } from '../../lib/streaks';
  import { clock } from '../../lib/stores/clock.svelte';
  import { taskFile } from '../../lib/stores/tasks.svelte';
  import { view } from '../../lib/stores/view.svelte';

  const r = $derived((clock.zone, rhythm(taskFile.value.tasks, clock.minute)));
  const routines = $derived(routineStreaks(taskFile.value.tasks, clock.minute, view.finish.dark).slice(0, 5));
  const rise = (i: number) => ({ y: 6, delay: Math.min(i, 4) * 30, duration: view.reducedMotion ? 0 : 220, easing: cubicOut });
</script>

<div class="a-card streaks">
  <div class="hero">
    <span class="flame" class:lit={r.countedToday}><Icon name="flame" size={18} stroke={2.1} /></span>
    <div class="txt">
      <strong class="a-title tnum">
        {#if r.current}<Rolling text={String(r.current)} reduced={view.reducedMotion} />-day rhythm{:else}Start a rhythm today{/if}
      </strong>
      <span class="a-meta tnum">Best {r.best} {r.best === 1 ? 'day' : 'days'}{r.rest ? ` · ${r.rest} rest ${r.rest === 1 ? 'day' : 'days'} banked` : ''}</span>
    </div>
    <span class="beads" aria-label="The last seven days">
      {#each r.beads as b (b.date)}
        <i class={b.state} title={fromISODate(b.date).toLocaleDateString(undefined, { weekday: 'short' })}>
          {#if b.state === 'rest'}<Icon name="moon" size={8} stroke={2.6} />{/if}
        </i>
      {/each}
    </span>
  </div>
  {#if routines.length}
    <ul class="a-list">
      {#each routines as s, i (s.taskId)}
        <li class="a-row static" style:--c={s.color} in:fly={rise(i)}>
          <span class="a-time"></span>
          <span class="a-ico"><Icon name={s.icon} size={14} /></span>
          <span class="a-title">{s.title}</span>
          <span class="a-meta tnum count"><Icon name="flame" size={11} /> {s.count} in a row</span>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="a-meta">A routine that repeats builds its own streak — and letting one go never breaks it.</p>
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
  }
  .a-title {
    display: inline-flex;
  }
  .flame {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: var(--sunken);
    color: var(--ink-3);
  }
  .flame.lit {
    background: color-mix(in srgb, var(--lume) 18%, transparent);
    color: var(--lume);
  }
  .beads {
    display: flex;
    gap: 5px;
  }
  .beads i {
    display: grid;
    place-items: center;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--line-strong);
    color: var(--ink-3);
  }
  .beads i.done {
    background: var(--lume);
    box-shadow: 0 0 6px color-mix(in srgb, var(--lume) 60%, transparent);
  }
  .beads i.rest {
    background: color-mix(in srgb, var(--lume) 22%, transparent);
  }
  .beads i.open {
    background: transparent;
    box-shadow: inset 0 0 0 1.5px var(--ink-3);
  }
  .count {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    white-space: nowrap;
  }
</style>
