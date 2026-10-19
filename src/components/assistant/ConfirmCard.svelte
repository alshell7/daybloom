<script lang="ts">
  // Removing asks first, right here. Routines choose "just this one" or "all of them".
  // Everything removed can come back with Undo.
  import { blockFor, dayWord, removeTarget, type Undo } from '../../lib/assistant/tools';
  import { formatTime } from '../../lib/engine/time';
  import Icon from '../../lib/Icon.svelte';
  import { tasks } from '../../lib/stores/tasks.svelte';
  import { view } from '../../lib/stores/view.svelte';

  let { card }: { card: { kind: 'confirm'; key: string; title: string; recurring: boolean } } = $props();

  let step = $state<'ask' | 'removed' | 'kept'>('ask');
  let undo: Undo | null = null;
  const isBlock = $derived(card.key.startsWith('task:'));
  const b = $derived(isBlock && step === 'ask' ? blockFor(card.key) : null);
  const item = $derived(!isBlock ? tasks.get(card.key) : undefined);
  const color = $derived(b?.color ?? 'var(--ink-3)');

  function remove(all = false) {
    undo = removeTarget(card.key, all);
    step = undo ? 'removed' : 'kept';
  }

  function restore() {
    undo?.();
    undo = null;
    step = 'kept';
  }
</script>

<div class="a-card confirm" style:--c={color}>
  <div class="head">
    <span class="a-ico"><Icon name={b?.icon ?? item?.icon ?? 'trash-ui'} size={15} /></span>
    <div class="txt">
      <strong class="a-title" class:struck={step === 'removed'}>{card.title || 'Untitled block'}</strong>
      <span class="a-meta">
        {#if b}
          {dayWord(b.date)}{b.floating ? ' · any time' : ` · ${formatTime(b.startMs, view.hour12)}`}{card.recurring ? ' · repeats' : ''}
        {:else if item}
          In your backlog
        {:else if step === 'removed'}
          Removed
        {:else}
          Kept
        {/if}
      </span>
    </div>
  </div>
  <div class="a-actions">
    {#if step === 'ask'}
      {#if card.recurring}
        <button class="a-chip danger" onclick={() => remove(false)}>Just this one</button>
        <button class="a-chip danger" onclick={() => remove(true)}>All of them</button>
      {:else}
        <button class="a-chip danger" onclick={() => remove(false)}><Icon name="trash-ui" size={13} /> Remove</button>
      {/if}
      <button class="a-chip quiet" onclick={() => (step = 'kept')}>Keep it</button>
    {:else if step === 'removed'}
      <span class="a-meta">Removed.</span>
      <button class="a-chip quiet" onclick={restore}><Icon name="undo" size={13} /> Undo</button>
    {:else}
      <span class="a-meta">Kept — nothing changed.</span>
    {/if}
  </div>
</div>

<style>
  .head {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--s-3);
    align-items: center;
  }
  .txt {
    display: grid;
    gap: 1px;
    min-width: 0;
  }
  .struck {
    text-decoration: line-through;
    text-decoration-color: var(--ink-3);
    color: var(--ink-2);
  }
</style>
