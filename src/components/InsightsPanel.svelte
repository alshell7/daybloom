<script lang="ts">
  import { view } from '../lib/stores/view.svelte';
  import Panel from './Panel.svelte';
  import InsightsBody from './insights/InsightsBody.svelte';
</script>

{#if view.sheet?.kind === 'insights'}
  <Panel title="Your week" onclose={() => (view.sheet = null)} wide>
    <InsightsBody />
  </Panel>
{/if}
