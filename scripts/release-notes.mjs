// Release notes from RELEASE_NOTES.md.
//   node scripts/release-notes.mjs 0.1.12        prints that version's notes (exit 1 if missing)
//   node scripts/release-notes.mjs --roll 0.1.12  turns "## Next" into "## 0.1.12" (exit 1 if Next is empty)
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const md = readFileSync(FILE, 'utf8');
  if (process.argv[2] === '--roll') {
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
