// Data shapes for the Work addon. Addon data lives in its own file ('addon-work') and
// never extends `Task`: work is mapped onto tasks by key (see `Assignment`).
//
// Money is always an integer count of the currency's minor unit (cents for USD, yen for
// JPY, fils for BHD). Durations are whole minutes. Dates are local calendar dates.

import type { CalendarEvent, CategoryId, ISODate, Task } from '../../engine/types';

/** Integer amount in the minor unit of a currency (e.g. 12_50 = $12.50, 1200 = ¥1,200). */
export type Minor = number;

/**
 * How work is priced. `amount` is in minor units of the currency in force (the client's).
 * `fixed` is a price per task occurrence, billed once when it is done.
 * `none` means "no price here": resolution falls through to the next level.
 */
export type Rate = { kind: 'hourly'; amount: Minor } | { kind: 'fixed'; amount: Minor } | { kind: 'none' };

export interface Client {
  id: string;
  name: string;
  email?: string;
  /** Postal address; may hold several lines. */
  address?: string;
  /** ISO 4217 code, upper case. */
  currency: string;
  /** Used when a project has no rate of its own. */
  defaultRate?: Rate;
  /** Default tax for this client's invoices, in percent (e.g. 7.25). */
  taxPct?: number;
  notes?: string;
  archived?: boolean;
}

/** `hours` budgets hold hours (may be fractional); `money` budgets hold minor units. */
export interface Budget {
  kind: 'hours' | 'money';
  amount: number;
}

export interface Project {
  id: string;
  name: string;
  clientId?: string;
  /** A category id from engine/categories.ts, or a hex colour. */
  color: CategoryId | string;
  rate: Rate;
  budget?: Budget;
  archived?: boolean;
  /** Epoch ms. */
  createdAt: number;
}

/**
 * Puts work on a project. Keyed by task id (the whole task) or by block key
 * (`task:<taskId>@<date>`, one occurrence; also `cal:<account>:<event>` for a calendar event).
 * An occurrence assignment wins over the task's.
 */
export interface Assignment {
  projectId: string;
  billable: boolean;
  /** Overrides the project's rate. */
  rate?: Rate;
}

export type Discount = { kind: 'percent'; pct: number } | { kind: 'amount'; amount: Minor };

export type InvoiceStatus = 'draft' | 'sent' | 'paid';

export interface InvoiceLine {
  description: string;
  /** Hours (two decimals) for `hour` lines, a count for `item` lines. */
  quantity: number;
  unit: 'hour' | 'item';
  unitPrice: Minor;
  /** round(quantity × unitPrice). */
  amount: Minor;
  /** Work-item keys this line bills. Empty for a line typed by hand. */
  sourceKeys: string[];
}

export interface Invoice {
  id: string;
  /** e.g. `INV-2026-0007`: prefix, issue year, sequence within that year. */
  number: string;
  clientId: string;
  /** ISO 4217; the client's currency when the invoice was drafted. */
  currency: string;
  issueDate: ISODate;
  dueDate: ISODate;
  /** Billing period, inclusive. */
  from: ISODate;
  to: ISODate;
  lines: InvoiceLine[];
  taxPct: number;
  discount?: Discount;
  notes?: string;
  status: InvoiceStatus;
  paidAt?: ISODate;
  createdAt: number;
  updatedAt: number;
}

export interface BusinessProfile {
  name: string;
  email: string;
  address: string;
  taxId?: string;
  /** `data:image/(png|jpeg|gif|webp|svg+xml);base64,…` only. */
  logoDataUrl?: string;
  /** Days from issue to due date. */
  paymentTerms: number;
  /** Mirrors `WorkSettings.currency` (the store keeps them equal). */
  currency: string;
  /** e.g. 'INV'. May be empty. */
  invoicePrefix: string;
}

export interface WorkSettings {
  /** Bill the planned length of a done block when nothing was tracked for it. */
  billPlanned: boolean;
  /** Default currency: new clients, work without a client, headline analytics. */
  currency: string;
  /** 0 = Sunday … 6 = Saturday. */
  weekStartsOn: number;
}

export interface WorkData {
  version: 1;
  clients: Client[];
  projects: Project[];
  assignments: Record<string, Assignment>;
  invoices: Invoice[];
  /** Work-item key → id of the invoice that bills it. */
  invoicedKeys: Record<string, string>;
  settings: WorkSettings;
  profile: BusinessProfile;
}

/**
 * A stretch of tracked time from the Time Tracker addon. Matching, in order:
 * `blockKey` (that occurrence or event), `taskId` (that task on the entry's start date),
 * `projectId` alone (project time). `endMs: null` = still running (ends "now").
 */
export interface TrackedEntry {
  id?: string;
  blockKey?: string;
  taskId?: string;
  projectId?: string;
  startMs: number;
  endMs: number | null;
}

/** Inclusive calendar-date range. */
export interface DateRange {
  from: ISODate;
  to: ISODate;
}

export type RateSource = 'occurrence' | 'task' | 'project' | 'client' | 'none';

export interface RateResolution {
  rate: Rate;
  source: RateSource;
  currency: string;
}

/** Who a key bills to, and at what price. */
export interface Resolved extends RateResolution {
  key: string;
  taskId?: string;
  project: Project;
  client?: Client;
  billable: boolean;
  /** Which assignment decided project and billable. 'entry' = the tracked entry's projectId. */
  assignedBy: 'occurrence' | 'task' | 'project' | 'entry';
}

export type WorkItemKind = 'occurrence' | 'event' | 'project';

/** One row of work: a task occurrence, a calendar event, or a day of project time. */
export interface WorkItem {
  /** Block key (`task:<id>@<date>`), event key (`cal:…`) or `project:<id>@<date>`. */
  key: string;
  kind: WorkItemKind;
  taskId?: string;
  date: ISODate;
  /** Epoch ms, or null for anytime blocks and project time. */
  startMs: number | null;
  title: string;
  projectId: string;
  projectName: string;
  projectColor: string;
  clientId?: string;
  clientName?: string;
  billable: boolean;
  /** Block length; a done block counts up to when it was ticked, if that was earlier. */
  plannedMinutes: number;
  /** Sum of matching tracked entries. */
  trackedMinutes: number;
  /**
   * Tracked minutes when any time was tracked, else planned minutes when done and
   * `billPlanned` is on, else 0. On non-billable items it is the time that counts as worked.
   */
  billedMinutes: number;
  rate: Rate;
  rateSource: RateSource;
  /** Minor units of `currency`. 0 when not billable, not priced, or (fixed) not done. */
  amount: Minor;
  currency: string;
  done: boolean;
  /** Id of the invoice that bills this key, if any. */
  invoiceId?: string;
}

/** Everything the pure engine needs. */
export interface WorkContext {
  tasks: Task[];
  data: WorkData;
  entries?: TrackedEntry[];
  /** Calendar events, so event blocks assigned to a project can bill too. */
  events?: CalendarEvent[];
  /** Epoch ms used for running entries and "has this event ended". Defaults to Date.now(). */
  now?: number;
}
