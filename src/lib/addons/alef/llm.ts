// Alef's side of the shared AI services (lib/ai/providers.ts): the feeling tag an AI reply
// starts with, which tells Alef's face how to look.

export * from '../../ai/providers';

/** "[happy] Sure!" → { feeling: 'happy', text: 'Sure!' } (the tag tells Alef's face how to look). */
export function splitFeeling(reply: string, known: string[]): { feeling: string | null; text: string } {
  const m = /^\s*\[([a-z-]+)\]\s*/i.exec(reply);
  if (m && known.includes(m[1].toLowerCase())) return { feeling: m[1].toLowerCase(), text: reply.slice(m[0].length).trim() };
  return { feeling: null, text: reply.trim() };
}

/** A reply's feelings as it goes: "[curious] Let me look… [happy] Found one!" → the words and where each feeling starts (0..1 of the text). */
export function beatsOf(reply: string, known: string[]): { text: string; beats: { at: number; feeling: string }[] } {
  const first = splitFeeling(reply, known);
  const beats: { at: number; feeling: string }[] = first.feeling ? [{ at: 0, feeling: first.feeling }] : [];
  let text = '';
  let rest = first.text;
  const tag = /\s*\[([a-z-]+)\]\s*/gi;
  let last = 0;
  for (const m of rest.matchAll(tag)) {
    const f = m[1].toLowerCase();
    if (!known.includes(f)) continue;
    text += rest.slice(last, m.index);
    beats.push({ at: text.length, feeling: f });
    text += text && !/\s$/.test(text) ? ' ' : '';
    last = m.index! + m[0].length;
  }
  text = (text + rest.slice(last)).replace(/\s{2,}/g, ' ').trim();
  return { text, beats: beats.map((b) => ({ ...b, at: text.length ? Math.min(1, b.at / text.length) : 0 })) };
}
