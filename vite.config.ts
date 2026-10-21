import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

/**
 * ONNX Runtime Web points at its .wasm with `new URL("…", import.meta.url)`, which would copy
 * 14 MB into the app. Alef's voice hands the runtime the (downloaded, verified) bytes instead,
 * so that URL is never fetched: keep the asset out of the bundle.
 */
function ortWithoutWasm(): Plugin {
  return {
    name: 'ort-without-wasm',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('onnxruntime-web')) return null;
      const out = code.replace(/new URL\((["'])(ort-wasm[^"']*\.wasm)\1,\s*import\.meta\.url\)/g, 'new URL("$2", "https://ort.invalid/")');
      return out === code ? null : { code: out, map: null };
    },
  };
}

/**
 * Web updates (src-tauri/src/ota.rs) serve this build's pages with the CSP hashes of the app's
 * built-in pages, so a page may have no inline script: each one must load from a file.
 */
function noInlineScripts(): Plugin {
  return {
    name: 'no-inline-scripts',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        for (const [tag, attrs, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
          if (!/\ssrc=/i.test(attrs) || body.trim()) throw new Error(`${ctx.path}: inline <script> (web updates allow only <script src>): ${tag.slice(0, 80)}`);
        }
      },
    },
  };
}

/** The native API level the app is built for (src-tauri/runtime.json): `import.meta.env.VITE_RUNTIME`. */
const runtime: number = JSON.parse(readFileSync(new URL('./src-tauri/runtime.json', import.meta.url), 'utf8')).RUNTIME;

const host = process.env.TAURI_DEV_HOST;

// https://v2.tauri.app/start/frontend/vite/
export default defineConfig({
  plugins: [ortWithoutWasm(), svelte(), noInlineScripts()],
  define: { 'import.meta.env.VITE_RUNTIME': JSON.stringify(String(runtime)) },
  worker: { format: 'es', plugins: () => [ortWithoutWasm()] },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: {
    target: ['es2022', 'safari16'],
    minify: !process.env.TAURI_ENV_DEBUG,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
