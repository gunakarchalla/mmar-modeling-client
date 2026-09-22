// session-reset: logging out must leave nothing of the previous user's session behind,
// because the next login re-renders the SAME singletons (AppLayout only stops rendering
// the body while nobody is signed in). The regression this guards is a second user
// inheriting the first user's open scene tabs — visible AND manipulable, since
// `contextDragObjects` is the raycasters' pick list.
//
// `@/engine` is mocked: the real barrel builds a WebGLRenderer at module scope. The
// services that import the global-definition LEAF (history, snapshot, meta) bypass that
// barrel mock, so each is mocked in its own right — the same lesson as tabActions.test.
import { describe, it, expect, beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  globalObject: {
    selectedTab: 0,
    tabContext: [] as unknown[],
    scene: { name: "old-scene" },
    dragObjects: [] as unknown[],
    updateLinesArray: [] as unknown[],
    relationObjects: [] as unknown[],
    buttonObjects: [] as unknown[],
    attribute_instances: [] as unknown[],
    role_instances: [] as unknown[],
    allPositions: [] as number[],
    allRotations: [] as number[],
    allScales: [] as number[],
    current_class_instance: { uuid: "ci-1" } as unknown,
    current_port_instance: { uuid: "pi-1" } as unknown,
    current_meta_port: { uuid: "mp-1" } as unknown,
    sceneTree: [] as unknown[],
    sceneTypes: [] as unknown[],
    importSceneTypes: [] as unknown[],
    importSceneInstances: [] as unknown[],
    autoSave: true,
    doSceneInstancePatch: false,
    doSceneInstancePatchLocal: false,
    runMechanism: false,
    readyForVizRepUpdate: true,
    objectScaled: false,
    transformControls: { detach: vi.fn() },
  },
  globalSelectedObject: { removeObject: vi.fn() },
  globalStateObject: { activeState: "" },
  historyService: { reset: vi.fn() },
  snapshotService: { clear: vi.fn() },
  metaUtility: { Files: new Map<string, unknown>() },
  sharedDocService: { detachAll: vi.fn(), forTab: vi.fn(() => null) },
  remoteCursorRenderer: { clearAll: vi.fn() },
  remoteSelectionRenderer: { clearAll: vi.fn() },
}));

vi.mock("@/engine", () => ({
  globalObject: mocks.globalObject,
  globalSelectedObject: mocks.globalSelectedObject,
  globalStateObject: mocks.globalStateObject,
}));
vi.mock("@/resources/services/history-service", () => ({ historyService: mocks.historyService }));
vi.mock("@/resources/services/snapshot-service", () => ({ snapshotService: mocks.snapshotService }));
vi.mock("@/resources/services/meta-utility", () => ({ metaUtility: mocks.metaUtility }));
vi.mock("@/resources/collaboration/shared-doc-service", () => ({ sharedDocService: mocks.sharedDocService }));
vi.mock("@/resources/collaboration/remote-cursor-renderer", () => ({
  remoteCursorRenderer: mocks.remoteCursorRenderer,
}));
vi.mock("@/resources/collaboration/remote-selection-renderer", () => ({
  remoteSelectionRenderer: mocks.remoteSelectionRenderer,
}));

import { resetSessionState } from "./session-reset";
import { eventBus } from "./event-bus";
import { sceneInstanceCacheGeneration } from "./scene-tree-service";
import { useTabsStore } from "@/resources/store/tabsStore";
import { useCollabStore } from "@/resources/store/collabStore";
import { useSelectionStore } from "@/resources/store/selectionStore";
import { useStateStore } from "@/resources/store/stateStore";
import { useUiStore } from "@/resources/store/uiStore";
import { useLogStore } from "@/resources/store/logStore";

/** Put the app in the state "user A had two scenes open, one of them shared". */
function seedSession() {
  const tabs = useTabsStore.getState();
  tabs.reset();
  tabs.openTab({ name: "Scene A", uuid: "scene-a", isShared: false });
  tabs.openTab({ name: "Scene B", uuid: "scene-b", isShared: true });

  mocks.globalObject.tabContext = [
    { sceneInstance: { uuid: "scene-a" }, threeScene: {}, contextDragObjects: [{}, {}] },
    { sceneInstance: { uuid: "scene-b" }, threeScene: {}, contextDragObjects: [{}] },
  ];
  mocks.globalObject.selectedTab = 1;
  mocks.globalObject.dragObjects = [{}, {}];
  mocks.globalObject.attribute_instances = [{}];
  mocks.globalObject.role_instances = [{}];
  mocks.globalObject.relationObjects = [{}];
  mocks.globalObject.sceneTree = [{ uuid: "type-1", children: [{ uuid: "scene-a" }] }];
  mocks.globalObject.sceneTypes = [{ uuid: "type-1" }];
  mocks.globalObject.importSceneInstances = [{ uuid: "scene-c" }];

  useCollabStore.getState().setTab(1, { status: "connected", access: "edit", banner: null, users: [] });
  useSelectionStore.getState().setSelection("ci-1", "class");
  useStateStore.getState().setActiveState("DrawingMode (insert)");
  useUiStore.getState().openDialog("shareScene", { uuid: "scene-a" });
  useLogStore.getState().log("Scene A opened", "info");
  mocks.metaUtility.Files.set("file-1", {});
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.globalObject.transformControls = { detach: vi.fn() };
  mocks.metaUtility.Files.clear();
  seedSession();
});

describe("resetSessionState", () => {
  it("closes every tab in both the store and the engine", () => {
    resetSessionState();

    expect(useTabsStore.getState().tabs).toEqual([]);
    expect(useTabsStore.getState().selectedTab).toBe(-1);
    expect(mocks.globalObject.tabContext).toEqual([]);
    expect(mocks.globalObject.selectedTab).toBe(-1);
  });

  it("swaps in a fresh empty THREE scene and empties the raycasters' pick list", () => {
    const previousScene = mocks.globalObject.scene;

    resetSessionState();

    // The pick list is what made the previous user's objects draggable and deletable.
    expect(mocks.globalObject.dragObjects).toEqual([]);
    expect(mocks.globalObject.scene).not.toBe(previousScene);
    expect((mocks.globalObject.scene as unknown as { children: unknown[] }).children).toEqual([]);
  });

  it("drops the selection and detaches the transform gizmo", () => {
    const { transformControls } = mocks.globalObject;

    resetSessionState();

    expect(transformControls.detach).toHaveBeenCalled();
    expect(mocks.globalSelectedObject.removeObject).toHaveBeenCalled();
    expect(useSelectionStore.getState().selectedInstanceUuid).toBeNull();
    expect(mocks.globalObject.current_class_instance).toBeUndefined();
    expect(mocks.globalObject.current_port_instance).toBeUndefined();
    expect(mocks.globalObject.current_meta_port).toBeUndefined();
  });

  it("tears down collaboration before the tabs it draws into are gone", () => {
    const order: string[] = [];
    // `Once`, so these spies carry no implementation into the next test (clearAllMocks
    // drops recorded calls but keeps implementations).
    mocks.remoteCursorRenderer.clearAll.mockImplementationOnce(() => order.push("cursors"));
    mocks.remoteSelectionRenderer.clearAll.mockImplementationOnce(() => order.push("selections"));
    // The sockets carry the logging-out user's JWT, so they must not outlive the logout.
    mocks.sharedDocService.detachAll.mockImplementationOnce(() => {
      order.push("sessions");
      // The helpers are removed while their scenes still exist.
      expect(mocks.globalObject.tabContext).toHaveLength(2);
    });

    resetSessionState();

    expect(order).toEqual(["cursors", "selections", "sessions"]);
    expect(useCollabStore.getState().tabs).toEqual({});
  });

  it("drops the per-scene undo histories and snapshots", () => {
    resetSessionState();

    expect(mocks.historyService.reset).toHaveBeenCalled();
    expect(mocks.snapshotService.clear).toHaveBeenCalled();
  });

  it("clears the scene tree, the metamodel files and the instance cache", () => {
    const before = sceneInstanceCacheGeneration();

    resetSessionState();

    expect(mocks.globalObject.sceneTree).toEqual([]);
    expect(mocks.globalObject.sceneTypes).toEqual([]);
    expect(mocks.globalObject.importSceneTypes).toEqual([]);
    expect(mocks.globalObject.importSceneInstances).toEqual([]);
    expect(mocks.metaUtility.Files.size).toBe(0);
    // Bumping the generation is what retires an in-flight tree fetch started under the
    // previous user's token (see SceneGroup's initTree).
    expect(sceneInstanceCacheGeneration()).not.toBe(before);
  });

  it("closes any dialog left open and drops its payload", () => {
    resetSessionState();

    expect(useUiStore.getState().dialogs.shareScene).toBe(false);
    expect(useUiStore.getState().getDialogPayload("shareScene")).toBeUndefined();
    expect(useUiStore.getState().loading).toBe(false);
  });

  it("clears the log panel and the interaction mode", () => {
    resetSessionState();

    expect(useLogStore.getState().logArray).toEqual([]);
    expect(useStateStore.getState().activeState).toBe("");
    expect(mocks.globalStateObject.activeState).toBe("");
  });

  it("is idempotent on an already-empty session", () => {
    resetSessionState();
    expect(() => resetSessionState()).not.toThrow();
    expect(useTabsStore.getState().tabs).toEqual([]);
  });
});

describe("the login channel", () => {
  it("runs the teardown on logout", () => {
    eventBus.publish("login", false);

    expect(useTabsStore.getState().tabs).toEqual([]);
    expect(mocks.globalObject.tabContext).toEqual([]);
    expect(mocks.sharedDocService.detachAll).toHaveBeenCalled();
  });

  it("leaves the session alone on login, which happens after the teardown", () => {
    eventBus.publish("login", true);

    expect(useTabsStore.getState().tabs).toHaveLength(2);
    expect(mocks.sharedDocService.detachAll).not.toHaveBeenCalled();
  });
});
