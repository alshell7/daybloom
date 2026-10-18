<script lang="ts">
  import { flushSync } from 'svelte';
  import { CATEGORIES } from '../lib/engine/categories';
  import { FINISHES } from '../lib/presets';
  import { settings } from '../lib/stores/settings.svelte';
  import { view } from '../lib/stores/view.svelte';
  import { THEMES, type Theme } from '../lib/themes';

  // Each swatch is a tiny version of the app in that theme: desk, rail and a dial.
  const light = THEMES.filter((t) => t.mode === 'light');
  const dark = THEMES.filter((t) => t.mode === 'dark');

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

  const arcs = [
    { c: 0, a0: -20, a1: 60 },
    { c: 1, a0: 75, a1: 120 },
    { c: 6, a0: 140, a1: 200 },
    { c: 3, a0: 230, a1: 260 },
  ];
  function arc(a0: number, a1: number, r: number) {
    const p = (a: number) => [20 + r * Math.sin((a * Math.PI) / 180), 20 - r * Math.cos((a * Math.PI) / 180)];
    const [x0, y0] = p(a0);
    const [x1, y1] = p(a1);
    return `M${x0} ${y0}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
  }
  const isOn = (t: Theme) => (t.mode === 'light' ? settings.value.lightTheme : settings.value.darkTheme) === t.id && view.dark === (t.mode === 'dark');
  const isChosen = (t: Theme) => (t.mode === 'light' ? settings.value.lightTheme : settings.value.darkTheme) === t.id;
</script>

{#snippet swatch(t: Theme)}
  {@const f = FINISHES[t.finish]}
  <button class="sw" class:on={isOn(t)} class:chosen={isChosen(t)} onclick={(e) => pick(t, e)} aria-pressed={isOn(t)} aria-label={`${t.name} theme`}>
    <span class="mini" style:background={t.vars.ground}>
      <svg viewBox="0 0 40 40" class="dial" aria-hidden="true">
        <circle cx="20" cy="20" r="18" fill={f.bezel} />
        <circle cx="20" cy="20" r="13.5" fill={f.face} />
        {#each arcs as a (a.c)}
          <path d={arc(a.a0, a.a1, 15.8)} stroke={t.mode === 'dark' ? CATEGORIES[a.c].dark : CATEGORIES[a.c].light} stroke-width="4" fill="none" />
        {/each}
        <path d={arc(-1, 1, 15.8)} stroke={f.signal} stroke-width="5" fill="none" />
        <line x1="20" y1="20" x2="20" y2="9" stroke={f.signal} stroke-width="1.6" stroke-linecap="round" transform="rotate(-30 20 20)" />
      </svg>
      <span class="rail" style:background={t.vars.surface} style:border-color={t.vars.line}>
        <i style:background={CATEGORIES[0][t.mode === 'dark' ? 'dark' : 'light']}></i>
        <i style:background={CATEGORIES[1][t.mode === 'dark' ? 'dark' : 'light']}></i>
        <i style:background={CATEGORIES[6][t.mode === 'dark' ? 'dark' : 'light']}></i>
        <b style:background={t.vars.ink}></b>
        <b class="short" style:background={t.vars.ink3}></b>
      </span>
    </span>
    <span class="name">{t.name}</span>
  </button>
{/snippet}

<div class="gallery">
  <p class="label">Light</p>
  <div class="row">{#each light as t (t.id)}{@render swatch(t)}{/each}</div>
  <p class="label">Dark</p>
  <div class="row">{#each dark as t (t.id)}{@render swatch(t)}{/each}</div>
</div>

<style>
  .gallery {
    display: grid;
    gap: var(--s-2);
  }
  .label {
    margin: var(--s-2) 0 0;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--s-2);
  }
  .sw {
    display: grid;
    gap: 6px;
    padding: 5px;
    border-radius: var(--r-md);
    text-align: left;
    transition:
      background var(--dur-1) var(--ease-out),
      transform var(--dur-2) var(--ease-settle);
  }
  .sw:hover {
    background: var(--sunken);
    transform: translateY(-2px);
  }
  .sw:active {
    transform: scale(0.97);
  }
  .mini {
    position: relative;
    display: flex;
    align-items: center;
    gap: 6px;
    height: 58px;
    padding: 0 6px;
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
  }
  .dial {
    width: 42px;
    height: 42px;
    flex: none;
    transition: transform 0.6s var(--ease-out);
  }
  .sw:hover .dial {
    transform: rotate(30deg);
  }
  .rail {
    flex: 1;
    align-self: stretch;
    margin: 6px -6px 6px 0;
    border-left: 1px solid;
    border-radius: 6px 0 0 6px;
    display: grid;
    grid-template-columns: 6px 1fr;
    align-content: center;
    gap: 3px 4px;
    padding: 0 6px;
  }
  .rail i {
    grid-column: 1;
    width: 6px;
    height: 7px;
    border-radius: 3px;
  }
  .rail i:nth-of-type(1) {
    grid-row: 1;
  }
  .rail i:nth-of-type(2) {
    grid-row: 2;
  }
  .rail i:nth-of-type(3) {
    grid-row: 3;
  }
  .rail b {
    grid-column: 2;
    height: 3px;
    border-radius: 2px;
    opacity: 0.8;
  }
  .rail b:nth-of-type(1) {
    grid-row: 1;
  }
  .rail b:nth-of-type(2) {
    grid-row: 2;
    width: 60%;
  }
  .name {
    font-size: var(--t-xs);
    font-family: var(--font-ui);
    color: var(--ink-2);
    padding-left: 2px;
  }
  .sw.on .name {
    color: var(--ink);
    font-weight: 500;
  }
</style>
