// The phone's native side (Android), through the `device_call` command and DevicePlugin.kt:
// edge-to-edge insets as CSS variables, system bars that match the theme, the back gesture
// closing whatever is open, the screen kept on during focus, privacy from screenshots.
// Everything here does nothing on a computer.

import { platform } from '../platform';
import { timer } from '../stores/timer.svelte';
import { view } from '../stores/view.svelte';

export async function deviceCall<T = unknown>(method: string, args: Record<string, unknown> = {}): Promise<T | null> {
  if (!platform.isMobile) return null;
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>('device_call', { method, args });
}

/** Main window, phone only. Returns a stop function. */
export function startDevice(): () => void {
  if (!platform.isMobile) return () => {};
  document.documentElement.dataset.device = 'phone';
  void deviceCall('insets').catch(() => {});

  // The back gesture closes the open sheet; with nothing open it leaves the app as usual
  // (so the system's predictive-back animation still plays).
  const onBack = () => {
    if (view.sheet) view.sheet = null;
  };
  addEventListener('daybloom:back', onBack);

  const stop = $effect.root(() => {
    $effect(() => {
      void deviceCall('systemBars', { dark: view.dark }).catch(() => {});
    });
    $effect(() => {
      void deviceCall('backHandler', { on: !!view.sheet }).catch(() => {});
    });
    // The screen stays on while a focus session runs, so the dial keeps counting in sight.
    $effect(() => {
      void deviceCall('keepAwake', { on: !!timer.active }).catch(() => {});
    });
  });

  return () => {
    removeEventListener('daybloom:back', onBack);
    stop();
  };
}
