<script lang="ts">
  // The alarm, ringing: a calm card over a soft veil that is hard to miss. The block's icon
  // rocks in its colour with ripples around it (they loop only while it rings, and not at all
  // in Calm), the time is large, and Stop and Snooze are big. Esc or Space stops, S snoozes;
  // "Start now" stops it and starts the block. When it is not ringing, a small card at the foot
  // of the rail says when a snooze rings again, or that an unanswered alarm rang.
  import { backOut, cubicOut } from 'svelte/easing';
  import { fade, fly } from 'svelte/transition';
  import { alarms } from '../lib/alarms.svelte';
  import { categoryColor, onColor } from '../lib/engine/categories';
  import { formatTime } from '../lib/engine/time';
  import Icon from '../lib/Icon.svelte';
  import { clock } from '../lib/stores/clock.svelte';
  import { settings } from '../lib/stores/settings.svelte';
  import { view } from '../lib/stores/view.svelte';

  const r = $derived(alarms.ringing);
  const rm = $derived(view.reducedMotion);
  const colorOf = (c: Parameters<typeof categoryColor>[0]) => categoryColor(c, view.dark);
  const color = $derived(r ? colorOf(r.category) : '');
  const fg = $derived(color ? onColor(color) : '');
  const at = (ms: number) => formatTime(ms, view.hour12);
  // "7:05am" → the digits large, "am" small beside them.
  const time = $derived.by(() => {
    const s = at(clock.now);
    const m = /^(.*?)(am|pm)$/.exec(s);
    return m ? { hm: m[1], ap: m[2] } : { hm: s, ap: '' };
  });
  const parked = $derived(alarms.snoozed.length ? alarms.snoozed.reduce((a, b) => (b.at < a.at ? b : a)) : null);
  const note = $derived(alarms.note);

  // The card arrives with a little spring; it leaves quickly.
  function rise(_n: Element) {
    return { duration: rm ? 0 : 520, easing: backOut, css: (t: number, u: number) => `opacity: ${Math.min(1, t * 1.6)}; transform: translateY(${u * 18}px) scale(${0.9 + 0.1 * t})` };
  }
  function sink(_n: Element) {
    return { duration: rm ? 0 : 200, easing: cubicOut, css: (t: number, u: number) => `opacity: ${t}; transform: scale(${1 - u * 0.04})` };
  }

  // Stop has the focus, so Enter stops too.
  let stopEl = $state<HTMLButtonElement>();
  $effect(() => {
    if (r && stopEl) stopEl.focus({ preventScroll: true });
  });

  // While it rings these keys belong to the alarm, ahead of the planner's own shortcuts.
  $effect(() => {
    if (!r) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k !== 'escape' && k !== ' ' && k !== 's') return;
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat) return;
      if (k === 's') alarms.snooze();
      else alarms.stop();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  // The small card stacks with the other cards at the foot of the rail.
  let dockH = $state(0);
  $effect(() => {
    view.setDock('alarm', !r && (parked || note) && dockH ? dockH : 0);
    return () => view.setDock('alarm', 0);
  });
</script>

{#if r}
  <div class="veil" transition:fade={{ duration: rm ? 0 : 320 }} aria-hidden="true"></div>
  <div class="stage">
    {#key r.since}
      <div
        class="ring"
        class:calm={rm}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="alarm-title"
        aria-describedby="alarm-meta"
        style:--c={color}
        style:--fg={fg}
        in:rise
        out:sink
      >
        <div class="bell" aria-hidden="true">
          {#if !rm}
            <span class="ripple"></span>
            <span class="ripple two"></span>
            <span class="ripple three"></span>
          {/if}
          <span class="tile"><Icon name={r.icon} size={32} stroke={2} /></span>
          <span class="badge"><Icon name="bell-ring" size={13} stroke={2.4} /></span>
        </div>
        <p class="clock tnum" aria-label={`It's ${at(clock.now)}`}>{time.hm}{#if time.ap}<small>{time.ap}</small>{/if}</p>
        <h2 id="alarm-title" class="title">{r.title || 'Your alarm'}</h2>
        <p id="alarm-meta" class="meta tnum">
          {r.snoozes ? `Snoozed ${r.snoozes === 1 ? 'once' : `${r.snoozes} times`}` : 'Alarm'} · {at(r.startMs)}–{at(r.endMs)}
        </p>
        <div class="acts">
          <button bind:this={stopEl} class="btn btn-primary big" onclick={() => alarms.stop()}><Icon name="alarm-off" size={18} stroke={2.1} /> Stop</button>
          <button class="btn btn-soft big" onclick={() => alarms.snooze()}><Icon name="moon" size={17} stroke={2.1} /> Snooze {settings.value.alarm.snooze} min</button>
        </div>
        <button class="btn btn-quiet start" onclick={() => alarms.startNow()}><Icon name="play" size={14} stroke={2.2} /> Start now</button>
        <p class="keys"><kbd>Esc</kbd> or <kbd>Space</kbd> stops · <kbd>S</kbd> snoozes</p>
      </div>
    {/key}
  </div>
{:else if parked || note}
  <div class="dock" bind:clientHeight={dockH} style:bottom={`${16 + view.dockBelow('alarm')}px`} in:fly={{ y: 16, duration: rm ? 0 : 320, easing: cubicOut }} out:fade={{ duration: rm ? 0 : 180 }}>
    {#if parked}
      <div class="mini" style:--c={colorOf(parked.category)} role="status">
        <span class="ico"><Icon name="moon" size={15} stroke={2.1} /></span>
        <p class="txt">
          <span class="big">Snoozed · {parked.title || 'your alarm'}</span>
          <span class="small tnum">Rings again at {at(parked.at)}</span>
        </p>
        <button class="btn btn-quiet slim" onclick={() => alarms.cancelSnooze(parked.key)} title="Don't ring again"><Icon name="alarm-off" size={14} /> Turn off</button>
      </div>
    {/if}
    {#if note}
      <div class="mini" style:--c={colorOf(note.category)} role="status">
        <span class="ico"><Icon name="alarm-check" size={15} stroke={2.1} /></span>
        <p class="txt">
          <span class="big">Your alarm for {note.title || 'a block'} rang at <span class="tnum">{at(note.rangAt)}</span></span>
          <span class="small">It went quiet by itself.</span>
        </p>
        <div class="row-acts">
          <button class="btn btn-soft slim" onclick={() => alarms.startNow()}><Icon name="play" size={13} stroke={2.2} /> Start now</button>
          <button class="btn btn-quiet slim" onclick={() => alarms.dismissNote()}>OK</button>
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  /* --- ringing --------------------------------------------------------------- */
  .veil {
    position: fixed;
    inset: 0;
    z-index: 94;
    background: color-mix(in srgb, var(--ground) 74%, transparent);
  }
  .stage {
    position: fixed;
    inset: 0;
    z-index: 95;
    display: grid;
    place-items: center;
    padding: 16px;
    pointer-events: none;
  }
  .ring {
    pointer-events: auto;
    position: relative;
    display: grid;
    justify-items: center;
    width: min(380px, 100%);
    padding: 34px 24px 18px;
    border-radius: var(--r-lg);
    border: 1px solid var(--line);
    background: linear-gradient(180deg, color-mix(in srgb, var(--c) 13%, var(--raised)) 0, var(--raised) 58%);
    box-shadow: var(--shadow-3);
    text-align: center;
    will-change: transform, opacity;
  }

  .bell {
    position: relative;
    display: grid;
    place-items: center;
    width: 76px;
    height: 76px;
    margin-bottom: 18px;
  }
  .tile {
    position: relative;
    z-index: 1;
    display: grid;
    place-items: center;
    width: 76px;
    height: 76px;
    border-radius: 25px;
    background: var(--c);
    color: var(--fg);
    box-shadow: 0 10px 26px -10px color-mix(in srgb, var(--c) 80%, transparent);
    transform-origin: 50% 18%;
    animation: rock 1.9s var(--ease-out) infinite;
  }
  /* Rocks like a bell being rung, then rests a moment. */
  @keyframes rock {
    0%,
    48%,
    100% {
      transform: rotate(0);
    }
    6% {
      transform: rotate(-13deg);
    }
    14% {
      transform: rotate(11deg);
    }
    22% {
      transform: rotate(-8deg);
    }
    30% {
      transform: rotate(5deg);
    }
    38% {
      transform: rotate(-2deg);
    }
  }
  .badge {
    position: absolute;
    z-index: 2;
    top: -6px;
    right: -8px;
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: var(--ink);
    color: var(--ink-inverse);
    box-shadow: 0 0 0 3px var(--raised);
  }
  .ripple {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: color-mix(in srgb, var(--c) 34%, transparent);
    opacity: 0;
    animation: ripple 2.7s cubic-bezier(0.2, 0.6, 0.3, 1) infinite;
    will-change: transform, opacity;
  }
  .ripple.two {
    animation-delay: 0.9s;
  }
  .ripple.three {
    animation-delay: 1.8s;
  }
  @keyframes ripple {
    0% {
      transform: scale(0.75);
      opacity: 0.55;
    }
    100% {
      transform: scale(2.3);
      opacity: 0;
    }
  }
  .calm .tile {
    animation: none;
  }
  .calm .bell::before {
    content: '';
    position: absolute;
    inset: -10px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--c) 20%, transparent);
  }

  .clock {
    margin: 0;
    font-family: var(--font-ui);
    font-size: 58px;
    font-weight: 300;
    line-height: 1;
    letter-spacing: -0.035em;
    color: var(--ink);
  }
  .clock small {
    margin-left: 4px;
    font-size: 20px;
    font-weight: 400;
    letter-spacing: 0;
    color: var(--ink-2);
  }
  .title {
    margin: 12px 0 0;
    max-width: 100%;
    font-family: var(--font-read);
    font-size: var(--t-xl);
    font-weight: 500;
    line-height: 1.25;
    letter-spacing: -0.01em;
    overflow-wrap: anywhere;
  }
  .meta {
    margin: 4px 0 0;
    font-size: var(--t-sm);
    color: var(--ink-3);
  }
  .acts {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    width: 100%;
    margin-top: 24px;
  }
  .btn.big {
    height: 50px;
    font-size: var(--t-md);
    gap: 8px;
  }
  .start {
    margin-top: 8px;
    gap: 6px;
  }
  .keys {
    margin: 6px 0 0;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  kbd {
    font-family: var(--font-ui);
    font-size: 10.5px;
    padding: 1px 5px;
    margin: 0 1px;
    border-radius: 5px;
    border: 1px solid var(--line-strong);
  }

  /* --- the small card at the foot of the rail ---------------------------------- */
  .dock {
    position: fixed;
    right: 16px;
    bottom: calc(16px + var(--safe-bottom));
    z-index: 61;
    display: grid;
    gap: 8px;
    width: min(360px, calc(100vw - 32px));
    transition: bottom var(--dur-3) var(--ease-out);
  }
  .mini {
    position: relative;
    display: grid;
    grid-template-columns: 32px minmax(0, 1fr) auto;
    align-items: center;
    gap: 4px 10px;
    padding: 10px 10px 10px 12px;
    border-radius: var(--r-lg);
    border: 1px solid var(--line);
    background: var(--raised);
    box-shadow: var(--shadow-3);
  }
  .ico {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--c) 18%, transparent);
    color: var(--c);
  }
  .txt {
    display: grid;
    gap: 1px;
    margin: 0;
    min-width: 0;
  }
  .big {
    font-size: var(--t-sm);
    font-weight: 500;
    line-height: 1.35;
  }
  .small {
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .row-acts {
    grid-column: 2 / -1;
    display: flex;
    gap: 6px;
  }
  .btn.slim {
    height: 30px;
    padding: 0 10px;
    gap: 5px;
  }
  @media (prefers-reduced-motion: reduce) {
    .tile,
    .ripple {
      animation: none;
    }
  }
</style>
