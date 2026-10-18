<script lang="ts" generics="T extends string">
  // A segmented control whose thumb glides to the chosen option (clip-path, so it
  // animates on the compositor and keeps a true pill shape at every width).
  let {
    options,
    value,
    onchange,
    label,
  }: {
    options: { value: T; label: string; title?: string }[];
    value: T;
    onchange: (v: T) => void;
    label: string;
  } = $props();

  let root: HTMLDivElement | undefined = $state();
  let inset = $state('inset(3px 100% 3px 0 round 999px)');
  let ready = $state(false);

  function measure() {
    if (!root) return;
    const i = options.findIndex((o) => o.value === value);
    const btn = root.querySelectorAll<HTMLButtonElement>('button')[i];
    if (!btn) return;
    const w = root.clientWidth;
    const l = btn.offsetLeft;
    const r = w - (btn.offsetLeft + btn.offsetWidth);
    inset = `inset(3px ${r}px 3px ${l}px round 999px)`;
  }

  $effect(() => {
    value;
    options.length;
    measure();
    requestAnimationFrame(() => (ready = true));
  });

  $effect(() => {
    if (!root) return;
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    return () => ro.disconnect();
  });
</script>

<div class="seg" bind:this={root} role="group" aria-label={label}>
  <span class="thumb" class:ready style:clip-path={inset} aria-hidden="true"></span>
  {#each options as o (o.value)}
    <button aria-pressed={o.value === value} onclick={() => onchange(o.value)} title={o.title}>{o.label}</button>
  {/each}
</div>

<style>
  .seg {
    position: relative;
    display: inline-flex;
    padding: 3px;
    gap: 2px;
    border-radius: var(--r-pill);
    background: var(--sunken);
    isolation: isolate;
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
    height: 30px;
    padding: 0 var(--s-3);
    border-radius: var(--r-pill);
    font-size: var(--t-sm);
    font-family: var(--font-ui);
    color: var(--ink-2);
    transition: color var(--dur-2) var(--ease-out);
    white-space: nowrap;
  }
  button:hover {
    color: var(--ink);
  }
  button[aria-pressed='true'] {
    color: var(--ink);
  }
</style>
