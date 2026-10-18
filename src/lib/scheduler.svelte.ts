// Transition support: a heads-up before a block ends, a soft cue when the next one
// begins, and the timer's end. Runs only in the main window so nothing doubles up.

import { formatDuration, formatTime, MINUTE } from './engine/time';
import { platform } from './platform';
import { configureSound, sounds } from './sound';
import { clock } from './stores/clock.svelte';
import { settings } from './stores/settings.svelte';
import { timer } from './stores/timer.svelte';
import { view } from './stores/view.svelte';

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
      const headsUpMs = cfg.headsUp * MINUTE;
      const inHeadsUp = !!cur && !cur.done && headsUpMs > 0 && s.remainingMs <= headsUpMs && cur.endMs - cur.startMs > headsUpMs * 1.5;
      view.headsUpKey = inHeadsUp ? cur!.key : null;
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
          view.say(`${timer.active?.label ?? 'Timer'} finished`);
          timer.stop();
          lastTimerIndex = -1;
        }
      } else lastTimerIndex = -1;
    });

    // Menu-bar / tray text, once a minute.
    $effect(() => {
      clock.minute;
      const s = view.now;
      const ts = timer.status(clock.now);
      let title: string | null = null;
      let tip = 'Daybloom';
      if (ts && !ts.finished) {
        title = `${timer.active?.label ?? 'Timer'} · ${formatDuration(ts.remainingMs)}`;
        tip = title;
      } else if (s.current) {
        title = `${s.current.title} · ${formatDuration(s.remainingMs)}`;
        tip = `${title} left${s.next ? ` — next: ${s.next.title}` : ''}`;
      } else if (s.next) {
        title = `${formatDuration(s.remainingMs)} → ${s.next.title}`;
        tip = `Free for ${formatDuration(s.remainingMs)}, then ${s.next.title}`;
      }
      if (!settings.value.menuBarTimer) title = null;
      if (title && title.length > 28) title = `${title.slice(0, 26)}…`;
      const key = `${title}|${tip}`;
      if (key !== lastTray) {
        lastTray = key;
        platform.setTrayStatus(title, tip).catch(() => {});
      }
    });
  });
}
