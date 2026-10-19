<script lang="ts">
  import Icon from '../../lib/Icon.svelte';
  import { GUIDES, type GuideId } from './guides';

  let {
    open = null,
    only = null,
  }: {
    /** Expand this guide at first. */
    open?: GuideId | null;
    /** Show only this guide, expanded. */
    only?: GuideId | null;
  } = $props();

  const list = $derived(only ? GUIDES.filter((g) => g.id === only) : GUIDES);
</script>

<div class="guides">
  {#each list as g (g.id)}
    <details class="guide" open={only === g.id || open === g.id}>
      <summary>
        <span class="mark"><Icon name={g.icon} size={14} /></span>
        <span class="name">{g.name}</span>
        <span class="chev"><Icon name="chevron-down" size={14} /></span>
      </summary>
      <ol>
        {#each g.steps as step, i (i)}
          <li><span class="n tnum" aria-hidden="true">{i + 1}</span><span>{step}</span></li>
        {/each}
      </ol>
      {#each g.notes as note (note)}
        <p class="note">{note}</p>
      {/each}
    </details>
  {/each}
</div>

<style>
  .guides {
    display: grid;
    gap: var(--s-1);
  }
  .guide {
    border-radius: var(--r-sm);
    background: var(--surface);
    border: 1px solid var(--line);
  }
  summary {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    min-height: 40px;
    padding: 0 var(--s-3);
    cursor: pointer;
    list-style: none;
    font-family: var(--font-ui);
    font-size: var(--t-sm);
    font-weight: 500;
    color: var(--ink);
    border-radius: var(--r-sm);
    transition: background var(--dur-1) var(--ease-out);
  }
  summary::-webkit-details-marker {
    display: none;
  }
  summary:hover {
    background: var(--sunken);
  }
  .mark {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--raised);
    color: var(--ink-2);
    box-shadow: inset 0 0 0 1px var(--line);
  }
  .name {
    flex: 1;
  }
  .chev {
    color: var(--ink-3);
    transition: transform var(--dur-2) var(--ease-out);
  }
  details[open] .chev {
    transform: rotate(180deg);
  }
  ol {
    margin: 0;
    padding: var(--s-1) var(--s-3) var(--s-2);
    list-style: none;
    display: grid;
    gap: 6px;
  }
  li {
    display: grid;
    grid-template-columns: 20px 1fr;
    gap: var(--s-2);
    align-items: start;
    font-size: var(--t-sm);
    line-height: 1.45;
    color: var(--ink-2);
  }
  .n {
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    margin-top: -1px;
    border-radius: 50%;
    background: var(--sunken);
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: 11px;
    font-weight: 500;
  }
  .note {
    margin: 0;
    padding: 0 var(--s-3) var(--s-2) calc(var(--s-3) + 28px);
    font-size: var(--t-xs);
    line-height: 1.45;
    color: var(--ink-3);
  }
  .note:last-child {
    padding-bottom: var(--s-3);
  }
</style>
