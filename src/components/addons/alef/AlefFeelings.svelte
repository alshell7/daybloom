<script lang="ts">
  // All of Alef's feelings: 32 little performances in 8 groups (pleasant or not, active or
  // not). Tap one to see it on the stage, or play them all.
  import { onDestroy } from 'svelte';
  import { alefFile } from '../../../lib/addons/alef/alef.svelte';
  import { BEHAVIORS, BY_CORE, CORE_LABEL, lengthOf, type BehaviorId, type CoreState } from '../../../lib/addons/alef/behaviors';
  import { chirp } from '../../../lib/addons/alef/chirps';
  import Icon from '../../../lib/Icon.svelte';
  import { settings } from '../../../lib/stores/settings.svelte';
  import { view } from '../../../lib/stores/view.svelte';
  import AlefFace from './AlefFace.svelte';
  import AlefMini from './AlefMini.svelte';

  const ORDER: CoreState[] = ['pleasant-active', 'pleasant', 'pleasant-inactive', 'active', 'inactive', 'unpleasant-active', 'unpleasant', 'unpleasant-inactive'];
  const s = $derived(alefFile.value.settings);

  let perf = $state<{ id: BehaviorId; seq: number }>({ id: 'happy', seq: 0 });
  let performing = $state(false);
  let seq = 0;
  let stopAt: ReturnType<typeof setTimeout> | null = null;
  let tour: ReturnType<typeof setTimeout> | null = null;
  let touring = $state(false);

  function show(id: BehaviorId, sound = true) {
    perf = { id, seq: ++seq };
    performing = true;
    if (stopAt) clearTimeout(stopAt);
    stopAt = setTimeout(() => (performing = false), Math.min(lengthOf(BEHAVIORS[id]), 6000) + 150);
    if (sound && settings.value.sound && s.voice !== 'off') chirp(BEHAVIORS[id].chirp, { pitch: s.pitch, volume: s.volume });
  }

  function playAll() {
    if (touring) return stopTour();
    touring = true;
    const all = ORDER.flatMap((c) => BY_CORE[c]);
    let i = 0;
    const next = () => {
      if (i >= all.length) return stopTour();
      const id = all[i++];
      show(id, false);
      tour = setTimeout(next, Math.min(lengthOf(BEHAVIORS[id]), 2600) + 500);
    };
    next();
  }
  function stopTour() {
    touring = false;
    if (tour) clearTimeout(tour);
    tour = null;
  }
  onDestroy(() => {
    stopTour();
    if (stopAt) clearTimeout(stopAt);
  });

  const affect = { v: 0.2, a: 0 };
</script>

<div class="stage-wrap"><div class="stage">
  <div class="face">
    <AlefFace {perf} {performing} {affect} eyes={s.eyes} led={s.led} reduced={view.reducedMotion} posture interactive={false} gaze={false} label={`Alef, ${BEHAVIORS[perf.id].label}`} />
  </div>
  <div class="now">
    <span class="core">{CORE_LABEL[BEHAVIORS[perf.id].core]}</span>
    <b>{BEHAVIORS[perf.id].label}</b>
    <button class="btn btn-soft" onclick={playAll}><Icon name={touring ? 'pause' : 'play'} size={13} /> {touring ? 'Stop' : 'Play all 32'}</button>
  </div>
</div></div>

<div class="groups">
  {#each ORDER as core (core)}
    <section>
      <h5>{CORE_LABEL[core]}</h5>
      <div class="tiles">
        {#each BY_CORE[core] as id (id)}
          <button class="tile" class:on={perf.id === id} onclick={() => (stopTour(), show(id))} aria-label={`Show ${BEHAVIORS[id].label}`}>
            <AlefMini feeling={id} eyes={s.eyes} size={52} />
            <span>{BEHAVIORS[id].label.replace(' (cute)', '')}</span>
          </button>
        {/each}
      </div>
    </section>
  {/each}
</div>

<style>
  /* The stage stays in view while you pick feelings further down. */
  .stage-wrap {
    position: sticky;
    top: 0;
    z-index: 2;
    padding-bottom: var(--s-3);
    background: var(--raised);
  }
  .stage {
    display: flex;
    align-items: center;
    gap: var(--s-4);
    padding: var(--s-4) var(--s-3) var(--s-3);
    border-radius: var(--r-lg);
    background: color-mix(in srgb, var(--ink) 4%, var(--raised));
  }
  .face {
    width: 180px;
    flex: none;
    padding-top: 8px;
  }
  .now {
    display: grid;
    gap: 4px;
    justify-items: start;
  }
  .core {
    font-size: var(--t-xs);
    color: var(--ink-3);
  }
  .now b {
    font-family: var(--font-read);
    font-size: var(--t-lg);
    font-weight: 500;
    margin-bottom: 6px;
  }
  .groups {
    display: grid;
    gap: var(--s-3);
  }
  h5 {
    margin: 0 0 6px;
    font-family: var(--font-ui);
    font-size: var(--t-xs);
    font-weight: 500;
    color: var(--ink-3);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
    gap: 6px;
  }
  .tile {
    display: grid;
    justify-items: center;
    gap: 6px;
    padding: 10px 6px 8px;
    border-radius: var(--r-md);
    border: 1px solid transparent;
    font-size: var(--t-xs);
    color: var(--ink-2);
    transition:
      background var(--dur-1) var(--ease-out),
      border-color var(--dur-1) var(--ease-out),
      transform var(--dur-1) var(--ease-out);
  }
  .tile:hover {
    background: color-mix(in srgb, var(--ink) 5%, transparent);
    color: var(--ink);
  }
  .tile:active {
    transform: scale(0.96);
  }
  .tile.on {
    border-color: var(--line-strong);
    background: color-mix(in srgb, var(--ink) 6%, transparent);
    color: var(--ink);
  }
</style>
