// npm run release [patch|minor|major|x.y.z]
// Bumps the version everywhere, commits, tags vX.Y.Z and pushes — CI does the rest.
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

pkg.version = next;
writeFileSync('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
lock.version = next;
if (lock.packages?.['']) lock.packages[''].version = next;
writeFileSync('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
const cargo = readFileSync('src-tauri/Cargo.toml', 'utf8').replace(/^version = ".*"$/m, `version = "${next}"`);
writeFileSync('src-tauri/Cargo.toml', cargo);

sh('git add package.json package-lock.json src-tauri/Cargo.toml');
sh(`git commit -m "Release v${next}"`);
sh(`git tag v${next}`);
sh('git push --follow-tags');
console.log(`\nv${next} pushed — the release workflow builds, signs and publishes it.`);
