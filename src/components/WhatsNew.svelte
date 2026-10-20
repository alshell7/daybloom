<script lang="ts">
  // "What's new": the notes of this version (shown once after an update), with earlier
  // versions a tap away.
  import { notesFor, versions } from '../lib/releaseNotes';
  import { updates } from '../lib/updater.svelte';
  import { view } from '../lib/stores/view.svelte';
  import NotesList from './NotesList.svelte';
  import Panel from './Panel.svelte';

  const open = $derived(view.sheet?.kind === 'whatsnew');
  const all = versions();
  let picked = $state<string | null>(null);
  const version = $derived(picked ?? (view.sheet?.kind === 'whatsnew' && view.sheet.version) ?? (updates.current && all.includes(updates.current) ? updates.current : all[0]));
  const groups = $derived(version ? notesFor(version) : []);
  $effect(() => {
    if (!open) picked = null;
  });
</script>

{#if open}
  <Panel title="What’s new" onclose={() => (view.sheet = null)} accent="var(--lume)">
    <div class="wn">
      <div class="head">
        <p class="v">Daybloom <b class="tnum">{version}</b></p>
        {#if all.length > 1}
          <div class="vs" role="group" aria-label="Versions">
            {#each all.slice(0, 6) as v (v)}
              <button class="tnum" aria-pressed={v === version} onclick={() => (picked = v)}>{v}</button>
            {/each}
          </div>
        {/if}
      </div>
      {#key version}
        {#if groups.length}
          <NotesList {groups} />
        {:else}
          <p class="empty">No notes for this version.</p>
        {/if}
      {/key}
    </div>
  </Panel>
{/if}

<style>
  .wn {
    display: grid;
    gap: var(--s-4);
  }
  .head {
    display: grid;
    gap: var(--s-2);
  }
  .v {
    margin: 0;
    font-size: var(--t-lg);
    color: var(--ink-2);
  }
  .v b {
    color: var(--ink);
    font-weight: 500;
  }
  .vs {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .vs button {
    height: 26px;
    padding: 0 10px;
    border-radius: var(--r-pill);
    font-size: var(--t-xs);
    color: var(--ink-2);
    background: var(--sunken);
  }
  .vs button[aria-pressed='true'] {
    color: var(--ink-inverse);
    background: var(--ink);
  }
  .empty {
    color: var(--ink-3);
    font-size: var(--t-sm);
  }
</style>
