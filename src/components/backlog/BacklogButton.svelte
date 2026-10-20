<script lang="ts">
  // The backlog button in the top bar. A click opens a small capture card right under it: type,
  // Enter, done (it stays open for the next one). The full backlog is one more click, or B.
  import { tick } from 'svelte';
  import { cubicOut } from 'svelte/easing';
  import { fly, scale } from 'svelte/transition';
  import { categoryColor } from '../../lib/engine/categories';
  import Icon from '../../lib/Icon.svelte';
  import { shownTitle } from '../../lib/privacy';
  import { taskFile } from '../../lib/stores/tasks.svelte';
  import { view } from '../../lib/stores/view.svelte';
  import Capture from './Capture.svelte';

  let open = $state(false);
  let cap: Capture | undefined = $state();
  /** What was added while the card was open, newest first. */
  let added = $state<string[]>([]);

  const recent = $derived(added.map((id) => taskFile.value.tasks.find((t) => t.id === id)).filter((t) => !!t).slice(0, 4));

  async function toggle() {
    open = !open;
    if (!open) return;
    added = [];
    await tick();
    cap?.focus();
  }
  function close() {
    open = false;
  }
  function openBacklog() {
    open = false;
    view.sheet = { kind: 'backlog' };
  }
</script>

<div class="wrap" data-drop="backlog">
  <button
    class="icon-btn"
    class:on={open}
    class:drop={view.backlogDrop}
    onclick={toggle}
    aria-pressed={view.sheet?.kind === 'backlog'}
    aria-expanded={open}
    aria-haspopup="dialog"
    aria-label="Add to the backlog (B opens it)"
    title="Add to the backlog · B opens it"
  >
    <Icon name="inbox" size={18} />
    {#if view.later.length}<span class="badge tnum">{view.later.length > 99 ? '99+' : view.later.length}</span>{/if}
  </button>

  {#if open}
    <div class="scrim" role="presentation" onclick={close}></div>
    <div
      class="card"
      role="dialog"
      aria-label="Add to the backlog"
      tabindex="-1"
      onkeydown={(e) => e.key === 'Escape' && (e.stopPropagation(), close())}
      transition:scale={{ start: 0.95, duration: view.reducedMotion ? 0 : 200, easing: cubicOut }}
    >
      <p class="head">Add to the backlog <span>Enter adds · it stays open for the next</span></p>
      <Capture bind:this={cap} target="inbox" oncaptured={(ids) => (added = [...ids, ...added])} />
      {#if recent.length}
        <ul class="added" aria-label="Just added">
          {#each recent as t (t.id)}
            <li in:fly={{ y: -6, duration: view.reducedMotion ? 0 : 260, easing: cubicOut }}>
              <i class="dot" style:--c={categoryColor(t.category, view.finish.dark)}></i>
              <span class="t">{shownTitle(t.title, t.category)}</span>
              <span class="where">Inbox</span>
            </li>
          {/each}
        </ul>
      {/if}
      <div class="foot">
        <button class="btn btn-quiet sm" onclick={openBacklog}>
          <Icon name="inbox" size={14} /> Open the backlog{#if view.later.length}<span class="n tnum">{view.later.length}</span>{/if}
        </button>
        <kbd>B</kbd>
      </div>
    </div>
  {/if}
</div>

<style>
  .icon-btn.drop {
    color: var(--ink);
    background: color-mix(in srgb, var(--lume) 22%, transparent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--lume) 55%, transparent);
    transform: scale(1.12);
  }
  .wrap {
    position: relative;
  }
  .icon-btn {
    position: relative;
  }
  .badge {
    position: absolute;
    top: 2px;
    right: 1px;
    min-width: 15px;
    height: 15px;
    padding: 0 4px;
    border-radius: 8px;
    background: var(--ink);
    color: var(--ink-inverse);
    font-size: 9.5px;
    font-weight: 600;
    line-height: 15px;
    text-align: center;
    pointer-events: none;
  }
  .icon-btn.on {
    background: var(--sunken);
    color: var(--ink);
  }
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 44;
  }
  .card {
    position: absolute;
    top: calc(100% + 8px);
    right: -6px;
    z-index: 45;
    width: min(380px, calc(100vw - 24px));
    padding: 12px;
    border-radius: var(--r-lg);
    background: var(--raised);
    border: 1px solid var(--line);
    box-shadow: var(--shadow-3);
    transform-origin: top right;
    outline: none;
  }
  .head {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    margin: 2px 4px 10px;
    font-size: var(--t-sm);
    font-weight: 500;
    color: var(--ink-3);
  }
  .head span {
    font-size: var(--t-xs);
    font-weight: 400;
  }
  .added {
    list-style: none;
    margin: 10px 0 0;
    padding: 0;
    display: grid;
    gap: 2px;
  }
  .added li {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 6px;
    border-radius: var(--r-sm);
    font-size: var(--t-sm);
  }
  .dot {
    width: 8px;
    height: 8px;
    margin: 0 4px;
    flex: none;
    border-radius: 50%;
    background: var(--c);
  }
  .t {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .where {
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 10px -2px -2px;
    padding-top: 8px;
    border-top: 1px solid var(--line);
  }
  .sm {
    height: 30px;
    padding: 0 10px;
    gap: 6px;
  }
  .n {
    margin-left: 2px;
    padding: 0 6px;
    border-radius: var(--r-pill);
    background: var(--sunken);
    font-size: var(--t-xs);
  }
  kbd {
    font-family: var(--font-ui);
    font-size: var(--t-xs);
    color: var(--ink-3);
    padding: 1px 6px;
    margin-right: 6px;
    border-radius: 5px;
    border: 1px solid var(--line-strong);
  }
</style>
