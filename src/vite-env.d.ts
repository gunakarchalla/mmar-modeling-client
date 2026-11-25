/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_SYNC_URL: string;
  // Optional dev-only sign-in autofill (see config.ts).
  readonly VITE_USERNAME?: string;
  readonly VITE_PASSWORD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
