<script lang="ts">
  import { flip } from 'svelte/animate';
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { acknowledge, moveToTomorrow, toBacklog } from '../lib/actions';
  import { blocksInRange } from '../lib/engine/blocks';
  import { addDays, formatDuration, formatTime, startOfDayMs } from '../lib/engine/time';
  import Icon from '../lib/Icon.svelte';
  import Rolling from '../lib/dial/Rolling.svelte';
  import { dayReview, dismiss } from '../lib/nudges.svelte';
  import { sounds } from '../lib/sound';
  import { taskFile } from '../lib/stores/tasks.svelte';
  import { view } from '../lib/stores/view.svelte';
  import Panel from './Panel.svelte';

  // Close the day in a minute: what you did (that's the headline), what's still open
  // (three kind choices each), and the first thing tomorrow. Then rest.
  const open = $derived(view.sheet?.kind === 'winddown');
  const review = $derived(open ? dayReview(view.today) : { done: [], open: [], spentMs: 0 });
  const tomorrow = $derived(addDays(view.today, 1));
  const firstTomorrow = $derived.by(() => {
    if (!open) return null;
    const s = startOfDayMs(tomorrow);
    return blocksInRange(taskFile.value.tasks, view.events, s, startOfDayMs(addDays(tomorrow, 1))).find((b) => !b.floating) ?? null;
  });

  function allTomorrow() {
    for (const b of review.open) moveToTomorrow(b.key);
  }

  function goodnight() {
    dismiss('winddown');
    sounds.dayComplete();
    view.dayCompleteAt = Date.now();
    view.sheet = null;
    view.say(review.done.length ? `${review.done.length} done today. Rest well.` : 'Today counted too. Rest well.');
  }
</script>

{#if open}
  <Panel title="Close the day" onclose={() => (view.sheet = null)}>
    <section class="hero">
      {#if review.done.length}
        <p class="big"><span class="tnum"><Rolling text={String(review.done.length)} reduced={view.reducedMotion} /></span> done today</p>
        <p class="sub tnum">{formatDuration(review.spentMs)} well spent</p>
      {:else}
        <p class="big">A quiet day.</p>
        <p class="sub">Rest is part of the plan. Tomorrow is a fresh dial.</p>
      {/if}
      <ul class="done">
        {#each review.done as b, i (b.key)}
          <li style:--c={b.color} in:fly={{ y: 6, delay: i * 40, duration: view.reducedMotion ? 0 : 260, easing: cubicOut }}>
            <span class="tick"><Icon name="check" size={11} stroke={3} /></span>
            <span class="t">{b.title}</span>
            <span class="m tnum">{formatTime(b.startMs, view.hour12)}</span>
          </li>
        {/each}
      </ul>
    </section>

    {#if review.open.length}
      <section>
        <h3>Still open <span class="count">{review.open.length}</span></h3>
        <p class="hint">No guilt — just decide where each one goes.</p>
        <ul class="open">
          {#each review.open as b (b.key)}
            <li style:--c={b.color} animate:flip={{ duration: 240 }} out:fly={{ x: 20, duration: 200 }}>
              <span class="ico"><Icon name={b.icon} size={14} /></span>
              <span class="t">{b.title}</span>
              <span class="acts">
                <button class="chip" onclick={() => moveToTomorrow(b.key)}>Tomorrow</button>
                <button class="chip" onclick={() => toBacklog(b.key)}>Backlog</button>
                <button class="chip quiet" onclick={() => acknowledge(b.key)}>Let go</button>
              </span>
            </li>
          {/each}
        </ul>
        {#if review.open.length > 1}
          <button class="btn btn-soft" onclick={allTomorrow}>Move all to tomorrow</button>
        {/if}
      </section>
    {/if}

    <section>
      <h3>Tomorrow starts with</h3>
      {#if firstTomorrow}
        <p class="first" style:--c={firstTomorrow.color}>
          <span class="ico"><Icon name={firstTomorrow.icon} size={14} /></span>
          <strong>{firstTomorrow.title}</strong>
          <span class="tnum">at {formatTime(firstTomorrow.startMs, view.hour12)}</span>
        </p>
      {:else}
        <p class="hint">Nothing yet. Add one thing in the quick-add box — try “tomorrow 9am deep work 1h”.</p>
      {/if}
    </section>

    {#snippet footer()}
      <span class="spacer"></span>
      <button class="btn btn-quiet" onclick={() => (view.breatheAt = Date.now())}><Icon name="wind" size={14} /> Breathe first</button>
      <button class="btn btn-primary" onclick={goodnight}><Icon name="moon" size={14} /> Good night</button>
    {/snippet}
  </Panel>
{/if}

<style>
  section {
    padding: var(--s-4) 0;
    border-top: 1px solid var(--line);
  }
  section.hero {
    border-top: 0;
    padding-top: 0;
  }
  .big {
    margin: 0;
    font-family: var(--font-ui);
    font-size: var(--t-2xl);
    font-weight: 300;
    letter-spacing: -0.02em;
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  .sub {
    margin: 2px 0 var(--s-3);
    color: var(--ink-3);
    font-size: var(--t-sm);
  }
  h3 {
    margin: 0 0 4px;
    font-family: var(--font-ui);
    font-size: var(--t-md);
    font-weight: 500;
  }
  .count {
    color: var(--ink-3);
    font-weight: 400;
    margin-left: 4px;
  }
  .hint {
    margin: 0 0 var(--s-3);
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 4px;
  }
  .done li,
  .open li {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 32px;
    font-size: var(--t-sm);
  }
  .tick {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--c);
    color: white;
    display: grid;
    place-items: center;
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--lume) 55%, transparent);
  }
  .t {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .m {
    color: var(--ink-3);
    font-size: var(--t-xs);
  }
  .ico {
    flex: none;
    width: 24px;
    height: 24px;
    border-radius: 8px;
    display: grid;
    place-items: center;
    background: color-mix(in srgb, var(--c) 18%, transparent);
    color: var(--c);
  }
  .acts {
    display: flex;
    gap: 4px;
  }
  .chip {
    height: 26px;
    padding: 0 9px;
    border-radius: var(--r-pill);
    border: 1px solid var(--line-strong);
    font-size: var(--t-xs);
    color: var(--ink-2);
  }
  .chip:hover {
    border-color: var(--ink-3);
    color: var(--ink);
  }
  .chip.quiet {
    border-color: transparent;
  }
  .open + .btn {
    margin-top: var(--s-3);
  }
  .first {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 6px 0 0;
    font-size: var(--t-sm);
  }
  .first strong {
    font-weight: 500;
  }
  .first .tnum {
    color: var(--ink-3);
  }
  .spacer {
    flex: 1;
  }
</style>
