// The undo/redo stacks. Pure state, so no engine mocks: this covers the stack rules
// (baseline floor, redo-branch discard, coalescing, the entry cap) and the selectors the
// toolbar subscribes to.
import { describe, it, expect, beforeEach } from "vitest";
import {
  COALESCE_WINDOW_MS,
  MAX_HISTORY_ENTRIES,
  selectCanRedo,
  selectCanUndo,
  selectRedoLabel,
  selectUndoLabel,
  useHistoryStore,
} from "./historyStore";

const SCENE = "scene-1";
const state = () => useHistoryStore.getState();
const history = () => state().histories[SCENE];

beforeEach(() => {
  useHistoryStore.getState().reset();
  useHistoryStore.getState().init(SCENE, "v0");
  useHistoryStore.getState().setActiveScene(SCENE);
});

describe("historyStore stacks", () => {
  it("starts at a single baseline entry with nothing to undo", () => {
    expect(history().entries).toHaveLength(1);
    expect(history().index).toBe(0);
    expect(selectCanUndo(state())).toBe(false);
    expect(selectCanRedo(state())).toBe(false);
  });

  it("appends a step and moves the pointer onto it", () => {
    state().push(SCENE, { scene: "v1", label: "create A", touched: ["a"] });

    expect(history().entries).toHaveLength(2);
    expect(history().index).toBe(1);
    expect(selectCanUndo(state())).toBe(true);
    expect(selectUndoLabel(state())).toBe("create A");
  });

  it("ignores a push for a scene with no baseline", () => {
    state().push("never-opened", { scene: "v1", label: "x", touched: null });
    expect(state().histories["never-opened"]).toBeUndefined();
  });

  it("exposes redo once the pointer has moved back", () => {
    state().push(SCENE, { scene: "v1", label: "create A", touched: ["a"] });
    state().setIndex(SCENE, 0);

    expect(selectCanUndo(state())).toBe(false);
    expect(selectCanRedo(state())).toBe(true);
    expect(selectRedoLabel(state())).toBe("create A");
  });

  it("drops the redo branch when a new step is recorded after an undo", () => {
    state().push(SCENE, { scene: "v1", label: "one", touched: ["a"] });
    state().push(SCENE, { scene: "v2", label: "two", touched: ["b"] });
    state().setIndex(SCENE, 1);

    state().push(SCENE, { scene: "v3", label: "three", touched: ["c"] });

    expect(history().entries.map((entry) => entry.label)).toEqual(["", "one", "three"]);
    expect(selectCanRedo(state())).toBe(false);
  });

  it("refuses an out-of-range index", () => {
    state().setIndex(SCENE, 5);
    expect(history().index).toBe(0);
  });
});

describe("historyStore coalescing", () => {
  it("merges same-key steps inside the window into one, unioning what they touched", () => {
    state().push(SCENE, { scene: "v1", label: "edit", touched: ["a"], coalesceKey: "attr:1", now: 1000 });
    state().push(SCENE, { scene: "v2", label: "edit", touched: ["b"], coalesceKey: "attr:1", now: 1100 });

    expect(history().entries).toHaveLength(2);
    expect(history().entries[1].scene).toBe("v2");
    expect(history().entries[1].touched).toEqual(["a", "b"]);
  });

  it("starts a new step once the window has passed", () => {
    state().push(SCENE, { scene: "v1", label: "edit", touched: ["a"], coalesceKey: "attr:1", now: 1000 });
    state().push(SCENE, {
      scene: "v2",
      label: "edit",
      touched: ["a"],
      coalesceKey: "attr:1",
      now: 1000 + COALESCE_WINDOW_MS + 1,
    });

    expect(history().entries).toHaveLength(3);
  });

  it("starts a new step for a different key", () => {
    state().push(SCENE, { scene: "v1", label: "edit", touched: ["a"], coalesceKey: "attr:1", now: 1000 });
    state().push(SCENE, { scene: "v2", label: "edit", touched: ["b"], coalesceKey: "attr:2", now: 1050 });

    expect(history().entries).toHaveLength(3);
  });

  // Undo has to be able to land back on the as-opened scene, so the very first step
  // never merges into the baseline.
  it("never merges onto the baseline", () => {
    state().push(SCENE, { scene: "v1", label: "edit", touched: ["a"], coalesceKey: "attr:1", now: 1000 });
    expect(history().entries).toHaveLength(2);
    expect(history().entries[0].scene).toBe("v0");
  });

  it("keeps an unknown touched set unknown when merging", () => {
    state().push(SCENE, { scene: "v1", label: "bulk", touched: null, coalesceKey: "k", now: 1000 });
    state().push(SCENE, { scene: "v2", label: "bulk", touched: ["a"], coalesceKey: "k", now: 1050 });

    expect(history().entries[1].touched).toBeNull();
  });
});

describe("historyStore limits and lifecycle", () => {
  it("caps the stack and slides the pointer with it", () => {
    for (let step = 0; step < MAX_HISTORY_ENTRIES + 10; step++) {
      state().push(SCENE, { scene: `v${step}`, label: `step ${step}`, touched: [`${step}`] });
    }

    expect(history().entries).toHaveLength(MAX_HISTORY_ENTRIES);
    expect(history().index).toBe(MAX_HISTORY_ENTRIES - 1);
    expect(history().entries[MAX_HISTORY_ENTRIES - 1].scene).toBe(`v${MAX_HISTORY_ENTRIES + 9}`);
  });

  it("keeps one stack per scene and switches which one the selectors read", () => {
    state().init("scene-2", "other-v0");
    state().push(SCENE, { scene: "v1", label: "in scene 1", touched: ["a"] });

    expect(selectCanUndo(state())).toBe(true);
    state().setActiveScene("scene-2");
    expect(selectCanUndo(state())).toBe(false);
  });

  it("forgets a closed scene and clears the selection when it was the active one", () => {
    state().push(SCENE, { scene: "v1", label: "one", touched: ["a"] });
    state().drop(SCENE);

    expect(state().histories[SCENE]).toBeUndefined();
    expect(state().activeSceneUuid).toBeNull();
    expect(selectCanUndo(state())).toBe(false);
  });

  it("re-initialising a scene throws its stack away", () => {
    state().push(SCENE, { scene: "v1", label: "one", touched: ["a"] });
    state().init(SCENE, "fresh");

    expect(history().entries).toHaveLength(1);
    expect(history().entries[0].scene).toBe("fresh");
  });

  it("leaves the active scene alone when a background scene is re-initialised", () => {
    state().init("scene-2", "other-v0");
    expect(state().activeSceneUuid).toBe(SCENE);
  });
});
