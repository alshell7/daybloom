// Names for addon data, shared by the Work and Time Tracker panels: what a tracked entry or
// a target is called on screen.

import type { Entry, TargetRef } from './tracker/types';
import { work } from './work/work.svelte';
import { tasks } from '../stores/tasks.svelte';
import { view } from '../stores/view.svelte';
import { isOn } from './registry';
import { categoryColor } from '../engine/categories';

export function targetTitle(t: TargetRef | Entry | null | undefined): string {
  if (!t) return 'Untitled';
  if (t.blockKey) {
    const b = view.blockByKey(t.blockKey);
    if (b?.title) return b.title;
  }
  if (t.taskId) {
    const task = tasks.get(t.taskId);
    if (task?.title) return task.title;
  }
  if (t.projectId && isOn('work')) {
    const p = work.project(t.projectId);
    if (p) return p.name;
  }
  if ('note' in t && t.note) return t.note;
  return t.taskId || t.blockKey ? 'Untitled block' : 'Untitled';
}

export function targetSub(t: TargetRef | Entry | null | undefined): string {
  if (!t) return '';
  const parts: string[] = [];
  if (isOn('work')) {
    const key = t.blockKey ?? t.taskId;
    const pid = t.projectId ?? (key ? work.resolve(key)?.project.id : undefined);
    const p = pid ? work.project(pid) : undefined;
    if (p && targetTitle(t) !== p.name) parts.push(p.name);
  }
  if ('source' in t && t.source === 'focus') parts.push('focus session');
  if ('source' in t && t.source === 'manual') parts.push('added by hand');
  return parts.join(' · ');
}

export function targetColor(t: TargetRef | Entry | null | undefined): string {
  if (!t) return '#3D6FE3';
  if (t.blockKey) {
    const b = view.blockByKey(t.blockKey);
    if (b) return b.color;
  }
  if (t.taskId) {
    const task = tasks.get(t.taskId);
    if (task) return categoryColor(task.category, view.finish.dark);
  }
  return '#3D6FE3';
}

/** "1:04:09" / "12:30" — a running stopwatch. */
export function clockText(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}
