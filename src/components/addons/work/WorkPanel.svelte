<script lang="ts">
  // The Work addon: what your time earns. Overview (the period at a glance), Projects
  // (clients, rates, budgets) and Bills (draft, print to PDF, export, mark paid).
  import { work } from '../../../lib/addons/work/work.svelte';
  import { view } from '../../../lib/stores/view.svelte';
  import Panel from '../../Panel.svelte';
  import Segmented from '../../Segmented.svelte';
  import WorkBills from './WorkBills.svelte';
  import WorkOverview from './WorkOverview.svelte';
  import WorkProjects from './WorkProjects.svelte';

  const sheet = $derived(view.sheet?.kind === 'work' ? view.sheet : null);
  let tab = $state<'overview' | 'projects' | 'bills'>('overview');
  $effect(() => {
    if (sheet?.tab === 'projects' || sheet?.tab === 'bills' || sheet?.tab === 'overview') tab = sheet.tab;
  });
  $effect(() => {
    if (sheet && !work.ready) void work.load();
  });
</script>

{#if sheet}
  <Panel title="Work" onclose={() => (view.sheet = null)} accent="#25976A" wide>
    <div class="wp">
      <Segmented
        label="Work view"
        value={tab}
        options={[
          { value: 'overview', label: 'Overview' },
          { value: 'projects', label: 'Projects' },
          { value: 'bills', label: 'Bills' },
        ]}
        onchange={(v) => (tab = v as typeof tab)}
      />
      {#if tab === 'overview'}
        <WorkOverview ongo={(t) => (tab = t)} />
      {:else if tab === 'projects'}
        <WorkProjects />
      {:else}
        <WorkBills />
      {/if}
    </div>
  </Panel>
{/if}

<style>
  .wp {
    display: grid;
    gap: var(--s-5);
  }
</style>
