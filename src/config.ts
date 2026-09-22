// Central runtime configuration. All services must import from here
// (never read process.env / import.meta.env directly elsewhere).

// REST API (mmar-server).
export const API_URL: string =
  import.meta.env.VITE_API_URL ?? "http://localhost:8000";

// WebSocket sync server (mmar-sync-server) for real-time collaboration (yjs).
export const SYNC_URL: string =
  import.meta.env.VITE_SYNC_URL ?? "ws://localhost:8060";

// Optional dev-only sign-in autofill: when set, the sign-in dialog seeds its fields
// from these so a developer can skip typing the credentials. Unset in production.
export const DEV_USERNAME: string | undefined = import.meta.env.VITE_USERNAME;
export const DEV_PASSWORD: string | undefined = import.meta.env.VITE_PASSWORD;
