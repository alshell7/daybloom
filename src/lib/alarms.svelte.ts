// Blocks that ring like an alarm. This store keeps what is ringing, the snoozes and the note an
// unanswered alarm leaves, persisted on this computer (so a snooze survives a reload, a reload
// mid-ring keeps ringing, and the widget can show it). The main window's scheduler calls
// `alarms.tick` with the clock; the rules for when to ring are in alarmPlan.ts. Ringing brings
// the planner to the front, sends a notification and plays the tone (lib/alarm.ts); the card
// is components/AlarmRing.svelte. The widget only reads this and asks the planner to act.

import { untrack } from 'svelte';
import { DEFAULT_TONE, GENTLE_SECONDS, ringAlarm, stopAlarm, warmTone } from './alarm';
import { crossed, dueSnoozes, EMPTY_ALARMS, migrateAlarms, ringLeft, startMinutes, type AlarmFile, type AlarmInfo, type Ringing } from './alarmPlan';
import type { Block, Task } from './engine/types';
import { formatTime, MINUTE } from './engine/time';
import { platform } from './platform';
import { sounds } from './sound';
import { clock } from './stores/clock.svelte';
import { persisted } from './stores/persisted.svelte';
import { settings } from './stores/settings.svelte';
import { tasks } from './stores/tasks.svelte';
import { timer } from './stores/timer.svelte';
import { view } from './stores/view.svelte';

export const alarmFile = persisted<AlarmFile>('alarms', EMPTY_ALARMS, migrateAlarms);

/** The task behind a block, if it rings as an alarm. */
function alarmTask(b: Pick<Block, 'kind' | 'taskId'>): Task | null {
  if (b.kind !== 'task' || !b.taskId) return null;
  const t = tasks.get(b.taskId);
  return t?.alarm ? t : null;
}

/** Does this block ring as an alarm? */
export function hasAlarm(b: Pick<Block, 'kind' | 'taskId'> | null | undefined): boolean {
  return !!b && !!alarmTask(b);
}

/** The last tick seen; 0 until the first one, so launching late rings nothing old. */
let prev = 0;
/** The ring the speaker is playing (`key@since`), so a reload mid-ring picks it up again. */
let sounding = '';
/** Alarms whose tone was rendered ahead of time. */
const warmed = new Set<string>();

const id = (r: Ringing) => `${r.key}@${r.since}`;

function play(r: Ringing, now: number) {
  const cfg = settings.value.alarm;
  const left = ringLeft(r, cfg.ringFor, now);
  // Picking up after a reload: carry on at full volume once the gentle start would be over.
  const gentle = cfg.gentle && now - r.since < GENTLE_SECONDS * 1000;
  // Tried once per ring: if the speaker fails, the card, the notification and the window still say it.
  sounding = id(r);
  try {
    ringAlarm({ tone: r.tone, volume: cfg.volume, gentle, maxSeconds: left / 1000 });
  } catch (e) {
    console.warn('[daybloom] the alarm could not play', e);
  }
}

function ring(a: AlarmInfo, now: number, snoozes: number) {
  const st = alarmFile.value;
  if (st.ringing) {
    // One at a time: this one rings as soon as the current one is answered.
    st.snoozed.push({ ...a, at: now, snoozes });
    return;
  }
  const r: Ringing = { ...a, since: now, snoozes };
  st.ringing = r;
  if (st.note?.key === a.key) st.note = null;
  play(r, now);
  void platform.notify(a.title || 'Alarm', `${formatTime(a.startMs, view.hour12)}${snoozes ? ' · snoozed' : ''} · Stop or snooze it in Daybloom.`).catch(() => {});
  // Bring the planner forward (a browser tab can't; there it is the tab you are in).
  if (platform.isNative) void platform.showMain().catch(() => {});
}

function infoOf(b: Block, t: Task): AlarmInfo {
  return {
    key: b.key,
    taskId: t.id,
    title: b.title,
    icon: b.icon,
    category: b.category,
    startMs: b.startMs,
    endMs: b.endMs,
    tone: t.alarm?.tone || settings.value.alarm.tone || DEFAULT_TONE,
  };
}

function step(now: number) {
  if (!alarmFile.ready) return;
  const st = alarmFile.value;
  const from = prev;
  prev = now;

  // Ringing: keep the speaker going (also after a reload), and stop by itself in time.
  if (st.ringing) {
    if (ringLeft(st.ringing, settings.value.alarm.ringFor, now) <= 0) {
      const r = st.ringing;
      quiet();
      st.ringing = null;
      st.note = { ...r, rangAt: r.since };
    } else if (sounding !== id(st.ringing)) play(st.ringing, now);
  }
  if (!from || now <= from) return;

  // Blocks whose start the clock just passed (and, a little ahead, their tone gets ready).
  if (tasks.list.some((t) => t.alarm)) {
    for (const b of view.todayBlocks) {
      const t = alarmTask(b);
      if (!t || b.done || b.floating) continue;
      if (crossed(from, now, b.startMs)) ring(infoOf(b, t), now, 0);
      else if (b.startMs > now && b.startMs - now < 2 * MINUTE && !warmed.has(b.key)) {
        warmed.add(b.key);
        warmTone(infoOf(b, t).tone);
      }
    }
  }

  // Snoozes whose time came (one rings; any others wait their turn).
  if (st.snoozed.length && !st.ringing) {
    const { due, waiting } = dueSnoozes(st.snoozed, now);
    if (due.length || waiting.length !== st.snoozed.length) {
      const live = due.filter((s) => !isDone(s));
      st.snoozed = [...live.slice(1), ...waiting];
      if (live[0]) ring(live[0], now, live[0].snoozes);
    }
  }
}

function isDone(a: AlarmInfo): boolean {
  return !!view.todayBlocks.find((b) => b.key === a.key)?.done;
}

function quiet() {
  stopAlarm();
  sounding = '';
}

export const alarms = {
  get ringing() {
    return alarmFile.value.ringing;
  },
  get snoozed() {
    return alarmFile.value.snoozed;
  },
  get note() {
    return alarmFile.value.note;
  },

  /** Called with the clock by the scheduler (main window only). */
  tick(now: number) {
    untrack(() => step(now));
  },

  /** Stop ringing; this alarm is answered (any snooze of it goes too). */
  stop() {
    const r = alarmFile.value.ringing;
    quiet();
    if (!r) return;
    alarmFile.value.ringing = null;
    alarmFile.value.snoozed = alarmFile.value.snoozed.filter((s) => s.key !== r.key);
  },

  /** Quiet for the snooze length, then ring again. */
  snooze() {
    const r = alarmFile.value.ringing;
    if (!r) return;
    quiet();
    const at = clock.now + settings.value.alarm.snooze * MINUTE;
    alarmFile.value.ringing = null;
    alarmFile.value.snoozed = [...alarmFile.value.snoozed.filter((s) => s.key !== r.key), { ...r, at, snoozes: r.snoozes + 1 }];
    view.say(`Snoozed · rings again at ${formatTime(at, view.hour12)}`);
  },

  /** Stop the alarm and start its block as a focus session (also from the note it left). */
  startNow() {
    const a = alarmFile.value.ringing ?? alarmFile.value.note;
    this.stop();
    alarmFile.value.note = null;
    if (!a) return;
    alarmFile.value.snoozed = alarmFile.value.snoozed.filter((s) => s.key !== a.key);
    const now = clock.now;
    const minutes = startMinutes(a, now);
    timer.startSession({
      minutes,
      rhythm: 'single',
      label: a.title || 'Focus',
      icon: a.icon,
      category: a.category,
      target: { key: a.key, taskId: a.taskId ?? undefined },
    });
    if (settings.value.sound) sounds.begin();
    view.sheet = null;
    if (settings.value.focus.fullscreen) view.focus = true;
    view.say(`${a.title || 'Block'} started · until ${formatTime(now + minutes * MINUTE, view.hour12)}`);
  },

  /** Let a snooze go without ringing again. */
  cancelSnooze(key: string) {
    alarmFile.value.snoozed = alarmFile.value.snoozed.filter((s) => s.key !== key);
  },

  dismissNote() {
    alarmFile.value.note = null;
  },
};

/** Main window: load the store, and take requests from the widget. Returns a cleanup. */
export function startAlarms(): () => void {
  void alarmFile.load();
  return platform.onBroadcast<'stop' | 'snooze' | 'start'>('alarm', (a) => {
    if (a === 'stop') alarms.stop();
    else if (a === 'snooze') alarms.snooze();
    else if (a === 'start') {
      alarms.startNow();
      void platform.showMain().catch(() => {});
    }
  });
}
