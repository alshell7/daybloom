<script lang="ts">
  import Icon from '../lib/Icon.svelte';
  import Rolling from '../lib/dial/Rolling.svelte';
  import { rhythm } from '../lib/streaks';
  import { clock } from '../lib/stores/clock.svelte';
  import { taskFile } from '../lib/stores/tasks.svelte';
  import { view } from '../lib/stores/view.svelte';
  import { fromISODate } from '../lib/engine/time';

  // Your rhythm: seven beads for the last seven days. Lit = something finished, a moon = a
  // rest day you'd earned, hollow = today, still open. Nothing here ever turns red.
  const r = $derived((clock.zone, rhythm(taskFile.value.tasks, clock.minute)));
  const label = $derived(r.current === 0 ? 'Start a rhythm today' : `${r.current}-day rhythm`);
</script>

<button class="rhythm" class:alive={r.current > 0} onclick={() => (view.sheet = { kind: 'insights' })} title={`Best: ${r.best} days${r.rest ? ` · ${r.rest} rest ${r.rest === 1 ? 'day' : 'days'} banked` : ''}`}>
  <span class="flame" class:lit={r.countedToday}><Icon name="flame" size={14} stroke={2.1} /></span>
  <span class="label tnum">
    {#if r.current > 0}<Rolling text={String(r.current)} reduced={view.reducedMotion} />-day rhythm{:else}{label}{/if}
  </span>
  <span class="beads" aria-hidden="true">
    {#each r.beads as b (b.date)}
      <i class={b.state} title={fromISODate(b.date).toLocaleDateString(undefined, { weekday: 'short' })}>
        {#if b.state === 'rest'}<Icon name="moon" size={8} stroke={2.6} />{/if}
      </i>
    {/each}
  </span>
  {#if r.rest}<span class="rest tnum" title="Rest days banked">+{r.rest}</span>{/if}
</button>

<style>
  .rhythm {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 8px;
    margin: -2px -8px 0;
    border-radius: var(--r-sm);
    font-size: var(--t-xs);
    color: var(--ink-3);
    text-align: left;
    transition: background var(--dur-1) var(--ease-out);
  }
  .rhythm:hover {
    background: var(--sunken);
  }
  .rhythm.alive {
    color: var(--ink-2);
  }
  .flame {
    display: grid;
    color: var(--ink-3);
    transition: color var(--dur-3) var(--ease-out);
  }
  .flame.lit {
    color: var(--lume);
    animation: lit 0.6s var(--ease-out);
  }
  @keyframes lit {
    40% {
      transform: scale(1.35) rotate(-8deg);
    }
  }
  .label {
    display: inline-flex;
    font-weight: 500;
    white-space: nowrap;
  }
  .beads {
    display: flex;
    gap: 4px;
    margin-left: auto;
  }
  .beads i {
    display: grid;
    place-items: center;
    width: 11px;
    height: 11px;
    border-radius: 50%;
    background: var(--line);
    color: var(--ink-3);
    transition:
      background var(--dur-3) var(--ease-out),
      box-shadow var(--dur-3) var(--ease-out);
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
  .rest {
    color: var(--ink-3);
  }
</style>
