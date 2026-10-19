<script lang="ts">
  // A mic inside a text field. Tap to talk (it stops by itself when you pause), tap again to
  // finish. While it listens, the mic becomes a tiny voice ring.
  import Icon from '../../lib/Icon.svelte';
  import { view } from '../../lib/stores/view.svelte';
  import { voice, type VoiceSurface } from '../../lib/voice/voice.svelte';
  import VoiceRing from './VoiceRing.svelte';

  let { surface, size = 30, label = 'Speak' }: { surface: VoiceSurface; size?: number; label?: string } = $props();

  const mine = $derived(voice.surface === surface && voice.active);
  const busy = $derived(mine && (voice.phase === 'finishing' || voice.phase === 'thinking' || voice.phase === 'opening' || voice.phase === 'downloading'));

  function toggle(e: MouseEvent) {
    e.preventDefault();
    if (mine && voice.phase === 'listening') void voice.stop();
    else if (mine && (voice.phase === 'opening' || voice.phase === 'needs-model' || voice.phase === 'error')) voice.cancel();
    else void voice.start(surface, { handsFree: true });
  }
</script>

<button
  type="button"
  class="mic"
  class:on={mine && voice.phase === 'listening'}
  style:--sz={`${size}px`}
  onmousedown={(e) => e.preventDefault()}
  onclick={toggle}
  aria-pressed={mine && voice.phase === 'listening'}
  aria-label={mine && voice.phase === 'listening' ? 'Stop and use what I said' : label}
  title={mine && voice.phase === 'listening' ? 'Done · or just pause' : `${label} · V`}
>
  {#if mine && (voice.phase === 'listening' || busy)}
    <VoiceRing
      size={size}
      mode={voice.phase === 'listening' ? 'listening' : voice.phase === 'downloading' ? 'progress' : 'thinking'}
      ring={voice.ring}
      level={voice.level}
      progress={voice.progress}
      speaking={voice.speaking}
      color="var(--ink)"
      reduced={view.reducedMotion}
    />
  {:else}
    <Icon name="mic" size={Math.round(size * 0.55)} stroke={2} />
  {/if}
</button>

<style>
  .mic {
    display: grid;
    place-items: center;
    width: var(--sz);
    height: var(--sz);
    flex: none;
    border-radius: 50%;
    color: var(--ink-3);
    transition:
      background var(--dur-1) var(--ease-out),
      color var(--dur-1) var(--ease-out),
      transform var(--dur-1) var(--ease-out);
  }
  .mic:hover {
    background: var(--sunken);
    color: var(--ink);
  }
  .mic:active {
    transform: scale(0.92);
  }
  .mic.on {
    color: var(--ink);
    --core-ink: var(--ink-inverse);
  }
</style>
