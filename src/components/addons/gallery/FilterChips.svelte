<script lang="ts" generics="T extends string">
  // Filter chips: one choice at a time. A soft pill glides to the chosen chip (clip-path, like
  // the reference switcher), and arrow keys move along them. The row wraps rather than widen.
  import { tick } from 'svelte';

  let {
    options,
    value,
    onchange,
    label,
  }: {
    options: { id: T; label: string; title?: string; count?: number }[];
    value: T;
    onchange: (v: T) => void;
    label: string;
  } = $props();

  let root = $state<HTMLDivElement>();
  let clip = $state('inset(0 100% 100% 0 round 999px)');
  let ready = $state(false);

  function measure() {
    const b = root?.querySelector<HTMLElement>(`[data-chip="${value}"]`);
    if (!root || !b) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    const r = w - b.offsetLeft - b.offsetWidth;
    const bt = h - b.offsetTop - b.offsetHeight;
    clip = `inset(${b.offsetTop}px ${r}px ${bt}px ${b.offsetLeft}px round 999px)`;
  }

  $effect(() => {
    value;
    options.map((o) => o.count).join();
    void tick().then(() => {
      measure();
      requestAnimationFrame(() => (ready = true));
    });
  });

  $effect(() => {
    if (!root) return;
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    return () => ro.disconnect();
  });

  function key(e: KeyboardEvent) {
    const i = options.findIndex((o) => o.id === value);
    let j = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % options.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + options.length) % options.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = options.length - 1;
    else if (e.key === ' ' || e.key === 'Enter') {
      // Keep the day's own shortcuts (Space ticks the selected block) out of it.
      e.stopPropagation();
      return;
    } else return;
    e.preventDefault();
    e.stopPropagation();
    onchange(options[j].id);
    void tick().then(() => root?.querySelector<HTMLElement>(`[data-chip="${options[j].id}"]`)?.focus());
  }
</script>

<div class="chips" role="radiogroup" aria-label={label} tabindex="-1" bind:this={root} onkeydown={key}>
  <span class="pill" class:ready style:clip-path={clip} aria-hidden="true"></span>
  {#each options as o (o.id)}
    <button
      type="button"
      role="radio"
      aria-checked={o.id === value}
      tabindex={o.id === value ? 0 : -1}
      data-chip={o.id}
      title={o.title}
      aria-label={o.title ? `${o.title}${o.count != null ? `, ${o.count}` : ''}` : undefined}
      onclick={() => onchange(o.id)}
    >
      {o.label}
      {#if o.count != null}
        {#key o.count}<span class="n tnum">{o.count}</span>{/key}
      {/if}
    </button>
  {/each}
</div>

<style>
  .chips {
    position: relative;
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    min-width: 0;
    isolation: isolate;
    outline: none;
  }
  .pill {
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: var(--r-pill);
    background: color-mix(in srgb, var(--ink) 8%, transparent);
    opacity: 0;
  }
  .pill.ready {
    opacity: 1;
    transition:
      clip-path 420ms cubic-bezier(0.3, 1.25, 0.5, 1),
      opacity var(--dur-2) var(--ease-out);
  }
  button {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 28px;
    padding: 0 9px;
    border-radius: var(--r-pill);
    font-family: var(--font-ui);
    font-size: 12px;
    color: var(--ink-3);
    white-space: nowrap;
    transition:
      color var(--dur-2) var(--ease-out),
      transform var(--dur-1) var(--ease-out);
  }
  button:hover {
    color: var(--ink);
  }
  button:active {
    transform: scale(0.95);
  }
  button[aria-checked='true'] {
    color: var(--ink);
  }
  .n {
    display: inline-block;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: var(--r-pill);
    background: color-mix(in srgb, var(--ink) 8%, transparent);
    font-size: 11px;
    font-weight: 500;
    line-height: 18px;
    text-align: center;
    color: var(--ink-2);
    animation: count 420ms var(--ease-out);
  }
  @keyframes count {
    0% {
      transform: scale(0.6);
      opacity: 0;
    }
    55% {
      transform: scale(1.18);
      opacity: 1;
    }
  }
  :global([data-motion='calm']) .n {
    animation: none;
  }
  :global([data-motion='calm']) .pill.ready {
    transition-timing-function: var(--ease-out);
  }
</style>
