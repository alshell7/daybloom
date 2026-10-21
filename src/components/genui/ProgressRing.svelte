<script lang="ts">
  // How much is done, as a ring (the assistant's Ring): lume by default, because finished time
  // is lume; "3/5" in the middle and the words beside it.
  import type { ComponentRenderProps } from '@openuidev/svelte-lang';
  import { toneColor, valid } from '../../lib/ai/genui/read';
  import { ProgressRingProps } from '../../lib/ai/genui/schema';
  import Ring from '../assistant/Ring.svelte';

  let { props }: ComponentRenderProps<Record<string, unknown>> = $props();
  const p = $derived(valid(ProgressRingProps, props));
  const total = $derived(p ? Math.max(0, Math.round(p.total)) : 0);
  const value = $derived(p ? Math.max(0, Math.min(total, Math.round(p.value))) : 0);
</script>

{#if p && total > 0}
  <div class="progress">
    <Ring fraction={value / total} color={toneColor(p.tone, 'lume')} size={52} stroke={5} label={`${value} of ${total}`}>{value}/{total}</Ring>
    <div class="txt">
      <strong>{p.label?.trim().slice(0, 50) || 'Done'}</strong>
      <span class="a-meta">{value === total ? 'All of them. Lovely.' : `${value} of ${total} so far`}</span>
    </div>
  </div>
{/if}

<style>
  .progress {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }
  .txt {
    display: grid;
    gap: 1px;
    min-width: 0;
  }
  strong {
    font-size: var(--t-md);
    font-weight: 500;
    color: var(--ink);
  }
</style>
