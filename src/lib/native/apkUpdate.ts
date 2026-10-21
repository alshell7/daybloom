// Full updates for the Android app: the release workflow publishes the signed APK and
// android-latest.json (version, download, SHA-256, notes) on GitHub Releases. The phone reads
// it, offers it in the same update card as a computer, and on "Install" Android downloads it,
// checks the SHA-256 and opens its installer (ApkUpdate in Extras.kt). Pure, for tests.

export const ANDROID_FEED = 'https://github.com/alshell7/daybloom/releases/latest/download/android-latest.json';

export interface ApkRelease {
  version: string;
  url: string;
  sha256: string;
  notes: string;
}

/** a > b, for plain x.y.z versions (a pre-release tag counts as older than its release). */
export function newer(a: string, b: string): boolean {
  const parse = (v: string) => {
    const [core, pre] = v.trim().replace(/^v/, '').split('-', 2);
    return { n: core.split('.').map((x) => Number.parseInt(x, 10) || 0), pre: pre ?? '' };
  };
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < 3; i++) if ((x.n[i] ?? 0) !== (y.n[i] ?? 0)) return (x.n[i] ?? 0) > (y.n[i] ?? 0);
  if (x.pre === y.pre) return false;
  return !x.pre || (!!y.pre && x.pre > y.pre);
}

export function parseFeed(raw: unknown): ApkRelease | null {
  const r = raw as Partial<ApkRelease> | null;
  if (!r || typeof r.version !== 'string' || typeof r.url !== 'string' || typeof r.sha256 !== 'string') return null;
  if (!/^https:\/\//.test(r.url) || !/^[0-9a-f]{64}$/i.test(r.sha256)) return null;
  return { version: r.version, url: r.url, sha256: r.sha256.toLowerCase(), notes: typeof r.notes === 'string' ? r.notes : '' };
}

/** The newer release, if the feed has one. */
export async function checkApk(current: string, fetchFn: (url: string, init?: RequestInit) => Promise<Response>): Promise<ApkRelease | null> {
  const res = await fetchFn(ANDROID_FEED, { cache: 'no-store' });
  if (!res.ok) throw new Error(`The update feed answered ${res.status}.`);
  const r = parseFeed(await res.json());
  return r && newer(r.version, current) ? r : null;
}
