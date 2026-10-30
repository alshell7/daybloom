// The buttons on a phone's reminders, chosen for the moment: what the block is, what it has
// (steps still open), what it's for (a billable Work block, a calendar event, a salah) and which
// addons are on (Time Tracker, Waqt). Android shows at most three. A tap is kept by Android
// (Reminders.kt) and applied by the planner when it runs — at once if it's open, else when it
// next opens — so the buttons work with Daybloom closed. "Remind me" needs no planner at all,
// and "Start 2 min" opens it. Pure, for tests; `applyNotifyAction` (reminders.svelte.ts) acts.

import type { Block, Task } from '../engine/types';

export type NotifyAct =
  /** Tick the block (or calendar event). */
  | 'done'
  /** Skip a calendar event (its time is free again). */
  | 'skip'
  /** Give the running block `arg` more minutes. */
  | 'extend'
  /** Move a block that hasn't begun to start now, same length. */
  | 'startNow'
  /** Park it in the backlog. */
  | 'later'
  /** Start the Time Tracker on it (at the moment of the tap). */
  | 'track'
  /** Open the planner on a 2-minute start (Help me start). */
  | 'start2'
  /** Show this reminder again in `arg` minutes (Android does it alone). */
  | 'remind'
  /** Waqt: mark the salah prayed, or prayed in jamaat. */
  | 'prayed'
  | 'jamaat';

export interface NotifyButton {
  act: NotifyAct;
  label: string;
  /** Minutes, for extend and remind. */
  arg?: number;
  /** Opens the planner (the action needs it on screen). */
  open?: boolean;
}

export interface NotifyContext {
  kind: 'start' | 'heads' | 'before' | 'salah';
  block?: Block;
  task?: Task | null;
  /** The Time Tracker addon is on. */
  tracker?: boolean;
  /** Work says this block is billable. */
  billable?: boolean;
  /** Already being tracked. */
  tracking?: boolean;
  /** Salah: which moment (before the adhan, at it, before jamaat) and whether there's a jamaat. */
  salah?: { moment: 'pre' | 'adhan' | 'jam'; jamaat: boolean };
}

/** At most three, in order of how likely each is wanted right then. */
export const MAX_BUTTONS = 3;

export function actionsFor(c: NotifyContext): NotifyButton[] {
  const out: NotifyButton[] = [];
  const add = (b: NotifyButton) => {
    if (out.length < MAX_BUTTONS && !out.some((x) => x.act === b.act)) out.push(b);
  };

  if (c.kind === 'salah') {
    const s = c.salah;
    if (!s || s.moment === 'pre') {
      add({ act: 'remind', label: 'Remind me in 5 min', arg: 5 });
      return out;
    }
    add({ act: 'prayed', label: 'Prayed' });
    if (s.jamaat) add({ act: 'jamaat', label: 'In jamaat' });
    add({ act: 'remind', label: 'Remind in 10 min', arg: 10 });
    return out;
  }

  const b = c.block;
  if (!b) return out;
  const event = b.kind === 'event';
  const own = b.kind === 'task' && !b.readOnly;
  const steps = (c.task?.subtasks ?? []).filter((s) => !s.done).length;
  const track = !!c.tracker && own && !c.tracking;
  const trackLabel = c.billable ? 'Bill time' : 'Track time';

  if (c.kind === 'before') {
    // Minutes ahead: start early, be reminded again closer, or let it wait.
    if (own) add({ act: 'startNow', label: 'Start now' });
    add({ act: 'remind', label: 'Remind in 5 min', arg: 5 });
    if (own) add({ act: 'later', label: 'Not today' });
    else if (event) add({ act: 'skip', label: 'Skip it' });
    return out;
  }

  if (c.kind === 'start') {
    if (event) {
      add({ act: 'done', label: 'Done' });
      add({ act: 'skip', label: 'Skip it' });
      add({ act: 'remind', label: 'Remind in 10 min', arg: 10 });
      return out;
    }
    if (!own) return out;
    add({ act: 'done', label: 'Done' });
    // A billable or tracked block wants its clock running; one with steps, a gentle start.
    if (track && (c.billable || steps === 0)) add({ act: 'track', label: trackLabel });
    if (steps > 0) add({ act: 'start2', label: 'Start 2 min', open: true });
    if (track) add({ act: 'track', label: trackLabel });
    add({ act: 'remind', label: 'Remind in 10 min', arg: 10 });
    add({ act: 'later', label: 'Not today' });
    return out;
  }

  // heads: the block is ending.
  if (event) {
    add({ act: 'done', label: 'Done' });
    return out;
  }
  if (!own) return out;
  add({ act: 'done', label: 'Done' });
  add({ act: 'extend', label: '10 more min', arg: 10 });
  add({ act: 'later', label: 'Finish later' });
  return out;
}
