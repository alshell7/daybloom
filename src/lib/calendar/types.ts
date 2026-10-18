// Calendar-integration types. Domain events use `CalendarEvent` from the engine so
// the dial can render them next to tasks without conversion.

import type { CalendarEvent } from '../engine/types';

export type ProviderKind = CalendarEvent['provider'];

/** Half-open interval [startMs, endMs) in epoch milliseconds. */
export interface TimeRange {
  startMs: number;
  endMs: number;
}

export interface CalendarInfo {
  id: string;
  name: string;
  /** Hex colour, `#rrggbb`. */
  color: string;
  /** User toggle; disabled calendars are neither fetched nor shown. */
  enabled: boolean;
  primary?: boolean;
}

export interface CalendarAccount {
  /** `google:<sub>` or `ics:<hash of url>` — stable, so re-adding updates in place. */
  id: string;
  provider: ProviderKind;
  /** Google: the account email. ICS: the name the user gave the subscription. */
  label: string;
  /** ICS feed URL (already normalised from webcal:// to https://). */
  url?: string;
  calendars: CalendarInfo[];
  enabled: boolean;
  lastSyncAt?: number;
  /**
   * Last sync problem, or null when healthy. `'reconnect'` (see `RECONNECT`) means the
   * stored grant is gone and the user must run connect again; anything else is a
   * human-readable message.
   */
  error?: string | null;
}

/** Value of `CalendarAccount.error` when the user has to sign in again. */
export const RECONNECT = 'reconnect';

export interface ConnectInput {
  /** ICS only. */
  url?: string;
  /** ICS only: display name. */
  label?: string;
}

export interface CalendarProvider {
  readonly kind: ProviderKind;
  /** Google: interactive browser sign-in. ICS: validates and fetches the feed. */
  connect(input?: ConnectInput): Promise<CalendarAccount>;
  listCalendars(account: CalendarAccount): Promise<CalendarInfo[]>;
  fetchEvents(account: CalendarAccount, calendar: CalendarInfo, range: TimeRange): Promise<CalendarEvent[]>;
  /** Forget credentials (keychain) and revoke access where possible. */
  disconnect(account: CalendarAccount): Promise<void>;
}

export type CalendarErrorCode =
  /** Grant revoked/expired or scope missing — connect again. */
  | 'reconnect'
  /** App misconfiguration (no client id, API disabled, bad client secret). */
  | 'config'
  /** The user cancelled or closed the sign-in. */
  | 'cancelled'
  /** OAuth protocol failure (state mismatch, missing code, …). */
  | 'auth'
  | 'network'
  | 'http'
  /** Bad user input (e.g. not a calendar URL). */
  | 'invalid';

/** Every provider failure is a CalendarError with a message that is safe to show. */
export class CalendarError extends Error {
  readonly code: CalendarErrorCode;
  constructor(code: CalendarErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'CalendarError';
    this.code = code;
  }
}
