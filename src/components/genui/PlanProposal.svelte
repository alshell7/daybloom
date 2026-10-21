<script lang="ts">
  // A plan to accept: the model's proposed blocks laid out live into free time (each at its
  // asked time when that is free, else after the one before; never on a meeting or salah),
  // drawn dashed on a tiny dial because they're provisional. Tick boxes choose which; one
  // "Place these" puts them on the real dial with one Undo. Backlog items keep their own task.
  import type { ComponentRenderProps } from '@openuidev/svelte-lang';
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { act, blockOf, dateOf, fmt, layout, minutesOf, onDay, styleOf, type Did } from '../../lib/ai/genui/act';
  import { each, valid } from '../../lib/ai/genui/read';
  import { PlanItemProps, PlanProposalProps } from '../../lib/ai/genui/schema';
  import { dayBlocksOf, dayWord } from '../../lib/assistant/tools';
  import { categoryColor } from '../../lib/engine/categories';
  import { addDays, formatDuration, MINUTE, minutesOfDay, startOfDayMs } from '../../lib/engine/time';
  import type { Block, CategoryId } from '../../lib/engine/types';
  import Icon from '../../lib/Icon.svelte';
  import { clock } from '../../lib/stores/clock.svelte';
  import { settings } from '../../lib/stores/settings.svelte';
  import { tasks } from '../../lib/stores/tasks.svelte';
  import { view } from '../../lib/stores/view.svelte';
  import MiniDial, { arcsFor, type Arc } from '../assistant/MiniDial.svelte';

  let { props }: ComponentRenderProps<Record<string, unknown>> = $props();
  const head = $derived(valid(PlanProposalProps.omit({ items: true }), props));

  let shift = $state(0);
  /** Items ticked off (left out of the plan). */
  let off = $state<number[]>([]);
  let did = $state<Did | null>(null);

  const date = $derived(addDays(dateOf(head?.date), shift));
  const dark = $derived(view.finish.dark);

  interface Item {
    i: number;
    title: string;
    minutes: number;
    startMin: number | null;
    category: CategoryId;
    icon: string;
    id: string | null;
    why: string | null;
    /** Already on the dial (placed from this card, or the backlog task got a day). */
    there: Block | null;
  }

  const items = $derived.by((): Item[] => {
    void clock.minute;
    return each(PlanItemProps, (props as { items?: unknown }).items, 8)
      .map((it, i) => {
        const t = it.id ? tasks.get(it.id.trim()) : undefined;
        const task = t && !t.doneAt ? t : undefined;
        const title = (task?.title ?? it.title).trim().slice(0, 120);
        const style = task ? { category: task.category, icon: task.icon } : styleOf(title, it.category);
        // Already on the dial: a backlog task that got a day, a block named by its key, or one of that title that day.
        const there = task?.date ? blockOf(`task:${task.id}@${task.date}`) : (it.id && /^(task|cal):/.test(it.id.trim()) ? blockOf(it.id) : null) ?? onDay(title, date, 0);
        return {
          i,
          title,
          minutes: task ? task.duration : Math.max(5, Math.min(720, Math.round(it.minutes))),
          startMin: minutesOf(it.start),
          ...style,
          id: task?.id ?? null,
          why: it.why?.trim().slice(0, 60) || null,
          there,
        };
      })
      .filter((it) => it.title);
  });

  const open = $derived(items.filter((it) => !it.there));
  const chosen = $derived(open.filter((it) => !off.includes(it.i)));
  const laid = $derived(layout(chosen, date));
  const at = $derived(new Map(laid.map((l) => [l.item.i, l.startMs])));
  const fits = $derived(laid.filter((l) => l.startMs !== null) as { item: Item; startMs: number }[]);
  const skipped = $derived(laid.length - fits.length);

  const s0 = $derived(startOfDayMs(date));
  const arcs = $derived.by((): Arc[] => {
    const own = arcsFor((clock.zone, dayBlocksOf(date).timed), date);
    return [
      ...own,
      ...fits.map((l) => ({
        key: `plan:${l.item.i}`,
        start: (l.startMs - s0) / MINUTE,
        end: (l.startMs + l.item.minutes * MINUTE - s0) / MINUTE,
        color: categoryColor(l.item.category, dark),
        provisional: true,
      })),
    ];
  });
  const total = $derived(fits.reduce((s, l) => s + l.item.minutes, 0));
  const span = $derived(fits.length ? `${fmt(Math.min(...fits.map((l) => l.startMs)))}–${fmt(Math.max(...fits.map((l) => l.startMs + l.item.minutes * MINUTE)))}` : '');
  const rise = (i: number) => ({ y: 6, delay: Math.min(i, 5) * 35, duration: view.reducedMotion ? 0 : 240, easing: cubicOut });

  function toggle(i: number) {
    off = off.includes(i) ? off.filter((x) => x !== i) : [...off, i];
  }

  function place() {
    if (!fits.length) return;
    did = act.place(fits.map((l) => ({ title: l.item.title, minutes: l.item.minutes, date, startMs: l.startMs, category: l.item.category, id: l.item.id })));
  }

  function undo() {
    did?.undo();
    did = null;
  }

  const placedNow = $derived(did?.keys?.map(blockOf).filter((b): b is Block => !!b) ?? []);
</script>

{#if items.length}
  <div class="a-card gu-flat plan">
    <div class="top">
      <MiniDial {arcs} finish={view.finish} wake={settings.value.wake} sleep={settings.value.sleep} nowMin={date === view.today ? minutesOfDay(clock.minute) : null} size={96} />
      <div class="side">
        <strong class="a-title">{head?.title?.trim().slice(0, 50) || (did ? `Placed ${placedNow.length}` : open.length ? `${chosen.length} for ${dayWord(date)}` : 'All on your dial')}</strong>
        <span class="a-meta">
          {#if did}
            On your dial {dayWord(date)}.
          {:else if fits.length}
            {formatDuration(total * MINUTE)} · {span}
          {:else if open.length}
            {chosen.length ? `No free time ${dayWord(date)} fits these` : 'Tick what to place'}
          {:else}
            Nothing left to place.
          {/if}
        </span>
        {#if !did && skipped}<span class="a-meta">{skipped} won't fit {dayWord(date)} — {skipped === 1 ? 'it waits' : 'they wait'}.</span>{/if}
      </div>
    </div>

    <ul class="a-list">
      {#each items as it, k (it.i)}
        {@const s = at.get(it.i) ?? null}
        {@const isOff = off.includes(it.i)}
        {@const done = !!it.there || placedNow.some((b) => b.title === it.title)}
        <li class="a-row static item" class:off={isOff && !done} style:--c={categoryColor(it.category, dark)} in:fly={rise(k)}>
          <span class="a-time">{done && it.there ? fmt(it.there.startMs) : s !== null && !did ? fmt(s) : ''}</span>
          {#if done}
            <span class="a-ico lume"><Icon name="check" size={14} stroke={2.6} /></span>
          {:else}
            <span class="a-ico dashed"><Icon name={it.icon} size={14} /></span>
          {/if}
          <span class="body">
            <span class="a-title two">{it.title}</span>
            <span class="a-meta">{formatDuration(it.minutes * MINUTE)}{it.why ? ` · ${it.why}` : ''}{!done && !isOff && s === null && !did ? ' · no room' : ''}</span>
          </span>
          {#if !done && !did}
            <button class="tick" class:on={!isOff} onclick={() => toggle(it.i)} aria-pressed={!isOff} aria-label={isOff ? `Add “${it.title}” back` : `Leave out “${it.title}”`}>
              {#if !isOff}<Icon name="check" size={12} stroke={3} />{/if}
            </button>
          {:else}
            <span></span>
          {/if}
        </li>
      {/each}
    </ul>

    <div class="a-actions">
      {#if did}
        <span class="a-meta"><Icon name="circle-check" size={12} /> Placed on your dial.</span>
        <button class="a-chip quiet" onclick={undo}><Icon name="undo" size={13} /> Undo</button>
      {:else if fits.length}
        <button class="a-chip primary" onclick={place}><Icon name="wand-sparkles" size={13} /> {fits.length === open.length ? 'Place these' : `Place ${fits.length}`}</button>
      {:else if open.length && shift < 6}
        <button class="a-chip quiet" onclick={() => shift++}><Icon name="chevron-right" size={13} /> Try {dayWord(addDays(date, 1))}</button>
      {/if}
    </div>
  </div>
{/if}

<style>
  .top {
    display: flex;
    gap: var(--s-4);
    align-items: center;
  }
  .side {
    display: grid;
    gap: 3px;
    min-width: 0;
  }
  .body {
    display: grid;
    min-width: 0;
  }
  .item.off > :not(.tick) {
    opacity: 0.45;
  }
  .item > * {
    transition: opacity var(--dur-2) var(--ease-out);
  }
  /* The tick box: an ink check when chosen (a choice, not a finish: lume is for done). */
  .tick {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    margin-right: 2px;
    border-radius: 50%;
    border: 1.5px solid color-mix(in srgb, var(--ink-3) 70%, transparent);
    color: var(--ink);
    transition:
      background var(--dur-2) var(--ease-settle),
      border-color var(--dur-2) var(--ease-settle),
      transform var(--dur-1) var(--ease-out);
  }
  .tick:hover {
    border-color: var(--ink-3);
  }
  .tick:active {
    transform: scale(0.88);
  }
  .tick.on {
    background: color-mix(in srgb, var(--ink) 8%, transparent);
    border-color: var(--ink-2);
  }
  /* Dashes mean provisional: proposed, not placed yet. */
  .dashed {
    background: color-mix(in srgb, var(--c) 10%, transparent);
    border: 1.5px dashed color-mix(in srgb, var(--c) 65%, transparent);
  }
  .off .dashed {
    border-color: var(--line-strong);
    background: transparent;
    color: var(--ink-3);
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
