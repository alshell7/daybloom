// Addons: optional modules that extend Daybloom. Each one is off until you switch it on
// in the gallery; once on, it adds its own panel, a top-bar button and fields on blocks.
// Addon data lives in its own store (never inside tasks), so turning one off hides it
// without touching your day.

import { platform } from '../platform';
import { settings } from '../stores/settings.svelte';

export type AddonId = 'work' | 'tracker' | 'crumbs' | 'smaller' | 'reality' | 'waqt' | 'mcp' | 'landings' | 'retro' | 'alef' | 'views';

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
  sheet?: 'work' | 'tracker' | 'crumbs' | 'reality' | 'waqt' | 'mcp' | 'landings' | 'retro' | 'alef';
  /** Where to find an addon that has no panel of its own. */
  where?: string;
  shortcut?: string;
  /** The gallery group it shows under (see ADDON_GROUPS); none shows under "More". */
  group?: AddonGroup;
  /** Uses the AI set up in Settings › AI. */
  ai?: boolean;
  /** Only on a computer: a phone doesn't list it or run it, even when sync turned it on. */
  desktop?: boolean;
}

export type AddonGroup = 'plan' | 'time' | 'calm' | 'faith' | 'ai';

/** The gallery's groups, in the order they show. `short` labels the filter chip. */
export const ADDON_GROUPS: { id: AddonGroup; name: string; short: string }[] = [
  { id: 'plan', name: 'Plan & focus', short: 'Plan' },
  { id: 'time', name: 'Time & money', short: 'Time' },
  { id: 'calm', name: 'Calm & care', short: 'Calm' },
  { id: 'faith', name: 'Faith', short: 'Faith' },
  { id: 'ai', name: 'AI & connections', short: 'AI' },
];

const ALL: AddonMeta[] = [
  {
    id: 'work',
    group: 'time',
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
    group: 'time',
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
    group: 'plan',
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
    group: 'plan',
    ai: true,
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
    group: 'plan',
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
    group: 'faith',
    name: 'Waqt',
    tagline: 'Salah, woven into your day',
    description: 'The five salah times on your dial and in your plans, with adhan, jamaat and Jumu’ah. Gentle reminders, the Hijri date, the Qibla, and a calm way to mark each prayer.',
    icon: 'mihrab',
    accent: '#25976A',
    features: [
      { icon: 'dial', text: 'Each prayer’s time on the dial, with its adhan and jamaat' },
      { icon: 'bell', text: 'Gentle reminders before the adhan, at it, and before jamaat' },
      { icon: 'globe', text: 'Your mosque’s times or calculated ones, the Hijri date, the Qibla' },
    ],
    sheet: 'waqt',
  },
  {
    id: 'landings',
    group: 'calm',
    name: 'Soft landings',
    tagline: 'A gentle way back after meetings',
    description: 'After meetings or a long stretch, the next task can feel hard to pick up. Daybloom keeps a few minutes free to land, and when a meeting ends it offers three small stepping stones: a reset for your body, a little spark, and a two-minute first step into what’s next.',
    icon: 'leaf',
    accent: '#8670E6',
    features: [
      { icon: 'clock', text: 'Keeps a few minutes free after meetings in your plans and suggestions' },
      { icon: 'wind', text: 'When a meeting ends: breathe, stretch, a song, or a two-minute first step' },
      { icon: 'shuffle', text: 'Back-to-back blocks show in the timeline, with “Make room” one tap away' },
    ],
    sheet: 'landings',
  },
  {
    id: 'retro',
    group: 'calm',
    name: 'Retrospection',
    tagline: 'Look back kindly, plan a little better',
    description: 'A look back over your week or month: the story in a few lines, what went well, your days at a glance, and where things could be easier — each with a gentle tip and a fix you can make in one tap.',
    icon: 'trend-up',
    accent: '#138FA6',
    features: [
      { icon: 'star', text: 'Bright spots first: best days, focus time, your strongest hours' },
      { icon: 'lightbulb', text: 'Patterns that get in the way, with a gentle tip and a one-tap fix' },
      { icon: 'pen', text: 'Keep, change, try: three lines of your own each week' },
    ],
    sheet: 'retro',
  },
  {
    id: 'alef',
    group: 'ai',
    ai: true,
    name: 'Alef',
    tagline: 'A small robot friend in your dial',
    description: 'Alef lives in the middle of your dial. It keeps you company while you work, feels how the day is going and shows it with its eyes, lights and little chirps. Talk to it to plan: on this device, or with an AI service you choose.',
    icon: 'bot',
    accent: '#0E9FB0',
    features: [
      { icon: 'smile', text: '32 expressions that follow your day: happy when you finish, sleepy late at night' },
      { icon: 'focus', text: 'Works beside you in focus sessions, and cheers your wins' },
      { icon: 'sparkles', text: 'Talk to plan your day: on this device, or with OpenAI, Anthropic, Gemini, OpenRouter, Cloudflare or your own' },
    ],
    sheet: 'alef',
  },
  {
    id: 'views',
    group: 'plan',
    name: 'Timeline views',
    tagline: 'Your day as a board or a Gantt chart',
    description: 'See the same blocks in new ways. A board moves work from later to today to done with a drag. A Gantt chart lays your days side by side, so you can move and stretch blocks along the hours.',
    icon: 'columns',
    accent: '#3D6FE3',
    features: [
      { icon: 'columns', text: 'Board: drag blocks between Later, Today, Now and Done' },
      { icon: 'chart-gantt', text: 'Gantt: a day or a week on one timeline; drag to move or stretch' },
      { icon: 'shield', text: 'Calendar events and salah stay in place; free time shows between them' },
    ],
    where: 'Switch between List, Board and Gantt at the top of the timeline.',
  },
  {
    id: 'mcp',
    group: 'ai',
    name: 'MCP',
    tagline: 'Plan your day with your AI apps',
    description: 'A small, private connection for AI apps that speak MCP, like Claude and Codex. They can read your day, find free time, and add, move or finish blocks. It runs only on this computer, behind a key, and you can undo every change.',
    icon: 'plug',
    accent: '#DB4F94',
    features: [
      { icon: 'dial', text: 'Your day, free time, backlog, settings and insights, ready for any MCP app' },
      { icon: 'wand', text: 'Add, move and finish blocks; each change shows here with an Undo' },
      { icon: 'shield', text: 'Only on this computer, behind a key; read-only with one switch' },
    ],
    sheet: 'mcp',
    desktop: true,
  },
];

/** The addons this device can run. */
export const ADDONS = ALL.filter((a) => !(a.desktop && platform.isMobile));

export function addon(id: AddonId): AddonMeta {
  return ALL.find((a) => a.id === id)!;
}

export function isOn(id: AddonId): boolean {
  return settings.value.addons[id] === true && !(platform.isMobile && addon(id).desktop);
}

export function setOn(id: AddonId, on: boolean) {
  settings.value.addons = { ...settings.value.addons, [id]: on };
}

export function enabledAddons(): AddonMeta[] {
  return ADDONS.filter((a) => isOn(a.id));
}
