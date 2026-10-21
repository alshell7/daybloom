<script lang="ts">
  import { flushSync } from 'svelte';
  import { categoryColor } from '../lib/engine/categories';
  import { minutesOfDay } from '../lib/engine/time';
  import { FINISHES } from '../lib/presets';
  import { clock } from '../lib/stores/clock.svelte';
  import { settings } from '../lib/stores/settings.svelte';
  import { view } from '../lib/stores/view.svelte';
  import { THEMES, type Theme } from '../lib/themes';
  import FinishDial, { miniArcs } from './FinishDial.svelte';

  // Each swatch is a tiny version of the app in that theme: the desk, its dial (your day, with the
  // hand at the current time) and a slice of the rail with the now-line.
  const groups = [
    { mode: 'light' as const, label: 'Light', themes: THEMES.filter((t) => t.mode === 'light') },
    { mode: 'dark' as const, label: 'Dark', themes: THEMES.filter((t) => t.mode === 'dark') },
  ];

  const arcs = $derived(miniArcs(view.todayBlocks, view.today));
  const nowMin = $derived(minutesOfDay(clock.minute));

  function pick(t: Theme, e: MouseEvent) {
    const apply = () => {
      if (t.mode === 'light') settings.value.lightTheme = t.id;
      else settings.value.darkTheme = t.id;
      // Choosing a theme of the other mode switches to it.
      if (view.dark !== (t.mode === 'dark')) settings.value.theme = t.mode;
      flushSync();
    };
    const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };
    if (!doc.startViewTransition || view.reducedMotion) return apply();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    doc.startViewTransition(apply).ready.then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] },
        { duration: 650, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', pseudoElement: '::view-transition-new(root)' },
      );
    });
  }

  const chosenOf = (t: Theme) => (t.mode === 'light' ? settings.value.lightTheme : settings.value.darkTheme) === t.id;
  const isOn = (t: Theme) => chosenOf(t) && view.dark === (t.mode === 'dark');
  const chosenName = (mode: 'light' | 'dark') => groups.find((g) => g.mode === mode)!.themes.find(chosenOf)?.name;
</script>

{#snippet swatch(t: Theme)}
  {@const dark = t.mode === 'dark'}
  {@const v = t.vars}
  <button class="sw" class:on={isOn(t)} class:chosen={chosenOf(t)} onclick={(e) => pick(t, e)} aria-pressed={isOn(t)} aria-label={`${t.name} theme, ${t.mode}`} title={`${t.name} · ${FINISHES[t.finish].name} dial`}>
    <span class="mini" style:background={v.ground} style:--line={v.line}>
      <span class="dial"><FinishDial finish={FINISHES[t.finish]} {arcs} {nowMin} wake={settings.value.wake} sleep={settings.value.sleep} size={40} /></span>
      <span class="rail" style:background={v.surface}>
        <span class="r"><i style:background={categoryColor('focus', dark)}></i><b style:background={v.ink}></b></span>
        <span class="now" style:background={v.signal}></span>
        <span class="r"><i class="done" style:--c={categoryColor('routine', dark)} style:--lume={v.lume} style:--surf={v.surface}></i><b class="short" style:background={v.ink3}></b></span>
        <span class="r"><i style:background={categoryColor('social', dark)}></i><b class="mid" style:background={v.ink2}></b></span>
      </span>
      <span class="tick" style:background={v.ink} style:color={v.surface} aria-hidden="true">
        <svg viewBox="0 0 12 12" width="9" height="9"><path d="M2.5 6.3 5 8.6 9.6 3.6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" /></svg>
      </span>
    </span>
    <span class="name">{t.name}</span>
  </button>
{/snippet}

<div class="gallery">
  {#each groups as g (g.mode)}
    <p class="label">
      <span>{g.label}</span>
      <span class="pickd">{chosenName(g.mode) ?? ''}{view.dark === (g.mode === 'dark') ? ' · in use' : ''}</span>
    </p>
    <div class="grid">{#each g.themes as t (t.id)}{@render swatch(t)}{/each}</div>
  {/each}
</div>

<style>
  .gallery {
    display: grid;
    gap: var(--s-2);
    min-width: 0;
  }
  .label {
    display: flex;
    justify-content: space-between;
    gap: var(--s-2);
    margin: var(--s-2) 0 0;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .pickd {
    color: var(--ink-2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
    gap: var(--s-2) 6px;
    min-width: 0;
  }
  .sw {
    display: grid;
    gap: 5px;
    min-width: 0;
    padding: 4px;
    border-radius: var(--r-md);
    text-align: left;
    transition:
      background var(--dur-1) var(--ease-out),
      transform 420ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .sw:hover {
    background: var(--sunken);
    transform: translateY(-2px);
  }
  .sw:active {
    transform: scale(0.95);
    transition-duration: var(--dur-1);
  }
  .mini {
    position: relative;
    display: flex;
    align-items: center;
    gap: 5px;
    height: 52px;
    padding: 0 0 0 5px;
    border-radius: 10px;
    overflow: hidden;
    box-shadow: inset 0 0 0 1px rgb(127 127 127 / 0.22);
    transition: box-shadow var(--dur-2) var(--ease-out);
  }
  .sw.chosen .mini {
    box-shadow: inset 0 0 0 1px rgb(127 127 127 / 0.22), 0 0 0 2px var(--line-strong);
  }
  .sw.on .mini {
    box-shadow: 0 0 0 2px var(--focus-ring);
    animation: pop 560ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  @keyframes pop {
    from {
      transform: scale(0.9);
    }
  }
  .dial {
    flex: none;
    transition: transform 520ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .sw:hover .dial {
    transform: scale(1.1) rotate(-8deg);
  }
  .rail {
    flex: 1;
    min-width: 0;
    align-self: stretch;
    margin: 5px 0;
    border-radius: 6px 0 0 6px;
    box-shadow: inset 1px 0 0 var(--line);
    display: grid;
    align-content: center;
    gap: 3px;
    padding: 0 0 0 5px;
    position: relative;
  }
  .r {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
  }
  .r i {
    flex: none;
    width: 6px;
    height: 8px;
    border-radius: 3px;
  }
  .r i.done {
    background: color-mix(in srgb, var(--c) 30%, var(--surf));
    box-shadow: inset 0 0 0 1.2px var(--lume);
  }
  .r b {
    flex: 1;
    height: 3px;
    border-radius: 2px;
    opacity: 0.8;
    max-width: 34px;
  }
  .r b.short {
    max-width: 18px;
  }
  .r b.mid {
    max-width: 26px;
  }
  .now {
    height: 1.5px;
    margin: 0 0 0 -2px;
    border-radius: 1px;
  }
  .tick {
    position: absolute;
    top: 4px;
    right: 4px;
    display: grid;
    place-items: center;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    transform: scale(0);
    opacity: 0;
    transition:
      transform 420ms cubic-bezier(0.34, 1.56, 0.64, 1),
      opacity var(--dur-2) var(--ease-out);
  }
  .sw.on .tick {
    transform: scale(1);
    opacity: 1;
  }
  .name {
    font-size: var(--t-xs);
    font-family: var(--font-ui);
    color: var(--ink-2);
    padding-left: 2px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sw.on .name {
    color: var(--ink);
    font-weight: 500;
  }
  @media (prefers-reduced-motion: reduce) {
    .sw.on .mini {
      animation: none;
    }
  }
  :global(:root[data-motion='calm']) .sw.on .mini {
    animation: none;
  }
</style>
