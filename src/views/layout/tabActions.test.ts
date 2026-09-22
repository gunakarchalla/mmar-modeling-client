// tabActions: the tab select/close "single mutation path" must keep tabsStore and
// globalObject.tabContext/selectedTab in lockstep, and closing must follow the
// store's selection-clamp rules (the old main-body-tab-bar index shuffle, improved
// to preserve the current selection where possible).
//
// `@/engine` is mocked (the real barrel builds a WebGLRenderer at module scope).
// engine.isInitialized is false here so applyEngineTabSelection short-circuits its
// scene work after syncing selectedTab — exactly the store/selection wiring we test.
import { describe, it, expect, beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  globalObject: {
    selectedTab: -1,
    tabContext: [] as unknown[],
    scene: {},
    dragObjects: [] as unknown[],
    mousePointer3d: {},
    plane: {},
    // renameTab reads autoSave (persist gate) and sceneTree (the SceneGroup node to sync).
    autoSave: true,
    sceneTree: [] as unknown[],
  },
  engine: { isInitialized: false },
  globalSelectedObject: { removeObject: vi.fn() },
  globalClassObject: { initClasses: vi.fn() },
  globalRelationclassObject: { initRelationClasses: vi.fn() },
  sceneInitiator: { initTransformControls: vi.fn() },
  eventBus: { publish: vi.fn() },
  logger: { log: vi.fn() },
  // P10: closeTab now detaches the tab's shared session. Mocking the service also
  // keeps the real @/engine/global-definition (which it imports directly, bypassing
  // the mocked barrel) from constructing a WebGLRenderer under vitest.
  sharedDocService: { detach: vi.fn(), forTab: vi.fn(() => null) },
  // P11: closeTab also drops the tab's remote cursor/selection helpers. Mocked for the
  // same reason as the service above — the renderers import @/engine/global-definition
  // directly (bypassing the mocked barrel), which builds a WebGLRenderer at module scope.
  remoteCursorRenderer: { clearForTab: vi.fn() },
  remoteSelectionRenderer: { clearForTab: vi.fn() },
  // renameTab persists via a PATCH when autoSave is on.
  backendService: { sceneInstancesPATCH: vi.fn() },
  // The undo/redo history service imports the @/engine/global-definition LEAF (a
  // WebGLRenderer at module scope), so it bypasses the `@/engine` barrel mock and has
  // to be mocked in its own right — same lesson as persistency-handler (P9),
  // shared-doc-service (P10) and hybrid-algorithms-service (P12).
  historyService: {
    record: vi.fn(),
    recordAfterTransformSync: vi.fn(async () => undefined),
    initScene: vi.fn(),
    setActiveScene: vi.fn(),
    dropScene: vi.fn(),
    undo: vi.fn(async () => undefined),
    redo: vi.fn(async () => undefined),
    reset: vi.fn(),
  },
}));
vi.mock("@/resources/services/history-service", () => ({ historyService: mocks.historyService }));

vi.mock("@/engine", () => ({
  engine: mocks.engine,
  globalObject: mocks.globalObject,
  globalSelectedObject: mocks.globalSelectedObject,
  globalClassObject: mocks.globalClassObject,
  globalRelationclassObject: mocks.globalRelationclassObject,
  sceneInitiator: mocks.sceneInitiator,
}));
vi.mock("@/resources/services/event-bus", () => ({ eventBus: mocks.eventBus }));
vi.mock("@/resources/services/logger", () => ({ logger: mocks.logger }));
vi.mock("@/resources/services/backend-service", () => ({ backendService: mocks.backendService }));
vi.mock("@/resources/collaboration/shared-doc-service", () => ({ sharedDocService: mocks.sharedDocService }));
vi.mock("@/resources/collaboration/remote-cursor-renderer", () => ({ remoteCursorRenderer: mocks.remoteCursorRenderer }));
vi.mock("@/resources/collaboration/remote-selection-renderer", () => ({
  remoteSelectionRenderer: mocks.remoteSelectionRenderer,
}));

import { switchToTab, closeTab, renameTab, renameSceneInstance } from "./tabActions";
import { useTabsStore } from "@/resources/store/tabsStore";

function seedTabs(names: string[]) {
  const store = useTabsStore.getState();
  useTabsStore.setState({ tabs: [], selectedTab: -1 });
  names.forEach((name) =>
    store.openTab({ name, uuid: `uuid-${name}`, isShared: false }),
  );
  // Mirror the engine tabContext with parallel fake entries.
  mocks.globalObject.tabContext = names.map((name) => ({
    sceneInstance: { name },
    threeScene: {},
    contextDragObjects: [],
  }));
  mocks.globalObject.selectedTab = names.length - 1;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.engine.isInitialized = false;
  mocks.globalObject.autoSave = true;
  mocks.globalObject.sceneTree = [];
});

describe("switchToTab", () => {
  it("selects the tab in both the store and the engine", async () => {
    seedTabs(["A", "B", "C"]); // selected C (index 2)
    await switchToTab(0);
    expect(useTabsStore.getState().selectedTab).toBe(0);
    expect(mocks.globalObject.selectedTab).toBe(0);
    expect(mocks.eventBus.publish).toHaveBeenCalledWith("tabChanged");
    expect(mocks.globalSelectedObject.removeObject).toHaveBeenCalled();
  });
});

describe("closeTab", () => {
  it("removes the tab from both the store and the engine tabContext", async () => {
    seedTabs(["A", "B", "C"]);
    await closeTab(1);
    expect(useTabsStore.getState().tabs.map((t) => t.name)).toEqual(["A", "C"]);
    expect(mocks.globalObject.tabContext).toHaveLength(2);
  });

  it("keeps the selection clamped when closing a lower-indexed tab", async () => {
    seedTabs(["A", "B", "C"]); // selected index 2 (C)
    await closeTab(0); // removing A shifts C to index 1
    const store = useTabsStore.getState();
    expect(store.tabs.map((t) => t.name)).toEqual(["B", "C"]);
    expect(store.selectedTab).toBe(1); // still C
    expect(mocks.globalObject.selectedTab).toBe(1); // engine kept in sync
  });

  it("resets to no selection when the last tab is closed", async () => {
    seedTabs(["A"]);
    await closeTab(0);
    expect(useTabsStore.getState().selectedTab).toBe(-1);
    expect(mocks.globalObject.selectedTab).toBe(-1);
    expect(mocks.globalObject.tabContext).toHaveLength(0);
    // The engine scene is replaced with a fresh empty one on the last close.
    expect(mocks.globalObject.dragObjects).toEqual([]);
  });

  it("selects the previous tab when closing the active last tab", async () => {
    seedTabs(["A", "B", "C"]); // selected index 2 (C)
    await closeTab(2); // closing the active tab clamps to the new last index
    const store = useTabsStore.getState();
    expect(store.tabs.map((t) => t.name)).toEqual(["A", "B"]);
    expect(store.selectedTab).toBe(1);
    expect(mocks.globalObject.selectedTab).toBe(1);
  });

  // P10: the old main-body-tab-bar tore the shared session down before the splice so
  // the websocket closes and we disappear from other clients' awareness.
  it("detaches the closed tab's shared session before removing it", async () => {
    seedTabs(["A", "B"]);
    await closeTab(0);
    expect(mocks.sharedDocService.detach).toHaveBeenCalledWith(0);
  });

  it("does not detach anything when the index is out of range", async () => {
    seedTabs(["A"]);
    await closeTab(5);
    expect(mocks.sharedDocService.detach).not.toHaveBeenCalled();
  });

  // P11: the closed tab's remote cursor arrows / selection boxes must go with it,
  // and the renderers must unsubscribe the session's awareness BEFORE it is destroyed
  // — hence clearForTab strictly before detach (the old main-body-tab-bar's order).
  it("clears the closed tab's remote cursor and selection helpers before detaching", async () => {
    seedTabs(["A", "B"]);
    const order: string[] = [];
    mocks.remoteCursorRenderer.clearForTab.mockImplementation(() => order.push("cursor"));
    mocks.remoteSelectionRenderer.clearForTab.mockImplementation(() => order.push("selection"));
    mocks.sharedDocService.detach.mockImplementation(() => order.push("detach"));

    await closeTab(0);

    expect(mocks.remoteCursorRenderer.clearForTab).toHaveBeenCalledWith(0);
    expect(mocks.remoteSelectionRenderer.clearForTab).toHaveBeenCalledWith(0);
    expect(order).toEqual(["cursor", "selection", "detach"]);
  });

  it("does not clear any renderer when the index is out of range", async () => {
    seedTabs(["A"]);
    await closeTab(5);
    expect(mocks.remoteCursorRenderer.clearForTab).not.toHaveBeenCalled();
    expect(mocks.remoteSelectionRenderer.clearForTab).not.toHaveBeenCalled();
  });
});

describe("renameTab", () => {
  // Seed one tab whose SceneInstance also lives (as a separate object) in the tree,
  // so we can assert renameTab updates the store, the engine, AND the tree node.
  function seedRenamable(name: string) {
    useTabsStore.setState({ tabs: [], selectedTab: -1 });
    useTabsStore.getState().openTab({ name, uuid: "uuid-1", isShared: false });
    const treeNode = { uuid: "uuid-1", name };
    mocks.globalObject.tabContext = [
      { sceneInstance: { uuid: "uuid-1", name }, threeScene: {}, contextDragObjects: [] },
    ];
    mocks.globalObject.sceneTree = [{ uuid: "type-1", children: [treeNode] }];
    return treeNode;
  }

  it("updates the store, engine SceneInstance and tree node, then PATCHes", async () => {
    const treeNode = seedRenamable("Old");
    mocks.backendService.sceneInstancesPATCH.mockResolvedValue({});

    await renameTab(0, "New");

    expect(useTabsStore.getState().tabs[0].name).toBe("New");
    expect((mocks.globalObject.tabContext[0] as { sceneInstance: { name: string } }).sceneInstance.name).toBe("New");
    expect(treeNode.name).toBe("New");
    expect(mocks.backendService.sceneInstancesPATCH).toHaveBeenCalledWith(
      "uuid-1",
      expect.objectContaining({ name: "New" }),
    );
    expect(mocks.eventBus.publish).toHaveBeenCalledWith("updateSceneGroup");
  });

  it("trims the new name", async () => {
    seedRenamable("Old");
    mocks.backendService.sceneInstancesPATCH.mockResolvedValue({});
    await renameTab(0, "  Trimmed  ");
    expect(useTabsStore.getState().tabs[0].name).toBe("Trimmed");
  });

  it("is a no-op for a blank or unchanged name", async () => {
    seedRenamable("Old");
    await renameTab(0, "   ");
    await renameTab(0, "Old");
    expect(mocks.backendService.sceneInstancesPATCH).not.toHaveBeenCalled();
    expect(useTabsStore.getState().tabs[0].name).toBe("Old");
  });

  it("does not PATCH when autoSave is off but still renames locally", async () => {
    seedRenamable("Old");
    mocks.globalObject.autoSave = false;
    await renameTab(0, "New");
    expect(mocks.backendService.sceneInstancesPATCH).not.toHaveBeenCalled();
    expect(useTabsStore.getState().tabs[0].name).toBe("New");
  });

  it("reverts the rename everywhere when the PATCH fails", async () => {
    const treeNode = seedRenamable("Old");
    // A non-403 error avoids the window.alert branch (this file runs in the node env).
    mocks.backendService.sceneInstancesPATCH.mockRejectedValue(new Error("network"));

    await renameTab(0, "New");

    expect(useTabsStore.getState().tabs[0].name).toBe("Old");
    expect((mocks.globalObject.tabContext[0] as { sceneInstance: { name: string } }).sceneInstance.name).toBe("Old");
    expect(treeNode.name).toBe("Old");
  });

  it("ignores an out-of-range index", async () => {
    seedRenamable("Old");
    await renameTab(9, "New");
    expect(mocks.backendService.sceneInstancesPATCH).not.toHaveBeenCalled();
  });
});

describe("renameSceneInstance — a scene with no open tab", () => {
  // The scene-tree context menu can rename a scene that was never opened, so there is
  // no tab index to address and no tabsStore entry to update; only the tree node and
  // the server may be touched. renameTab is the thin wrapper over this for the tab bar.
  function seedTreeOnly(name: string) {
    useTabsStore.setState({ tabs: [], selectedTab: -1 });
    mocks.globalObject.tabContext = [];
    mocks.globalObject.selectedTab = -1;
    const treeNode = { uuid: "uuid-closed", name };
    mocks.globalObject.sceneTree = [{ uuid: "type-1", children: [treeNode] }];
    return treeNode;
  }

  it("renames the tree node and PATCHes it", async () => {
    const treeNode = seedTreeOnly("Old");
    mocks.backendService.sceneInstancesPATCH.mockResolvedValue({});

    await renameSceneInstance(treeNode as never, "New");

    expect(treeNode.name).toBe("New");
    expect(mocks.backendService.sceneInstancesPATCH).toHaveBeenCalledWith(
      "uuid-closed",
      expect.objectContaining({ name: "New" }),
    );
    expect(mocks.eventBus.publish).toHaveBeenCalledWith("updateSceneGroup");
  });

  it("reverts the tree node when the PATCH fails", async () => {
    const treeNode = seedTreeOnly("Old");
    mocks.backendService.sceneInstancesPATCH.mockRejectedValue(new Error("network"));

    await renameSceneInstance(treeNode as never, "New");

    expect(treeNode.name).toBe("Old");
  });

  it("records no undo step for a scene that is not the active tab", async () => {
    const treeNode = seedTreeOnly("Old");
    mocks.backendService.sceneInstancesPATCH.mockResolvedValue({});

    await renameSceneInstance(treeNode as never, "New");

    // history is scoped to the scene you are looking at; a step here would land on
    // whatever OTHER scene happens to be open.
    expect(mocks.historyService.record).not.toHaveBeenCalled();
  });

  it("still updates the tab bar when the renamed scene does have a tab", async () => {
    // Same entry point, scene open: the tab's SceneInstance and the store must follow.
    useTabsStore.setState({ tabs: [], selectedTab: -1 });
    useTabsStore.getState().openTab({ name: "Old", uuid: "uuid-1", isShared: false });
    const treeNode = { uuid: "uuid-1", name: "Old" };
    mocks.globalObject.tabContext = [
      { sceneInstance: { uuid: "uuid-1", name: "Old" }, threeScene: {}, contextDragObjects: [] },
    ];
    mocks.globalObject.selectedTab = 0;
    mocks.globalObject.sceneTree = [{ uuid: "type-1", children: [treeNode] }];
    mocks.backendService.sceneInstancesPATCH.mockResolvedValue({});

    await renameSceneInstance(treeNode as never, "New");

    expect(useTabsStore.getState().tabs[0].name).toBe("New");
    expect(
      (mocks.globalObject.tabContext[0] as { sceneInstance: { name: string } }).sceneInstance.name,
    ).toBe("New");
    expect(treeNode.name).toBe("New");
  });
});
