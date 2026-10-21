<script lang="ts">
  // The free stretches on a day, found live (blocks, calendar events and salah are taken), long
  // enough for what they want to fit. "Add here" puts the block at the start of that stretch,
  // after checking it is still free; a block of that title already on the day is shown instead
  // of buttons, so the same card never adds it twice.
  import type { ComponentRenderProps } from '@openuidev/svelte-lang';
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { createFromRange } from '../../lib/actions';
  import { act, blockOf, dateOf, fit, fmt, gapsIn, onDay, windowOf, type Did, type Span } from '../../lib/ai/genui/act';
  import { getHost } from '../../lib/ai/genui/host';
  import { valid } from '../../lib/ai/genui/read';
  import { FreeSlotsProps } from '../../lib/ai/genui/schema';
  import { dayWord } from '../../lib/assistant/tools';
  import { busyBetween } from '../../lib/busy';
  import { addDays, formatDuration, MINUTE } from '../../lib/engine/time';
  import Icon from '../../lib/Icon.svelte';
  import { clock } from '../../lib/stores/clock.svelte';
  import { view } from '../../lib/stores/view.svelte';
  import Strip from './Strip.svelte';

  let { props }: ComponentRenderProps<Record<string, unknown>> = $props();
  const p = $derived(valid(FreeSlotsProps, props));
  const host = getHost();

  /** "Look at the next day" and "Shorter stretches" change the card right here. */
  let shift = $state(0);
  let shorter = $state(false);
  let did = $state<Did | null>(null);

  const title = $derived(p?.title?.trim().slice(0, 120) ?? '');
  const minutes = $derived(Math.max(5, Math.min(720, Math.round(p?.minutes ?? 30))));
  const need = $derived(shorter ? 15 : minutes);
  const date = $derived(addDays(dateOf(p?.date), shift));
  const span = $derived((clock.minute, windowOf(date, { from: shift ? null : p?.from, to: shift ? null : p?.to, fromNow: true })));
  const blocks = $derived((clock.minute, busyBetween(span.startMs, span.endMs, { land: false })));
  const all = $derived(gapsIn(date, span, 5));
  const gaps = $derived(all.filter((g) => g.endMs - g.startMs >= need * MINUTE).slice(0, 4));
  const lit = $derived(new Set(gaps.map((g) => g.startMs)));
  const placed = $derived(did?.key ? blockOf(did.key) : title && host.at ? onDay(title, date, host.at) : null);
  const rise = (i: number) => ({ y: 6, delay: Math.min(i, 4) * 30, duration: view.reducedMotion ? 0 : 220, easing: cubicOut });

  function add(g: Span) {
    const len = Math.min(minutes, Math.round((g.endMs - g.startMs) / MINUTE));
    const s = fit(date, len, { wantMs: g.startMs });
    if (s === null || s >= g.endMs) return;
    if (!title) {
      createFromRange(s, s + len * MINUTE);
      return;
    }
    did = act.place([{ title, minutes: len, date, startMs: s }]);
  }

  function undo() {
    did?.undo();
    did = null;
  }
</script>

{#if p && span.endMs > span.startMs}
  <div class="a-card gu-flat free">
    <p class="a-label">
      <Icon name="circle-dashed" size={14} stroke={2} />
      Free {dayWord(date)}{title ? ` for “${title.length > 28 ? `${title.slice(0, 27)}…` : title}”` : ''}{need >= 15 ? ` · ${formatDuration(need * MINUTE)}+` : ''}
    </p>
    <Strip {span} {blocks} gaps={all} {lit} nowMs={date === view.today ? clock.now : null} />

    {#if placed}
      <div class="landed" style:--c={placed.color}>
        <span class="a-ico lume"><Icon name="check" size={14} stroke={2.6} /></span>
        <span class="body">
          <span class="a-title">{placed.title}</span>
          <span class="a-meta">On your dial {dayWord(placed.date)} at {fmt(placed.startMs)}</span>
        </span>
        {#if did}
          <button class="a-chip quiet sm" onclick={undo}><Icon name="undo" size={13} /> Undo</button>
        {:else}
          <button class="a-chip quiet sm" onclick={() => act.show(placed.key)}>Show</button>
        {/if}
      </div>
    {:else if gaps.length}
      <ul class="a-list">
        {#each gaps as g, i (g.startMs)}
          <li class="a-row static" in:fly={rise(i)}>
            <span class="a-time">{fmt(g.startMs)}</span>
            <span class="a-ico quiet dotted"><Icon name="circle-dashed" size={14} /></span>
            <span class="body">
              <span class="a-title tnum">{fmt(g.startMs)}–{fmt(g.endMs)}</span>
              <span class="a-meta">{formatDuration(g.endMs - g.startMs)} free</span>
            </span>
            <button class="a-chip sm" class:primary={i === 0} onclick={() => add(g)}><Icon name="plus" size={13} stroke={2.2} /> {title ? 'Add here' : 'Block it'}</button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="a-meta">No free stretch of {formatDuration(need * MINUTE)} left {dayWord(date)}.</p>
      <div class="a-actions">
        {#if !shorter && minutes > 15 && all.some((g) => g.endMs - g.startMs >= 15 * MINUTE)}
          <button class="a-chip quiet" onclick={() => (shorter = true)}><Icon name="circle-dashed" size={13} /> Shorter stretches</button>
        {/if}
        {#if shift < 6}
          <button class="a-chip quiet" onclick={() => shift++}><Icon name="chevron-right" size={13} /> Look at {dayWord(addDays(date, 1))}</button>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .body {
    display: grid;
    min-width: 0;
  }
  .dotted {
    border: 1.5px dotted var(--line-strong);
    background: transparent;
  }
  .landed {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 10px;
    align-items: center;
    padding: 6px 8px;
    border-radius: var(--r-sm);
    background: color-mix(in srgb, var(--c) 10%, transparent);
  }
</style>
