// Make it smaller: turn a task that feels too big into a few small, friendly steps. The first
// step always takes about two minutes (getting started is the hard part); the rest share the
// block's time. Local and instant: steps come from templates for the kind of task, with the
// task's own words put in, and a second phrasing to shuffle to.

import type { CategoryId } from '../../engine/types';

export interface StepIdea {
  title: string;
  minutes: number;
}

interface Kind {
  /** Words that mark the kind (whole words, matched anywhere in the title). */
  words: string[];
  /** Phrasings: each a list of [step, share of the time]. `{x}` becomes what the task is about. */
  plans: [string, number][][];
}

const KINDS: Kind[] = [
  {
    words: ['write', 'draft', 'blog', 'essay', 'report', 'proposal', 'article', 'thesis', 'paper', 'letter', 'post', 'chapter', 'story', 'copy', 'summary', 'newsletter', 'doc'],
    plans: [
      [['Open a blank page for {x}', 0], ['Write the title and three points', 1], ['Write the first part badly (that’s allowed)', 4], ['Read it once and fix one thing', 2], ['Leave a note: what comes next', 1]],
      [['Put {x} on screen, even if it’s empty', 0], ['Say out loud, in one sentence, what it’s for', 1], ['Write for 10 minutes without editing', 4], ['Tidy one paragraph', 2]],
    ],
  },
  {
    words: ['email', 'emails', 'reply', 'respond', 'answer', 'message', 'messages', 'inbox', 'mail', 'dm', 'text'],
    plans: [
      [['Open the message and read it once', 0], ['Write one line: what do they need?', 1], ['Draft the reply, short is fine', 3], ['Send it, or schedule it', 1]],
      [['Open the oldest one', 0], ['Answer the quickest three', 3], ['Flag the rest for later', 1]],
    ],
  },
  {
    words: ['call', 'phone', 'ring', 'dial'],
    plans: [
      [['Find the number and put it on screen', 0], ['Write the one thing you need to ask', 1], ['Dial: the first 30 seconds are the hardest', 3], ['Note what was agreed', 1]],
      [['Write what you want to say, in three words', 0], ['Make the call', 3], ['Jot the next step', 1]],
    ],
  },
  {
    words: ['clean', 'tidy', 'declutter', 'laundry', 'dishes', 'vacuum', 'hoover', 'wash', 'organise', 'organize', 'sort', 'mop', 'dust', 'fold'],
    plans: [
      [['Pick one small spot to start', 0], ['Put away ten things', 2], ['Clean just that spot', 4], ['Take out what is leaving', 1]],
      [['Put on a song and start a timer', 0], ['Clear one surface', 3], ['Do one more thing if you feel like it', 2]],
    ],
  },
  {
    words: ['read', 'study', 'learn', 'review', 'revise', 'course', 'lesson', 'homework', 'practice', 'practise', 'research', 'book'],
    plans: [
      [['Open it where you stopped', 0], ['Read one page or one section', 4], ['Write two lines about what stuck', 2], ['Mark where to start next time', 1]],
      [['Skim the headings for five minutes', 1], ['Pick one part and go slowly', 4], ['Explain it to yourself in a sentence', 1]],
    ],
  },
  {
    words: ['code', 'fix', 'debug', 'build', 'implement', 'refactor', 'deploy', 'bug', 'feature', 'test', 'tests', 'release', 'merge', 'pr', 'ticket'],
    plans: [
      [['Open the project and run it once', 0], ['Write what “done” looks like, in one line', 1], ['Make the smallest change that moves it', 5], ['Run it again and leave a note for next time', 2]],
      [['Reproduce it, or find the file it lives in', 0], ['Write a failing test or a quick check', 2], ['Make it pass', 4], ['Commit, even if it’s rough', 1]],
    ],
  },
  {
    words: ['plan', 'prepare', 'prep', 'schedule', 'agenda', 'roadmap', 'strategy', 'outline'],
    plans: [
      [['List everything in your head, messy is fine', 2], ['Circle the three that matter', 1], ['Put the first one on the dial', 0]],
      [['Write the goal in one line', 0], ['List the steps you can see', 2], ['Pick the very first one', 1]],
    ],
  },
  {
    words: ['pay', 'bill', 'bills', 'tax', 'taxes', 'invoice', 'invoices', 'budget', 'bank', 'finance', 'finances', 'expenses', 'receipts', 'insurance'],
    plans: [
      [['Gather what you need: logins, papers', 0], ['Do just the first form or bill', 4], ['Write down what’s left', 1]],
      [['Open the account and look, nothing more', 0], ['Pay or file one item', 3], ['Put the next one on the dial', 1]],
    ],
  },
  {
    words: ['buy', 'order', 'shop', 'shopping', 'groceries', 'reserve', 'appointment', 'renew', 'register', 'sign'],
    plans: [
      [['Open the site or the app', 0], ['Pick an option: good enough is fine', 2], ['Confirm, and note it in Daybloom', 1]],
      [['Write the list', 1], ['Get the first three things', 2], ['Done for now', 0]],
    ],
  },
  {
    words: ['exercise', 'gym', 'run', 'walk', 'workout', 'yoga', 'stretch', 'swim', 'bike', 'cycle', 'train', 'training'],
    plans: [
      [['Put on your shoes and clothes', 0], ['Five easy minutes', 2], ['Keep going if it feels good', 5], ['Water and a breath', 1]],
      [['Step outside or onto the mat', 0], ['Warm up gently', 2], ['The main part, at your pace', 5]],
    ],
  },
  {
    words: ['cook', 'meal', 'dinner', 'lunch', 'breakfast', 'bake', 'recipe', 'food'],
    plans: [
      [['Choose what to make from what you have', 0], ['Get out what you need', 1], ['Cook the first part', 4], ['Plate it and sit down', 1]],
      [['Wash your hands and clear the counter', 0], ['Chop or prepare one thing', 2], ['Cook', 4]],
    ],
  },
  {
    words: ['presentation', 'slides', 'deck', 'pitch', 'talk', 'demo', 'speech'],
    plans: [
      [['Write the one message people should leave with', 0], ['Sketch five slide titles', 2], ['Fill the first slide roughly', 3], ['Say it out loud once', 2]],
      [['Open the last deck you liked', 0], ['Make the outline as slide titles', 2], ['Rehearse the opening minute', 2]],
    ],
  },
  {
    words: ['apply', 'application', 'cv', 'resume', 'form', 'forms', 'visa', 'passport', 'paperwork'],
    plans: [
      [['Open the form and read what it asks for', 0], ['Gather the documents', 2], ['Fill the first section only', 3], ['Save it and note what’s missing', 1]],
      [['Make a folder for it', 0], ['Fill the easy fields', 2], ['Write the hard part as bullets', 3]],
    ],
  },
  {
    words: ['move', 'moving', 'pack', 'packing', 'unpack', 'travel', 'trip'],
    plans: [
      [['Get one box or bag', 0], ['Pack one shelf or one drawer', 3], ['Label it', 1]],
      [['Write the list of what goes', 1], ['Pack the first five things', 2], ['Put the rest on the dial', 0]],
    ],
  },
];

/** Category-shaped fallbacks for titles that match no kind. */
const BY_CATEGORY: Partial<Record<CategoryId, [string, number][][]>> = {
  care: [[['Get what you need within reach', 0], ['Do the first part slowly', 3], ['Check in with how you feel', 1]]],
  social: [[['Open the chat or the contact', 0], ['Say hello first', 1], ['Take your time with it', 3]]],
  rest: [[['Put your phone face down', 0], ['Get comfortable', 1], ['Rest, nothing to do', 4]]],
};

const GENERIC: [string, number][][] = [
  [['Get set up: open what you need for {x}', 0], ['Do the very first tiny piece', 2], ['Keep going for ten minutes', 4], ['Stop and note the next step', 1]],
  [['Look at {x} for one minute, nothing more', 0], ['Write the first step you can see', 1], ['Do that one step', 4], ['Decide: keep going or stop here', 1]],
];

const LINKS = new Set(['to', 'for', 'on', 'about', 'with', 'up', 'out', 'at', 'into', 'of', 'off']);
const DETS = new Set(['the', 'a', 'an', 'my', 'our', 'your', 'this', 'that', 'these', 'those', 'some', 'his', 'her', 'their']);
const words = (s: string) => s.toLowerCase().match(/[a-z0-9’']+/g) ?? [];

/** The kind of task, by the first title word that marks one. */
function kindOf(title: string): Kind | null {
  for (const w of words(title)) {
    const k = KINDS.find((k) => k.words.includes(w));
    if (k) return k;
  }
  return null;
}

/** What the task is about, for `{x}`: the title without its leading verb, e.g. “the proposal”. */
export function subjectOf(title: string): string {
  const t = title.trim().replace(/[.!?]+$/, '');
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return t ? `“${t}”` : 'it';
  let rest = parts.slice(1);
  while (rest.length > 1 && LINKS.has(rest[0].toLowerCase())) rest = rest.slice(1);
  if (DETS.has(rest[0].toLowerCase())) rest = [rest[0].toLowerCase(), ...rest.slice(1)];
  return rest.join(' ') || 'it';
}

/**
 * Small steps for `title`. `variant` picks another phrasing (it cycles). `minutes` is the
 * block's length: the first step gets 2 minutes and the rest share what's left (at least 1).
 */
export function makeSmaller(title: string, opts: { category?: CategoryId; minutes?: number; variant?: number } = {}): StepIdea[] {
  const plans = kindOf(title)?.plans ?? (opts.category && BY_CATEGORY[opts.category]) ?? GENERIC;
  const plan = plans[Math.abs(opts.variant ?? 0) % plans.length];
  const x = subjectOf(title);
  const total = Math.max(10, Math.round(opts.minutes ?? 30));
  const shares = plan.slice(1).reduce((a, [, s]) => a + s, 0) || 1;
  const left = Math.max(plan.length - 1, total - 2);
  const steps = plan.map(([text, share], i) => ({
    title: text.replace('{x}', x),
    minutes: i === 0 ? 2 : Math.max(1, Math.round((left * share) / shares)),
  }));
  return steps;
}

/** How many phrasings there are for this title (for “other ideas”). */
export function variantsOf(title: string, category?: CategoryId): number {
  return (kindOf(title)?.plans ?? (category && BY_CATEGORY[category]) ?? GENERIC).length;
}
