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

const host = process.env.TAURI_DEV_HOST;

// https://v2.tauri.app/start/frontend/vite/
export default defineConfig({
  plugins: [ortWithoutWasm(), svelte()],
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
