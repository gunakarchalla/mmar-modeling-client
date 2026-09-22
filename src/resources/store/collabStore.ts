import { create } from "zustand";

/**
 * The reactive mirror of each tab's shared session: connection status, the local user's
 * access level, the disconnect banner and the list of connected users.
 *
 * The flow is one-way, service to store: `shared-doc-service` owns the sessions and
 * writes here whenever one attaches or detaches or its status, access or user list
 * changes. React components only read it.
 */

export type ConnectionStatus = "connecting" | "connected" | "disconnected";
export type AccessLevel = "read" | "edit" | "delete";

/** One participant of a shared session, as shown in the user legend. */
export interface CollabUser {
  clientId: number;
  uuid: string;
  username: string;
  color: string;
  initials: string;
  isLocal: boolean;
}

export interface TabCollabState {
  status: ConnectionStatus;
  access: AccessLevel;
  /** Human-readable banner shown while disconnected. Null when connected. */
  banner: string | null;
  users: CollabUser[];
}

interface CollabState {
  /** Keyed by tab index — a tab with no entry is not shared. */
  tabs: Record<number, TabCollabState>;

  /** Create/replace the entry for a tab (shared-doc-service.attach). */
  setTab: (tabIndex: number, state: TabCollabState) => void;
  /** Patch part of a tab's entry (status / access / banner changes). No-op if absent. */
  patchTab: (tabIndex: number, patch: Partial<TabCollabState>) => void;
  /** Drop a tab's entry (shared-doc-service.detach). */
  removeTab: (tabIndex: number) => void;
  /** Replace a tab's awareness-derived user list. No-op when the tab is not shared. */
  setUsers: (tabIndex: number, users: CollabUser[]) => void;
  /** Drop every tab's entry (logout — see `services/session-reset`). */
  reset: () => void;
}

export const useCollabStore = create<CollabState>((set) => ({
  tabs: {},

  setTab: (tabIndex, state) => set((s) => ({ tabs: { ...s.tabs, [tabIndex]: state } })),

  patchTab: (tabIndex, patch) =>
    set((s) => {
      const current = s.tabs[tabIndex];
      if (!current) return s;
      return { tabs: { ...s.tabs, [tabIndex]: { ...current, ...patch } } };
    }),

  removeTab: (tabIndex) =>
    set((s) => {
      if (!(tabIndex in s.tabs)) return s;
      const next = { ...s.tabs };
      delete next[tabIndex];
      return { tabs: next };
    }),

  setUsers: (tabIndex, users) =>
    set((s) => {
      const current = s.tabs[tabIndex];
      if (!current) return s;
      return { tabs: { ...s.tabs, [tabIndex]: { ...current, users } } };
    }),

  reset: () => set({ tabs: {} }),
}));
