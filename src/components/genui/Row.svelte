<script lang="ts">
  // Components side by side, sharing the width; they wrap when the panel is narrow.
  import type { ComponentRenderProps } from '@openuidev/svelte-lang';
  import { valid } from '../../lib/ai/genui/read';
  import { RowProps } from '../../lib/ai/genui/schema';

  let { props, renderNode }: ComponentRenderProps<Record<string, unknown>> = $props();
  const p = $derived(valid(RowProps, props));
</script>

{#if p?.children.length}
  <div class="row">{@render renderNode(p.children)}</div>
{/if}

<style>
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px 14px;
    min-width: 0;
  }
  .row > :global(*) {
    flex: 1 1 150px;
    min-width: 0;
  }
</style>
