import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// GitHub Pages serves the site from https://alshell7.github.io/daybloom/.
export default defineConfig({
  base: '/daybloom/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // The changelog reads ../RELEASE_NOTES.md, so the dev server may serve the repo root.
  server: { fs: { allow: ['..'] } },
  build: {
    target: 'es2022',
    reportCompressedSize: true,
  },
});
