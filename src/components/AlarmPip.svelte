<script lang="ts">
  // The widget's side of a ringing alarm: a small pill over the dial with the block's name, a
  // rocking bell and Stop / Snooze. The planner window rings and decides; this reads its
  // persisted state (lib/alarms.svelte.ts) and asks it to act.
  import { onMount } from 'svelte';
  import { scale } from 'svelte/transition';
  import { backOut } from 'svelte/easing';
  import { alarmFile } from '../lib/alarms.svelte';
  import { categoryColor, onColor } from '../lib/engine/categories';
  import Icon from '../lib/Icon.svelte';
  import { platform } from '../lib/platform';
  import { shownTitle } from '../lib/privacy';
  import { settings } from '../lib/stores/settings.svelte';
  import { view } from '../lib/stores/view.svelte';

  let { face, ink, dark }: { face: string; ink: string; dark: boolean } = $props();

  onMount(() => void alarmFile.load());

  const r = $derived(alarmFile.ready ? alarmFile.value.ringing : null);
  const c = $derived(r ? categoryColor(r.category, dark) : '');
  const ask = (a: 'stop' | 'snooze' | 'start') => void platform.broadcast('alarm', a);
</script>

{#if r}
  <div
    class="pip"
    class:calm={view.reducedMotion}
    role="alert"
    style:--face={face}
    style:--ink={ink}
    style:--c={c}
    style:--fg={onColor(c)}
    onpointerdown={(e) => e.stopPropagation()}
    ondblclick={(e) => e.stopPropagation()}
    transition:scale={{ start: 0.7, duration: view.reducedMotion ? 0 : 360, easing: backOut }}
  >
    <span class="bell"><Icon name="bell-ring" size={13} stroke={2.4} /></span>
    <button class="name" onclick={() => ask('start')} title="Start it now">{shownTitle(r.title || 'Alarm', r.category)}</button>
    <button class="act stop" onclick={() => ask('stop')} aria-label="Stop the alarm" title="Stop"><Icon name="alarm-off" size={13} stroke={2.3} /></button>
    <button class="act" onclick={() => ask('snooze')} aria-label={`Snooze ${settings.value.alarm.snooze} minutes`} title={`Snooze ${settings.value.alarm.snooze} min`}><Icon name="moon" size={13} stroke={2.3} /></button>
  </div>
{/if}

<style>
  .pip {
    position: absolute;
    top: 17%;
    left: 50%;
    z-index: 5;
    translate: -50% 0;
    display: flex;
    align-items: center;
    gap: 2px;
    max-width: 74%;
    height: 30px;
    padding: 0 3px 0 4px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--face) 94%, transparent);
    color: var(--ink);
    box-shadow:
      0 0 0 2px color-mix(in srgb, var(--c) 55%, transparent),
      0 4px 14px rgb(0 0 0 / 0.22);
    font: 500 12px/1 var(--font-ui);
    cursor: default;
  }
  .bell {
    flex: none;
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--c);
    color: var(--fg);
    animation: rock 1.9s ease-out infinite;
  }
  @keyframes rock {
    0%,
    48%,
    100% {
      transform: rotate(0);
    }
    8% {
      transform: rotate(-16deg);
    }
    18% {
      transform: rotate(13deg);
    }
    28% {
      transform: rotate(-7deg);
    }
    38% {
      transform: rotate(3deg);
    }
  }
  .calm .bell {
    animation: none;
  }
  .name {
    min-width: 0;
    padding: 0 5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
  }
  .act {
    flex: none;
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    cursor: pointer;
  }
  .act:hover {
    background: color-mix(in srgb, var(--ink) 12%, transparent);
  }
  .act.stop {
    background: var(--ink);
    color: var(--face);
  }
</style>
