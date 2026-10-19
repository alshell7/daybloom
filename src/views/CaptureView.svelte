<script lang="ts">
  // The quick-capture card (tray / menu bar → Add to Backlog…): a small floating window that
  // takes the keyboard, adds what you type to the Inbox, says so, and gets out of the way.
  // Esc, clicking elsewhere, or a moment after adding closes it.
  import { onMount, tick } from 'svelte';
  import { cubicOut } from 'svelte/easing';
  import { fade, scale } from 'svelte/transition';
  import Capture from '../components/backlog/Capture.svelte';
  import Icon from '../lib/Icon.svelte';
  import { platform } from '../lib/platform';
  import { shownTitle } from '../lib/privacy';
  import { taskFile } from '../lib/stores/tasks.svelte';
  import { view } from '../lib/stores/view.svelte';

  let cap: Capture | undefined = $state();
  let done = $state<string[] | null>(null);
  let closing = false;

  const first = $derived(done ? taskFile.value.tasks.find((t) => t.id === done![0]) : null);

  async function close() {
    if (closing) return;
    closing = true;
    await platform.closeCapture();
  }

  function captured(ids: string[]) {
    done = ids;
    setTimeout(close, view.reducedMotion ? 600 : 1100);
  }

  onMount(() => {
    let focusedOnce = false;
    const onFocus = () => (focusedOnce = true);
    // Clicking anywhere else puts it away (only after it has had the keyboard once).
    const onBlur = () => focusedOnce && !done && close();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !e.defaultPrevented && close();
    addEventListener('focus', onFocus);
    addEventListener('blur', onBlur);
    addEventListener('keydown', onKey);
    void tick().then(() => cap?.focus());
    return () => {
      removeEventListener('focus', onFocus);
      removeEventListener('blur', onBlur);
      removeEventListener('keydown', onKey);
    };
  });
</script>

<div class="stage">
  <div class="card" in:scale={{ start: 0.96, duration: view.reducedMotion ? 0 : 240, easing: cubicOut }}>
    {#if done}
      <div class="done" in:fade={{ duration: view.reducedMotion ? 0 : 160 }} role="status">
        <span class="tick" in:scale={{ start: 0.5, duration: view.reducedMotion ? 0 : 320, easing: cubicOut }}><Icon name="check" size={16} stroke={2.6} /></span>
        <span class="msg">
          {#if done.length > 1}Added {done.length} things to your Inbox{:else}<b>{first ? shownTitle(first.title, first.category) : 'Added'}</b> is in your Inbox{/if}
        </span>
      </div>
    {:else}
      <header>
        <span class="title"><Icon name="inbox" size={15} /> Add to the backlog</span>
        <span class="keys"><kbd>⏎</kbd> add <kbd>esc</kbd> close</span>
      </header>
      <Capture bind:this={cap} target="inbox" oncaptured={captured} />
    {/if}
  </div>
</div>

<style>
  .stage {
    position: fixed;
    inset: 0;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding: 18px 24px 40px;
  }
  .card {
    width: 100%;
    padding: 12px 14px 14px;
    border-radius: var(--r-lg);
    background: var(--raised);
    border: 1px solid var(--line);
    box-shadow: var(--shadow-3);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 0 2px 10px;
    font-size: var(--t-sm);
  }
  .title {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-weight: 500;
    color: var(--ink-2);
  }
  .keys {
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  kbd {
    font-family: var(--font-ui);
    font-size: var(--t-xs);
    padding: 1px 5px;
    margin: 0 2px 0 8px;
    border-radius: 5px;
    border: 1px solid var(--line-strong);
  }
  .done {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 44px;
    padding: 0 4px;
  }
  .tick {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: var(--ink);
    color: var(--ink-inverse);
  }
  .msg {
    font-size: var(--t-md);
    color: var(--ink-2);
  }
  .msg b {
    font-weight: 500;
    color: var(--ink);
  }
</style>
