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
export {
  icsSecretKey,
  normalizeIcsUrl,
  parseIcs,
  redactIcsUrl,
  zonedTimeToUtc,
  type IcsCalendar,
  type IcsOccurrence,
} from './ics';
export {
  detectIcsProvider,
  extractLink,
  FIND_LINK,
  PREVIEW_DAYS,
  previewIcs,
  type IcsPreview,
  type IcsPreviewError,
  type IcsPreviewErrorKind,
  type IcsPreviewOk,
  type IcsSource,
  type PreviewOptions,
} from './preview';
