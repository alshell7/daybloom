// What a phone should remind you of over the next two days, so Android can do it while
// Daybloom is closed (Reminders.kt). The same rules as the scheduler and Waqt use in the open
// app: "Now: …" when a block starts (alarm blocks ring instead), a heads-up before a block
// ends, your per-block alerts, alarms, and the salah reminders. Pure, for tests.

import { formatDuration, formatTime, MINUTE } from '../engine/time';
import type { Block, Task } from '../engine/types';

export const PLAN_HOURS = 48;

export interface NativeReminder {
  id: string;
  at: number;
  kind: 'alarm' | 'start' | 'heads' | 'before' | 'salah' | 'focusEnd';
  title: string;
  body: string;
  tone?: string;
  ringForMin?: number;
  snoozeMin?: number;
  gentle?: boolean;
  volume?: number;
}

export interface PrayerTime {
  date: string;
  id: string;
  name: string;
  at: number;
  end: number;
  jamaat?: number;
}

export interface PlanInput {
  now: number;
  /** Timed blocks from now to PLAN_HOURS ahead (and a little before, for blocks under way). */
  blocks: Block[];
  taskOf: (b: Block) => Task | null;
  notify: boolean;
  headsUpMin: number;
  alarm: { tone: string; snooze: number; ringFor: number; gentle: boolean; volume: number };
  hour12: boolean;
  /** How a block's name shows (privacy mode can hide names behind their category). */
  name?: (b: Block) => string;
  /** Waqt, when the addon is on and has a place. */
  prayers?: PrayerTime[];
  waqtRemind?: { before: number; atAdhan: boolean; beforeJamaat: number };
  /** Snoozes still waiting (from the alarm store). */
  snoozed?: { key: string; title: string; at: number; startMs: number; tone: string }[];
}

const cap = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export function planReminders(p: PlanInput): NativeReminder[] {
  const out: NativeReminder[] = [];
  const until = p.now + PLAN_HOURS * 60 * MINUTE;
  const soon = (at: number) => at > p.now && at <= until;
  const t = (ms: number) => formatTime(ms, p.hour12);
  const timed = p.blocks.filter((b) => !b.floating).sort((a, z) => a.startMs - z.startMs);

  for (let i = 0; i < timed.length; i++) {
    const b = timed[i];
    if (b.done) continue;
    const name = cap((p.name ? p.name(b) : b.title) || (b.kind === 'task' ? 'Your next block' : 'An event'));
    const task = b.kind === 'task' ? p.taskOf(b) : null;

    if (task?.alarm && soon(b.startMs)) {
      out.push({
        id: `alarm:${b.key}`,
        at: b.startMs,
        kind: 'alarm',
        title: name,
        body: `${t(b.startMs)} · until ${t(b.endMs)}`,
        tone: task.alarm.tone || p.alarm.tone,
        ringForMin: p.alarm.ringFor,
        snoozeMin: p.alarm.snooze,
        gentle: p.alarm.gentle,
        volume: p.alarm.volume,
      });
    } else if (p.notify && soon(b.startMs)) {
      out.push({ id: `go:${b.key}`, at: b.startMs, kind: 'start', title: `Now: ${name}`, body: `${formatDuration(b.endMs - b.startMs)} · until ${t(b.endMs)}` });
    }

    if (p.notify) {
      for (const m of task?.alerts ?? []) {
        const at = b.startMs - m * MINUTE;
        if (m > 0 && soon(at)) out.push({ id: `al:${b.key}:${m}`, at, kind: 'before', title: `In ${m} minutes: ${name}`, body: `Starts at ${t(b.startMs)}` });
      }
      const ms = p.headsUpMin * MINUTE;
      const at = b.endMs - ms;
      if (ms > 0 && b.endMs - b.startMs > ms * 1.5 && soon(at)) {
        const next = timed.slice(i + 1).find((n) => n.startMs >= b.endMs - MINUTE && !n.done);
        out.push({ id: `hu:${b.key}`, at, kind: 'heads', title: `${formatDuration(ms)} left · ${name}`, body: next ? `Next up: ${cap(p.name ? p.name(next) : next.title)}` : 'Time to start wrapping up.' });
      }
    }
  }

  for (const s of p.snoozed ?? []) {
    if (soon(s.at)) {
      out.push({ id: `snooze:${s.key}`, at: s.at, kind: 'alarm', title: cap(s.title || 'Alarm'), body: `Snoozed · ${t(s.startMs)}`, tone: s.tone, ringForMin: p.alarm.ringFor, snoozeMin: p.alarm.snooze, gentle: p.alarm.gentle, volume: p.alarm.volume });
    }
  }

  const r = p.waqtRemind;
  if (r && p.prayers) {
    for (const pr of p.prayers) {
      const key = `${pr.date}:${pr.id}`;
      const pre = pr.at - r.before * MINUTE;
      if (r.before > 0 && soon(pre)) {
        out.push({ id: `salah:${key}:pre`, at: pre, kind: 'salah', title: `${pr.name} in ${r.before} minutes`, body: `Adhan at ${t(pr.at)}${pr.jamaat ? ` · jamaat at ${t(pr.jamaat)}` : ''}` });
      }
      if (r.atAdhan && soon(pr.at)) {
        out.push({ id: `salah:${key}:adhan`, at: pr.at, kind: 'salah', title: `It’s time for ${pr.name}`, body: `${t(pr.at)} · ${pr.jamaat ? `Jamaat at ${t(pr.jamaat)}` : `Its time lasts until ${t(pr.end)}`}` });
      }
      const jam = pr.jamaat ? pr.jamaat - r.beforeJamaat * MINUTE : 0;
      if (pr.jamaat && r.beforeJamaat > 0 && soon(jam)) {
        out.push({ id: `salah:${key}:jam`, at: jam, kind: 'salah', title: `Jamaat for ${pr.name} in ${r.beforeJamaat} minutes`, body: `At ${t(pr.jamaat)}. Time for wudu.` });
      }
    }
  }

  return out.sort((a, z) => a.at - z.at || a.id.localeCompare(z.id));
}
