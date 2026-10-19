<script lang="ts">
  // In the top bar while a focus session runs but its full view is shrunk: a ring of the time
  // left, the name, the countdown. Tap (or F) brings the focus view back.
  import { cubicOut } from 'svelte/easing';
  import { scale } from 'svelte/transition';
  import Icon from '../../lib/Icon.svelte';
  import { shownTitle } from '../../lib/privacy';
  import { cueSubject } from '../../lib/screenCues.svelte';
  import { clock } from '../../lib/stores/clock.svelte';
  import { timer } from '../../lib/stores/timer.svelte';
  import { view } from '../../lib/stores/view.svelte';

  const s = $derived(timer.active && !view.focus ? cueSubject(clock.now) : null);
  const R = 9;
  const CIRC = 2 * Math.PI * R;

  // The first time a running session's view is shrunk, say where it went.
  let wasFocus = false;
  let told = false;
  $effect(() => {
    const f = view.focus;
    if (wasFocus && !f && timer.active && !told) {
      told = true;
      view.say('Your focus keeps running · tap its timer up here, or press F, to come back');
    }
    wasFocus = f;
  });

  function left(ms: number): string {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const sec = total % 60;
    if (h) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    return `${m}:${String(sec).padStart(2, '0')}`;
  }
</script>

{#if s && (s.kind === 'focus' || s.kind === 'break')}
  <button
    class="pill"
    class:paused={s.paused}
    style:--c={s.color}
    onclick={() => (view.focus = true)}
    title="Back to focus · F"
    aria-label={`Back to focus: ${shownTitle(s.title, 'focus')}, ${s.paused ? 'paused' : `${left(s.remainingMs)} left`}`}
    in:scale={{ start: 0.85, duration: view.reducedMotion ? 0 : 260, easing: cubicOut }}
  >
    <span class="ring" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <circle class="track" cx="12" cy="12" r={R} />
        <circle class="fill" cx="12" cy="12" r={R} stroke-dasharray={CIRC} stroke-dashoffset={CIRC * (1 - s.left)} />
      </svg>
      <Icon name={s.paused ? 'pause' : s.kind === 'break' ? 'coffee' : s.icon} size={10} stroke={2.4} />
    </span>
    <span class="name">{shownTitle(s.title, 'focus')}</span>
    <span class="time tnum">{s.paused ? 'Paused' : left(s.remainingMs)}</span>
    <span class="back" aria-hidden="true"><Icon name="maximize" size={12} stroke={2.2} /></span>
  </button>
{/if}

<style>
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    height: 30px;
    padding: 0 6px 0 4px;
    margin-right: 4px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--c) 12%, var(--raised));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c) 35%, transparent);
    color: var(--ink);
    transition:
      background var(--dur-1) var(--ease-out),
      transform var(--dur-1) var(--ease-out);
  }
  .pill:hover {
    background: color-mix(in srgb, var(--c) 20%, var(--raised));
  }
  .pill:active {
    transform: scale(0.97);
  }
  .ring {
    position: relative;
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    color: var(--c);
  }
  .ring svg {
    position: absolute;
    inset: 0;
    transform: rotate(-90deg);
  }
  .ring circle {
    fill: none;
    stroke-width: 2.6;
  }
  .track {
    stroke: color-mix(in srgb, var(--c) 22%, transparent);
  }
  .fill {
    stroke: var(--c);
    stroke-linecap: round;
    transition: stroke-dashoffset 0.9s var(--ease-out);
  }
  .name {
    max-width: 16ch;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--t-xs);
    font-weight: 500;
  }
  .time {
    font-size: var(--t-xs);
    font-weight: 600;
  }
  .paused .time {
    color: var(--ink-2);
    font-weight: 500;
  }
  .back {
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    color: var(--ink-2);
    background: color-mix(in srgb, var(--c) 14%, transparent);
  }
  /* A narrow bar keeps the ring and the time. */
  @container topbar (max-width: 820px) {
    .name,
    .back {
      display: none;
    }
  }
</style>
