<script lang="ts">
  // Timeline views: the same blocks as a list, then a board, then Gantt bars along the hours,
  // with the List · Board · Gantt switch gliding along.
  const MIX = [100, 55, 82, 42, 68];
  // Final spots are the Gantt bars; the list and board spots are offsets from them.
  const GANTT = [
    { x: 24, sx: 1 },
    { x: 52, sx: 1.4 },
    { x: 84, sx: 0.8 },
    { x: 112, sx: 1.6 },
    { x: 150, sx: 1 },
  ].map((g, i) => ({ ...g, y: 32 + i * 12 }));
  const BOARD = [
    { x: 34, y: 40 },
    { x: 34, y: 54 },
    { x: 88, y: 40 },
    { x: 88, y: 54 },
    { x: 142, y: 40 },
  ];
  const LIST = GANTT.map((_, i) => ({ x: 88, y: 31 + i * 13 }));
  const vars = (i: number) => {
    const g = GANTT[i];
    return `left:${g.x}px;top:${g.y}px;--sx:${g.sx};--lx:${LIST[i].x - g.x}px;--ly:${LIST[i].y - g.y}px;--bx:${BOARD[i].x - g.x}px;--by:${BOARD[i].y - g.y}px;--d:${i * 40}ms;--c:color-mix(in srgb, var(--ac) ${MIX[i]}%, var(--raised))`;
  };
</script>

<div class="seg abs" style="left:55px;top:7px">
  <span class="thumb abs"></span>
  <span>List</span><span>Board</span><span>Gantt</span>
</div>

{#each [34, 88, 142] as x (x)}
  <span class="col abs" style={`left:${x - 3}px;top:33px`}></span>
{/each}
{#each [24, 64, 104, 144, 184] as x (x)}
  <span class="hour abs" style={`left:${x}px;top:29px`}></span>
{/each}

{#each GANTT as _, i (i)}
  <span class="card abs" style={vars(i)}></span>
{/each}

<style>
  .seg {
    display: grid;
    grid-template-columns: repeat(3, 36px);
    padding: 2px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--ink) 7%, transparent);
    font-size: 7.5px;
    line-height: 13px;
    text-align: center;
    color: var(--ink-3);
  }
  .seg span:not(.thumb) {
    position: relative;
  }
  .thumb {
    left: 2px;
    top: 2px;
    width: 36px;
    height: 13px;
    border-radius: 999px;
    background: var(--raised);
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.12);
    transform: translateX(72px);
    animation: thumb 3200ms var(--ease-out) 0ms both;
  }
  @keyframes thumb {
    0%,
    22% {
      transform: translateX(0);
    }
    32%,
    58% {
      transform: translateX(36px);
    }
    68%,
    100% {
      transform: translateX(72px);
    }
  }
  .col {
    width: 50px;
    height: 36px;
    border-radius: 7px;
    background: color-mix(in srgb, var(--ink) 5%, transparent);
    opacity: 0;
    animation: board 3200ms ease-in-out 0ms both;
  }
  @keyframes board {
    0%,
    22% {
      opacity: 0;
    }
    32%,
    56% {
      opacity: 1;
    }
    64%,
    100% {
      opacity: 0;
    }
  }
  .hour {
    width: 1px;
    height: 62px;
    background: var(--line);
    animation: hours 3200ms ease-in-out 0ms both;
  }
  @keyframes hours {
    0%,
    60% {
      opacity: 0;
    }
    72% {
      opacity: 1;
    }
  }
  .card {
    width: 44px;
    height: 10px;
    border-radius: 4px;
    background: var(--c);
    transform-origin: left center;
    transform: scaleX(var(--sx));
    animation: morph 3200ms cubic-bezier(0.5, 0, 0.2, 1) var(--d) both;
  }
  @keyframes morph {
    0% {
      opacity: 0;
      transform: translate(var(--lx), var(--ly)) scaleX(1);
    }
    6% {
      opacity: 1;
    }
    20% {
      transform: translate(var(--lx), var(--ly)) scaleX(1);
    }
    32%,
    54% {
      transform: translate(var(--bx), var(--by)) scaleX(1);
    }
    68%,
    100% {
      transform: translate(0, 0) scaleX(var(--sx));
    }
  }
</style>
