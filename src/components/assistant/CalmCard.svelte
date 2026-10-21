<script lang="ts">
  // Calm: the breathing minute (the guide runs on the dial; this card names the phase and
  // lets you stop), or closing the day.
  import Icon from '../../lib/Icon.svelte';
  import { categoryColor } from '../../lib/engine/categories';
  import { formatDuration } from '../../lib/engine/time';
  import { dayReview } from '../../lib/nudges.svelte';
  import { clock } from '../../lib/stores/clock.svelte';
  import { taskFile } from '../../lib/stores/tasks.svelte';
  import { view } from '../../lib/stores/view.svelte';
  import { breath } from '../../lib/breath.svelte';

  let { kind }: { kind: 'breathe' | 'winddown' } = $props();

  // The shared rhythm (breath.svelte.ts); the orb fills on the in-breath and empties on the out.
  const st = $derived(breath.state);
  const on = $derived(!!st);
  const phase = $derived({ word: st?.word ?? 'Breathe in', scale: st && (st.id === 'in' || st.id === 'hold') ? 1 : 0.62 });
  const phaseLen = $derived(st?.ms ?? 4000);
  const secs = $derived(st?.secondsLeft ?? 4);
  const round = $derived(st?.round ?? 1);

  const review = $derived(kind === 'winddown' ? (taskFile.value.tasks, dayReview(view.today)) : null);
</script>

{#if kind === 'breathe'}
  <div class="a-card calm" style:--c={categoryColor('rest', view.finish.dark)}>
    {#if on}
      <div class="breath">
        <span class="orb" style:transform={`scale(${phase.scale})`} style:transition-duration={view.reducedMotion ? '0ms' : `${phaseLen}ms`}></span>
        <div class="txt" aria-live="polite">
          <strong class="a-title">{phase.word}</strong>
          <span class="a-meta tnum">{secs} · round {round} of {breath.rhythm.rounds}</span>
        </div>
      </div>
      <div class="a-actions"><button class="a-chip quiet" onclick={() => (view.breatheAt = 0)}>Stop</button></div>
    {:else}
      <div class="breath">
        <span class="orb rest"></span>
        <div class="txt">
          <strong class="a-title">{view.breatheAt ? 'That was a minute.' : 'Ready when you are.'}</strong>
          <span class="a-meta">{view.breatheAt ? 'Notice how you feel. No need to rush back.' : 'One minute, on the dial.'}</span>
        </div>
      </div>
      <div class="a-actions"><button class="a-chip" onclick={() => (view.breatheAt = clock.now)}><Icon name="wind" size={13} /> {view.breatheAt ? 'Again' : 'Begin'}</button></div>
    {/if}
  </div>
{:else if review}
  <div class="a-card calm">
    <div class="breath">
      <span class="a-ico quiet"><Icon name="moon" size={15} /></span>
      <div class="txt">
        <strong class="a-title tnum">{review.done.length ? `${review.done.length} done today` : 'A quiet day'}</strong>
        <span class="a-meta tnum">{review.spentMs >= 60_000 ? `${formatDuration(review.spentMs)} well spent` : 'Rest is part of the plan.'}{review.open.length ? ` · ${review.open.length} still open` : ''}</span>
      </div>
    </div>
    <div class="a-actions">
      <button class="a-chip primary" onclick={() => (view.sheet = { kind: 'winddown' })}><Icon name="moon" size={13} /> Close the day</button>
    </div>
  </div>
{/if}

<style>
  .breath {
    display: flex;
    align-items: center;
    gap: var(--s-3);
  }
  .txt {
    display: grid;
    gap: 1px;
  }
  /* Steps with the phase (a one-shot transition each time), only during the minute. */
  .orb {
    flex: none;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    /* Rest's colour (lume is only for finished time). */
    background: radial-gradient(circle, color-mix(in srgb, var(--c) 42%, transparent), color-mix(in srgb, var(--c) 12%, transparent));
    transition-property: transform;
    transition-timing-function: var(--ease-in-out);
  }
  .orb.rest {
    transform: scale(0.62);
  }
</style>
