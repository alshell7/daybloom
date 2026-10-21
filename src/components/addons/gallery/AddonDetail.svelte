<script lang="ts">
  // What an addon does: a little animated scene of it at work, a few lines, and the next step
  // (turn it on, or open it). Shown beside the list when there's room, or inside its row when
  // there isn't (then without the title, which the row already shows).
  import { cubicOut } from 'svelte/easing';
  import { fly } from 'svelte/transition';
  import type { AddonMeta } from '../../../lib/addons/registry';
  import Icon from '../../../lib/Icon.svelte';
  import { view } from '../../../lib/stores/view.svelte';
  import AddonScene from './scenes/AddonScene.svelte';

  let {
    addon: a,
    on,
    fresh = false,
    header = true,
    onturnon,
  }: {
    addon: AddonMeta;
    on: boolean;
    fresh?: boolean;
    header?: boolean;
    /** Turn it on; `from` is where the celebration starts. */
    onturnon: (from: HTMLElement) => void;
  } = $props();

  const ms = (n: number) => (view.reducedMotion ? 0 : n);
</script>

<div class="detail" class:split={header} style:--ac={a.accent}>
  <div class="body">
    <AddonScene addon={a} replay={fresh} />

    {#if header}
      <div class="title">
        <h3>{a.name}</h3>
        <p>{a.tagline}</p>
      </div>
    {/if}

    <p class="desc">{a.description}</p>

    <ul>
      {#each a.features as f, i (f.text)}
        <li in:fly|global={{ y: 6, duration: ms(300), delay: ms(70 + i * 45), easing: cubicOut }}>
          <span class="fi"><Icon name={f.icon} size={13} stroke={2} /></span>
          <span>{f.text}</span>
        </li>
      {/each}
    </ul>

    {#if a.ai}
      <p class="ai">
        <Icon name="brain-circuit" size={13} />
        <span>Uses the AI you set up in <button type="button" class="link" onclick={() => (view.sheet = { kind: 'settings', section: 'ai' })}>Settings › AI</button></span>
      </p>
    {/if}
  </div>

  <div class="act">
    {#key on}
      <div class="act-in" in:fly|global={{ y: 6, duration: ms(320), easing: cubicOut }}>
        {#if !on}
          <button type="button" class="btn btn-primary" onclick={(e) => onturnon(e.currentTarget)}>
            <Icon name="power" size={14} stroke={2.2} /> Turn on
          </button>
        {:else if a.sheet}
          <button type="button" class="btn btn-soft go" onclick={() => (view.sheet = { kind: a.sheet! })}>
            Open {a.name} <Icon name="arrow-right" size={14} />
          </button>
          <span class="hint">Also in the top bar</span>
        {:else}
          <span class="hint where"><Icon name="sparkles" size={13} /> <span>{a.where}</span></span>
        {/if}
      </div>
    {/key}
  </div>
</div>

<style>
  .detail,
  .body {
    display: grid;
    gap: var(--s-3);
    min-width: 0;
  }
  /* Rows keep their full height (the scene's frame clips, so it could otherwise be squeezed). */
  .body {
    grid-auto-rows: max-content;
    align-content: start;
  }
  /* Beside the list: the card's body scrolls when it must, and the next step stays below it
     as a footer, like a panel's. The card sets its padding as --card-pad. */
  .detail.split {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 0;
  }
  .split .body {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: var(--card-pad, 0px) var(--card-pad, 0px) var(--s-3);
  }
  .split .act {
    flex: none;
    padding: 10px var(--card-pad, 0px) var(--card-pad, 0px);
    border-top: 1px solid var(--line);
    background: var(--surface);
  }
  .title {
    min-width: 0;
    margin-top: 2px;
  }
  h3 {
    margin: 0;
    font-family: var(--font-ui);
    font-size: var(--t-lg);
    font-weight: 500;
    letter-spacing: -0.01em;
    line-height: 1.25;
  }
  .title p {
    margin: 2px 0 0;
    font-size: var(--t-sm);
    color: var(--ink-3);
    line-height: 1.35;
  }
  .desc {
    margin: 0;
    font-size: var(--t-sm);
    line-height: 1.55;
    color: var(--ink-2);
  }
  ul {
    display: grid;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li {
    display: flex;
    align-items: flex-start;
    gap: 9px;
    min-width: 0;
    font-size: var(--t-sm);
    line-height: 1.45;
    color: var(--ink-2);
  }
  .fi {
    display: grid;
    place-items: center;
    flex: none;
    width: 22px;
    height: 22px;
    margin-top: -1px;
    border-radius: 7px;
    color: color-mix(in srgb, var(--ac) 82%, var(--ink));
    background: color-mix(in srgb, var(--ac) 11%, transparent);
  }
  .ai {
    display: flex;
    align-items: flex-start;
    gap: 7px;
    margin: 0;
    font-size: var(--t-xs);
    line-height: 1.45;
    color: var(--ink-3);
  }
  .ai :global(svg) {
    margin-top: 1px;
  }
  .link {
    color: var(--ink-2);
    font-family: inherit;
    text-decoration: underline;
    text-decoration-color: var(--line-strong);
    text-underline-offset: 2px;
    transition:
      color var(--dur-1) var(--ease-out),
      text-decoration-color var(--dur-1) var(--ease-out);
  }
  .link:hover {
    color: var(--ink);
    text-decoration-color: currentColor;
  }
  .act {
    min-height: 36px;
    padding-top: 2px;
  }
  .act-in {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--s-2) var(--s-3);
  }
  .go :global(svg) {
    transition: transform var(--dur-2) var(--ease-out);
  }
  .go:hover :global(svg) {
    transform: translateX(3px);
  }
  .hint {
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .where {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    line-height: 1.45;
    color: var(--ink-2);
  }
  .where :global(svg) {
    flex: none;
    margin-top: 1px;
    color: color-mix(in srgb, var(--ac) 82%, var(--ink));
  }
</style>
