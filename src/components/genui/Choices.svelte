<script lang="ts">
  // Quick replies: a tap sends the words as the person's next message (an OpenUI
  // ContinueConversation action, which the chat turns into a new turn). Once one is picked the
  // others step back, so an old card can't fire twice.
  import { getTriggerAction, type ComponentRenderProps } from '@openuidev/svelte-lang';
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { valid } from '../../lib/ai/genui/read';
  import { ChoicesProps } from '../../lib/ai/genui/schema';
  import Icon from '../../lib/Icon.svelte';
  import { view } from '../../lib/stores/view.svelte';

  let { props }: ComponentRenderProps<Record<string, unknown>> = $props();
  const p = $derived(valid(ChoicesProps, props));
  /** A reply that only repeats a button the card already has ("Place these"). */
  const ECHO = /^(place|add) (these|them|all|it)\.?$/i;
  const options = $derived([...new Set((p?.options ?? []).map((o) => o.trim().slice(0, 60)).filter((o) => o && !ECHO.test(o)))].slice(0, 4));
  const trigger = getTriggerAction();
  let picked = $state<string | null>(null);
  const rise = (i: number) => ({ y: 6, delay: 60 + Math.min(i, 4) * 40, duration: view.reducedMotion ? 0 : 260, easing: cubicOut });

  function pick(o: string) {
    if (picked) return;
    picked = o;
    trigger(o);
  }
</script>

{#if options.length}
  <div class="choices" role="group" aria-label={p?.prompt?.trim() || 'Reply'}>
    {#if p?.prompt?.trim()}<p class="a-label">{p.prompt.trim().slice(0, 60)}</p>{/if}
    <div class="row">
      {#each options as o, i (o)}
        <button class="choice" class:picked={picked === o} disabled={!!picked && picked !== o} onclick={() => pick(o)} in:fly={rise(i)}>
          {#if picked === o}<Icon name="check" size={13} stroke={2.4} />{/if}{o}
        </button>
      {/each}
    </div>
  </div>
{/if}

<style>
  .choices {
    display: grid;
    gap: 6px;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .choice {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 32px;
    padding: 5px 14px;
    border-radius: var(--r-pill);
    border: 1px solid var(--line-strong);
    background: var(--raised);
    color: var(--ink);
    font-size: var(--t-sm);
    text-align: left;
    transition:
      background var(--dur-1) var(--ease-out),
      border-color var(--dur-1) var(--ease-out),
      opacity var(--dur-2) var(--ease-out),
      transform var(--dur-2) cubic-bezier(0.3, 1.5, 0.5, 1);
  }
  .choice:hover:not(:disabled) {
    border-color: var(--ink-3);
    transform: translateY(-1px);
  }
  .choice:active:not(:disabled) {
    transform: scale(0.97);
  }
  .choice.picked {
    border-color: var(--ink);
    background: color-mix(in srgb, var(--ink) 6%, var(--raised));
  }
  .choice:disabled:not(.picked) {
    opacity: 0.4;
  }
</style>
