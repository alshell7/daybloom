<script lang="ts">
  // Two to four Stat tiles side by side, as many per row as fit.
  import type { ComponentRenderProps } from '@openuidev/svelte-lang';
  import { each } from '../../lib/ai/genui/read';
  import { StatProps } from '../../lib/ai/genui/schema';

  let { props, renderNode }: ComponentRenderProps<Record<string, unknown>> = $props();
  const tiles = $derived(Array.isArray(props.tiles) ? props.tiles.slice(0, 4) : []);
  const ok = $derived(each(StatProps, tiles).length > 0);
</script>

{#if ok}
  <div class="tiles">{@render renderNode(tiles)}</div>
{/if}

<style>
  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(104px, 1fr));
    gap: 8px;
  }
</style>
