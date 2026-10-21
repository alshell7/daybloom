// Time helpers in the visitor's own zone (the browser's local time).

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;

const pad = (n: number) => String(n).padStart(2, '0');

/** Does this visitor's locale write 2:30pm rather than 14:30? */
export function prefers12h(): boolean {
  try {
    const o = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions();
    if (o.hourCycle) return o.hourCycle === 'h12' || o.hourCycle === 'h11';
    return !!o.hour12;
  } catch {
    return false;
  }
}

export function formatTime(ms: number, hour12: boolean): string {
  const d = new Date(ms);
  const h = d.getHours();
  const m = pad(d.getMinutes());
  if (!hour12) return `${pad(h)}:${m}`;
  return `${h % 12 === 0 ? 12 : h % 12}:${m}${h < 12 ? 'am' : 'pm'}`;
}

/** "40m", "1h", "1h 15m" — rounded up to the minute, like the app. */
export function formatDuration(ms: number): string {
  const totalMin = Math.ceil(Math.abs(ms) / MINUTE - 1e-9);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** "4:59" for the last minutes, when the countdown turns to seconds. */
export function formatClockCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

export function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Local time at `minutes` after midnight of the day that holds `ms`. */
export const atMinutes = (ms: number, minutes: number) => {
  const d = new Date(startOfDay(ms));
  d.setMinutes(minutes);
  return d.getTime();
};

export const minutesOfDay = (ms: number) => {
  const d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes();
};
