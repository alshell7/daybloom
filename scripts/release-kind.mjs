// Native or web: does a release need a full install, or can installed apps refresh to it
// (src-tauri/src/ota.rs)? Native means anything the binary is built from changed since the last
// native release: src-tauri/** (Rust, plugins, capabilities, gen/android, the lockfile), or a
// @tauri-apps package the web layer calls into. Version bumps that `npm run release` makes, and
// runtime.json, do not count.
//   node scripts/release-kind.mjs [base-ref]   prints each native change (base: the last native release)
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

/** A file at `ref` (the working tree when ref is null), or null when it is not there. */
function at(ref, path) {
  try {
    return ref ? git('show', `${ref}:${path}`) : readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

/** The tag of the last native release (src-tauri/runtime.json → native), else the last tag. */
export function lastNativeTag() {
  const { native } = JSON.parse(readFileSync('src-tauri/runtime.json', 'utf8'));
  return native ? `v${native}` : git('describe', '--tags', '--abbrev=0').trim();
}

// Each file as it is when only the release script's version bump is left out.
const withoutVersion = {
  'src-tauri/Cargo.toml': (s) => s.replace(/^version = ".*"$/m, ''),
  'src-tauri/Cargo.lock': (s) => s.replace(/(\[\[package\]\]\nname = "daybloom"\nversion = )".*"/, '$1""'),
  'src-tauri/tauri.conf.json': (s) => {
    const conf = JSON.parse(s);
    delete conf.version;
    return JSON.stringify(conf);
  },
};

/** The @tauri-apps packages the web layer runs (not the CLI): name → version. */
function tauriPackages(file, text) {
  if (!text) return '';
  const json = JSON.parse(text);
  const deps =
    file === 'package.json'
      ? Object.entries(json.dependencies ?? {}).filter(([n]) => n.startsWith('@tauri-apps/'))
      : Object.entries(json.packages ?? {})
          .filter(([n]) => /^node_modules\/@tauri-apps\/(api|plugin-[^/]+)$/.test(n))
          .map(([n, p]) => [n, p.version]);
  return JSON.stringify(Object.fromEntries(deps.sort(([a], [b]) => a.localeCompare(b))));
}

/** Why the changes from `base` to `head` (null: the working tree) need a native release; empty when none do. */
export function nativeChanges(base, head = null) {
  const range = head ? [base, head] : [base];
  const files = git('diff', '--name-only', ...range, '--').split('\n').filter(Boolean);
  const reasons = [];
  for (const file of files) {
    const before = at(base, file);
    const after = at(head, file);
    if (file === 'src-tauri/runtime.json') continue;
    if (file in withoutVersion) {
      const same = before !== null && after !== null && withoutVersion[file](before) === withoutVersion[file](after);
      if (!same) reasons.push(file);
    } else if (file.startsWith('src-tauri/')) {
      reasons.push(file);
    } else if (file === 'package.json' || file === 'package-lock.json') {
      if (tauriPackages(file, before) !== tauriPackages(file, after)) reasons.push(`${file} (@tauri-apps packages)`);
    }
  }
  return reasons;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const base = process.argv[2] ?? lastNativeTag();
  const reasons = nativeChanges(base);
  console.log(reasons.length ? `Native since ${base}:\n  ${reasons.join('\n  ')}` : `Web only since ${base}.`);
}
