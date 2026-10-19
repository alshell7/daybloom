import { categoryColor } from '../engine/categories';
import { MINUTE, todayISO } from '../engine/time';
import type { Block, CategoryId } from '../engine/types';
import { clock } from './clock.svelte';
import { persisted } from './persisted.svelte';

// One clock for the whole app (it honours the dev preview offset too).
const nowMs = () => clock.now;

export interface Segment {
  kind: 'focus' | 'break';
  label: string;
  ms: number;
}

export interface TimerState {
  active: null | {
    kind: 'countdown' | 'cycles';
    label: string;
    icon: string;
    category: CategoryId;
    startedAt: number;
    segments: Segment[];
    /** Set while paused. */
    pausedAt: number | null;
    /** Total ms spent paused so far. */
    pausedMs: number;
    /** What this session is for: a block on the day, or a backlog task. */
    target?: { key?: string; taskId?: string } | null;
  };
  /** Completed focus segments today, for the cycle pips. */
  doneToday: { date: string; count: number };
}

export const timerFile = persisted<TimerState>('timer', { active: null, doneToday: { date: '', count: 0 } });

export const timer = {
  get active() {
    return timerFile.value.active;
  },

  startCountdown(minutes: number, label = 'Timer', category: CategoryId = 'focus', icon = 'clock') {
    timerFile.value.active = {
      kind: 'countdown',
      label,
      icon,
      category,
      startedAt: nowMs(),
      segments: [{ kind: 'focus', label, ms: minutes * MINUTE }],
      pausedAt: null,
      pausedMs: 0,
    };
  },

  startCycles(c: { focus: number; short: number; long: number; rounds: number }, label = 'Focus') {
    const segments: Segment[] = [];
    for (let i = 0; i < c.rounds; i++) {
      segments.push({ kind: 'focus', label, ms: c.focus * MINUTE });
      const last = i === c.rounds - 1;
      segments.push({ kind: 'break', label: last ? 'Long break' : 'Break', ms: (last ? c.long : c.short) * MINUTE });
    }
    timerFile.value.active = {
      kind: 'cycles',
      label,
      icon: 'target',
      category: 'focus',
      startedAt: nowMs(),
      segments,
      pausedAt: null,
      pausedMs: 0,
    };
  },

  /**
   * A focus session from the launcher: one stretch, or cycles of focus and breaks, for a
   * block, a backlog task, or just focus.
   */
  startSession(o: {
    minutes: number;
    rhythm: 'single' | 'cycles';
    label: string;
    icon: string;
    category: CategoryId;
    target?: { key?: string; taskId?: string } | null;
    cycles?: { short: number; long: number; rounds: number };
  }) {
    const segments: Segment[] = [];
    if (o.rhythm === 'cycles') {
      const c = o.cycles ?? { short: 5, long: 15, rounds: 4 };
      for (let i = 0; i < c.rounds; i++) {
        segments.push({ kind: 'focus', label: o.label, ms: o.minutes * MINUTE });
        if (i < c.rounds - 1) segments.push({ kind: 'break', label: (i + 1) % 4 === 0 ? 'Long break' : 'Break', ms: ((i + 1) % 4 === 0 ? c.long : c.short) * MINUTE });
      }
    } else segments.push({ kind: 'focus', label: o.label, ms: o.minutes * MINUTE });
    timerFile.value.active = {
      kind: o.rhythm === 'cycles' ? 'cycles' : 'countdown',
      label: o.label,
      icon: o.icon,
      category: o.category,
      startedAt: nowMs(),
      segments,
      pausedAt: null,
      pausedMs: 0,
      target: o.target ?? null,
    };
  },

  pause() {
    const a = timerFile.value.active;
    if (a && a.pausedAt == null) a.pausedAt = nowMs();
  },

  resume() {
    const a = timerFile.value.active;
    if (a && a.pausedAt != null) {
      a.pausedMs += nowMs() - a.pausedAt;
      a.pausedAt = null;
    }
  },

  stop() {
    timerFile.value.active = null;
  },

  /** Skip to the next segment (e.g. end a break early). */
  skip(now = nowMs()) {
    const a = timerFile.value.active;
    if (!a) return;
    const s = this.status(now);
    if (!s || s.index >= a.segments.length - 1) return this.stop();
    // Shorten the current segment so the next one starts now.
    a.segments[s.index].ms -= s.remainingMs;
  },

  addMinutes(n: number) {
    const a = timerFile.value.active;
    if (!a) return;
    const s = this.status();
    const seg = a.segments[s?.index ?? a.segments.length - 1];
    seg.ms = Math.max(MINUTE, seg.ms + n * MINUTE);
  },

  noteFocusDone() {
    const d = todayISO();
    const t = timerFile.value.doneToday;
    if (t.date !== d) timerFile.value.doneToday = { date: d, count: 1 };
    else t.count++;
  },

  /** Where are we in the sequence? Null when there is no timer or it has run out. */
  status(now = nowMs()) {
    const a = timerFile.value.active;
    if (!a) return null;
    const effectiveNow = (a.pausedAt ?? now) - a.pausedMs;
    let t = a.startedAt;
    for (let i = 0; i < a.segments.length; i++) {
      const seg = a.segments[i];
      if (effectiveNow < t + seg.ms) {
        return {
          index: i,
          segment: seg,
          remainingMs: t + seg.ms - effectiveNow,
          progress: (effectiveNow - t) / seg.ms,
          paused: a.pausedAt != null,
          finished: false,
        };
      }
      t += seg.ms;
    }
    return { index: a.segments.length - 1, segment: a.segments[a.segments.length - 1], remainingMs: 0, progress: 1, paused: false, finished: true };
  },

  /** The running sequence as dial blocks, laid out in wall-clock time. */
  blocks(now = nowMs(), dark = false): Block[] {
    const a = timerFile.value.active;
    if (!a) return [];
    const shift = a.pausedMs + (a.pausedAt != null ? now - a.pausedAt : 0);
    let t = a.startedAt + shift;
    return a.segments.map((seg, i) => {
      const startMs = t;
      t += seg.ms;
      const category: CategoryId = seg.kind === 'break' ? 'rest' : a.category;
      return {
        key: `timer:${i}`,
        kind: 'task',
        date: todayISO(startMs),
        title: seg.label,
        icon: seg.kind === 'break' ? 'coffee' : a.icon,
        category,
        color: categoryColor(category, dark),
        startMs,
        endMs: t,
        floating: false,
        done: t <= now,
        recurring: false,
        readOnly: true,
      } satisfies Block;
    });
  },
};
