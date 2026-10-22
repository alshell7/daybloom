<script lang="ts">
  // One addon in the gallery list: its tile, name and line, and its switch. Beside a detail
  // pane it is a compact row; on its own (narrow panels) it opens in place to show the details.
  import { cubicOut } from 'svelte/easing';
  import { fade, slide } from 'svelte/transition';
  import type { AddonMeta } from '../../../lib/addons/registry';
  import Icon from '../../../lib/Icon.svelte';
  import { view } from '../../../lib/stores/view.svelte';
  import AddonDetail from './AddonDetail.svelte';
  import AddonTile from './AddonTile.svelte';

  let {
    addon: a,
    on,
    selected,
    split,
    tabbable,
    fresh,
    onselect,
    ontoggle,
    onfocus,
  }: {
    addon: AddonMeta;
    on: boolean;
    selected: boolean;
    /** The details show beside the list, not in the row. */
    split: boolean;
    /** Holds the list's one tab stop (arrow keys move it). */
    tabbable: boolean;
    /** Just switched on: the tile and the switch play their spring. */
    fresh: boolean;
    onselect: () => void;
    ontoggle: (on: boolean, from: HTMLElement) => void;
    onfocus: () => void;
  } = $props();

  const ms = (n: number) => (view.reducedMotion ? 0 : n);
  /** A soft spring for the opening height: a touch past the mark, then it settles. */
  const springy = (t: number) => {
    const s = 0.9;
    const u = t - 1;
    return u * u * ((s + 1) * u + s) + 1;
  };
  const expanded = $derived(!split && selected);
</script>

<div class="row" class:split class:sel={selected} class:on data-addon={a.id} style:--ac={a.accent}>
  <div class="head">
    <button
      type="button"
      class="pick"
      data-part="pick"
      tabindex={tabbable ? 0 : -1}
      aria-expanded={split ? undefined : expanded}
      aria-current={split && selected ? 'true' : undefined}
      aria-controls={expanded ? `addon-more-${a.id}` : undefined}
      title={split ? a.tagline : undefined}
      onclick={onselect}
      {onfocus}
    >
      <span class="lift"><AddonTile icon={a.icon} accent={a.accent} {on} pop={fresh} size={split ? 28 : 34} /></span>
      <span class="txt">
        <span class="name">{a.name}</span>
        <span class="tag">{a.tagline}</span>
      </span>
      {#if !split}
        <span class="chev" aria-hidden="true"><Icon name="chevron-down" size={15} /></span>
      {/if}
    </button>
    <label class="sw-wrap" title={on ? `Turn ${a.name} off` : `Turn ${a.name} on`}>
      <input
        type="checkbox"
        role="switch"
        class="switch sw"
        class:fresh
        data-part="switch"
        checked={on}
        tabindex={tabbable ? 0 : -1}
        onchange={(e) => ontoggle(e.currentTarget.checked, e.currentTarget)}
        {onfocus}
      />
      <span class="visually-hidden">{a.name}</span>
    </label>
  </div>

  {#if expanded}
    <div class="more" id={`addon-more-${a.id}`} in:slide={{ duration: ms(460), easing: springy }} out:slide={{ duration: ms(240), easing: cubicOut }}>
      <div class="more-in" in:fade={{ duration: ms(260), delay: ms(60) }}>
        <AddonDetail addon={a} {on} {fresh} header={false} onturnon={(from) => ontoggle(true, from)} />
      </div>
    </div>
  {/if}
</div>

<style>
  .row {
    position: relative;
    z-index: 1;
    border-radius: var(--r-md);
    scroll-margin-top: calc(var(--bar-h, 0px) + 8px);
    scroll-margin-bottom: 8px;
    transition:
      background-color var(--dur-3) var(--ease-out),
      box-shadow var(--dur-3) var(--ease-out);
  }
  /* Narrow: the chosen row becomes a soft card holding its details. */
  .row:not(.split).sel {
    background: color-mix(in srgb, var(--ac) 5%, var(--raised));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ac) 24%, var(--line));
  }
  .head {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--s-2);
    min-width: 0;
    padding-right: 10px;
  }
  /* Hover: a tone step (opacity only), never on the chosen row beside the details. */
  .head::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: var(--r-md);
    background: var(--sunken);
    opacity: 0;
    transition: opacity var(--dur-1) var(--ease-out);
  }
  .head:hover::before {
    opacity: 0.55;
  }
  .row.split.sel .head::before,
  .row:not(.split).sel .head::before {
    opacity: 0;
  }
  .pick {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: var(--s-3);
    padding: 8px 4px 8px 8px;
    border-radius: var(--r-md);
    text-align: left;
  }
  .split .head {
    gap: 4px;
    padding-right: 8px;
  }
  .split .pick {
    gap: 9px;
    padding: 6px 2px 6px 6px;
  }
  .pick:focus-visible {
    outline-offset: -2px;
    border-radius: var(--r-md);
  }
  /* Hover lift: the tile rises a little on a spring. */
  .lift {
    display: grid;
    flex: none;
    transition: transform 420ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .head:hover .lift {
    transform: translateY(-2px) scale(1.05);
  }
  .pick:active .lift {
    transform: scale(0.94);
    transition-duration: var(--dur-1);
  }
  .txt {
    flex: 1;
    min-width: 0;
    display: grid;
  }
  .name {
    overflow: hidden;
    font-family: var(--font-ui);
    font-size: var(--t-md);
    font-weight: 500;
    line-height: 1.3;
    color: var(--ink);
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .split .name {
    font-size: var(--t-sm);
  }
  .tag {
    margin-top: 1px;
    font-size: var(--t-xs);
    line-height: 1.35;
    color: var(--ink-3);
  }
  /* Beside the details, the line shows only when the list has room for it. */
  .split .tag {
    display: none;
  }
  @container gallery-list (min-width: 290px) {
    .split .tag {
      display: block;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
  }
  .chev {
    display: grid;
    place-items: center;
    flex: none;
    width: 22px;
    height: 22px;
    color: var(--ink-3);
    opacity: 0.4;
    transition:
      transform 420ms cubic-bezier(0.34, 1.56, 0.64, 1),
      opacity var(--dur-2) var(--ease-out);
  }
  .head:hover .chev,
  .sel .chev {
    opacity: 1;
  }
  .sel .chev {
    transform: rotate(180deg);
  }
  .sw-wrap {
    display: grid;
    flex: none;
    cursor: pointer;
  }
  /* The switch takes its addon's colour, and its thumb lands on a spring. */
  .sw:checked {
    background: color-mix(in srgb, var(--ac) 90%, var(--ink));
  }
  .sw::after {
    transition:
      transform 440ms cubic-bezier(0.3, 1.5, 0.55, 1),
      width var(--dur-1) var(--ease-out);
  }
  .sw.fresh::after {
    animation: thumb 520ms var(--ease-out);
  }
  /* Beside the details: a slimmer switch, so names keep their room. */
  .split .sw {
    width: 32px;
    height: 18px;
    border-radius: 9px;
  }
  .split .sw::after {
    width: 14px;
    height: 14px;
  }
  .split .sw:checked::after {
    transform: translateX(14px);
  }
  .split .sw:active::after {
    width: 18px;
  }
  .split .sw:checked:active::after {
    transform: translateX(10px);
  }
  .split .sw.fresh::after {
    animation-name: thumb-slim;
  }
  @keyframes thumb-slim {
    0% {
      transform: translateX(0) scaleX(1);
    }
    40% {
      transform: translateX(13px) scaleX(1.22);
    }
    70% {
      transform: translateX(15px) scaleX(0.94);
    }
    100% {
      transform: translateX(14px) scaleX(1);
    }
  }
  @keyframes thumb {
    0% {
      transform: translateX(0) scaleX(1);
    }
    40% {
      transform: translateX(15px) scaleX(1.22);
    }
    70% {
      transform: translateX(17px) scaleX(0.94);
    }
    100% {
      transform: translateX(16px) scaleX(1);
    }
  }
  .more {
    overflow: hidden;
  }
  .more-in {
    padding: 2px 14px 16px 54px;
  }
  @container gallery-list (max-width: 360px) {
    .more-in {
      padding-left: 14px;
    }
  }
  :global([data-motion='calm']) .sw::after,
  :global([data-motion='calm']) .lift,
  :global([data-motion='calm']) .chev {
    transition-timing-function: var(--ease-out);
  }
  :global([data-motion='calm']) .sw.fresh::after {
    animation: none;
  }
  :global([data-motion='calm']) .head:hover .lift {
    transform: none;
  }

  /* A touch screen has no hover to reveal it: it always shows. */
  @media (hover: none) {
    .head .chev {
      opacity: 1;
      visibility: visible;
    }
  }
</style>
