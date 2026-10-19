<script lang="ts">
  // Budget burn: the fill shows how much is used; past 85% and past 100% the label says so
  // in words (and an icon), not only in colour.
  import Icon from '../../../lib/Icon.svelte';
  let { used, color = '#3D6FE3', label = '' }: { used: number; color?: string; label?: string } = $props();
  const pct = $derived(Math.max(0, used * 100));
  const state = $derived(used > 1 ? 'over' : used >= 0.85 ? 'near' : 'ok');
</script>

<div class="meter {state}" style:--c={color} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={label}>
  <span class="track"><span class="fill" style:transform={`scaleX(${Math.min(1, used)})`}></span></span>
  <span class="txt tnum">
    {#if state !== 'ok'}<Icon name={state === 'over' ? 'flag' : 'hourglass'} size={11} stroke={2.3} />{/if}
    {Math.round(pct)}%{state === 'over' ? ' · over budget' : state === 'near' ? ' · nearly used' : ''}
  </span>
</div>

<style>
  .meter {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .track {
    flex: 1;
    height: 6px;
    border-radius: 3px;
    background: color-mix(in srgb, var(--c) 18%, transparent);
    overflow: hidden;
  }
  .fill {
    display: block;
    height: 100%;
    border-radius: 3px;
    background: var(--c);
    transform-origin: left center;
    transition: transform 600ms var(--ease-out);
  }
  .txt {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: var(--t-xs);
    color: var(--ink-2);
    white-space: nowrap;
  }
  .over .txt {
    color: var(--danger);
  }
</style>
