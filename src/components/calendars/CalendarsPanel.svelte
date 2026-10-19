<script lang="ts">
  import { view } from '../../lib/stores/view.svelte';
  import Panel from '../Panel.svelte';
  import CalendarsBody from './CalendarsBody.svelte';

  // Mount anywhere once (like InsightsPanel). Opens on `view.sheet = { kind: 'calendars' }`;
  // `add: 'ics' | 'google'` opens straight on that way of adding a calendar.
  const sheet = $derived(view.sheet?.kind === 'calendars' ? view.sheet : null);
</script>

{#if sheet}
  <Panel title="Calendars" onclose={() => (view.sheet = null)}>
    <CalendarsBody add={sheet.add} />
  </Panel>
{/if}
