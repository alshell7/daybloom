<script lang="ts">
  // A mic inside a text field. Press and hold to talk (let go to finish), or tap to talk hands-
  // free (it stops by itself when you pause; tap again to finish now). While it listens, the
  // mic becomes a tiny voice ring.
  import Icon from '../../lib/Icon.svelte';
  import { view } from '../../lib/stores/view.svelte';
  import { voice, type VoiceSurface } from '../../lib/voice/voice.svelte';
  import VoiceRing from './VoiceRing.svelte';

  let { surface, size = 30, label = 'Speak' }: { surface: VoiceSurface; size?: number; label?: string } = $props();

  const mine = $derived(voice.surface === surface && voice.active);
  const listening = $derived(mine && voice.phase === 'listening');
  const busy = $derived(mine && (voice.phase === 'finishing' || voice.phase === 'thinking' || voice.phase === 'opening' || voice.phase === 'downloading'));

  function down(e: PointerEvent) {
    if (e.button !== 0) return;
    // Keep the field's focus and caret where they are.
    e.preventDefault();
    if (mine && (voice.phase === 'needs-model' || voice.phase === 'error')) {
      voice.cancel();
      return;
    }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    voice.press(surface);
  }
  function up() {
    voice.release();
  }
  // Keyboard (Enter / Space on the focused button): a click without a pointer.
  function click(e: MouseEvent) {
    if (e.detail !== 0) return;
    if (listening) void voice.stop();
    else if (mine && voice.active) voice.cancel();
    else void voice.start(surface, { handsFree: true });
  }
</script>

<button
  type="button"
  class="mic"
  class:on={listening}
  style:--sz={`${size}px`}
  onpointerdown={down}
  onpointerup={up}
  onpointercancel={up}
  onclick={click}
  aria-pressed={listening}
  aria-label={listening ? 'Stop and use what I said' : label}
  title={listening ? (voice.handsFree ? 'Done · or just pause' : 'Let go to finish') : `${label} · hold to talk, or tap`}
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
    touch-action: none;
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
