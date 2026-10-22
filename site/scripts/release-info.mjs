// Reads the latest Daybloom release from GitHub and writes src/data/release.json, which the
// download buttons use (the page also checks for a newer release when it loads). If GitHub
// cannot be reached, the file that is already there stays, so builds work offline.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = "alshell7/daybloom";
const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "data");
const file = join(dir, "release.json");
const datesFile = join(dir, "release-dates.json");

export function pick(release) {
  const assets = release.assets ?? [];
  const find = (re) => assets.find((a) => re.test(a.name));
  const asset = (a) =>
    a
      ? {
          name: a.name,
          size: a.size,
          url: `https://github.com/${REPO}/releases/latest/download/${a.name}`,
        }
      : null;
  return {
    tag: release.tag_name,
    version: String(release.tag_name ?? "").replace(/^v/, ""),
    publishedAt: release.published_at,
    page: release.html_url ?? `https://github.com/${REPO}/releases/latest`,
    mac: asset(find(/_universal\.dmg$/i) ?? find(/\.dmg$/i)),
    win: asset(find(/x64-setup\.exe$/i) ?? find(/\.exe$/i)),
    msi: asset(find(/\.msi$/i)),
    android: asset(find(/_android\.apk$/i) ?? find(/\.apk$/i)),
  };
}

async function main() {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "daybloom-site-build",
  };
  if (process.env.GITHUB_TOKEN)
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/releases/latest`,
      { headers, signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
    const info = pick(await res.json());
    if (!info.mac || !info.win)
      throw new Error("the latest release has no .dmg or .exe");
    writeFileSync(file, `${JSON.stringify(info, null, 2)}\n`);
    console.log(
      `release-info: ${info.tag} (${info.mac.name}, ${info.win.name})`,
    );
    // Dates for the changelog.
    const list = await fetch(
      `https://api.github.com/repos/${REPO}/releases?per_page=40`,
      { headers, signal: AbortSignal.timeout(10_000) },
    );
    if (list.ok) {
      const dates = {};
      for (const r of await list.json())
        if (!r.draft && r.published_at)
          dates[String(r.tag_name).replace(/^v/, "")] = r.published_at;
      writeFileSync(datesFile, `${JSON.stringify(dates, null, 2)}\n`);
    }
  } catch (e) {
    if (!existsSync(file)) throw e;
    const kept = JSON.parse(readFileSync(file, "utf8"));
    console.warn(
      `release-info: kept ${kept.tag} (${e instanceof Error ? e.message : e})`,
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
