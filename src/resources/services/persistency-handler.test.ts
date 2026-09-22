// @vitest-environment jsdom
//
// P7 unit tests for persistency-handler (plan §7: persist path + saveToTextfile).
// The handler reads the engine god object + several sibling services; importing the
// real ones would build a WebGLRenderer at module scope, so every engine module and
// service it depends on is replaced with a light fake. event-bus + logger stay real
// (pure). gds SceneInstance fixtures stay REAL (built via fromJS) so instanceof holds.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { SceneInstance } from "@gds";

const mocks = vi.hoisted(() => ({
  globalObject: {} as any,
  globalStateObject: {} as any,
  graphicContext: {
    resetInstance: vi.fn(),
    runVizRepFunction: vi.fn(),
    drawVizRep_rel: vi.fn(),
    current_instance_object: undefined,
  } as any,
  metaUtility: {
    getTabContextSceneType: vi.fn(),
    getMetaRelationclass: vi.fn(),
    parseMetaFunction: vi.fn(),
  } as any,
  instanceUtility: {
    getTabContextSceneInstance: vi.fn(),
    getAllOpenSceneInstances: vi.fn(),
    getAllPortInstancesOfTabContext: vi.fn(async () => []),
  } as any,
  snapshotService: {
    setSceneInstanceSnapshot: vi.fn(),
    restoreSceneInstanceToCurrentTab: vi.fn(),
  } as any,
  backendService: {
    sceneInstancesPATCH: vi.fn(),
    sceneInstancesPOST: vi.fn(),
  } as any,
  instanceCreationHandler: {
    createMissingSceneAttributeInstances: vi.fn(async () => []),
  } as any,
}));

vi.mock("@/engine/global-definition", () => ({ globalObject: mocks.globalObject }));
vi.mock("@/engine/global-state-object", () => ({ globalStateObject: mocks.globalStateObject }));
vi.mock("@/engine/graphic-context", () => ({
  GraphicContext: class {},
  graphicContext: mocks.graphicContext,
}));
vi.mock("@/engine/instance-creation-handler", () => ({
  instanceCreationHandler: mocks.instanceCreationHandler,
}));
vi.mock("./meta-utility", () => ({ metaUtility: mocks.metaUtility }));
vi.mock("./instance-utility", () => ({ instanceUtility: mocks.instanceUtility }));
vi.mock("./snapshot-service", () => ({ snapshotService: mocks.snapshotService }));
vi.mock("./backend-service", () => ({ backendService: mocks.backendService }));

import { persistencyHandler } from "./persistency-handler";
import { useLogStore } from "@/resources/store/logStore";
import { NOT_ALLOWED_MESSAGE } from "./metamodel-constraints";

function makeScene(uuid: string, name: string): SceneInstance {
  return SceneInstance.fromJS({
    uuid,
    name,
    uuid_scene_type: "st-1",
    class_instances: [],
    relationclasses_instances: [],
    role_instances: [],
    attribute_instances: [],
    port_instances: [],
  }) as SceneInstance;
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(mocks.globalObject, {
    selectedTab: 0,
    tabContext: [{}],
    autoSave: true,
  });
  useLogStore.setState({ logArray: [], snackbar: { open: false, message: "", severity: "info" } });
});

describe("persistency-handler.persistSceneInstanceToDB", () => {
  it("PATCHes the active scene instance and snapshots it", async () => {
    const scene = makeScene("s-1", "Scene 1");
    mocks.instanceUtility.getTabContextSceneInstance.mockResolvedValue(scene);
    mocks.metaUtility.getTabContextSceneType.mockResolvedValue({ uuid: "st-1" });
    mocks.backendService.sceneInstancesPATCH.mockResolvedValue(scene);

    await persistencyHandler.persistSceneInstanceToDB();

    expect(mocks.backendService.sceneInstancesPATCH).toHaveBeenCalledWith("s-1", scene);
    expect(mocks.snapshotService.setSceneInstanceSnapshot).toHaveBeenCalledWith(scene);
    expect(mocks.backendService.sceneInstancesPOST).not.toHaveBeenCalled();
  });

  it("creates a freshly-created scene with a single PATCH (server upsert, no POST fallback)", async () => {
    // The server PATCH is an upsert, so the first save of a new scene succeeds with a
    // single PATCH — no PATCH -> 404 -> POST dance. POST must never be called.
    const scene = makeScene("s-new", "Second Scene");
    mocks.instanceUtility.getTabContextSceneInstance.mockResolvedValue(scene);
    mocks.metaUtility.getTabContextSceneType.mockResolvedValue({ uuid: "st-1" });
    mocks.backendService.sceneInstancesPATCH.mockResolvedValue(scene);

    await persistencyHandler.persistSceneInstanceToDB();

    expect(mocks.backendService.sceneInstancesPATCH).toHaveBeenCalledWith("s-new", scene);
    expect(mocks.backendService.sceneInstancesPOST).not.toHaveBeenCalled();
    expect(mocks.snapshotService.setSceneInstanceSnapshot).toHaveBeenCalledWith(scene);
  });

  it("reverts to the last snapshot when PATCH is rejected with 403 (read-only shared scene)", async () => {
    const scene = makeScene("s-3", "Shared Scene");
    mocks.instanceUtility.getTabContextSceneInstance.mockResolvedValue(scene);
    mocks.metaUtility.getTabContextSceneType.mockResolvedValue({ uuid: "st-1" });
    mocks.backendService.sceneInstancesPATCH.mockRejectedValue(
      Object.assign(new Error("You are not authorized to update this scene instance"), { status: 403 }),
    );
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => undefined);

    await persistencyHandler.persistSceneInstanceToDB();

    expect(mocks.backendService.sceneInstancesPOST).not.toHaveBeenCalled();
    expect(mocks.snapshotService.restoreSceneInstanceToCurrentTab).toHaveBeenCalled();
    expect(mocks.snapshotService.setSceneInstanceSnapshot).not.toHaveBeenCalled();
    // Reported through the snackbar; the blocking window.alert is gone.
    expect(alertSpy).not.toHaveBeenCalled();
    expect(useLogStore.getState().snackbar.message).toContain("authorization");

    alertSpy.mockRestore();
  });

  // The rule engine answers a broken metamodel rule with the SAME 403 as a missing
  // access right, so the message is what tells them apart. Saying "not authorized" for
  // a value that simply does not match its attribute type's regex sent users looking
  // for a permissions problem that was not there.
  it("reports a refused metamodel rule as such, not as an authorization problem", async () => {
    const scene = makeScene("s-4", "My Scene");
    mocks.instanceUtility.getTabContextSceneInstance.mockResolvedValue(scene);
    mocks.metaUtility.getTabContextSceneType.mockResolvedValue({ uuid: "st-1" });
    mocks.backendService.sceneInstancesPATCH.mockRejectedValue(
      Object.assign(
        new Error("The rule error was fired for the attribute ai-1: abc does not match the regex /^[0-9]+$/gmi"),
        { status: 403 },
      ),
    );

    await persistencyHandler.persistSceneInstanceToDB();

    expect(useLogStore.getState().snackbar.message).toBe(NOT_ALLOWED_MESSAGE);
    expect(mocks.snapshotService.restoreSceneInstanceToCurrentTab).toHaveBeenCalled();
    // The server's own wording is kept for the log window.
    expect(useLogStore.getState().logArray.some((entry) => entry.value.includes("does not match the regex"))).toBe(true);
  });

  it("logs and skips when there is no active scene instance", async () => {
    mocks.instanceUtility.getTabContextSceneInstance.mockResolvedValue(undefined);

    await persistencyHandler.persistSceneInstanceToDB();

    expect(mocks.backendService.sceneInstancesPATCH).not.toHaveBeenCalled();
    expect(mocks.snapshotService.setSceneInstanceSnapshot).not.toHaveBeenCalled();
  });
});

describe("persistency-handler.loadPersistedModel", () => {
  // A scene saved before scene-type attributes were instantiated has none, so loading
  // one is where the missing ones get created — that is what puts a model's own
  // attributes in the attribute window for existing scenes.
  it("instantiates the scene type's missing attributes for the loaded scene", async () => {
    const scene = makeScene("s-3", "Scene 3");
    mocks.instanceUtility.getTabContextSceneInstance.mockResolvedValue(scene);

    await persistencyHandler.loadPersistedModel(scene);

    expect(mocks.instanceCreationHandler.createMissingSceneAttributeInstances).toHaveBeenCalledWith(scene);
  });

  it("still loads the scene when the attribute instantiation fails", async () => {
    const scene = makeScene("s-4", "Scene 4");
    mocks.instanceUtility.getTabContextSceneInstance.mockResolvedValue(scene);
    mocks.instanceCreationHandler.createMissingSceneAttributeInstances.mockRejectedValueOnce(
      new Error("boom"),
    );

    await expect(persistencyHandler.loadPersistedModel(scene)).resolves.toBeUndefined();
  });
});

describe("persistency-handler.saveToTextfile", () => {
  it("serialises the active scene to a downloadable JSON blob", async () => {
    const scene = makeScene("s-2", "MyScene");
    mocks.instanceUtility.getTabContextSceneInstance.mockResolvedValue(scene);
    mocks.globalObject.tabContext = [{}];

    const createObjectURL = vi.fn((blob: Blob) => `blob:${blob.size}`);
    const revokeObjectURL = vi.fn();
    (window.URL as any).createObjectURL = createObjectURL;
    (window.URL as any).revokeObjectURL = revokeObjectURL;
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    await persistencyHandler.saveToTextfile();

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(createObjectURL.mock.calls[0][0]).toBeInstanceOf(Blob);
    expect(clickSpy).toHaveBeenCalledTimes(1);

    clickSpy.mockRestore();
  });

  it("does nothing when no tab is open", async () => {
    mocks.globalObject.tabContext = [];
    const createObjectURL = vi.fn(() => "blob:mock");
    (window.URL as any).createObjectURL = createObjectURL;

    await persistencyHandler.saveToTextfile();

    expect(createObjectURL).not.toHaveBeenCalled();
  });
});

/**
 * The scenario the draw pass has to survive: the local user has clicked the first end of
 * a relation and is still dragging the line to its second end, when a relation a peer
 * just FINISHED arrives over the Y.Doc and lands in this same draw pass.
 *
 * The half-drawn line lives on `globalStateObject.activeStateLine`, and the pass used to
 * take the line it drew from that very field (the graphic context published it there) and
 * clear the field when it was done. So a peer's relation stole the local user's line and
 * then threw it away: the next click started a SECOND relation instead of closing the
 * first, which stayed in the scene forever with no `role_instance_to`, its last line
 * point still pinned to the mouse pointer. The line now travels back as the return value
 * of the draw, and `activeStateLine` is left alone.
 */
describe("persistency-handler.checkIfRelationclassinstanceInScene", () => {
  /** A stand-in for the Line2 a vizRep's rel_graphic_line builds. */
  function fakeLine(uuid: string) {
    return {
      uuid,
      children: [{ uuid: "child-a" }, { uuid: "child-b" }],
      userData: { relObj: [] as unknown[] },
    } as any;
  }

  /** A scene holding one relation that is not drawn yet, connecting two class instances. */
  function sceneWithUndrawnRelation(relationUuid: string) {
    const scene = makeScene("s-collab", "Shared") as any;
    scene.relationclasses_instances = [
      {
        uuid: relationUuid,
        uuid_class: "meta-rel-1",
        line_points: [{ UUID: "obj-from" }, { UUID: "obj-to" }],
      },
    ];
    return scene;
  }

  beforeEach(() => {
    Object.assign(mocks.globalObject, {
      dragObjects: [{ uuid: "obj-from" }, { uuid: "obj-to" }],
      scene: { add: vi.fn() },
      render: false,
      current_class_instance: undefined,
    });
    mocks.metaUtility.getMetaRelationclass.mockResolvedValue({ geometry: "() => {}" });
    mocks.metaUtility.parseMetaFunction.mockResolvedValue(() => undefined);
  });

  it("draws the peer's relation without disturbing the line the local user is drawing", async () => {
    const scene = sceneWithUndrawnRelation("rel-from-peer");
    mocks.instanceUtility.getTabContextSceneInstance.mockResolvedValue(scene);

    // What the local user is holding: their own half-drawn line, already in the pick list
    // (the interaction handler puts it there on the opening click).
    const lineBeingDrawn = fakeLine("rel-being-drawn-locally");
    mocks.globalStateObject.activeStateLine = lineBeingDrawn;
    mocks.globalObject.dragObjects.push(lineBeingDrawn);

    mocks.graphicContext.drawVizRep_rel.mockResolvedValue(fakeLine("drawn-for-peer"));

    await persistencyHandler.checkIfRelationclassinstanceInScene();

    // The user's gesture is untouched — same line object, still active, still theirs.
    expect(mocks.globalStateObject.activeStateLine).toBe(lineBeingDrawn);
    // ...and it was not redrawn on top of itself: only the peer's relation was drawn.
    expect(mocks.graphicContext.drawVizRep_rel).toHaveBeenCalledTimes(1);
  });

  it("takes the drawn line from the draw call and registers it under the relation's uuid", async () => {
    const scene = sceneWithUndrawnRelation("rel-from-peer");
    mocks.instanceUtility.getTabContextSceneInstance.mockResolvedValue(scene);

    const drawn = fakeLine("uuid-the-vizrep-happened-to-use");
    mocks.graphicContext.drawVizRep_rel.mockResolvedValue(drawn);
    // A stale value here must not be what the pass picks up.
    mocks.globalStateObject.activeStateLine = fakeLine("not-this-one");

    await persistencyHandler.checkIfRelationclassinstanceInScene();

    // The returned line is the one that gets the relation's identity and goes into the scene.
    expect(drawn.uuid).toBe("rel-from-peer");
    expect(drawn.children.map((child: any) => child.uuid)).toEqual(["rel-from-peer", "rel-from-peer"]);
    expect(mocks.globalObject.scene.add).toHaveBeenCalledWith(drawn);
    expect(mocks.globalObject.dragObjects[0]).toBe(drawn);
    // Its line points resolved to the meshes they name.
    expect(drawn.userData.relObj).toEqual([{ uuid: "obj-from" }, { uuid: "obj-to" }]);
  });

  it("skips a relation that is already drawn", async () => {
    const scene = sceneWithUndrawnRelation("rel-already-drawn");
    mocks.instanceUtility.getTabContextSceneInstance.mockResolvedValue(scene);
    mocks.globalObject.dragObjects.push({ uuid: "rel-already-drawn" });

    await persistencyHandler.checkIfRelationclassinstanceInScene();

    expect(mocks.graphicContext.drawVizRep_rel).not.toHaveBeenCalled();
  });
});
