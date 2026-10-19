<script lang="ts">
  import { onMount } from 'svelte';
  import { activeTimeZone, atMinutes, formatTime, hourOf, setTimeZone, todayISO } from './lib/engine/time';
  import { platform, windowLabel } from './lib/platform';
  import { startScheduler } from './lib/scheduler.svelte';
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
  import { initCalendars } from './lib/calendarBridge.svelte';
  import MainView from './views/MainView.svelte';
  import WidgetView from './views/WidgetView.svelte';
  import OverlayView from './views/OverlayView.svelte';
  import CaptureView from './views/CaptureView.svelte';
  import { cuePreview, startScreenCues } from './lib/screenCues.svelte';
  import { startAddons } from './lib/addons/runtime.svelte';

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
    (async () => {
      await Promise.all([settings.load(), taskFile.load(), timerFile.load(), progressFile.load(), streakFile.load(), cuePreview.load()]);
      if (label === 'main' && !settings.value.onboarded && taskFile.value.tasks.length === 0) {
        seedSampleDay(clock.now);
      }
      view.date = view.today;
      ready = true;
      stopCalendars = await initCalendars(label === 'main');
      if (label === 'main') {
        stopScheduler = startScheduler();
        if (settings.value.widget.visible) {
          platform.showWidget(true).catch(() => {});
          platform.setWidgetLayer(settings.value.widget.layer).catch(() => {});
        }
        greet();
        stopUpdates = startUpdateChecks();
        stopGitSync = startSync();
        stopCues = startScreenCues();
        stopAddons = startAddons();
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
      stopScheduler?.();
      stopCalendars?.();
      stopWidgetSync?.();
      stopUpdates?.();
      stopGitSync?.();
      stopCues?.();
      stopPrivacy?.();
      stopAddons?.();
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
