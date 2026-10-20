// Release notes from RELEASE_NOTES.md.
//   node scripts/release-notes.mjs 0.1.12        prints that version's notes (exit 1 if missing)
//   node scripts/release-notes.mjs --roll 0.1.12  turns "## Next" into "## 0.1.12" (exit 1 if Next is empty)
//   node scripts/release-notes.mjs --plain-json latest.json  rewrites the update feed's notes as plain text
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const FILE = fileURLToPath(new URL('../RELEASE_NOTES.md', import.meta.url));

/** The body under `## heading`, up to the next `## `. */
export function section(md, heading) {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => l.trim() === `## ${heading}`);
  if (start < 0) return null;
  const end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  return lines
    .slice(start + 1, end < 0 ? undefined : end)
    .join('\n')
    .trim();
}

/** Next → the version; a fresh, empty Next above it. */
export function roll(md, version) {
  const next = section(md, 'Next');
  if (!next) return null;
  if (section(md, version) !== null) return null;
  return md.replace(/^## Next\s*$/m, `## Next\n\n## ${version}`);
}

/**
 * Notes as plain text, for the update feed: apps before 0.1.12 show them as-is (in a tooltip),
 * so no Markdown marks. Newer apps read this format too (src/lib/releaseNotes.ts).
 *   ### New            → New
 *   - **Name** — text  → • Name — text
 */
export function plain(md) {
  return md
    .split('\n')
    .map((raw) => {
      const line = raw.trim();
      const h = /^#{1,6}\s+(.+)$/.exec(line);
      if (h) return h[1].trim();
      const li = /^[-*]\s+(.+)$/.exec(line);
      const text = (li ? li[1] : line)
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/(^|[\s(])_(.+?)_(?=[\s).,!?;:]|$)/g, '$1$2')
        .replace(/`(.+?)`/g, '$1')
        .replace(/\[(.+?)\]\([^)]*\)/g, '$1');
      return li ? `• ${text}` : text;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const md = readFileSync(FILE, 'utf8');
  if (process.argv[2] === '--plain-json') {
    const file = process.argv[3];
    const feed = JSON.parse(readFileSync(file, 'utf8'));
    if (typeof feed.notes === 'string') feed.notes = plain(feed.notes);
    writeFileSync(file, `${JSON.stringify(feed, null, 2)}\n`);
  } else if (process.argv[2] === '--roll') {
    const out = roll(md, process.argv[3]);
    if (!out) {
      console.error('Nothing under "## Next" in RELEASE_NOTES.md (or that version is already there). Write what this release adds first.');
      process.exit(1);
    }
    writeFileSync(FILE, out);
  } else {
    const body = section(md, process.argv[2]);
    if (!body) process.exit(1);
    process.stdout.write(`${body}\n`);
  }
}
