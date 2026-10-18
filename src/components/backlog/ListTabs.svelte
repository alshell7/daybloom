<script lang="ts">
  import Icon from '../../lib/Icon.svelte';
  import { LISTS, type ListId } from '../../lib/backlog';
  import Rolling from '../../lib/dial/Rolling.svelte';
  import { view } from '../../lib/stores/view.svelte';

  // The four backlog lists as one pill track; the thumb glides on clip-path (compositor
  // only) like the reference switcher, and each count rolls like an odometer.
  let { value, counts, onchange }: { value: ListId; counts: Record<ListId, number>; onchange: (v: ListId) => void } = $props();

  let root: HTMLDivElement | undefined = $state();
  let inset = $state('inset(3px 100% 3px 0 round 999px)');
  let ready = $state(false);

  function measure() {
    if (!root) return;
    const i = LISTS.findIndex((o) => o.id === value);
    const btn = root.querySelectorAll<HTMLButtonElement>('button')[i];
    if (!btn) return;
    const r = root.clientWidth - (btn.offsetLeft + btn.offsetWidth);
    inset = `inset(3px ${r}px 3px ${btn.offsetLeft}px round 999px)`;
  }

  $effect(() => {
    value;
    counts.inbox;
    counts.next;
    counts.someday;
    counts.done;
    measure();
    requestAnimationFrame(() => (ready = true));
  });

  $effect(() => {
    if (!root) return;
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    return () => ro.disconnect();
  });

  function key(e: KeyboardEvent) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    // Arrow keys move between lists here, not between days.
    e.preventDefault();
    e.stopPropagation();
    const i = LISTS.findIndex((o) => o.id === value);
    const next = LISTS[(i + (e.key === 'ArrowRight' ? 1 : LISTS.length - 1)) % LISTS.length];
    onchange(next.id);
    root?.querySelectorAll<HTMLButtonElement>('button')[LISTS.indexOf(next)]?.focus();
  }
</script>

<div class="tabs" bind:this={root} role="tablist" aria-label="Backlog lists" tabindex="-1" onkeydown={key}>
  <span class="thumb" class:ready style:clip-path={inset} aria-hidden="true"></span>
  {#each LISTS as l (l.id)}
    <button
      role="tab"
      aria-selected={l.id === value}
      tabindex={l.id === value ? 0 : -1}
      onclick={() => onchange(l.id)}
    >
      <span class="ico"><Icon name={l.icon} size={14} stroke={2} /></span>
      <span>{l.label}</span>
      {#if counts[l.id]}
        <span class="n tnum"><Rolling text={String(counts[l.id])} reduced={view.reducedMotion} /></span>
      {/if}
    </button>
  {/each}
</div>

<style>
  .tabs {
    position: relative;
    display: flex;
    padding: 3px;
    gap: 2px;
    border-radius: var(--r-pill);
    background: var(--sunken);
    isolation: isolate;
    outline: none;
  }
  .thumb {
    position: absolute;
    inset: 0;
    z-index: -1;
    background: var(--raised);
    box-shadow: var(--shadow-1);
    border-radius: var(--r-pill);
  }
  .thumb.ready {
    transition: clip-path 0.38s var(--ease-out);
  }
  button {
    flex: 1 1 0;
    min-width: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 30px;
    padding: 0 var(--s-2);
    border-radius: var(--r-pill);
    font-family: var(--font-ui);
    font-size: var(--t-sm);
    color: var(--ink-2);
    white-space: nowrap;
    transition: color var(--dur-2) var(--ease-out);
  }
  button:hover,
  button[aria-selected='true'] {
    color: var(--ink);
  }
  .ico {
    display: grid;
    color: var(--ink-3);
    transition: color var(--dur-2) var(--ease-out);
  }
  button[aria-selected='true'] .ico {
    color: var(--ink-2);
  }
  .n {
    min-width: 1.4em;
    padding: 0 5px;
    border-radius: var(--r-pill);
    font-size: var(--t-xs);
    line-height: 17px;
    color: var(--ink-3);
    background: color-mix(in srgb, var(--ink) 6%, transparent);
  }
  @container backlog (max-width: 420px) {
    .ico {
      display: none;
    }
  }
</style>
