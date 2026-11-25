import { create } from "zustand";

/**
 * historyStore — the reactive undo/redo stacks, one per OPEN SceneInstance.
 *
 * Per-scene undo and redo stacks: a list of
 * snapshots oldest -> newest with an index pointing at what the tab currently shows,
 * capped entries, and a coalescing window so a run of small edits to the same thing
 * becomes ONE undo step. Two properties follow from this
 * client's shape:
 *
 *  - Snapshots are stored as SERIALIZED JSON, not object graphs. A SceneInstance holds
 *    every class/relation/port/attribute instance of a model, so keeping 50 live deep
 *    clones per open scene would be a lot of retained memory; strings are compact and
 *    only the two entries an undo actually compares are ever parsed.
 *  - Each entry records the UUIDs its action TOUCHED. `history-service` replays only
 *    those, which is what keeps a collaborator's concurrent edits out of an undo.
 *
 * The store is deliberately pure state — no engine, no persistence, no three.js — so it
 * unit-tests on its own. `history-service.ts` owns everything with a side effect.
 */

/** How many steps one scene keeps. Snapshots are whole scenes: a memory ceiling. */
export const MAX_HISTORY_ENTRIES = 50;

/** Actions sharing a coalesce key within this window collapse into one undo step. */
export const COALESCE_WINDOW_MS = 600;

export interface HistoryEntry {
  /** `JSON.stringify` of the SceneInstance as of this point. */
  scene: string;
  /** What produced this entry, shown in the button tooltip. Empty for the baseline. */
  label: string;
  /**
   * UUIDs the producing action changed, or null when the site could not name them
   * (bulk import, algorithm run) and the whole scene has to be diffed instead.
   */
  touched: string[] | null;
  /** Coalescing identity of the producing action (e.g. an attribute uuid). */
  coalesceKey: string | null;
  /** When the producing action last wrote this entry. */
  coalesceAt: number;
}

export interface SceneHistory {
  entries: HistoryEntry[];
  /** Index of the entry the live scene currently matches. */
  index: number;
}

export interface NewEntry {
  scene: string;
  label: string;
  touched: string[] | null;
  coalesceKey?: string | null;
  /** Injectable clock so tests do not have to wait out the coalescing window. */
  now?: number;
}

export interface HistoryState {
  /** Keyed by SceneInstance uuid — undo is scoped to the scene you are looking at. */
  histories: Record<string, SceneHistory>;
  /** SceneInstance uuid of the active tab; what the toolbar buttons refer to. */
  activeSceneUuid: string | null;

  /** Start (or restart) a scene's history with the as-opened state as its floor. */
  init: (sceneUuid: string, scene: string) => void;
  /** Record a step. Coalesces onto the newest entry when the key and window match. */
  push: (sceneUuid: string, entry: NewEntry) => void;
  /** Move a scene's pointer after an undo/redo has been applied. */
  setIndex: (sceneUuid: string, index: number) => void;
  /** Forget a scene's history (its tab was closed). */
  drop: (sceneUuid: string) => void;
  /** Point the undo/redo controls at another scene (a tab was selected). */
  setActiveScene: (sceneUuid: string | null) => void;
  /** Clear everything (logout / full refresh). */
  reset: () => void;
}

const emptyHistory = (scene: string): SceneHistory => ({
  entries: [{ scene, label: "", touched: null, coalesceKey: null, coalesceAt: 0 }],
  index: 0,
});

/**
 * Append `entry`, or merge it into the newest one. Merging requires: a coalesce key,
 * being at the tip (never rewrite an entry you have already undone past), the same key
 * as the tip, and the tip being young enough. The baseline at index 0 is never merged
 * onto — undo has to be able to land back on the as-opened scene.
 */
function pushEntry(history: SceneHistory, entry: NewEntry): SceneHistory {
  const now = entry.now ?? Date.now();
  const coalesceKey = entry.coalesceKey ?? null;
  const tip = history.entries[history.index];
  const atTip = history.index === history.entries.length - 1;

  if (
    coalesceKey &&
    atTip &&
    history.index > 0 &&
    tip?.coalesceKey === coalesceKey &&
    now - tip.coalesceAt < COALESCE_WINDOW_MS
  ) {
    const entries = [...history.entries];
    entries[history.index] = {
      scene: entry.scene,
      label: entry.label,
      // The merged step now stands for both actions, so it has to replay both.
      touched: mergeTouched(tip.touched, entry.touched),
      coalesceKey,
      coalesceAt: now,
    };
    return { ...history, entries };
  }

  // Recording after an undo discards the redo branch — the classic history fork.
  const entries = [
    ...history.entries.slice(0, history.index + 1),
    { scene: entry.scene, label: entry.label, touched: entry.touched, coalesceKey, coalesceAt: now },
  ];
  let index = entries.length - 1;
  if (entries.length > MAX_HISTORY_ENTRIES) {
    const overflow = entries.length - MAX_HISTORY_ENTRIES;
    entries.splice(0, overflow);
    index -= overflow;
  }
  return { entries, index };
}

/** null means "unknown, diff everything" and therefore wins over any uuid list. */
function mergeTouched(a: string[] | null, b: string[] | null): string[] | null {
  if (a === null || b === null) return null;
  return [...new Set([...a, ...b])];
}

export const useHistoryStore = create<HistoryState>((set) => ({
  histories: {},
  activeSceneUuid: null,

  init: (sceneUuid, scene) =>
    set((s) => ({ histories: { ...s.histories, [sceneUuid]: emptyHistory(scene) } })),

  push: (sceneUuid, entry) =>
    set((s) => {
      const history = s.histories[sceneUuid];
      // No baseline means the scene was never opened through the history-aware path;
      // recording into thin air would make the first undo restore a state we never saw.
      if (!history) return s;
      return { histories: { ...s.histories, [sceneUuid]: pushEntry(history, entry) } };
    }),

  setIndex: (sceneUuid, index) =>
    set((s) => {
      const history = s.histories[sceneUuid];
      if (!history || index < 0 || index >= history.entries.length) return s;
      return { histories: { ...s.histories, [sceneUuid]: { ...history, index } } };
    }),

  drop: (sceneUuid) =>
    set((s) => {
      if (!(sceneUuid in s.histories)) return s;
      const histories = { ...s.histories };
      delete histories[sceneUuid];
      return {
        histories,
        activeSceneUuid: s.activeSceneUuid === sceneUuid ? null : s.activeSceneUuid,
      };
    }),

  setActiveScene: (sceneUuid) => set({ activeSceneUuid: sceneUuid }),

  reset: () => set({ histories: {}, activeSceneUuid: null }),
}));

/** The active scene's history, or undefined when no scene is open. */
const activeHistory = (s: HistoryState): SceneHistory | undefined =>
  s.activeSceneUuid ? s.histories[s.activeSceneUuid] : undefined;

/**
 * Selectors for the toolbar. They return booleans/strings, so a subscribed component
 * re-renders only when availability (or the tooltip) actually changes — not on every
 * recorded step.
 */
export const selectCanUndo = (s: HistoryState) => {
  const history = activeHistory(s);
  return !!history && history.index > 0;
};

export const selectCanRedo = (s: HistoryState) => {
  const history = activeHistory(s);
  return !!history && history.index < history.entries.length - 1;
};

/** Label of the step an undo would revert, or "" when there is none. */
export const selectUndoLabel = (s: HistoryState) => {
  const history = activeHistory(s);
  if (!history || history.index <= 0) return "";
  return history.entries[history.index].label;
};

/** Label of the step a redo would re-apply, or "" when there is none. */
export const selectRedoLabel = (s: HistoryState) => {
  const history = activeHistory(s);
  if (!history || history.index >= history.entries.length - 1) return "";
  return history.entries[history.index + 1].label;
};
