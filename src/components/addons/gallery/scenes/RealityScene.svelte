<script lang="ts">
  // Reality check: for each kind of task, the real time grows out beside the planned time and
  // settles; then a kind "usually ~45m" appears for next time.
  import Icon from '../../../../lib/Icon.svelte';

  const ROWS = [
    { icon: 'pen', plan: 92, real: 140 },
    { icon: 'mail', plan: 136, real: 118 },
    { icon: 'code', plan: 66, real: 100 },
  ];
</script>

<span class="key abs" style="left:14px;top:9px"><i class="dash"></i>Planned<i class="solid"></i>Real</span>
<span class="s-chip hint" style="left:138px;top:8px"><Icon name="clock" size={9} stroke={2.4} />Usually ~45m</span>

{#each ROWS as r, i (i)}
  {@const y = 32 + i * 21}
  <span class="s-ico" style={`left:14px;top:${y - 1}px;width:15px;height:15px;border-radius:5px`}><Icon name={r.icon} size={9} stroke={2.3} /></span>
  <span class="real abs" style={`left:37px;top:${y + 1}px;width:${r.real}px;--d:${300 + i * 170}ms`}></span>
  <span class="plan abs" style={`left:37px;top:${y + 1}px;width:${r.plan}px;--d:${120 + i * 120}ms`}></span>
{/each}

<style>
  .key {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 8px;
    color: var(--ink-3);
  }
  .key i {
    display: block;
    width: 10px;
    height: 6px;
    border-radius: 2px;
  }
  .key .solid {
    margin-left: 6px;
    background: var(--ac);
  }
  .dash {
    border: 1.2px dashed color-mix(in srgb, var(--ink) 45%, transparent);
  }
  .plan {
    height: 11px;
    border-radius: 4px;
    border: 1.5px dashed color-mix(in srgb, var(--ink) 42%, transparent);
    animation: fade 300ms ease-out var(--d) both;
  }
  .real {
    height: 11px;
    border-radius: 4px;
    background: color-mix(in srgb, var(--ac) 82%, transparent);
    transform-origin: left center;
    animation: settle 900ms var(--ease-out) var(--d) both;
  }
  @keyframes settle {
    0% {
      transform: scaleX(0);
    }
    62% {
      transform: scaleX(1.06);
    }
    82% {
      transform: scaleX(0.98);
    }
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
  .hint {
    color: var(--ink-2);
    animation: pop 480ms var(--spring) 1500ms both;
  }
  @keyframes pop {
    from {
      opacity: 0;
      transform: translateY(5px) scale(0.6);
    }
  }
</style>
