import { create } from "zustand";

// Reactive half of the tab bar: one entry per open SceneInstance. The engine's
// `globalObject.tabContext[]` holds the matching THREE scene and drag objects at the
// SAME index.
//
// SINGLE MUTATION PATH: the two must never drift, so tabs are opened, closed and
// selected through one place that updates both — `instance-utility`'s
// `createTabContextSceneInstance` and `views/layout/tabActions`. Nothing else should
// touch `globalObject.selectedTab` or splice `tabContext` directly.
//
// TWO ORDERS. `tabs` (and every tab index in the app: `selectedTab`, `tabContext`, the
// collaboration sessions keyed by tab index) is in OPEN order and never reorders.
// `displayOrder` is the order the tab bar SHOWS, which the user changes by dragging.
// It is presentation only: nothing outside the tab bar reads it, which is what lets
// tabs be reordered without re-keying the engine or the shared sessions.

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
  /**
   * Tab uuids in the order the tab bar shows them. Read it through
   * `orderedTabIndices`, which tolerates entries that are stale or missing.
   */
  displayOrder: string[];

  /** Append a tab (at the end of the tab bar too) and select it; returns its index. */
  openTab: (tab: TabInfo) => number;
  /**
   * Close the tab at `index`. Closing the active tab activates the tab that slides into
   * its place on the tab bar (its right-hand neighbour, or the new last tab).
   */
  closeTab: (index: number) => void;
  /** Activate an existing tab by index. */
  selectTab: (index: number) => void;
  /** Move the tab with `uuid` to `position` on the tab bar. Indices are unaffected. */
  moveTab: (uuid: string, position: number) => void;
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

/**
 * Tab indices in tab-bar order. Uuids in `displayOrder` with no open tab are skipped,
 * and open tabs it does not list go at the end in open order, so a `setState` that
 * replaces `tabs` alone (as several tests do) still renders every tab exactly once.
 */
export function orderedTabIndices(tabs: TabInfo[], displayOrder: string[]): number[] {
  const indexByUuid = new Map(tabs.map((tab, index) => [tab.uuid, index]));
  const placed = new Set<number>();
  const result: number[] = [];
  for (const uuid of displayOrder) {
    const index = indexByUuid.get(uuid);
    if (index === undefined || placed.has(index)) continue;
    placed.add(index);
    result.push(index);
  }
  tabs.forEach((_, index) => {
    if (!placed.has(index)) result.push(index);
  });
  return result;
}

function orderedUuids(tabs: TabInfo[], displayOrder: string[]): string[] {
  return orderedTabIndices(tabs, displayOrder).map((index) => tabs[index].uuid);
}

export const useTabsStore = create<TabsState>((set) => ({
  tabs: [],
  selectedTab: -1,
  displayOrder: [],

  openTab: (tab) => {
    let newIndex = -1;
    set((s) => {
      newIndex = s.tabs.length;
      return {
        tabs: [...s.tabs, tab],
        selectedTab: newIndex,
        displayOrder: [...orderedUuids(s.tabs, s.displayOrder), tab.uuid],
      };
    });
    return newIndex;
  },

  closeTab: (index) =>
    set((s) => {
      if (index < 0 || index >= s.tabs.length) return s;
      const closedUuid = s.tabs[index].uuid;
      const previousOrder = orderedUuids(s.tabs, s.displayOrder);
      const displayOrder = previousOrder.filter((uuid) => uuid !== closedUuid);
      const tabs = s.tabs.filter((_, i) => i !== index);
      // Selection rules on close: keep a valid selection, and drop to -1 when nothing is
      // left. Closing the active tab hands the selection to whichever tab now sits in
      // its slot on the tab bar, as a browser does. In open order that is the old
      // `Math.min(index, tabs.length - 1)` rule, so an unreordered bar behaves as before.
      let selectedTab = s.selectedTab;
      if (tabs.length === 0) {
        selectedTab = -1;
      } else if (index === s.selectedTab) {
        const slot = Math.min(previousOrder.indexOf(closedUuid), displayOrder.length - 1);
        selectedTab = tabs.findIndex((tab) => tab.uuid === displayOrder[slot]);
      } else if (index < s.selectedTab) {
        selectedTab = s.selectedTab - 1;
      }
      return { tabs, selectedTab, displayOrder };
    }),

  selectTab: (index) =>
    set((s) => {
      if (index < 0 || index >= s.tabs.length) return s;
      return { selectedTab: index };
    }),

  moveTab: (uuid, position) =>
    set((s) => {
      const displayOrder = orderedUuids(s.tabs, s.displayOrder);
      const from = displayOrder.indexOf(uuid);
      if (from === -1) return s;
      const to = Math.max(0, Math.min(position, displayOrder.length - 1));
      if (from === to) return s;
      displayOrder.splice(from, 1);
      displayOrder.splice(to, 0, uuid);
      return { displayOrder };
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

  reset: () => set({ tabs: [], selectedTab: -1, displayOrder: [] }),
}));
