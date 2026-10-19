<script lang="ts">
  // In focus mode: a quiet line for the thought that pops up mid-task. Park it and it waits
  // (it rises into the little counter), so you can stay with what you're doing.
  import { backOut } from 'svelte/easing';
  import { scale } from 'svelte/transition';
  import { crumbs } from '../../../lib/addons/crumbs/crumbs.svelte';
  import Icon from '../../../lib/Icon.svelte';
  import { view } from '../../../lib/stores/view.svelte';

  let { from }: { from?: string } = $props();
  let text = $state('');
  let flying = $state<{ id: number; text: string }[]>([]);
  let seq = 0;
  const rm = $derived(view.reducedMotion);
  const since = Date.now();
  const count = $derived(crumbs.parkedSince(since - 6 * 3_600_000).length);

  function park(e: SubmitEvent) {
    e.preventDefault();
    const p = crumbs.park(text, from);
    if (!p) return;
    const f = { id: ++seq, text: text.trim() };
    flying = [...flying, f];
    setTimeout(() => (flying = flying.filter((x) => x.id !== f.id)), rm ? 0 : 700);
    text = '';
  }
</script>

<form class="park" onsubmit={park}>
  <span class="ico"><Icon name="inbox" size={14} /></span>
  <input bind:value={text} placeholder="A thought popped up? Park it here, it will wait" aria-label="Park a thought" maxlength="500" onkeydown={(e) => e.key === 'Escape' && text && (e.stopPropagation(), (text = ''))} />
  {#if count}
    {#key count}
      <span class="count tnum" in:scale={{ start: 0.5, duration: rm ? 0 : 420, easing: backOut }} title="Parked thoughts wait until you're done">{count} parked</span>
    {/key}
  {/if}
  {#each flying as f (f.id)}
    <span class="fly" style:--d={rm ? '0ms' : '650ms'} aria-hidden="true">{f.text}</span>
  {/each}
</form>

<style>
  .park {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    height: 40px;
    padding: 0 6px 0 12px;
    border-radius: var(--r-pill);
    background: color-mix(in srgb, var(--ink) 4%, transparent);
    box-shadow: inset 0 0 0 1px var(--line);
    transition: box-shadow var(--dur-2) var(--ease-out);
  }
  .park:focus-within {
    box-shadow: inset 0 0 0 1px var(--line-strong);
  }
  .ico {
    display: grid;
    color: var(--ink-3);
  }
  input {
    flex: 1;
    min-width: 0;
    height: 100%;
    border: 0;
    background: transparent;
    outline: none;
    font-size: var(--t-sm);
    color: var(--ink);
  }
  input::placeholder {
    color: var(--ink-3);
  }
  .count {
    flex: none;
    height: 26px;
    padding: 0 10px;
    border-radius: var(--r-pill);
    font-size: var(--t-xs);
    font-weight: 500;
    line-height: 26px;
    color: var(--ink-2);
    background: var(--sunken);
  }
  /* The parked words lift away into the counter. */
  .fly {
    position: absolute;
    left: 38px;
    right: 90px;
    top: 11px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: var(--t-sm);
    color: var(--ink-2);
    pointer-events: none;
    animation: lift var(--d) var(--ease-out) forwards;
  }
  @keyframes lift {
    to {
      transform: translate(48%, -14px) scale(0.6);
      opacity: 0;
    }
  }
</style>
