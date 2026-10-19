// Addons: optional modules that extend Daybloom. Each one is off until you switch it on
// in the gallery; once on, it adds its own panel, a top-bar button and fields on blocks.
// Addon data lives in its own store (never inside tasks), so turning one off hides it
// without touching your day.

import { settings } from '../stores/settings.svelte';

export type AddonId = 'work' | 'tracker';

export interface AddonMeta {
  id: AddonId;
  name: string;
  tagline: string;
  description: string;
  icon: string;
  /** The addon's own accent (its tile and its charts). */
  accent: string;
  features: { icon: string; text: string }[];
  /** Sheet that opens the addon. */
  sheet: 'work' | 'tracker';
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
