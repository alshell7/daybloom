<script lang="ts">
  // Soft landings: a meeting ends, a leaf drifts down onto the few free minutes kept after it,
  // and three small stepping stones appear: breathe, a little spark, a first step.
  import Icon from '../../../../lib/Icon.svelte';

  const STONES = [
    { icon: 'wind', x: 150 },
    { icon: 'sparkle', x: 173 },
    { icon: 'footprints', x: 196 },
  ];
</script>

<span class="rail abs" style="left:10px;top:68px;width:200px"></span>
<div class="meet abs" style="left:12px;top:39px;width:76px;height:26px">
  <Icon name="users" size={11} stroke={2.2} /><span>Team call</span>
</div>
<span class="now abs" style="left:87px;top:33px"></span>

<span class="pad abs" style="left:93px;top:43px;width:46px;height:22px"><span>5m</span></span>
<span class="leaf abs" style="left:107px;top:32px"><Icon name="leaf" size={18} stroke={2} /></span>

{#each STONES as s, i (i)}
  <span class="stone abs" style={`left:${s.x - 10}px;top:42px;--d:${1750 + i * 170}ms`}><Icon name={s.icon} size={10} stroke={2.3} /></span>
{/each}

<style>
  .rail {
    height: 1px;
    background: var(--line-strong);
  }
  .meet {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 7px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--ink) 9%, var(--raised));
    box-shadow: inset 0 0 0 1px var(--line);
    color: var(--ink-2);
    font-size: 8.5px;
    font-weight: 500;
    white-space: nowrap;
    animation: fade 320ms ease-out 0ms both;
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
  /* The now-line reaches the end of the meeting. */
  .now {
    width: 2px;
    height: 38px;
    border-radius: 1px;
    background: var(--signal);
    animation: reach 760ms var(--ease-out) 200ms both;
  }
  @keyframes reach {
    from {
      opacity: 0;
      transform: translateX(-62px);
    }
    20% {
      opacity: 1;
    }
  }
  /* The kept minutes: bare free time, a dotted outline. */
  .pad {
    display: grid;
    place-items: end center;
    padding-bottom: 3px;
    border-radius: 8px;
    border: 1.5px dotted color-mix(in srgb, var(--ac) 60%, transparent);
    background: color-mix(in srgb, var(--ac) 8%, transparent);
    font-size: 7.5px;
    font-weight: 500;
    color: var(--ac-ink);
    animation: open 520ms var(--spring) 850ms both;
  }
  @keyframes open {
    from {
      opacity: 0;
      transform: scaleX(0.3);
    }
  }
  .leaf {
    color: var(--ac-ink);
    animation: drift 1100ms ease-in-out 900ms both;
  }
  .leaf :global(svg) {
    fill: var(--ac-soft);
  }
  @keyframes drift {
    0% {
      opacity: 0;
      transform: translate(-8px, -32px) rotate(-24deg);
    }
    25% {
      opacity: 1;
      transform: translate(7px, -23px) rotate(16deg);
    }
    52% {
      transform: translate(-5px, -12px) rotate(-12deg);
    }
    78% {
      transform: translate(3px, -4px) rotate(7deg);
    }
  }
  .stone {
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--ac-soft);
    box-shadow: inset 0 0 0 1px var(--ac-line);
    color: var(--ac-ink);
    animation: hop 520ms var(--spring) var(--d) both;
  }
  @keyframes hop {
    from {
      opacity: 0;
      transform: translateY(8px) scale(0.4);
    }
  }
</style>
