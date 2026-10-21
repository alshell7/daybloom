// Turns the app's screenshots (docs/media/*.png) into responsive AVIF and WebP files in
// site/public/media, and writes src/data/media.json (sizes and widths) for <Picture>.
// Run it again after the screenshots change: `npm run media`. Needs ImageMagick 7
// (`magick`, with AVIF and WebP) and ffmpeg for the film. The output is committed, so the
// GitHub Pages build does not need these tools.

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const site = join(here, '..');
const src = join(site, '..', 'docs', 'media');
const brand = join(site, '..', 'assets', 'brand');
// The promo film, rendered by promo/ (`npm run render:60`; its out/ folder is not committed).
const film = join(site, '..', 'promo', 'out', 'daybloom-promo.mp4');
const out = join(site, 'public', 'media');
mkdirSync(out, { recursive: true });

// The screenshots the page shows (others in docs/media are skipped, to keep the site small).
const USED = ['hero-light', 'hero-dark', 'focus', 'screen-cues', 'desktop-widget', 'waqt'];

const run = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
const size = (file) => run('magick', ['identify', '-format', '%w %h', file]).split(' ').map(Number);

/** Widths to ship for a source of width `w`: big shots get three steps, small panels ship as they are. */
function widthsFor(w) {
  if (w >= 1600) return [800, 1200, 1600];
  if (w >= 1200) return [600, w];
  if (w >= 880) return [Math.round(w / 2), w];
  return [w];
}

const manifest = {};
for (const f of readdirSync(out)) if (/\.(avif|webp)$/.test(f) && !f.startsWith('film-poster')) rmSync(join(out, f));
for (const file of readdirSync(src).filter((f) => f.endsWith('.png') && USED.includes(basename(f, '.png'))).sort()) {
  const name = basename(file, '.png');
  const input = join(src, file);
  const [w, h] = size(input);
  const widths = widthsFor(w);
  for (const tw of widths) {
    const base = join(out, `${name}-${tw}`);
    const resize = tw === w ? [] : ['-resize', `${tw}x`];
    run('magick', [input, ...resize, '-strip', '-quality', '52', `${base}.avif`]);
    run('magick', [input, ...resize, '-strip', '-define', 'webp:method=6', '-quality', '80', `${base}.webp`]);
  }
  manifest[name] = { w, h, widths };
  const kb = widths.map((tw) => `${tw}: ${Math.round(statSync(join(out, `${name}-${tw}.avif`)).size / 1024)}k`).join(', ');
  console.log(`${name} ${w}×${h} → ${kb}`);
}

// The promo film, made smaller for the web (H.264 at 60 fps, its music at 128 kbps, the index
// first so it starts while it loads), and its poster: the dial beside "Time you can see.".
if (existsSync(film)) {
  run('ffmpeg', ['-y', '-loglevel', 'error', '-i', film, '-c:v', 'libx264', '-preset', 'slow', '-crf', '25', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', join(out, 'film.mp4')]);
  run('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '10.4', '-i', film, '-frames:v', '1', '-vf', 'scale=1440:-2', join(out, 'film-poster.png')]);
  run('magick', [join(out, 'film-poster.png'), '-strip', '-quality', '80', join(out, 'film-poster.webp')]);
  rmSync(join(out, 'film-poster.png'));
  console.log(`film → ${Math.round(statSync(join(out, 'film.mp4')).size / 1024 / 1024)} MB`);
} else console.log('no promo/out/daybloom-promo.mp4: the film in public/media is kept as it is');

// Icons: the SVG app icon, a PNG fallback and the Apple touch icon.
const pub = join(site, 'public');
copyFileSync(join(brand, 'icon.svg'), join(pub, 'favicon.svg'));
run('magick', [join(brand, 'icon-1024.png'), '-resize', '180x180', '-strip', join(pub, 'apple-touch-icon.png')]);
run('magick', [join(brand, 'icon-1024.png'), '-resize', '64x64', '-strip', join(pub, 'favicon-64.png')]);

// The link preview: the light planner on the fog desk, 1200 × 630.
run('magick', [
  '-size', '1200x630', 'xc:#eceff3',
  '(', join(src, 'hero-light.png'), '-resize', '1240x', ')',
  '-gravity', 'north', '-geometry', '+0-40', '-composite',
  '-strip', '-quality', '84', join(pub, 'og.jpg'),
]);

const dataDir = join(site, 'src', 'data');
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
writeFileSync(join(dataDir, 'media.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`wrote ${Object.keys(manifest).length} images and src/data/media.json`);
