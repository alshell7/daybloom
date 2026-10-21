<script lang="ts">
  // The timeline's view switch (Timeline views addon): List, Board or Gantt, and beside it the
  // chosen view's own few controls (the board's grouping; the chart's days, zoom and Now).
  import Icon from '../../../lib/Icon.svelte';
  import { clampPxh } from '../../../lib/addons/views/gantt';
  import { ganttCmd, setMode, timelineMode, viewsFile, type BoardGroup, type GanttDays } from '../../../lib/addons/views/views.svelte';
  import Segmented from '../../Segmented.svelte';

  const mode = $derived(timelineMode());
  const g = $derived(viewsFile.value.gantt);

  function zoom(by: number) {
    viewsFile.value.gantt.pxh = clampPxh(Math.round((ganttCmd.pxh || 60) * by * 10) / 10);
  }
</script>

<div class="views" class:wide={mode !== 'list'}>
  <Segmented
    label="Timeline view"
    value={mode}
    options={[
      { value: 'list', label: 'List', title: 'The timeline as a list' },
      { value: 'board', label: 'Board', title: 'Later, today, now and done, as columns' },
      { value: 'gantt', label: 'Gantt', title: 'Your hours from left to right' },
    ]}
    onchange={setMode}
  />
  {#if mode === 'board'}
    <div class="tools">
      <Segmented
        label="Group the board"
        value={viewsFile.value.board.group}
        options={[
          { value: 'day' as BoardGroup, label: 'Day', title: 'Later, the day, now and done' },
          { value: 'week' as BoardGroup, label: 'Week', title: 'Later and the next seven days' },
        ]}
        onchange={(v) => (viewsFile.value.board.group = v)}
      />
    </div>
  {:else if mode === 'gantt'}
    <div class="tools">
      <Segmented
        label="Days on the chart"
        value={String(g.days) as '1' | '3' | '7'}
        options={[
          { value: '1', label: 'Day', title: 'One day, a row for each kind of block' },
          { value: '3', label: '3 days', title: 'Three days, a row for each' },
          { value: '7', label: 'Week', title: 'Seven days, a row for each' },
        ]}
        onchange={(v) => (viewsFile.value.gantt.days = Number(v) as GanttDays)}
      />
      <div class="zoom" role="group" aria-label="Zoom">
        <button class="icon-btn" onclick={() => zoom(1 / 1.25)} title="Zoom out (pinch, or Ctrl + scroll)" aria-label="Zoom out"><Icon name="zoom-out" size={16} /></button>
        <button class="icon-btn" onclick={() => zoom(1.25)} title="Zoom in (pinch, or Ctrl + scroll)" aria-label="Zoom in"><Icon name="zoom-in" size={16} /></button>
        {#if g.pxh}
          <button class="fit" onclick={() => (viewsFile.value.gantt.pxh = 0)} title="Fit your waking day to the width">Fit</button>
        {/if}
      </div>
      <button class="now-btn" onclick={() => ganttCmd.jump++} title="Scroll to now">
        <span class="dot" aria-hidden="true"></span>Now
      </button>
    </div>
  {/if}
</div>

<style>
  .views {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-2) var(--s-3);
    margin-bottom: var(--s-3);
  }
  .tools {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--s-2);
    animation: tools-in var(--dur-3) var(--ease-out);
  }
  @keyframes tools-in {
    from {
      opacity: 0;
      transform: translateX(6px);
    }
  }
  .zoom {
    display: flex;
    align-items: center;
    gap: 0;
  }
  .zoom .icon-btn {
    width: 30px;
    height: 30px;
  }
  .fit,
  .now-btn {
    height: 30px;
    padding: 0 var(--s-3);
    border-radius: var(--r-pill);
    font-family: var(--font-ui);
    font-size: var(--t-sm);
    color: var(--ink-2);
    transition:
      background var(--dur-1) var(--ease-out),
      color var(--dur-1) var(--ease-out),
      transform var(--dur-1) var(--ease-out);
  }
  .fit:hover,
  .now-btn:hover {
    background: var(--sunken);
    color: var(--ink);
  }
  .now-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--sunken);
    color: var(--ink);
  }
  .now-btn:active,
  .fit:active {
    transform: scale(0.96);
  }
  .now-btn .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--signal);
  }
</style>
