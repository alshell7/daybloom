import { persisted } from './persisted.svelte';

/** Which rhythm milestone was last celebrated, so each is celebrated exactly once per run. */
export const streakFile = persisted<{ celebrated: number }>('streaks', { celebrated: 0 });
