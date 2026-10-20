<script lang="ts">
  import { untrack } from 'svelte';
  import { adjust, createFromRange, createNext, leaveFocus, removeBlock, toggleDone } from '../lib/actions';
  import Dial from '../lib/dial/Dial.svelte';
  import Readout from '../lib/dial/Readout.svelte';
  import { cubicOut } from 'svelte/easing';
  import { blockKey } from '../lib/engine/blocks';
  import { mix } from '../lib/engine/categories';
  import { MINUTE } from '../lib/engine/time';
  import { formatTime, isoOf, minutesOfDay } from '../lib/engine/time';
  import { sounds } from '../lib/sound';
  import { tasks } from '../lib/stores/tasks.svelte';
  import { platform } from '../lib/platform';
  import { PRESET_ORDER, type PresetId } from '../lib/presets';
  import { clock } from '../lib/stores/clock.svelte';
  import { settings } from '../lib/stores/settings.svelte';
  import { timer } from '../lib/stores/timer.svelte';
  import { view } from '../lib/stores/view.svelte';
  import BlockSheet from '../components/BlockSheet.svelte';
  import Coach from '../components/Coach.svelte';
  import DayRail from '../components/DayRail.svelte';
  import { layout, railDrag } from '../lib/stores/layout.svelte';
  import FocusMode from '../components/FocusMode.svelte';
  import PresetBar from '../components/PresetBar.svelte';
  import SettingsSheet from '../components/SettingsSheet.svelte';
  import InsightsPanel from '../components/InsightsPanel.svelte';
  import BacklogPanel from '../components/BacklogPanel.svelte';
  import Nudges from '../components/Nudges.svelte';
  import WindDown from '../components/WindDown.svelte';
  import AssistantPanel from '../components/assistant/AssistantPanel.svelte';
  import Sparks from '../components/Sparks.svelte';
  import Toast from '../components/Toast.svelte';
  import VoiceDock from '../components/voice/VoiceDock.svelte';
  import FocusLauncher from '../components/focus/FocusLauncher.svelte';
  import AddonsPanel from '../components/addons/AddonsPanel.svelte';
  import CalendarsPanel from '../components/calendars/CalendarsPanel.svelte';
  import WorkPanel from '../components/addons/work/WorkPanel.svelte';
  import TrackerPanel from '../components/addons/tracker/TrackerPanel.svelte';
  import CrumbsPanel from '../components/addons/crumbs/CrumbsPanel.svelte';
  import CrumbPrompt from '../components/addons/crumbs/CrumbPrompt.svelte';
  import RealityPanel from '../components/addons/reality/RealityPanel.svelte';
  import WaqtPanel from '../components/addons/waqt/WaqtPanel.svelte';
  import WaqtMoment from '../components/addons/waqt/WaqtMoment.svelte';
  import McpPanel from '../components/addons/mcp/McpPanel.svelte';
  import WhatsNew from '../components/WhatsNew.svelte';
  import LandingCard from '../components/addons/landings/LandingCard.svelte';
  import LandingsPanel from '../components/addons/landings/LandingsPanel.svelte';
  import RetroPanel from '../components/addons/retro/RetroPanel.svelte';
  import { prayerMarks, waqt } from '../lib/addons/waqt/waqt.svelte';
  import TrackerPrompts from '../components/addons/tracker/TrackerPrompts.svelte';
  import { isOn } from '../lib/addons/registry';
  import { voice, type VoiceSurface } from '../lib/voice/voice.svelte';
  import { breath } from '../lib/breath.svelte';
  import TopBar from '../components/TopBar.svelte';
  import { closeTopSheet } from '../lib/sheets';

  const presetId = $derived(settings.value.preset);

  // Changing day turns the dial a little in the direction of travel.
  function turn(_node: Element, { dir }: { dir: 1 | -1 }) {
    if (view.reducedMotion) return { duration: 0 };
    return {
      duration: 560,
      easing: cubicOut,
      css: (t: number, u: number) => `transform: rotate(${dir * u * 28}deg) scale(${0.94 + 0.06 * t}); opacity: ${t}`,
    };
  }
  const timed = $derived(presetId === 'timer60' || presetId === 'chrono');
  const ts = $derived(timer.active ? timer.status(clock.now) : null);

  const dialBlocks = $derived(timed && timer.active ? [...view.timerBlocks] : view.pool);

  const wedge = $derived.by(() => {
    if (!timed) return null;
    if (ts && !ts.finished) {
      const seg = view.timerBlocks[ts.index];
      return seg ? { key: seg.key, startMs: clock.now, endMs: clock.now + ts.remainingMs, color: seg.color } : null;
    }
    const c = view.now.current;
    if (c && !c.done) return { key: c.key, startMs: c.startMs, endMs: c.endMs, color: c.color };
    // Free: the wedge is the time until the next block (an hour at most), in its colour, softened.
    const n = view.now.next;
    if (n && n.startMs - clock.now <= 60 * MINUTE) return { key: null, startMs: clock.now, endMs: n.startMs, color: mix(view.finish.track, view.finish.face, 0.62), edgeColor: n.color };
    return null;
  });

  const readoutTimer = $derived(
    ts && !ts.finished && timer.active
      ? {
          label: ts.segment.label,
          remainingMs: ts.remainingMs,
          paused: ts.paused,
          index: ts.index,
          count: Math.ceil(timer.active.segments.length / (timer.active.kind === 'cycles' ? 2 : 1)),
          kind: timer.active.kind,
          segment: ts.segment.kind,
        }
      : null,
  );

  function onTimer(a: 'pause' | 'resume' | 'stop' | 'skip') {
    if (a === 'pause') timer.pause();
    else if (a === 'resume') timer.resume();
    else if (a === 'skip') timer.skip();
    else timer.stop();
  }

  function onSelect(key: string | null) {
    view.selected = key;
    if (key && !key.startsWith('timer:')) view.sheet = { kind: 'edit', key };
    else if (!key && view.sheet?.kind === 'edit') view.sheet = null;
  }

  function onCreate(r: { startMs: number; endMs: number }) {
    if (timed) return;
    createFromRange(r.startMs, r.endMs);
    if (!settings.value.onboarded) settings.value.onboarded = true;
  }

  function onAdjust(key: string, r: { startMs: number; endMs: number }) {
    adjust(key, r.startMs, r.endMs);
  }

  function onDropTask(id: string, startMs: number) {
    const date = isoOf(startMs);
    tasks.schedule(id, date, Math.round(minutesOfDay(startMs)));
    view.selected = blockKey(id, date);
    sounds.done();
    view.say(`Scheduled for ${formatTime(startMs, view.hour12)}`);
  }

  function typing(e: KeyboardEvent) {
    const el = e.target as HTMLElement;
    return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
  }

  function onKey(e: KeyboardEvent) {
    // ⌘K / Ctrl+K: ask Daybloom, from anywhere.
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      view.sheet = view.sheet?.kind === 'assistant' ? null : { kind: 'assistant' };
      return;
    }
    // ⇧⌘P / Ctrl+Shift+P: privacy mode.
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      togglePrivacy();
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    // Voice first: Esc lets it go, Enter sends what you said now.
    if (voice.active && voice.surface === 'overlay') {
      if (e.key === 'Escape') {
        e.preventDefault();
        voice.cancel();
        return;
      }
      if (e.key === 'Enter' && voice.phase === 'listening' && !typing(e)) {
        e.preventDefault();
        void voice.stop();
        return;
      }
    }
    if (e.key === 'Escape') {
      if (view.focus) leaveFocus();
      else if (view.sheet) {
        if (!closeTopSheet()) view.sheet = null;
      }
      else view.selected = null;
      return;
    }
    // ⌥V / Alt+V: hold to talk even while typing; the words go into the field you're in.
    if (e.code === 'KeyV' && e.altKey && !e.metaKey && !e.ctrlKey && settings.value.voice.hotkey) {
      e.preventDefault();
      if (!e.repeat) voice.press(voiceSurfaceAt(e.target));
      return;
    }
    if (typing(e)) return;
    const k = e.key.toLowerCase();
    // V: hold to talk, or tap and speak (it stops when you pause).
    if (k === 'v' && settings.value.voice.hotkey) {
      e.preventDefault();
      if (!e.repeat) voice.press(view.sheet?.kind === 'assistant' ? 'assistant' : 'overlay');
      return;
    }
    if (k === 'n') {
      e.preventDefault();
      createNext();
    } else if (k === 't') view.goToday();
    else if (e.key === 'ArrowLeft') view.shiftDay(-1);
    else if (e.key === 'ArrowRight') view.shiftDay(1);
    else if (k === 'f') openFocus();
    else if (k === 'w') toggleWidget();
    else if (k === ',') view.sheet = { kind: 'settings' };
    else if (k === 'b') view.sheet = view.sheet?.kind === 'backlog' ? null : { kind: 'backlog' };
    else if (k === 'i') view.sheet = view.sheet?.kind === 'insights' ? null : { kind: 'insights' };
    else if (['1', '2', '3', '4'].includes(k)) settings.value.preset = PRESET_ORDER[Number(k) - 1] as PresetId;
    else if (k === ' ' && view.selected) {
      e.preventDefault();
      toggleDone(view.selected);
    } else if ((e.key === 'Backspace' || e.key === 'Delete') && view.selected) removeBlock(view.selected);
  }

  /** The voice surface a field belongs to (`data-voice` on its form), else the capsule. */
  function voiceSurfaceAt(target: EventTarget | null): VoiceSurface {
    const at = target instanceof Element ? target.closest<HTMLElement>('[data-voice]')?.dataset.voice : undefined;
    return at === 'quickadd' || at === 'assistant' || at === 'note' ? at : view.sheet?.kind === 'assistant' ? 'assistant' : 'overlay';
  }

  function togglePrivacy() {
    const on = !settings.value.privacy.on;
    settings.value.privacy.on = on;
    view.say(on ? 'Privacy mode on · Daybloom stays out of screenshots and recordings' : 'Privacy mode off');
  }

  /** F: a running session toggles the focus view; otherwise the launcher opens. */
  function openFocus() {
    if (view.focus) leaveFocus();
    else if (timer.active) view.focus = true;
    else view.sheet = view.sheet?.kind === 'focus' ? null : { kind: 'focus' };
  }

  async function toggleWidget() {
    const vis = await platform.showWidget(!settings.value.widget.visible);
    settings.value.widget.visible = vis;
  }

  // The breathing minute's words step with its own timer (exact phase boundaries).
  $effect(() => {
    const at = view.breatheAt;
    untrack(() => breath.watch(at));
  });

  // Tray menu → app.
  $effect(() =>
    platform.onTray((a) => {
      if (a === 'new-block') createNext(view.today);
      else if (a === 'focus-now') view.focus = true;
      else if (a === 'open-settings') view.sheet = { kind: 'settings' };
    }),
  );

  const mac = platform.isNative && platform.os === 'mac';
  const sleep = $derived({ wake: settings.value.wake, sleep: settings.value.sleep });
</script>

<svelte:window
  onkeydown={onKey}
  onkeyup={(e) => {
    if (e.code === 'KeyV' || e.key.toLowerCase() === 'v' || e.key === 'Alt') voice.release();
  }}
  onblur={() => voice.blur()}
/>

<div class="shell" class:mac class:sheet-open={!!view.sheet}>
  <TopBar {mac} ontogglewidget={toggleWidget} />

  <main
    class="stage"
    class:custom={railDrag.active ? !railDrag.auto : layout.value.railWidth > 0}
    class:resizing={railDrag.active}
    class:settling={railDrag.settling}
    style:--rail-user={railDrag.active ? `${railDrag.width}px` : layout.value.railWidth ? `${layout.value.railWidth}px` : null}
  >
    <section class="dial-col" aria-label="Dial">
      <div class="dial-box">
        {#key view.date}
        <div class="turn" in:turn={{ dir: view.dayDir }}>
        <Dial
          {presetId}
          finish={view.finish}
          blocks={dialBlocks}
          now={clock.now}
          date={view.date}
          isToday={view.isToday}
          selectedKey={view.selected}
          headsUpKey={view.headsUpKey}
          showSeconds={settings.value.showSeconds}
          reduced={view.reducedMotion}
          {sleep}
          {wedge}
          hideKey={wedge?.key ?? null}
          dayCompleteAt={view.dayCompleteAt}
          interactive={!timed || !timer.active}
          hour12={view.hour12}
          onselect={onSelect}
          oncreate={onCreate}
          onadjust={onAdjust}
          ondroptask={onDropTask}
          breathing={view.breathing}
          breathStart={view.breatheAt}
          prayers={isOn('waqt') ? prayerMarks(clock.minute) : []}
          prayerBloom={waqt.bloom}
        >
          <Readout
            state={view.now}
            now={clock.now}
            date={view.date}
            isToday={view.isToday || timed}
            hour12={view.hour12}
            tally={view.tally}
            timer={timed ? readoutTimer : null}
            reduced={view.reducedMotion}
            ontimer={onTimer}
            breath={view.breathing ? breath.state : null}
            onbreathe={(on) => (view.breatheAt = on ? clock.now : 0)}
          />
        </Dial>
        </div>
        {/key}
      </div>
      <PresetBar />
    </section>

    <DayRail />
  </main>

  <BlockSheet />
  <SettingsSheet />
  <InsightsPanel />
  <BacklogPanel />
  <WindDown />
  <AssistantPanel />
  <FocusLauncher />
  <AddonsPanel />
  <CalendarsPanel />
  {#if isOn('work')}<WorkPanel />{/if}
  {#if isOn('tracker')}<TrackerPanel />{/if}
  {#if isOn('crumbs')}<CrumbsPanel /><CrumbPrompt />{/if}
  {#if isOn('reality')}<RealityPanel />{/if}
  {#if isOn('waqt')}<WaqtPanel /><WaqtMoment />{/if}
  {#if isOn('mcp')}<McpPanel />{/if}
  {#if isOn('landings')}<LandingsPanel /><LandingCard />{/if}
  {#if isOn('retro')}<RetroPanel />{/if}
  <WhatsNew />
  <TrackerPrompts />
  {#if !view.focus && !view.sheet}
    <Nudges />
  {/if}
  <Sparks />
  <Toast />
  <VoiceDock />
  {#if view.focus}
    <FocusMode />
  {/if}
  {#if !settings.value.onboarded}
    <Coach />
  {/if}
</div>

<style>
  .shell {
    height: 100%;
    display: grid;
    grid-template-rows: auto 1fr;
    background: var(--ground);
    overflow: hidden;
  }
  /* The rail takes the room the dial doesn't need (the dial is sized by the window's height),
     between 320 and 480 px. A width you drag to is kept, within limits that always leave the
     dial its column (see lib/stores/layout.svelte.ts). */
  .stage {
    --rail-auto: clamp(320px, calc(100vw - min(100vh - 230px, 660px) - 64px), 480px);
    --rail: var(--rail-auto);
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) var(--rail);
    min-height: 0;
  }
  .stage.custom {
    --rail: clamp(320px, var(--rail-user), max(320px, min(640px, 100vw - 480px)));
  }
  .stage.resizing {
    --rail: var(--rail-user);
  }
  .stage.settling {
    transition: grid-template-columns var(--dur-3) var(--ease-settle);
  }
  .dial-col {
    display: grid;
    grid-template-rows: 1fr auto;
    justify-items: center;
    align-items: center;
    gap: var(--s-4);
    padding: var(--s-4) var(--s-6) var(--s-5);
    min-height: 0;
    min-width: 0;
  }
  .dial-box {
    width: min(100%, calc(100vh - 230px), 660px);
    min-width: 240px;
  }

  @media (max-width: 860px) {
    .stage {
      grid-template-columns: 1fr;
      grid-template-rows: auto 1fr;
      overflow-y: auto;
    }
    .dial-col {
      padding: var(--s-3) var(--s-4) var(--s-4);
    }
    .dial-box {
      width: min(100%, 54vh, 520px);
    }
  }
</style>
