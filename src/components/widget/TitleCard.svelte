<script lang="ts" module>
  export interface TitleInfo {
    /** "Now", "Up next", "Focus"… */
    lead: string;
    title: string;
    icon: string | null;
    color: string | null;
    /** "10:00–11:30 · 1h 30m" */
    when: string;
    /** "25m left", "in 40m" */
    left: string;
    then?: { title: string; icon: string; color: string; at: string } | null;
  }
</script>

<script lang="ts">
  // A block in the widget's wing, in full: what it is (now, next, a focus round), its whole
  // title, its time and what's left of it, and what comes after. Plain lines of inline content
  // (no boxes), so each line can wrap along the dial's curve in the wing.
  import { inkOn } from '../../lib/engine/categories';
  import Icon from '../../lib/Icon.svelte';

  let { info, fill }: { info: TitleInfo; fill: string } = $props();

  const tint = (c: string | null) => (c ? inkOn(fill, c) : 'currentColor');
</script>

<p class="lead">
  {#if info.icon}<span class="tile" style:--c={info.color ?? 'currentColor'} style:color={tint(info.color)}><Icon name={info.icon} size={12} stroke={2.3} /></span>{/if}<span class="k">{info.lead}</span>{#if info.left}<span class="sep" aria-hidden="true">·</span><span class="tnum">{info.left}</span>{/if}
</p>
<p class="name"><strong>{info.title}</strong></p>
{#if info.when}<p class="when tnum"><span>{info.when}</span></p>{/if}
{#if info.then}
  <p class="then">
    <span class="k">Then</span>
    <span class="mini" style:color={tint(info.then.color)}><Icon name={info.then.icon} size={10} stroke={2.4} /></span><span>{info.then.title}</span><span class="sep" aria-hidden="true">·</span><span class="tnum at">{info.then.at}</span>
  </p>
{/if}

<style>
  .lead {
    font-size: 11.5px;
    font-weight: 500;
    line-height: 20px;
    color: color-mix(in srgb, var(--ink) 72%, transparent);
  }
  .tile {
    display: inline-grid;
    place-items: center;
    width: 20px;
    height: 20px;
    margin-right: 6px;
    border-radius: 7px;
    vertical-align: top;
    background: color-mix(in srgb, var(--c) 22%, transparent);
  }
  .sep {
    margin: 0 5px;
    opacity: 0.6;
  }
  .name {
    margin-top: 3px !important;
    font-family: var(--font-read);
    font-size: 14px;
    line-height: 1.3;
    text-wrap: pretty;
  }
  .name strong {
    font-weight: 500;
  }
  .when {
    margin-top: 3px !important;
    font-size: 11.5px;
    color: color-mix(in srgb, var(--ink) 66%, transparent);
  }
  .then {
    margin-top: 7px !important;
    font-size: 11.5px;
    line-height: 1.4;
    color: color-mix(in srgb, var(--ink) 80%, transparent);
  }
  .then .k {
    margin-right: 5px;
    color: color-mix(in srgb, var(--ink) 58%, transparent);
  }
  .mini {
    display: inline-grid;
    place-items: center;
    margin-right: 4px;
    vertical-align: -1px;
  }
  .at {
    color: color-mix(in srgb, var(--ink) 58%, transparent);
  }
</style>
