<script lang="ts">
  import { hidingNames, shownTitle } from '../lib/privacy';
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
  import { nudges } from '../lib/nudges.svelte';
  import { blocksInRange } from '../lib/engine/blocks';
  import { addDays, startOfDayMs } from '../lib/engine/time';
  import { taskFile } from '../lib/stores/tasks.svelte';
  import { isOn } from '../lib/addons/registry';
  import { prayerMarks, waqt } from '../lib/addons/waqt/waqt.svelte';
  import AlefFace from '../components/addons/alef/AlefFace.svelte';
  import AlefPosture from '../components/addons/alef/AlefPosture.svelte';
  import { alef, alefFile } from '../lib/addons/alef/alef.svelte';
  import { BEHAVIORS } from '../lib/addons/alef/behaviors';

  const alefOn = $derived(isOn('alef') && alefFile.ready && alefFile.value.settings.inWidget);

  // The desktop object: a watch on your wallpaper. Drag to move, double-click to open
  // the planner, hover for a few quiet controls.
  const w = $derived(settings.value.widget);
  // The planner's face and finish unless the widget has its own: the two dials agree.
  const presetId = $derived(w.own ? w.preset : settings.value.preset);
  const finish = $derived(w.finish === 'auto' ? view.finish : resolveFinish(w.finish as FinishId, view.theme));
  const timed = $derived(presetId === 'timer60' || presetId === 'chrono');
  const ts = $derived(timer.active ? timer.status(clock.now) : null);

  // Block colours for this dial's own light or dark finish.
  const dayPool = $derived(
    finish.dark === view.finish.dark ? view.pool : blocksInRange(taskFile.value.tasks, view.events, startOfDayMs(addDays(view.today, -1)), startOfDayMs(addDays(view.today, 2)), finish.dark),
  );
  const rawBlocks = $derived(timed && timer.active ? timer.blocks(clock.minute, finish.dark) : dayPool);
  // The widget always shows today, also after midnight.
  $effect(() => {
    if (view.date !== view.today) view.date = view.today;
  });
  // Privacy mode can swap names for categories on this shared surface.
  const blocks = $derived(hidingNames() ? rawBlocks.map((b) => ({ ...b, title: shownTitle(b.title, b.category) })) : rawBlocks);
  const nowState = $derived.by(() => {
    const st = view.now;
    if (!hidingNames()) return st;
    const hide = <T extends { title: string; category: import('../lib/engine/types').CategoryId } | null>(b: T): T => (b ? { ...b, title: shownTitle(b.title, b.category) } : b);
    return { ...st, current: hide(st.current), next: hide(st.next) };
  });
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

  /** Its own face from here on (Settings › Screen › Widget can make it follow again). */
  function cyclePreset() {
    const i = PRESET_ORDER.indexOf(presetId);
    settings.value.widget.preset = PRESET_ORDER[(i + 1) % PRESET_ORDER.length];
    settings.value.widget.own = true;
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

  // Windows' native move loop swallows the mouse-up, so a drag started on press would eat every
  // click (and the double-click that opens the planner). Off macOS the drag waits until the
  // pointer has really moved; macOS keeps dragging from the press.
  const dragOnMove = platform.os !== 'mac';
  let press: { x: number; y: number } | null = null;

  function onDown(e: PointerEvent) {
    if (e.button !== 0 || (e.target as HTMLElement).closest('.tools')) return;
    if (dragOnMove) press = { x: e.screenX, y: e.screenY };
    else platform.startDrag();
  }

  function onMove(e: PointerEvent) {
    if (!press) return;
    if (!(e.buttons & 1)) {
      press = null;
    } else if (Math.hypot(e.screenX - press.x, e.screenY - press.y) >= 4) {
      press = null;
      platform.startDrag();
    }
  }

  /** Double-click: the planner, or straight back into the focus view while a session runs. */
  async function openMain() {
    await platform.showMain();
    if (timer.active) await platform.trayAction('focus-now');
  }
</script>

{#snippet alefFace(info: { big: string; tone: string })}
  <AlefFace framed={false} perf={alef.perf} performing={alef.performing} affect={alef.affect} talk={alef.talk} screen={alef.screenFor(finish)} led={alefFile.value.settings.led} reduced={view.reducedMotion} compact interactive={false} gaze={false} />
{/snippet}

<div
  class="widget"
  role="presentation"
  onpointerdown={onDown}
  onpointermove={onMove}
  onpointerup={() => (press = null)}
  ondblclick={openMain}
  title={`${PRESETS[presetId].name} · double-click to open ${timer.active ? 'your focus' : 'Daybloom'}`}
>
  <div class="dial">
    <AlefPosture on={alefOn} reduced={view.reducedMotion} compact>
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
      hour12={view.hour12}
      prayers={isOn('waqt') ? prayerMarks(clock.minute) : []}
      prayerBloom={waqt.bloom}
      label="Daybloom widget"
      lift={alefOn && alef.performing ? BEHAVIORS[alef.perf.id].lift : 0}
      screen={alefOn ? { led: alef.led, glow: alef.glow, palette: alef.screenFor(finish) } : null}
    >
      <Readout
        state={nowState}
        now={clock.now}
        date={view.today}
        isToday={true}
        hour12={view.hour12}
        tally={view.tally}
        timer={timed && ts && !ts.finished && timer.active ? { label: ts.segment.label, remainingMs: ts.remainingMs, paused: ts.paused, index: ts.index, count: Math.ceil(timer.active.segments.length / (timer.active.kind === 'cycles' ? 2 : 1)), kind: timer.active.kind, segment: ts.segment.kind } : null}
        compact
        reduced={view.reducedMotion}
        face={alefOn ? alefFace : undefined}
      />
    </Dial>
    </AlefPosture>
  </div>

  {#if nudges.attention}
    <button class="pip tnum" onclick={() => platform.showMain()} title="Open Daybloom to check in" aria-label={`${nudges.attention} check-ins waiting`}>
      {nudges.attention}
    </button>
  {/if}

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
  .pip {
    position: absolute;
    top: 9%;
    right: 9%;
    min-width: 22px;
    height: 22px;
    padding: 0 6px;
    border-radius: 11px;
    background: var(--warm, #d98a12);
    color: #1b1206;
    font: 600 12px/22px var(--font-ui);
    box-shadow: 0 2px 8px rgb(0 0 0 / 0.25);
    cursor: pointer;
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
