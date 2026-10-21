// Where the downloads live. The build bakes in the latest release (scripts/release-info.mjs);
// the page then asks GitHub once per visit whether a newer one exists, so the buttons stay
// right between site builds. File names carry the version, so they come from the release.

import { useEffect, useState } from 'react';
import baked from '@/data/release.json';

export const REPO = 'alshell7/daybloom';
export const REPO_URL = `https://github.com/${REPO}`;
export const RELEASES_URL = `${REPO_URL}/releases`;
export const LATEST_URL = `${REPO_URL}/releases/latest`;

export interface Asset {
  name: string;
  size: number;
  url: string;
}
export interface Release {
  tag: string;
  version: string;
  publishedAt: string;
  page: string;
  mac: Asset | null;
  win: Asset | null;
  msi: Asset | null;
}

export const BAKED = baked as Release;

const KEY = 'daybloom-release';
let live: Release | null = null;
let pending: Promise<Release | null> | null = null;

function pick(r: { tag_name: string; published_at: string; html_url: string; assets: { name: string; size: number }[] }): Release {
  const find = (re: RegExp) => r.assets.find((a) => re.test(a.name));
  const asset = (a?: { name: string; size: number }) => (a ? { name: a.name, size: a.size, url: `${LATEST_URL}/download/${a.name}` } : null);
  return {
    tag: r.tag_name,
    version: r.tag_name.replace(/^v/, ''),
    publishedAt: r.published_at,
    page: r.html_url,
    mac: asset(find(/_universal\.dmg$/i) ?? find(/\.dmg$/i)),
    win: asset(find(/x64-setup\.exe$/i) ?? find(/\.exe$/i)),
    msi: asset(find(/\.msi$/i)),
  };
}

async function fetchLatest(): Promise<Release | null> {
  try {
    const cached = sessionStorage.getItem(KEY);
    if (cached) return JSON.parse(cached) as Release;
  } catch {
    /* storage may be blocked */
  }
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) return null;
    const r = pick(await res.json());
    if (!r.mac || !r.win) return null;
    try {
      sessionStorage.setItem(KEY, JSON.stringify(r));
    } catch {
      /* fine */
    }
    return r;
  } catch {
    return null;
  }
}

/** The release to offer: the baked one at first paint, a newer one once GitHub says so. */
export function useRelease(): Release {
  const [r, setR] = useState<Release>(live ?? BAKED);
  useEffect(() => {
    if (live) return setR(live);
    pending ??= fetchLatest();
    let on = true;
    pending.then((x) => {
      if (x && x.tag !== BAKED.tag) live = x;
      if (on && live) setR(live);
    });
    return () => {
      on = false;
    };
  }, []);
  return r;
}

export const mb = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;

export function releaseDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}
