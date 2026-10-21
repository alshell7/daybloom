<script lang="ts">
  // Alef: the little face in the dial wakes up, looks around, blinks, and smiles. Its eyes are
  // ink on light themes and a soft glow of its colour on dark ones, like the real Alef.
</script>

<div class="face abs" style="left:71px;top:11px;width:78px;height:78px">
  <span class="s-dial abs" style="inset:0"></span>
  <span class="s-ticks"></span>
  <span class="screen abs"></span>

  <span class="eye abs" style="left:24px;top:30px"></span>
  <span class="eye abs" style="left:42px;top:30px"></span>
  <span class="happy abs" style="left:23px;top:33px"></span>
  <span class="happy abs" style="left:41px;top:33px"></span>
  <span class="cheek abs" style="left:17px;top:50px"></span>
  <span class="cheek abs" style="left:53px;top:50px"></span>
</div>

<span class="s-chip hi" style="left:150px;top:16px">Hi!</span>

<style>
  .face {
    --eye: color-mix(in srgb, var(--ac) 38%, var(--ink));
    animation: wake 700ms var(--spring) 0ms both;
  }
  @keyframes wake {
    from {
      transform: translateY(4px) scale(0.94, 0.9);
    }
  }
  .screen {
    inset: 11px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--ac) 7%, color-mix(in srgb, var(--ink) 3%, var(--raised)));
    box-shadow: inset 0 1px 3px color-mix(in srgb, #000 10%, transparent);
  }
  .eye {
    width: 12px;
    height: 18px;
    border-radius: 5px;
    background: var(--eye);
    opacity: 0;
    animation: look 2600ms var(--ease-out) 150ms both;
  }
  @keyframes look {
    0% {
      opacity: 1;
      transform: translateX(0) scaleY(0.08);
    }
    8% {
      transform: translateX(0) scaleY(1.14);
    }
    13%,
    22% {
      transform: translateX(0) scaleY(1);
    }
    30%,
    42% {
      transform: translateX(-5px) scaleY(1);
    }
    50%,
    62% {
      transform: translateX(5px) scaleY(1);
    }
    68% {
      transform: translateX(0) scaleY(1);
    }
    71% {
      transform: translateX(0) scaleY(0.1);
    }
    74%,
    84% {
      opacity: 1;
      transform: translateX(0) scaleY(1);
    }
    90% {
      opacity: 0;
      transform: translateX(0) scaleY(0.5);
    }
  }
  /* Happy eyes: two soft arches, squashing into place on a spring. */
  .happy {
    width: 14px;
    height: 9px;
    border: 3px solid var(--eye);
    border-bottom: 0;
    border-radius: 8px 8px 0 0;
    animation: smile 2600ms var(--ease-out) 150ms both;
  }
  @keyframes smile {
    0%,
    86% {
      opacity: 0;
      transform: translateY(3px) scaleY(0.4);
    }
    92% {
      opacity: 1;
      transform: translateY(-1px) scaleY(1.2);
    }
    96% {
      transform: translateY(0) scaleY(0.92);
    }
  }
  .cheek {
    width: 8px;
    height: 4px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--ac) 40%, transparent);
    animation: blush 2600ms ease-out 150ms both;
  }
  @keyframes blush {
    0%,
    88% {
      opacity: 0;
    }
  }
  .hi {
    border-radius: 9px 9px 9px 3px;
    animation: pop 460ms var(--spring) 2550ms both;
  }
  @keyframes pop {
    from {
      opacity: 0;
      transform: translate(-6px, 6px) scale(0.5);
    }
  }
</style>
