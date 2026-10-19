<script lang="ts">
  // Tasks as rows: something just saved for later, the backlog, or search hits. Each row
  // offers the one next step that makes sense — place it today, tick it, or show it.
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { dayWord, firstFree } from '../../lib/assistant/tools';
  import { backlog, dueLabel, dueState, LISTS, type ListId } from '../../lib/backlog';
  import { blockKey } from '../../lib/engine/blocks';
  import { categoryColor } from '../../lib/engine/categories';
  import { occurrencesBetween } from '../../lib/engine/recurrence';
  import { addDays, formatDuration, formatMinutes, MINUTE } from '../../lib/engine/time';
  import type { Task } from '../../lib/engine/types';
  import Icon from '../../lib/Icon.svelte';
  import { sounds } from '../../lib/sound';
  import { clock } from '../../lib/stores/clock.svelte';
  import { tasks } from '../../lib/stores/tasks.svelte';
  import { view } from '../../lib/stores/view.svelte';

  let { card }: { card: { kind: 'items'; mode: 'captured' | 'backlog' | 'search' | 'done'; ids: string[]; list?: ListId | 'all'; query?: string } } = $props();

  const items = $derived(card.ids.map((id) => tasks.get(id)).filter((t): t is Task => !!t));
  const rise = (i: number) => ({ y: 6, delay: Math.min(i, 4) * 30, duration: view.reducedMotion ? 0 : 220, easing: cubicOut });
  const listName = (t: Task) => LISTS.find((l) => l.id === (t.list ?? 'inbox'))?.label ?? 'Inbox';

  /** Where it lives now: its next day/time on the dial, or its backlog list. */
  function where(t: Task): { text: string; date: string | null } {
    if (t.date === null) {
      if (t.doneAt) return { text: 'Done', date: null };
      const due = t.due ? ` · due ${dueLabel(t.due, view.today).toLowerCase()}` : '';
      return { text: `${listName(t)}${due}`, date: null };
    }
    const d = occurrencesBetween(t, view.today, addDays(view.today, 60))[0] ?? t.date;
    const start = t.overrides[d]?.start !== undefined ? t.overrides[d].start : t.start;
    return { text: `${dayWord(d)}${start == null ? ' · any time' : ` · ${formatMinutes(start, view.hour12)}`}`, date: d };
  }

  function placeToday(t: Task) {
    const start = firstFree(view.today, t.duration, clock.now);
    tasks.schedule(t.id, view.today, start);
    view.selected = blockKey(t.id, view.today);
    sounds.tick();
  }

  function show(t: Task, date: string) {
    view.setDate(date);
    view.selected = blockKey(t.id, date);
  }
</script>

<div class="a-card items">
  {#if items.length}
    <ul class="a-list">
      {#each items as t, i (t.id)}
        {@const w = where(t)}
        {@const color = categoryColor(t.category, view.finish.dark)}
        <li in:fly={rise(i)} class="a-row static" class:done={!!t.doneAt} style:--c={color}>
          <span class="a-time">{formatDuration(t.duration * MINUTE)}</span>
          <span class="a-ico" class:lume={!!t.doneAt}><Icon name={t.doneAt ? 'check' : t.icon} size={14} stroke={t.doneAt ? 2.6 : 2} /></span>
          <span class="body">
            <span class="a-title">{t.title || 'Untitled'}</span>
            <span class="a-meta" class:warm={t.date === null && !t.doneAt && (dueState(t.due, view.today) === 'today' || dueState(t.due, view.today) === 'overdue')}>{w.text}</span>
          </span>
          <span class="tools">
            {#if t.date === null && !t.doneAt}
              <button class="a-chip sm" onclick={() => placeToday(t)} title="Put it in the next free gap today">Today</button>
              <button class="a-chip sm icon" onclick={() => (backlog.complete(t.id), sounds.done())} aria-label={`${t.title} done`}><Icon name="check" size={13} stroke={2.4} /></button>
            {:else if t.date === null && t.doneAt}
              <button class="a-chip sm quiet" onclick={() => backlog.restore(t.id)}>Not done</button>
            {:else if w.date}
              <button class="a-chip sm quiet" onclick={() => show(t, w.date!)}>Show</button>
            {/if}
          </span>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="a-meta"><Icon name="leaf" size={13} /> Nothing waiting. Save things with “remember to…”.</p>
  {/if}

  {#if card.mode === 'captured' && items[0] && items[0].date === null}
    <div class="a-actions">
      {#if items[0].list !== 'someday'}
        <button class="a-chip quiet" onclick={() => backlog.moveTo(items[0].id, 'someday')}><Icon name="sunrise" size={13} /> Someday</button>
      {/if}
      {#if items[0].list !== 'next'}
        <button class="a-chip quiet" onclick={() => backlog.moveTo(items[0].id, 'next')}><Icon name="arrow-right" size={13} /> Next</button>
      {/if}
    </div>
  {/if}
  {#if card.mode !== 'search'}
    <div class="a-actions">
      <button class="a-chip quiet" onclick={() => (view.sheet = { kind: 'backlog' })}><Icon name="inbox" size={13} /> Open backlog</button>
    </div>
  {/if}
</div>

<style>
  .body {
    display: grid;
    min-width: 0;
  }
  .tools {
    display: flex;
    gap: 4px;
  }
  .warm {
    color: color-mix(in srgb, var(--warm) 70%, var(--ink));
  }
</style>
