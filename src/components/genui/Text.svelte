<script lang="ts">
  // A sentence or two, with the same small, safe Markdown as Alef's bubble (escaped first;
  // only bold, italics, code and lists come back).
  import type { ComponentRenderProps } from '@openuidev/svelte-lang';
  import { md } from '../../lib/addons/alef/md';
  import { valid } from '../../lib/ai/genui/read';
  import { TextProps } from '../../lib/ai/genui/schema';

  let { props }: ComponentRenderProps<Record<string, unknown>> = $props();
  const p = $derived(valid(TextProps, props));
</script>

{#if p?.text.trim()}
  <div class="gu-text" class:muted={p.tone === 'muted'}>{@html md(p.text.trim().slice(0, 700))}</div>
{/if}

<style>
  .gu-text {
    font-size: var(--t-md);
    line-height: 1.5;
    color: var(--ink);
    overflow-wrap: anywhere;
  }
  .gu-text.muted {
    font-size: var(--t-sm);
    color: var(--ink-2);
  }
  .gu-text :global(p) {
    margin: 0;
  }
  .gu-text :global(p + p),
  .gu-text :global(p + ul),
  .gu-text :global(ul + p),
  .gu-text :global(p + ol),
  .gu-text :global(ol + p) {
    margin-top: 6px;
  }
  .gu-text :global(ul),
  .gu-text :global(ol) {
    margin: 2px 0 0;
    padding-left: 20px;
  }
  .gu-text :global(code) {
    padding: 1px 5px;
    border-radius: 5px;
    background: color-mix(in srgb, var(--ink) 8%, transparent);
    font-size: 0.9em;
  }
</style>
