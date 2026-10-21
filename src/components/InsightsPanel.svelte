<script lang="ts">
  // Your week: the overview (counts, rhythm, time well spent, badges) and the Done tab, the
  // history of everything finished. Both count from the same list (lib/history.ts), and the
  // history's sources register here at start-up so every other count agrees with it too.
  import { cubicOut } from 'svelte/easing';
  import { fly } from 'svelte/transition';
  import type { ISODate } from '../lib/engine/types';
  import { view } from '../lib/stores/view.svelte';
  import Panel from './Panel.svelte';
  import HistoryView from './history/HistoryView.svelte';
  // Registers the done calendar events with lib/history.ts (see sources.ts).
  import './history/sources';
  import ViewTabs from './history/ViewTabs.svelte';
  import InsightsBody from './insights/InsightsBody.svelte';

  type Tab = 'week' | 'done';
  const open = $derived(view.sheet?.kind === 'insights');
  let tab = $state<Tab>('week');
  let dir = $state<1 | -1>(1);
  let jump = $state<ISODate | null>(null);

  // Each opening says where to land: the overview unless it asks for the history.
  $effect(() => {
    const s = view.sheet;
    if (s?.kind !== 'insights') return;
    tab = s.tab ?? 'week';
    jump = s.date ?? null;
  });

  function go(t: Tab, date: ISODate | null = null) {
    if (t !== tab) dir = t === 'done' ? 1 : -1;
    tab = t;
    jump = date;
  }
</script>

{#if open}
  <Panel title="Your week" onclose={() => (view.sheet = null)} wide>
    <div class="tabs">
      <ViewTabs
        label="Your week"
        value={tab}
        onchange={(t) => go(t)}
        tabs={[
          { id: 'week', label: 'Overview', icon: 'chart' },
          { id: 'done', label: 'Done', icon: 'circle-check' },
        ]}
      />
    </div>
    {#key tab}
      <div class="pane" in:fly={{ x: 18 * dir, duration: view.reducedMotion ? 0 : 320, easing: cubicOut }}>
        {#if tab === 'week'}
          <InsightsBody onhistory={(date) => go('done', date)} />
        {:else}
          <HistoryView {jump} />
        {/if}
      </div>
    {/key}
  </Panel>
{/if}

<style>
  .tabs {
    margin: 0 0 var(--s-4);
  }
  .pane {
    min-width: 0;
  }
</style>
