// The generative-UI half of an AI system prompt, and the check an answer's UI must pass before
// it is kept. The library here has no Svelte components (schema.ts only), so a conversation
// can teach the model and validate its OpenUI Lang without loading anything that renders;
// GenUi.svelte loads the real library when there is something to draw.

import { createLibrary, createParser, defineComponent, type ElementNode, type Library } from '@openuidev/lang-core';
import { GROUPS, SPECS } from './schema';

let lib: Library | null = null;
/** The specs as an OpenUI library (built once). */
export function specLibrary(): Library {
  return (lib ??= createLibrary({
    components: SPECS.map((s) => defineComponent({ ...s, component: null })),
    componentGroups: GROUPS,
    root: 'Stack',
  }));
}

const PREAMBLE =
  'Daybloom can draw a few small, live components under your words. You write them in openui-lang, a compact language with one statement per line. The components read the real day by block key and act with an Undo, so they always show what is true.';

const EXAMPLES = [
  `Example: "plan my afternoon" (after the words):
\`\`\`openui
root = Stack([plan, more])
plan = PlanProposal([a, b, c])
a = PlanItem("Write the report intro", 45, "14:00", "focus", null, "fresh after lunch")
b = PlanItem("Walk outside", 20, null, "move")
c = PlanItem("Reply to emails", 30, null, "focus", "ID_FROM_BACKLOG")
more = Choices(["Make it lighter", "Add a break"])
\`\`\``,
  `Example: they feel stuck on a block:
\`\`\`openui
root = Stack([steps])
steps = Steps(["Open the report", "Write one messy sentence", "Read it back once"], "KEY_FROM_THE_PLAN")
\`\`\``,
  `Example: "when can I fit an hour of deep work tomorrow?":
\`\`\`openui
root = Stack([slots])
slots = FreeSlots("Deep work", 60, "tomorrow")
\`\`\``,
  `Example: "how was my week?" (numbers from get_insights):
\`\`\`openui
root = Stack([tiles, chart])
tiles = StatTiles([Stat("Finished", 12, "this week", "lume"), Stat("Focus time", "6h 20m", null, "focus")])
chart = BarChart(["Mon", "Tue", "Wed", "Thu", "Fri"], [60, 95, 30, 120, 45], "m", "Focus each day", "focus", 4)
\`\`\``,
];

const made: Partial<Record<'alef' | 'assistant', string>> = {};

/** The rules and component list to add to a system prompt (made once per voice). */
export function uiPrompt(who: 'alef' | 'assistant'): string {
  return (made[who] ??= make(who));
}

function make(who: 'alef' | 'assistant'): string {
  const speak =
    who === 'alef'
      ? 'Always speak first, after your feeling tag, in one to three short sentences: they are spoken aloud in your speech bubble. Never describe the components in words.'
      : 'Always answer in words first, one or two short sentences. Never describe the components in words.';
  const text = specLibrary().prompt({
    preamble: PREAMBLE,
    toolCalls: false,
    bindings: false,
    examples: EXAMPLES,
    additionalRules: [
      speak,
      'Then, only when a visual really helps, add exactly ONE fenced block at the very end, starting with ```openui and ending with ```. Use one when they ask to plan (PlanProposal), feel stuck or can\'t start (Steps), look for time (FreeSlots), ask about a block (BlockCard) or about their week (StatTiles, BarChart). Most other replies need none: small talk, a plain answer, or a change you already made and said.',
      'Never mention a button, card or list in your words unless your block has it.',
      'Use block keys (key=…) and backlog ids (id=…) exactly as they appear in the plan or in a tool result. Never invent a key or an id; without one, leave that component out. Placeholders in the examples are not real.',
      'Times are 24-hour "HH:MM"; days are "YYYY-MM-DD", "today" or "tomorrow".',
      'Buttons in the components change the plan themselves, with Undo (PlanProposal, FreeSlots, BlockCard, Steps, ConfirmAction, BacklogItems). So for one change, either make it with a tool or offer it with a component, never both. After a tool change, a BlockCard with the key from the tool result can show it.',
      'Keep it small: one root Stack with one to three children. One strong component beats many.',
      'Labels are kind and short. Never "overdue", "missed", "failed", "behind" or "late".',
      'Only the components above exist. No Query, Mutation, Action, @functions or $variables.',
    ],
  });
  // Nothing streams here, so the streaming section only costs tokens; and say which of ours fits.
  return text
    .replace(/## Hoisting & Streaming[\s\S]*?(?=## Examples|## Important Rules)/, '')
    .replace(
      /- Choose components that best represent the content[^\n]*/,
      '- Choose the one that fits: PlanProposal for a plan, FreeSlots to find time, BlockCard for one block, Steps to get going, Choices for what to ask next, StatTiles or BarChart for numbers.',
    );
}

const KNOWN = new Set(SPECS.map((s) => s.name));
const HOLDERS: Record<string, string> = { Stack: 'children', Row: 'children', Card: 'children' };

/** Will this node draw something? Containers need at least one child that does. */
function draws(v: unknown): boolean {
  if (Array.isArray(v)) return v.some(draws);
  const n = v as ElementNode | null;
  if (!n || typeof n !== 'object' || n.type !== 'element' || !KNOWN.has(n.typeName)) return false;
  if (n.typeName === 'PlanItem' || n.typeName === 'Stat') return false;
  const holder = HOLDERS[n.typeName];
  return holder ? draws(n.props?.[holder]) : true;
}

/** The UI an answer carries, if it parses to something that draws; null otherwise (show the words alone). */
export function checkUi(source: string | null | undefined): string | null {
  const src = source?.trim();
  if (!src || src.length > 8000) return null;
  try {
    const r = createParser(specLibrary().toJSONSchema()).parse(src);
    // Cut off mid-statement (the reply ran out of room): a half plan is worse than none.
    if (r.meta.incomplete) return null;
    return r.root && draws(r.root) ? src : null;
  } catch {
    return null;
  }
}
