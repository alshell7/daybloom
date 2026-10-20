<script lang="ts">
  // A release's notes: New, Addons and Fixes, each item a name and a plain sentence. Items
  // arrive one after another (a short stagger), so a long list reads as a little reveal.
  import { cubicOut } from 'svelte/easing';
  import { fly } from 'svelte/transition';
  import Icon from '../lib/Icon.svelte';
  import type { NoteGroup } from '../lib/releaseNotes';
  import { view } from '../lib/stores/view.svelte';

  let { groups, compact = false }: { groups: NoteGroup[]; compact?: boolean } = $props();
  const rm = $derived(view.reducedMotion);
  const offset = (gi: number) => groups.slice(0, gi).reduce((s, g) => s + g.items.length + 1, 0);
</script>

<div class="notes" class:compact>
  {#each groups as g, gi (g.title)}
    <section>
      <h4 in:fly={{ y: 6, duration: rm ? 0 : 280, delay: rm ? 0 : offset(gi) * 45, easing: cubicOut }}>
        <span class="gi" data-kind={g.title.toLowerCase()}><Icon name={g.icon} size={12} stroke={2.4} /></span>{g.title}
      </h4>
      <ul>
        {#each g.items as it, i (it.name + it.text)}
          <li in:fly={{ y: 6, duration: rm ? 0 : 280, delay: rm ? 0 : (offset(gi) + i + 1) * 45, easing: cubicOut }}>
            {#if it.name}<b>{it.name}</b>{/if}
            {#if it.text}<span>{it.text}</span>{/if}
          </li>
        {/each}
      </ul>
    </section>
  {/each}
</div>

<style>
  .notes {
    display: grid;
    gap: var(--s-4);
  }
  .compact {
    gap: var(--s-3);
  }
  h4 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 6px;
    font-family: var(--font-ui);
    font-size: var(--t-xs);
    font-weight: 500;
    color: var(--ink-3);
    text-transform: none;
  }
  .gi {
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    color: var(--ink);
    background: var(--sunken);
  }
  .gi[data-kind='new'] {
    color: var(--ink-inverse);
    background: var(--lume);
  }
  .gi[data-kind='addons'] {
    color: #fff;
    background: #8670e6;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 8px;
  }
  li {
    display: grid;
    gap: 2px;
    padding-left: 28px;
    font-size: var(--t-sm);
    line-height: 1.45;
  }
  li b {
    font-weight: 500;
    color: var(--ink);
  }
  li span {
    color: var(--ink-2);
  }
  .compact li {
    font-size: var(--t-xs);
  }
</style>
