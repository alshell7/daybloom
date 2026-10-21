<script lang="ts">
  // MCP: an AI app and your dial, joined by a thread behind a key. A pulse travels across, a new
  // block lands on the dial (with an Undo), and a pulse comes back to say it's done.
  import Icon from '../../../../lib/Icon.svelte';

  /** An arc on the small dial's ring, clockwise from 12 o'clock (degrees). */
  function arc(a1: number, a2: number, r = 21, c = 28) {
    const p = (a: number) => {
      const t = ((a - 90) * Math.PI) / 180;
      return `${(c + r * Math.cos(t)).toFixed(2)} ${(c + r * Math.sin(t)).toFixed(2)}`;
    };
    return `M ${p(a1)} A ${r} ${r} 0 ${a2 - a1 > 180 ? 1 : 0} 1 ${p(a2)}`;
  }
</script>

<div class="s-card app" style="left:14px;top:18px;width:74px;height:60px">
  <span class="dot abs" style="left:7px;top:7px"></span>
  <span class="dot abs" style="left:13px;top:7px"></span>
  <span class="dot abs" style="left:19px;top:7px"></span>
  <span class="spark abs" style="left:59px;top:4px"><Icon name="sparkles" size={10} stroke={2.2} /></span>
  <span class="ask abs" style="left:24px;top:19px;width:42px"></span>
  <span class="reply abs" style="left:8px;top:31px;width:50px"></span>
  <span class="s-chip done" style="left:8px;top:43px"><Icon name="check" size={8} stroke={3} />Added</span>
</div>

<span class="thread abs" style="left:89px;top:47px;width:58px"></span>
<span class="lit abs" style="left:89px;top:47px;width:58px"></span>
<span class="s-chip key" style="left:108px;top:39px;padding:0 4px"><Icon name="key" size={9} stroke={2.4} /></span>
<span class="pulse go abs" style="left:86px;top:44px"></span>
<span class="pulse back abs" style="left:144px;top:44px"></span>

<div class="s-dial" style="left:148px;top:19px;width:56px;height:56px">
  <svg class="arcs abs" viewBox="0 0 56 56" width="56" height="56">
    <path class="a-old" d={arc(205, 250)} />
    <path class="a-mid" d={arc(290, 335)} />
  </svg>
  <svg class="arcs new abs" viewBox="0 0 56 56" width="56" height="56">
    <path class="a-new" d={arc(30, 110)} />
  </svg>
</div>
<span class="s-chip undo" style="left:156px;top:79px"><Icon name="undo" size={8} stroke={2.6} />Undo</span>

<style>
  .dot {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--ink) 18%, transparent);
  }
  .spark {
    color: var(--ac-ink);
  }
  .ask,
  .reply {
    height: 9px;
    border-radius: 5px;
  }
  .ask {
    background: var(--ac-soft);
    animation: fade 300ms ease-out 150ms both;
  }
  .reply {
    background: color-mix(in srgb, var(--ink) 8%, transparent);
    animation: fade 300ms ease-out 1900ms both;
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
  .thread {
    height: 0;
    border-top: 1.5px dashed color-mix(in srgb, var(--ink) 26%, transparent);
  }
  .lit {
    height: 1.5px;
    border-radius: 1px;
    background: var(--ac);
    transform-origin: left center;
    animation: wire 600ms ease-in-out 500ms both;
  }
  @keyframes wire {
    from {
      transform: scaleX(0);
    }
  }
  .key {
    color: var(--ink-2);
    animation: pop 420ms var(--spring) 200ms both;
  }
  .pulse {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--ac);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--ac) 25%, transparent);
    opacity: 0;
  }
  .pulse.go {
    animation: go 600ms ease-in-out 500ms both;
  }
  .pulse.back {
    animation: back 600ms ease-in-out 1650ms both;
  }
  @keyframes go {
    0% {
      opacity: 0;
      transform: translateX(0);
    }
    15%,
    85% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      transform: translateX(58px);
    }
  }
  @keyframes back {
    0% {
      opacity: 0;
      transform: translateX(0);
    }
    15%,
    85% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      transform: translateX(-58px);
    }
  }
  .arcs {
    inset: 0;
    fill: none;
    stroke-width: 5;
    stroke-linecap: round;
  }
  .a-old {
    stroke: color-mix(in srgb, var(--ink) 22%, transparent);
  }
  .a-mid {
    stroke: color-mix(in srgb, var(--ac) 45%, transparent);
  }
  .a-new {
    stroke: var(--ac);
  }
  .arcs.new {
    animation: land 520ms var(--spring) 1100ms both;
  }
  @keyframes land {
    from {
      opacity: 0;
      transform: scale(0.7) rotate(-20deg);
    }
  }
  .undo {
    color: var(--ink-2);
    animation: pop 420ms var(--spring) 1350ms both;
  }
  .done {
    height: 14px;
    font-size: 7.5px;
    animation: pop 420ms var(--spring) 2250ms both;
  }
  @keyframes pop {
    from {
      opacity: 0;
      transform: scale(0.5);
    }
  }
</style>
