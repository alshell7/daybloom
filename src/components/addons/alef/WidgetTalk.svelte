<script lang="ts">
  // Talking to Alef from the desktop widget: a small field at the foot of the dial (type, or
  // hold the mic or Space to speak) and Alef's answer in a bubble over the dial. The planner
  // window holds the conversation (the same history, tools and brain); the widget sends what you
  // said and shows what Alef says back.
  import { onMount, tick, untrack } from 'svelte';
  import { cubicOut } from 'svelte/easing';
  import { fly, scale } from 'svelte/transition';
  import { alef } from '../../../lib/addons/alef/alef.svelte';
  import Icon from '../../../lib/Icon.svelte';
  import { platform } from '../../../lib/platform';
  import { view } from '../../../lib/stores/view.svelte';
  import { voice } from '../../../lib/voice/voice.svelte';
  import MicButton from '../../voice/MicButton.svelte';

  let { start = '', onclose, ink, face }: { start?: string; onclose: () => void; ink: string; face: string } = $props();

  let text = $state(untrack(() => start));
  let field = $state<HTMLInputElement>();
  let sent = $state(false);
  let reply = $state<string | null>(null);
  const rm = $derived(view.reducedMotion);

  onMount(() => {
    void platform.focusSelf().finally(() =>
      tick().then(() => {
        field?.focus();
        const n = field?.value.length ?? 0;
        field?.setSelectionRange(n, n);
      }),
    );
  });

  function send(e?: SubmitEvent) {
    e?.preventDefault();
    const t = text.trim();
    if (!t) return;
    text = '';
    sent = true;
    reply = null;
    void platform.broadcast('alef-ask', { text: t });
  }

  // Alef's answer arrives as its speech bubble (mirrored from the planner).
  $effect(() => {
    const b = alef.bubble;
    if (b && sent) untrack(() => (reply = b.text));
  });
  const thinking = $derived(sent && alef.thinking);

  // Spoken words go to Alef too.
  let usedFinal = '';
  $effect(() => {
    if (voice.surface !== 'alef' || voice.phase !== 'idle' || !voice.final || voice.final === usedFinal) return;
    usedFinal = voice.final;
    untrack(() => {
      sent = true;
      reply = null;
      void platform.broadcast('alef-ask', { text: voice.final });
    });
  });
  const listening = $derived(voice.surface === 'alef' && (voice.phase === 'listening' || voice.phase === 'finishing'));
  const needsModel = $derived(voice.surface === 'alef' && voice.phase === 'needs-model');

  function key(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (voice.active) voice.cancel();
      onclose();
    }
  }
</script>

<div class="talk" style:--ink={ink} style:--face={face} role="presentation" onpointerdown={(e) => e.stopPropagation()} onkeydown={key}>
  {#if thinking || reply || needsModel}
    <div class="reply" in:scale={{ start: 0.85, duration: rm ? 0 : 320, easing: cubicOut }} aria-live="polite">
      {#if needsModel}
        To talk, get the speech model in Daybloom first: Settings › Voice.
      {:else if thinking && !reply}
        <span class="dots" aria-label="Alef is thinking"><i></i><i></i><i></i></span>
      {:else}
        {reply}
      {/if}
    </div>
  {/if}
  <form class="bar" onsubmit={send} data-voice="alef" in:fly={{ y: 10, duration: rm ? 0 : 260, easing: cubicOut }}>
    <input bind:this={field} bind:value={text} placeholder={listening ? voice.live || 'Listening…' : 'Talk to Alef…'} aria-label="Talk to Alef" autocomplete="off" maxlength="600" enterkeyhint="send" />
    <span class="mic"><MicButton surface="alef" size={24} label="Hold to talk to Alef" /></span>
    <button type="button" class="x" onclick={onclose} aria-label="Close" title="Close (Esc)"><Icon name="x" size={12} stroke={2.4} /></button>
  </form>
</div>

<style>
  .talk {
    position: absolute;
    inset: 0;
    pointer-events: none;
    font-family: var(--font-ui);
  }
  .bar {
    position: absolute;
    left: 50%;
    bottom: 9%;
    translate: -50% 0;
    width: min(86%, 300px);
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 4px 3px 12px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--face) 96%, transparent);
    color: var(--ink);
    box-shadow:
      0 6px 20px rgb(0 0 0 / 0.22),
      0 0 0 1px color-mix(in srgb, var(--ink) 12%, transparent);
    pointer-events: auto;
    cursor: auto;
  }
  input {
    flex: 1;
    min-width: 0;
    height: 26px;
    border: 0;
    background: transparent;
    color: inherit;
    font-size: 12.5px;
    outline: none;
  }
  input::placeholder {
    color: color-mix(in srgb, var(--ink) 50%, transparent);
  }
  .mic {
    flex: none;
    display: inline-grid;
  }
  .x {
    flex: none;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    color: color-mix(in srgb, var(--ink) 60%, transparent);
  }
  .x:hover {
    background: color-mix(in srgb, var(--ink) 10%, transparent);
    color: var(--ink);
  }
  .reply {
    position: absolute;
    left: 50%;
    top: 8%;
    translate: -50% 0;
    width: max-content;
    max-width: min(86%, 300px);
    max-height: 40%;
    overflow-y: auto;
    padding: 8px 12px;
    border-radius: 14px;
    background: color-mix(in srgb, var(--face) 97%, transparent);
    color: var(--ink);
    box-shadow:
      0 6px 20px rgb(0 0 0 / 0.22),
      0 0 0 1px color-mix(in srgb, var(--ink) 12%, transparent);
    font-size: 12.5px;
    line-height: 1.4;
    pointer-events: auto;
    cursor: auto;
    transform-origin: 50% 100%;
    overflow-wrap: anywhere;
  }
  .dots {
    display: inline-flex;
    gap: 4px;
    padding: 3px 0;
  }
  .dots i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
    opacity: 0.4;
    animation: dot 1.1s ease-in-out infinite;
  }
  .dots i:nth-child(2) {
    animation-delay: 0.15s;
  }
  .dots i:nth-child(3) {
    animation-delay: 0.3s;
  }
  @keyframes dot {
    40% {
      opacity: 1;
      transform: translateY(-3px);
    }
  }
</style>
