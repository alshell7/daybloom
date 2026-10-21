<script lang="ts">
  // Backlog tasks by id, each with "Add to today": the first free time that fits (the next day
  // with room when today is full). Ids that name nothing are left out; a task that already has
  // a day shows where it went instead of a button.
  import type { ComponentRenderProps } from '@openuidev/svelte-lang';
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { act, blockOf, fmt, type Did } from '../../lib/ai/genui/act';
  import { valid } from '../../lib/ai/genui/read';
  import { BacklogItemsProps } from '../../lib/ai/genui/schema';
  import { dayWord } from '../../lib/assistant/tools';
  import { dueLabel } from '../../lib/backlog';
  import { categoryColor } from '../../lib/engine/categories';
  import { formatDuration, MINUTE } from '../../lib/engine/time';
  import Icon from '../../lib/Icon.svelte';
  import { tasks } from '../../lib/stores/tasks.svelte';
  import { view } from '../../lib/stores/view.svelte';

  let { props }: ComponentRenderProps<Record<string, unknown>> = $props();
  const p = $derived(valid(BacklogItemsProps, props));
  let did = $state<Record<string, Did>>({});

  const items = $derived(
    [...new Set((p?.ids ?? []).map((id) => id.trim().replace(/^id\s*[=:]\s*/i, '')))]
      .map((id) => tasks.get(id))
      .filter((t) => !!t && !t.doneAt)
      .slice(0, 6) as NonNullable<ReturnType<typeof tasks.get>>[],
  );
  const rise = (i: number) => ({ y: 6, delay: Math.min(i, 5) * 35, duration: view.reducedMotion ? 0 : 240, easing: cubicOut });

  function add(id: string) {
    const r = act.schedule(id);
    if (r) did = { ...did, [id]: r };
  }

  function undo(id: string) {
    did[id]?.undo();
    const { [id]: _, ...rest } = did;
    did = rest;
  }
</script>

{#if items.length}
  <div class="a-card gu-flat backlog">
    <p class="a-label" class:auto={!p?.title?.trim()}><Icon name="inbox" size={14} stroke={2} /> {p?.title?.trim().slice(0, 50) || 'From your backlog'}</p>
    <ul class="a-list">
      {#each items as t, i (t.id)}
        {@const b = t.date ? blockOf(`task:${t.id}@${t.date}`) : null}
        <li class="a-row static item" style:--c={categoryColor(t.category, view.finish.dark)} in:fly={rise(i)}>
          <span class="a-ico" class:lume={!!b}><Icon name={b ? 'check' : t.icon} size={14} stroke={b ? 2.6 : 2} /></span>
          <span class="body">
            <span class="a-title two">{t.title}</span>
            <span class="a-meta">
              {#if b}On your dial {dayWord(b.date)}{b.floating ? '' : ` at ${fmt(b.startMs)}`}{:else}{formatDuration(t.duration * MINUTE)}{t.due ? ` · ${dueLabel(t.due, view.today)}` : ''}{/if}
            </span>
          </span>
          {#if did[t.id]}
            <button class="a-chip quiet sm" onclick={() => undo(t.id)}><Icon name="undo" size={13} /> Undo</button>
          {:else if !b}
            <button class="a-chip sm" onclick={() => add(t.id)}><Icon name="plus" size={13} stroke={2.2} /> Add to today</button>
          {:else}
            <span></span>
          {/if}
        </li>
      {/each}
    </ul>
  </div>
{/if}

<style>
  .item {
    grid-template-columns: 28px minmax(0, 1fr) auto;
  }
  .body {
    display: grid;
    min-width: 0;
  }
  /* Long titles wrap to two lines instead of cutting off. */
  .two {
    white-space: normal;
    overflow-wrap: anywhere;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }
</style>
