/// <reference types="svelte" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_GOOGLE_CLIENT_SECRET?: string;
  /** src-tauri/runtime.json → RUNTIME (vite.config.ts). */
  readonly VITE_RUNTIME: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
