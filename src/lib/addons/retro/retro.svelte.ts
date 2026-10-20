// Retrospection, the live side: a small journal of blocks that moved or were dropped (the
// plans themselves keep no history), your reflections per period, the experiments you chose,
// and a gentle note when a week is ready to look back on. Main window only.

import { untrack } from 'svelte';
import { addDays, isoOf, weekday } from '../../engine/time';
import type { ISODate } from '../../engine/types';
import { clock } from '../../stores/clock.svelte';
import { persisted } from '../../stores/persisted.svelte';
import { taskFile } from '../../stores/tasks.svelte';
import { view } from '../../stores/view.svelte';
import type { JournalEntry } from './retro';

export interface Reflection {
  keep: string;
  change: string;
  try: string;
}

export interface RetroFile {
  version: 1;
  journal: JournalEntry[];
  /** Keep / change / try, by period ("2026-10-13…2026-10-19"). */
  notes: Record<string, Reflection>;
  /** Experiments you said you'd try (pattern ids), with when. */
  tries: { id: string; text: string; at: number }[];
  /** The Monday whose look-back was offered last. */
  offered: string;
}

export function migrateRetro(raw: any): RetroFile {
  const journal = Array.isArray(raw?.journal)
    ? raw.journal.filter((j: any) => j && Number.isFinite(j.at) && typeof j.taskId === 'string' && (j.kind === 'moved' || j.kind === 'dropped')).map((j: any) => ({ at: j.at, taskId: j.taskId, title: String(j.title ?? '').slice(0, 120), kind: j.kind })).slice(-1500)
    : [];
  const notes: Record<string, Reflection> = {};
  for (const [k, v] of Object.entries(raw?.notes ?? {})) {
    if (!v || typeof v !== 'object') continue;
    const r = v as any;
    notes[k] = { keep: String(r.keep ?? '').slice(0, 600), change: String(r.change ?? '').slice(0, 600), try: String(r.try ?? '').slice(0, 600) };
  }
  const tries = Array.isArray(raw?.tries) ? raw.tries.filter((t: any) => t && typeof t.id === 'string').map((t: any) => ({ id: t.id, text: String(t.text ?? ''), at: Number(t.at) || 0 })).slice(-40) : [];
  return { version: 1, journal, notes, tries, offered: typeof raw?.offered === 'string' ? raw.offered : '' };
}

export const retroFile = persisted<RetroFile>('addon-retro', migrateRetro(null), migrateRetro);

export const periodKey = (from: ISODate, to: ISODate) => `${from}…${to}`;

/** Main window, while the addon is on. */
export function startRetro(): () => void {
  let prev: Map<string, { sig: string; title: string; done: boolean; dated: boolean }> | null = null;
  const root = $effect.root(() => {
    // The journal: diff the plans (one-off and per-day moves; removals that weren't finished).
    $effect(() => {
      const now = new Map<string, { sig: string; title: string; done: boolean; dated: boolean }>();
      for (const t of taskFile.value.tasks) {
        now.set(t.id, {
          sig: `${t.date}|${t.start}|${JSON.stringify(t.overrides)}|${t.skips.length}`,
          title: t.title,
          done: t.completions.length > 0 || !!t.doneAt,
          dated: !!t.date,
        });
      }
      untrack(() => {
        if (prev) {
          const add: JournalEntry[] = [];
          const at = Date.now();
          for (const [id, v] of now) {
            const p = prev.get(id);
            // A move: a dated block's day/time changed (not just finishing it, not into the backlog's undated list).
            if (p && p.sig !== v.sig && p.dated && !v.done) add.push({ at, taskId: id, title: v.title, kind: 'moved' });
          }
          for (const [id, p] of prev) if (!now.has(id) && !p.done && p.dated) add.push({ at, taskId: id, title: p.title, kind: 'dropped' });
          if (add.length) retroFile.value.journal = [...retroFile.value.journal, ...add].filter((j) => j.at > at - 120 * 86_400_000).slice(-1500);
        }
        prev = now;
      });
    });

    // Once a week (Sunday evening or Monday), a note that last week is ready to look back on.
    $effect(() => {
      const m = clock.minute;
      untrack(() => {
        const today = isoOf(m);
        const wd = weekday(today);
        const hour = new Date(m).getHours();
        if (!(wd === 1 || (wd === 0 && hour >= 18))) return;
        const monday = wd === 1 ? today : addDays(today, 1);
        if (retroFile.value.offered === monday) return;
        retroFile.value.offered = monday;
        setTimeout(() => view.say('Your week is ready to look back on, kindly.', { label: 'Look back', run: () => (view.sheet = { kind: 'retro' }) }, 9000), 4000);
      });
    });
  });
  return () => {
    root();
    prev = null;
  };
}
