<script lang="ts" generics="T extends string">
  // The tabs at the top of Your week (Overview · Done): one pill track whose thumb glides on
  // clip-path (compositor only), like the backlog's lists; a count rolls like an odometer.
  import Icon from '../../lib/Icon.svelte';
  import Rolling from '../../lib/dial/Rolling.svelte';
  import { view } from '../../lib/stores/view.svelte';

  let {
    tabs,
    value,
    onchange,
    label,
  }: {
    tabs: { id: T; label: string; icon: string; count?: number }[];
    value: T;
    onchange: (v: T) => void;
    label: string;
  } = $props();

  let root: HTMLDivElement | undefined = $state();
  let inset = $state('inset(3px 100% 3px 0 round 999px)');
  let ready = $state(false);

  function measure() {
    if (!root) return;
    const i = tabs.findIndex((t) => t.id === value);
    const btn = root.querySelectorAll<HTMLButtonElement>('button')[i];
    if (!btn) return;
    const r = root.clientWidth - (btn.offsetLeft + btn.offsetWidth);
    inset = `inset(3px ${r}px 3px ${btn.offsetLeft}px round 999px)`;
  }

  $effect(() => {
    value;
    tabs.map((t) => t.count).join();
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
    // Arrow keys move between tabs here, not between days.
    e.preventDefault();
    e.stopPropagation();
    const i = tabs.findIndex((t) => t.id === value);
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    onchange(next.id);
    root?.querySelectorAll<HTMLButtonElement>('button')[tabs.indexOf(next)]?.focus();
  }
</script>

<div class="tabs" bind:this={root} role="tablist" aria-label={label} tabindex="-1" onkeydown={key}>
  <span class="thumb" class:ready style:clip-path={inset} aria-hidden="true"></span>
  {#each tabs as t (t.id)}
    <button role="tab" aria-selected={t.id === value} tabindex={t.id === value ? 0 : -1} onclick={() => onchange(t.id)}>
      <span class="ico"><Icon name={t.icon} size={15} stroke={2} /></span>
      <span>{t.label}</span>
      {#if t.count}
        <span class="n tnum"><Rolling text={String(t.count)} reduced={view.reducedMotion} /></span>
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
    transition: clip-path 0.42s cubic-bezier(0.34, 1.3, 0.64, 1);
  }
  :global([data-motion='calm']) .thumb.ready {
    transition-duration: 0.12s;
  }
  button {
    flex: 1 1 0;
    min-width: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    height: 32px;
    padding: 0 var(--s-3);
    border-radius: var(--r-pill);
    font-family: var(--font-ui);
    font-size: var(--t-sm);
    font-weight: 500;
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
    transition:
      color var(--dur-2) var(--ease-out),
      transform var(--dur-3) cubic-bezier(0.34, 1.6, 0.64, 1);
  }
  button[aria-selected='true'] .ico {
    color: var(--ink-2);
    transform: scale(1.12);
  }
  .n {
    min-width: 1.4em;
    padding: 0 6px;
    border-radius: var(--r-pill);
    font-size: var(--t-xs);
    font-weight: 400;
    line-height: 18px;
    color: var(--ink-3);
    background: color-mix(in srgb, var(--ink) 6%, transparent);
  }
</style>
