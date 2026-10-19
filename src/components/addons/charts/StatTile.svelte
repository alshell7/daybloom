<script lang="ts">
  // label · value · delta vs a named period. The delta is text and an arrow, never colour alone.
  import Icon from '../../../lib/Icon.svelte';
  let { label, value, delta = null, hint = '', hero = false }: { label: string; value: string; delta?: { pct: number; vs: string } | null; hint?: string; hero?: boolean } = $props();
</script>

<div class="tile" class:hero>
  <span class="label">{label}</span>
  <span class="value">{value}</span>
  {#if delta && Number.isFinite(delta.pct)}
    <span class="delta tnum">
      <Icon name={delta.pct >= 0 ? 'trend-up' : 'chevron-down'} size={12} stroke={2.4} />
      {delta.pct >= 0 ? '+' : '−'}{Math.abs(Math.round(delta.pct))}% vs {delta.vs}
    </span>
  {:else if hint}
    <span class="delta">{hint}</span>
  {/if}
</div>

<style>
  .tile {
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  .label {
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .value {
    font-size: 22px;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: var(--ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .hero .value {
    font-size: 48px;
    font-weight: 600;
    letter-spacing: -0.03em;
    line-height: 1.05;
  }
  .delta {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: var(--t-xs);
    color: var(--ink-2);
  }
</style>
