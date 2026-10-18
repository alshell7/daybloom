<script lang="ts">
  import { describeRecurrence } from '../engine/recurrence';
  import { formatDuration, formatTime, MINUTE } from '../engine/time';
  import type { Block } from '../engine/types';
  import Icon from '../Icon.svelte';
  import { tasks } from '../stores/tasks.svelte';
  import { routineStreak } from '../streaks';

  // Everything about one block at a glance: when, how much is left, what's next inside it.
  let { block, now, hour12, compact = false }: { block: Block; now: number; hour12: boolean; compact?: boolean } = $props();

  const task = $derived(block.taskId ? tasks.get(block.taskId) : undefined);
  const steps = $derived(task?.subtasks ?? []);
  const stepsDone = $derived(steps.filter((s) => s.done).length);
  const nextStep = $derived(steps.find((s) => !s.done)?.title ?? null);
  const note = $derived((task?.notes ?? '').split('\n').find((l) => l.trim())?.trim() ?? '');
  const len = $derived(block.endMs - block.startMs);
  const live = $derived(!block.done && now >= block.startMs && now < block.endMs);
  const past = $derived(now >= block.endMs);
  const acked = $derived(!!task?.acks?.includes(block.date));

  const status = $derived.by(() => {
    if (block.kind === 'event') return { tone: 'quiet', icon: 'calendar', text: 'From your calendar' };
    if (block.done) {
      const spent = Math.min(block.endMs, block.doneAt ?? block.endMs) - block.startMs;
      return { tone: 'done', icon: 'circle-check', text: spent > MINUTE ? `Done · ${formatDuration(spent)} well spent` : 'Done' };
    }
    if (live) return { tone: 'live', icon: 'hourglass', text: `${formatDuration(block.endMs - now)} left` };
    if (past) return acked ? { tone: 'quiet', icon: 'hand', text: 'Let go — that’s ok' } : { tone: 'warn', icon: 'alarm', text: 'Waiting for a check-in' };
    return { tone: 'quiet', icon: 'clock', text: `in ${formatDuration(block.startMs - now)}` };
  });
  const progress = $derived(live ? (now - block.startMs) / len : block.done ? 1 : 0);
  const inARow = $derived(task?.recurrence ? routineStreak(task, now) : 0);
</script>

<div class="card" class:compact style:--c={block.color}>
  <div class="head">
    <span class="ico"><Icon name={block.icon} size={compact ? 13 : 15} stroke={2.1} /></span>
    <strong>{block.title || 'Untitled block'}</strong>
  </div>
  <div class="when tnum">
    {formatTime(block.startMs, hour12)}–{formatTime(block.endMs, hour12)} · {formatDuration(len)}
  </div>
  <div class="status" data-tone={status.tone}>
    <Icon name={status.icon} size={12} stroke={2.2} />
    <span class="tnum">{status.text}</span>
  </div>
  {#if (live || block.done) && !compact}
    <span class="bar" aria-hidden="true"><i style:transform={`scaleX(${progress})`}></i></span>
  {/if}
  {#if !compact && steps.length}
    <div class="steps tnum">
      <Icon name="list" size={12} />
      {stepsDone}/{steps.length} steps{#if nextStep && !block.done} · next: <em>{nextStep}</em>{/if}
    </div>
  {/if}
  {#if !compact && note}
    <p class="note">{note}</p>
  {/if}
  {#if !compact && task?.recurrence}
    <div class="repeat">
      <Icon name="repeat" size={11} /> {describeRecurrence(task.recurrence, task.date)}
      {#if inARow >= 2}<span class="row"><Icon name="flame" size={11} /> {inARow} in a row</span>{/if}
    </div>
  {/if}
</div>

<style>
  .card {
    display: grid;
    gap: 4px;
    width: 230px;
    padding: 10px 12px 11px;
    border-radius: 14px;
    background: var(--raised, #fff);
    color: var(--ink);
    box-shadow:
      0 0 0 1px var(--line, rgb(0 0 0 / 0.08)),
      0 10px 30px -10px rgb(0 0 0 / 0.35);
    font-family: var(--font-ui);
    font-size: 12px;
    line-height: 1.35;
    text-align: left;
    pointer-events: none;
  }
  .card::before {
    content: '';
    position: absolute;
    left: 12px;
    right: 12px;
    top: 0;
    height: 3px;
    border-radius: 0 0 3px 3px;
    background: var(--c);
  }
  .card {
    position: relative;
  }
  .card.compact {
    width: auto;
    max-width: 100%;
    padding: 0;
    background: none;
    box-shadow: none;
    justify-items: center;
    text-align: center;
  }
  .card.compact::before {
    display: none;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
  }
  .compact .head {
    gap: 5px;
  }
  .ico {
    flex: none;
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--c) 20%, transparent);
    color: var(--c);
  }
  .compact .ico {
    width: 18px;
    height: 18px;
    border-radius: 6px;
  }
  strong {
    font-size: 13.5px;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .compact strong {
    font-size: 6.5cqi;
  }
  .when {
    color: var(--ink-3, currentColor);
  }
  .compact .when {
    font-size: 5cqi;
    opacity: 0.75;
  }
  .status {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    width: max-content;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--sunken, rgb(0 0 0 / 0.06));
    color: var(--ink-2, currentColor);
  }
  .compact .status {
    font-size: 4.6cqi;
    margin-top: 1cqi;
  }
  .status[data-tone='live'] {
    background: color-mix(in srgb, var(--c) 18%, transparent);
    color: var(--ink);
  }
  .status[data-tone='done'] {
    background: color-mix(in srgb, var(--lume) 22%, transparent);
    color: var(--ink);
  }
  .status[data-tone='warn'] {
    background: color-mix(in srgb, var(--warm) 22%, transparent);
    color: var(--ink);
  }
  .bar {
    position: relative;
    height: 3px;
    margin-top: 2px;
    border-radius: 2px;
    background: var(--line, rgb(0 0 0 / 0.08));
    overflow: hidden;
  }
  .bar i {
    position: absolute;
    inset: 0;
    background: var(--c);
    transform-origin: left;
  }
  .steps,
  .repeat {
    display: flex;
    align-items: center;
    gap: 5px;
    color: var(--ink-3, currentColor);
    min-width: 0;
  }
  .steps em {
    font-style: normal;
    color: var(--ink-2, currentColor);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .row {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    margin-left: auto;
    color: var(--ink-2);
    font-weight: 500;
  }
  .note {
    margin: 2px 0 0;
    color: var(--ink-2, currentColor);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>
