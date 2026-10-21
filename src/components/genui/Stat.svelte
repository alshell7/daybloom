<script lang="ts">
  // One number as a tile: the value large and thin, its label in Pencil Grey with a dot of its
  // tone (the colour carries identity, never the text), and a tiny hint under it.
  import type { ComponentRenderProps } from '@openuidev/svelte-lang';
  import { toneColor, valid } from '../../lib/ai/genui/read';
  import { StatProps } from '../../lib/ai/genui/schema';

  let { props }: ComponentRenderProps<Record<string, unknown>> = $props();
  const p = $derived(valid(StatProps, props));
  const value = $derived(p ? (typeof p.value === 'number' ? (Number.isFinite(p.value) ? p.value.toLocaleString() : '') : p.value.trim().slice(0, 14)) : '');
</script>

{#if p && value && p.label.trim()}
  <div class="stat" style:--c={toneColor(p.tone, 'ink')}>
    <span class="label"><span class="dot"></span>{p.label.trim().slice(0, 28)}</span>
    <span class="value">{value}</span>
    {#if p.hint?.trim()}<span class="hint">{p.hint.trim().slice(0, 40)}</span>{/if}
  </div>
{/if}

<style>
  .stat {
    display: grid;
    align-content: start;
    gap: 2px;
    min-width: 0;
    padding: 10px 12px 11px;
    border-radius: var(--r-md);
    background: var(--surface);
    border: 1px solid var(--line);
  }
  .label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--t-xs);
    color: var(--ink-3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .dot {
    flex: none;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--c);
  }
  .value {
    font-family: var(--font-ui);
    font-size: 24px;
    font-weight: 300;
    line-height: 1.15;
    letter-spacing: -0.02em;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .hint {
    font-size: var(--t-xs);
    color: var(--ink-3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
