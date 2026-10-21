<script lang="ts">
  // A quiet framed group with a small heading. Cards inside it lose their own frame, so a
  // BlockCard in a Card never wears two borders.
  import type { ComponentRenderProps } from '@openuidev/svelte-lang';
  import Icon from '../../lib/Icon.svelte';
  import { iconOr, valid } from '../../lib/ai/genui/read';
  import { CardProps } from '../../lib/ai/genui/schema';

  let { props, renderNode }: ComponentRenderProps<Record<string, unknown>> = $props();
  const p = $derived(valid(CardProps, props));
</script>

{#if p?.children.length}
  <section class="a-card gu-card" class:titled={!!p.title?.trim()}>
    {#if p.title?.trim()}
      <p class="a-label">{#if p.icon}<Icon name={iconOr(p.icon, 'sparkles')} size={14} stroke={2} />{/if}{p.title.trim().slice(0, 60)}</p>
    {/if}
    {@render renderNode(p.children)}
  </section>
{/if}

<style>
  .gu-card > :global(.a-card),
  .gu-card :global(.gu-flat) {
    padding: 0;
    border: 0;
    background: transparent;
  }
  /* A part's own default heading says less than the card's. */
  .gu-card.titled :global(.gu-flat > .a-label.auto) {
    display: none;
  }
</style>
