<script lang="ts">
  // Settings › Rhythm › Alarm: the tone (each with a preview), the alarm's own volume, how long
  // a snooze lasts, a gentle start, and how long it rings before it stops by itself. A block
  // becomes an alarm in its editor ("Ring as an alarm"). Previews stop when Settings closes.
  import { ALARM_TONES, GENTLE_SECONDS, previewTone, previewVolume, stopPreview, toneById } from '../../lib/alarm';
  import Icon from '../../lib/Icon.svelte';
  import { settings } from '../../lib/stores/settings.svelte';
  import Segmented from '../Segmented.svelte';

  const a = $derived(settings.value.alarm);
  /** The tone playing a preview, and for how long (drives the little progress line). */
  let playing = $state<string | null>(null);
  let playMs = $state(0);

  function play(id: string) {
    if (playing === id) return stopPreview();
    const secs = previewTone(id, settings.value.alarm.volume, () => {
      if (playing === id) playing = null;
    });
    playing = secs ? id : null;
    playMs = Math.round(secs * 1000);
  }

  function choose(id: string) {
    settings.value.alarm.tone = id;
    play(id);
  }

  $effect(() => () => stopPreview());

  const SNOOZE = ['5', '10', '15'] as const;
  const RING_FOR = ['1', '3', '5', '10'] as const;
</script>

<section>
  <h3>Alarm</h3>
  <p class="hint top">Any timed block can ring like an alarm: open it and switch on “Ring as an alarm”.</p>
  <div class="tones" role="radiogroup" aria-label="Alarm tone">
    {#each ALARM_TONES as t (t.id)}
      {@const on = a.tone === t.id}
      {@const live = playing === t.id}
      <div class="tone" class:on class:live>
        <button class="play" onclick={() => play(t.id)} aria-label={live ? `Stop ${t.name}` : `Play ${t.name}`} title={live ? 'Stop' : 'Listen'}>
          {#if live}
            <span class="eq" aria-hidden="true"><i></i><i></i><i></i></span>
          {:else}
            <Icon name="play" size={11} stroke={2.6} />
          {/if}
        </button>
        <button class="pick" role="radio" aria-checked={on} onclick={() => choose(t.id)}>{t.name}</button>
        {#if on}<span class="tick" aria-hidden="true"><Icon name="check" size={13} stroke={2.6} /></span>{/if}
        {#if live}<span class="bar" style:animation-duration={`${playMs}ms`} aria-hidden="true"></span>{/if}
      </div>
    {/each}
  </div>
  <p class="hint tone-hint">{toneById(a.tone).hint}.</p>

  <div class="row">
    <span>Volume</span>
    <span class="vol">
      <Icon name="volume" size={14} />
      <input
        type="range"
        min="0.1"
        max="1"
        step="0.05"
        bind:value={settings.value.alarm.volume}
        oninput={(e) => previewVolume(+e.currentTarget.value)}
        onchange={() => playing || play(a.tone)}
        aria-label="Alarm volume"
      />
    </span>
  </div>
  <div class="row">
    <span>Snooze for</span>
    <Segmented label="Snooze for" value={String(a.snooze) as (typeof SNOOZE)[number]} options={SNOOZE.map((m) => ({ value: m, label: `${m} min` }))} onchange={(v) => (settings.value.alarm.snooze = Number(v))} />
  </div>
  <div class="row">
    <span>Rings for</span>
    <Segmented label="Rings for" value={String(a.ringFor) as (typeof RING_FOR)[number]} options={RING_FOR.map((m) => ({ value: m, label: `${m} min` }))} onchange={(v) => (settings.value.alarm.ringFor = Number(v))} />
  </div>
  <label class="row">
    <span class="lbl">Gentle start<small>Starts quiet and grows to full over {GENTLE_SECONDS} seconds</small></span>
    <input type="checkbox" class="switch" bind:checked={settings.value.alarm.gentle} />
  </label>
  <p class="hint">Alarms have their own volume and ring even when Sounds are off. If nobody stops one, it goes quiet after {a.ringFor} min and leaves a note.</p>
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
  /* A phone: a control that doesn't fit beside its label goes under it, on the right. */
  @media (max-width: 480px) {
    .row {
      flex-wrap: wrap;
      row-gap: var(--s-2);
    }
    .row > :last-child:not(:first-child) {
      margin-left: auto;
    }
    /* A switch stays beside its words; the words wrap instead. */
    .row:has(> .switch) > :first-child {
      flex: 1 1 0;
      min-width: 0;
    }
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
    margin: var(--s-2) 0 0;
    font-size: var(--t-xs);
    color: var(--ink-3);
    line-height: 1.5;
  }
  .hint.top {
    margin: -6px 0 var(--s-3);
  }
  .tone-hint {
    margin: var(--s-2) 2px var(--s-2);
    min-height: 1.5em;
  }

  /* --- tones: a two-column grid of small tiles ------------------------------- */
  .tones {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
  }
  .tone {
    position: relative;
    display: flex;
    align-items: center;
    gap: 2px;
    height: 40px;
    padding: 0 8px 0 6px;
    border-radius: var(--r-md);
    border: 1px solid var(--line-strong);
    transition:
      border-color var(--dur-1) var(--ease-out),
      background var(--dur-2) var(--ease-out),
      box-shadow var(--dur-2) var(--ease-out);
  }
  .tone:hover {
    border-color: var(--ink-3);
  }
  .tone.on {
    border-color: var(--ink);
    background: var(--surface);
    box-shadow: inset 0 0 0 1px var(--ink);
  }
  .play {
    flex: none;
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: var(--sunken);
    color: var(--ink-2);
    transition:
      background var(--dur-2) var(--ease-out),
      color var(--dur-2) var(--ease-out),
      transform var(--dur-1) var(--ease-out);
  }
  .play:hover {
    color: var(--ink);
    transform: scale(1.08);
  }
  .play:active {
    transform: scale(0.9);
  }
  .play :global(svg) {
    margin-left: 1px;
  }
  .live .play {
    background: var(--ink);
    color: var(--ink-inverse);
  }
  .pick {
    flex: 1;
    min-width: 0;
    height: 100%;
    padding: 0 6px;
    text-align: left;
    font-family: var(--font-ui);
    font-size: var(--t-sm);
    color: var(--ink-2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .on .pick {
    color: var(--ink);
    font-weight: 500;
  }
  .tick {
    display: grid;
    color: var(--ink);
    animation: tick-in 0.36s var(--ease-settle);
  }
  @keyframes tick-in {
    from {
      transform: scale(0.3);
      opacity: 0;
    }
  }
  /* Three little bars bounce while a preview plays (it lasts a few seconds, then they rest). */
  .eq {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    height: 10px;
  }
  .eq i {
    width: 2.5px;
    height: 10px;
    border-radius: 1px;
    background: currentColor;
    transform-origin: bottom;
    animation: eq 0.62s var(--ease-in-out) infinite alternate;
  }
  .eq i:nth-child(2) {
    animation-duration: 0.48s;
    animation-delay: -0.2s;
  }
  .eq i:nth-child(3) {
    animation-duration: 0.7s;
    animation-delay: -0.35s;
  }
  @keyframes eq {
    from {
      transform: scaleY(0.3);
    }
    to {
      transform: scaleY(1);
    }
  }
  /* How far through the preview: a hairline that draws along the foot of the tile, once. */
  .bar {
    position: absolute;
    left: 14px;
    right: 14px;
    bottom: 4px;
    height: 2px;
    border-radius: 1px;
    background: color-mix(in srgb, var(--ink) 28%, transparent);
    transform-origin: left;
    animation: fill linear forwards;
  }
  @keyframes fill {
    from {
      transform: scaleX(0);
    }
  }

  .vol {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    color: var(--ink-3);
  }
  input[type='range'] {
    accent-color: var(--ink);
    width: 160px;
  }

  :global([data-motion='calm']) .eq i,
  :global([data-motion='calm']) .tick {
    animation: none;
  }
  :global([data-motion='calm']) .eq i:nth-child(1) {
    transform: scaleY(0.6);
  }
  :global([data-motion='calm']) .eq i:nth-child(3) {
    transform: scaleY(0.45);
  }
  @media (prefers-reduced-motion: reduce) {
    .eq i,
    .tick {
      animation: none;
    }
  }
</style>
