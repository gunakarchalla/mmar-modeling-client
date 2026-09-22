import { create } from "zustand";

// Reactive half of the tab bar: one entry per open SceneInstance. The engine's
// `globalObject.tabContext[]` holds the matching THREE scene and drag objects at the
// SAME index.
//
// SINGLE MUTATION PATH: the two must never drift, so tabs are opened, closed and
// selected through one place that updates both — `instance-utility`'s
// `createTabContextSceneInstance` and `views/layout/tabActions`. Nothing else should
// touch `globalObject.selectedTab` or splice `tabContext` directly.

export interface TabInfo {
  /** SceneInstance name shown on the tab. */
  name: string;
  /** SceneInstance uuid — stable key for React and for locating the tab. */
  uuid: string;
  /** True once at least two users hold access, which makes the scene collaborative. */
  isShared: boolean;
}

interface TabsState {
  tabs: TabInfo[];
  /** Index of the active tab, or -1 when no tab is open. */
  selectedTab: number;

  /** Append a tab and select it; returns its index. */
  openTab: (tab: TabInfo) => number;
  /** Close the tab at `index`, clamping the selection to a still-valid tab. */
  closeTab: (index: number) => void;
  /** Activate an existing tab by index. */
  selectTab: (index: number) => void;
  /** Rename the tab at `index` (its SceneInstance name shown on the tab). */
  renameTab: (index: number, name: string) => void;
  /** Mark a tab shared or unshared (set when a collaboration session attaches). */
  setTabShared: (index: number, isShared: boolean) => void;
  /**
   * Drop every tab at once (logout). The engine half of the teardown lives in
   * `services/session-reset`, which is the only caller — it empties
   * `globalObject.tabContext` in the same synchronous step, so the two stay in lockstep
   * exactly as the per-tab path does.
   */
  reset: () => void;
}

export const useTabsStore = create<TabsState>((set) => ({
  tabs: [],
  selectedTab: -1,

  openTab: (tab) => {
    let newIndex = -1;
    set((s) => {
      newIndex = s.tabs.length;
      return { tabs: [...s.tabs, tab], selectedTab: newIndex };
    });
    return newIndex;
  },

  closeTab: (index) =>
    set((s) => {
      if (index < 0 || index >= s.tabs.length) return s;
      const tabs = s.tabs.filter((_, i) => i !== index);
      // Selection rules on close: keep a valid
      // selection, clamp to the last tab, and drop to -1 when nothing is left.
      let selectedTab = s.selectedTab;
      if (tabs.length === 0) {
        selectedTab = -1;
      } else if (index < s.selectedTab) {
        selectedTab = s.selectedTab - 1;
      } else if (index === s.selectedTab) {
        selectedTab = Math.min(index, tabs.length - 1);
      }
      return { tabs, selectedTab };
    }),

  selectTab: (index) =>
    set((s) => {
      if (index < 0 || index >= s.tabs.length) return s;
      return { selectedTab: index };
    }),

  renameTab: (index, name) =>
    set((s) => {
      if (index < 0 || index >= s.tabs.length) return s;
      return { tabs: s.tabs.map((t, i) => (i === index ? { ...t, name } : t)) };
    }),

  setTabShared: (index, isShared) =>
    set((s) => ({
      tabs: s.tabs.map((t, i) => (i === index ? { ...t, isShared } : t)),
    })),

  reset: () => set({ tabs: [], selectedTab: -1 }),
}));
