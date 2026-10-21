<script lang="ts">
  // Retrospection: a week of tiny dials, each as full as that day went; then a sparkle lands on
  // the best one.
  import Icon from '../../../../lib/Icon.svelte';

  const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const FULL = [46, 68, 55, 92, 34, 74, 60];
  const BEST = 3;
  const X = (i: number) => 17 + i * 28;
  const BURST = [-70, -20, 25, 70, 160].map((a) => ({ x: Math.sin((a * Math.PI) / 180) * 13, y: -Math.cos((a * Math.PI) / 180) * 13 }));
</script>

{#each DAYS as d, i (i)}
  <span class="day abs" style={`left:${X(i)}px;top:40px;--d:${80 + i * 70}ms`}>
    <span class="ring" style={`background:conic-gradient(var(--ac) 0 ${FULL[i]}%, color-mix(in srgb, var(--ink) 11%, transparent) ${FULL[i]}% 100%)`}></span>
    <span class="hole"></span>
  </span>
  <span class="lbl abs" class:best={i === BEST} style={`left:${X(i)}px;top:67px;--d:${80 + i * 70}ms`}>{d}</span>
{/each}

<span class="halo abs" style={`left:${X(BEST) - 4}px;top:36px`}></span>
<span class="star abs" style={`left:${X(BEST) + 3}px;top:16px`}><Icon name="star" size={16} stroke={2} /></span>
{#each BURST as b, i (i)}
  <span class="spark abs" style={`left:${X(BEST) + 9}px;top:22px;--x:${b.x}px;--y:${b.y}px`}></span>
{/each}

<style>
  .day {
    width: 22px;
    height: 22px;
    animation: pop 460ms var(--spring) var(--d) both;
  }
  .ring,
  .hole {
    position: absolute;
    border-radius: 50%;
  }
  .ring {
    inset: 0;
  }
  .hole {
    inset: 4.5px;
    background: var(--raised);
  }
  @keyframes pop {
    from {
      opacity: 0;
      transform: scale(0.3);
    }
  }
  .lbl {
    width: 22px;
    font-size: 8px;
    text-align: center;
    color: var(--ink-3);
    animation: fade 300ms ease-out var(--d) both;
  }
  .lbl.best {
    color: var(--ink);
    font-weight: 600;
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
  .halo {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--ac) 45%, transparent);
    animation: ring 700ms var(--ease-out) 1150ms both;
  }
  @keyframes ring {
    0% {
      opacity: 0;
      transform: scale(0.7);
    }
    40% {
      opacity: 1;
      transform: scale(1.15);
    }
  }
  .star {
    color: var(--ac-ink);
    animation: land 700ms var(--spring) 950ms both;
  }
  .star :global(svg) {
    fill: color-mix(in srgb, var(--ac) 35%, var(--raised));
  }
  @keyframes land {
    from {
      opacity: 0;
      transform: translateY(-14px) rotate(-60deg) scale(0.4);
    }
  }
  .spark {
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: var(--ac);
    opacity: 0;
    transform: translate(var(--x), var(--y));
    animation: burst 620ms var(--ease-out) 1250ms both;
  }
  @keyframes burst {
    0% {
      opacity: 1;
      transform: none;
    }
    60% {
      opacity: 1;
    }
  }
</style>
