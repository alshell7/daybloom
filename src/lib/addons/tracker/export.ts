// Exports: duration rounding and RFC 4180 CSV. Pure.

import { formatTime, isoOf, MINUTE } from '../../engine/time';
import { durationMs } from './entries';
import type { Entry, RoundTo } from './types';

export type RoundMode = 'nearest' | 'up' | 'down';

/** A duration rounded to a step of `roundTo` minutes (0 = unchanged). Halves round up. */
export function roundMs(ms: number, roundTo: RoundTo, mode: RoundMode = 'nearest'): number {
  if (!roundTo) return Math.max(0, ms);
  const step = roundTo * MINUTE;
  const n = Math.max(0, ms) / step;
  // A small tolerance so 14:59.9999 of float noise is not pushed to the next step by 'up'.
  const k = mode === 'up' ? Math.ceil(n - 1e-9) : mode === 'down' ? Math.floor(n + 1e-9) : Math.floor(n + 0.5);
  return k * step;
}

/** Rounded minutes for an export column: whole steps, or exact to 2 decimals when roundTo is 0. */
export function roundedMinutes(ms: number, roundTo: RoundTo, mode: RoundMode = 'nearest'): number {
  const r = roundMs(ms, roundTo, mode);
  return roundTo ? Math.round(r / MINUTE) : Math.round((r / MINUTE) * 100) / 100;
}

export interface CsvOptions {
  now: number;
  roundTo?: RoundTo;
  roundMode?: RoundMode;
  /** Name for the task column; defaults to the task id, then the block key. */
  taskName?: (e: Entry) => string | undefined;
  /** Name for the project column; defaults to the project id. */
  projectName?: (e: Entry) => string | undefined;
  /** How many apps go in the "top apps" column. Default 3. */
  topApps?: number;
  /**
   * Prefix text that a spreadsheet would run as a formula (=, +, -, @, tab, CR) with an
   * apostrophe. Notes and window-derived app names are untrusted. Default true.
   */
  guardFormulas?: boolean;
  /** Include running entries (end left blank, minutes so far). Default true. */
  includeRunning?: boolean;
}

export const CSV_COLUMNS = ['date', 'start', 'end', 'minutes', 'task', 'project', 'note', 'source', 'top apps'] as const;

/** RFC 4180: quote a field holding a comma, a quote, CR or LF; double inner quotes. */
export function csvField(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function guard(v: string, on: boolean): string {
  return on && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

/** "Code 62%; Safari 30%" — the entry's own top apps by share of its app time. */
export function topAppsLabel(e: Entry, n = 3): string {
  const list = e.activity ?? [];
  const total = list.reduce((s, a) => s + a.ms, 0);
  if (!total || n <= 0) return '';
  return [...list]
    .sort((a, b) => b.ms - a.ms)
    .slice(0, n)
    .map((a) => `${a.app} ${Math.round((a.ms / total) * 100)}%`)
    .join('; ');
}

/** One header row and one row per entry, in start order, CRLF line breaks. */
export function entriesCsv(entries: Entry[], opts: CsvOptions): string {
  const { now, roundTo = 0, roundMode = 'nearest', topApps = 3, guardFormulas = true, includeRunning = true } = opts;
  const rows: string[] = [CSV_COLUMNS.join(',')];
  const list = [...entries].filter((e) => includeRunning || e.endMs != null).sort((a, b) => a.startMs - b.startMs);
  for (const e of list) {
    const text = (v: string | undefined) => csvField(guard(v ?? '', guardFormulas));
    rows.push(
      [
        isoOf(e.startMs),
        formatTime(e.startMs, false),
        e.endMs == null ? '' : formatTime(e.endMs, false),
        String(roundedMinutes(durationMs(e, now), roundTo, roundMode)),
        text(opts.taskName?.(e) ?? e.taskId ?? e.blockKey),
        text(opts.projectName?.(e) ?? e.projectId),
        text(e.note),
        e.source,
        text(topAppsLabel(e, topApps)),
      ].join(','),
    );
  }
  return rows.join('\r\n') + '\r\n';
}
