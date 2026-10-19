<script lang="ts">
  // "Plan my day": backlog items proposed into free gaps, drawn dashed on a tiny dial
  // (dashes mean provisional), placed with one tap — each draws onto the real dial in turn.
  import { untrack } from 'svelte';
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { dayBlocksOf, dayWord, planFor } from '../../lib/assistant/tools';
  import { backlog } from '../../lib/backlog';
  import { categoryColor } from '../../lib/engine/categories';
  import { formatDuration, formatTime, MINUTE, minutesOfDay, startOfDayMs } from '../../lib/engine/time';
  import type { BacklogList, ISODate } from '../../lib/engine/types';
  import Icon from '../../lib/Icon.svelte';
  import { clock } from '../../lib/stores/clock.svelte';
  import { settings } from '../../lib/stores/settings.svelte';
  import { tasks } from '../../lib/stores/tasks.svelte';
  import { view } from '../../lib/stores/view.svelte';
  import MiniDial, { arcsFor, type Arc } from './MiniDial.svelte';

  let { card }: { card: { kind: 'plan'; date: ISODate } } = $props();

  let shuffle = $state(0);
  let plan = $state(untrack(() => planFor(card.date, 0)));
  let step = $state<'proposed' | 'placing' | 'placed' | 'undone'>('proposed');
  let undo: (() => void) | null = null;

  const day = $derived((clock.zone, dayBlocksOf(card.date)));
  const dark = $derived(view.finish.dark);
  const s0 = $derived(startOfDayMs(card.date));
  const arcs = $derived.by(() => {
    const own: Arc[] = arcsFor(day.timed, card.date);
    if (step !== 'proposed') return own;
    return [
      ...own,
      ...plan.items.map((it) => ({
        key: `plan:${it.taskId}`,
        start: (it.startMs - s0) / MINUTE,
        end: (it.endMs - s0) / MINUTE,
        color: categoryColor(it.category, dark),
        provisional: true,
      })),
    ];
  });
  const isToday = $derived(card.date === view.today);
  const fmt = (ms: number) => formatTime(ms, view.hour12);
  const rise = (i: number) => ({ y: 6, delay: Math.min(i, 4) * 30, duration: view.reducedMotion ? 0 : 220, easing: cubicOut });

  function reshuffle() {
    shuffle++;
    plan = planFor(card.date, shuffle);
  }

  async function place() {
    if (!plan.items.length) return;
    const prev = plan.items.map((it) => {
      const t = tasks.get(it.taskId);
      return { id: it.taskId, list: t?.list as BacklogList | undefined, order: t?.order };
    });
    step = 'placing';
    await backlog.place(plan.items);
    step = 'placed';
    undo = () => {
      for (const p of prev) tasks.update(p.id, { date: null, start: null, list: p.list, order: p.order });
    };
  }

  function unplace() {
    undo?.();
    undo = null;
    step = 'undone';
    plan = planFor(card.date, shuffle);
  }
</script>

<div class="a-card plan">
  <div class="top">
    <MiniDial {arcs} finish={view.finish} wake={settings.value.wake} sleep={settings.value.sleep} nowMin={isToday ? minutesOfDay(clock.minute) : null} size={104} />
    <div class="side">
      <strong class="a-title">{plan.items.length ? `${plan.items.length} for ${dayWord(card.date)}` : 'Nothing fits'}</strong>
      <span class="a-meta tnum">
        {#if plan.items.length}
          {formatDuration(plan.usedMs)} of {formatDuration(plan.freeMs)} free · room to breathe between
        {:else}
          {plan.freeMs < 15 * MINUTE ? 'No free time left' : 'Nothing in the backlog fits the gaps'}
        {/if}
      </span>
      {#if plan.skipped.length}<span class="a-meta">{plan.skipped.length} didn't fit — they'll wait.</span>{/if}
    </div>
  </div>

  {#if plan.items.length}
    {#key shuffle}
      <ul class="a-list">
        {#each plan.items as it, i (it.taskId)}
          <li class="a-row static" style:--c={categoryColor(it.category, dark)} in:fly={rise(i)}>
            <span class="a-time">{fmt(it.startMs)}</span>
            <span class="a-ico" class:dashed={step === 'proposed'}><Icon name={it.icon} size={14} /></span>
            <span class="body">
              <span class="a-title">{it.title}</span>
              <span class="a-meta">{formatDuration(it.duration * MINUTE)}{it.why ? ` · ${it.why}` : ''}</span>
            </span>
            <span></span>
          </li>
        {/each}
      </ul>
    {/key}
    <div class="a-actions">
      {#if step === 'proposed' || step === 'undone'}
        <button class="a-chip primary" onclick={place}><Icon name="wand-sparkles" size={13} /> Place {plan.items.length} {plan.items.length === 1 ? 'block' : 'blocks'}</button>
        <button class="a-chip quiet" onclick={reshuffle}><Icon name="shuffle" size={13} /> Shuffle</button>
      {:else if step === 'placing'}
        <span class="a-meta">Placing…</span>
      {:else}
        <span class="a-meta"><Icon name="circle-check" size={12} /> Placed on your dial.</span>
        <button class="a-chip quiet" onclick={unplace}><Icon name="undo" size={13} /> Undo</button>
      {/if}
    </div>
  {:else}
    <div class="a-actions">
      <button class="a-chip quiet" onclick={() => (view.sheet = { kind: 'backlog' })}><Icon name="inbox" size={13} /> Open backlog</button>
    </div>
  {/if}
</div>

<style>
  .top {
    display: flex;
    gap: var(--s-4);
    align-items: center;
  }
  .side {
    display: grid;
    gap: 4px;
    min-width: 0;
  }
  .body {
    display: grid;
    min-width: 0;
  }
  /* Dashes mean provisional: proposed, not placed yet. */
  .dashed {
    background: transparent;
    border: 1.5px dashed color-mix(in srgb, var(--c) 60%, transparent);
  }
</style>
