// Addons: optional modules that extend Daybloom. Each one is off until you switch it on
// in the gallery; once on, it adds its own panel, a top-bar button and fields on blocks.
// Addon data lives in its own store (never inside tasks), so turning one off hides it
// without touching your day.

import { settings } from '../stores/settings.svelte';

export type AddonId = 'work' | 'tracker' | 'crumbs' | 'smaller' | 'reality' | 'waqt';

export interface AddonMeta {
  id: AddonId;
  name: string;
  tagline: string;
  description: string;
  icon: string;
  /** The addon's own accent (its tile and its charts). */
  accent: string;
  features: { icon: string; text: string }[];
  /** Sheet that opens the addon (addons that live on blocks have none: see `where`). */
  sheet?: 'work' | 'tracker' | 'crumbs' | 'reality' | 'waqt';
  /** Where to find an addon that has no panel of its own. */
  where?: string;
  shortcut?: string;
}

export const ADDONS: AddonMeta[] = [
  {
    id: 'work',
    name: 'Work',
    tagline: 'Every block can earn',
    description: 'Give blocks a project and a rate. See what your time is worth, and turn it into a clean bill in two clicks.',
    icon: 'briefcase',
    accent: '#25976A',
    features: [
      { icon: 'folder', text: 'Clients and projects, with hourly or fixed rates' },
      { icon: 'chart-column', text: 'Earnings by day, project and client, with budgets' },
      { icon: 'receipt', text: 'Bills you can print to PDF or export as CSV' },
    ],
    sheet: 'work',
  },
  {
    id: 'tracker',
    name: 'Time Tracker',
    tagline: 'Know where the time went',
    description: 'Track time on any block or project with one click. Daybloom notices when you step away, and can note which apps you used.',
    icon: 'timer',
    accent: '#3D6FE3',
    features: [
      { icon: 'play', text: 'One-click tracking, also started by focus sessions' },
      { icon: 'pointer', text: 'Idle detection: keep or drop time away' },
      { icon: 'app-window', text: 'Optional app activity and weekly timesheets' },
    ],
    sheet: 'tracker',
  },
  {
    id: 'crumbs',
    name: 'Breadcrumbs',
    tagline: 'Pick up where you left off',
    description: 'When you step away from a task, leave yourself one line about where you were. When you come back, it is the first thing you see. Stray thoughts during focus wait in a parking spot.',
    icon: 'pin',
    accent: '#B07E06',
    features: [
      { icon: 'pen', text: 'A gentle “where did you leave off?” when you leave or stop a focus session' },
      { icon: 'focus', text: 'Your last note waits in focus mode and on the block' },
      { icon: 'inbox', text: 'Park a stray thought mid-focus; send it to the backlog later' },
    ],
    sheet: 'crumbs',
  },
  {
    id: 'smaller',
    name: 'Make it smaller',
    tagline: 'For tasks that feel too big to start',
    description: 'One tap splits a task into a few small, friendly steps. The first one always takes two minutes, so starting is easy.',
    icon: 'layers',
    accent: '#138FA6',
    features: [
      { icon: 'sparkles', text: 'Steps that fit the task: writing, calls, cleaning, code and more' },
      { icon: 'pen', text: 'Change, remove or add steps before you keep them' },
      { icon: 'timer', text: 'Start the first step as a 2-minute focus' },
    ],
    where: 'Find “Too big?” on any task, in the backlog and in focus mode.',
  },
  {
    id: 'reality',
    name: 'Reality check',
    tagline: 'Plan with the time things really take',
    description: 'Daybloom quietly learns how long your blocks really take, from finished blocks, focus sessions and tracked time. Then it shows you, kindly, and offers a better length when you plan.',
    icon: 'hourglass',
    accent: '#8670E6',
    features: [
      { icon: 'chart-column', text: 'Planned and real time, side by side, by kind of task' },
      { icon: 'clock', text: '“Usually ~45m” when you set a length, one tap to use it' },
      { icon: 'shield', text: 'It never changes your plans by itself' },
    ],
    sheet: 'reality',
  },
  {
    id: 'waqt',
    name: 'Waqt',
    tagline: 'Salah, woven into your day',
    description: 'The five salah times on your dial and in your plans, with adhan, jamaat and Jumu’ah. Gentle reminders, the Hijri date, the Qibla, and a calm way to mark each prayer.',
    icon: 'moon',
    accent: '#25976A',
    features: [
      { icon: 'dial', text: 'Each prayer’s time on the dial, with its adhan and jamaat' },
      { icon: 'bell', text: 'Gentle reminders before the adhan, at it, and before jamaat' },
      { icon: 'globe', text: 'Your mosque’s times or calculated ones, the Hijri date, the Qibla' },
    ],
    sheet: 'waqt',
  },
];

export function addon(id: AddonId): AddonMeta {
  return ADDONS.find((a) => a.id === id)!;
}

export function isOn(id: AddonId): boolean {
  return settings.value.addons[id] === true;
}

export function setOn(id: AddonId, on: boolean) {
  settings.value.addons = { ...settings.value.addons, [id]: on };
}

export function enabledAddons(): AddonMeta[] {
  return ADDONS.filter((a) => isOn(a.id));
}
