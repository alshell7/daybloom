import { describe, expect, it } from 'vitest';
import { countLine, notesFor, parseNotes, versions } from './releaseNotes';

const MD = `# What's new

## Next

## 0.2.0

### New

- **Alef** — a small friend on your dial.
- A plain line without a name.

### Fixes

- **Menu bar** — keeps time while the planner is hidden.

_Signed builds._

## 0.1.9

### Addons

- **MCP** — AI apps can read your day.
`;

describe('release notes', () => {
  it('reads groups and items, and ignores loose lines', () => {
    const g = notesFor('0.2.0', MD);
    expect(g.map((x) => x.title)).toEqual(['New', 'Fixes']);
    expect(g[0].icon).toBe('sparkles');
    expect(g[0].items).toEqual([
      { name: 'Alef', text: 'a small friend on your dial.' },
      { name: '', text: 'A plain line without a name.' },
    ]);
    expect(g[1].items[0].name).toBe('Menu bar');
    expect(countLine(g)).toBe('3 new things');
  });

  it('reads the update feed body the same way', () => {
    const body = '### Addons\n\n- **MCP** — AI apps can read your day.\n\n_Signed builds for macOS and Windows._';
    expect(parseNotes(body)).toEqual([{ title: 'Addons', icon: 'puzzle', items: [{ name: 'MCP', text: 'AI apps can read your day.' }] }]);
    expect(parseNotes('Signed builds only.')).toEqual([]);
  });

  it('lists released versions, newest first, and has notes for the bundled file', () => {
    expect(versions(MD)).toEqual(['0.2.0', '0.1.9']);
    expect(notesFor('9.9.9', MD)).toEqual([]);
    expect(versions().length).toBeGreaterThan(0);
  });
});

describe('release notes in the update feed', () => {
  it('reads the plain feed form exactly as the Markdown, for every release', async () => {
    // @ts-expect-error a plain .mjs script
    const { plain } = await import('../../scripts/release-notes.mjs');
    const { readFileSync } = await import('node:fs');
    const file = readFileSync('RELEASE_NOTES.md', 'utf8');
    for (const v of versions(file)) {
      const lines = file.split('\n');
      const start = lines.findIndex((l) => l.trim() === `## ${v}`);
      const end = lines.findIndex((l, i) => i > start && /^## /.test(l));
      const md = lines.slice(start + 1, end < 0 ? undefined : end).join('\n');
      const flat = plain(md);
      expect(flat).not.toMatch(/\*\*|^#|^- /m);
      expect(parseNotes(flat)).toEqual(parseNotes(md));
    }
    expect(plain('### Fixes\n\n- **Sounds** — play `reliably`.\n\n_Signed builds._')).toBe('Fixes\n\n• Sounds — play reliably.\n\nSigned builds.');
  });
});
