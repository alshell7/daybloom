<script lang="ts">
  // Breadcrumbs: a pin drops onto the block you're leaving and a one-line note appears beside it;
  // a stray thought waits in its parking spot.
  import Icon from '../../../../lib/Icon.svelte';
</script>

<div class="s-blk" style="left:16px;top:58px;width:94px;height:26px">
  <Icon name="pen" size={11} stroke={2.2} /><span>Write the intro</span>
</div>
<span class="shadow abs" style="left:30px;top:57px"></span>
<span class="pin abs" style="left:27px;top:40px"><Icon name="pin" size={20} stroke={2} /></span>

<div class="s-card note" style="left:58px;top:14px;width:112px;height:30px">
  <span class="tail abs"></span>
  <span class="ink abs" style="left:9px;top:10px"><Icon name="pen" size={10} stroke={2.2} /></span>
  <span class="text abs" style="left:24px;top:9px;width:82px">
    Left off at para 2<span class="cover abs"></span>
  </span>
</div>

<span class="s-chip parked" style="left:126px;top:62px"><Icon name="inbox" size={9} stroke={2.4} />Call Sam later</span>

<style>
  .pin {
    color: var(--ac-ink);
    animation: drop 760ms var(--ease-out) 150ms both;
  }
  .pin :global(svg) {
    fill: var(--ac-soft);
  }
  @keyframes drop {
    0% {
      opacity: 0;
      transform: translateY(-30px) rotate(-12deg);
    }
    45% {
      opacity: 1;
      transform: translateY(2px) rotate(4deg);
    }
    65% {
      transform: translateY(-4px) rotate(-2deg);
    }
    82% {
      transform: translateY(1px) rotate(0deg);
    }
  }
  .shadow {
    width: 14px;
    height: 4px;
    border-radius: 50%;
    background: color-mix(in srgb, #000 22%, transparent);
    animation: shade 760ms var(--ease-out) 150ms both;
  }
  @keyframes shade {
    0% {
      opacity: 0;
      transform: scaleX(0.3);
    }
    45% {
      opacity: 1;
      transform: scaleX(1.1);
    }
  }
  .note {
    transform-origin: 0% 100%;
    animation: unfold 520ms var(--spring) 780ms both;
  }
  @keyframes unfold {
    from {
      opacity: 0;
      transform: translate(-8px, 6px) scale(0.7);
    }
  }
  .tail {
    left: -4px;
    bottom: 6px;
    width: 8px;
    height: 8px;
    background: var(--raised);
    box-shadow: -1px 1px 0 0 var(--line);
    transform: rotate(45deg);
  }
  .ink {
    color: var(--ac-ink);
  }
  .text {
    overflow: hidden;
    font-size: 8.5px;
    line-height: 12px;
    white-space: nowrap;
    color: var(--ink-2);
  }
  /* The line is "written": a cover in the card's colour slides away from it. */
  .cover {
    inset: 0;
    background: var(--raised);
    transform: translateX(101%);
    animation: write 700ms steps(14, end) 1150ms both;
  }
  @keyframes write {
    from {
      transform: translateX(0);
    }
  }
  .parked {
    color: var(--ink-2);
    animation: pop 480ms var(--spring) 1950ms both;
  }
  @keyframes pop {
    from {
      opacity: 0;
      transform: translateY(6px) scale(0.6);
    }
  }
</style>
