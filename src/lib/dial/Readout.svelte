<script lang="ts">
  import type { NowState } from '../engine/blocks';
  import { formatClockCountdown, formatDayShort, formatDuration, formatTime, MINUTE } from '../engine/time';
  import type { ISODate } from '../engine/types';
  import Icon from '../Icon.svelte';
  import Rolling from './Rolling.svelte';
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';

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
    /** ms since the breathing guide started, or null. */
    breath?: number | null;
    onbreathe?: (on: boolean) => void;
  } = $props();

  const breathPhase = $derived.by(() => {
    if (breath == null) return null;
    const t = breath % 16_000;
    const cycle = Math.floor(breath / 16_000) + 1;
    const phase = t < 4000 ? 'Breathe in' : t < 8000 ? 'Hold' : t < 14_000 ? 'Breathe out' : 'Rest';
    return { phase, cycle };
  });

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
        sub: state.next ? `then ${state.next.title}` : 'last one today',
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

<div class="readout" class:compact data-tone={breathPhase ? 'breath' : view.tone} aria-live="polite">
  {#if breathPhase}
    <div class="breath-phase">{breathPhase.phase}</div>
    <div class="sub">{breathPhase.cycle} of 4</div>
    {#if onbreathe && !compact}
      <div class="controls"><button class="pill" onclick={() => onbreathe(false)}>Stop</button></div>
    {/if}
  {:else}
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
  .breath-phase {
    font-size: clamp(18px, 7cqi, 40px);
    font-weight: 300;
    letter-spacing: -0.02em;
    line-height: 1.1;
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
