<script lang="ts">
  // The timeline's filter: a quiet button that opens a short list of what to show (your
  // blocks, calendars, addons, finished blocks, free time) and the kinds of block as colour
  // dots. It only changes what the timeline lists; the dial and your day stay as they are.
  import { isOn } from '../lib/addons/registry';
  import { CATEGORIES, categoryColor } from '../lib/engine/categories';
  import type { Block, CategoryId } from '../lib/engine/types';
  import Icon from '../lib/Icon.svelte';
  import { filterActive, layout, NO_FILTER, sourceOf } from '../lib/stores/layout.svelte';
  import { view } from '../lib/stores/view.svelte';
  import Popover from './pickers/Popover.svelte';

  let { blocks, hidden }: { blocks: Block[]; hidden: number } = $props();

  let btn = $state<HTMLButtonElement>();
  let open = $state(false);
  const f = $derived(layout.value.filter);
  const active = $derived(filterActive(f));

  const count = (src: string) => blocks.filter((b) => sourceOf(b) === src).length;
  /** Your blocks and calendars always; addon sources when they have something to show. */
  const sources = $derived.by(() => {
    const out = [
      { id: 'tasks', label: 'My blocks', icon: 'dial' },
      { id: 'calendar', label: 'Calendars', icon: 'calendar' },
    ];
    if (isOn('waqt') || count('salah')) out.push({ id: 'salah', label: 'Salah · Waqt', icon: 'moon' });
    for (const b of blocks) {
      const s = sourceOf(b);
      if (!out.some((o) => o.id === s)) out.push({ id: s, label: s.charAt(0).toUpperCase() + s.slice(1), icon: 'puzzle' });
    }
    return out;
  });

  function toggleSource(id: string) {
    const hide = f.hide.includes(id) ? f.hide.filter((x) => x !== id) : [...f.hide, id];
    layout.value.filter = { ...f, hide };
  }
  function toggleCat(id: CategoryId) {
    const categories = f.categories.includes(id) ? f.categories.filter((x) => x !== id) : [...f.categories, id];
    layout.value.filter = { ...f, categories };
  }
  function reset() {
    layout.value.filter = { ...NO_FILTER };
  }
</script>

<button
  bind:this={btn}
  class="fbtn"
  class:active
  class:on={open}
  onclick={() => (open = !open)}
  aria-haspopup="dialog"
  aria-expanded={open}
  aria-label={active ? `Filter the timeline (${hidden} hidden)` : 'Filter the timeline'}
  title="Filter the timeline"
>
  <Icon name="filter" size={14} />
  {#if active}<i class="dot" aria-hidden="true"></i>{/if}
</button>

{#if open && btn}
  <Popover anchor={btn} onclose={() => (open = false)} label="Filter the timeline" width={256}>
    <div class="fp">
      <p class="cap">Show in the timeline</p>
      <ul>
        {#each sources as s (s.id)}
          {@const on = !f.hide.includes(s.id)}
          <li>
            <button class="opt" role="checkbox" aria-checked={on} onclick={() => toggleSource(s.id)}>
              <span class="box" class:on><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 8.4l2.6 2.6L12 5.4" /></svg></span>
              <Icon name={s.icon} size={14} />
              <span class="lbl">{s.label}</span>
              <span class="n tnum">{count(s.id) || ''}</span>
            </button>
          </li>
        {/each}
        <li class="sep" aria-hidden="true"></li>
        <li>
          <button class="opt" role="checkbox" aria-checked={!f.done} onclick={() => (layout.value.filter = { ...f, done: !f.done })}>
            <span class="box" class:on={!f.done}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 8.4l2.6 2.6L12 5.4" /></svg></span>
            <Icon name="circle-check" size={14} />
            <span class="lbl">Finished blocks</span>
            <span class="n tnum">{blocks.filter((b) => b.done).length || ''}</span>
          </button>
        </li>
        <li>
          <button class="opt" role="checkbox" aria-checked={!f.free} onclick={() => (layout.value.filter = { ...f, free: !f.free })}>
            <span class="box" class:on={!f.free}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 8.4l2.6 2.6L12 5.4" /></svg></span>
            <Icon name="clock" size={14} />
            <span class="lbl">Free time</span>
          </button>
        </li>
      </ul>
      <p class="cap">Kinds</p>
      <div class="cats">
        {#each CATEGORIES as c (c.id)}
          {@const on = !f.categories.includes(c.id)}
          <button class="cat" class:off={!on} style:--c={categoryColor(c.id, view.finish.dark)} aria-pressed={on} aria-label={c.label} title={c.label} onclick={() => toggleCat(c.id)}>
            <Icon name={c.icon} size={13} stroke={2.2} />
          </button>
        {/each}
      </div>
      {#if active}
        <button class="reset" onclick={reset}><Icon name="undo" size={13} /> Show everything</button>
      {/if}
    </div>
  </Popover>
{/if}

<style>
  .fbtn {
    position: relative;
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    color: var(--ink-3);
    transition:
      background var(--dur-1) var(--ease-out),
      color var(--dur-1) var(--ease-out);
  }
  .fbtn:hover,
  .fbtn.on {
    background: var(--sunken);
    color: var(--ink);
  }
  .fbtn.active {
    color: var(--ink);
  }
  .dot {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--signal);
    box-shadow: 0 0 0 2px var(--surface);
    animation: dot-in 0.3s var(--ease-settle);
  }
  @keyframes dot-in {
    from {
      transform: scale(0);
    }
  }
  .fp {
    display: grid;
    gap: 4px;
  }
  .cap {
    margin: 2px 4px 2px;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  ul {
    list-style: none;
    margin: 0 0 6px;
    padding: 0;
  }
  .sep {
    height: 1px;
    margin: 4px 6px;
    background: var(--line);
  }
  .opt {
    display: grid;
    grid-template-columns: 18px 16px 1fr auto;
    align-items: center;
    gap: 9px;
    width: 100%;
    height: 34px;
    padding: 0 8px;
    border-radius: var(--r-sm);
    font-size: var(--t-sm);
    color: var(--ink);
    text-align: left;
  }
  .opt:hover {
    background: var(--sunken);
  }
  .opt :global(svg) {
    color: var(--ink-3);
  }
  .opt[aria-checked='false'] .lbl {
    color: var(--ink-3);
  }
  .n {
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .box {
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    border-radius: 6px;
    box-shadow: inset 0 0 0 1.5px var(--line-strong);
    transition:
      background var(--dur-2) var(--ease-out),
      box-shadow var(--dur-2) var(--ease-out);
  }
  .box.on {
    background: var(--ink);
    box-shadow: none;
  }
  .box svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: var(--ink-inverse) !important;
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 14;
    stroke-dashoffset: 14;
    transition: stroke-dashoffset var(--dur-3) var(--ease-out);
  }
  .box.on svg {
    stroke-dashoffset: 0;
  }
  .cats {
    display: flex;
    justify-content: space-between;
    padding: 2px 6px 4px;
  }
  .cat {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    color: white;
    background: var(--c);
    transition:
      background var(--dur-2) var(--ease-out),
      color var(--dur-2) var(--ease-out),
      box-shadow var(--dur-2) var(--ease-out),
      transform var(--dur-1) var(--ease-out);
  }
  .cat:hover {
    transform: scale(1.08);
  }
  .cat:active {
    transform: scale(0.92);
  }
  .cat.off {
    background: transparent;
    color: var(--c);
    box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--c) 55%, transparent);
    opacity: 0.7;
  }
  .reset {
    justify-self: start;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-top: 4px;
    padding: 5px 9px;
    border-radius: var(--r-pill);
    font-size: var(--t-xs);
    font-weight: 500;
    color: var(--ink-2);
  }
  .reset:hover {
    background: var(--sunken);
    color: var(--ink);
  }
</style>
