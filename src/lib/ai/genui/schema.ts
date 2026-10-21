// What an AI service may draw under its words: every generative-UI component's name, props (a
// zod object whose key order is the positional order in OpenUI Lang) and the description that
// teaches the model when to use it. Pure: no Svelte, so the prompt (prompt.ts) and the tests
// don't load any component. library.ts pairs each spec with its Svelte component.

import { tagSchemaId } from '@openuidev/lang-core';
import { z } from 'zod';

/** Any component (the children of Stack, Row and Card). */
export const Node = z.any();
tagSchemaId(Node, 'Component');

const CATS = ['focus', 'care', 'routine', 'social', 'rest', 'learn', 'move'] as const;
/** A category colour, lume (finished time) or ink. */
export const TONES = [...CATS, 'lume', 'ink'] as const;
export type Tone = (typeof TONES)[number];

// Optional props are nullish, so a model can skip a middle argument with null.
const str = () => z.string().nullish();
const day = () => z.string().nullish();
const hm = () => z.string().nullish();

export const BLOCK_ACTIONS = ['done', 'start', 'move', 'tomorrow', 'more', 'open'] as const;
export type BlockAction = (typeof BLOCK_ACTIONS)[number];
export const CONFIRM_ACTIONS = ['rest_to_tomorrow', 'move', 'tomorrow', 'done', 'start', 'breathe', 'focus'] as const;
export type ConfirmKind = (typeof CONFIRM_ACTIONS)[number];

export const StackProps = z.object({ children: z.array(Node), gap: z.enum(['s', 'm', 'l']).nullish() });
export const RowProps = z.object({ children: z.array(Node) });
export const CardProps = z.object({ children: z.array(Node), title: str(), icon: str() });
export const TextProps = z.object({ text: z.string(), tone: z.enum(['body', 'muted']).nullish() });
export const CalloutProps = z.object({ text: z.string(), kind: z.enum(['tip', 'note', 'win', 'care']).nullish(), title: str() });
export const BlockCardProps = z.object({ key: z.string(), note: str(), actions: z.array(z.enum(BLOCK_ACTIONS)).nullish() });
export const DayStripProps = z.object({ date: day(), keys: z.array(z.string()).nullish(), from: hm(), to: hm() });
export const FreeSlotsProps = z.object({ title: str(), minutes: z.number().nullish(), date: day(), from: hm(), to: hm() });
export const PlanItemProps = z.object({ title: z.string(), minutes: z.number(), start: hm(), category: z.enum(CATS).nullish(), id: str(), why: str() });
export const PlanProposalProps = z.object({ items: z.array(PlanItemProps), date: day(), title: str() });
export const StepsProps = z.object({ steps: z.array(z.string()), key: str(), title: str() });
export const ChoicesProps = z.object({ options: z.array(z.string()), prompt: str() });
export const StatProps = z.object({ label: z.string(), value: z.union([z.string(), z.number()]), hint: str(), tone: z.enum(TONES).nullish() });
export const StatTilesProps = z.object({ tiles: z.array(StatProps) });
export const BarChartProps = z.object({
  labels: z.array(z.string()),
  values: z.array(z.number()),
  unit: z.enum(['m', 'h', 'count', '%']).nullish(),
  title: str(),
  tone: z.enum(TONES).nullish(),
  highlight: z.number().nullish(),
});
export const ProgressRingProps = z.object({ value: z.number(), total: z.number(), label: str(), tone: z.enum(TONES).nullish() });
export const ConfirmActionProps = z.object({ label: z.string(), action: z.enum(CONFIRM_ACTIONS), key: str(), detail: str() });
export const BacklogItemsProps = z.object({ ids: z.array(z.string()), title: str() });

export interface Spec {
  name: string;
  props: z.ZodObject;
  description: string;
}

/** In prompt order. PlanItem and Stat are listed before the components that hold them. */
export const SPECS: Spec[] = [
  { name: 'Stack', props: StackProps, description: 'The root: components in a column, top to bottom. gap: s, m (default) or l.' },
  { name: 'Row', props: RowProps, description: 'Components side by side; they wrap on a narrow screen. E.g. a ProgressRing beside a Text.' },
  { name: 'Card', props: CardProps, description: 'A quiet framed group with an optional small heading (a few words, sentence case) and icon name (e.g. "sparkles", "target", "heart").' },
  { name: 'Text', props: TextProps, description: 'One or two short sentences; **bold**, *italics* and "- " lists work. Never repeat what you already said.' },
  { name: 'Callout', props: CalloutProps, description: 'A small highlighted note. kind: tip (an idea to try), note (good to know), win (celebrate something finished), care (rest, be kind to yourself).' },
  {
    name: 'BlockCard',
    props: BlockCardProps,
    description:
      'One real block, live: its icon, colour, time and a ring of its length (what is left while it runs), with buttons that act at once and offer Undo. key: the block key exactly as given (key=…). actions (optional; default fits its state): done = tick it, start = start two minutes on it now, move = slide it to the next free time, tomorrow = move it to tomorrow, more = 15 more minutes, open = open it in the editor. note: a few words under it.',
  },
  {
    name: 'DayStrip',
    props: DayStripProps,
    description:
      'A day as a thin timeline from wake to bedtime: blocks in their colours, free time left bare, the now line on today. date: "YYYY-MM-DD", "today" or "tomorrow" (default today). keys: blocks to pick out and list under it (the rest fade). from, to: "HH:MM" to show part of the day.',
  },
  {
    name: 'FreeSlots',
    props: FreeSlotsProps,
    description:
      'The free stretches on a day, found live around blocks, meetings and salah, each with an Add here button that puts a block called title, minutes long, at the start of that stretch. minutes: the length needed (default 30); only stretches that long show. Use it when they want a time for something.',
  },
  {
    name: 'PlanItem',
    props: PlanItemProps,
    description:
      'One proposed block, only inside PlanProposal: something new or from the backlog, never a block already on the plan. minutes: its length. start: "HH:MM" when it must start then; null fits it into the first free time after the item before. category: its colour. id: the backlog id=… when it comes from the backlog. why: three to six words.',
  },
  {
    name: 'PlanProposal',
    props: PlanProposalProps,
    description:
      'A plan to accept: proposed blocks drawn dashed on a small dial, each with a tick box, and one Place these button. Daybloom fits the items into free time in order, never on a meeting or salah. Use it for "plan my day/afternoon/tomorrow" instead of creating the blocks with tools. date: the day (default today).',
  },
  {
    name: 'Steps',
    props: StepsProps,
    description:
      'Tiny first steps to get going (2 to 5, each under 8 words; the first one takes two minutes), with a Start step 1 for 2 minutes button. key: the block they belong to (adds Save to the block). For when they feel stuck or a task is big.',
  },
  {
    name: 'Choices',
    props: ChoicesProps,
    description: '2 to 4 quick replies in their voice ("Make it lighter", "What\'s after that?"); a tap sends it as their next message. Never one that repeats a button above it (like "Place these"). prompt: a few words above them.',
  },
  { name: 'Stat', props: StatProps, description: 'One number, only inside StatTiles. value: "6h 20m", 12 or "80%". label: two or three words. hint: tiny context. tone: a category, lume (finished things) or ink.' },
  { name: 'StatTiles', props: StatTilesProps, description: 'Two to four numbers side by side.' },
  {
    name: 'BarChart',
    props: BarChartProps,
    description: 'A small bar chart, up to 14 bars (e.g. focus minutes per weekday). unit: m = minutes (shown as 1h 20m), h = hours, count or %. highlight: the index of the bar to stand out (e.g. today).',
  },
  { name: 'ProgressRing', props: ProgressRingProps, description: 'A ring of how much is done: value of total (e.g. 3 of 5 blocks today), in lume unless tone says otherwise. label: a few words.' },
  {
    name: 'ConfirmAction',
    props: ConfirmActionProps,
    description:
      'One clear button for one change, with Undo after. action: rest_to_tomorrow (moves today\'s unfinished one-off blocks to tomorrow; not routines, not the one running now), move (key to the next free time), tomorrow (key to tomorrow), done (tick key), start (two minutes on key), breathe (a one-minute breathing guide), focus (a focus timer of their usual length). label: the button words, e.g. "Move the rest to tomorrow". detail: one short line above it.',
  },
  { name: 'BacklogItems', props: BacklogItemsProps, description: 'Backlog tasks by their id=…, each with Add to today (the first free time that fits). title: a few words above them.' },
];

/** The prompt groups them, so a model finds the right one fast. */
export const GROUPS = [
  { name: 'Layout', components: ['Stack', 'Row', 'Card', 'Text', 'Callout'] },
  { name: 'Their day, live (by key)', components: ['BlockCard', 'DayStrip', 'FreeSlots'] },
  { name: 'Plans and actions', components: ['PlanProposal', 'PlanItem', 'Steps', 'ConfirmAction', 'BacklogItems', 'Choices'] },
  { name: 'Numbers', components: ['StatTiles', 'Stat', 'BarChart', 'ProgressRing'] },
];
