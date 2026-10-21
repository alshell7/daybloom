<script lang="ts">
  // Waqt: a small 24-hour dial whose face is the day's sky, dawn to night. The now-hand carries
  // its sun from Fajr to Isha, each prayer's mark lights as it passes, and the sun turns to a
  // moon. Beside it, a prayer marked and the next reminder.
  import Icon from '../../../../lib/Icon.svelte';

  const CX = 54;
  const CY = 50;
  /** Noon at the top, like the 24 h dial. */
  const angle = (h: number) => ((h - 12) / 24) * 360;
  const START = angle(5 + 10 / 60);
  const END = angle(19 + 50 / 60);
  const RUN = 2000;
  const PRAYERS = [5 + 10 / 60, 13 + 5 / 60, 16.5, 18 + 20 / 60, 19 + 50 / 60].map((h) => {
    const a = angle(h);
    return { a, at: Math.round(300 + ((a - START) / (END - START)) * RUN) };
  });
</script>

<span class="sky night abs"></span>

<div class="s-dial" style={`left:${CX - 38}px;top:${CY - 38}px;width:76px;height:76px`}>
  <span class="face abs"></span>
  <span class="hole abs"><Icon name="mihrab" size={16} stroke={1.9} /></span>
</div>
{#each PRAYERS as p, i (i)}
  <span class="mark-at abs" style={`left:${CX - 3}px;top:${CY - 3}px;transform:rotate(${p.a}deg) translateY(-31px)`}>
    <span class="mark" style={`--d:${p.at}ms`}></span>
  </span>
{/each}
<span class="hand abs" style={`left:${CX - 1}px;top:${CY - 31}px;--from:${START}deg;--to:${END}deg`}>
  <span class="stick abs"></span>
  <span class="disc abs"><span class="sun"><Icon name="sun" size={8} stroke={2.6} /></span><span class="moon"><Icon name="moon" size={8} stroke={2.6} /></span></span>
</span>

<span class="s-chip prayed" style="left:112px;top:30px"><Icon name="check" size={9} stroke={2.8} />Maghrib · prayed</span>
<span class="s-chip next" style="left:112px;top:54px"><Icon name="bell" size={9} stroke={2.4} />Isha · 19:50</span>

<style>
  .sky {
    inset: 0;
    background: linear-gradient(90deg, transparent 30%, color-mix(in srgb, var(--focus-ring) 10%, transparent));
    animation: dusk 2200ms ease-in-out 300ms both;
  }
  @keyframes dusk {
    from {
      opacity: 0;
    }
  }
  /* The day's sky around the dial: noon at the top, night at the bottom. */
  .face {
    inset: 7px;
    border-radius: 50%;
    background: conic-gradient(
      color-mix(in srgb, var(--focus-ring) 9%, var(--raised)) 0deg 55deg,
      color-mix(in srgb, var(--warm) 26%, var(--raised)) 95deg,
      color-mix(in srgb, var(--focus-ring) 26%, var(--sunken)) 135deg 225deg,
      color-mix(in srgb, var(--warm) 30%, var(--raised)) 262deg,
      color-mix(in srgb, var(--focus-ring) 9%, var(--raised)) 300deg 360deg
    );
  }
  .hole {
    inset: 21px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--raised);
    color: var(--ac-ink);
    box-shadow: 0 0 0 1px var(--line);
  }
  .mark-at {
    width: 6px;
    height: 6px;
  }
  .mark {
    display: block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--ac);
    box-shadow: 0 0 0 1.5px var(--raised);
    animation: light 420ms var(--spring) var(--d) both;
  }
  @keyframes light {
    from {
      opacity: 0.2;
      transform: scale(0.5);
    }
  }
  /* The hand turns about the dial's centre; only its outer part shows, clear of the mihrab. */
  .hand {
    width: 2px;
    height: 31px;
    transform-origin: 50% 100%;
    transform: rotate(var(--to));
    animation: ride 2000ms cubic-bezier(0.45, 0, 0.35, 1) 300ms both;
  }
  @keyframes ride {
    from {
      transform: rotate(var(--from));
    }
  }
  .stick {
    left: 0;
    top: 0;
    width: 2px;
    height: 13px;
    border-radius: 1px;
    background: var(--signal);
  }
  .disc {
    left: -6px;
    top: -10px;
    width: 14px;
    height: 14px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--signal);
    color: #fff;
    box-shadow: 0 0 0 1.5px var(--raised);
    /* Stays upright while the hand turns. */
    transform: rotate(calc(-1 * var(--to)));
    animation: upright 2000ms cubic-bezier(0.45, 0, 0.35, 1) 300ms both;
  }
  @keyframes upright {
    from {
      transform: rotate(calc(-1 * var(--from)));
    }
  }
  .disc > span {
    grid-area: 1 / 1;
    display: grid;
  }
  .sun {
    opacity: 0;
    animation: away 300ms ease-out 1900ms both;
  }
  @keyframes away {
    from {
      opacity: 1;
    }
  }
  .moon {
    animation: fade 300ms ease-out 2000ms both;
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
  .prayed {
    color: var(--ink-2);
    animation: pop 460ms var(--spring) 2050ms both;
  }
  .next {
    animation: pop 460ms var(--spring) 2350ms both;
  }
  @keyframes pop {
    from {
      opacity: 0;
      transform: translateX(-6px) scale(0.7);
    }
  }
</style>
