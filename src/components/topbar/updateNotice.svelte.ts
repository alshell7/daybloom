// Whether the update card is up, set aside ("Not now"), or waiting in the top bar's More menu.
// "Not now" sets it aside for a few hours (or until the next launch); More keeps a way back.
// The card is UpdateChip.svelte; this is the little bit of state it shares with the bar.

import { updates } from '../../lib/updater.svelte';
import { clock } from '../../lib/stores/clock.svelte';

const SNOOZE_MS = 6 * 60 * 60_000;

export const updateNotice = $state({
  /** The version set aside, and when. */
  version: '',
  at: 0,
  /** "Update" was pressed here (so a failure shows on the card, with Try again). */
  tried: false,
});

/** A new version is ready but set aside: it waits in More. */
export function updateWaiting(): boolean {
  return updates.status === 'available' && updateNotice.version === updates.version && clock.minute - updateNotice.at < SNOOZE_MS;
}

export function snoozeUpdate() {
  updateNotice.version = updates.version;
  updateNotice.at = clock.minute;
  updateNotice.tried = false;
}

/** Bring the card back. */
export function showUpdate() {
  updateNotice.version = '';
  updateNotice.at = 0;
}
