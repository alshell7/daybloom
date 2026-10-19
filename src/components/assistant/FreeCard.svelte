<script lang="ts">
  // Free time on a day: a strip from now (or wake) to bedtime with the planned blocks in
  // their colours and the free stretches left bare (dotted), then the stretches themselves
  // with a way to use each one.
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { createFromRange } from '../../lib/actions';
  import { dayBlocksOf, dayWord } from '../../lib/assistant/tools';
  import { freeSpans, openItems, planOrder } from '../../lib/backlog';
  import { blockKey } from '../../lib/engine/blocks';
  import { formatDuration, formatTime, MINUTE, minutesOfDay } from '../../lib/engine/time';
  import type { ISODate, Task } from '../../lib/engine/types';
  import Icon from '../../lib/Icon.svelte';
  import { sounds } from '../../lib/sound';
  import { clock } from '../../lib/stores/clock.svelte';
  import { taskFile, tasks } from '../../lib/stores/tasks.svelte';
  import { view } from '../../lib/stores/view.svelte';

  let { card }: { card: { kind: 'free'; date: ISODate; fromMs: number; toMs: number; minutes: number } } = $props();

  /** "Show shorter stretches" lowers the bar right here. */
  let shorter = $state<number | null>(null);
  const minutes = $derived(shorter ?? card.minutes);
  const busy = $derived((clock.zone, dayBlocksOf(card.date).timed.filter((b) => b.endMs > card.fromMs && b.startMs < card.toMs)));
  const all = $derived(freeSpans(busy, card.fromMs, card.toMs).filter((g) => g.endMs - g.startMs >= 5 * MINUTE));
  const gaps = $derived(all.filter((g) => g.endMs - g.startMs >= minutes * MINUTE));
  const span = $derived(Math.max(MINUTE, card.toMs - card.fromMs));
  const pct = (ms: number) => `${(Math.max(0, Math.min(1, (ms - card.fromMs) / span)) * 100).toFixed(2)}%`;
  const fmt = (ms: number) => formatTime(ms, view.hour12);
  const rise = (i: number) => ({ y: 6, delay: Math.min(i, 4) * 30, duration: view.reducedMotion ? 0 : 220, easing: cubicOut });
  const ordered = $derived(planOrder(taskFile.value.tasks, view.today).filter((t) => t.list !== 'someday'));

  /** The first backlog item that fits this stretch. */
  function fits(len: number): Task | undefined {
    return ordered.find((t) => t.duration * MINUTE <= len - 5 * MINUTE) ?? openItems(taskFile.value.tasks).find((t) => t.duration * MINUTE <= len);
  }

  function fill(t: Task, startMs: number) {
    tasks.schedule(t.id, card.date, Math.round(minutesOfDay(Math.ceil(startMs / (5 * MINUTE)) * 5 * MINUTE)));
    view.setDate(card.date);
    view.selected = blockKey(t.id, card.date);
    sounds.tick();
  }

  function blockIt(startMs: number, len: number) {
    const s = Math.ceil(startMs / (5 * MINUTE)) * 5 * MINUTE;
    createFromRange(s, s + Math.min(len, Math.max(minutes, 30) * MINUTE));
  }
</script>

<div class="a-card free">
  <div class="strip" role="img" aria-label={`${dayWord(card.date)}: ${gaps.length} free ${gaps.length === 1 ? 'stretch' : 'stretches'}`}>
    {#each all as g (g.startMs)}
      <span class="gap" style:left={pct(g.startMs)} style:width={`calc(${pct(g.endMs)} - ${pct(g.startMs)})`}></span>
    {/each}
    {#each busy as b (b.key)}
      <span class="busy" class:done={b.done} style:--c={b.color} style:left={pct(b.startMs)} style:width={`calc(${pct(b.endMs)} - ${pct(b.startMs)})`} title={b.title}></span>
    {/each}
  </div>
  <div class="ends a-meta tnum"><span>{fmt(card.fromMs)}</span><span>{fmt(card.toMs)}</span></div>

  {#if gaps.length}
    <ul class="a-list">
      {#each gaps as g, i (g.startMs)}
        {@const len = g.endMs - g.startMs}
        {@const t = fits(len)}
        <li class="a-row static" in:fly={rise(i)}>
          <span class="a-time">{fmt(g.startMs)}</span>
          <span class="a-ico quiet dotted"><Icon name="circle-dashed" size={14} /></span>
          <span class="body">
            <span class="a-title tnum">{fmt(g.startMs)}–{fmt(g.endMs)}</span>
            <span class="a-meta tnum">{formatDuration(len)} free</span>
          </span>
          <span class="tools">
            {#if t}<button class="a-chip sm" onclick={() => fill(t, g.startMs)} title={`Put “${t.title}” here`}>{t.title.length > 16 ? `${t.title.slice(0, 15)}…` : t.title}</button>{/if}
            <button class="a-chip sm quiet" onclick={() => blockIt(g.startMs, len)}>Block it</button>
          </span>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="a-meta">No stretch of {formatDuration(minutes * MINUTE)} or more is free here.</p>
    {#if all.length && minutes > 15}
      <div class="a-actions">
        <button class="a-chip quiet" onclick={() => (shorter = 15)}><Icon name="circle-dashed" size={13} /> Show shorter stretches</button>
      </div>
    {/if}
  {/if}
</div>

<style>
  .strip {
    position: relative;
    height: 18px;
    border-radius: var(--r-pill);
    background: var(--sunken);
    overflow: hidden;
  }
  .busy {
    position: absolute;
    top: 3px;
    bottom: 3px;
    min-width: 3px;
    border-radius: 6px;
    background: var(--c);
  }
  .busy.done {
    background: color-mix(in srgb, var(--c) 50%, var(--surface));
    box-shadow: inset 0 0 0 1.5px var(--lume);
  }
  /* Free time stays bare: a dotted hairline, never a fill. */
  .gap {
    position: absolute;
    top: 50%;
    height: 0;
    border-top: 2px dotted var(--line-strong);
  }
  .ends {
    display: flex;
    justify-content: space-between;
    margin-top: -4px;
  }
  .body {
    display: grid;
    min-width: 0;
  }
  .tools {
    display: flex;
    gap: 4px;
  }
  .dotted {
    border: 1.5px dotted var(--line-strong);
    background: transparent;
  }
</style>
