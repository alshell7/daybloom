<script lang="ts">
  import { fly, slide } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { backlog, dueLabel, ENERGY_ICON, ENERGY_LABEL, parseCapture, PRIORITY_LABEL } from '../../lib/backlog';
  import { categoryColor } from '../../lib/engine/categories';
  import { formatDuration, MINUTE } from '../../lib/engine/time';
  import type { BacklogList } from '../../lib/engine/types';
  import Icon from '../../lib/Icon.svelte';
  import { platform } from '../../lib/platform';
  import { sounds } from '../../lib/sound';
  import { clock } from '../../lib/stores/clock.svelte';
  import { view } from '../../lib/stores/view.svelte';

  // Brain dump: one thing per line. Enter adds a single line; ⌘/Ctrl+Enter adds them all.
  let { target, oncaptured }: { target: BacklogList; oncaptured?: (ids: string[]) => void } = $props();

  let text = $state('');
  let focused = $state(false);
  let ta: HTMLTextAreaElement | undefined = $state();

  const mod = platform.os === 'mac' ? '⌘' : 'Ctrl';
  const multi = $derived(text.includes('\n'));
  const items = $derived(text.trim() ? parseCapture(text, clock.minute) : []);
  const lead = $derived(items.length === 1 ? categoryColor(items[0].category ?? 'focus', view.finish.dark) : null);
  const where = $derived(target === 'next' ? 'Next' : target === 'someday' ? 'Someday' : 'Inbox');
  const SHOW = 5;

  // Grow with the text, up to about seven lines.
  $effect(() => {
    text;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 172)}px`;
  });

  function keydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    } else if (e.key === 'Enter' && !e.shiftKey && !multi) {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape' && text) {
      // Clear first; a second Escape closes the panel.
      e.preventDefault();
      e.stopPropagation();
      text = '';
    }
  }

  function submit() {
    const made = backlog.capture(text, target);
    if (!made.length) return;
    sounds.tick();
    const r = ta?.getBoundingClientRect();
    if (r) view.spark(r.left + 22, r.top + 20, categoryColor(made[0].category, view.finish.dark), false, made.length === 1 ? `→ ${where}` : `+${made.length}`);
    text = '';
    oncaptured?.(made.map((t) => t.id));
  }

  /** Focus the box (e.g. from an empty state). */
  export function focus() {
    ta?.focus();
  }
</script>

<div class="capture" class:active={focused || !!text} style:--c={lead ?? 'var(--focus-ring)'}>
  <span class="lead" aria-hidden="true"><Icon name="brain-dump" size={16} stroke={2} /></span>
  <textarea
    bind:this={ta}
    bind:value={text}
    rows="1"
    placeholder="Brain dump — one thing per line"
    aria-label="Add to the backlog, one item per line"
    autocomplete="off"
    spellcheck="false"
    onfocus={() => (focused = true)}
    onblur={() => (focused = false)}
    onkeydown={keydown}
  ></textarea>
  {#if text.trim()}
    <button class="add" onclick={submit} in:fly={{ x: 6, duration: view.reducedMotion ? 0 : 200, easing: cubicOut }} title={`Add ${items.length === 1 ? 'it' : 'them all'} to ${where}`}>
      <kbd>{multi ? `${mod} ⏎` : '⏎'}</kbd>
      <span>{items.length > 1 ? `Add ${items.length}` : 'Add'}</span>
    </button>
  {/if}
</div>

{#if items.length}
  <ul class="preview" transition:slide={{ duration: view.reducedMotion ? 0 : 200, easing: cubicOut }} aria-label="What will be added">
    {#each items.slice(0, SHOW) as it, i (i)}
      <li style:--c={categoryColor(it.category ?? 'focus', view.finish.dark)}>
        <i class="dot"></i>
        <span class="t">{it.title}</span>
        <span class="chip tnum">{formatDuration(it.duration * MINUTE)}</span>
        {#if it.due}<span class="chip"><Icon name="calendar-clock" size={11} /> {dueLabel(it.due, view.today)}</span>{/if}
        {#if it.priority}<span class="chip" class:must={it.priority === 1}><Icon name="flag" size={11} /> {PRIORITY_LABEL[it.priority]}</span>{/if}
        {#if it.energy}<span class="chip"><Icon name={ENERGY_ICON[it.energy]} size={12} /> {ENERGY_LABEL[it.energy]}</span>{/if}
        {#if it.list === 'someday'}<span class="chip"><Icon name="sunrise" size={11} /> Someday</span>{/if}
      </li>
    {/each}
    {#if items.length > SHOW}<li class="more">+{items.length - SHOW} more</li>{/if}
  </ul>
{:else if focused}
  <p class="hint" transition:slide={{ duration: view.reducedMotion ? 0 : 200, easing: cubicOut }}>
    Try “Call the bank by fri 15m !” — durations, <em>by</em>/<em>due</em> dates, <em>!</em> or <em>!!</em>, and <em>low</em>/<em>high energy</em> are understood.
  </p>
{/if}

<style>
  .capture {
    position: relative;
    display: flex;
    align-items: flex-start;
    gap: var(--s-2);
    min-height: 42px;
    padding: 5px var(--s-2) 5px 6px;
    border-radius: var(--r-md);
    background: var(--raised);
    border: 1px solid var(--line-strong);
    transition:
      border-color var(--dur-2) var(--ease-out),
      box-shadow var(--dur-2) var(--ease-out);
  }
  .capture.active {
    border-color: color-mix(in srgb, var(--c) 60%, var(--line));
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--c) 14%, transparent);
  }
  .lead {
    flex: none;
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--c) 16%, transparent);
    color: color-mix(in srgb, var(--c) 80%, var(--ink));
    transition:
      background var(--dur-3) var(--ease-out),
      color var(--dur-3) var(--ease-out);
  }
  textarea {
    flex: 1;
    min-width: 0;
    min-height: 30px;
    padding: 5px 0;
    border: 0;
    background: transparent;
    outline: none;
    resize: none;
    font-size: var(--t-sm);
    line-height: 20px;
  }
  .add {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    padding: 0 10px 0 6px;
    border-radius: var(--r-pill);
    font-family: var(--font-ui);
    font-size: var(--t-xs);
    font-weight: 500;
    color: var(--ink-2);
    transition: background var(--dur-1) var(--ease-out);
  }
  .add:hover {
    background: var(--sunken);
    color: var(--ink);
  }
  .add:active {
    transform: scale(0.97);
  }
  kbd {
    font-family: var(--font-ui);
    font-size: 10.5px;
    padding: 1px 5px;
    border-radius: 5px;
    border: 1px solid var(--line-strong);
    color: var(--ink-3);
  }
  .preview {
    list-style: none;
    margin: var(--s-2) 0 0;
    padding: 0 0 0 2px;
    display: grid;
    gap: 5px;
  }
  .preview li {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 5px;
    min-width: 0;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--c);
    flex: none;
    margin-right: 2px;
  }
  .t {
    font-size: var(--t-sm);
    font-weight: 500;
    color: var(--ink);
    margin-right: 2px;
    max-width: 60%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 20px;
    padding: 0 7px;
    border-radius: var(--r-pill);
    background: var(--sunken);
    font-size: 11px;
    color: var(--ink-2);
  }
  .chip.must {
    color: var(--ink);
    font-weight: 500;
  }
  .more {
    font-size: var(--t-xs);
    color: var(--ink-3);
    padding-left: 12px;
  }
  .hint {
    margin: var(--s-2) 0 0 2px;
    font-size: var(--t-xs);
    line-height: 1.5;
    color: var(--ink-3);
  }
  .hint em {
    font-style: normal;
    color: var(--ink-2);
  }
</style>
