// The sample day a first launch adds, so the dial isn't empty while you learn it. It is easy to
// clear: from the getting-started card, a gentle card once you start planning your own day, or
// Settings › App › Your data. Clearing removes only sample blocks you haven't changed.

import type { Task } from './engine/types';
import { taskFile, tasks } from './stores/tasks.svelte';
import { view } from './stores/view.svelte';

/** Titles of the sample day (blocks from versions before the `sample` mark are found by these). */
export const SAMPLE_TITLES = ['Morning meds', 'Deep work', 'Lunch & water', 'Walk outside', 'Reply to messages', 'Call a friend', 'Wind down', 'Water the plants', 'Book dentist', 'Return the parcel'];

/** The sample blocks still here (one you renamed is yours now; ticking or moving one is just trying it out). */
export function sampleTasks(list: Task[] = taskFile.value.tasks): Task[] {
  // Before the mark: the sample titles, untouched, when most of the day is still there.
  const legacy = list.filter((x) => !x.sample && SAMPLE_TITLES.includes(x.title) && x.updatedAt - x.createdAt < 60_000);
  return list.filter((t) => SAMPLE_TITLES.includes(t.title) && (t.sample || (legacy.length >= 6 && legacy.includes(t))));
}

/** Clear the sample day, with an Undo. Returns how many went. */
export function clearSample(): number {
  const gone = sampleTasks().map((t) => JSON.parse(JSON.stringify(t)) as Task);
  for (const t of gone) tasks.remove(t.id);
  taskFile.value.sampleKept = false;
  if (gone.length)
    view.say(`Cleared the sample day · a fresh dial is yours`, { label: 'Undo', run: () => gone.forEach((t) => tasks.restore(t)) }, 7000);
  return gone.length;
}

/** Keep them: stop offering to clear (Settings can still do it). */
export function keepSample() {
  taskFile.value.sampleKept = true;
}

/** Offer to clear now: there are sample blocks, you haven't chosen to keep them, and you've started your own. */
export function offerClear(list: Task[] = taskFile.value.tasks): boolean {
  if (taskFile.value.sampleKept) return false;
  const sample = sampleTasks(list);
  if (!sample.length) return false;
  return list.some((t) => !sample.includes(t));
}
