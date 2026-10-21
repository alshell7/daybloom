<script lang="ts">
  // "Too big?" A task that feels like a boulder breaks into a few pebbles: small steps you can
  // change, remove or add to. The first always takes about two minutes and can start right away.
  // The built-in ideas show at once; with an AI service chosen in Settings › AI, its steps for
  // this exact task replace them when they arrive.
  import { tick } from 'svelte';
  import { backOut, cubicOut } from 'svelte/easing';
  import { fade, fly, slide } from 'svelte/transition';
  import { makeSmaller, variantsOf } from '../../../lib/addons/smaller/split';
  import { keepSteps, startFirstStep } from '../../../lib/addons/smaller/smaller.svelte';
  import { categoryColor } from '../../../lib/engine/categories';
  import type { Task } from '../../../lib/engine/types';
  import Icon from '../../../lib/Icon.svelte';
  import { sounds } from '../../../lib/sound';
  import { settings } from '../../../lib/stores/settings.svelte';
  import { timer } from '../../../lib/stores/timer.svelte';
  import { view } from '../../../lib/stores/view.svelte';
  import { ai } from '../../../lib/ai/hub.svelte';

  let {
    task,
    blockKey = null,
    minutes = 30,
    open = $bindable(false),
    tone = 'panel',
  }: { task: Task; blockKey?: string | null; minutes?: number; open?: boolean; tone?: 'panel' | 'focus' } = $props();

  let variant = $state(0);
  let steps = $state<{ id: number; title: string; minutes: number; doneWhen?: string }[]>([]);
  /** The AI's one practical tip for this task. */
  let tip = $state<string | null>(null);
  /** The step being split again (its id). */
  let splitting = $state<number | null>(null);
  let seq = 0;
  let kept = $state(0);
  const rm = $derived(view.reducedMotion);
  const color = $derived(categoryColor(task.category, view.finish.dark));
  const variants = $derived(variantsOf(task.title, task.category));

  const aiOn = $derived(ai.ready('smaller', 'think'));
  let thinking = $state(false);
  let asked = 0;
  function generate(v = variant) {
    const shown = steps.map((s) => s.title);
    steps = makeSmaller(task.title, { category: task.category, minutes, variant: v }).map((s) => ({ ...s, id: ++seq }));
    tip = null;
    if (aiOn) void askAi(v ? shown : []);
  }
  /** Steps from the AI service; kept only if you haven't changed the built-in ones meanwhile. */
  async function askAi(avoid: string[]) {
    const mine = ++asked;
    const before = JSON.stringify(steps.map((s) => s.title));
    thinking = true;
    try {
      const { aiSteps } = await import('../../../lib/addons/smaller/aiSplit');
      const got = await aiSteps({ task, blockKey, minutes, avoid });
      if (got && mine === asked && open && JSON.stringify(steps.map((s) => s.title)) === before) {
        steps = got.steps.map((s) => ({ ...s, id: ++seq }));
        tip = got.tip ?? null;
      }
    } finally {
      if (mine === asked) thinking = false;
    }
  }
  /** Split one step again: its smaller steps take its place. */
  async function smallerStep(id: number) {
    const s = steps.find((x) => x.id === id);
    if (!s || splitting) return;
    splitting = id;
    try {
      const { aiSplitStep } = await import('../../../lib/addons/smaller/aiSplit');
      const got = await aiSplitStep({ task, step: s });
      const i = steps.findIndex((x) => x.id === id);
      if (got && i >= 0) steps = [...steps.slice(0, i), ...got.map((g) => ({ ...g, id: ++seq })), ...steps.slice(i + 1)];
      if (settings.value.sound) sounds.tick();
    } finally {
      splitting = null;
    }
  }
  async function expand() {
    open = true;
    kept = 0;
    generate();
    if (settings.value.sound) sounds.tick();
    await tick();
  }
  function other() {
    variant = (variant + 1) % Math.max(1, aiOn ? 99 : variants);
    generate(variant);
  }
  function add() {
    steps = [...steps, { id: ++seq, title: '', minutes: 5 }];
    void tick().then(() => document.querySelector<HTMLInputElement>(`[data-pebble="${seq}"]`)?.focus());
  }
  function keep() {
    const n = steps.filter((s) => s.title.trim()).length;
    keepSteps(task, steps);
    if (settings.value.sound) sounds.done();
    kept = n;
    open = false;
  }
  function start() {
    startFirstStep(task, steps, blockKey);
    open = false;
  }

  /** Pebbles tumble out of the boulder, one after another. */
  function tumble(_node: Element, { i }: { i: number }) {
    return {
      delay: rm ? 0 : 90 + i * 75,
      duration: rm ? 0 : 520,
      easing: backOut,
      css: (t: number) => `opacity:${Math.min(1, t * 1.6)};transform:translateY(${(1 - t) * -14}px) scale(${0.72 + 0.28 * t})`,
    };
  }
</script>

{#if !open}
  <div class="closed">
    <button class="ask" class:focus={tone === 'focus'} onclick={expand} style:--c={color}>
      <span class="ico"><Icon name="layers" size={14} stroke={2} /></span>
      Too big? <b>Make it smaller</b>
    </button>
    {#if kept}<span class="kept" in:fade={{ duration: rm ? 0 : 200 }} out:fade>{kept} small steps added</span>{/if}
  </div>
{:else}
  <div class="card" class:focus={tone === 'focus'} style:--c={color} transition:slide={{ duration: rm ? 0 : 260, easing: cubicOut }}>
    <div class="boulder" in:fly={{ y: 4, duration: rm ? 0 : 280 }}>
      <span class="rock"><Icon name={task.icon} size={15} stroke={2} /></span>
      <span class="t">{task.title || 'This task'}</span>
      <span class="m tnum">{minutes}m</span>
    </div>
    <div class="seam" aria-hidden="true"></div>

    {#key variant}
      <ol class="pebbles" aria-label="Smaller steps">
        {#each steps as s, i (s.id)}
          <li class:first={i === 0} in:tumble={{ i }} out:fade={{ duration: rm ? 0 : 120 }}>
            <span class="n tnum">{i + 1}</span>
            <input class="title" data-pebble={s.id} bind:value={s.title} placeholder="A small step" aria-label={`Step ${i + 1}`} title={s.title} />
            <span class="mins tnum">{s.minutes}m</span>
            {#if aiOn && s.minutes >= 6}
              <button class="rm sm" class:busy={splitting === s.id} onclick={() => void smallerStep(s.id)} disabled={!!splitting} aria-label="Make this step smaller" title="Make this step smaller"><Icon name="layers" size={12} /></button>
            {/if}
            <button class="rm" onclick={() => (steps = steps.filter((x) => x.id !== s.id))} aria-label="Remove this step"><Icon name="x" size={12} /></button>
            {#if i === 0}<span class="here">Start here</span>{/if}
            {#if s.doneWhen}<span class="when">Done when: {s.doneWhen}</span>{/if}
          </li>
        {/each}
      </ol>
    {/key}

    {#if tip}<p class="tip" in:fly={{ y: 4, duration: rm ? 0 : 260 }}><Icon name="lightbulb" size={13} /> {tip}</p>{/if}

    <div class="tools">
      <button class="link" onclick={add}><Icon name="plus" size={13} /> Add a step</button>
      {#if variants > 1 || aiOn}<button class="link" onclick={other} disabled={thinking}><Icon name="shuffle" size={13} /> Other ideas</button>{/if}
      {#if thinking}<span class="thinking" in:fade={{ duration: rm ? 0 : 200 }}><Icon name="sparkles" size={12} /> Finding steps for this task…</span>{/if}
    </div>

    <div class="actions">
      {#if !timer.active}
        <button class="btn btn-primary" onclick={start} disabled={!steps.some((s) => s.title.trim())}>
          <Icon name="play" size={13} stroke={2.4} /> Start the first step · {steps[0]?.minutes ?? 2} min
        </button>
      {/if}
      <button class={timer.active ? 'btn btn-primary' : 'btn btn-soft'} onclick={keep} disabled={!steps.some((s) => s.title.trim())}>Keep the steps</button>
      <button class="btn btn-quiet" onclick={() => (open = false)}>Not now</button>
    </div>
  </div>
{/if}

<style>
  /* The step's finish line, under its title. */
  .when {
    flex-basis: 100%;
    margin-top: -6px;
    padding: 0 0 7px 30px;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .tip {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    margin: var(--s-2) 0 0;
    padding: 8px 10px;
    border-radius: var(--r-md);
    background: color-mix(in srgb, var(--c) 8%, var(--sunken));
    font-size: var(--t-xs);
    line-height: 1.45;
    color: var(--ink-2);
  }
  .tip :global(svg) {
    flex: none;
    margin-top: 1px;
    color: var(--c);
  }
  .rm.sm.busy {
    opacity: 0.5;
  }
  .thinking {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    margin-left: auto;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .closed {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    flex-wrap: wrap;
  }
  .ask {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    height: 32px;
    padding: 0 12px 0 5px;
    border-radius: var(--r-pill);
    font-size: var(--t-sm);
    color: var(--ink-2);
    background: color-mix(in srgb, var(--c) 9%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c) 26%, transparent);
    transition:
      background var(--dur-1) var(--ease-out),
      transform var(--dur-1) var(--ease-out);
  }
  .ask b {
    font-weight: 500;
    color: var(--ink);
  }
  .ask:hover {
    background: color-mix(in srgb, var(--c) 15%, transparent);
  }
  .ask:active {
    transform: scale(0.97);
  }
  .ask .ico {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    color: color-mix(in srgb, var(--c) 80%, var(--ink));
    background: color-mix(in srgb, var(--c) 18%, transparent);
  }
  .kept {
    font-size: var(--t-xs);
    color: var(--ink-3);
  }

  .card {
    padding: var(--s-3);
    border-radius: var(--r-md);
    background: color-mix(in srgb, var(--c) 6%, var(--raised));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c) 20%, var(--line));
  }
  .boulder {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px 6px 6px;
    border-radius: var(--r-pill);
    background: color-mix(in srgb, var(--c) 16%, var(--raised));
    font-size: var(--t-sm);
    font-weight: 500;
  }
  .rock {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    flex: none;
    border-radius: 50%;
    color: white;
    background: var(--c);
  }
  .boulder .t {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .boulder .m {
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  /* A soft seam between the boulder and its pebbles. */
  .seam {
    width: 2px;
    height: 12px;
    margin: 2px 0 2px 19px;
    border-radius: 1px;
    background: linear-gradient(color-mix(in srgb, var(--c) 45%, transparent), transparent);
  }
  .pebbles {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
  }
  .pebbles li {
    position: relative;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    min-height: 40px;
    padding: 0 6px 0 7px;
    border-radius: 20px;
    background: var(--raised);
    box-shadow:
      0 1px 2px rgb(21 28 42 / 0.05),
      inset 0 0 0 1px var(--line);
  }
  .pebbles li.first {
    box-shadow:
      0 0 0 3px color-mix(in srgb, var(--c) 16%, transparent),
      inset 0 0 0 1.5px color-mix(in srgb, var(--c) 55%, transparent);
  }
  .n {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    flex: none;
    border-radius: 50%;
    font-size: var(--t-xs);
    font-weight: 600;
    color: color-mix(in srgb, var(--c) 78%, var(--ink));
    background: color-mix(in srgb, var(--c) 15%, transparent);
  }
  .first .n {
    color: white;
    background: var(--c);
  }
  .title {
    flex: 1;
    min-width: 0;
    height: 30px;
    border: 0;
    background: transparent;
    outline: none;
    font-size: var(--t-sm);
    color: var(--ink);
  }
  .mins {
    flex: none;
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .rm {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    flex: none;
    border-radius: 50%;
    color: var(--ink-3);
    opacity: 0;
    transition: opacity var(--dur-1) var(--ease-out);
  }
  .pebbles li:hover .rm,
  .rm:focus-visible {
    opacity: 1;
  }
  .rm:hover {
    background: var(--sunken);
    color: var(--ink);
  }
  .here {
    position: absolute;
    right: 12px;
    top: -9px;
    padding: 0 7px;
    border-radius: var(--r-pill);
    font-size: 10.5px;
    font-weight: 600;
    line-height: 17px;
    color: white;
    background: var(--c);
  }
  .tools {
    display: flex;
    gap: var(--s-3);
    margin: var(--s-2) 2px;
  }
  .link {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: var(--t-xs);
    font-weight: 500;
    color: var(--ink-2);
    padding: 3px 6px;
    margin-left: -6px;
    border-radius: var(--r-pill);
  }
  .link:hover {
    background: var(--sunken);
    color: var(--ink);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-2);
  }
  .actions .btn {
    height: 34px;
    padding: 0 14px;
    gap: 6px;
  }
  /* In focus mode it sits on the dark focus surface. */
  .focus.card {
    background: color-mix(in srgb, var(--c) 8%, var(--surface));
  }
</style>
