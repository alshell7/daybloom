<script lang="ts">
  // A ranked list with a bar each: projects, clients, apps. Labels sit beside the marks in
  // ink (never in the series colour); each row's dot carries its identity.
  let {
    items,
    format = (v: number) => String(v),
    empty = 'Nothing yet',
    reduced = false,
  }: {
    items: { key: string; label: string; value: number; color: string; sub?: string }[];
    format?: (v: number) => string;
    empty?: string;
    reduced?: boolean;
  } = $props();
  const max = $derived(Math.max(1e-9, ...items.map((i) => i.value)));
  const total = $derived(items.reduce((s, i) => s + i.value, 0));
</script>

{#if !items.length}
  <p class="empty">{empty}</p>
{:else}
  <ul class="rank">
    {#each items as it, i (it.key)}
      <li>
        <span class="name"><i style:background={it.color}></i><b>{it.label}</b></span>
        <span class="val tnum">{format(it.value)}</span>
        <span class="track"><span class="fill" class:grow={!reduced} style:background={it.color} style:transform={`scaleX(${it.value / max})`} style:--d={`${reduced ? 0 : i * 40}ms`}></span></span>
        <span class="sub tnum">{it.sub ? `${it.sub} · ` : ''}{total ? Math.round((it.value / total) * 100) : 0}%</span>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .rank {
    display: grid;
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 4px 8px;
  }
  .name {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
    font-size: var(--t-sm);
  }
  .name i {
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
  .name b {
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sub {
    grid-column: 1 / -1;
    font-size: var(--t-xs);
    color: var(--ink-3);
    margin-top: -2px;
  }
  .val {
    font-size: var(--t-sm);
    font-weight: 500;
    white-space: nowrap;
  }
  .track {
    grid-column: 1 / -1;
    height: 6px;
    border-radius: 3px;
    background: var(--sunken);
    overflow: hidden;
  }
  .fill {
    display: block;
    height: 100%;
    border-radius: 3px;
    transform-origin: left center;
  }
  .grow {
    animation: grow 700ms var(--ease-out) both;
    animation-delay: var(--d);
  }
  @keyframes grow {
    from {
      transform: scaleX(0);
    }
  }
  .empty {
    margin: 0;
    font-size: var(--t-sm);
    color: var(--ink-3);
  }
</style>
