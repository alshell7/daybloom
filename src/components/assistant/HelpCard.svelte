<script lang="ts">
  // What I can do, as examples to tap.
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { session } from '../../lib/assistant/session.svelte';
  import { HELP_GROUPS } from '../../lib/assistant/tools';
  import Icon from '../../lib/Icon.svelte';
  import { view } from '../../lib/stores/view.svelte';

  const rise = (i: number) => ({ y: 6, delay: Math.min(i, 4) * 30, duration: view.reducedMotion ? 0 : 220, easing: cubicOut });
</script>

<div class="a-card help">
  {#each HELP_GROUPS as g, i (g.title)}
    <section in:fly={rise(i)}>
      <p class="a-label"><Icon name={g.icon} size={12} /> {g.title}</p>
      <div class="a-actions">
        {#each g.examples as ex (ex)}
          <button class="a-chip" onclick={() => session.ask(ex)}>{ex}</button>
        {/each}
      </div>
    </section>
  {/each}
  <p class="a-meta credit">
    {session.ready
      ? 'Runs on this device — Needle by Cactus Compute (Apache-2.0). Nothing leaves your computer.'
      : 'Works offline as it is. With Needle (35 MB, once) it understands looser phrasing — still all on this device.'}
  </p>
</div>

<style>
  section {
    display: grid;
    gap: 6px;
  }
  .credit {
    padding-top: 4px;
    border-top: 1px solid var(--line);
  }
</style>
