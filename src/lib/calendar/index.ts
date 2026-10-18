// Public surface of the calendar layer. UI code should import from here.

export * from './types';
export {
  calendarService,
  createCalendarService,
  defaultSyncWindow,
  type CalendarService,
  type CalendarServiceOptions,
  type SyncOptions,
  type SyncStatus,
} from './service';
export { getGoogleClient, type GoogleClientConfig } from './google';
export { normalizeIcsUrl, parseIcs, zonedTimeToUtc, type IcsCalendar, type IcsOccurrence } from './ics';
