// What a release brings, from RELEASE_NOTES.md (bundled for "what's new after the update")
// or from the update feed's notes (for "what you get if you update"). Groups are the
// file's `### New` / `### Addons` / `### Fixes`; items are `- **Name** — sentence.`

import NOTES from '../../RELEASE_NOTES.md?raw';

export interface NoteItem {
  name: string;
  text: string;
}
export interface NoteGroup {
  title: string;
  icon: string;
  items: NoteItem[];
}

const ICONS: Record<string, string> = { new: 'sparkles', addons: 'puzzle', fixes: 'check' };

/** Markdown inline bits we use: **bold**, _italic_, `code`, [text](link) → plain text. */
function plain(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(^|\W)_(.+?)_(\W|$)/g, '$1$2$3')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[(.+?)\]\([^)]*\)/g, '$1')
    .trim();
}

/**
 * Groups and items from a version's notes: Markdown (`### New`, `- **Name** — text`) or the
 * plain form the update feed carries (`New`, `• Name — text`). Other lines are ignored.
 */
export function parseNotes(md: string): NoteGroup[] {
  const out: NoteGroup[] = [];
  let cur: NoteGroup | null = null;
  for (const raw of md.split('\n')) {
    const line = raw.trim();
    const h = /^###\s+(.+)$/.exec(line) ?? /^(New|Addons|Fixes)$/i.exec(line);
    if (h) {
      cur = { title: plain(h[1]), icon: ICONS[plain(h[1]).toLowerCase()] ?? 'sparkles', items: [] };
      out.push(cur);
      continue;
    }
    const li = /^[-*•]\s+(.+)$/.exec(line);
    if (li && cur) {
      // A name only when a dash or colon follows it ("**Name** — text", "Name — text").
      const m = /^\*\*(.+?)\*\*\s*[—–:-]\s*(.*)$/.exec(li[1]) ?? /^([^—–*]{1,60}?)\s+[—–]\s+(.*)$/.exec(li[1]);
      cur.items.push(m ? { name: plain(m[1]), text: plain(m[2]) } : { name: '', text: plain(li[1]) });
    }
  }
  return out.filter((g) => g.items.length);
}

/** The bundled notes for one version (e.g. "0.1.12"), if there are any. */
export function notesFor(version: string, md: string = NOTES): NoteGroup[] {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => l.trim() === `## ${version}`);
  if (start < 0) return [];
  const end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  return parseNotes(lines.slice(start + 1, end < 0 ? undefined : end).join('\n'));
}

/** The released versions in the bundled file, newest first. */
export function versions(md: string = NOTES): string[] {
  return [...md.matchAll(/^## (\d+\.\d+\.\d+)\s*$/gm)].map((m) => m[1]);
}

/** "3 new things" for a chip. */
export function countLine(groups: NoteGroup[]): string {
  const n = groups.reduce((s, g) => s + g.items.length, 0);
  return n === 1 ? '1 new thing' : `${n} new things`;
}
