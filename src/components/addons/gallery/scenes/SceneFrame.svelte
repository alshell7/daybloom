<script lang="ts">
  // The little stage an addon's scene plays on: a softly tinted window 220×100 units, scaled to
  // fit its width. The scene plays once when it appears, again on hover (once it has rested)
  // and when the addon turns on, then rests on its last frame. A scene's own CSS is that last
  // frame; its keyframes only describe the way there, so calm motion simply shows the end.
  // Moving parts are HTML layers animated with transform and opacity; nothing loops.
  import type { Snippet } from 'svelte';
  import { untrack } from 'svelte';
  import { view } from '../../../../lib/stores/view.svelte';

  let {
    accent,
    replay = false,
    length = 3200,
    children,
  }: {
    accent: string;
    /** Play again when this turns true (the addon was just switched on). */
    replay?: boolean;
    /** How long a take lasts (ms): hover won't restart it before then. */
    length?: number;
    children: Snippet;
  } = $props();

  const W = 220;
  let el = $state<HTMLDivElement>();
  let k = $state(1);
  let take = $state(0);
  let restsAt = performance.now() + untrack(() => length);

  function play() {
    if (view.reducedMotion) return;
    take++;
    restsAt = performance.now() + length;
  }

  $effect(() => {
    if (replay) untrack(play);
  });

  $effect(() => {
    const f = el;
    if (!f) return;
    const fit = () => (k = f.clientWidth / W || 1);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(f);
    return () => ro.disconnect();
  });
</script>

<div class="sf" bind:this={el} style:--ac={accent} aria-hidden="true" onpointerenter={() => performance.now() >= restsAt && play()}>
  <div class="stage" style:transform={`scale(${k})`}>
    {#key take}
      {@render children()}
    {/key}
  </div>
</div>

<style>
  .sf {
    --ac-ink: color-mix(in srgb, var(--ac) 84%, var(--ink));
    --ac-soft: color-mix(in srgb, var(--ac) 18%, var(--raised));
    --ac-line: color-mix(in srgb, var(--ac) 32%, transparent);
    --spring: cubic-bezier(0.34, 1.56, 0.64, 1);
    position: relative;
    width: 100%;
    aspect-ratio: 220 / 100;
    border-radius: var(--r-md);
    overflow: hidden;
    background:
      radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--ink) 7%, transparent) 0.8px, transparent 1.2px) 0 0 / 11px 11px,
      linear-gradient(180deg, color-mix(in srgb, var(--ac) 10%, transparent), color-mix(in srgb, var(--ac) 3%, transparent)),
      var(--raised);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ac) 16%, var(--line));
  }
  .stage {
    position: absolute;
    top: 0;
    left: 0;
    width: 220px;
    height: 100px;
    transform-origin: 0 0;
    font-family: var(--font-ui);
    color: var(--ink);
    font-variant-numeric: tabular-nums;
  }

  /* Shared pieces the scenes are built from. */
  .stage :global(.abs) {
    position: absolute;
  }
  .stage :global(.s-card) {
    position: absolute;
    border-radius: 7px;
    background: var(--raised);
    box-shadow:
      0 0 0 1px var(--line),
      0 2px 6px -2px rgb(0 0 0 / 0.14);
  }
  .stage :global(.s-chip) {
    position: absolute;
    display: inline-flex;
    align-items: center;
    gap: 3px;
    height: 16px;
    padding: 0 6px;
    border-radius: 999px;
    background: var(--raised);
    box-shadow:
      0 0 0 1px var(--line),
      0 2px 5px -2px rgb(0 0 0 / 0.16);
    font-size: 8.5px;
    font-weight: 500;
    line-height: 1;
    color: var(--ink);
    white-space: nowrap;
  }
  .stage :global(.s-chip svg) {
    color: var(--ac-ink);
  }
  .stage :global(.s-blk) {
    position: absolute;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 7px;
    border-radius: 8px;
    background: var(--ac);
    color: #fff;
    font-size: 8.5px;
    font-weight: 500;
    white-space: nowrap;
  }
  .stage :global(.s-dial) {
    position: absolute;
    border-radius: 50%;
    background: var(--raised);
    box-shadow:
      0 0 0 1px var(--line),
      0 3px 8px -3px rgb(0 0 0 / 0.18);
  }
  .stage :global(.s-ticks) {
    position: absolute;
    inset: 4px;
    border-radius: 50%;
    border: 1.5px dotted color-mix(in srgb, var(--ink) 24%, transparent);
  }
  .stage :global(.s-line) {
    position: absolute;
    height: 3px;
    border-radius: 2px;
    background: color-mix(in srgb, var(--ink) 13%, transparent);
  }
  .stage :global(.s-ico) {
    position: absolute;
    display: grid;
    place-items: center;
    border-radius: 8px;
    color: var(--ac-ink);
    background: var(--ac-soft);
    box-shadow: inset 0 0 0 1px var(--ac-line);
  }

  /* Calm: no motion at all, only the resting frame. */
  :global([data-motion='calm']) .stage :global(*) {
    animation: none !important;
  }
</style>
