<script lang="ts">
  // A small highlighted note: a tip (warm amber), good to know (focus blue), a win (lume, the
  // colour of finished time) or care (rest lilac). Never a warning: nothing here is red.
  import type { ComponentRenderProps } from '@openuidev/svelte-lang';
  import { md } from '../../lib/addons/alef/md';
  import Icon from '../../lib/Icon.svelte';
  import { toneColor, valid } from '../../lib/ai/genui/read';
  import { CalloutProps } from '../../lib/ai/genui/schema';

  let { props }: ComponentRenderProps<Record<string, unknown>> = $props();
  const p = $derived(valid(CalloutProps, props));
  const KIND = {
    tip: { icon: 'lightbulb', tone: 'routine' },
    note: { icon: 'info', tone: 'focus' },
    win: { icon: 'sparkles', tone: 'lume' },
    care: { icon: 'heart', tone: 'rest' },
  } as const;
  const k = $derived(KIND[p?.kind ?? 'tip']);
</script>

{#if p?.text.trim()}
  <aside class="callout" class:win={p.kind === 'win'} style:--c={toneColor(k.tone)}>
    <span class="glyph"><Icon name={k.icon} size={15} stroke={2} /></span>
    <div class="body">
      {#if p.title?.trim()}<strong>{p.title.trim().slice(0, 60)}</strong>{/if}
      <div class="txt">{@html md(p.text.trim().slice(0, 400))}</div>
    </div>
  </aside>
{/if}

<style>
  .callout {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 10px;
    align-items: start;
    padding: 10px 12px;
    border-radius: var(--r-md);
    background: color-mix(in srgb, var(--c) 6%, var(--surface));
    border: 1px solid color-mix(in srgb, var(--c) 20%, var(--line));
  }
  .glyph {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: 9px;
    background: color-mix(in srgb, var(--c) 20%, transparent);
    color: color-mix(in srgb, var(--c) 70%, var(--ink));
  }
  .win .glyph {
    color: var(--ink);
    box-shadow: inset 0 0 0 1.5px var(--lume);
  }
  .body {
    display: grid;
    gap: 2px;
    padding-top: 3px;
  }
  strong {
    font-size: var(--t-sm);
    font-weight: 500;
    color: var(--ink);
  }
  .txt {
    font-size: var(--t-sm);
    line-height: 1.45;
    color: var(--ink-2);
    overflow-wrap: anywhere;
  }
  .txt :global(p) {
    margin: 0;
  }
  .txt :global(ul),
  .txt :global(ol) {
    margin: 2px 0 0;
    padding-left: 18px;
  }
</style>
