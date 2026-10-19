<script lang="ts">
  // The adhan's moment, in the app: a small card rises at the foot of the rail. The crescent
  // draws itself in, a star twinkles once; it says whose time it is and when jamaat is. Mark it
  // prayed, or let it be (it goes quietly by itself after a few minutes).
  import { backOut, cubicOut } from 'svelte/easing';
  import { fade, fly, scale } from 'svelte/transition';
  import { waqt } from '../../../lib/addons/waqt/waqt.svelte';
  import { formatDuration, formatTime, isoOf, MINUTE } from '../../../lib/engine/time';
  import Icon from '../../../lib/Icon.svelte';
  import { sounds } from '../../../lib/sound';
  import { clock } from '../../../lib/stores/clock.svelte';
  import { settings } from '../../../lib/stores/settings.svelte';
  import { view } from '../../../lib/stores/view.svelte';

  const m = $derived(waqt.moment);
  const rm = $derived(view.reducedMotion);
  let marked = $state(false);
  let cardH = $state(0);

  $effect(() => {
    if (!m) return;
    marked = false;
    const t = setTimeout(() => (waqt.moment = null), 4 * 60_000);
    return () => clearTimeout(t);
  });
  $effect(() => {
    view.setDock('waqt', m && cardH ? cardH : 0);
    return () => view.setDock('waqt', 0);
  });

  const jamaatIn = $derived(m?.prayer.jamaat && m.prayer.jamaat > clock.now ? m.prayer.jamaat - clock.now : null);

  function prayed() {
    if (!m) return;
    waqt.mark(isoOf(m.prayer.at), m.prayer.id, 'prayed');
    if (settings.value.sound) sounds.done();
    marked = true;
    setTimeout(() => (waqt.moment = null), rm ? 400 : 1400);
  }
</script>

{#if m}
  <div class="moment" bind:clientHeight={cardH} style:bottom={`${16 + view.dockBelow('waqt')}px`} role="status" aria-label={`It’s time for ${m.prayer.name}`} in:fly={{ y: 20, duration: rm ? 0 : 520, easing: cubicOut }} out:fade={{ duration: rm ? 0 : 260 }}>
    <svg class="crescent" viewBox="0 0 64 64" aria-hidden="true">
      <path class="moon" d="M40 10a22 22 0 1 0 14 38A18 18 0 1 1 40 10z" />
      <path class="star" d="M48 18l1.8 4 4.2.4-3.2 2.8 1 4.2-3.8-2.3-3.8 2.3 1-4.2-3.2-2.8 4.2-.4z" />
    </svg>
    <div class="txt">
      {#if marked}
        <p class="big" in:fade={{ duration: rm ? 0 : 200 }}>May it be accepted.</p>
        <p class="small">{m.prayer.name} marked as prayed.</p>
      {:else}
        <p class="big">It’s time for {m.prayer.name}</p>
        <p class="small tnum">
          {formatTime(m.prayer.at, view.hour12)}
          {#if jamaatIn}· jamaat at {formatTime(m.prayer.jamaat!, view.hour12)}, in {formatDuration(Math.round(jamaatIn / MINUTE) * MINUTE)}{:else}· until {formatTime(m.prayer.end, view.hour12)}{/if}
        </p>
      {/if}
    </div>
    {#if !marked}
      <div class="acts">
        <button class="btn btn-primary" onclick={prayed} in:scale={{ start: 0.8, duration: rm ? 0 : 360, delay: rm ? 0 : 500, easing: backOut }}><Icon name="check" size={14} stroke={2.4} /> Prayed</button>
        <button class="btn btn-quiet" onclick={() => (waqt.moment = null)}>Later</button>
      </div>
    {/if}
  </div>
{/if}

<style>
  .moment {
    --green: #25976a;
    position: fixed;
    right: 16px;
    bottom: 16px;
    z-index: 61;
    transition: bottom var(--dur-3) var(--ease-out);
    display: grid;
    grid-template-columns: 52px 1fr;
    align-items: center;
    gap: 6px 12px;
    width: min(380px, calc(100vw - 32px));
    padding: 14px 16px;
    border-radius: var(--r-lg);
    color: #f4f1ff;
    background: radial-gradient(130% 120% at 85% 0%, #2f3a76 0%, #172041 60%, #0e1430 100%);
    box-shadow: var(--shadow-3);
    overflow: hidden;
  }
  .crescent {
    width: 46px;
    height: 46px;
  }
  .moon {
    fill: rgb(255 236 179 / 0.2);
    stroke: #ffe7a6;
    stroke-width: 2;
    stroke-dasharray: 160;
    animation: draw 1.6s var(--ease-out) both;
  }
  .star {
    fill: #ffe7a6;
    transform-origin: 48px 24px;
    animation: twinkle 900ms var(--ease-settle) 1.1s both;
  }
  @keyframes draw {
    from {
      stroke-dashoffset: 160;
      fill-opacity: 0;
    }
  }
  @keyframes twinkle {
    from {
      transform: scale(0) rotate(-50deg);
      opacity: 0;
    }
  }
  .big {
    margin: 0;
    font-size: var(--t-md);
    font-weight: 500;
  }
  .small {
    margin: 2px 0 0;
    font-size: var(--t-xs);
    color: rgb(244 241 255 / 0.72);
  }
  .acts {
    grid-column: 2;
    display: flex;
    gap: 8px;
    margin-top: 6px;
  }
  .acts .btn {
    height: 32px;
    gap: 6px;
  }
  .acts .btn-primary {
    background: #f4f1ff;
    color: #172041;
  }
  .acts .btn-quiet {
    color: rgb(244 241 255 / 0.8);
  }
  .acts .btn-quiet:hover {
    background: rgb(255 255 255 / 0.08);
    color: #f4f1ff;
  }
  :global([data-motion='calm']) .moment .moon,
  :global([data-motion='calm']) .moment .star {
    animation: none;
  }
</style>
