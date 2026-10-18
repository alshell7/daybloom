<script lang="ts">
  import { ICON_NODES } from './icons.generated';

  let {
    name,
    size = 20,
    stroke = 1.75,
    color = 'currentColor',
    x = undefined,
    y = undefined,
    label = undefined,
  }: {
    name: string;
    size?: number;
    stroke?: number;
    color?: string;
    x?: number;
    y?: number;
    label?: string;
  } = $props();

  const nodes = $derived(ICON_NODES[name] ?? ICON_NODES.clock);
</script>

<svg
  {x}
  {y}
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke={color}
  stroke-width={stroke}
  stroke-linecap="round"
  stroke-linejoin="round"
  role={label ? 'img' : undefined}
  aria-label={label}
  aria-hidden={label ? undefined : 'true'}
  class="icon"
>
  {#each nodes as [tag, attrs], i (i)}
    <svelte:element this={tag} {...attrs} />
  {/each}
</svg>

<style>
  .icon {
    flex: none;
    display: block;
    overflow: visible;
  }
</style>
