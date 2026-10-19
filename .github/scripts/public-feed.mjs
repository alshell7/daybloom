// Rewrites tauri-action's latest.json so every download points at the public feed repo,
// and writes the feed's README with plain download links.
// Usage: node public-feed.mjs <dir> <feedBaseUrl> <version>
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const [dir, base, version] = process.argv.slice(2);
const manifestPath = join(dir, 'latest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

for (const [platform, entry] of Object.entries(manifest.platforms ?? {})) {
  const file = decodeURIComponent(basename(new URL(entry.url).pathname));
  entry.url = `${base}/${encodeURIComponent(file)}`;
  console.log(`${platform} → ${entry.url}`);
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

const files = readdirSync(dir).filter((f) => !f.endsWith('.sig') && f !== 'latest.json' && f !== 'README.md');
const link = (f) => `[${f}](${base}/${encodeURIComponent(f)})`;
const pick = (re) => files.filter((f) => re.test(f)).map((f) => `- ${link(f)}`).join('\n') || '- (not in this release)';

writeFileSync(
  join(dir, 'README.md'),
  `# Daybloom ${version}

A visual, sectograph-style day planner and timer. Installed copies update themselves from this feed.

## macOS (Apple silicon + Intel)
${pick(/\.dmg$/)}

Not notarised yet. The first time, macOS stops the app:

1. Open **System Settings › Privacy & Security**.
2. Scroll to **Security**. Click **Open Anyway** next to the Daybloom message.

## Windows
${pick(/setup\.exe$|\.msi$/)}

Not code-signed yet. If SmartScreen shows a warning, click **More info**, then **Run anyway**.

---
Every update is signed; the app refuses any download that doesn't match its built-in key.
`,
);
