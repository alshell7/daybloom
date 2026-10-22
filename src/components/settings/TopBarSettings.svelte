<script lang="ts">
  // Settings › Screen › Top bar: every item the bar can show, by group, each with a switch, and a
  // small live picture of the bar as you choose. Hidden items (and whatever doesn't fit the
  // window) wait in the More menu (⋯), so nothing is ever out of reach. Saved in
  // `settings.topBar.hidden`, which syncs with your other computers.
  import { platform } from '../../lib/platform';
  import { flip } from 'svelte/animate';
  import { calendarState } from '../../lib/calendarBridge.svelte';
  import Icon from '../../lib/Icon.svelte';
  import { formatTime } from '../../lib/engine/time';
  import { clock } from '../../lib/stores/clock.svelte';
  import { settings } from '../../lib/stores/settings.svelte';
  import { view } from '../../lib/stores/view.svelte';
  import { barCatalog, GROUPS, type BarItemDef } from '../topbar/items';
  import { barLive } from '../topbar/live.svelte';
  import { popIn, popOut, springOut } from '../topbar/motion';

  const rm = $derived(view.reducedMotion);
  const catalog = $derived(barCatalog());
  const hidden = $derived(new Set(settings.value.topBar.hidden));
  const groups = $derived(GROUPS.map((g) => ({ ...g, items: catalog.filter((d) => d.group === g.id) })));
  const connected = $derived(calendarState.accounts.some((a) => a.enabled !== false));
  const hiddenCount = $derived(catalog.filter((d) => hidden.has(d.id)).length);

  function show(id: string, on: boolean) {
    const rest = settings.value.topBar.hidden.filter((x) => x !== id);
    settings.value.topBar = { ...settings.value.topBar, hidden: on ? rest : [...rest, id] };
  }
  function reset() {
    settings.value.topBar = { ...settings.value.topBar, hidden: [] };
  }

  const note = (d: BarItemDef) => (d.id === 'calendars' && connected ? undefined : d.note);

  // The preview: the bar's actions as they are now (live pills aside), what doesn't fit the
  // window counted on More.
  const pvActions = $derived(catalog.filter((d) => !d.lead && d.group !== 'now' && !hidden.has(d.id) && !barLive.folded.includes(d.id) && (d.id !== 'calendars' || connected)));
  const inMore = $derived(catalog.filter((d) => hidden.has(d.id) || barLive.folded.includes(d.id)).length);
  const pvWeek = $derived(hidden.has('week') ? null : barLive.week === 'below' ? 'below' : barLive.week === 'menu' ? null : 'inline');
  const folded = $derived(barLive.folded.length);
  const place = platform.isMobile ? 'screen' : 'window';
  const status = $derived.by(() => {
    const items = (n: number) => (n === 1 ? '1 item' : `${n} items`);
    if (folded && hiddenCount) return `${hiddenCount} hidden and ${folded} that don’t fit this ${place} wait in More.`;
    if (folded) return `${items(folded)} don’t fit this ${place}, so ${folded === 1 ? 'it waits' : 'they wait'} in More.${platform.isMobile ? '' : ` A wider window brings ${folded === 1 ? 'it' : 'them'} back.`}`;
    if (hiddenCount) return `${items(hiddenCount)} hidden, in More. Everything else fits this ${place}.`;
    return platform.isMobile ? 'Everything fits on this screen.' : 'Everything fits at this window size.';
  });

  // Shrink the preview to fit the panel, never grow it.
  let boxW = $state(0);
  let innerW = $state(0);
  let innerH = $state(0);
  const k = $derived(innerW && boxW ? Math.min(1, boxW / innerW) : 1);
</script>

<section>
  <h3>Top bar</h3>
  <p class="hint top">Choose what shows in the top bar. Hidden items stay one {platform.isMobile ? 'tap' : 'click'} away in the More menu (⋯), and so does anything that doesn’t fit the {place}.</p>

  <div class="preview" aria-hidden="true" bind:clientWidth={boxW} style:height={innerH ? `${innerH * k}px` : undefined}>
    <div class="pv" bind:clientWidth={innerW} bind:clientHeight={innerH} style:transform={k < 1 ? `scale(${k})` : undefined}>
      <div class="pv-row">
        <span class="pv-lead">
          {#if !hidden.has('date')}
            <span class="pv-clock tnum">{formatTime(clock.minute, view.hour12)}</span>
            <span class="pv-day">Today</span>
          {/if}
          {#if !hidden.has('zone') && barLive.zone !== 'menu'}<span class="pv-zone"><Icon name="globe" size={11} stroke={2} /></span>{/if}
        </span>
        {#if pvWeek === 'inline'}
          <span class="pv-week">{#each { length: 7 } as _, i (i)}<i class:on={i === 2}></i>{/each}</span>
        {/if}
        <span class="pv-sp"></span>
        <span class="pv-actions">
          {#each pvActions as d, i (d.id)}
            <span class="pv-ic" class:gs={i > 0 && pvActions[i - 1].group !== d.group} animate:flip={{ duration: rm ? 0 : 420, easing: springOut }} in:popIn={{ reduced: rm }} out:popOut={{ reduced: rm }}>
              <Icon name={d.icon} size={13} stroke={2} />
            </span>
          {/each}
          <span class="pv-ic more" class:has={inMore > 0}>
            <Icon name="more" size={13} stroke={2} />
            {#if inMore}{#key inMore}<b class="tnum" in:popIn={{ reduced: rm }}>{inMore}</b>{/key}{/if}
          </span>
        </span>
      </div>
      {#if pvWeek === 'below'}
        <div class="pv-week below">{#each { length: 7 } as _, i (i)}<i class:on={i === 2}></i>{/each}</div>
      {/if}
    </div>
  </div>
  <p class="hint live">{status}</p>

  {#each groups as g (g.id)}
    {#if g.items.length || g.id === 'addons'}
      <h4>{g.name}</h4>
      {#each g.items as d (d.id)}
        <label class="row">
          <span class="lbl">
            <span class="ic"><Icon name={d.icon} size={15} /></span>
            <span class="name">{d.label}{#if d.kbd}<kbd>{d.kbd}</kbd>{/if}</span>
            {#if note(d)}<small>{note(d)}</small>{/if}
          </span>
          <input type="checkbox" class="switch" checked={!hidden.has(d.id)} onchange={(e) => show(d.id, e.currentTarget.checked)} aria-label={`Show ${d.label} in the top bar`} />
        </label>
      {/each}
      {#if g.id === 'addons' && !g.items.length}
        <p class="hint empty">Addons with a panel add their own button here when you turn them on.</p>
      {/if}
    {/if}
  {/each}

  <div class="foot">
    <button class="btn btn-soft sm" onclick={reset} disabled={!hiddenCount} title="Show every item again"><Icon name="undo" size={14} /> Reset</button>
  </div>
</section>

<style>
  section {
    padding: var(--s-4) 0;
    border-top: 1px solid var(--line);
  }
  section:first-child,
  :global(.grp) + section {
    border-top: 0;
  }
  section:first-child {
    padding-top: var(--s-2);
  }
  h3 {
    margin: 0 0 var(--s-3);
    font-family: var(--font-ui);
    font-size: var(--t-md);
    font-weight: 500;
  }
  h4 {
    margin: var(--s-4) 0 2px;
    font-family: var(--font-ui);
    font-size: var(--t-xs);
    font-weight: 500;
    color: var(--ink-3);
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-3);
    min-height: 40px;
    padding: 3px 0;
    font-size: var(--t-sm);
    cursor: pointer;
  }
  .lbl {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 2px 8px;
    min-width: 0;
    color: var(--ink-2);
  }
  .ic {
    display: grid;
    place-items: center;
    width: 15px;
    color: var(--ink-3);
  }
  .name {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .lbl small {
    flex-basis: 100%;
    padding-left: 23px;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  kbd {
    font-family: var(--font-ui);
    font-size: 10.5px;
    color: var(--ink-3);
    padding: 0 5px;
    border-radius: 5px;
    border: 1px solid var(--line);
  }
  .hint {
    margin: var(--s-2) 0 0;
    font-size: var(--t-xs);
    color: var(--ink-3);
    line-height: 1.5;
  }
  .hint.top {
    margin: -6px 0 var(--s-3);
  }
  .hint.empty {
    margin: 4px 0 0 23px;
  }
  .foot {
    display: flex;
    justify-content: flex-end;
    margin-top: var(--s-4);
  }
  .sm {
    height: 32px;
    padding: 0 12px;
    gap: 6px;
  }

  /* --- the preview: a small picture of the bar ---------------------------------------- */
  .preview {
    overflow: hidden;
    border-radius: var(--r-md);
    background: var(--ground);
    box-shadow: inset 0 0 0 1px var(--line);
  }
  .pv {
    width: max-content;
    min-width: 100%;
    padding: 10px 12px;
    transform-origin: left top;
    font-family: var(--font-ui);
  }
  .pv-row {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 24px;
  }
  .pv-lead {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .pv-clock {
    padding: 1px 6px;
    border-radius: var(--r-pill);
    background: var(--ink);
    color: var(--ink-inverse);
    font-size: 10.5px;
    font-weight: 500;
  }
  .pv-day {
    font-size: 11.5px;
    font-weight: 500;
    color: var(--ink);
  }
  .pv-zone {
    display: grid;
    place-items: center;
    color: var(--ink-3);
  }
  .pv-week {
    display: inline-flex;
    gap: 3px;
    margin: 0 auto;
  }
  .pv-week i {
    width: 11px;
    height: 14px;
    border-radius: 4px;
    background: var(--line-strong);
  }
  .pv-week i.on {
    background: var(--ink);
  }
  .pv-week.below {
    display: flex;
    justify-content: center;
    margin-top: 8px;
  }
  .pv-sp {
    flex: 1;
    min-width: 8px;
  }
  .pv-week + .pv-sp {
    flex: 0;
  }
  .pv-actions {
    display: inline-flex;
    align-items: center;
    gap: 1px;
  }
  .pv-ic {
    position: relative;
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    color: var(--ink-2);
  }
  .pv-ic.gs {
    margin-left: 5px;
  }
  .pv-ic.more.has {
    background: var(--sunken);
    color: var(--ink);
  }
  .pv-ic b {
    position: absolute;
    top: -5px;
    right: -6px;
    min-width: 14px;
    height: 14px;
    padding: 0 3px;
    border-radius: 7px;
    background: var(--ink);
    color: var(--ink-inverse);
    font-size: 9px;
    font-weight: 600;
    line-height: 14px;
    text-align: center;
  }
</style>
