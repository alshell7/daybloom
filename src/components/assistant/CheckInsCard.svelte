<script lang="ts">
  // Blocks that ended without a tick — four kind answers each: done, more time, later, let go.
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { acknowledge, extendBlock, toBacklog, toggleDone } from '../../lib/actions';
  import { openCheckIns } from '../../lib/assistant/tools';
  import { formatDuration, formatTime } from '../../lib/engine/time';
  import Icon from '../../lib/Icon.svelte';
  import { clock } from '../../lib/stores/clock.svelte';
  import { taskFile } from '../../lib/stores/tasks.svelte';
  import { view } from '../../lib/stores/view.svelte';

  const list = $derived((clock.zone, taskFile.value.tasks, openCheckIns(clock.minute)));
  const rise = (i: number) => ({ y: 6, delay: Math.min(i, 4) * 30, duration: view.reducedMotion ? 0 : 220, easing: cubicOut });

  function done(e: MouseEvent, key: string) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    toggleDone(key, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
  }
</script>

<div class="a-card checkins">
  {#if list.length}
    <ul class="a-list">
      {#each list as b, i (b.key)}
        <li class="item" style:--c={b.color} in:fly={rise(i)}>
          <div class="a-row static">
            <span class="a-time">{formatTime(b.startMs, view.hour12)}</span>
            <span class="a-ico"><Icon name={b.icon} size={14} /></span>
            <span class="body">
              <span class="a-title">{b.title || 'Untitled block'}</span>
              <span class="a-meta tnum">ended {clock.minute - b.endMs < 60_000 ? 'just now' : `${formatDuration(clock.minute - b.endMs)} ago`}</span>
            </span>
            <span></span>
          </div>
          <div class="a-actions acts">
            <button class="a-chip sm primary" onclick={(e) => done(e, b.key)}><Icon name="check" size={12} stroke={2.4} /> Done</button>
            <button class="a-chip sm" onclick={() => extendBlock(b.key, 15)}>+15m</button>
            <button class="a-chip sm" onclick={() => toBacklog(b.key)}>Later</button>
            <button class="a-chip sm quiet" onclick={() => acknowledge(b.key)} title="It didn't happen, and that's ok">Let go</button>
          </div>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="a-meta"><Icon name="circle-check" size={13} /> All caught up. Nothing is waiting.</p>
  {/if}
</div>

<style>
  .item {
    display: grid;
    gap: 6px;
  }
  .item + .item {
    padding-top: 8px;
    border-top: 1px solid var(--line);
  }
  .body {
    display: grid;
    min-width: 0;
  }
  .acts {
    padding-left: 84px;
  }
  @media (max-width: 480px) {
    .acts {
      padding-left: 0;
    }
  }
</style>
