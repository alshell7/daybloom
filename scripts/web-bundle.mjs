// Web update bundles: the web layer of a release, which installed apps of the same runtime
// refresh to without an install (src-tauri/src/ota.rs).
//
//   node scripts/web-bundle.mjs pack <dist> <out-dir> --version 0.2.1 --runtime 1
//     → <out-dir>/web-0.2.1-r1.zip: daybloom-web.json (version, runtime, this version's notes
//       from RELEASE_NOTES.md, the SHA-256 of every file), then the files. Sign it with
//       `tauri signer sign --app-version 0.2.1 <zip>` (the updater key).
//   node scripts/web-bundle.mjs feed <old web-latest.json> --version 0.2.1 --runtime 1 --url <zip URL> --zip <zip>
//     → prints web-latest.json with this bundle as its runtime's entry; the signature is read
//       from <zip>.sig. The old feed may be missing (the first web update).
//
// Feed: { "bundles": [{ version, runtime, url, sig, files, bytes }] }, the newest bundle of each
// runtime, newest runtime first: older apps keep their own runtime's bundles.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateRawSync } from 'node:zlib';
import { FILE as NOTES, plain, section } from './release-notes.mjs';

export const MANIFEST = 'daybloom-web.json';

/** Every file under `dir`, as sorted forward-slash paths. */
export function listFiles(dir, prefix = '') {
  return readdirSync(join(dir, prefix), { withFileTypes: true })
    .flatMap((e) => {
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      return e.isDirectory() ? listFiles(dir, rel) : e.isFile() ? [rel] : [];
    })
    .sort();
}

/** The app's pages get the CSP of the built-in ones, so they may hold no inline script. */
export function inlineScript(html) {
  for (const [tag, attrs, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/\ssrc=/i.test(attrs) || body.trim()) return tag.slice(0, 80);
  }
  return null;
}

export function manifestOf(dist, version, runtime, notes) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Not a release version: ${version}`);
  if (!Number.isInteger(runtime) || runtime < 1) throw new Error(`Not a runtime: ${runtime}`);
  const names = listFiles(dist);
  if (!names.includes('index.html')) throw new Error(`${dist} has no index.html. Run npm run build first.`);
  if (names.includes(MANIFEST)) throw new Error(`${dist} already has a ${MANIFEST}.`);
  const files = {};
  for (const name of names) {
    const bytes = readFileSync(join(dist, name));
    if (name.endsWith('.html')) {
      const tag = inlineScript(bytes.toString('utf8'));
      if (tag) throw new Error(`${name}: inline script ${tag}`);
    }
    files[name] = createHash('sha256').update(bytes).digest('hex');
  }
  return { version, runtime, notes, files };
}

/**
 * A zip of `entries` ([name, bytes]): deflated where that is smaller, UTF-8 names, every date
 * 1980-01-01, so the same files always give the same bytes.
 */
export function zip(entries) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const deflated = deflateRawSync(data, { level: 9 });
    const method = deflated.length < data.length ? 8 : 0;
    const body = method ? deflated : data;
    const fields = (sig, central) => {
      const h = Buffer.alloc(central ? 46 : 30);
      let i = 0;
      const u16 = (v) => (i = h.writeUInt16LE(v, i));
      const u32 = (v) => (i = h.writeUInt32LE(v >>> 0, i));
      u32(sig);
      if (central) u16(20); // made by
      u16(20); // needed
      u16(0x0800); // UTF-8 names
      u16(method);
      u16(0); // time 00:00
      u16(0x21); // date 1980-01-01
      u32(crc32(data));
      u32(body.length);
      u32(data.length);
      u16(nameBuf.length);
      u16(0); // extra
      if (central) {
        u16(0); // comment
        u16(0); // disk
        u16(0); // internal attributes
        u32(0); // external attributes
        u32(offset);
      }
      return h;
    };
    const local = fields(0x04034b50, false);
    parts.push(local, nameBuf, body);
    central.push(fields(0x02014b50, true), nameBuf);
    offset += local.length + nameBuf.length + body.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}

/** `dist` as a bundle: the manifest first, then every file. */
export function pack(dist, version, runtime, notes) {
  const m = manifestOf(dist, version, runtime, notes);
  const entries = [[MANIFEST, Buffer.from(`${JSON.stringify(m, null, 2)}\n`)], ...Object.keys(m.files).map((n) => [n, readFileSync(join(dist, n))])];
  return { manifest: m, bytes: zip(entries) };
}

/** The feed with `entry` as its runtime's bundle. */
export function mergeFeed(old, entry) {
  const others = Array.isArray(old?.bundles) ? old.bundles.filter((b) => b && b.runtime !== entry.runtime) : [];
  return { bundles: [entry, ...others].sort((a, b) => b.runtime - a.runtime) };
}

function option(args, name) {
  const i = args.indexOf(`--${name}`);
  if (i < 0 || !args[i + 1]) throw new Error(`Missing --${name}`);
  return args[i + 1];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cmd, ...args] = process.argv.slice(2);
  const version = option(args, 'version');
  const runtime = Number(option(args, 'runtime'));
  if (cmd === 'pack') {
    const [dist, out] = args;
    const md = section(readFileSync(NOTES, 'utf8'), version);
    const { manifest, bytes } = pack(dist, version, runtime, md ? plain(md) : '');
    mkdirSync(out, { recursive: true });
    const file = join(out, `web-${version}-r${runtime}.zip`);
    writeFileSync(file, bytes);
    console.error(`${file}: ${Object.keys(manifest.files).length} files, ${bytes.length} bytes${md ? '' : ' (no release notes for this version)'}`);
  } else if (cmd === 'feed') {
    const old = args[0] && existsSync(args[0]) ? JSON.parse(readFileSync(args[0], 'utf8')) : null;
    const zipFile = option(args, 'zip');
    const bytes = readFileSync(zipFile);
    // Entries in the zip's end record (no zip comment), less the manifest.
    const files = bytes.readUInt16LE(bytes.length - 22 + 10) - 1;
    const entry = {
      version,
      runtime,
      url: option(args, 'url'),
      sig: readFileSync(`${zipFile}.sig`, 'utf8').trim(),
      files,
      bytes: bytes.length,
    };
    process.stdout.write(`${JSON.stringify(mergeFeed(old, entry), null, 2)}\n`);
  } else {
    console.error('Usage: node scripts/web-bundle.mjs pack <dist> <out-dir> --version x.y.z --runtime n');
    console.error('       node scripts/web-bundle.mjs feed <old web-latest.json> --version x.y.z --runtime n --url <zip URL> --zip <zip>');
    process.exit(1);
  }
}
