// The phone's native side (Android), through the `device_call` command and DevicePlugin.kt:
// edge-to-edge insets as CSS variables, system bars that match the theme, the back gesture
// closing whatever is open, the screen kept on during focus, privacy from screenshots.
// Everything here does nothing on a computer.

import { haptic } from '../haptics';
import { platform } from '../platform';
import { popovers } from '../popovers.svelte';
import { lock } from '../lock.svelte';
import { startAttention } from './attention.svelte';
import { settings } from '../stores/settings.svelte';
import { timer } from '../stores/timer.svelte';
import { view } from '../stores/view.svelte';
import { voice } from '../voice/voice.svelte';

export async function deviceCall<T = unknown>(method: string, args: Record<string, unknown> = {}): Promise<T | null> {
  if (!platform.isMobile) return null;
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>('device_call', { method, args });
}

/** The first screen is built: once the page has drawn it (two animation frames, or 600 ms at
 *  most), Android takes its start screen (the icon) away. */
export function appShown() {
  if (!platform.isMobile) return;
  let done = false;
  const go = (how: string) => {
    if (done) return;
    done = true;
    performance.mark('daybloom:shown', { detail: how });
    void deviceCall('shown').catch(() => {});
  };
  requestAnimationFrame(() => requestAnimationFrame(() => go('frame')));
  setTimeout(() => go('timeout'), 600);
}

/** Main window, phone only. Returns a stop function. */
export function startDevice(): () => void {
  if (!platform.isMobile) return () => {};
  document.documentElement.dataset.device = 'phone';
  const stopAttention = startAttention();
  void deviceCall('insets').catch(() => {});

  // The back gesture closes an open popover, else does what Esc does (MainView, and an open
  // picker first): it lets voice
  // go, leaves focus, closes the top panel, or lets go of the selected block. With nothing
  // open it leaves the app as usual (so the system's predictive-back animation still plays).
  const onBack = () => !lock.locked && (popovers.closeTop() || document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  addEventListener('daybloom:back', onBack);

  // A switch flipped anywhere in the app: Android's own toggle feel.
  const onSwitch = (e: Event) => {
    const t = e.target as HTMLInputElement | null;
    if (t?.type === 'checkbox' && t.classList.contains('switch')) haptic(t.checked ? 'on' : 'off');
  };
  document.addEventListener('change', onSwitch, true);

  const stop = $effect.root(() => {
    // The mode is remembered natively, so the next start opens in this theme's colours.
    $effect(() => {
      void deviceCall('systemBars', { dark: view.dark, mode: settings.value.theme }).catch(() => {});
    });
    $effect(() => {
      void deviceCall('backHandler', { on: !lock.locked && !!(popovers.open || view.sheet || view.focus || view.selected || voice.active) }).catch(() => {});
    });
    // The screen stays on while a focus session runs, so the dial keeps counting in sight.
    $effect(() => {
      void deviceCall('keepAwake', { on: !!timer.active }).catch(() => {});
    });
  });

  return () => {
    removeEventListener('daybloom:back', onBack);
    document.removeEventListener('change', onSwitch, true);
    stopAttention();
    stop();
  };
}
