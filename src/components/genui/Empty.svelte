<script lang="ts">
  // For parts that only live inside another component (PlanItem in PlanProposal): alone they
  // draw nothing.
  import type { ComponentRenderProps } from '@openuidev/svelte-lang';

  let {}: ComponentRenderProps<Record<string, unknown>> = $props();
</script>
