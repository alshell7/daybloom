import { ACHIEVEMENTS, ACHIEVEMENT_BY_ID, evaluateAchievements, type Achievement } from '../insights';
import { clock } from './clock.svelte';
import { persisted } from './persisted.svelte';
import { taskFile } from './tasks.svelte';

/** A badge the user has earned, and when. */
export interface Unlock {
  id: string;
  at: number;
}

interface ProgressFile {
  version: 1;
  unlocked: Unlock[];
  /** Last time the "Your week" panel was opened — badges earned after it glint once. */
  viewedAt: number;
}

export const progressFile = persisted<ProgressFile>('progress', { version: 1, unlocked: [], viewedAt: 0 }, (raw) => ({
  version: 1,
  unlocked: Array.isArray(raw?.unlocked)
    ? raw.unlocked
        .filter((u: any) => u && typeof u.id === 'string' && ACHIEVEMENT_BY_ID[u.id])
        .map((u: any) => ({ id: u.id, at: Number(u.at) || 0 }))
    : [],
  viewedAt: Number(raw?.viewedAt) || 0,
}));

// Load on first import so no shell change is needed; a second `load()` from the app is harmless.
let loading: Promise<void> | null = null;
export function loadProgress(): Promise<void> {
  return (loading ??= progressFile.load());
}
if (typeof window !== 'undefined') loadProgress();

/**
 * Evaluate every badge against the live task list, record the newly earned ones and
 * return them (in list order) so the caller can celebrate. A badge is only ever
 * returned once. Returns [] until both the tasks and the progress file are loaded.
 */
export function unlockNew(nowMs: number = clock.now): Achievement[] {
  if (!progressFile.ready || !taskFile.ready) return [];
  const have = progressFile.value.unlocked.map((u) => u.id);
  const fresh = evaluateAchievements(taskFile.value.tasks, nowMs, have);
  for (const a of fresh) progressFile.value.unlocked.push({ id: a.id, at: nowMs });
  return fresh;
}

export const progress = {
  get ready() {
    return progressFile.ready && taskFile.ready;
  },
  get unlocked(): Unlock[] {
    return progressFile.value.unlocked;
  },
  get viewedAt() {
    return progressFile.value.viewedAt;
  },
  /** When a badge was earned, or null. */
  unlockedAt(id: string): number | null {
    return progressFile.value.unlocked.find((u) => u.id === id)?.at ?? null;
  },
  /** Every badge with its state, in list order. */
  get all(): { achievement: Achievement; at: number | null }[] {
    const at = new Map(progressFile.value.unlocked.map((u) => [u.id, u.at]));
    return ACHIEVEMENTS.map((a) => ({ achievement: a, at: at.get(a.id) ?? null }));
  },
  markViewed(nowMs: number = clock.now) {
    progressFile.value.viewedAt = nowMs;
  },
  unlockNew,
};
