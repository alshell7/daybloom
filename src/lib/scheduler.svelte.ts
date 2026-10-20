// Transition support: a heads-up before a block ends, a soft cue when the next one
// begins, and the timer's end. Runs only in the main window so nothing doubles up.

import { formatDuration, formatTime, MINUTE } from './engine/time';
import { platform } from './platform';
import { configureSound, sounds } from './sound';
import { clock } from './stores/clock.svelte';
import { settings } from './stores/settings.svelte';
import { timer } from './stores/timer.svelte';
import { view } from './stores/view.svelte';
import { nudges } from './nudges.svelte';
import { toggleDone } from './actions';
import { shownTitle } from './privacy';

export function startScheduler() {
  const fired = new Set<string>();
  // The first pass only records what is already under way, so launching mid-block is silent.
  let booted = false;
  let lastTimerIndex = -1;
  let lastTray = '';

  return $effect.root(() => {
    $effect(() => configureSound(settings.value.sound, settings.value.volume));

    $effect(() => {
      const now = clock.now;
      const s = view.now;
      const cfg = settings.value;

      // Heads-up window for the current block.
      const cur = s.current;
      const inHeadsUp = !!cur && view.headsUpKey === cur.key;
      if (inHeadsUp && !fired.has(`hu:${cur!.key}`)) {
        fired.add(`hu:${cur!.key}`);
        if (booted) sounds.headsUp();
        if (booted && cfg.notify) {
          platform.notify(
            `${formatDuration(s.remainingMs)} left · ${cur!.title || 'this block'}`,
            s.next ? `Next up: ${s.next.title}` : 'Time to start wrapping up.',
          );
        }
      }

      // A block just began.
      if (cur && !fired.has(`go:${cur.key}`)) {
        fired.add(`go:${cur.key}`);
        if (booted && now - cur.startMs < 90_000) {
          sounds.begin();
          if (cfg.notify) platform.notify(`Now: ${cur.title || 'next block'}`, `${formatDuration(cur.endMs - cur.startMs)} · until ${formatTime(cur.endMs, view.hour12)}`);
        }
      }
      // Nudges before a block starts (per-block alerts: 0 = at start, 5 = five minutes before…).
      for (const b of view.todayBlocks) {
        if (b.kind !== 'task' || b.done || b.startMs < now - 60_000) continue;
        const t = b.taskId ? view.taskForKey(b.key)?.task : null;
        for (const m of t?.alerts ?? []) {
          const at = b.startMs - m * MINUTE;
          const id = `al:${b.key}:${m}`;
          if (now >= at && now < at + 60_000 && !fired.has(id)) {
            fired.add(id);
            if (!booted || m === 0) continue; // m = 0 is covered by the "Now:" cue
            sounds.headsUp();
            if (cfg.notify) platform.notify(`In ${m} minutes: ${b.title || 'next block'}`, `Starts at ${formatTime(b.startMs, view.hour12)}`);
          }
        }
      }

      booted = true;

      // Timer segments.
      const ts = timer.status(now);
      if (ts) {
        if (lastTimerIndex !== -1 && ts.index !== lastTimerIndex) {
          const prev = timer.active?.segments[lastTimerIndex];
          if (prev?.kind === 'focus') timer.noteFocusDone();
          sounds.timerEnd();
          if (cfg.notify) platform.notify(ts.segment.kind === 'break' ? 'Break time' : 'Back to focus', `${ts.segment.label} · ${formatDuration(ts.remainingMs)}`);
        }
        lastTimerIndex = ts.index;
        if (ts.finished) {
          if (timer.active?.segments.at(-1)?.kind === 'focus') timer.noteFocusDone();
          sounds.timerEnd();
          if (cfg.notify) platform.notify('Timer done', timer.active?.label ?? '');
          const target = timer.active?.target;
          const done = target?.key ? view.todayBlocks.find((b) => b.key === target.key)?.done : true;
          view.say(
            `${timer.active?.label ?? 'Timer'} · focus done`,
            target?.key && !done ? { label: 'Mark it done', run: () => toggleDone(target.key!) } : undefined,
            9000,
          );
          timer.stop();
          lastTimerIndex = -1;
        }
      } else lastTimerIndex = -1;
    });

    // Check-ins and gentle escalation, once a minute. Each step fires once per block:
    // at the end ("did you finish?"), +10 min (only if it's spilling into the next thing),
    // and +30 min (a last soft reminder). Answering any card stops them all.
    let minuteBooted = false;
    $effect(() => {
      const m = clock.minute;
      const cfg = settings.value;
      for (const b of nudges.checkIns) {
        const late = Math.floor((m - b.endMs) / MINUTE);
        const steps: [string, boolean, () => void][] = [
          [`ci0:${b.key}`, late >= 0, () => {
            sounds.headsUp();
            if (cfg.notify) platform.notify(`Time's up · ${b.title || 'block'}`, 'Did you finish? Tick it, give it more time, or let it go.');
          }],
          [`ci1:${b.key}`, late >= 10 && cfg.nudges.overrun, () => {
            const next = view.now.current;
            if (cfg.notify) platform.notify(next ? `${next.title} started ${formatDuration(m - next.startMs)} ago` : `Still on ${b.title}?`, next ? `Wrap up “${b.title}” when you can.` : 'A quick check-in keeps the day honest.');
          }],
          [`ci2:${b.key}`, late >= 30, () => {
            if (cfg.notify) platform.notify(`“${b.title}” is waiting for a check-in`, 'Done, later, or let it go — any answer is fine.');
          }],
        ];
        for (const [id, due, fire] of steps) {
          if (!due || fired.has(id)) continue;
          fired.add(id);
          // Launching late shouldn't replay a pile of old reminders.
          if (minuteBooted && late < 45) fire();
        }
      }

      // Time anchors: a soft tick and a line of context on the hour (or half hour).
      const a = cfg.nudges.anchors;
      const minOfHour = Math.round((m / MINUTE) % 60);
      if (minuteBooted && a !== 'off' && (minOfHour === 0 || (a === 'half' && minOfHour === 30)) && !fired.has(`an:${m}`)) {
        fired.add(`an:${m}`);
        sounds.tick();
        const s = view.now;
        const line = s.current ? `${s.current.title} · ${formatDuration(s.remainingMs)} left` : s.next ? `Free · ${s.next.title} in ${formatDuration(s.remainingMs)}` : 'Free time';
        view.say(`It's ${formatTime(m, view.hour12)} — ${line}`, undefined, 6000);
        if (document.hidden && cfg.notify) platform.notify(`It's ${formatTime(m, view.hour12)}`, line);
      }

      // Evening: offer the wind-down once.
      if (nudges.windDown && !fired.has(`wd:${view.today}`)) {
        fired.add(`wd:${view.today}`);
        if (minuteBooted && cfg.notify) platform.notify('Time to wind down', 'Close the day in a minute: what you did, what moves to tomorrow.');
      }
      minuteBooted = true;
    });

    // Menu-bar / tray text, once a minute.
    $effect(() => {
      clock.minute;
      const s = view.now;
      const ts = timer.status(clock.now);
      // The name gives way, never the countdown: "Deep work: draft the… · 25m".
      const fit = (name: string, tail: string, room = 30) => {
        const r = Math.max(6, room - tail.length);
        return `${name.length > r ? `${name.slice(0, r - 1).trimEnd()}…` : name}${tail}`;
      };
      let title: string | null = null;
      let tip = 'Daybloom';
      let nowLine = 'Nothing planned right now';
      let nextLine = '';
      const at = (ms: number) => formatTime(ms, view.hour12);
      if (ts && !ts.finished) {
        const name = timer.active ? shownTitle(timer.active.label, timer.active.category) : 'Timer';
        title = fit(name, ` · ${formatDuration(ts.remainingMs)}`);
        tip = `${name} · ${formatDuration(ts.remainingMs)}`;
        nowLine = `Focus: ${name} · ${formatDuration(ts.remainingMs)} left`;
      } else if (s.current) {
        const name = shownTitle(s.current.title, s.current.category);
        title = fit(name, ` · ${formatDuration(s.remainingMs)}`);
        tip = `${name} · ${formatDuration(s.remainingMs)} left${s.next ? ` — next: ${shownTitle(s.next.title, s.next.category)}` : ''}`;
        nowLine = `Now: ${name} · ${formatDuration(s.remainingMs)} left`;
      } else if (s.next) {
        const name = shownTitle(s.next.title, s.next.category);
        title = fit(name, '', 22);
        title = `${formatDuration(s.remainingMs)} → ${title}`;
        tip = `Free for ${formatDuration(s.remainingMs)}, then ${name}`;
        nowLine = `Free for ${formatDuration(s.remainingMs)}`;
      }
      if (s.next) nextLine = `Next: ${shownTitle(s.next.title, s.next.category)} at ${at(s.next.startMs)}`;
      if (nudges.attention) tip = `${nudges.attention} to check in · ${tip}`;
      void settings.value.privacy.hideNames;
      void settings.value.privacy.on;
      if (!settings.value.menuBarTimer) title = null;
      const key = `${title}|${tip}|${nowLine}|${nextLine}`;
      if (key !== lastTray) {
        lastTray = key;
        platform.setTrayStatus(title, tip, nowLine, nextLine).catch(() => {});
      }
    });
  });
}
