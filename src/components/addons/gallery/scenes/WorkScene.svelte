<script lang="ts">
  // Work: a block of time fills up, pays out a few coins, and they settle beside a neat bill.
  import Icon from '../../../../lib/Icon.svelte';
</script>

<div class="track abs" style="left:16px;top:38px;width:88px;height:26px"></div>
<div class="fill abs" style="left:16px;top:38px;width:88px;height:26px"></div>
<div class="s-blk label" style="left:16px;top:38px;width:88px;height:26px">
  <Icon name="briefcase" size={12} stroke={2.1} />
  <span>2h 30m</span>
</div>

{#each [0, 1, 2] as i (i)}
  <span class="coin abs" style={`left:117px;top:${66 - i * 7}px;--d:${980 + i * 150}ms`}></span>
{/each}

<div class="s-card bill" style="left:142px;top:16px;width:60px;height:70px">
  <span class="s-line l" style="left:9px;top:12px;width:30px;--d:1350ms"></span>
  <span class="s-line l" style="left:9px;top:21px;width:40px;--d:1430ms"></span>
  <span class="s-line l" style="left:9px;top:30px;width:24px;--d:1510ms"></span>
  <span class="rule abs" style="left:9px;top:42px;width:42px"></span>
  <span class="total abs" style="left:9px;top:50px;width:28px"></span>
  <span class="ok abs" style="left:43px;top:46px"><Icon name="check" size={9} stroke={3} /></span>
</div>

<style>
  .track {
    border-radius: 8px;
    background: var(--ac-soft);
  }
  .fill {
    border-radius: 8px;
    background: var(--ac);
    transform-origin: left center;
    animation: fill 900ms var(--ease-out) 150ms both;
  }
  .label {
    background: transparent;
    animation: fade 320ms ease-out 850ms both;
  }
  @keyframes fill {
    from {
      transform: scaleX(0.08);
    }
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
  .coin {
    width: 14px;
    height: 7px;
    border-radius: 50%;
    background: var(--ac);
    box-shadow:
      inset 0 0 0 1.5px color-mix(in srgb, var(--ac) 60%, #fff),
      0 1px 0 color-mix(in srgb, var(--ac) 60%, #000);
    animation: hop 620ms var(--ease-out) var(--d) both;
  }
  @keyframes hop {
    0% {
      opacity: 0;
      transform: translate(-16px, -10px) scale(0.6);
    }
    20% {
      opacity: 1;
    }
    55% {
      transform: translate(-6px, -26px) scale(1.05);
    }
  }
  .bill {
    animation: rise 520ms var(--spring) 1150ms both;
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(12px) scale(0.92);
    }
  }
  .l {
    transform-origin: left center;
    animation: grow 360ms var(--ease-out) var(--d) both;
  }
  @keyframes grow {
    from {
      transform: scaleX(0);
    }
  }
  .rule {
    height: 1px;
    background: var(--line);
  }
  .total {
    height: 6px;
    border-radius: 3px;
    background: var(--ac);
    transform-origin: left center;
    animation: grow 380ms var(--ease-out) 1650ms both;
  }
  .ok {
    display: grid;
    place-items: center;
    width: 13px;
    height: 13px;
    border-radius: 50%;
    background: var(--ac);
    color: #fff;
    animation: pop 480ms var(--spring) 1950ms both;
  }
  @keyframes pop {
    from {
      opacity: 0;
      transform: scale(0.2);
    }
  }
</style>
