<script lang="ts">
  // Settings › Rhythm › Breathe: the breathing guide on the dial. The pattern (box: in, hold,
  // out and rest all the same length; or calm, with a longer out-breath), each shown as a tiny
  // ring of its phases with a bead going round at the real pace; seconds each (box); rounds;
  // and the sound (a real-sounding breath, soft tones, or none), with "Try one breath": one
  // round of the sound, its words and a small ring in step. The preview stops when Settings
  // closes.
  import { untrack } from 'svelte';
  import { breathAt, PHASE_IDS, rhythmLength, rhythmOf, ROUNDS_RANGE, SECONDS_RANGE, type BreathPattern, type BreathState, type Rhythm } from '../../lib/breath.svelte';
  import { arc, phaseArcs, START } from '../../lib/breathPath';
  import { playCue, stopCues } from '../../lib/breathSound';
  import { categoryColor } from '../../lib/engine/categories';
  import Icon from '../../lib/Icon.svelte';
  import { settings } from '../../lib/stores/settings.svelte';
  import { view } from '../../lib/stores/view.svelte';
  import Segmented from '../Segmented.svelte';

  const b = $derived(settings.value.breathe);
  const r = $derived(rhythmOf(b));
  const still = $derived(view.reducedMotion);

  const PATTERNS: { id: BreathPattern; name: string; hint: string }[] = [
    { id: 'box', name: 'Box', hint: 'All equal' },
    { id: 'calm', name: 'Calm', hint: 'Longer breath out' },
  ];
  const rhythmFor = (id: BreathPattern) => rhythmOf({ ...b, pattern: id });
  const counts = (x: Rhythm) => x.phases.map((p) => p.ms / 1000).join(' · ');

  const SECONDS = Array.from({ length: SECONDS_RANGE[1] - SECONDS_RANGE[0] + 1 }, (_, i) => String(SECONDS_RANGE[0] + i));
  const SOUNDS = [
    { value: 'breath', label: 'Breath' },
    { value: 'tones', label: 'Tones' },
    { value: 'off', label: 'Off' },
  ] as const;
  const SOUND_HINT = {
    breath: 'A soft breath in and out, as long as each phase. Hold and rest stay quiet.',
    tones: 'A soft chime at each turn: rising to breathe in, falling to breathe out.',
    off: 'The dial guides you in silence.',
  } as const;

  function setRounds(n: number) {
    settings.value.breathe.rounds = Math.min(ROUNDS_RANGE[1], Math.max(ROUNDS_RANGE[0], n));
  }
  const total = $derived(r.totalMs < 120_000 ? `${Math.round(r.totalMs / 1000)} s` : rhythmLength(r));

  /** A pivot on a small ring's centre that turns its bead once round per breath (transform only). */
  function orbit(node: HTMLElement, p: { ms: number; on: boolean; once?: boolean }) {
    let a: Animation | null = null;
    const play = (o: typeof p) => {
      a?.cancel();
      a = null;
      if (!o.on || typeof node.animate !== 'function') return;
      a = node.animate([{ transform: `rotate(${START}deg)` }, { transform: `rotate(${START + 360}deg)` }], { duration: o.ms, iterations: o.once ? 1 : Infinity, easing: 'linear', fill: 'both' });
    };
    play(p);
    return { update: play, destroy: () => a?.cancel() };
  }

  /** Ring radii (px) of the tiles' and the try's little rings. */
  const TILE = 14.5;
  const TRY = 20;

  // ---- Try one breath: one round of the chosen pattern, with its sound, words and path.
  let trying = $state<{ at: number; r: Rhythm } | null>(null);
  let tryState = $state<BreathState | null>(null);
  let tick: ReturnType<typeof setTimeout> | null = null;

  function stopTry() {
    if (tick) clearTimeout(tick);
    tick = null;
    if (trying) stopCues(0.3);
    trying = null;
    tryState = null;
  }

  function tryOne() {
    if (trying) return stopTry();
    const one = rhythmOf({ ...settings.value.breathe, rounds: 1 });
    const voice = settings.value.breathe.sound;
    if (voice !== 'off' && settings.value.sound) {
      let t = 0;
      const seed = (Math.random() * 1e6) | 0;
      one.phases.forEach((p, i) => {
        playCue(p.id, voice, p.ms / 1000, { seed: seed + i, when: t });
        t += p.ms / 1000;
      });
    }
    const at = Date.now();
    trying = { at, r: one };
    const step = () => {
      const s = breathAt(Date.now() - at, one);
      tryState = s;
      if (!s) return stopTry();
      tick = setTimeout(step, Math.min(s.msLeft % 1000 || 1000, s.msLeft) + 15);
    };
    step();
  }

  // Changing the rhythm or the sound mid-try starts nothing new: it simply stops.
  $effect(() => {
    b.pattern;
    b.seconds;
    b.sound;
    untrack(() => trying && stopTry());
  });
  $effect(() => () => stopTry());

  const tryR = $derived(trying?.r ?? r);
</script>

<section style:--c={categoryColor('rest', view.finish.dark)}>
  <h3>Breathe</h3>
  <p class="hint top">A short guided breath on the dial. Start it with the Breathe button in the dial’s centre.</p>

  <div class="patterns" role="radiogroup" aria-label="Breathing pattern">
    {#each PATTERNS as p (p.id)}
      {@const on = b.pattern === p.id}
      {@const pr = rhythmFor(p.id)}
      <button class="pattern" class:on role="radio" aria-checked={on} title={p.id === 'box' ? 'Breathe in, hold, breathe out and rest, each for the same count' : 'Breathe in for 4, hold for 4, out for 6, rest for 2'} onclick={() => (settings.value.breathe.pattern = p.id)}>
        <span class="mini" aria-hidden="true" style:--r={`${TILE}px`}>
          <svg viewBox="-20 -20 40 40">
            {#each phaseArcs(pr, 9) as a (a.id)}<path d={arc(TILE, a.a0, a.a1)} class="side {a.id}" />{/each}
          </svg>
          <span class="pivot" use:orbit={{ ms: pr.cycleMs, on: on && !still }}><i class="bead"></i></span>
        </span>
        <span class="txt">
          <span class="name">{p.name}</span>
          <span class="meta">{p.hint}</span>
          <span class="meta tnum">{counts(pr)} s</span>
        </span>
        {#if on}<span class="tick" aria-hidden="true"><Icon name="check" size={13} stroke={2.6} /></span>{/if}
      </button>
    {/each}
  </div>

  {#if b.pattern === 'box'}
    <div class="row">
      <span class="lbl">Seconds each<small>In, hold, out and rest</small></span>
      <Segmented label="Seconds each" value={String(b.seconds) as (typeof SECONDS)[number]} options={SECONDS.map((s) => ({ value: s, label: `${s} s` }))} onchange={(v) => (settings.value.breathe.seconds = Number(v))} />
    </div>
  {/if}
  <div class="row">
    <span class="lbl">Rounds<small class="tnum">{total} in all</small></span>
    <span class="stepper">
      <button class="icon-btn" onclick={() => setRounds(b.rounds - 1)} disabled={b.rounds <= ROUNDS_RANGE[0]} aria-label="One round fewer">−</button>
      <span class="tnum count">{b.rounds}</span>
      <button class="icon-btn" onclick={() => setRounds(b.rounds + 1)} disabled={b.rounds >= ROUNDS_RANGE[1]} aria-label="One round more">+</button>
    </span>
  </div>
  <div class="row">
    <span>Sound</span>
    <Segmented label="Breathing sound" value={b.sound} options={[...SOUNDS]} onchange={(v) => (settings.value.breathe.sound = v)} />
  </div>
  <p class="hint">{SOUND_HINT[b.sound]}{#if !settings.value.sound && b.sound !== 'off'} Sounds are off in Transitions, so the guide is silent for now.{/if}</p>

  <div class="try" class:live={!!trying}>
    <button class="try-btn" onclick={tryOne} aria-label={trying ? 'Stop the breath' : 'Try one breath'}>
      <span class="play" aria-hidden="true"><Icon name={trying ? 'square' : 'play'} size={11} stroke={2.6} /></span>
      <span>{trying ? 'Stop' : 'Try one breath'}</span>
    </button>
    <div class="try-guide" aria-live="polite">
      <span class="mini big" aria-hidden="true" style:--r={`${TRY}px`}>
        <svg viewBox="-25 -25 50 50">
          {#each phaseArcs(tryR, 8) as a, k (a.id)}
            <path d={arc(TRY, a.a0, a.a1)} class="side {a.id}" class:lit={!!tryState && PHASE_IDS.indexOf(tryState.id) >= k} class:now={tryState?.id === a.id} />
          {/each}
        </svg>
        {#if trying && !still}
          {#key trying.at}
            <span class="pivot" use:orbit={{ ms: trying.r.cycleMs, on: true, once: true }}><i class="bead"></i></span>
          {/key}
        {/if}
      </span>
      <span class="try-words">
        {#if tryState}
          <strong>{tryState.word}</strong><span class="tnum">{tryState.secondsLeft}</span>
        {:else}
          <span class="quiet tnum">One round, {r.cycleMs / 1000} s</span>
        {/if}
      </span>
    </div>
  </div>
</section>

<style>
  section {
    padding: var(--s-4) 0;
    border-top: 1px solid var(--line);
  }
  h3 {
    margin: 0 0 var(--s-3);
    font-family: var(--font-ui);
    font-size: var(--t-md);
    font-weight: 500;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-3);
    min-height: 40px;
    font-size: var(--t-sm);
  }
  .row > span:first-child {
    color: var(--ink-2);
  }
  .lbl {
    display: grid;
    gap: 1px;
  }
  .lbl small {
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .hint {
    margin: var(--s-1) 0 0;
    font-size: var(--t-xs);
    color: var(--ink-3);
    line-height: 1.5;
  }
  .hint.top {
    margin: -6px 0 var(--s-3);
  }

  /* --- patterns: two tiles, each with its path going round --------------------------- */
  .patterns {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
    margin-bottom: var(--s-2);
  }
  .pattern {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    padding: 8px 10px 8px 8px;
    border-radius: var(--r-md);
    border: 1px solid var(--line-strong);
    text-align: left;
    transition:
      border-color var(--dur-1) var(--ease-out),
      background var(--dur-2) var(--ease-out),
      box-shadow var(--dur-2) var(--ease-out);
  }
  .pattern:hover {
    border-color: var(--ink-3);
  }
  .pattern.on {
    border-color: var(--ink);
    background: var(--surface);
    box-shadow: inset 0 0 0 1px var(--ink);
  }
  .txt {
    display: grid;
    gap: 1px;
    min-width: 0;
  }
  .name {
    font-family: var(--font-ui);
    font-size: var(--t-sm);
    color: var(--ink-2);
  }
  .on .name {
    color: var(--ink);
    font-weight: 500;
  }
  .meta {
    font-size: var(--t-xs);
    color: var(--ink-3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tick {
    display: grid;
    margin-left: auto;
    color: var(--ink);
    animation: tick-in 0.36s var(--ease-settle);
  }
  @keyframes tick-in {
    from {
      transform: scale(0.3);
      opacity: 0;
    }
  }

  /* The little path and its bead (the bead moves by transform only). */
  .mini {
    position: relative;
    flex: none;
    width: 40px;
    height: 40px;
  }
  .mini svg {
    display: block;
    width: 100%;
    height: 100%;
    overflow: visible;
  }
  /* The tiles' paths, each side in its phase's colour: a little diagram, not a control. */
  .pattern .side {
    fill: none;
    stroke-width: 2.2;
    opacity: 0.4;
    transition: opacity var(--dur-2) var(--ease-out);
  }
  .pattern.on .side {
    opacity: 0.9;
  }
  .side.in {
    stroke: color-mix(in oklch, var(--c) 52%, #ff8a6a);
  }
  .side.hold {
    stroke: var(--c);
  }
  .side.out {
    stroke: color-mix(in oklch, var(--c) 58%, #2f9dff);
  }
  .side.rest {
    stroke: color-mix(in oklab, var(--c) 70%, var(--ink));
  }
  /* The bead rides its ring: a zero-size pivot on the centre turns; the bead sits at its top. */
  .pivot {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 0;
    height: 0;
    transform: rotate(225deg);
    will-change: transform;
  }
  .bead {
    position: absolute;
    left: -3px;
    top: calc(var(--r) * -1 - 3px);
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--c);
    box-shadow: 0 0 6px color-mix(in srgb, var(--c) 70%, transparent);
  }
  .pattern:not(.on) .pivot {
    opacity: 0;
  }

  /* --- stepper ------------------------------------------------------------------------ */
  .stepper {
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }
  .stepper .icon-btn {
    width: 28px;
    height: 28px;
    font-size: 16px;
  }
  .stepper .icon-btn:disabled {
    opacity: 0.35;
    pointer-events: none;
  }
  .count {
    min-width: 2ch;
    text-align: center;
  }

  /* --- try one breath ------------------------------------------------------------------- */
  .try {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    margin-top: var(--s-3);
    padding: 8px 12px 8px 8px;
    border-radius: var(--r-md);
    background: var(--sunken);
  }
  .try-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 32px;
    padding: 0 12px 0 4px;
    border-radius: 999px;
    font-size: var(--t-sm);
    color: var(--ink);
    background: var(--raised);
    box-shadow: 0 0 0 1px var(--line);
    transition: background var(--dur-1) var(--ease-out);
    flex: none;
  }
  .try-btn:hover {
    background: var(--surface);
  }
  .play {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--ink);
    color: var(--ink-inverse);
  }
  .play :global(svg) {
    margin-left: 1px;
  }
  .live .play :global(svg) {
    margin-left: 0;
  }
  .try-guide {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    margin-left: auto;
  }
  .mini.big {
    width: 50px;
    height: 50px;
  }
  .mini.big .bead {
    left: -3.5px;
    top: calc(var(--r) * -1 - 3.5px);
    width: 7px;
    height: 7px;
  }
  /* Try: the path is faint until each side's phase comes, then lit; the side you are on is brightest. */
  .try .side {
    fill: none;
    stroke-width: 2.4;
    opacity: 0.18;
    transition: opacity 500ms var(--ease-out);
  }
  .try .side.lit {
    opacity: 0.45;
  }
  .try .side.now {
    opacity: 1;
  }
  .try-words {
    display: inline-flex;
    align-items: baseline;
    gap: 8px;
    min-width: 9.5em;
    font-size: var(--t-sm);
  }
  .try-words strong {
    font-weight: 500;
    color: var(--ink);
  }
  .try-words .tnum {
    color: var(--ink-3);
  }
  .quiet {
    color: var(--ink-3);
    font-size: var(--t-xs);
  }

  :global([data-motion='calm']) .tick {
    animation: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .tick {
      animation: none;
    }
  }
</style>
