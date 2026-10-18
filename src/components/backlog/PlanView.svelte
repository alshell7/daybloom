<script lang="ts">
  import { flip } from 'svelte/animate';
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import type { Plan, Span } from '../../lib/backlog';
  import { categoryColor, onColor } from '../../lib/engine/categories';
  import { formatDuration, formatTime, MINUTE } from '../../lib/engine/time';
  import type { Block } from '../../lib/engine/types';
  import Icon from '../../lib/Icon.svelte';
  import { taskFile } from '../../lib/stores/tasks.svelte';
  import { view } from '../../lib/stores/view.svelte';

  // The proposal, before anything is committed: a strip of the rest of the day with
  // the suggested blocks dashed in (dashes = provisional), then a list to tweak.
  let {
    plan,
    busy,
    excluded,
    landed = -1,
    day,
    only = false,
    empty,
    ontoggle,
    onplantomorrow,
  }: {
    plan: Plan;
    busy: Span[];
    excluded: string[];
    /** How many blocks have landed so far while placing (-1 = not placing). */
    landed?: number;
    day: 'today' | 'tomorrow';
    /** Limited to the items that are due. */
    only?: boolean;
    /** Why there is nothing to show, if the plan is empty. */
    empty: null | 'no-items' | 'no-time' | 'no-fit';
    ontoggle: (id: string) => void;
    onplantomorrow?: () => void;
  } = $props();

  const span = $derived(Math.max(1, plan.toMs - plan.fromMs));
  const pct = (ms: number) => `${(Math.max(0, Math.min(1, (ms - plan.fromMs) / span)) * 100).toFixed(3)}%`;
  const width = (a: number, b: number) => `${(Math.max(0, Math.min(plan.toMs, b) - Math.max(plan.fromMs, a)) / span * 100).toFixed(3)}%`;

  const busyIn = $derived(
    busy
      .filter((b) => !b.floating && b.endMs > plan.fromMs && b.startMs < plan.toMs)
      .map((b) => ({ ...b, color: (b as Partial<Block>).color ?? 'var(--ink-3)' })),
  );
  const chosen = $derived(plan.items.filter((i) => !excluded.includes(i.taskId)));
  const chosenMs = $derived(chosen.reduce((s, i) => s + i.duration * MINUTE, 0));
  const leftMs = $derived(Math.max(0, plan.freeMs - chosenMs));
  const placing = $derived(landed >= 0);

  const skippedNames = $derived.by(() => {
    const names = plan.skipped.map((s) => {
      const t = taskFile.value.tasks.find((x) => x.id === s.taskId);
      return t ? (s.reason === 'too-long' ? `${t.title} (${formatDuration(t.duration * MINUTE)})` : t.title) : null;
    }).filter(Boolean) as string[];
    return names;
  });
  const anyTooLong = $derived(plan.skipped.some((s) => s.reason === 'too-long'));
</script>

<section class="plan" aria-label="Plan my day">
  {#if empty}
    <div class="empty" in:fly={{ y: 6, duration: view.reducedMotion ? 0 : 260, easing: cubicOut }}>
      <span class="halo"><Icon name={empty === 'no-time' ? 'moon' : empty === 'no-items' ? 'inbox' : 'hourglass'} size={20} /></span>
      {#if empty === 'no-items'}
        <p class="lede">Nothing waiting in the backlog.</p>
        <p class="sub">Dump a few things in first, then come back to plan.</p>
      {:else if empty === 'no-time'}
        <p class="lede">Not much {day} left to plan.</p>
        <p class="sub">Rest counts too. Want to look at tomorrow instead?</p>
        {#if day === 'today' && onplantomorrow}
          <button class="btn btn-soft" onclick={onplantomorrow}><Icon name="sunrise" size={15} />Plan tomorrow</button>
        {/if}
      {:else}
        <p class="lede">Nothing fits in the time that’s left.</p>
        <p class="sub">{anyTooLong ? 'Some items are longer than any free gap. Shorter pieces fit more easily.' : 'Your free time is already well used.'}</p>
        {#if day === 'today' && onplantomorrow}
          <button class="btn btn-soft" onclick={onplantomorrow}><Icon name="sunrise" size={15} />Plan tomorrow</button>
        {/if}
      {/if}
    </div>
  {:else}
    <header>
      <p class="lede">{only ? 'A place for what’s due' : `A calm plan for ${day}`}</p>
      <p class="sub tnum">
        {chosen.length} {chosen.length === 1 ? 'block' : 'blocks'} · {formatDuration(chosenMs)} · leaves {formatDuration(leftMs)} free
      </p>
    </header>

    <div class="strip" aria-hidden="true">
      {#if day === 'today'}<span class="now"></span>{/if}
      {#each busyIn as b, i (i)}
        <span class="seg busy" style:left={pct(b.startMs)} style:width={width(b.startMs, b.endMs)} style:--c={b.color}></span>
      {/each}
      {#each plan.items as it, i (it.taskId)}
        <span
          class="seg prop"
          class:off={excluded.includes(it.taskId)}
          class:landed={placing && i < landed && !excluded.includes(it.taskId)}
          style:left={pct(it.startMs)}
          style:width={width(it.startMs, it.endMs)}
          style:--c={categoryColor(it.category, view.finish.dark)}
        ></span>
      {/each}
    </div>
    <div class="ends tnum" aria-hidden="true">
      <span>{day === 'today' ? 'Now' : formatTime(plan.fromMs, view.hour12)}</span>
      <span>{formatTime(plan.toMs, view.hour12)}</span>
    </div>

    <ol class="items">
      {#each plan.items as it, i (it.taskId)}
        {@const off = excluded.includes(it.taskId)}
        <li
          class:off
          class:landed={placing && i < landed && !off}
          style:--c={categoryColor(it.category, view.finish.dark)}
          style:--on={onColor(categoryColor(it.category, view.finish.dark))}
          animate:flip={{ duration: view.reducedMotion ? 0 : 320, easing: cubicOut }}
          in:fly={{ y: 8, duration: view.reducedMotion ? 0 : 280, delay: view.reducedMotion ? 0 : i * 45, easing: cubicOut }}
        >
          <button class="pick" role="checkbox" aria-checked={!off} aria-label={`Include ${it.title}`} disabled={placing} onclick={() => ontoggle(it.taskId)}>
            <span class="tick"><Icon name="check" size={12} stroke={3} /></span>
          </button>
          <span class="time tnum">{formatTime(it.startMs, view.hour12)}</span>
          <span class="tile"><Icon name={it.icon} size={14} stroke={2} /></span>
          <span class="title">{it.title || 'Untitled'}</span>
          {#if it.why}<span class="why">{it.why}</span>{/if}
          <span class="dur tnum">{formatDuration(it.duration * MINUTE)}</span>
        </li>
      {/each}
    </ol>

    {#if skippedNames.length}
      <p class="skipped">
        <Icon name="hourglass" size={12} />
        <span>Left for another time: {skippedNames.slice(0, 3).join(', ')}{skippedNames.length > 3 ? ` and ${skippedNames.length - 3} more` : ''}.</span>
      </p>
    {/if}
  {/if}
</section>

<style>
  .plan {
    display: grid;
    gap: var(--s-3);
  }
  header {
    display: grid;
    gap: 2px;
  }
  .lede {
    margin: 0;
    font-family: var(--font-ui);
    font-size: var(--t-lg);
    font-weight: 500;
    letter-spacing: -0.01em;
    color: var(--ink);
  }
  .sub {
    margin: 0;
    font-size: var(--t-sm);
    color: var(--ink-3);
  }

  /* the rest of the day as a strip */
  .strip {
    position: relative;
    height: 14px;
    margin-top: var(--s-1);
    border-radius: var(--r-pill);
    background: var(--sunken);
    overflow: hidden;
  }
  .seg {
    position: absolute;
    top: 0;
    bottom: 0;
    min-width: 2px;
  }
  .busy {
    background: color-mix(in srgb, var(--c) 34%, var(--sunken));
  }
  .prop {
    top: 2px;
    bottom: 2px;
    border-radius: 4px;
    background: color-mix(in srgb, var(--c) 22%, transparent);
    outline: 1.5px dashed color-mix(in srgb, var(--c) 80%, transparent);
    outline-offset: -1.5px;
    transition:
      opacity var(--dur-2) var(--ease-out),
      background var(--dur-3) var(--ease-out);
  }
  .prop.off {
    opacity: 0.25;
  }
  .prop.landed {
    background: var(--c);
    outline-color: transparent;
    animation: land 420ms var(--ease-settle);
  }
  @keyframes land {
    0% {
      transform: scaleY(0.4);
    }
    60% {
      transform: scaleY(1.25);
    }
    100% {
      transform: none;
    }
  }
  .now {
    position: absolute;
    z-index: 1;
    left: 0;
    top: 0;
    bottom: 0;
    width: 3px;
    background: var(--signal);
  }
  .ends {
    display: flex;
    justify-content: space-between;
    margin-top: -6px;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }

  /* proposals */
  .items {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 2px;
  }
  .items li {
    display: grid;
    grid-template-columns: 22px 54px 26px minmax(0, 1fr) auto auto;
    align-items: center;
    column-gap: 9px;
    min-height: 42px;
    padding: 0 8px 0 4px;
    border-radius: var(--r-md);
    transition:
      opacity var(--dur-2) var(--ease-out),
      background var(--dur-1) var(--ease-out);
  }
  .items li:hover {
    background: color-mix(in srgb, var(--sunken) 55%, var(--raised));
  }
  .items li.off {
    opacity: 0.45;
  }
  .pick {
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 1.5px solid var(--line-strong);
    color: var(--ink-inverse);
    transition:
      background var(--dur-2) var(--ease-out),
      border-color var(--dur-2) var(--ease-out),
      transform var(--dur-1) var(--ease-out);
  }
  .pick:disabled {
    opacity: 1;
    cursor: default;
  }
  .pick:active:not(:disabled) {
    transform: scale(0.88);
  }
  .pick[aria-checked='true'] {
    background: var(--ink);
    border-color: var(--ink);
  }
  .pick .tick {
    display: grid;
    opacity: 0;
    transform: scale(0.5);
    transition:
      opacity var(--dur-2) var(--ease-out),
      transform var(--dur-2) var(--ease-settle);
  }
  .pick[aria-checked='true'] .tick {
    opacity: 1;
    transform: none;
  }
  .time {
    font-size: var(--t-sm);
    color: var(--ink-2);
  }
  .landed .time {
    color: var(--ink);
  }
  .tile {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: 8px;
    color: color-mix(in srgb, var(--c) 80%, var(--ink));
    background: color-mix(in srgb, var(--c) 12%, transparent);
    outline: 1.5px dashed color-mix(in srgb, var(--c) 70%, transparent);
    outline-offset: -1.5px;
    transition:
      background var(--dur-3) var(--ease-out),
      color var(--dur-3) var(--ease-out),
      outline-color var(--dur-2) var(--ease-out);
  }
  /* Placed: the dashed (provisional) tile becomes a solid insert. */
  .landed .tile {
    background: var(--c);
    color: var(--on);
    outline-color: transparent;
    animation: claim 460ms var(--ease-settle);
  }
  @keyframes claim {
    0% {
      transform: scale(0.8);
    }
    55% {
      transform: scale(1.14);
    }
    100% {
      transform: none;
    }
  }
  .title {
    font-family: var(--font-read);
    font-size: 14px;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .why {
    height: 20px;
    padding: 0 7px;
    border-radius: var(--r-pill);
    background: var(--sunken);
    font-family: var(--font-ui);
    font-size: 11px;
    line-height: 20px;
    color: var(--ink-2);
    white-space: nowrap;
  }
  .dur {
    min-width: 40px;
    text-align: right;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .skipped {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    margin: 0;
    padding: 0 4px;
    font-size: var(--t-xs);
    line-height: 1.5;
    color: var(--ink-3);
  }
  .skipped :global(svg) {
    margin-top: 3px;
  }

  .empty {
    display: grid;
    justify-items: center;
    gap: 6px;
    padding: var(--s-6) var(--s-4);
    text-align: center;
  }
  .empty .halo {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    margin-bottom: 4px;
    border-radius: 50%;
    background: var(--sunken);
    color: var(--ink-2);
  }
  .empty .btn {
    margin-top: var(--s-3);
  }

  :global([data-motion='calm']) .landed .tile,
  :global([data-motion='calm']) .prop.landed {
    animation: none;
  }

  @container backlog (max-width: 440px) {
    .why {
      display: none;
    }
  }
</style>
