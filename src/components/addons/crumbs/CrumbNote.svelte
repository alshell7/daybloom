<script lang="ts">
  // Coming back to a task: the last breadcrumb you left, first thing, with a little trail of
  // the ones before it. "Got it" tucks it away (it stays on the block).
  import { cubicOut } from 'svelte/easing';
  import { fade, fly } from 'svelte/transition';
  import { ago, crumbs } from '../../../lib/addons/crumbs/crumbs.svelte';
  import Icon from '../../../lib/Icon.svelte';
  import { clock } from '../../../lib/stores/clock.svelte';
  import { view } from '../../../lib/stores/view.svelte';

  let { taskId, tone = 'panel' }: { taskId: string; tone?: 'panel' | 'focus' } = $props();

  const trail = $derived(crumbs.of(taskId));
  const last = $derived(trail[0] ?? null);
  const rm = $derived(view.reducedMotion);
  let tucked = $state(false);
  let lastId = '';
  $effect(() => {
    const id = last?.id ?? '';
    if (id !== lastId) {
      lastId = id;
      tucked = false;
    }
  });
</script>

{#if last && !tucked}
  <aside class="note" class:focus={tone === 'focus'} in:fly={{ y: 8, duration: rm ? 0 : 460, delay: rm ? 0 : 180, easing: cubicOut }} out:fade={{ duration: rm ? 0 : 160 }}>
    <div class="trail" aria-hidden="true">
      {#each trail.slice(0, 4).reverse() as c, i (c.id)}
        <i style:--i={i} class:now={c.id === last.id}></i>
      {/each}
    </div>
    <div class="body">
      <p class="lbl"><Icon name="pin" size={12} stroke={2.2} /> Where you left off · <span class="tnum">{ago(last.at, clock.minute)}</span></p>
      <p class="txt">{last.text}</p>
    </div>
    <button class="got" onclick={() => (tucked = true)}>Got it</button>
  </aside>
{/if}

<style>
  .note {
    --amber: #b07e06;
    position: relative;
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 10px 10px 8px;
    border-radius: var(--r-md);
    background: color-mix(in srgb, var(--amber) 8%, var(--raised));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--amber) 26%, transparent);
  }
  :global([data-theme='dark']) .note {
    --amber: #e2b44a;
  }
  .note.focus {
    background: color-mix(in srgb, var(--amber) 10%, var(--surface));
  }
  /* A tiny trail of crumbs leading to now. */
  .trail {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding-top: 4px;
    width: 14px;
    flex: none;
  }
  .trail i {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--amber);
    opacity: calc(0.25 + var(--i) * 0.15);
    animation: crumb 420ms var(--ease-settle) backwards;
    animation-delay: calc(240ms + var(--i) * 90ms);
  }
  .trail i.now {
    width: 9px;
    height: 9px;
    opacity: 1;
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--amber) 22%, transparent);
  }
  @keyframes crumb {
    from {
      transform: scale(0);
      opacity: 0;
    }
  }
  :global([data-motion='calm']) .trail i {
    animation: none;
  }
  .body {
    flex: 1;
    min-width: 0;
  }
  .lbl {
    display: flex;
    align-items: center;
    gap: 5px;
    margin: 0 0 3px;
    font-size: var(--t-xs);
    font-weight: 500;
    color: color-mix(in srgb, var(--amber) 70%, var(--ink));
  }
  .txt {
    margin: 0;
    font-family: var(--font-read);
    font-size: var(--t-md);
    line-height: 1.45;
    color: var(--ink);
    overflow-wrap: anywhere;
  }
  .got {
    flex: none;
    height: 26px;
    padding: 0 10px;
    border-radius: var(--r-pill);
    font-size: var(--t-xs);
    font-weight: 500;
    color: var(--ink-2);
  }
  .got:hover {
    background: var(--sunken);
    color: var(--ink);
  }
</style>
