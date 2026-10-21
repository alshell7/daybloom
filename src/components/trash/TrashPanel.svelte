<script lang="ts">
  // The Trash: everything you deleted in the last 30 days, newest first, grouped by when. Each
  // row puts its block back with one tap (it flies home and the day shows where it landed) or
  // lets it go for good after a second tap. Nothing here is urgent: items leave by themselves
  // after 30 days.
  import { flip } from 'svelte/animate';
  import { cubicOut } from 'svelte/easing';
  import { fade, fly } from 'svelte/transition';
  import { blockKey } from '../../lib/engine/blocks';
  import { categoryColor } from '../../lib/engine/categories';
  import { formatDayShort, formatMinutes, isoOf } from '../../lib/engine/time';
  import Icon from '../../lib/Icon.svelte';
  import { sounds } from '../../lib/sound';
  import { clock } from '../../lib/stores/clock.svelte';
  import { settings } from '../../lib/stores/settings.svelte';
  import { trash, trashFile, TRASH_DAYS, type TrashItem } from '../../lib/stores/trash.svelte';
  import { view } from '../../lib/stores/view.svelte';
  import Panel from '../Panel.svelte';

  const open = $derived(view.sheet?.kind === 'trash');
  const rm = $derived(view.reducedMotion);
  let q = $state('');
  /** The row (or 'all') waiting for its second tap to delete forever. */
  let confirm = $state<string | null>(null);

  const DAY = 86_400_000;
  const items = $derived.by(() => {
    const words = q.trim().toLowerCase();
    return [...trashFile.value.items].filter((x) => !words || x.task.title.toLowerCase().includes(words)).sort((a, b) => b.at - a.at);
  });
  const groups = $derived.by(() => {
    const today = isoOf(clock.minute);
    const out: { label: string; items: TrashItem[] }[] = [];
    for (const it of items) {
      const d = isoOf(it.at);
      const age = Math.floor((clock.minute - it.at) / DAY);
      const label = d === today ? 'Today' : age < 2 ? 'Yesterday' : age < 7 ? 'This week' : 'Earlier';
      const g = out.find((x) => x.label === label);
      if (g) g.items.push(it);
      else out.push({ label, items: [it] });
    }
    return out;
  });

  function when(it: TrashItem): string {
    const t = it.task;
    const day = it.date ?? t.date;
    if (!day) return 'Backlog';
    const { dow, day: n } = formatDayShort(day);
    const at = t.start == null ? 'any time' : formatMinutes(it.date ? (t.overrides[it.date]?.start ?? t.start) ?? t.start : t.start, view.hour12);
    return `${dow} ${n} · ${at}${it.date ? ' · one day of a repeat' : t.recurrence ? ' · repeats' : ''}`;
  }

  function ago(at: number): string {
    const m = Math.floor((clock.minute - at) / 60_000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return d === 1 ? 'yesterday' : `${d} days ago`;
  }

  function restore(e: MouseEvent, it: TrashItem) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const t = trash.restore(it.id);
    if (!t) return;
    view.spark(r.left + r.width / 2, r.top + r.height / 2, categoryColor(t.category, view.finish.dark));
    if (settings.value.sound) sounds.done();
    const day = it.date ?? t.date;
    if (day) {
      view.setDate(day);
      view.selected = blockKey(t.id, day);
    }
    view.say(`“${t.title || 'Block'}” is back${day ? '' : ' in your backlog'}.`, undefined, 4000);
  }

  function forget(it: TrashItem) {
    if (confirm !== it.id) {
      confirm = it.id;
      return;
    }
    confirm = null;
    trash.forget(it.id);
  }

  function emptyAll() {
    if (confirm !== 'all') {
      confirm = 'all';
      return;
    }
    confirm = null;
    trash.empty();
  }
</script>

{#if open}
  <Panel title="Trash" onclose={() => ((view.sheet = null), (confirm = null))}>
    <div class="tr">
      <p class="lead">Deleted blocks wait here for {TRASH_DAYS} days. Put anything back with one tap.</p>

      {#if trashFile.value.items.length > 6}
        <label class="find">
          <Icon name="search" size={14} />
          <input type="search" bind:value={q} placeholder="Find in the Trash" aria-label="Find in the Trash" />
        </label>
      {/if}

      {#if !items.length}
        <div class="empty" in:fade={{ duration: rm ? 0 : 240 }}>
          <span class="bin"><Icon name="trash-ui" size={26} stroke={1.6} /></span>
          <p>{q ? `Nothing called “${q}” in the Trash.` : 'The Trash is empty.'}</p>
          <small>When you delete a block, it waits here in case you change your mind.</small>
        </div>
      {/if}

      {#each groups as g (g.label)}
        <section>
          <h4>{g.label}</h4>
          <ul>
            {#each g.items as it (it.id)}
              {@const t = it.task}
              {@const left = trash.daysLeft(it, clock.minute)}
              <li
                style:--c={categoryColor(t.category, view.finish.dark)}
                animate:flip={{ duration: rm ? 0 : 260, easing: cubicOut }}
                in:fly={{ y: 8, duration: rm ? 0 : 260, easing: cubicOut }}
                out:fly={{ x: -28, duration: rm ? 0 : 240, easing: cubicOut }}
              >
                <span class="ico"><Icon name={t.icon} size={15} stroke={2} /></span>
                <span class="txt">
                  <b>{t.title || 'Untitled block'}</b>
                  <small class="tnum">{when(it)}</small>
                  <small class="tnum dim">Deleted {ago(it.at)} · {left <= 1 ? 'leaves tomorrow' : `${left} days left`}</small>
                </span>
                <button class="btn btn-soft sm" onclick={(e) => restore(e, it)}><Icon name="undo" size={13} /> Restore</button>
                <button class="icon-btn forget" class:sure={confirm === it.id} onclick={() => forget(it)} aria-label={confirm === it.id ? `Delete ${t.title} forever` : `Delete ${t.title} forever…`} title={confirm === it.id ? 'Tap again to delete forever' : 'Delete forever'}>
                  {#if confirm === it.id}<span in:fade={{ duration: rm ? 0 : 140 }}>Forever?</span>{:else}<Icon name="x" size={14} />{/if}
                </button>
              </li>
            {/each}
          </ul>
        </section>
      {/each}
    </div>

    {#snippet footer()}
      <span class="count tnum">{trashFile.value.items.length} {trashFile.value.items.length === 1 ? 'item' : 'items'}</span>
      <span class="grow"></span>
      {#if trashFile.value.items.length}
        <button class="btn" class:btn-quiet={confirm !== 'all'} class:btn-danger={confirm === 'all'} onclick={emptyAll}>
          {confirm === 'all' ? 'Delete all forever' : 'Empty the Trash'}
        </button>
      {/if}
    {/snippet}
  </Panel>
{/if}

<style>
  .tr {
    display: grid;
    gap: var(--s-4);
  }
  .lead {
    margin: 0;
    font-size: var(--t-sm);
    line-height: 1.5;
    color: var(--ink-2);
  }
  .find {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 34px;
    padding: 0 12px;
    border-radius: var(--r-pill);
    border: 1px solid var(--line);
    background: var(--sunken);
    color: var(--ink-3);
  }
  .find input {
    flex: 1;
    min-width: 0;
    border: 0;
    background: none;
    color: var(--ink);
    font: inherit;
    font-size: var(--t-sm);
    outline: none;
  }
  section {
    display: grid;
    gap: 6px;
  }
  h4 {
    margin: 0;
    font-size: var(--t-xs);
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--ink-3);
  }
  ul {
    display: grid;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    padding: 9px 10px;
    border-radius: var(--r-md);
    background: var(--raised);
    border: 1px solid var(--line);
  }
  .ico {
    display: grid;
    place-items: center;
    flex: none;
    width: 30px;
    height: 30px;
    border-radius: 10px;
    color: var(--c);
    background: color-mix(in srgb, var(--c) 14%, transparent);
  }
  .txt {
    display: grid;
    flex: 1;
    min-width: 0;
    gap: 1px;
  }
  .txt b {
    overflow: hidden;
    font-size: var(--t-sm);
    font-weight: 600;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .txt small {
    overflow: hidden;
    font-size: var(--t-xs);
    color: var(--ink-2);
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .txt .dim {
    color: var(--ink-3);
  }
  .sm {
    flex: none;
    height: 30px;
    padding: 0 10px;
    font-size: var(--t-xs);
  }
  .forget {
    flex: none;
    width: auto;
    min-width: 30px;
    height: 30px;
    padding: 0 6px;
    color: var(--ink-3);
    font-size: var(--t-xs);
    transition:
      color var(--dur-2) var(--ease-out),
      background var(--dur-2) var(--ease-out);
  }
  .forget.sure {
    color: var(--danger, var(--ink));
    background: color-mix(in srgb, var(--danger, #d9467e) 12%, transparent);
  }
  .empty {
    display: grid;
    justify-items: center;
    gap: 6px;
    padding: var(--s-6) 0;
    text-align: center;
    color: var(--ink-2);
  }
  .empty p {
    margin: 0;
    font-size: var(--t-sm);
  }
  .empty small {
    max-width: 30ch;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .bin {
    display: grid;
    place-items: center;
    width: 56px;
    height: 56px;
    border-radius: 18px;
    background: var(--sunken);
    color: var(--ink-3);
  }
  .count {
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .grow {
    flex: 1;
  }
</style>
