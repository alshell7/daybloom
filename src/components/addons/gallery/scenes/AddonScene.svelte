<script lang="ts">
  // An addon's little animated scene, on the shared stage. Addons without one of their own get
  // a quiet stand-in: their tile, popping in.
  import type { Component } from 'svelte';
  import type { AddonId, AddonMeta } from '../../../../lib/addons/registry';
  import Icon from '../../../../lib/Icon.svelte';
  import AlefScene from './AlefScene.svelte';
  import CrumbsScene from './CrumbsScene.svelte';
  import LandingsScene from './LandingsScene.svelte';
  import McpScene from './McpScene.svelte';
  import RealityScene from './RealityScene.svelte';
  import RetroScene from './RetroScene.svelte';
  import SceneFrame from './SceneFrame.svelte';
  import SmallerScene from './SmallerScene.svelte';
  import TrackerScene from './TrackerScene.svelte';
  import ViewsScene from './ViewsScene.svelte';
  import WaqtScene from './WaqtScene.svelte';
  import WorkScene from './WorkScene.svelte';

  let { addon: a, replay = false }: { addon: AddonMeta; replay?: boolean } = $props();

  /** Each scene, and how long its take lasts (ms). */
  const SCENES: Partial<Record<AddonId, [Component, number]>> = {
    work: [WorkScene, 2500],
    tracker: [TrackerScene, 3100],
    crumbs: [CrumbsScene, 2500],
    smaller: [SmallerScene, 2200],
    reality: [RealityScene, 2100],
    waqt: [WaqtScene, 2900],
    landings: [LandingsScene, 2400],
    retro: [RetroScene, 2000],
    alef: [AlefScene, 3100],
    views: [ViewsScene, 3300],
    mcp: [McpScene, 2700],
  };
  const scene = $derived(SCENES[a.id]);
</script>

<SceneFrame accent={a.accent} {replay} length={scene?.[1] ?? 900}>
  {#if scene}
    {@const Scene = scene[0]}
    <Scene />
  {:else}
    <span class="s-ico stand-in" style="left:88px;top:28px;width:44px;height:44px;border-radius:14px"><Icon name={a.icon} size={22} stroke={1.9} /></span>
  {/if}
</SceneFrame>

<style>
  .stand-in {
    animation: pop 520ms cubic-bezier(0.34, 1.56, 0.64, 1) 80ms both;
  }
  @keyframes pop {
    from {
      opacity: 0;
      transform: scale(0.5);
    }
  }
</style>
