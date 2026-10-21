// Reads the app's RELEASE_NOTES.md (the same notes the app's update card shows) at build time.
// Format: "## 0.1.13", then "### New" / "### Addons" / "### Fixes", each with
// "- **Name** — one plain sentence."

import raw from '../../../RELEASE_NOTES.md?raw';

export interface NoteItem {
  name: string;
  text: string;
}
export interface Version {
  version: string;
  groups: { title: string; items: NoteItem[] }[];
}

export function parseNotes(md: string): Version[] {
  const out: Version[] = [];
  let v: Version | null = null;
  let g: Version['groups'][number] | null = null;
  for (const line of md.split('\n')) {
    // "## Next" holds what is merged but not released yet.
    const ver = /^##\s+(\d+\.\d+\.\d+|Next)\s*$/.exec(line);
    if (ver) {
      v = { version: ver[1], groups: [] };
      out.push(v);
      g = null;
      continue;
    }
    if (/^##\s/.test(line)) {
      v = null;
      continue;
    }
    const head = /^###\s+(.+?)\s*$/.exec(line);
    if (head && v) {
      g = { title: head[1], items: [] };
      v.groups.push(g);
      continue;
    }
    const item = /^-\s+\*\*(.+?)\*\*\s*[—–-]\s*(.+)$/.exec(line);
    if (item && g) {
      // The notes continue the name in lower case ("— set any block…"); on the page each is a sentence.
      const text = item[2].trim().replace(/\*\*(.+?)\*\*/g, '$1');
      g.items.push({ name: item[1], text: text.charAt(0).toUpperCase() + text.slice(1) });
    }
  }
  return out.filter((x) => x.groups.some((gr) => gr.items.length));
}

export const NOTES = parseNotes(raw);

/** Names of the items in "## Next": merged, but not in a release yet. */
export const NEXT_NAMES = new Set((NOTES.find((v) => v.version === 'Next')?.groups ?? []).flatMap((g) => g.items.map((i) => i.name)));
