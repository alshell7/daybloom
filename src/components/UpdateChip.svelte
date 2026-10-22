<script lang="ts">
  // The update card, at the foot of the rail (where toasts and other cards rise, never over the
  // dial). When a new version is ready: its number, one line of what it brings, "What's new"
  // (the release's own notes, a tap away) and "Update and restart". While it downloads, a ring
  // fills around Daybloom's little dial mark; if that fails, a calm "Try again". "Not now" sets
  // it aside for a few hours and it waits in the top bar's More menu. It rises with a spring,
  // waits while a panel is open, and keeps toasts above it (view.setDock). A web update
  // (ota.svelte.ts) is already downloaded and verified: "Refresh to update" reloads in place.
  import { cubicOut } from 'svelte/easing';
  import { fly } from 'svelte/transition';
  import Icon from '../lib/Icon.svelte';
  import { countLine, parseNotes } from '../lib/releaseNotes';
  import { view } from '../lib/stores/view.svelte';
  import { installUpdate, updates } from '../lib/updater.svelte';
  import NotesList from './NotesList.svelte';
  import Popover from './pickers/Popover.svelte';
  import { springOut } from './topbar/motion';
  import { snoozeUpdate, updateNotice, updateWaiting } from './topbar/updateNotice.svelte';

  const busy = $derived(updates.status === 'downloading' || updates.status === 'installing');
  const failed = $derived(updates.status === 'error' && updateNotice.tried && !!updates.version);
  const offer = $derived(updates.status === 'available' && !updateWaiting());
  const phase = $derived(busy ? updates.status : failed ? 'failed' : offer ? 'offer' : null);
  const web = $derived(updates.kind === 'web');

  // An open panel leaves the dial little room: the offer steps away until it closes (nothing
  // covers the dial). A download in progress stays, beside the panel, or not at all on a narrow
  // window, where a panel is a bottom sheet.
  let narrow = $state(typeof matchMedia !== 'undefined' && matchMedia('(max-width: 860px)').matches);
  $effect(() => {
    const mq = matchMedia('(max-width: 860px)');
    const on = () => (narrow = mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  });
  const visible = $derived(!!phase && !view.focus && (!view.sheet || (busy && !narrow)));

  // A download started anywhere (here, Settings) reports its failure here too.
  $effect(() => {
    if (busy) updateNotice.tried = true;
  });

  const groups = $derived(parseNotes(updates.notes));
  const count = $derived(groups.reduce((s, g) => s + g.items.length, 0));
  const first = $derived(groups[0]?.items[0]);
  const highlight = $derived(first ? first.name || first.text : '');
  const pct = $derived(Math.round(updates.progress * 100));

  const R = 20;
  const C = 2 * Math.PI * R;

  let cardH = $state(0);
  $effect(() => {
    view.setDock('update', visible && cardH ? cardH : 0);
    return () => view.setDock('update', 0);
  });

  let cardEl = $state<HTMLElement>();
  let notesOpen = $state(false);
  $effect(() => {
    if (!offer) notesOpen = false;
  });

  function install() {
    notesOpen = false;
    updateNotice.tried = true;
    void installUpdate();
  }
  function later() {
    notesOpen = false;
    snoozeUpdate();
    view.say('The update waits in More (⋯) in the top bar');
  }

  const rm = $derived(view.reducedMotion);
  function rise(_node: Element) {
    if (rm) return { duration: 0 };
    return { duration: 680, easing: springOut, css: (t: number) => `transform: translateY(${(1 - t) * 30}px) scale(${0.94 + 0.06 * t}); opacity: ${Math.min(1, t * 2.4)}` };
  }
  function sink(_node: Element) {
    if (rm) return { duration: 0 };
    return { duration: 220, easing: cubicOut, css: (t: number) => `transform: translateY(${(1 - t) * 16}px) scale(${0.97 + 0.03 * t}); opacity: ${t}` };
  }
</script>

{#if visible}
  <section
    class="card"
    class:beside={!!view.sheet}
    class:wide={view.sheet?.kind === 'backlog' || view.sheet?.kind === 'insights'}
    data-keep-sheet
    bind:clientHeight={cardH}
    bind:this={cardEl}
    style:bottom={`${16 + view.dockBelow('update')}px`}
    aria-label="Daybloom update"
    aria-live="polite"
    in:rise
    out:sink
  >
    <div class="tile" class:failed aria-hidden="true">
      {#if busy}
        <svg viewBox="0 0 44 44" class="ring">
          <circle cx="22" cy="22" r={R} class="track" />
          <circle cx="22" cy="22" r={R} class="fill" stroke-dasharray={C} stroke-dashoffset={C * (1 - updates.progress)} />
        </svg>
      {/if}
      {#if failed}
        <span class="mark"><Icon name="refresh" size={18} stroke={2} /></span>
      {:else}
        <!-- Daybloom's own mark: a little dial with three blocks; its hand sweeps in once. -->
        <svg class="logo" class:small={busy} viewBox="0 0 64 64">
          <circle cx="32" cy="32" r="30" class="case" />
          <circle cx="32" cy="32" r="21" class="face" />
          <path d="M32 4.5a27.5 27.5 0 0 1 25.9 18.3" stroke="var(--c1)" />
          <path d="M58.7 30a27.5 27.5 0 0 1-9.4 23" stroke="var(--c2)" />
          <path d="M44.6 56.4a27.5 27.5 0 0 1-15.2 3" stroke="var(--c3)" />
          <g class="hand"><path d="M32 32V17" class="stick" /><circle cx="32" cy="17" r="2.6" class="tip" /></g>
        </svg>
      {/if}
    </div>

    <div class="body">
      {#key phase}
        <div class="txt" in:fly={{ y: 6, duration: rm ? 0 : 260, easing: cubicOut }}>
          {#if phase === 'offer'}
            <p class="t">Version <b class="tnum">{updates.version}</b> is ready</p>
            <p class="s" title={groups.length ? countLine(groups) : undefined}>
              {#if highlight}<span class="hl">{highlight}</span>{#if count > 1}{` · and ${count - 1} more`}{/if}{:else}Small fixes and polish{/if}
            </p>
          {:else if phase === 'downloading'}
            <p class="t">Updating to <b class="tnum">{updates.version}</b></p>
            <p class="s tnum">{pct}% · Daybloom restarts when it’s done</p>
          {:else if phase === 'installing' && web}
            <p class="t">Refreshing…</p>
            <p class="s">Starting <span class="tnum">{updates.version}</span></p>
          {:else if phase === 'installing'}
            <p class="t">Restarting…</p>
            <p class="s">Installing <span class="tnum">{updates.version}</span></p>
          {:else}
            <p class="t">Couldn’t update</p>
            <p class="s" title={updates.error}>{web ? 'Daybloom stays on this version for now.' : 'Check your connection, then try again.'}</p>
          {/if}
        </div>
      {/key}

      {#if phase === 'offer' || phase === 'failed'}
        <div class="acts">
          {#if phase === 'offer' && groups.length}
            <button class="btn btn-quiet sm link" class:open={notesOpen} onclick={() => (notesOpen = !notesOpen)} aria-expanded={notesOpen} aria-haspopup="dialog">What’s new <span class="chev"><Icon name="chevron-up" size={14} stroke={2.2} /></span></button>
          {:else if phase === 'failed'}
            <button class="btn btn-quiet sm" onclick={later}>Not now</button>
          {/if}
          <span class="sp"></span>
          <button class="btn btn-primary sm" onclick={install}>
            {#if phase === 'failed'}<Icon name="refresh" size={14} stroke={2.2} /> Try again{:else if web}Refresh to update{:else}Update and restart{/if}
          </button>
        </div>
      {/if}
    </div>

    {#if phase === 'offer'}
      <button class="icon-btn x" onclick={later} aria-label="Not now" title="Not now · it waits in More"><Icon name="x" size={16} /></button>
    {/if}
  </section>
{/if}

<!-- The notes open over the card (anchored to it), so its buttons stay in view. -->
{#if notesOpen && cardEl && offer}
  <Popover anchor={cardEl} onclose={() => (notesOpen = false)} label={`What’s new in Daybloom ${updates.version}`} width={cardEl.offsetWidth}>
    <div class="notes">
      <p class="cap">What’s new in <b class="tnum">{updates.version}</b></p>
      <div class="scroll"><NotesList {groups} compact /></div>
    </div>
  </Popover>
{/if}

<style>
  .card {
    position: fixed;
    right: 16px;
    bottom: calc(16px + var(--safe-bottom));
    z-index: 62;
    display: grid;
    grid-template-columns: 44px minmax(0, 1fr) auto;
    align-items: start;
    gap: 12px;
    width: min(372px, calc(100vw - 32px));
    padding: 14px 12px 12px 14px;
    border-radius: var(--r-lg);
    background: var(--raised);
    border: 1px solid var(--line);
    box-shadow: var(--shadow-3);
    font-family: var(--font-ui);
    transition:
      bottom var(--dur-3) var(--ease-out),
      translate 0.46s var(--ease-out);
  }
  /* Beside an open panel, like toasts (only wide windows get here; see `narrow`). `translate`,
     not `transform`, so it adds to the spring it rises with. */
  .card.beside {
    translate: -412px 0;
  }
  .card.beside.wide {
    translate: -552px 0;
  }
  .tile {
    position: relative;
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    color: var(--ink);
  }
  .tile.failed {
    color: var(--warm);
    background: color-mix(in srgb, var(--warm) 14%, transparent);
  }
  .mark {
    display: grid;
    place-items: center;
    animation: mark-in 0.7s var(--ease-settle) 0.12s backwards;
  }
  @keyframes mark-in {
    from {
      opacity: 0;
      transform: rotate(-70deg) scale(0.5);
    }
  }
  .logo {
    --c1: #3d6fe3;
    --c2: #25976a;
    --c3: #d99a06;
    width: 40px;
    height: 40px;
    transition: transform var(--dur-3) var(--ease-settle);
    animation: logo-in 0.62s var(--ease-settle) backwards;
  }
  :global([data-theme='dark']) .logo {
    --c1: #7598ff;
    --c2: #4fd39a;
    --c3: #ffc94a;
  }
  /* Room for the ring while it downloads. */
  .logo.small {
    transform: scale(0.78);
  }
  .logo path {
    fill: none;
    stroke-width: 6;
  }
  .case {
    fill: var(--ink);
  }
  .face {
    fill: var(--raised);
  }
  .stick {
    stroke: var(--ink);
    stroke-width: 3.5 !important;
    stroke-linecap: round;
  }
  .tip {
    fill: var(--signal);
  }
  .hand {
    transform-origin: 32px 32px;
    animation: hand-in 1.1s var(--ease-settle) 0.18s backwards;
  }
  @keyframes logo-in {
    from {
      opacity: 0;
      transform: scale(0.6);
    }
  }
  @keyframes hand-in {
    from {
      transform: rotate(-150deg);
    }
  }
  .ring {
    position: absolute;
    inset: 0;
    width: 44px;
    height: 44px;
    transform: rotate(-90deg);
  }
  .track {
    fill: none;
    stroke: var(--line-strong);
    stroke-width: 2.5;
  }
  .fill {
    fill: none;
    stroke: var(--ink);
    stroke-width: 2.5;
    stroke-linecap: round;
  }
  .body {
    min-width: 0;
    display: grid;
    gap: 10px;
    padding-top: 2px;
  }
  .txt {
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  .t {
    margin: 0;
    font-size: var(--t-md);
    font-weight: 500;
    color: var(--ink);
    line-height: 1.3;
  }
  .t b {
    font-weight: 500;
  }
  .s {
    margin: 0;
    font-size: var(--t-xs);
    color: var(--ink-3);
    line-height: 1.4;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .hl {
    color: var(--ink-2);
  }
  .acts {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-left: -8px;
  }
  .sp {
    flex: 1;
  }
  .sm {
    height: 32px;
    padding: 0 14px;
    gap: 6px;
  }
  .link {
    padding: 0 8px 0 10px;
    gap: 3px;
  }
  .x {
    width: 28px;
    height: 28px;
    margin: -4px -2px 0 0;
    color: var(--ink-3);
  }
  .notes {
    display: grid;
    gap: var(--s-3);
  }
  .cap {
    margin: 0;
    font-size: var(--t-md);
    color: var(--ink-2);
  }
  .cap b {
    color: var(--ink);
    font-weight: 500;
  }
  .scroll {
    max-height: min(52vh, 420px);
    overflow: auto;
    padding-right: 4px;
  }
  .chev {
    display: grid;
    transition: transform var(--dur-2) var(--ease-settle);
  }
  .link.open .chev {
    transform: rotate(180deg);
  }
  :global([data-motion='calm']) .card .mark,
  :global([data-motion='calm']) .card .logo,
  :global([data-motion='calm']) .card .hand {
    animation: none;
  }
</style>
