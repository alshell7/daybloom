<script lang="ts">
  // Make it smaller: a boulder of a task wobbles, then splits into a little staircase of steps.
  // The first step is the easy one: two minutes.
  import Icon from '../../../../lib/Icon.svelte';

  // Final spots; each pebble starts out of the boulder's middle (46, 51).
  const STEPS = [
    { x: 88, y: 30, w: 40, h: 18 },
    { x: 124, y: 48, w: 32, h: 15 },
    { x: 152, y: 63, w: 28, h: 13 },
    { x: 176, y: 76, w: 26, h: 12 },
  ];
  const from = (s: (typeof STEPS)[number]) => `--fx:${46 - (s.x + s.w / 2)}px;--fy:${51 - (s.y + s.h / 2)}px`;
</script>

<span class="ghost abs" style="left:14px;top:28px;width:64px;height:46px"></span>
<div class="boulder abs" style="left:14px;top:28px;width:64px;height:46px">
  <Icon name="layers" size={18} stroke={2} />
</div>
<span class="s-chip ask" style="left:14px;top:9px"><Icon name="sparkles" size={9} stroke={2.4} />Too big?</span>

<span class="ring abs" style="left:85px;top:27px;width:46px;height:24px"></span>
{#each STEPS as s, i (i)}
  <span class="step abs" class:first={i === 0} style={`left:${s.x}px;top:${s.y}px;width:${s.w}px;height:${s.h}px;${from(s)};--d:${720 + i * 90}ms`}>
    {#if i === 0}<Icon name="timer" size={9} stroke={2.4} />2 min{:else}<i></i>{/if}
  </span>
{/each}

<style>
  .ghost {
    border-radius: 15px;
    border: 1.5px dashed color-mix(in srgb, var(--ink) 22%, transparent);
  }
  .boulder {
    display: grid;
    place-items: center;
    border-radius: 15px;
    background: var(--ac);
    color: #fff;
    box-shadow: inset 0 -4px 0 color-mix(in srgb, #000 14%, transparent);
    opacity: 0;
    transform: scale(1.12);
    animation: wobble 820ms var(--ease-out) 80ms both;
  }
  @keyframes wobble {
    0% {
      opacity: 1;
      transform: none;
    }
    18% {
      transform: rotate(-5deg);
    }
    36% {
      transform: rotate(4deg);
    }
    52% {
      transform: rotate(-2deg) scale(1.02);
    }
    72% {
      opacity: 1;
      transform: scale(1.04);
    }
  }
  .ask {
    color: var(--ink-2);
    animation: ask 700ms var(--ease-out) 0ms both;
  }
  @keyframes ask {
    0% {
      opacity: 0;
      transform: translateY(4px);
    }
    40% {
      opacity: 1;
      transform: none;
    }
    70% {
      transform: scale(0.92);
    }
  }
  .step {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 3px;
    border-radius: 6px;
    background: color-mix(in srgb, var(--ac) 55%, var(--raised));
    color: #fff;
    font-size: 8.5px;
    font-weight: 600;
    white-space: nowrap;
    animation: split 600ms var(--spring) var(--d) both;
  }
  .step.first {
    background: var(--ac);
  }
  .step i {
    width: 45%;
    height: 2.5px;
    border-radius: 2px;
    background: color-mix(in srgb, #fff 70%, transparent);
  }
  @keyframes split {
    from {
      opacity: 0;
      transform: translate(var(--fx), var(--fy)) scale(0.4);
    }
  }
  /* The first step's ring: a single ripple, then it rests as a soft outline. */
  .ring {
    border-radius: 9px;
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--ac) 38%, transparent);
    animation: ripple 900ms var(--ease-out) 1250ms both;
  }
  @keyframes ripple {
    0% {
      opacity: 0;
      transform: scale(0.9);
    }
    35% {
      opacity: 1;
      transform: scale(1.12);
    }
  }
</style>
