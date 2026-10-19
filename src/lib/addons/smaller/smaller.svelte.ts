// Make it smaller: keeping the steps on the task, and starting the first one as a short focus.

import { formatTime, MINUTE } from '../../engine/time';
import type { Task } from '../../engine/types';
import { sounds } from '../../sound';
import { clock } from '../../stores/clock.svelte';
import { settings } from '../../stores/settings.svelte';
import { uid } from '../../stores/tasks.svelte';
import { timer } from '../../stores/timer.svelte';
import { view } from '../../stores/view.svelte';
import type { StepIdea } from './split';

/** Add the steps to the task (after any it already has). */
export function keepSteps(task: Task, steps: StepIdea[]) {
  const fresh = steps.map((s) => s.title.trim()).filter(Boolean);
  task.subtasks = [...task.subtasks, ...fresh.map((title) => ({ id: uid(), title, done: false }))];
  task.updatedAt = Date.now();
}

/** Keep the steps, then start the first one as a focus session of its minutes (2 by default). */
export function startFirstStep(task: Task, steps: StepIdea[], key: string | null) {
  keepSteps(task, steps);
  const first = steps.find((s) => s.title.trim());
  if (!first) return;
  const minutes = Math.max(1, first.minutes || 2);
  timer.startSession({
    minutes,
    rhythm: 'single',
    label: first.title.trim(),
    icon: task.icon,
    category: task.category,
    target: { key: key ?? undefined, taskId: task.id },
  });
  if (settings.value.sound) sounds.begin();
  view.sheet = null;
  if (settings.value.focus.fullscreen) view.focus = true;
  view.say(`Just the first step · until ${formatTime(clock.now + minutes * MINUTE, view.hour12)}`);
}
