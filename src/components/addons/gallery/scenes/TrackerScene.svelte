<script lang="ts">
  // Time Tracker: a stopwatch's ring of ticks fills as the hand sweeps; it pauses while you're
  // away (a small "Away" note pops up), then carries on to the tracked total.
  import Icon from '../../../../lib/Icon.svelte';

  const CX = 58;
  const CY = 56;
  const TICKS = Array.from({ length: 24 }, (_, i) => i * 15);
  /** When the hand passes a tick: it sweeps to 150°, waits, then sweeps on to 288°. */
  const lightAt = (deg: number) => Math.round(deg <= 150 ? 200 + (deg / 150) * 792 : 1592 + ((deg - 150) / 138) * 1008);
</script>

<span class="crown abs" style={`left:${CX - 5}px;top:${CY - 40}px`}></span>
<div class="s-dial" style={`left:${CX - 32}px;top:${CY - 32}px;width:64px;height:64px`}></div>
{#each TICKS as deg (deg)}
  <span class="tick abs" style={`left:${CX - 1}px;top:${CY - 2.5}px;transform:rotate(${deg}deg) translateY(-25px)`}></span>
  {#if deg <= 285}
    <span class="tick lit abs" style={`left:${CX - 1}px;top:${CY - 2.5}px;transform:rotate(${deg}deg) translateY(-25px);--d:${lightAt(deg)}ms`}></span>
  {/if}
{/each}
<span class="hand abs" style={`left:${CX - 1}px;top:${CY - 21}px`}></span>
<span class="hub abs" style={`left:${CX - 3}px;top:${CY - 3}px`}></span>
<span class="paused abs" style={`left:${CX - 7}px;top:${CY + 6}px`}><Icon name="pause" size={14} stroke={2.4} /></span>

<span class="cap abs" style="left:108px;top:26px">Tracked</span>
<span class="total abs" style="left:108px;top:36px">1h 20m</span>
<span class="s-chip away" style="left:108px;top:62px"><Icon name="pause" size={9} stroke={2.6} />Away 5m · kept</span>

<style>
  .crown {
    width: 10px;
    height: 6px;
    border-radius: 3px;
    background: color-mix(in srgb, var(--ink) 22%, var(--raised));
    animation: press 360ms var(--ease-out) 60ms both;
  }
  @keyframes press {
    50% {
      transform: translateY(2px);
    }
  }
  .tick {
    width: 2px;
    height: 5px;
    border-radius: 1px;
    background: color-mix(in srgb, var(--ink) 16%, transparent);
  }
  .tick.lit {
    background: var(--ac);
    animation: lit 160ms ease-out var(--d) both;
  }
  @keyframes lit {
    from {
      opacity: 0;
    }
  }
  .hand {
    width: 2px;
    height: 21px;
    border-radius: 1px;
    background: var(--ink);
    transform-origin: 50% 100%;
    transform: rotate(288deg);
    animation: sweep 2400ms linear 200ms both;
  }
  @keyframes sweep {
    0% {
      transform: rotate(0deg);
    }
    33% {
      transform: rotate(150deg);
    }
    58% {
      transform: rotate(150deg);
    }
    100% {
      transform: rotate(288deg);
    }
  }
  .hub {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--ac);
    box-shadow: 0 0 0 1.5px var(--raised);
  }
  .paused {
    color: var(--ink-3);
    opacity: 0;
    animation: blip 620ms ease-out 1000ms both;
  }
  @keyframes blip {
    0% {
      opacity: 0;
      transform: scale(0.6);
    }
    30%,
    70% {
      opacity: 1;
      transform: scale(1);
    }
  }
  .cap {
    font-size: 8.5px;
    color: var(--ink-3);
    animation: up 420ms var(--ease-out) 2500ms both;
  }
  .total {
    font-size: 17px;
    font-weight: 500;
    letter-spacing: -0.02em;
    animation: up 460ms var(--ease-out) 2550ms both;
  }
  @keyframes up {
    from {
      opacity: 0;
      transform: translateY(5px);
    }
  }
  .away {
    color: var(--ink-2);
    animation: pop 460ms var(--spring) 1050ms both;
  }
  @keyframes pop {
    from {
      opacity: 0;
      transform: scale(0.5);
    }
  }
</style>
