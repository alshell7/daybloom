<script lang="ts">
  // The usual root: components in a column. Each one rises in once, a beat after the one
  // above (compositor-only; none under Calm).
  import type { ComponentRenderProps } from '@openuidev/svelte-lang';
  import { valid } from '../../lib/ai/genui/read';
  import { StackProps } from '../../lib/ai/genui/schema';

  let { props, renderNode }: ComponentRenderProps<Record<string, unknown>> = $props();
  const p = $derived(valid(StackProps, props));
</script>

{#if p?.children.length}
  <div class="stack" data-gap={p.gap ?? 'm'}>{@render renderNode(p.children)}</div>
{/if}

<style>
  .stack {
    display: grid;
    gap: 10px;
    min-width: 0;
  }
  .stack[data-gap='s'] {
    gap: 6px;
  }
  .stack[data-gap='l'] {
    gap: 16px;
  }
  .stack > :global(*) {
    min-width: 0;
    animation: gu-rise 420ms var(--ease-out) both;
  }
  .stack > :global(*:nth-child(2)) {
    animation-delay: 70ms;
  }
  .stack > :global(*:nth-child(3)) {
    animation-delay: 140ms;
  }
  .stack > :global(*:nth-child(n + 4)) {
    animation-delay: 200ms;
  }
  @keyframes gu-rise {
    from {
      opacity: 0;
      transform: translateY(8px) scale(0.985);
    }
  }
  :global([data-motion='calm']) .stack > :global(*) {
    animation: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .stack > :global(*) {
      animation: none;
    }
  }
</style>
