// Time Tracker addon: shared shapes. The store, the pure logic and the UI all speak these.

export type EntrySource = 'manual' | 'tracker' | 'focus';

/** Minutes that exported durations are rounded to. 0 = exact. */
export type RoundTo = 0 | 1 | 5 | 6 | 15;

/** Time spent in one app during an entry (merged by app name). */
export interface AppTime {
  app: string;
  ms: number;
  /** The last window title seen for this app (Windows, opt-in). */
  title?: string;
}

/** Idle time noticed during an entry. */
export interface IdleNote {
  /** Idle time kept inside the entry (it counts as tracked). */
  ms: number;
  /** Idle time cut off the end of the entry (it does not count). */
  droppedMs?: number;
}

export interface Entry {
  id: string;
  startMs: number;
  /** null → this entry is running. At most one entry runs at a time. */
  endMs: number | null;
  taskId?: string;
  /** A day block, `task:<taskId>@<date>` or `cal:<accountId>:<eventId>`. */
  blockKey?: string;
  projectId?: string;
  note?: string;
  source: EntrySource;
  idle?: IdleNote;
  activity?: AppTime[];
}

/** What an entry is for. Every field given must match (see `matchesTarget`). */
export interface TargetRef {
  taskId?: string;
  blockKey?: string;
  projectId?: string;
}

export interface StartInput extends TargetRef {
  note?: string;
  /** Default 'tracker'. */
  source?: EntrySource;
}

export interface TrackerSettings {
  /** Ask (or note) after this many minutes without input. */
  idleMinutes: number;
  /** true → raise `idlePrompt`; false → keep the idle time and note it on the entry. */
  askOnIdle: boolean;
  /** Opt-in: sample the frontmost app while tracking. */
  trackApps: boolean;
  /** Opt-in: also the window title (Windows only; macOS would need Screen Recording). */
  trackTitles: boolean;
  /** A focus session with a target starts and stops tracking for that target. */
  followFocus: boolean;
  /** Raise `reminder` when the computer is in use but nothing is tracked. */
  remindWhenNotTracking: boolean;
  /** Exports round each entry's duration to this many minutes. */
  roundTo: RoundTo;
  /** Daily goal in minutes for timesheets (0 = no goal). */
  dailyGoalMinutes: number;
}

export interface TrackerFile {
  version: 1;
  entries: Entry[];
  settings: TrackerSettings;
}

/** Shown by the UI: "You were away from 10:14. Keep the time · Drop the idle time · Drop it and stop". */
export interface IdlePrompt {
  /** When the idle stretch began (epoch ms). */
  since: number;
  entryId: string;
}

export type IdleChoice = 'keep' | 'drop' | 'drop-stop';

/** Shown by the UI when the computer is in use but nothing is tracked. */
export interface NotTrackingReminder {
  /** Nothing has been tracked since this instant. */
  since: number;
  at: number;
}

export type TrackerError = 'not-found' | 'invalid-range' | 'overlap' | 'too-few';

export type Result<T> = { ok: true; value: T } | { ok: false; error: TrackerError; conflicts: Entry[] };

export interface Foreground {
  app: string;
  title?: string;
}
