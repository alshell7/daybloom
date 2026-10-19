<script lang="ts">
  // Gentle questions from the tracker, at the foot of the rail (never over the dial):
  // time away ("keep it or drop it?") and a forgotten stopwatch ("track this?").
  import { cubicOut } from 'svelte/easing';
  import { fly } from 'svelte/transition';
  import { targetTitle } from '../../../lib/addons/labels';
  import { isOn } from '../../../lib/addons/registry';
  import { tracker } from '../../../lib/addons/tracker/tracker.svelte';
  import { formatDuration, formatTime, MINUTE } from '../../../lib/engine/time';
  import Icon from '../../../lib/Icon.svelte';
  import { clock } from '../../../lib/stores/clock.svelte';
  import { view } from '../../../lib/stores/view.svelte';

  const on = $derived(isOn('tracker'));
  const idle = $derived(on ? tracker.idlePrompt : null);
  const remind = $derived(on && !idle ? tracker.reminder : null);
  const away = $derived(idle ? Math.max(1, Math.round((clock.now - idle.since) / MINUTE)) : 0);
  const cur = $derived(view.now.current);
</script>

{#if idle}
  <div class="dock" role="alertdialog" aria-label="Time away" in:fly={{ y: 20, duration: view.reducedMotion ? 0 : 360, easing: cubicOut }} out:fly={{ y: 10, duration: 180 }}>
    <span class="ic"><Icon name="pointer" size={18} /></span>
    <div class="body">
      <b>You were away from {formatTime(idle.since, view.hour12)}</b>
      <span>{formatDuration(away * MINUTE)} while tracking {targetTitle(tracker.running ?? null)}. What should happen to that time?</span>
      <div class="acts">
        <button class="btn-light" onclick={() => tracker.resolveIdle('keep')}>Keep it</button>
        <button class="btn-ghost" onclick={() => tracker.resolveIdle('drop')}>Drop it</button>
        <button class="btn-ghost" onclick={() => tracker.resolveIdle('drop-stop')}>Drop it and stop</button>
      </div>
    </div>
  </div>
{:else if remind}
  <div class="dock" role="status" in:fly={{ y: 20, duration: view.reducedMotion ? 0 : 360, easing: cubicOut }} out:fly={{ y: 10, duration: 180 }}>
    <span class="ic"><Icon name="timer" size={18} /></span>
    <div class="body">
      <b>Not tracking</b>
      <span>You've been busy for a while{cur ? ` during “${cur.title}”` : ''}. Track it?</span>
      <div class="acts">
        <button class="btn-light" onclick={() => (tracker.start(cur && cur.kind === 'task' ? { blockKey: cur.key, taskId: cur.taskId } : {}), tracker.dismissReminder())}>Start tracking</button>
        <button class="btn-ghost" onclick={() => tracker.dismissReminder()}>Not now</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .dock {
    position: fixed;
    right: 16px;
    bottom: 16px;
    z-index: 71;
    display: flex;
    gap: 12px;
    width: min(400px, calc(100vw - 32px));
    padding: 14px 16px 14px 14px;
    border-radius: 22px;
    background: var(--ink);
    color: var(--ink-inverse);
    box-shadow: var(--shadow-3);
  }
  .ic {
    display: grid;
    place-items: center;
    flex: none;
    width: 38px;
    height: 38px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--ink-inverse) 12%, transparent);
  }
  .body {
    display: grid;
    gap: 4px;
    font-size: var(--t-sm);
    line-height: 1.4;
  }
  .body span {
    color: color-mix(in srgb, var(--ink-inverse) 75%, transparent);
  }
  .acts {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 6px;
  }
  .btn-light,
  .btn-ghost {
    height: 30px;
    padding: 0 12px;
    border-radius: 999px;
    font-size: var(--t-xs);
    font-weight: 500;
  }
  .btn-light {
    background: var(--ink-inverse);
    color: var(--ink);
  }
  .btn-ghost {
    color: var(--ink-inverse);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ink-inverse) 25%, transparent);
  }
  .btn-ghost:hover {
    background: color-mix(in srgb, var(--ink-inverse) 10%, transparent);
  }
</style>
