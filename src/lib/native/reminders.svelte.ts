// Phone only (main window): keeps Android's schedule (Reminders.kt) the same as the plan —
// rebuilt when blocks, settings or Waqt change and every quarter hour, sent only when it
// differs — and shows the running focus timer as a quiet notification that counts down by
// itself. In the open app the in-app sounds still play; the notifications come from Android,
// so nothing arrives twice. A reminder's buttons (notifyActions.ts) are pressed in Android's
// shade; the taps wait there (Reminders.kt) until the planner takes them, here.

import { untrack } from 'svelte';
import { isOn } from '../addons/registry';
import { blocksInRange } from '../engine/blocks';
import { MINUTE } from '../engine/time';
import { platform } from '../platform';
import { clock } from '../stores/clock.svelte';
import { settings } from '../stores/settings.svelte';
import { taskFile } from '../stores/tasks.svelte';
import { timer } from '../stores/timer.svelte';
import { view } from '../stores/view.svelte';
import { shownTitle } from '../privacy';
import { alarmFile } from '../alarms.svelte';
import { deviceCall } from './device.svelte';
import { PLAN_HOURS, planReminders, type PrayerTime } from './reminders';
import type { NotifyAct } from './notifyActions';
import type { Block } from '../engine/types';

/** What the buttons may offer: the Time Tracker and Work's billable blocks, when they're on. */
async function smartness(): Promise<NonNullable<Parameters<typeof planReminders>[0]['smart']>> {
  const tracker = isOn('tracker') ? (await import('../addons/tracker/tracker.svelte')).tracker : null;
  const work = isOn('work') ? (await import('../addons/work/work.svelte')).work : null;
  return {
    tracker: !!tracker,
    billable: (b: Block) => {
      try {
        return !!work?.resolve(b.key)?.billable;
      } catch {
        return false;
      }
    },
    tracking: (b: Block) => !!tracker?.isTracking({ blockKey: b.key }),
  };
}

export interface NotifyTap {
  act: NotifyAct;
  key: string;
  arg?: number;
  /** When the button was pressed (ms): a late-applied tap still counts from then. */
  at: number;
}

const FIVE = 5 * MINUTE;
const roundUp = (ms: number) => Math.ceil(ms / FIVE) * FIVE;

/** Applies one button pressed in the notification shade. Unknown or stale taps do nothing. */
export async function applyNotifyAction(t: NotifyTap): Promise<string | null> {
  const actions = await import('../actions');
  if (t.key.startsWith('salah:')) {
    const [, date, id] = t.key.split(':');
    if (!date || !id || (t.act !== 'prayed' && t.act !== 'jamaat') || !isOn('waqt')) return null;
    const { waqt } = await import('../addons/waqt/waqt.svelte');
    if (!waqt.marks(date)[id as keyof ReturnType<typeof waqt.marks>]) waqt.mark(date, id as never, t.act);
    return t.act === 'jamaat' ? 'Marked in jamaat' : 'Marked prayed';
  }
  const b = view.blockByKey(t.key) ?? blocksInRange(taskFile.value.tasks, view.events, t.at - 26 * 60 * MINUTE, t.at + 50 * 60 * MINUTE, view.finish.dark).find((x) => x.key === t.key) ?? null;
  if (!b) return null;
  switch (t.act) {
    case 'done':
      if (!b.done) actions.toggleDone(b.key);
      return `“${b.title}” done`;
    case 'skip':
      if (b.kind === 'event' && !b.skipped) actions.skipEvent(b.key);
      return null;
    case 'later':
      if (b.kind === 'task' && !b.done) actions.toBacklog(b.key);
      return null;
    case 'extend': {
      // From the moment of the tap: ten more minutes then, not ten more from whenever the app opens.
      const end = Math.max(b.endMs, roundUp(t.at)) + (t.arg ?? 10) * MINUTE;
      if (b.kind === 'task' && end > b.endMs) actions.adjust(b.key, b.startMs, end);
      return `${t.arg ?? 10} more minutes for “${b.title}”`;
    }
    case 'startNow': {
      const from = roundUp(t.at - FIVE + 1);
      if (b.kind === 'task' && from < b.startMs) actions.adjust(b.key, from, from + (b.endMs - b.startMs));
      return `“${b.title}” starts now`;
    }
    case 'track': {
      if (!isOn('tracker')) return null;
      const { tracker } = await import('../addons/tracker/tracker.svelte');
      if (tracker.isTracking({ blockKey: b.key })) return null;
      const e = tracker.start({ blockKey: b.key, taskId: b.taskId });
      if (t.at < e.startMs) tracker.update(e.id, { startMs: Math.max(b.startMs - 30 * MINUTE, t.at) }, { force: true });
      return `Tracking “${b.title}”`;
    }
    case 'start2': {
      const { starter } = await import('../starter.svelte');
      if (!timer.active) starter.start(b);
      return null;
    }
  }
  return null;
}

/** Takes the taps Android kept and applies them, oldest first. */
export async function takeNotifyActions() {
  const r = await deviceCall<{ items: NotifyTap[] }>('notifyPending').catch(() => null);
  const said: string[] = [];
  for (const t of (r?.items ?? []).sort((a, z) => a.at - z.at)) {
    const line = await applyNotifyAction(t).catch((e) => {
      console.warn('[daybloom] notification action', e);
      return null;
    });
    if (line) said.push(line);
  }
  if (said.length === 1) view.say(said[0]);
  else if (said.length > 1) view.say(`${said.length} changes from your notifications`);
}

async function prayersAhead(): Promise<{ prayers: PrayerTime[]; remind: { before: number; atAdhan: boolean; beforeJamaat: number } } | null> {
  if (!isOn('waqt')) return null;
  const { waqt } = await import('../addons/waqt/waqt.svelte');
  if (!waqt.ready) return null;
  const { addDays, isoOf } = await import('../engine/time');
  const today = isoOf(clock.now);
  const prayers: PrayerTime[] = [];
  for (const d of [today, addDays(today, 1), addDays(today, 2)]) {
    const day = waqt.day(d);
    for (const p of day?.prayers ?? []) prayers.push({ date: d, id: p.id, name: p.name, at: p.at, end: p.end, ...(p.jamaat ? { jamaat: p.jamaat } : {}) });
  }
  return { prayers, remind: waqt.settings.remind };
}

export function startReminders(): () => void {
  if (!platform.isMobile) return () => {};
  let sent = '';
  let asked = false;
  let pending: ReturnType<typeof setTimeout> | null = null;

  async function sync() {
    pending = null;
    const now = clock.now;
    const blocks = blocksInRange(taskFile.value.tasks, view.events, now - MINUTE, now + PLAN_HOURS * 60 * MINUTE, view.finish.dark);
    const w = await prayersAhead().catch(() => null);
    const items = planReminders({
      now,
      blocks,
      taskOf: (b) => (b.taskId ? (view.taskForKey(b.key)?.task ?? null) : null),
      notify: settings.value.notify,
      headsUpMin: settings.value.headsUp,
      alarm: settings.value.alarm,
      hour12: view.hour12,
      name: (b) => shownTitle(b.title, b.category),
      prayers: w?.prayers,
      waqtRemind: w?.remind,
      snoozed: alarmFile.value.snoozed.map((s) => ({ key: s.key, title: s.title, at: s.at, startMs: s.startMs, tone: s.tone })),
      smart: await smartness().catch(() => undefined),
    });
    const s = timer.active ? timer.status(now) : null;
    if (s && !s.paused) {
      const last = timer.active!.segments.length - 1 === s.index;
      const breakTime = s.segment.kind === 'break';
      items.push({
        id: `focus:${timer.active!.startedAt}:${s.index}`,
        at: now + s.remainingMs,
        kind: 'focusEnd',
        title: breakTime ? 'Break’s over' : last ? 'Focus done' : 'Time for a break',
        body: breakTime ? 'Ready when you are.' : `${timer.active!.label || 'Focus'} · nice work.`,
        tag: 'focus',
        until: now + s.remainingMs + 30 * MINUTE,
      });
    }
    // Android asks once, the first time there is something to remind you of — after getting
    // started, so its prompt never lands on top of the welcome cards.
    if (items.length && !asked && settings.value.onboarded) {
      asked = true;
      try {
        const n = await import('@tauri-apps/plugin-notification');
        if (!(await n.isPermissionGranted())) await n.requestPermission();
      } catch {
        /* the reminders are scheduled either way; Settings can switch them on later */
      }
    }
    const text = JSON.stringify(items);
    if (text === sent) return;
    sent = text;
    await deviceCall('schedule', { items }).catch((e) => {
      sent = '';
      console.warn('[daybloom] reminders', e);
    });
  }

  const soon = () => {
    if (pending) clearTimeout(pending);
    pending = setTimeout(() => void sync(), 1500);
  };

  let shown = '';
  const stop = $effect.root(() => {
    $effect(() => {
      // Anything the plan reads; the quarter-hour tick moves the 48-hour window along.
      void JSON.stringify(taskFile.value.tasks);
      void JSON.stringify(settings.value.alarm);
      void settings.value.notify;
      void settings.value.headsUp;
      void settings.value.onboarded;
      void JSON.stringify(settings.value.privacy);
      void view.events.length;
      void view.hour12;
      void alarmFile.value.snoozed.length;
      void Math.floor(clock.minute / (15 * MINUTE));
      untrack(soon);
    });
    // The focus timer in the notification shade: the current part and when it ends.
    $effect(() => {
      void clock.minute;
      const a = timer.active;
      untrack(() => {
        const s = a ? timer.status(clock.now) : null;
        if (!a || !s || s.paused) {
          if (shown) void deviceCall('focusHide').catch(() => {});
          shown = '';
          return;
        }
        const endsAt = clock.now + s.remainingMs;
        const key = `${a.startedAt}:${s.index}`;
        if (key === shown) return;
        shown = key;
        const breakTime = s.segment.kind === 'break';
        void deviceCall('focusShow', { title: breakTime ? s.segment.label : a.label || 'Focus', body: breakTime ? 'A break. Stand up, look far away.' : 'Focusing. Daybloom will tell you when it’s time.', endsAt }).catch(() => {});
        // The end of this part joins the schedule, so it's told even with the app closed.
        soon();
      });
    });
  });

  // Taps in the shade: as soon as Android has one (app open), and whenever the app comes back.
  const onActed = () => void takeNotifyActions();
  const onVisible = () => {
    if (document.visibilityState === 'visible') void takeNotifyActions();
  };
  addEventListener('daybloom:notify-action', onActed);
  document.addEventListener('visibilitychange', onVisible);

  void takeNotifyActions().then(() => sync());
  return () => {
    removeEventListener('daybloom:notify-action', onActed);
    document.removeEventListener('visibilitychange', onVisible);
    if (pending) clearTimeout(pending);
    stop();
  };
}
