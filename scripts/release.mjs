// npm run release [patch|minor|major|x.y.z]
// Bumps the version everywhere (Cargo.lock too), turns "## Next" in RELEASE_NOTES.md into this
// version's notes, commits, tags vX.Y.Z and pushes — CI does the rest (the notes become the
// GitHub release text and what the app's update card shows).
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const sh = (cmd) => execSync(cmd, { stdio: 'inherit' });
const bump = process.argv[2] ?? 'patch';

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

sh('git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock RELEASE_NOTES.md');
sh(`git commit -m "Release v${next}"`);
sh(`git tag -a v${next} -m "Daybloom v${next}"`);
sh('git push');
sh(`git push origin v${next}`);
console.log(`\nv${next} pushed — the release workflow builds, signs and publishes it.`);
