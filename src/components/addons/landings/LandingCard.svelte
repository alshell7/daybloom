<script lang="ts">
  // The landing: a meeting just ended. A leaf drifts down and settles; three stepping stones
  // wait — one for the body, one small spark, and a two-minute first step into what's next.
  import { backOut, cubicOut } from 'svelte/easing';
  import { fade, fly, scale } from 'svelte/transition';
  import { landings } from '../../../lib/addons/landings/landings.svelte';
  import { formatDuration, formatTime, MINUTE } from '../../../lib/engine/time';
  import Icon from '../../../lib/Icon.svelte';
  import { shownTitle } from '../../../lib/privacy';
  import { clock } from '../../../lib/stores/clock.svelte';
  import { view } from '../../../lib/stores/view.svelte';

  const m = $derived(landings.moment);
  const rm = $derived(view.reducedMotion);
  let cardH = $state(0);
  $effect(() => {
    view.setDock('landing', m && cardH ? cardH : 0);
    return () => view.setDock('landing', 0);
  });

  const nextLine = $derived.by(() => {
    if (!m?.next) return 'Take a few minutes before you pick up what’s next.';
    const left = m.next.startMs - clock.now;
    const name = shownTitle(m.next.title, m.next.category);
    if (left <= MINUTE) return `${name} is starting. Begin it small:`;
    return `${name} at ${formatTime(m.next.startMs, view.hour12)} · ${formatDuration(Math.round(left / MINUTE) * MINUTE)} to land`;
  });
  const KIND = { body: 'For your body', spark: 'A small spark', step: 'First step in' } as const;
</script>

{#if m}
  <div class="landing" bind:clientHeight={cardH} style:bottom={`${16 + view.dockBelow('landing')}px`} role="dialog" aria-label={m.headline} in:fly={{ y: 22, duration: rm ? 0 : 540, easing: cubicOut }} out:fade={{ duration: rm ? 0 : 240 }}>
    <svg class="leaf" viewBox="0 0 48 48" aria-hidden="true">
      <g class="drift">
        <path d="M24 6c9 6 13 15 9 25-3 7-11 10-17 8C9 30 12 14 24 6z" class="blade" />
        <path d="M17 38c3-9 6-17 12-26" class="vein" />
      </g>
      <path d="M8 42h32" class="ground" />
    </svg>
    <div class="txt">
      <p class="big">{m.headline}</p>
      <p class="small tnum">{nextLine}</p>
    </div>
    <ul class="stones">
      {#each m.stones as s, i (s.id)}
        <li in:scale={{ start: 0.86, duration: rm ? 0 : 380, delay: rm ? 0 : 380 + i * 90, easing: backOut }}>
          <button onclick={() => landings.take(s)} class:step={s.kind === 'step'}>
            <span class="ic"><Icon name={s.icon} size={15} stroke={2.1} /></span>
            <span class="what"><small>{KIND[s.kind]}</small>{s.title}</span>
            <span class="mins tnum">{s.minutes}m</span>
          </button>
        </li>
      {/each}
    </ul>
    <div class="foot">
      <button class="btn btn-quiet sm" onclick={() => landings.skip()}>Not now</button>
    </div>
  </div>
{/if}

<style>
  .landing {
    --lav: #8670e6;
    position: fixed;
    right: 16px;
    bottom: 16px;
    z-index: 61;
    width: min(380px, calc(100vw - 32px));
    display: grid;
    grid-template-columns: 48px 1fr;
    gap: 10px 12px;
    padding: 14px 16px 10px;
    border-radius: var(--r-lg);
    background:
      radial-gradient(120% 120% at 90% 0%, color-mix(in srgb, var(--lav) 22%, transparent), transparent 60%),
      var(--raised);
    box-shadow: var(--shadow-3), inset 0 0 0 1px color-mix(in srgb, var(--lav) 22%, var(--line));
    transition: bottom var(--dur-3) var(--ease-out);
  }
  :global([data-theme='dark']) .landing {
    --lav: #b4a2ff;
  }
  .leaf {
    width: 44px;
    height: 44px;
    overflow: visible;
  }
  .drift {
    transform-origin: 24px 24px;
    animation: drift 2.6s cubic-bezier(0.33, 0.8, 0.3, 1) both;
  }
  @keyframes drift {
    0% {
      transform: translate(-6px, -26px) rotate(-28deg);
      opacity: 0;
    }
    30% {
      transform: translate(6px, -14px) rotate(18deg);
      opacity: 1;
    }
    60% {
      transform: translate(-3px, -5px) rotate(-8deg);
    }
    100% {
      transform: translate(0, 0) rotate(0deg);
    }
  }
  .blade {
    fill: color-mix(in srgb, var(--lav) 30%, transparent);
    stroke: var(--lav);
    stroke-width: 2;
    stroke-linejoin: round;
  }
  .vein {
    fill: none;
    stroke: var(--lav);
    stroke-width: 1.6;
    stroke-linecap: round;
  }
  .ground {
    stroke: color-mix(in srgb, var(--lav) 40%, transparent);
    stroke-width: 2;
    stroke-linecap: round;
  }
  .big {
    margin: 0;
    font-size: var(--t-md);
    font-weight: 500;
  }
  .small {
    margin: 3px 0 0;
    font-size: var(--t-xs);
    color: var(--ink-2);
  }
  .stones {
    grid-column: 1 / -1;
    list-style: none;
    margin: 2px 0 0;
    padding: 0;
    display: grid;
    gap: 6px;
  }
  .stones button {
    display: grid;
    grid-template-columns: 30px 1fr auto;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 8px 10px;
    border-radius: var(--r-md);
    text-align: left;
    background: var(--surface);
    box-shadow: inset 0 0 0 1px var(--line);
    transition:
      background var(--dur-1) var(--ease-out),
      transform var(--dur-1) var(--ease-out),
      box-shadow var(--dur-2) var(--ease-out);
  }
  .stones button:hover {
    background: color-mix(in srgb, var(--lav) 10%, var(--surface));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--lav) 40%, var(--line));
  }
  .stones button:active {
    transform: scale(0.98);
  }
  .stones button.step {
    background: color-mix(in srgb, var(--lav) 12%, var(--surface));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--lav) 35%, var(--line));
  }
  .ic {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    color: var(--lav);
    background: color-mix(in srgb, var(--lav) 14%, transparent);
  }
  .what {
    display: grid;
    font-size: var(--t-sm);
    line-height: 1.3;
  }
  .what small {
    font-size: 10.5px;
    color: var(--ink-3);
  }
  .mins {
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .foot {
    grid-column: 1 / -1;
    display: flex;
    justify-content: flex-end;
  }
  :global([data-motion='calm']) .landing .drift {
    animation: none;
  }
</style>
