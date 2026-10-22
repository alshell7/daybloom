// npm run release [patch|minor|major|x.y.z] [--web|--native]
// Bumps the version everywhere (Cargo.lock too), turns "## Next" in RELEASE_NOTES.md into this
// version's notes, commits, tags vX.Y.Z and pushes — CI does the rest (the notes become the
// GitHub release text and what the app's update card shows).
//
// A release is native when the binary changed since the last native release (see
// release-kind.mjs): CI builds installers, and RUNTIME in src-tauri/runtime.json goes up, so
// web updates for the old binaries stay apart. Otherwise it is a web update: CI signs only the
// web layer and installed apps refresh to it (src-tauri/src/ota.rs). --native or --web
// overrides the guess. runtime.json → native records the last native version; CI reads it.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { lastNativeTag, nativeChanges } from './release-kind.mjs';

const sh = (cmd) => execSync(cmd, { stdio: 'inherit' });
const args = process.argv.slice(2);
const bump = args.find((a) => !a.startsWith('--')) ?? 'patch';
const forced = args.includes('--native') ? 'native' : args.includes('--web') ? 'web' : null;

if (execSync('git status --porcelain').toString().trim()) {
  console.error('Commit or stash your changes first.');
  process.exit(1);
}

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const [ma, mi, pa] = pkg.version.split('.').map(Number);
const next = /^\d+\.\d+\.\d+$/.test(bump)
  ? bump
  : bump === 'major'
    ? `${ma + 1}.0.0`
    : bump === 'minor'
      ? `${ma}.${mi + 1}.0`
      : `${ma}.${mi}.${pa + 1}`;

const RUNTIME_FILE = 'src-tauri/runtime.json';
const runtime = JSON.parse(readFileSync(RUNTIME_FILE, 'utf8'));
const base = lastNativeTag();
const reasons = nativeChanges(base, 'HEAD');
const kind = forced ?? (reasons.length ? 'native' : 'web');
if (kind === 'web' && !runtime.native) {
  console.error('No native release has web updates yet (src-tauri/runtime.json → native is null). Release this one with --native.');
  process.exit(1);
}
if (kind === 'native') {
  // A new binary: its web updates are for a new runtime (the first one keeps RUNTIME).
  if (runtime.native) runtime.RUNTIME += 1;
  runtime.native = next;
}
console.log(
  kind === 'native'
    ? `v${next} is a native release (runtime ${runtime.RUNTIME})${forced ? ' (--native)' : `; changed since ${base}:\n  ${reasons.join('\n  ')}`}`
    : `v${next} is a web update for runtime ${runtime.RUNTIME}${forced ? ' (--web)' : `: nothing native changed since ${base}`}`,
);

// The notes first: a release always says what it brings.
sh(`node scripts/release-notes.mjs --roll ${next}`);

pkg.version = next;
writeFileSync('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
lock.version = next;
if (lock.packages?.['']) lock.packages[''].version = next;
writeFileSync('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
const cargo = readFileSync('src-tauri/Cargo.toml', 'utf8').replace(/^version = ".*"$/m, `version = "${next}"`);
writeFileSync('src-tauri/Cargo.toml', cargo);
// The lockfile records the crate's own version too; CI builds with --locked.
const cargoLock = readFileSync('src-tauri/Cargo.lock', 'utf8');
const bumped = cargoLock.replace(/(\[\[package\]\]\nname = "daybloom"\nversion = )".*"/, `$1"${next}"`);
if (bumped === cargoLock) {
  console.error('Could not find the daybloom entry in src-tauri/Cargo.lock.');
  process.exit(1);
}
writeFileSync('src-tauri/Cargo.lock', bumped);
writeFileSync(RUNTIME_FILE, `${JSON.stringify(runtime, null, 2)}\n`);

sh(`git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock ${RUNTIME_FILE} RELEASE_NOTES.md`);
sh(`git commit -m "Release v${next}${kind === 'web' ? ' (web update)' : ''}"`);
sh(`git tag -a v${next} -m "Daybloom v${next}"`);
sh('git push');
sh(`git push origin v${next}`);
console.log(`\nv${next} pushed — the release workflow ${kind === 'native' ? 'builds, signs and publishes it' : 'signs the web update and publishes it'}.`);
