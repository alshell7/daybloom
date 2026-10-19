<script lang="ts">
  // Breadcrumbs inside the block editor: the trail of notes you left on this task, newest
  // first, and a line to leave one now.
  import { cubicOut } from 'svelte/easing';
  import { fly, slide } from 'svelte/transition';
  import { ago, crumbs } from '../../../lib/addons/crumbs/crumbs.svelte';
  import Icon from '../../../lib/Icon.svelte';
  import { clock } from '../../../lib/stores/clock.svelte';
  import { view } from '../../../lib/stores/view.svelte';

  let { taskId }: { taskId: string } = $props();
  let text = $state('');
  let all = $state(false);
  const trail = $derived(crumbs.of(taskId));
  const shown = $derived(all ? trail : trail.slice(0, 3));
  const rm = $derived(view.reducedMotion);

  function add(e: SubmitEvent) {
    e.preventDefault();
    if (crumbs.add(taskId, text, 'manual')) text = '';
  }
</script>

<section class="group crumbs">
  <h3><Icon name="pin" size={14} /> Breadcrumbs</h3>
  {#if trail.length}
    <ol class="trail">
      {#each shown as c, i (c.id)}
        <li class:latest={i === 0} in:fly={{ y: -6, duration: rm ? 0 : 260, easing: cubicOut }} out:slide={{ duration: rm ? 0 : 160 }}>
          <i class="crumb" aria-hidden="true"></i>
          <div class="c">
            <p class="txt">{c.text}</p>
            <p class="meta tnum">{ago(c.at, clock.minute)}{c.source === 'leave' ? ' · when you left focus' : c.source === 'stop' ? ' · when the session ended' : ''}</p>
          </div>
          <button class="rm" onclick={() => crumbs.remove(c.id)} aria-label="Remove this note"><Icon name="x" size={12} /></button>
        </li>
      {/each}
    </ol>
    {#if trail.length > 3}
      <button class="link" onclick={() => (all = !all)}>{all ? 'Show fewer' : `Show all ${trail.length}`}</button>
    {/if}
  {/if}
  <form onsubmit={add}>
    <input class="field" bind:value={text} placeholder={trail.length ? 'Leave another note for next time…' : 'Leave a note for next time: where you are, what’s next…'} maxlength="500" aria-label="Leave a breadcrumb" />
  </form>
</section>

<style>
  .group {
    padding: var(--s-4) 0;
    border-top: 1px solid var(--line);
  }
  h3 {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0 0 var(--s-3);
    font-family: var(--font-ui);
    font-size: var(--t-sm);
    font-weight: 500;
    color: var(--ink-2);
  }
  .crumbs {
    --amber: #b07e06;
  }
  :global([data-theme='dark']) .crumbs {
    --amber: #e2b44a;
  }
  .trail {
    position: relative;
    list-style: none;
    margin: 0 0 var(--s-3);
    padding: 0;
  }
  /* The trail: a soft dotted line linking the crumbs. */
  .trail::before {
    content: '';
    position: absolute;
    left: 5px;
    top: 10px;
    bottom: 10px;
    border-left: 2px dotted color-mix(in srgb, var(--amber) 40%, transparent);
  }
  li {
    position: relative;
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 4px 0;
  }
  .crumb {
    position: relative;
    z-index: 1;
    width: 12px;
    height: 12px;
    margin-top: 5px;
    flex: none;
    border-radius: 50%;
    background: var(--raised);
    box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--amber) 55%, transparent);
  }
  .latest .crumb {
    background: var(--amber);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--amber) 20%, transparent);
  }
  .c {
    flex: 1;
    min-width: 0;
  }
  .txt {
    margin: 0;
    font-family: var(--font-read);
    font-size: var(--t-sm);
    line-height: 1.45;
    color: var(--ink);
    overflow-wrap: anywhere;
  }
  li:not(.latest) .txt {
    color: var(--ink-2);
  }
  .meta {
    margin: 1px 0 0;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .rm {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    flex: none;
    border-radius: 50%;
    color: var(--ink-3);
    opacity: 0;
    transition: opacity var(--dur-1) var(--ease-out);
  }
  li:hover .rm,
  .rm:focus-visible {
    opacity: 1;
  }
  .rm:hover {
    background: var(--sunken);
    color: var(--ink);
  }
  .link {
    margin: -6px 0 var(--s-3) 18px;
    padding: 2px 6px;
    border-radius: var(--r-pill);
    font-size: var(--t-xs);
    font-weight: 500;
    color: var(--ink-2);
  }
  .link:hover {
    background: var(--sunken);
  }
  .field {
    width: 100%;
    height: 36px;
    font-size: var(--t-sm);
  }
</style>
