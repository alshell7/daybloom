<script lang="ts">
  // The voice capsule: rises from the foot of the rail (where toasts live, never over the
  // dial). Your words appear as Whistle hears them, settle when you stop, and the assistant's
  // card opens above the capsule. Enter sends now, Esc lets it go.
  import { cubicOut } from 'svelte/easing';
  import { fade, fly } from 'svelte/transition';
  import { session } from '../../lib/assistant/session.svelte';
  import Icon from '../../lib/Icon.svelte';
  import { platform } from '../../lib/platform';
  import { view } from '../../lib/stores/view.svelte';
  import { micAdvice, micSettingsUrl, voice } from '../../lib/voice/voice.svelte';
  import Card from '../assistant/Card.svelte';
  import VoiceRing from './VoiceRing.svelte';

  // The capsule is the V key's surface. The mics in Quick add and Ask show their words in their
  // own field, but anything that needs you (download Whistle, no microphone, an error) shows here
  // for them too, so a mic never just does nothing.
  const shown = $derived(voice.active && (voice.surface === 'overlay' || voice.phase === 'needs-model' || voice.phase === 'downloading' || voice.phase === 'error'));
  const reduced = $derived(view.reducedMotion);

  const HINTS = ['“What’s next?”', '“Add gym at 5 for 45 minutes”', '“Move lunch to 2”', '“Start a 25 minute focus”', '“Plan my day”'];
  let hint = $state(0);
  $effect(() => {
    if (!voice.listening || voice.words.length) return;
    const t = setInterval(() => (hint = (hint + 1) % HINTS.length), 2600);
    return () => clearInterval(t);
  });

  // A choice made on the card shows its own answer here too.
  const answer = $derived.by(() => {
    if (voice.phase !== 'result' || !voice.entry) return null;
    const i = session.entries.findIndex((e) => e.id === voice.entry!.id);
    const later = i >= 0 ? session.entries.slice(i).filter((e) => !e.pending && e.result) : [];
    return later.at(-1) ?? voice.entry;
  });

  const ringMode = $derived.by(() => {
    switch (voice.phase) {
      case 'listening':
        return 'listening';
      case 'opening':
        return 'opening';
      case 'finishing':
      case 'thinking':
        return 'thinking';
      case 'downloading':
        return 'progress';
      case 'result':
        return 'done';
      case 'error':
        return 'error';
      default:
        return 'idle';
    }
  });

  // A block answer settles the ring into that block's category colour.
  const blockColor = $derived.by(() => {
    const c = answer?.result?.card;
    if (!c || c.kind !== 'block') return undefined;
    return [...view.dayBlocks, ...view.todayBlocks].find((b) => b.key === c.key)?.color;
  });

  const clockText = $derived.by(() => {
    const s = Math.floor(voice.seconds);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  });

  const status = $derived.by(() => {
    switch (voice.phase) {
      case 'needs-model':
        return 'Talk to Daybloom';
      case 'downloading':
        return `Getting Whistle · ${Math.round(voice.progress * 100)}%`;
      case 'opening':
        return 'Waiting for the microphone…';
      case 'listening':
        if (voice.warming) return 'Listening · warming up';
        return voice.handsFree ? 'Listening · pause to send' : 'Listening · let go to send';
      case 'finishing':
        return 'Reading it back…';
      case 'thinking':
        return 'Understanding…';
      case 'result':
        return 'Done';
      case 'error':
        return voice.problem ? 'Microphone' : 'Voice';
      default:
        return '';
    }
  });

  /** A word rises out of a soft blur. */
  function rise(node: Element) {
    return {
      duration: reduced ? 0 : 380,
      easing: cubicOut,
      css: (t: number) => `opacity:${t};transform:translateY(${(1 - t) * 7}px);filter:blur(${(1 - t) * 5}px)`,
    };
  }
</script>

{#if shown}
  <div class="dock" class:beside={!!view.sheet && view.sheet.kind !== 'assistant'} role="region" aria-label="Voice">
    {#if answer?.result}
      <div
        class="answer"
        role="status"
        onpointerenter={() => voice.hold()}
        onpointerleave={() => voice.letGo()}
        in:fly={{ y: 14, duration: reduced ? 0 : 320, easing: cubicOut }}
        out:fade={{ duration: reduced ? 0 : 160 }}
      >
        <p class="heard"><Icon name="mic" size={12} stroke={2.2} /> <span>{answer.query}</span></p>
        <Card entry={answer} />
      </div>
    {/if}

    <div
      class="capsule"
      role="group"
      aria-label="Listening"
      class:wide={voice.phase === 'needs-model' || voice.phase === 'error'}
      onpointerenter={() => voice.hold()}
      onpointerleave={() => voice.letGo()}
      in:fly={{ y: 22, duration: reduced ? 0 : 420, easing: cubicOut, opacity: 0 }}
      out:fly={{ y: 12, duration: reduced ? 0 : 200, easing: cubicOut, opacity: 0 }}
    >
      <VoiceRing
        size={54}
        mode={ringMode}
        ring={voice.ring}
        level={voice.level}
        progress={voice.progress}
        speaking={voice.speaking}
        color={blockColor ?? 'var(--ink-inverse)'}
        icon={voice.phase === 'error' && voice.problem ? 'mic-off' : voice.phase === 'result' ? 'check' : 'mic'}
        {reduced}
      />

      <div class="body">
        <p class="status tnum">
          <span>{status}</span>
          {#if voice.phase === 'listening'}
            <span class="dot" class:on={voice.speaking}></span>
            <span class="time">{clockText}</span>
            {#if voice.language}<span class="lang">{voice.language.toUpperCase()}</span>{/if}
          {/if}
        </p>

        {#if voice.phase === 'needs-model'}
          <p class="say">Whistle turns your voice into text on this computer. It downloads once (17 MB) and works offline.</p>
          <div class="acts">
            <button class="btn-light" onclick={() => voice.download()}><Icon name="arrow-right" size={14} stroke={2.2} /> Get Whistle</button>
            <button class="btn-ghost" onclick={() => voice.cancel()}>Not now</button>
          </div>
        {:else if voice.phase === 'downloading'}
          <p class="say">Verifying every byte. Listening starts by itself.</p>
        {:else if voice.phase === 'error'}
          <p class="say">{voice.error}</p>
          {#if voice.problem}<p class="say quiet">{micAdvice(voice.problem, platform.os)}</p>{/if}
          <div class="acts">
            {#if voice.problem === 'denied' && micSettingsUrl(platform.os)}
              <button class="btn-light" onclick={() => void platform.openExternal(micSettingsUrl(platform.os)!).catch(() => {})}><Icon name="settings" size={14} stroke={2.2} /> Open microphone settings</button>
              <button class="btn-ghost" onclick={() => voice.start('overlay', { handsFree: true })}>Try again</button>
            {:else}
              <button class="btn-light" onclick={() => voice.start('overlay', { handsFree: true })}>Try again</button>
            {/if}
            <button class="btn-ghost" onclick={() => voice.cancel()}>Close</button>
          </div>
        {:else}
          <p class="words" aria-live="polite">
            {#if voice.final && voice.phase !== 'listening'}
              <span class="w" in:rise>{voice.final}</span>
            {:else if voice.words.length || voice.pending}
              {#each voice.words as w (w.id)}<span class="w" in:rise>{w.text}</span>{' '}{/each}
              {#if voice.pending}<span class="pending">{voice.pending}</span>{/if}
            {:else if voice.listening}
              {#key hint}<span class="hint" in:fade={{ duration: reduced ? 0 : 400 }}>Try {HINTS[hint]}</span>{/key}
            {/if}
          </p>
        {/if}
      </div>

      {#if voice.phase === 'listening' || voice.phase === 'opening'}
        <div class="ctl">
          <button class="round go" onclick={() => voice.stop()} aria-label="Send now (Enter)" title="Send now · Enter"><Icon name="arrow-right" size={16} stroke={2.3} /></button>
          <button class="round" onclick={() => voice.cancel()} aria-label="Cancel (Esc)" title="Cancel · Esc"><Icon name="x" size={15} stroke={2.2} /></button>
        </div>
      {:else if voice.phase === 'result'}
        <div class="ctl">
          <button class="round" onclick={() => voice.start('overlay', { handsFree: true })} aria-label="Talk again" title="Talk again · V"><Icon name="mic" size={15} stroke={2.2} /></button>
          <button class="round" onclick={() => voice.cancel()} aria-label="Close" title="Close · Esc"><Icon name="x" size={15} stroke={2.2} /></button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .dock {
    position: fixed;
    right: 16px;
    bottom: 16px;
    z-index: 72;
    width: min(400px, calc(100vw - 32px));
    display: grid;
    gap: 10px;
    justify-items: end;
  }
  .dock.beside {
    right: 428px;
  }
  @media (max-width: 860px) {
    .dock,
    .dock.beside {
      left: 16px;
      right: 16px;
      width: auto;
      justify-items: stretch;
    }
  }
  .capsule {
    display: flex;
    align-items: center;
    gap: 14px;
    width: 100%;
    min-height: 74px;
    padding: 10px 12px 10px 10px;
    border-radius: 28px;
    background: var(--ink);
    color: var(--ink-inverse);
    box-shadow: var(--shadow-3);
  }
  .capsule.wide {
    align-items: flex-start;
    padding-top: 14px;
    padding-bottom: 14px;
    border-radius: 24px;
  }
  .body {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 3px;
  }
  .status {
    display: flex;
    align-items: center;
    gap: 7px;
    margin: 0;
    font-size: var(--t-xs);
    letter-spacing: 0.01em;
    color: color-mix(in srgb, var(--ink-inverse) 62%, transparent);
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--ink-inverse) 35%, transparent);
    transition:
      background 160ms ease,
      transform 160ms var(--ease-out);
  }
  .dot.on {
    background: var(--ink-inverse);
    transform: scale(1.25);
  }
  .lang {
    padding: 0 5px;
    border-radius: 4px;
    border: 1px solid color-mix(in srgb, var(--ink-inverse) 30%, transparent);
    font-size: 10px;
    line-height: 15px;
  }
  .words {
    margin: 0;
    min-height: 1.45em;
    max-height: 4.4em;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    font-family: var(--font-read);
    font-size: var(--t-md);
    line-height: 1.45;
    color: var(--ink-inverse);
  }
  .w {
    display: inline-block;
  }
  /* The tail Whistle is still deciding on breathes softly (opacity only: compositor-friendly). */
  .pending {
    color: var(--ink-inverse);
    opacity: 0.5;
    animation: deciding 1.1s ease-in-out infinite alternate;
  }
  @keyframes deciding {
    to {
      opacity: 0.85;
    }
  }
  :global([data-motion='calm']) .pending {
    animation: none;
  }
  .hint {
    color: color-mix(in srgb, var(--ink-inverse) 55%, transparent);
  }
  .say {
    margin: 2px 0 0;
    font-size: var(--t-sm);
    line-height: 1.45;
    color: var(--ink-inverse);
  }
  .say.quiet {
    color: color-mix(in srgb, var(--ink-inverse) 65%, transparent);
  }
  .acts {
    display: flex;
    gap: 8px;
    margin-top: 8px;
  }
  .btn-light,
  .btn-ghost {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    padding: 0 14px;
    border-radius: var(--r-pill);
    font-size: var(--t-sm);
    font-weight: 500;
    transition:
      background var(--dur-1) var(--ease-out),
      transform var(--dur-1) var(--ease-out);
  }
  .btn-light {
    background: var(--ink-inverse);
    color: var(--ink);
  }
  .btn-light:active {
    transform: scale(0.97);
  }
  .btn-ghost {
    color: var(--ink-inverse);
  }
  .btn-ghost:hover {
    background: color-mix(in srgb, var(--ink-inverse) 12%, transparent);
  }
  .ctl {
    display: flex;
    gap: 6px;
    align-self: center;
  }
  .round {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    color: var(--ink-inverse);
    background: color-mix(in srgb, var(--ink-inverse) 10%, transparent);
    transition:
      background var(--dur-1) var(--ease-out),
      transform var(--dur-1) var(--ease-out);
  }
  .round:hover {
    background: color-mix(in srgb, var(--ink-inverse) 20%, transparent);
  }
  .round:active {
    transform: scale(0.94);
  }
  .round.go {
    background: var(--ink-inverse);
    color: var(--ink);
  }
  .answer {
    width: 100%;
    max-height: min(56vh, 520px);
    overflow-y: auto;
    padding: 14px 16px 16px;
    border-radius: var(--r-lg);
    background: var(--raised);
    border: 1px solid var(--line);
    box-shadow: var(--shadow-3);
  }
  .heard {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0 0 8px;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .heard span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
