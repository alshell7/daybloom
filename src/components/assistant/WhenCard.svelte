<script lang="ts">
  // When is it? A countdown you can see: the hour before it as a shrinking wedge of free time
  // tipped with its colour, or — once it's on — the time left inside it.
  import { toggleDone } from '../../lib/actions';
  import { blockFor, dayWord } from '../../lib/assistant/tools';
  import { formatDuration, formatTime, HOUR } from '../../lib/engine/time';
  import Icon from '../../lib/Icon.svelte';
  import Rolling from '../../lib/dial/Rolling.svelte';
  import { clock } from '../../lib/stores/clock.svelte';
  import { view } from '../../lib/stores/view.svelte';
  import Ring from './Ring.svelte';

  let { card }: { card: { kind: 'when'; key: string } } = $props();

  const b = $derived((clock.zone, blockFor(card.key)));
  const now = $derived(clock.now);
  const live = $derived(!!b && !b.floating && !b.done && b.startMs <= now && now < b.endMs);
  const ahead = $derived(!!b && !b.floating && b.startMs > now);
  const fmt = (ms: number) => formatTime(ms, view.hour12);
  const status = $derived.by(() => {
    if (!b) return '';
    if (b.done) return 'Done';
    if (b.floating) return `${dayWord(b.date)}, any time`;
    if (live) return `On now · ${formatDuration(b.endMs - now)} left`;
    if (ahead) return `in ${formatDuration(b.startMs - now)}`;
    return `was at ${fmt(b.startMs)}`;
  });
</script>

{#if b}
  <div class="a-card when" style:--c={b.color}>
    <div class="hero">
      {#if live}
        <Ring fraction={(b.endMs - now) / (b.endMs - b.startMs)} color={b.color} size={58} label={status}>
          <Rolling text={formatDuration(b.endMs - now)} reduced={view.reducedMotion} />
        </Ring>
      {:else if ahead}
        <Ring fraction={Math.min(1, (b.startMs - now) / HOUR)} color={view.finish.track} tip={b.color} size={58} label={status}>
          <Rolling text={formatDuration(b.startMs - now)} reduced={view.reducedMotion} />
        </Ring>
      {:else}
        <span class="a-ico big" class:lume={b.done}><Icon name={b.done ? 'check' : b.icon} size={18} stroke={b.done ? 2.6 : 2} /></span>
      {/if}
      <div class="txt">
        <strong class="a-title">{b.title || 'Untitled block'}</strong>
        <span class="a-meta">{dayWord(b.date)}{b.floating ? '' : ` · ${fmt(b.startMs)}–${fmt(b.endMs)}`}</span>
        <span class="a-meta strong">{status}</span>
      </div>
      {#if live || ahead}<span class="a-ico"><Icon name={b.icon} size={15} /></span>{/if}
    </div>
    <div class="a-actions">
      <button class="a-chip quiet" onclick={() => (view.setDate(b.date), (view.selected = b.key))}><Icon name="dial" size={13} /> Show on the dial</button>
      {#if b.kind === 'task' && !b.done && !ahead}
        <button class="a-chip" onclick={() => toggleDone(b.key)}><Icon name="check" size={13} stroke={2.4} /> Done</button>
      {/if}
    </div>
  </div>
{/if}

<style>
  .hero {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: var(--s-3);
    align-items: center;
  }
  .txt {
    display: grid;
    gap: 1px;
    min-width: 0;
  }
  .strong {
    color: var(--ink-2);
    font-weight: 500;
  }
  .big {
    width: 46px;
    height: 46px;
    border-radius: 50%;
  }
</style>
