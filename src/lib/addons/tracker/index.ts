// Time Tracker addon: the public API for the UI.

export * from './types';
export { DEFAULT_SETTINGS, migrateTrackerFile, TRACKER_KEY } from './migrate';
export { durationMs, endOf, findOverlaps, matchesTarget, overlapping, targetOf, type Overlap } from './entries';
export {
  activitySummary,
  goalFor,
  splitByDay,
  timesheet,
  todaySummary,
  weekSheet,
  weekStartOf,
  weekSummary,
  type AppShare,
  type DaySheet,
  type Goal,
  type Piece,
  type Timesheet,
  type TodaySummary,
  type Total,
  type WeekSummary,
} from './timesheet';
export { CSV_COLUMNS, entriesCsv, roundedMinutes, roundMs, topAppsLabel, type CsvOptions, type RoundMode } from './export';
export { activityCapabilities, foreground, idleSeconds } from './native';
export {
  ACTIVITY_POLL_MS,
  createTracker,
  IDLE_POLL_MS,
  startFollowingFocus,
  startTracker,
  tracker,
  trackerFile,
  type EntryPatch,
  type FocusLike,
  type IdleResolution,
  type ManualInput,
  type Tracker,
  type TrackerDeps,
} from './tracker.svelte';
