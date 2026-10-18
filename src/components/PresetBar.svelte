<script lang="ts">
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import Icon from '../lib/Icon.svelte';
  import Segmented from './Segmented.svelte';
  import { PRESET_ORDER, PRESETS } from '../lib/presets';
  import { settings } from '../lib/stores/settings.svelte';
  import { timer, timerFile } from '../lib/stores/timer.svelte';
  import { view } from '../lib/stores/view.svelte';

  const preset = $derived(settings.value.preset);
  const QUICK = [5, 10, 15, 25, 45, 60];
  const cycles = $derived(settings.value.cycles);
  const doneToday = $derived(timerFile.value.doneToday.date === view.today ? timerFile.value.doneToday.count : 0);

  function startCountdown(min: number) {
    const cur = view.now.current;
    timer.startCountdown(min, cur && !cur.done ? cur.title : `${min} minutes`, cur?.category ?? 'focus', cur?.icon ?? 'clock');
  }
</script>

<div class="presets">
  <Segmented
    label="Dial"
    value={preset}
    options={PRESET_ORDER.map((id, i) => ({ value: id, label: PRESETS[id].name, title: `${PRESETS[id].hint} · ${i + 1}` }))}
    onchange={(id) => (settings.value.preset = id)}
  />

  {#key preset}
    <div class="sub" in:fly={{ y: 6, duration: view.reducedMotion ? 0 : 260, easing: cubicOut }}>
      {#if preset === 'timer60' && !timer.active}
        <span class="hint lead">Time-box it:</span>
        {#each QUICK as m (m)}
          <button class="chip tnum" onclick={() => startCountdown(m)}>{m}m</button>
        {/each}
      {:else if preset === 'chrono' && !timer.active}
        <button class="btn btn-primary" onclick={() => timer.startCycles(cycles, view.now.current?.title ?? 'Focus')}>
          <Icon name="play" size={14} stroke={2.4} />
          {cycles.rounds} × {cycles.focus}m focus
        </button>
        <span class="hint">{cycles.short}m breaks · {cycles.long}m long break</span>
      {:else if (preset === 'timer60' || preset === 'chrono') && timer.active}
        <button class="chip" onclick={() => timer.addMinutes(5)}>+5m</button>
        <button class="chip" onclick={() => timer.addMinutes(-5)}>−5m</button>
        {#if doneToday}
          <span class="pips" aria-label={`${doneToday} focus rounds today`}>
            {#each Array(Math.min(doneToday, 12)) as _, i (i)}<i></i>{/each}
          </span>
        {/if}
      {:else}
        <span class="hint">{PRESETS[preset].hint}</span>
      {/if}
    </div>
  {/key}
</div>

<style>
  .presets {
    display: grid;
    justify-items: center;
    gap: var(--s-3);
  }
  .sub {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--s-2);
    min-height: 36px;
  }
  .hint {
    color: var(--ink-3);
    font-size: var(--t-sm);
  }
  @media (max-width: 860px) {
    .lead {
      flex-basis: 100%;
      text-align: center;
    }
  }
  .chip {
    height: 30px;
    padding: 0 var(--s-3);
    border-radius: var(--r-pill);
    border: 1px solid var(--line-strong);
    font-family: var(--font-ui);
    font-size: var(--t-sm);
    transition:
      background var(--dur-1) var(--ease-out),
      border-color var(--dur-1) var(--ease-out),
      transform var(--dur-1) var(--ease-out);
  }
  .chip:hover {
    background: var(--raised);
    border-color: var(--ink-3);
  }
  .chip:active {
    transform: scale(0.95);
  }
  .pips {
    display: flex;
    gap: 4px;
    margin-left: var(--s-2);
  }
  .pips i {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--lume);
  }
</style>
