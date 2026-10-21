<script lang="ts">
  // Dial finishes as tiny live watches, grouped light and dark, with "match the theme" first.
  import { minutesOfDay } from '../lib/engine/time';
  import { FINISHES, finishesOf, type Finish, type FinishId } from '../lib/presets';
  import { clock } from '../lib/stores/clock.svelte';
  import { settings } from '../lib/stores/settings.svelte';
  import { view } from '../lib/stores/view.svelte';
  import FinishDial, { miniArcs } from './FinishDial.svelte';

  let {
    value,
    onpick,
    auto = 'Match the theme',
    matches,
    compact = false,
  }: {
    value: FinishId;
    onpick: (id: FinishId) => void;
    /** Label of the "auto" choice, and the finish it stands for (default: the theme's). */
    auto?: string;
    matches?: Finish;
    compact?: boolean;
  } = $props();

  const groups = [
    { label: 'Light', finishes: finishesOf(false) },
    { label: 'Dark', finishes: finishesOf(true) },
  ];
  const arcs = $derived(miniArcs(view.todayBlocks, view.today));
  const nowMin = $derived(minutesOfDay(clock.minute));
  const themeFinish = $derived(matches ?? FINISHES[view.theme.finish]);
  const size = $derived(compact ? 30 : 38);
</script>

{#snippet dial(f: Finish)}
  <FinishDial finish={f} {arcs} {nowMin} wake={settings.value.wake} sleep={settings.value.sleep} {size} />
{/snippet}

<div class="fp" class:compact>
  <button class="match" class:on={value === 'auto'} onclick={() => onpick('auto')} aria-pressed={value === 'auto'} title={auto}>
    <span class="w">{@render dial(themeFinish)}</span>
    <span class="txt"><strong>{auto}</strong><small>{matches ? themeFinish.name : `${themeFinish.name}, from ${view.theme.name}`}</small></span>
  </button>
  {#each groups as g (g.label)}
    <p class="label">{g.label}</p>
    <div class="grid">
      {#each g.finishes as f (f.id)}
        <button class="fin" class:on={value === f.id} onclick={() => onpick(f.id)} aria-pressed={value === f.id} aria-label={`${f.name} finish`} title={f.name}>
          <span class="w">{@render dial(f)}</span>
          {#if !compact}<span class="name">{f.name}</span>{/if}
        </button>
      {/each}
    </div>
  {/each}
</div>

<style>
  .fp {
    display: grid;
    gap: var(--s-2);
    min-width: 0;
  }
  .label {
    margin: var(--s-1) 0 0;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(54px, 1fr));
    gap: 6px 4px;
    min-width: 0;
  }
  .compact .grid {
    grid-template-columns: repeat(auto-fill, minmax(34px, 1fr));
    gap: 4px;
  }
  .fin,
  .match {
    border-radius: var(--r-md);
    transition:
      background var(--dur-1) var(--ease-out),
      transform 420ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .fin {
    display: grid;
    justify-items: center;
    gap: 3px;
    min-width: 0;
    padding: 4px 0;
  }
  .fin:hover,
  .match:hover {
    background: var(--sunken);
  }
  .fin:active,
  .match:active {
    transform: scale(0.94);
    transition-duration: var(--dur-1);
  }
  .w {
    display: block;
    border-radius: 50%;
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.14);
    transition:
      transform 520ms cubic-bezier(0.34, 1.56, 0.64, 1),
      box-shadow var(--dur-2) var(--ease-out);
  }
  .fin:hover .w {
    transform: scale(1.1);
  }
  .on .w {
    box-shadow:
      0 0 0 2px var(--raised),
      0 0 0 4px var(--ink);
    animation: pop 560ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  @keyframes pop {
    from {
      transform: scale(0.82);
    }
  }
  .name {
    max-width: 100%;
    font-size: 10px;
    letter-spacing: -0.01em;
    color: var(--ink-3);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .fin.on .name {
    color: var(--ink);
  }
  .match {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    min-width: 0;
    padding: 6px 10px 6px 6px;
    text-align: left;
    border: 1px solid var(--line);
  }
  .match.on {
    border-color: var(--line-strong);
  }
  .txt {
    display: grid;
    min-width: 0;
  }
  .txt strong {
    font-size: var(--t-sm);
    font-weight: 500;
    color: var(--ink);
  }
  .txt small {
    font-size: var(--t-xs);
    color: var(--ink-3);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  @media (prefers-reduced-motion: reduce) {
    .on .w {
      animation: none;
    }
  }
  :global(:root[data-motion='calm']) .on .w {
    animation: none;
  }
</style>
