<script lang="ts">
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { settings } from '../lib/stores/settings.svelte';
  import { view } from '../lib/stores/view.svelte';
  import { clearSample, keepSample, sampleTasks } from '../lib/sample';

  // First run: one card, three ideas, gone the moment the user acts.
  let step = $state(0);
  const STEPS = [
    {
      title: 'Your day, as a dial',
      body: 'Each coloured arc on the ring is a block of time. The orange hand is now — the arcs ahead of it are what is coming.',
    },
    {
      title: 'Sweep to plan',
      body: 'Press on the ring and drag around it to paint a new block. It clicks every five minutes. Tap an arc, then drag its knob to resize.',
    },
    {
      title: 'Finish, and it glows',
      body: 'Tick a block on the right when it is done. Finished time keeps a soft glow — that is your day, adding up.',
    },
  ];
  // The last card: a clean dial, or keep the sample blocks to try things on.
  const hasSample = $derived(sampleTasks().length > 0);
  const steps = $derived(
    hasSample
      ? [...STEPS, { title: 'Make it yours', body: 'These blocks are a sample day. Start with a clean dial, or keep them for now to try things out. You can clear them later in Settings.' }]
      : STEPS,
  );
  const done = () => (settings.value.onboarded = true);
  function fresh() {
    clearSample();
    done();
  }
  function keep() {
    keepSample();
    done();
  }
</script>

<div class="coach" role="dialog" aria-label="Getting started" in:fly={{ y: 20, duration: view.reducedMotion ? 0 : 420, delay: 500, easing: cubicOut }}>
  <div class="steps" aria-hidden="true">
    {#each steps as _, i (i)}<i class:on={i === step}></i>{/each}
  </div>
  {#key step}
    <div in:fly={{ x: 12, duration: view.reducedMotion ? 0 : 240, easing: cubicOut }}>
      <p class="title">{steps[step].title}</p>
      <p class="body">{steps[step].body}</p>
    </div>
  {/key}
  <div class="row">
    {#if step < steps.length - 1}
      <button class="btn btn-quiet" onclick={done}>Skip</button>
      <button class="btn btn-primary" onclick={() => step++}>Next</button>
    {:else if hasSample}
      <button class="btn btn-quiet" onclick={keep}>Keep them for now</button>
      <button class="btn btn-primary" onclick={fresh}>Start with a clean dial</button>
    {:else}
      <button class="btn btn-quiet" onclick={done}>Skip</button>
      <button class="btn btn-primary" onclick={done}>Start my day</button>
    {/if}
  </div>
</div>

<style>
  .coach {
    position: fixed;
    right: 24px;
    bottom: 24px;
    z-index: 40;
    width: min(340px, calc(100vw - 48px));
    padding: var(--s-4) var(--s-5) var(--s-3);
    border-radius: var(--r-lg);
    background: var(--raised);
    border: 1px solid var(--line);
    box-shadow: var(--shadow-3);
  }
  .steps {
    display: flex;
    gap: 5px;
    margin-bottom: var(--s-3);
  }
  .steps i {
    width: 18px;
    height: 4px;
    border-radius: 2px;
    background: var(--line-strong);
    transform-origin: left;
    transition: background var(--dur-3) var(--ease-out), transform var(--dur-3) var(--ease-out);
  }
  .steps i.on {
    transform: scaleX(1.5);
    margin-right: 9px;
    background: var(--signal);
  }
  .title {
    margin: 0;
    font-family: var(--font-ui);
    font-size: var(--t-lg);
    font-weight: 500;
  }
  .body {
    margin: var(--s-2) 0 0;
    color: var(--ink-2);
    font-size: var(--t-sm);
    line-height: 1.55;
  }
  .row {
    display: flex;
    justify-content: flex-end;
    gap: var(--s-2);
    margin-top: var(--s-4);
  }
</style>
