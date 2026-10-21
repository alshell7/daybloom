<script lang="ts">
  import { onMount } from 'svelte';
  import { activeTimeZone, atMinutes, formatTime, hourOf, setPrefers12h, setTimeZone, todayISO } from './lib/engine/time';
  import { platform, windowLabel } from './lib/platform';
  import { startScheduler } from './lib/scheduler.svelte';
  import { configureSound } from './lib/sound';
  import { clock } from './lib/stores/clock.svelte';
  import { settings } from './lib/stores/settings.svelte';
  import { seedSampleDay, taskFile } from './lib/stores/tasks.svelte';
  import { timerFile } from './lib/stores/timer.svelte';
  import { progressFile } from './lib/stores/progress.svelte';
  import { view } from './lib/stores/view.svelte';
  import { themeCss } from './lib/themes';
  import { startUpdateChecks } from './lib/updater.svelte';
  import { startSync } from './lib/sync/sync.svelte';
  import { streakFile } from './lib/stores/streaks.svelte';
  import { layout } from './lib/stores/layout.svelte';
  import { initCalendars } from './lib/calendarBridge.svelte';
  import MainView from './views/MainView.svelte';
  import WidgetView from './views/WidgetView.svelte';
  import OverlayView from './views/OverlayView.svelte';
  import CaptureView from './views/CaptureView.svelte';
  import { cuePreview, startScreenCues } from './lib/screenCues.svelte';
  import { startAddons, startAddonViews } from './lib/addons/runtime.svelte';
  import { startAi } from './lib/ai/hub.svelte';
  import { trash, trashFile } from './lib/stores/trash.svelte';
  import { eventStateFile } from './lib/stores/eventStates.svelte';
  import { followResets } from './lib/reset';
  import { startStarter } from './lib/starter.svelte';
  import { startDevice } from './lib/native/device.svelte';
  import { startReminders } from './lib/native/reminders.svelte';

  const label = windowLabel();
  let ready = $state(false);

  // Theme presets live in one TS table; their CSS is generated once.
  if (typeof document !== 'undefined' && !document.getElementById('daybloom-themes')) {
    const style = document.createElement('style');
    style.id = 'daybloom-themes';
    style.textContent = themeCss();
    document.head.appendChild(style);
  }

  onMount(() => {
    if (label !== 'main') document.body.classList.add('widget-mode');
    // Dev-only: ?at=HH:MM previews the UI at another time of day.
    const at = new URLSearchParams(location.search).get('at');
    if (at && import.meta.env.DEV) {
      const [h, m] = at.split(':').map(Number);
      clock.setOffset(atMinutes(todayISO(), h * 60 + (m || 0)) - Date.now());
    }
    clock.start();

    let stopScheduler: (() => void) | undefined;
    let stopCalendars: (() => void) | undefined;
    let stopWidgetSync: (() => void) | undefined;
    let stopUpdates: (() => void) | undefined;
    let stopGitSync: (() => void) | undefined;
    let stopCues: (() => void) | undefined;
    let stopPrivacy: (() => void) | undefined;
    let stopAddons: (() => void) | undefined;
    let stopStarter: (() => void) | undefined;
    let stopDevice: (() => void) | undefined;
    let stopReminders: (() => void) | undefined;
    // "Auto" clock style: what this computer shows (region and time settings), read before the
    // first paint and again when the window comes back (the setting may have changed).
    const readClockStyle = () =>
      platform
        .systemHour12()
        .then((v) => {
          if (v === null) return;
          view.systemHour12 = v;
          setPrefers12h(v);
        })
        .catch(() => {});
    addEventListener('focus', readClockStyle);
    (async () => {
      await Promise.all([settings.load(), eventStateFile.load(), taskFile.load(), timerFile.load(), progressFile.load(), streakFile.load(), cuePreview.load(), layout.load(), readClockStyle()]);
      // A sample day for a first launch only: never again once it was added or anything was deleted.
      if (label === 'main' && !settings.value.onboarded && taskFile.value.tasks.length === 0 && !taskFile.value.seeded && !taskFile.value.deleted?.length) {
        seedSampleDay(clock.now);
      }
      // The Trash lets go of what has waited 30 days.
      if (label === 'main') void trashFile.load().then(() => trash.purge());
      view.date = view.today;
      ready = true;
      // Settings › AI (the planner first moves Alef's old brain setup there).
      void startAi(label === 'main').catch((e) => console.warn('[daybloom] ai', e));
      // The menu bar, sounds and reminders start at once; calendars catch up after.
      if (label === 'main') stopScheduler = startScheduler();
      stopCalendars = await initCalendars(label === 'main');
      if (label === 'widget') stopAddons = startAddonViews();
      // A reset in the planner: this window starts fresh too.
      if (label !== 'main') followResets();
      if (label === 'main') {
        if (settings.value.widget.visible) {
          platform.showWidget(true).catch(() => {});
          platform.setWidgetLayer(settings.value.widget.layer).catch(() => {});
        }
        greet();
        stopUpdates = startUpdateChecks();
        stopGitSync = startSync();
        stopCues = startScreenCues();
        stopAddons = startAddons();
        stopStarter = startStarter();
        stopDevice = startDevice();
        stopReminders = startReminders();
        stopPrivacy = platform.onPrivacyChange((on) => {
          if (settings.value.privacy.on !== on) settings.value.privacy.on = on;
        });
        // Tray / OS changes to the widget flow back into settings.
        stopWidgetSync = platform.onWidgetChange(({ visible, layer }) => {
          settings.value.widget.visible = visible;
          settings.value.widget.layer = layer;
        });
      }
    })();

    return () => {
      removeEventListener('focus', readClockStyle);
      stopScheduler?.();
      stopCalendars?.();
      stopWidgetSync?.();
      stopUpdates?.();
      stopGitSync?.();
      stopCues?.();
      stopPrivacy?.();
      stopAddons?.();
      stopStarter?.();
      stopDevice?.();
      stopReminders?.();
    };
  });

  // One gentle hello per day: what's ahead, never what was missed.
  function greet() {
    if (!settings.value.onboarded || settings.value.lastGreeted === view.today) return;
    settings.value.lastGreeted = view.today;
    const h = hourOf(clock.now);
    const hello = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    const n = view.now.next;
    const left = view.dayBlocks.filter((b) => !b.done && b.endMs > clock.now && b.kind === 'task').length;
    const what = view.now.current
      ? `You're in “${view.now.current.title}”.`
      : n
        ? `First up: ${n.title} at ${formatTime(n.startMs, view.hour12)}.`
        : 'Nothing planned yet — sweep the ring to start.';
    setTimeout(() => view.say(`${hello}. ${left ? `${left} ${left === 1 ? 'block' : 'blocks'} ahead. ` : ''}${what}`, undefined, 7000), 900);
  }

  // Sound on/off and volume, in every window (the capture card and widget play sounds too).
  $effect(() => configureSound(settings.value.sound, settings.value.volume));

  // The whole app follows one time zone (the computer's unless the user picks another).
  $effect(() => {
    const wasToday = view.date === view.today;
    setTimeZone(settings.value.timeZone || null);
    clock.zone = activeTimeZone();
    if (wasToday) view.date = view.today;
  });

  // Privacy mode: the planner tells the shell, which protects every window (and new ones).
  let privacyApplied: boolean | null = null;
  $effect(() => {
    const on = settings.value.privacy.on;
    if (!ready || label !== 'main' || !platform.isNative || on === privacyApplied) return;
    privacyApplied = on;
    platform.setPrivacy(on).catch(() => (privacyApplied = null));
  });

  // Theme, reading font and motion live on <html> so every surface (and the widget) agrees.
  $effect(() => {
    const root = document.documentElement;
    root.dataset.theme = view.dark ? 'dark' : 'light';
    root.dataset.palette = view.theme.id;
    root.dataset.font = settings.value.font;
    root.dataset.motion = view.reducedMotion ? 'calm' : 'full';
  });
</script>

{#if ready}
  <!-- a zone change remounts the views so every local derivation re-reads the clock -->
  {#key clock.zone}
    {#if label === 'widget'}
      <WidgetView />
    {:else if label === 'overlay'}
      <OverlayView />
    {:else if label === 'capture'}
      <CaptureView />
    {:else}
      <MainView />
    {/if}
  {/key}
{/if}
