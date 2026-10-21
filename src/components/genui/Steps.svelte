<script lang="ts">
  // Tiny first steps to get going. Ticks are just for now (on this card); the next step is
  // the one that stands out, and one button starts two minutes on it with the block it
  // belongs to (if any). "Save to the block" keeps them as the block's checklist.
  import type { ComponentRenderProps } from '@openuidev/svelte-lang';
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { act, blockOf, type Did } from '../../lib/ai/genui/act';
  import { valid } from '../../lib/ai/genui/read';
  import { StepsProps } from '../../lib/ai/genui/schema';
  import Icon from '../../lib/Icon.svelte';
  import { view } from '../../lib/stores/view.svelte';

  let { props }: ComponentRenderProps<Record<string, unknown>> = $props();
  const p = $derived(valid(StepsProps, props));
  const steps = $derived([...new Set((p?.steps ?? []).map((s) => s.trim().slice(0, 90)).filter(Boolean))].slice(0, 6));
  const b = $derived(blockOf(p?.key));

  let ticked = $state<number[]>([]);
  let started = $state<number | null>(null);
  let saved = $state<Did | null>(null);
  const next = $derived(steps.findIndex((_, i) => !ticked.includes(i)));
  const rise = (i: number) => ({ y: 6, delay: Math.min(i, 5) * 35, duration: view.reducedMotion ? 0 : 240, easing: cubicOut });

  function tick(i: number) {
    ticked = ticked.includes(i) ? ticked.filter((x) => x !== i) : [...ticked, i];
  }

  function start() {
    if (next < 0) return;
    act.start(b?.key ?? null, { label: steps[next] });
    started = next;
  }

  function save() {
    if (!b) return;
    saved = act.saveSteps(b.key, steps);
  }
</script>

{#if steps.length}
  <div class="a-card gu-flat steps" style:--c={b?.color ?? 'var(--ink-3)'}>
    <p class="a-label" class:auto={!p?.title?.trim() && !b}>
      <Icon name="footprints-ui" size={14} stroke={2} />
      {p?.title?.trim().slice(0, 50) || 'First steps'}{#if b}<span class="for"><span class="a-dot"></span>{b.title}</span>{/if}
    </p>
    <ol>
      {#each steps as s, i (s)}
        {@const done = ticked.includes(i)}
        <li class:done class:next={i === next} in:fly={rise(i)}>
          <button class="check" class:on={done} onclick={() => tick(i)} aria-pressed={done} aria-label={done ? `Untick “${s}”` : `Tick “${s}”`}>
            {#if done}<Icon name="check" size={12} stroke={3} />{:else}<span class="n">{i + 1}</span>{/if}
          </button>
          <span class="t">{s}</span>
        </li>
      {/each}
    </ol>
    <div class="a-actions">
      {#if next < 0}
        <span class="a-meta"><Icon name="circle-check" size={12} /> Every step ticked. Lovely.</span>
      {:else if started === next}
        <span class="a-meta"><Icon name="timer" size={12} /> Two minutes on step {next + 1}, running.</span>
      {:else}
        <button class="a-chip primary" onclick={start}><Icon name="play" size={13} stroke={2.2} /> Start step {next + 1} for 2 minutes</button>
      {/if}
      {#if b?.kind === 'task' && !b.readOnly}
        {#if saved}
          <button class="a-chip quiet" onclick={() => (saved?.undo(), (saved = null))}><Icon name="undo" size={13} /> Saved · Undo</button>
        {:else}
          <button class="a-chip quiet" onclick={save}><Icon name="list" size={13} /> Save to the block</button>
        {/if}
      {/if}
    </div>
  </div>
{/if}

<style>
  .for {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
    margin-left: 2px;
    color: var(--ink-2);
    font-weight: 400;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .for::before {
    content: '·';
    color: var(--ink-3);
  }
  ol {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 2px;
  }
  li {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 10px;
    align-items: center;
    min-height: 36px;
    padding: 3px 8px 3px 4px;
    margin: 0 -4px;
    border-radius: var(--r-sm);
    color: var(--ink-2);
    transition:
      background var(--dur-2) var(--ease-out),
      color var(--dur-2) var(--ease-out);
  }
  li.next {
    background: color-mix(in srgb, var(--c) 9%, transparent);
    color: var(--ink);
  }
  li.next .t {
    font-weight: 500;
  }
  .t {
    font-family: var(--font-read);
    font-size: var(--t-md);
    line-height: 1.35;
    overflow-wrap: anywhere;
  }
  li.done .t {
    color: var(--ink-3);
    text-decoration: line-through;
    text-decoration-color: var(--ink-3);
  }
  .check {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 1.5px solid var(--line-strong);
    color: var(--ink-3);
    transition:
      background var(--dur-2) var(--ease-settle),
      border-color var(--dur-2) var(--ease-settle),
      transform var(--dur-1) var(--ease-out);
  }
  .check:hover {
    border-color: var(--ink-3);
  }
  .check:active {
    transform: scale(0.88);
  }
  li.next .check {
    border-color: color-mix(in srgb, var(--c) 70%, var(--line-strong));
    color: var(--ink);
  }
  /* Ticked: lume, the colour of finished things. */
  .check.on {
    border-color: var(--lume);
    background: color-mix(in srgb, var(--lume) 22%, transparent);
    color: var(--ink);
  }
  .n {
    font-size: 11px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }
</style>
