<script lang="ts">
  // A tiny screen to point at: pick an edge (where the time bar docks) or a corner (where the
  // HUD sits). The choice slides into place.
  type Edge = 'top' | 'bottom' | 'left' | 'right';
  type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

  let {
    mode,
    value,
    onchange,
    label,
  }: { mode: 'edge' | 'corner'; value: Edge | Corner; onchange: (v: string) => void; label: string } = $props();

  const edges: Edge[] = ['top', 'right', 'bottom', 'left'];
  const corners: Corner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
  const name = (v: string) => v.replace('-', ' ');
</script>

<div class="sp" role="radiogroup" aria-label={label}>
  <div class="screen">
    <span class="desk" aria-hidden="true"></span>
    {#if mode === 'edge'}
      {#each edges as e (e)}
        <button class="edge {e}" class:on={value === e} role="radio" aria-checked={value === e} aria-label={`Dock at the ${e}`} title={name(e)} onclick={() => onchange(e)}>
          <i></i>
        </button>
      {/each}
    {:else}
      {#each corners as c (c)}
        <button class="corner {c}" class:on={value === c} role="radio" aria-checked={value === c} aria-label={`HUD at ${name(c)}`} title={name(c)} onclick={() => onchange(c)}>
          <i></i>
        </button>
      {/each}
    {/if}
  </div>
  <span class="stand" aria-hidden="true"></span>
</div>

<style>
  .sp {
    display: inline-grid;
    justify-items: center;
  }
  .screen {
    position: relative;
    width: 112px;
    height: 70px;
    border-radius: 9px;
    background: var(--sunken);
    box-shadow: inset 0 0 0 1.5px var(--line-strong);
  }
  .desk {
    position: absolute;
    inset: 16px 22px;
    border-radius: 4px;
    background: color-mix(in srgb, var(--raised) 80%, transparent);
    box-shadow: inset 0 0 0 1px var(--line);
  }
  .stand {
    width: 26px;
    height: 7px;
    margin-top: 3px;
    border-radius: 0 0 6px 6px;
    background: var(--line-strong);
  }
  button {
    position: absolute;
    display: grid;
    place-items: center;
  }
  button i {
    display: block;
    border-radius: 3px;
    background: var(--line-strong);
    transition:
      background var(--dur-2) var(--ease-out),
      transform var(--dur-2) var(--ease-out),
      box-shadow var(--dur-2) var(--ease-out);
  }
  button:hover i {
    background: var(--ink-3);
  }
  button.on i {
    background: var(--ink);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--ink) 14%, transparent);
  }
  .edge.top,
  .edge.bottom {
    left: 10px;
    right: 10px;
    height: 14px;
  }
  .edge.top {
    top: 1px;
  }
  .edge.bottom {
    bottom: 1px;
  }
  .edge.left,
  .edge.right {
    top: 10px;
    bottom: 10px;
    width: 18px;
  }
  .edge.left {
    left: 1px;
  }
  .edge.right {
    right: 1px;
  }
  .edge.top i,
  .edge.bottom i {
    width: 100%;
    height: 4px;
  }
  .edge.left i,
  .edge.right i {
    width: 4px;
    height: 100%;
  }
  .edge.on i {
    transform: scale(1, 1.25);
  }
  .corner {
    width: 34px;
    height: 22px;
  }
  .corner.top-left {
    top: 3px;
    left: 3px;
  }
  .corner.top-right {
    top: 3px;
    right: 3px;
  }
  .corner.bottom-left {
    bottom: 3px;
    left: 3px;
  }
  .corner.bottom-right {
    bottom: 3px;
    right: 3px;
  }
  .corner i {
    width: 24px;
    height: 9px;
    border-radius: 5px;
  }
  .corner.on i {
    transform: scale(1.15);
  }
</style>
