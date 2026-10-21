// An AI answer is words, then (sometimes) one fenced ```openui block of OpenUI Lang. This splits
// the two: the words stay the speech bubble, the spoken line and the answer's text; the block
// becomes the UI under them. It forgives what models do: "openui-lang" fences, a missing
// closing fence, a plain ``` fence or bare lines that start with `root = …`. Pure.

const OPENUI = /```[ \t]*openui(?:-lang)?[^\n]*\n([\s\S]*?)(?:\n[ \t]*```|$)/gi;
const PLAIN = /```[a-z-]*[ \t]*\n(\s*root\s*=\s*[A-Z][\s\S]*?)(?:\n[ \t]*```|$)/g;
const BARE = /(^|\n)(root[ \t]*=[ \t]*[A-Z]\w*\([\s\S]*)$/;

/** "Words ```openui\nroot = …```" → { text: 'Words', ui: 'root = …' } (ui null when there is none). */
export function splitUi(reply: string): { text: string; ui: string | null } {
  let ui: string | null = null;
  const take = (_: string, code: string) => {
    if (ui === null && code.trim()) ui = code.trim();
    return '\n';
  };
  let text = reply.replace(OPENUI, take);
  if (ui === null) text = text.replace(PLAIN, take);
  if (ui === null) {
    const m = BARE.exec(text);
    if (m) {
      ui = m[2].trim();
      text = text.slice(0, m.index);
    }
  }
  text = text
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { text, ui };
}
