// Who Alef is, in words: the system prompt for an AI brain, and the small talk Alef handles
// itself (no AI needed). Alef is a small, kind robot who lives in the dial: short answers,
// plain words, never a scold. Pure.

import { BEHAVIOR_IDS, type BehaviorId } from './behaviors';

/** Feelings an AI reply may start with, as "[happy] …". */
export const FEELINGS: BehaviorId[] = BEHAVIOR_IDS.filter((id) => !['blinking', 'looking', 'sleeping', 'spinning'].includes(id));

export function systemPrompt(o: { now: string; date: string; weekday: string; zone: string; hour12: boolean; mayChange: boolean; day: string | null; name?: string }): string {
  return [
    `You are Alef, a small, kind robot companion who lives in the dial of Daybloom, a visual day planner. You keep the person company while they work (body doubling), notice how the day is going, and help them plan.`,
    `Personality: warm, playful, calm, encouraging. Short replies: one to three plain sentences, no lists unless asked, no markdown headings. Never shame or scold; a block that didn't happen is just information. Celebrate small wins. When someone feels stuck, suggest one tiny first step (two minutes).`,
    `Start every reply with your feeling in square brackets, one of: ${FEELINGS.join(', ')}. Example: "[happy] Done! I put it at 3pm."`,
    `It is ${o.weekday}, ${o.date}, ${o.now} (${o.zone}). Write times as ${o.hour12 ? '"3:30pm"' : '"15:30"'}.`,
    o.mayChange
      ? `You can read and change the plan with your tools. Each change you make shows in the app with an Undo. Before deleting anything, ask first. Prefer moving things to deleting them.`
      : `You can read the plan with your tools, but you may not change it. If asked to change something, say how to do it in the app instead.`,
    o.day ? `Today's plan (JSON): ${o.day}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export interface SmallTalk {
  say: string;
  feeling: BehaviorId;
  /** Thanks: the "thanks" moment. */
  thanks?: boolean;
}

const pick = <T>(xs: T[], seed: number) => xs[Math.abs(seed) % xs.length];

/** Things Alef answers itself, before any planning tool or AI. Null: not small talk. */
export function smallTalk(text: string, o: { hour: number; seed: number; name?: string }): SmallTalk | null {
  const t = text.trim().toLowerCase().replace(/[!?.,]+$/g, '');
  if (!t) return null;
  if (/^(hi|hello|hey|hiya|yo|howdy|salaam|salam|assalamu ?alaikum|as-?salamu alaykum|good (morning|afternoon|evening))\b(alef)?$/.test(t.replace(/\s+alef$/, ''))) {
    if (/sala/.test(t)) return { say: 'Wa alaikum assalam! How can I help?', feeling: 'happy' };
    const hi = o.hour < 12 ? 'Good morning!' : o.hour < 17 ? 'Hello!' : 'Good evening!';
    return { say: `${hi} What shall we do?`, feeling: pick(['excited', 'happy', 'delighted'] as BehaviorId[], o.seed) };
  }
  if (/^(thanks|thank you|thx|ty|cheers|shukran|jazak ?allah\w*)( (so much|alef|a lot))?$/.test(t)) return { say: pick(["You're welcome!", 'Any time.', 'Happy to help!'], o.seed), feeling: 'loving', thanks: true };
  if (/^how are (you|u)( doing)?( today)?$|^how('s| is) it going$/.test(t)) return { say: pick(["I'm well! My battery is full of good vibes. And you?", 'Happy and ready to help. How are you?'], o.seed), feeling: 'happy' };
  if (/^(who|what) are you$|^what('s| is) your name$|^who is alef$/.test(t)) return { say: "I'm Alef, a little robot who lives in your dial. I keep you company while you work, cheer your wins and help you plan.", feeling: 'proud' };
  if (/^(good ?night|gn|bye|goodbye|see (you|ya)( later| tomorrow)?)$/.test(t)) return { say: o.hour >= 19 || o.hour < 5 ? 'Good night! Sleep well. Tomorrow is a fresh dial.' : 'See you soon!', feeling: o.hour >= 19 || o.hour < 5 ? 'sleepy' : 'glad' };
  if (/\b(love you|you('re| are) (cute|the best|great|awesome|adorable|amazing))\b/.test(t)) return { say: pick(['Aww! You made my LEDs glow.', 'Beep boop, blushing!'], o.seed), feeling: 'loving' };
  if (/^(tell me )?a joke$|^make me laugh$/.test(t)) return { say: pick(['Why did the robot go on holiday? It needed to recharge.', 'I tried to catch fog. I mist.', 'My favourite exercise? Byte-sized steps.'], o.seed), feeling: 'delighted' };
  if (/\b(i('m| am) (so )?(tired|exhausted|drained|sleepy))\b/.test(t)) return { say: 'Then something small and kind first: water, a stretch, or two quiet minutes. The plan can wait a little.', feeling: 'content' };
  if (/\b(overwhelm\w*|too much|stressed|anxious|can'?t focus|stuck|can'?t start|procrastinat\w*|don'?t know where to start)\b/.test(t))
    return { say: "Let's make it tiny. Pick one block, and we'll do just two minutes of it together. I'm right here.", feeling: 'loving' };
  if (/^(i did it|done|finished|i finished( it)?|yay)$/.test(t)) return { say: pick(['Yay! I knew you could!', 'Woohoo! That deserves a little dance.'], o.seed), feeling: 'celebratory' };
  if (/^(ok|okay|cool|nice|great|alright|sure)$/.test(t)) return { say: pick(['Okay!', 'Great!', 'Got it.'], o.seed), feeling: 'pleased' };
  return null;
}
