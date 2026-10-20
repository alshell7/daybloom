<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { NowState } from '../engine/blocks';
  import { formatClockCountdown, formatDayShort, formatDuration, formatTime, MINUTE } from '../engine/time';
  import type { ISODate } from '../engine/types';
  import Icon from '../Icon.svelte';
  import Rolling from './Rolling.svelte';
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { ROUNDS, type BreathState } from '../breath.svelte';

  let {
    state,
    now,
    date,
    isToday,
    hour12,
    tally,
    timer = null,
    compact = false,
    reduced = false,
    ontimer,
    breath = null,
    onbreathe,
    face,
  }: {
    state: NowState;
    now: number;
    date: ISODate;
    isToday: boolean;
    hour12: boolean;
    tally: { done: number; total: number };
    timer?: null | { label: string; remainingMs: number; paused: boolean; index: number; count: number; kind: 'countdown' | 'cycles'; segment: 'focus' | 'break' };
    compact?: boolean;
    reduced?: boolean;
    ontimer?: (action: 'pause' | 'resume' | 'stop' | 'skip') => void;
    /** Where the breathing minute is, or null. */
    breath?: BreathState | null;
    onbreathe?: (on: boolean) => void;
    /** A face in place of the big number (Alef), which shows the number on its screen. */
    face?: Snippet<[{ big: string; tone: string }]>;
  } = $props();

  const breathPhase = $derived(breath ?? null);

  const view = $derived.by(() => {
    if (timer) {
      return {
        big: formatClockCountdown(timer.remainingMs),
        title: timer.label,
        sub:
          timer.kind === 'cycles'
            ? `${timer.segment === 'break' ? 'Breathe' : 'Round'} ${Math.floor(timer.index / 2) + 1} of ${timer.count}`
            : timer.paused
              ? 'Paused'
              : `ends ${formatTime(now + timer.remainingMs, hour12)}`,
        icon: timer.segment === 'break' ? 'coffee' : 'target',
        tone: 'timer' as const,
      };
    }
    if (!isToday) {
      const d = formatDayShort(date);
      return {
        big: `${d.dow} ${d.day}`,
        title: tally.total ? `${tally.total} ${tally.total === 1 ? 'block' : 'blocks'} planned` : 'Nothing planned yet',
        sub: tally.total ? '' : 'Sweep the ring to add one',
        icon: null,
        tone: 'day' as const,
      };
    }
    // The last five minutes count down in seconds: the urgency is felt, not computed.
    const fine = state.remainingMs < (state.current ? 5 * MINUTE : MINUTE);
    if (state.current) {
      return {
        big: fine ? formatClockCountdown(state.remainingMs) : formatDuration(state.remainingMs),
        title: state.current.title,
        sub: state.alongside?.length
          ? `also now: ${state.alongside[0].title}${state.alongside.length > 1 ? ` +${state.alongside.length - 1}` : ''}`
          : state.next
            ? `then ${state.next.title}`
            : 'last one today',
        icon: state.current.icon,
        tone: 'now' as const,
      };
    }
    if (state.next) {
      return {
        big: fine ? formatClockCountdown(state.remainingMs) : formatDuration(state.remainingMs),
        title: 'Free time',
        sub: `until ${state.next.title}`,
        icon: null,
        tone: 'free' as const,
      };
    }
    return {
      big: formatTime(now, hour12),
      title: tally.total && tally.done === tally.total ? "That's the day" : 'Nothing else planned',
      sub: tally.total ? `${tally.done} of ${tally.total} done` : '',
      icon: null,
      tone: 'rest' as const,
    };
  });
</script>

<div class="readout" class:compact class:with-face={!!face} data-tone={breathPhase ? 'breath' : view.tone} aria-live="polite">
  {#if breathPhase}
    <div class="breath-words">
      {#key `${breathPhase.round}:${breathPhase.id}`}
        <div class="breath-phase" in:fly={{ y: reduced ? 0 : 6, duration: reduced ? 0 : 700, easing: cubicOut }} out:fly={{ y: reduced ? 0 : -6, duration: reduced ? 0 : 400 }}>{breathPhase.word}</div>
      {/key}
    </div>
    <div class="sub breath-sub">
      <span class="rounds" role="img" aria-label={`Round ${breathPhase.round} of ${ROUNDS}`}>
        {#each Array(ROUNDS) as _, i (i)}<i class:on={i < breathPhase.round} class:now={i === breathPhase.round - 1}></i>{/each}
      </span>
      <span class="secs tnum" aria-hidden="true">{breathPhase.id === 'rest' ? '' : breathPhase.secondsLeft}</span>
    </div>
    {#if onbreathe && !compact}
      <div class="controls"><button class="pill" onclick={() => onbreathe(false)}>Stop</button></div>
    {/if}
  {:else}
  {#if view.tone !== 'rest' && view.tone !== 'day'}
    <!-- the wall clock, always readable at a glance; the big number is time left -->
    <div class="clock tnum" aria-label={`It's ${formatTime(now, hour12)}`}><Rolling text={formatTime(now, hour12)} {reduced} /></div>
  {/if}
  {#if face}
    <div class="face">{@render face({ big: view.big, tone: view.tone })}</div>
  {/if}
  <div class="big tnum"><Rolling text={view.big} {reduced} /></div>
  {#key view.title}
    <div class="title" in:fly={{ y: 8, duration: reduced ? 0 : 360, easing: cubicOut }}>
      {#if view.icon && !compact}<Icon name={view.icon} size={16} stroke={2} />{/if}
      <span>{view.title}</span>
    </div>
  {/key}
  {#if view.sub && !compact}
    <div class="sub">{view.sub}</div>
  {/if}
  {#if timer && ontimer && !compact}
    <div class="controls">
      {#if timer.paused}
        <button class="icon-btn" onclick={() => ontimer('resume')} aria-label="Resume"><Icon name="play" size={16} /></button>
      {:else}
        <button class="icon-btn" onclick={() => ontimer('pause')} aria-label="Pause"><Icon name="pause" size={16} /></button>
      {/if}
      {#if timer.kind === 'cycles'}
        <button class="icon-btn" onclick={() => ontimer('skip')} aria-label="Skip to next"><Icon name="skip" size={16} /></button>
      {/if}
      <button class="icon-btn" onclick={() => ontimer('stop')} aria-label="Stop timer"><Icon name="x" size={16} /></button>
    </div>
  {/if}
  {#if onbreathe && !compact && !timer && (view.tone === 'free' || view.tone === 'rest')}
    <div class="controls"><button class="pill" onclick={() => onbreathe(true)}><Icon name="wind" size={13} /> Breathe · 1 min</button></div>
  {:else if onbreathe && !compact && !timer && view.tone === 'now'}
    <div class="controls"><button class="pill quiet" onclick={() => onbreathe(true)} title="A one-minute breathing pause" aria-label="Breathe for one minute"><Icon name="wind" size={13} /></button></div>
  {/if}
  {/if}
</div>

<style>
  .readout {
    display: grid;
    justify-items: center;
    gap: 2px;
    max-width: 100%;
    font-family: var(--font-ui);
  }
  .clock {
    margin-bottom: clamp(2px, 1cqi, 8px);
    padding: 2px 10px;
    border-radius: 999px;
    background: color-mix(in srgb, currentColor 7%, transparent);
    font-size: clamp(11px, 3.6cqi, 21px);
    font-weight: 500;
    letter-spacing: 0.01em;
    opacity: 0.85;
  }
  /* On Alef's glass screen: light on dark, the countdown lit in the eyes' colour. */
  .with-face {
    color: var(--screen-ink, #e6eef7);
    gap: 0;
  }
  .face {
    width: 31cqi;
    margin: 0 0 0.4cqi;
  }
  .compact .face {
    width: 30cqi;
    margin: 0 0 0.2cqi;
  }
  .with-face .clock {
    background: var(--screen-chip, rgba(255, 255, 255, 0.07));
    color: var(--screen-ink2, rgba(230, 238, 247, 0.72));
    margin-bottom: 1.2cqi;
    font-size: clamp(10px, 2.5cqi, 15px);
  }
  .with-face .big {
    font-size: clamp(16px, 6.6cqi, 40px);
    font-weight: 500;
    letter-spacing: -0.02em;
    color: var(--alef-eye, #5ce1e6);
    text-shadow: 0 0 1.6cqi color-mix(in srgb, var(--alef-eye, #5ce1e6) var(--eye-glow, 45%), transparent);
    opacity: 1;
  }
  .with-face .title {
    margin-top: 0.8cqi;
    font-size: clamp(10px, 2.5cqi, 15px);
    color: var(--screen-ink, #eef4fb);
  }
  .with-face .title span {
    max-width: 30cqi;
  }
  .with-face .sub {
    font-size: clamp(9px, 2cqi, 12px);
    color: var(--screen-ink2, rgba(220, 230, 242, 0.6));
    opacity: 1;
    max-width: 30cqi;
  }
  .with-face .pill {
    background: var(--screen-chip, rgba(255, 255, 255, 0.09));
    color: var(--screen-ink, #e6eef7);
  }
  .with-face .pill:hover {
    background: color-mix(in srgb, var(--screen-chip, rgba(255, 255, 255, 0.09)) 70%, var(--screen-ink, white) 12%);
  }
  .with-face .controls {
    margin-top: 1cqi;
  }
  .compact.with-face .clock {
    font-size: 4.2cqi;
    padding: 0.2cqi 2cqi;
    margin-bottom: 0.8cqi;
  }
  .compact.with-face .big {
    font-size: 9cqi;
  }
  .compact.with-face .title {
    font-size: 4.6cqi;
    margin-top: 0.4cqi;
  }
  .compact.with-face .title span {
    max-width: 34cqi;
  }
  .compact .clock {
    font-size: 6cqi;
    padding: 0.4cqi 2.4cqi;
    margin-bottom: 1cqi;
  }
  .big {
    font-size: clamp(22px, 13cqi, 76px);
    font-weight: 300;
    line-height: 1;
    letter-spacing: -0.035em;
  }
  .compact .big {
    font-size: 17cqi;
    font-weight: 400;
  }
  [data-tone='free'] .big,
  [data-tone='rest'] .big {
    opacity: 0.86;
  }
  .title {
    display: flex;
    align-items: center;
    gap: 6px;
    max-width: 100%;
    margin-top: clamp(4px, 1.2cqi, 10px);
    font-size: clamp(11px, 2.9cqi, 17px);
    font-weight: 500;
  }
  .compact .title {
    font-size: 6.4cqi;
    margin-top: 1cqi;
  }
  .title span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 30cqi;
  }
  .compact .title span {
    max-width: 44cqi;
  }
  .sub {
    font-size: clamp(10px, 2.3cqi, 14px);
    opacity: 0.66;
    max-width: 32cqi;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .breath-words {
    display: grid;
  }
  .breath-phase {
    grid-area: 1 / 1;
    font-size: clamp(18px, 7cqi, 40px);
    font-weight: 300;
    letter-spacing: -0.02em;
    line-height: 1.1;
  }
  .breath-sub {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
  }
  .rounds {
    display: inline-flex;
    gap: 5px;
  }
  .rounds i {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: currentColor;
    opacity: 0.25;
    transition: opacity var(--dur-3) var(--ease-out), transform var(--dur-3) var(--ease-settle);
  }
  .rounds i.on {
    opacity: 0.7;
  }
  .rounds i.now {
    transform: scale(1.3);
  }
  .secs {
    min-width: 1ch;
  }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 12px;
    border-radius: 999px;
    font-size: clamp(10px, 2.2cqi, 13px);
    background: color-mix(in srgb, currentColor 9%, transparent);
    transition: background var(--dur-1) var(--ease-out);
  }
  .pill.quiet {
    width: 28px;
    padding: 0;
    justify-content: center;
    opacity: 0.7;
  }
  .pill:hover {
    background: color-mix(in srgb, currentColor 16%, transparent);
  }
  .controls {
    display: flex;
    gap: 2px;
    margin-top: 6px;
  }
  .controls .icon-btn {
    width: 30px;
    height: 30px;
    color: inherit;
  }
  .controls .icon-btn:hover {
    background: color-mix(in srgb, currentColor 10%, transparent);
    color: inherit;
  }
</style>
