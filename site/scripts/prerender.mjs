// Renders the page to HTML at build time (from the SSR bundle) and writes it into
// dist/index.html, so the first paint needs no script; the browser then hydrates it. Also
// preloads the Lexend font file the CSS points at, and drops the SSR bundle afterwards.

import { copyFileSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const site = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(site, 'dist');
const ssr = join(site, 'dist-ssr');

const { render } = await import(pathToFileURL(join(ssr, 'entry-server.js')).href);
const app = render();

const assets = readdirSync(join(dist, 'assets'));
const font = assets.find((f) => /^lexend-latin-wght-normal.*\.woff2$/.test(f));
const head = font ? `<link rel="preload" href="/daybloom/assets/${font}" as="font" type="font/woff2" crossorigin>` : '';

const file = join(dist, 'index.html');
const html = readFileSync(file, 'utf8').replace('<!--app-head-->', head).replace('<!--app-html-->', app);
if (html.includes('<!--app-html-->')) throw new Error('prerender: the app placeholder is still there');
writeFileSync(file, html);
// GitHub Pages shows 404.html for unknown paths: send those visitors to the same page.
copyFileSync(file, join(dist, '404.html'));
rmSync(ssr, { recursive: true, force: true });
console.log(`prerender: ${Math.round(app.length / 1024)} KB of HTML${font ? `, preloading ${font}` : ''}`);
