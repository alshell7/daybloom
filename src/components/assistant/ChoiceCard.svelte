<script lang="ts">
  // "Did you mean…": each option is a complete call; tapping one runs it as its own answer.
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { session } from '../../lib/assistant/session.svelte';
  import type { Option } from '../../lib/assistant/tools';
  import Icon from '../../lib/Icon.svelte';
  import { view } from '../../lib/stores/view.svelte';

  let { options }: { options: Option[] } = $props();
  let chosen = $state<number | null>(null);
  const rise = (i: number) => ({ y: 6, delay: Math.min(i, 4) * 30, duration: view.reducedMotion ? 0 : 220, easing: cubicOut });

  function pick(i: number) {
    if (chosen !== null) return;
    chosen = i;
    void session.run(options[i].call, options[i].label);
  }
</script>

<div class="choices" role="group" aria-label="Choose one">
  {#each options as o, i (o.label)}
    <button
      class="choice"
      style:--c={o.color ?? 'var(--ink-3)'}
      class:picked={chosen === i}
      disabled={chosen !== null && chosen !== i}
      onclick={() => pick(i)}
      in:fly={rise(i)}
    >
      <span class="a-ico" class:quiet={!o.color}><Icon name={o.icon ?? 'arrow-right'} size={14} /></span>
      <span class="label">{o.label}</span>
      <Icon name={chosen === i ? 'check' : 'chevron-right'} size={14} />
    </button>
  {/each}
</div>

<style>
  .choices {
    display: grid;
    gap: 6px;
  }
  .choice {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: var(--s-3);
    align-items: center;
    min-height: 42px;
    padding: 6px 12px 6px 7px;
    border-radius: var(--r-md);
    border: 1px solid var(--line-strong);
    background: var(--surface);
    color: var(--ink-2);
    text-align: left;
    transition:
      background var(--dur-1) var(--ease-out),
      border-color var(--dur-1) var(--ease-out),
      transform var(--dur-1) var(--ease-out),
      opacity var(--dur-2) var(--ease-out);
  }
  .choice:hover:not(:disabled) {
    background: var(--raised);
    border-color: var(--ink-3);
    color: var(--ink);
  }
  .choice:active:not(:disabled) {
    transform: scale(0.98);
  }
  .choice.picked {
    border-color: var(--ink);
    color: var(--ink);
  }
  .label {
    font-size: var(--t-md);
    font-weight: 500;
    color: var(--ink);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
