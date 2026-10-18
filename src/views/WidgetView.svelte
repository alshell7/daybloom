<script lang="ts">
  import Dial from '../lib/dial/Dial.svelte';
  import Readout from '../lib/dial/Readout.svelte';
  import { mix } from '../lib/engine/categories';
  import Icon from '../lib/Icon.svelte';
  import { platform } from '../lib/platform';
  import { PRESET_ORDER, PRESETS, resolveFinish, type FinishId } from '../lib/presets';
  import { clock } from '../lib/stores/clock.svelte';
  import { settings } from '../lib/stores/settings.svelte';
  import { timer } from '../lib/stores/timer.svelte';
  import { view } from '../lib/stores/view.svelte';

  // The desktop object: a watch on your wallpaper. Drag to move, double-click to open
  // the planner, hover for a few quiet controls.
  const w = $derived(settings.value.widget);
  const presetId = $derived(w.preset);
  const finish = $derived(resolveFinish(w.finish as FinishId, view.theme));
  const timed = $derived(presetId === 'timer60' || presetId === 'chrono');
  const ts = $derived(timer.active ? timer.status(clock.now) : null);

  const blocks = $derived(timed && timer.active ? timer.blocks(clock.minute, finish.dark) : view.pool);
  const wedge = $derived.by(() => {
    if (!timed) return null;
    if (ts && !ts.finished) {
      const segs = timer.blocks(clock.minute, finish.dark);
      return { key: `timer:${ts.index}`, startMs: clock.now, endMs: clock.now + ts.remainingMs, color: segs[ts.index]?.color ?? finish.signal };
    }
    const c = view.now.current;
    if (c) return { key: c.key, startMs: c.startMs, endMs: c.endMs, color: c.color };
    const n = view.now.next;
    if (n && n.startMs - clock.now <= 60 * 60_000) return { key: null, startMs: clock.now, endMs: n.startMs, color: mix(finish.track, finish.face, 0.62), edgeColor: n.color };
    return null;
  });

  function cyclePreset() {
    const i = PRESET_ORDER.indexOf(presetId);
    settings.value.widget.preset = PRESET_ORDER[(i + 1) % PRESET_ORDER.length];
  }

  async function toggleLayer() {
    const next = w.layer === 'top' ? 'desktop' : 'top';
    settings.value.widget.layer = next;
    await platform.setWidgetLayer(next);
  }

  const SIZES = [200, 280, 380];
  async function cycleSize() {
    if (!platform.isNative) return;
    const { getCurrentWindow, LogicalSize } = await import('@tauri-apps/api/window');
    const win = getCurrentWindow();
    const cur = (await win.innerSize()).toLogical(await win.scaleFactor()).width;
    const next = SIZES.find((s) => s > cur + 10) ?? SIZES[0];
    await win.setSize(new LogicalSize(next, next));
  }

  function onDown(e: PointerEvent) {
    if (e.button !== 0 || (e.target as HTMLElement).closest('.tools')) return;
    platform.startDrag();
  }
</script>

<div
  class="widget"
  role="presentation"
  onpointerdown={onDown}
  ondblclick={() => platform.showMain()}
  title={`${PRESETS[presetId].name} · double-click to open Daybloom`}
>
  <div class="dial">
    <Dial
      {presetId}
      {finish}
      {blocks}
      now={clock.now}
      date={view.today}
      isToday={true}
      headsUpKey={view.headsUpKey}
      compact
      withCase
      interactive={false}
      showSeconds={settings.value.showSeconds}
      reduced={view.reducedMotion}
      sleep={{ wake: settings.value.wake, sleep: settings.value.sleep }}
      {wedge}
      hideKey={wedge?.key ?? null}
      dayCompleteAt={view.dayCompleteAt}
      label="Daybloom widget"
    >
      <Readout
        state={view.now}
        now={clock.now}
        date={view.today}
        isToday={true}
        hour12={view.hour12}
        tally={view.tally}
        timer={timed && ts && !ts.finished && timer.active ? { label: ts.segment.label, remainingMs: ts.remainingMs, paused: ts.paused, index: ts.index, count: timer.active.segments.length / (timer.active.kind === 'cycles' ? 2 : 1), kind: timer.active.kind, segment: ts.segment.kind } : null}
        compact
        reduced={view.reducedMotion}
      />
    </Dial>
  </div>

  <div class="tools" style:--face={finish.face} style:--ink={finish.ink}>
    <button onclick={cyclePreset} aria-label="Switch dial" title="Switch dial"><Icon name="dial" size={14} stroke={2} /></button>
    <button onclick={toggleLayer} aria-pressed={w.layer === 'top'} aria-label={w.layer === 'top' ? 'Floating on top' : 'Sitting on desktop'} title={w.layer === 'top' ? 'Floating on top — click to sit on the desktop' : 'On the desktop — click to float on top'}><Icon name="pin" size={14} stroke={2} /></button>
    {#if platform.isNative}
      <button onclick={cycleSize} aria-label="Resize" title="Resize"><Icon name="maximize" size={14} stroke={2} /></button>
    {/if}
    <button onclick={() => platform.showMain()} aria-label="Open Daybloom" title="Open Daybloom"><Icon name="external" size={14} stroke={2} /></button>
    <button onclick={() => platform.hideSelf()} aria-label="Hide widget" title="Hide widget"><Icon name="x" size={14} stroke={2} /></button>
  </div>
</div>

<style>
  .widget {
    position: relative;
    width: 100vw;
    height: 100vh;
    display: grid;
    place-items: center;
    background: transparent;
    cursor: grab;
    overflow: hidden;
  }
  .dial {
    width: min(100vw, 100vh);
    padding: 7px;
  }
  .tools {
    position: absolute;
    left: 50%;
    bottom: 13%;
    transform: translate(-50%, 6px);
    display: flex;
    gap: 2px;
    padding: 3px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--face) 92%, transparent);
    color: var(--ink);
    box-shadow: 0 2px 10px rgb(0 0 0 / 0.18);
    opacity: 0;
    pointer-events: none;
    transition:
      opacity 0.2s var(--ease-out),
      transform 0.25s var(--ease-out);
  }
  .widget:hover .tools {
    opacity: 1;
    transform: translate(-50%, 0);
    pointer-events: auto;
  }
  .tools button {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    cursor: pointer;
  }
  .tools button:hover {
    background: color-mix(in srgb, var(--ink) 12%, transparent);
  }
  .tools button[aria-pressed='true'] {
    background: color-mix(in srgb, var(--ink) 14%, transparent);
  }
</style>
