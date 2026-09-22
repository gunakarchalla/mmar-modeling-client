// historyService — recording steps and replaying them onto the live scene.
//
// The engine leaves are mocked (the real ones build a WebGLRenderer at module scope);
// the event bus, the stores and the gds fixtures are REAL, so what is under test is the
// actual record -> diff -> apply -> broadcast path. gds objects are revived through
// `X.fromJS` (the P3 class-transformer rule) so `instanceof` survives an in-place undo.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { AttributeInstance, ClassInstance, SceneInstance, remove_table_row } from "@gds";

const mocks = vi.hoisted(() => ({
  globalObject: {
    selectedTab: 0,
    tabContext: [] as { sceneInstance: SceneInstance }[],
    scene: { getObjectByProperty: vi.fn() } as unknown as { getObjectByProperty: ReturnType<typeof vi.fn> },
    attribute_instances: [] as unknown[],
    role_instances: [] as unknown[],
    sceneTree: [] as unknown[],
    render: false,
    doSceneInstancePatch: false,
    doSceneInstancePatchLocal: false,
  },
  globalSelectedObject: { object: null as { uuid: string } | null, getObject: vi.fn() },
  deletionHandler: {
    deleteClassInstance: vi.fn(async (instance: ClassInstance, index: number) => {
      mocks.globalObject.tabContext[0].sceneInstance.class_instances.splice(index, 1);
      void instance;
    }),
    deleteRelationclassInstance: vi.fn(async (_instance: unknown, index: number) => {
      mocks.globalObject.tabContext[0].sceneInstance.relationclasses_instances.splice(index, 1);
    }),
  },
  coordinatesUpdater: {
    updateCoordinates2DonClassAndPortInstance: vi.fn(async () => undefined),
    updateRotationOnClassAndPortInstance: vi.fn(async () => undefined),
    updateScaleOnClassAndPortInstance: vi.fn(async () => undefined),
  },
  persistencyHandler: {
    checkIfClassinstanceInScene: vi.fn(async () => undefined),
    checkIfRelationclassinstanceInScene: vi.fn(async () => undefined),
  },
  sharedDocService: {
    forTab: vi.fn(
      () => null as null | { ydoc: object; localOrigin: object; access: string; applyingRemote: boolean },
    ),
  },
  applyLocalChangeToYDoc: vi.fn(),
}));

vi.mock("@/engine/global-definition", () => ({ globalObject: mocks.globalObject }));
vi.mock("@/engine/global-selected-object", () => ({ globalSelectedObject: mocks.globalSelectedObject }));
vi.mock("@/engine/deletion-handler", () => ({ deletionHandler: mocks.deletionHandler }));
vi.mock("@/engine/coordinates-updater", () => ({ coordinatesUpdater: mocks.coordinatesUpdater }));
vi.mock("./persistency-handler", () => ({ persistencyHandler: mocks.persistencyHandler }));
vi.mock("@/resources/collaboration/shared-doc-service", () => ({ sharedDocService: mocks.sharedDocService }));
vi.mock("@/resources/collaboration/y-mapping", () => ({
  applyLocalChangeToYDoc: mocks.applyLocalChangeToYDoc,
}));

import { historyService } from "./history-service";
import { eventBus } from "./event-bus";
import { selectCanRedo, selectCanUndo, useHistoryStore } from "@/resources/store/historyStore";

const SCENE_UUID = "scene-1";

function makeClassInstance(uuid: string, x = 0): Record<string, unknown> {
  return {
    uuid,
    name: `class-${uuid}`,
    uuid_class: "meta-class",
    coordinates_2d: { x, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    custom_variables: {},
    attribute_instance: [{ uuid: `attr-${uuid}`, name: "label", value: "before", uuid_attribute: "meta-attr" }],
    port_instance: [],
  };
}

function openScene(classInstances: Record<string, unknown>[] = [makeClassInstance("a")]): SceneInstance {
  const sceneInstance = SceneInstance.fromJS({
    uuid: SCENE_UUID,
    name: "scene",
    description: "",
    uuid_scene_type: "type-1",
    class_instances: classInstances,
    relationclasses_instances: [],
    role_instances: [],
    attribute_instances: [],
    port_instances: [],
  }) as unknown as SceneInstance;

  mocks.globalObject.tabContext = [{ sceneInstance }];
  mocks.globalObject.selectedTab = 0;
  historyService.initScene(sceneInstance);
  historyService.setActiveScene(sceneInstance);
  return sceneInstance;
}

const findClass = (scene: SceneInstance, uuid: string) =>
  scene.class_instances.find((instance) => instance.uuid === uuid)!;

beforeEach(() => {
  vi.clearAllMocks();
  useHistoryStore.getState().reset();
  mocks.globalObject.attribute_instances = [];
  mocks.globalObject.role_instances = [];
  mocks.globalObject.sceneTree = [];
  mocks.globalObject.doSceneInstancePatch = false;
  mocks.globalObject.doSceneInstancePatchLocal = false;
  mocks.globalSelectedObject.object = null;
  mocks.globalObject.scene.getObjectByProperty.mockReturnValue(undefined);
  mocks.sharedDocService.forTab.mockReturnValue(null);
});

describe("recording", () => {
  it("records a step naming only what changed", () => {
    const scene = openScene([makeClassInstance("a"), makeClassInstance("b")]);
    findClass(scene, "b").coordinates_2d.x = 5;

    historyService.record("move b");

    const history = useHistoryStore.getState().histories[SCENE_UUID];
    expect(history.entries).toHaveLength(2);
    expect(history.entries[1].touched).toEqual(["b"]);
    expect(selectCanUndo(useHistoryStore.getState())).toBe(true);
  });

  it("ignores a record when nothing actually changed", () => {
    openScene();
    historyService.record("nothing");
    expect(useHistoryStore.getState().histories[SCENE_UUID].entries).toHaveLength(1);
  });

  it("ignores a record for a scene that was never opened through initScene", () => {
    const sceneInstance = SceneInstance.fromJS({
      uuid: "unopened",
      uuid_scene_type: "type-1",
      class_instances: [],
      relationclasses_instances: [],
    }) as unknown as SceneInstance;
    mocks.globalObject.tabContext = [{ sceneInstance }];

    historyService.record("stray");

    expect(useHistoryStore.getState().histories["unopened"]).toBeUndefined();
  });

  // The user's rule for shared scenes: my history holds MY edits. A peer's change still
  // lands in the snapshot, it just never becomes a step of mine.
  it("leaves instances a collaborator changed out of the step", () => {
    const scene = openScene([makeClassInstance("mine"), makeClassInstance("theirs")]);
    findClass(scene, "theirs").coordinates_2d.x = 3;
    eventBus.publish("remoteSceneInstanceChanged", { tabIndex: 0, instanceUuids: ["theirs"] });
    findClass(scene, "mine").coordinates_2d.x = 7;

    historyService.record("move mine");

    expect(useHistoryStore.getState().histories[SCENE_UUID].entries[1].touched).toEqual(["mine"]);
  });

  it("records nothing when the only change came from a collaborator", () => {
    const scene = openScene();
    findClass(scene, "a").coordinates_2d.x = 3;
    eventBus.publish("remoteSceneInstanceChanged", { tabIndex: 0, instanceUuids: ["a"] });

    historyService.record("remote only");

    expect(useHistoryStore.getState().histories[SCENE_UUID].entries).toHaveLength(1);
  });
});

describe("the historyRecord bus channel", () => {
  it("records a step published by an engine module", () => {
    const scene = openScene();
    findClass(scene, "a").coordinates_2d.x = 4;

    eventBus.publish("historyRecord", { label: "create" });

    expect(useHistoryStore.getState().histories[SCENE_UUID].entries).toHaveLength(2);
  });

  it("flushes the pending transform writes before snapshotting", async () => {
    const scene = openScene();
    // Stand in for the animator's write-back: the mesh moved, the gds instance has not
    // caught up yet, and the flush is what makes the snapshot current.
    mocks.coordinatesUpdater.updateCoordinates2DonClassAndPortInstance.mockImplementation(async () => {
      findClass(scene, "a").coordinates_2d.x = 12;
    });

    await historyService.recordAfterTransformSync("translate");

    expect(mocks.coordinatesUpdater.updateCoordinates2DonClassAndPortInstance).toHaveBeenCalled();
    expect(mocks.coordinatesUpdater.updateRotationOnClassAndPortInstance).toHaveBeenCalled();
    expect(mocks.coordinatesUpdater.updateScaleOnClassAndPortInstance).toHaveBeenCalled();
    expect(useHistoryStore.getState().histories[SCENE_UUID].entries).toHaveLength(2);
  });
});

describe("undo and redo", () => {
  it("restores a moved instance in place, keeping its object identity", async () => {
    const scene = openScene();
    const instance = findClass(scene, "a");
    const coordinates = instance.coordinates_2d;
    instance.coordinates_2d.x = 9;
    historyService.record("move a");

    await historyService.undo();

    expect(findClass(scene, "a")).toBe(instance);
    expect(instance.coordinates_2d).toBe(coordinates);
    expect(instance.coordinates_2d.x).toBe(0);
    expect(instance).toBeInstanceOf(ClassInstance);
  });

  it("moves the three.js object back and re-arms the renderer", async () => {
    const scene = openScene();
    const object = { uuid: "a", position: { set: vi.fn() }, quaternion: { set: vi.fn() }, scale: { set: vi.fn() }, userData: {} };
    mocks.globalObject.scene.getObjectByProperty.mockReturnValue(object);
    findClass(scene, "a").coordinates_2d.x = 9;
    historyService.record("move a");

    await historyService.undo();

    expect(object.position.set).toHaveBeenCalledWith(0, 0, 0);
    expect(mocks.globalObject.render).toBe(true);
  });

  it("redoes the step it just undid", async () => {
    const scene = openScene();
    findClass(scene, "a").coordinates_2d.x = 9;
    historyService.record("move a");

    await historyService.undo();
    expect(findClass(scene, "a").coordinates_2d.x).toBe(0);

    await historyService.redo();
    expect(findClass(scene, "a").coordinates_2d.x).toBe(9);
    expect(selectCanRedo(useHistoryStore.getState())).toBe(false);
  });

  it("restores an attribute value and asks for a vizRep refresh", async () => {
    const scene = openScene();
    const attributeInstance = findClass(scene, "a").attribute_instance[0];
    mocks.globalObject.attribute_instances = [attributeInstance];
    attributeInstance.value = "after";
    historyService.record("edit label");

    const vizrep = vi.fn();
    const sub = eventBus.subscribe("checkForVizRepUpdateByAttributeInstance", vizrep);
    await historyService.undo();
    sub.dispose();

    expect(attributeInstance.value).toBe("before");
    expect(vizrep).toHaveBeenCalledWith(attributeInstance);
  });

  // The scene instance's OWN attributes (shown in the attribute window while nothing is
  // selected) belong to the scene, not to any instance in it — they are diffed under the
  // scene sentinel, so a value edit is a step of its own.
  it("restores the scene instance's own attribute value", async () => {
    const scene = openScene();
    const sceneAttribute = AttributeInstance.fromJS({
      uuid: "scene-attr-1",
      uuid_attribute: "meta-attr-scene",
      name: "Comment",
      value: "before",
      assigned_uuid_scene_instance: SCENE_UUID,
    }) as AttributeInstance;
    scene.attribute_instances.push(sceneAttribute);
    historyService.initScene(scene);
    mocks.globalObject.attribute_instances = [sceneAttribute];

    sceneAttribute.value = "after";
    historyService.record("edit Comment");

    const vizrep = vi.fn();
    const sub = eventBus.subscribe("checkForVizRepUpdateByAttributeInstance", vizrep);
    await historyService.undo();
    sub.dispose();

    expect(sceneAttribute.value).toBe("before");
    // same object, so the attribute window keeps rendering the instance it was handed
    expect(scene.attribute_instances[0]).toBe(sceneAttribute);
    expect(vizrep).toHaveBeenCalledWith(sceneAttribute);

    await historyService.redo();
    expect(sceneAttribute.value).toBe("after");
  });

  it("restores the rows of a table among the scene instance's own attributes", async () => {
    const scene = openScene();
    const table = AttributeInstance.fromJS({
      uuid: "scene-table",
      uuid_attribute: "meta-attr-table",
      name: "Variables",
      value: "",
      assigned_uuid_scene_instance: SCENE_UUID,
      table_attributes: [
        { uuid: "c0", uuid_attribute: "col", table_row: 0, table_attribute_reference: "scene-table", value: "first" },
        { uuid: "c1", uuid_attribute: "col", table_row: 1, table_attribute_reference: "scene-table", value: "second" },
      ],
    }) as AttributeInstance;
    scene.attribute_instances.push(table);
    historyService.initScene(scene);
    const cells = table.table_attributes;

    // A row removed, the way the table dialog does it.
    remove_table_row(table, 0);
    historyService.record("remove table row");
    expect(table.table_attributes.map((cell) => cell.uuid)).toEqual(["c1"]);

    await historyService.undo();
    expect(table.table_attributes.map((cell) => [cell.uuid, cell.table_row, cell.value])).toEqual([
      ["c0", 0, "first"],
      ["c1", 1, "second"],
    ]);
    // in place, so the dialog and the attribute window keep the array they were handed
    expect(table.table_attributes).toBe(cells);

    await historyService.redo();
    expect(table.table_attributes.map((cell) => [cell.uuid, cell.table_row])).toEqual([["c1", 0]]);
  });

  it("broadcasts an undone scene attribute value to collaborators", async () => {
    const session = { ydoc: {}, localOrigin: {}, access: "edit", applyingRemote: false };
    mocks.sharedDocService.forTab.mockReturnValue(session);
    const scene = openScene();
    const sceneAttribute = AttributeInstance.fromJS({
      uuid: "scene-attr-1",
      uuid_attribute: "meta-attr-scene",
      name: "Comment",
      value: "before",
      assigned_uuid_scene_instance: SCENE_UUID,
    }) as AttributeInstance;
    scene.attribute_instances.push(sceneAttribute);
    historyService.initScene(scene);

    sceneAttribute.value = "after";
    historyService.record("edit Comment");
    await historyService.undo();

    expect(mocks.applyLocalChangeToYDoc).toHaveBeenCalledWith(
      session.ydoc,
      { type: "scene_attribute_value", attributeUuid: "scene-attr-1", value: "before" },
      session.localOrigin,
    );
  });

  it("undoes a creation by deleting the instance again", async () => {
    const scene = openScene();
    scene.class_instances.push(ClassInstance.fromJS(makeClassInstance("new")) as unknown as ClassInstance);
    historyService.record("create new");

    await historyService.undo();

    expect(mocks.deletionHandler.deleteClassInstance).toHaveBeenCalledTimes(1);
    expect(scene.class_instances.map((instance) => instance.uuid)).toEqual(["a"]);
  });

  it("undoes a deletion by re-inserting the instance and re-drawing it", async () => {
    const scene = openScene([makeClassInstance("a"), makeClassInstance("gone")]);
    scene.class_instances.splice(1, 1);
    historyService.record("delete gone");

    await historyService.undo();

    const restored = findClass(scene, "gone");
    expect(restored).toBeInstanceOf(ClassInstance);
    expect(mocks.persistencyHandler.checkIfClassinstanceInScene).toHaveBeenCalledTimes(1);
    // Its attribute instances have to be back in the engine's flat list too, or the
    // attribute window would render an empty panel for the restored object.
    expect(mocks.globalObject.attribute_instances).toContainEqual(
      expect.objectContaining({ uuid: "attr-gone" }),
    );
  });

  it("flags the reverted scene for the next auto-save", async () => {
    const scene = openScene();
    findClass(scene, "a").coordinates_2d.x = 9;
    historyService.record("move a");

    await historyService.undo();

    expect(mocks.globalObject.doSceneInstancePatch).toBe(true);
  });

  it("does not record the mutations an undo itself makes", async () => {
    const scene = openScene();
    findClass(scene, "a").coordinates_2d.x = 9;
    historyService.record("move a");

    await historyService.undo();

    const history = useHistoryStore.getState().histories[SCENE_UUID];
    expect(history.entries).toHaveLength(2);
    expect(history.index).toBe(0);
  });

  it("no-ops at the floor and at the tip", async () => {
    openScene();
    await historyService.undo();
    await historyService.redo();
    expect(useHistoryStore.getState().histories[SCENE_UUID].index).toBe(0);
  });

  // The reason the apply is scoped rather than a whole-scene restore.
  it("leaves a collaborator's concurrent edit to another instance untouched", async () => {
    const scene = openScene([makeClassInstance("mine"), makeClassInstance("theirs")]);
    findClass(scene, "mine").coordinates_2d.x = 9;
    historyService.record("move mine");

    // A peer moves their own object AFTER our step was recorded.
    findClass(scene, "theirs").coordinates_2d.x = 42;

    await historyService.undo();

    expect(findClass(scene, "mine").coordinates_2d.x).toBe(0);
    expect(findClass(scene, "theirs").coordinates_2d.x).toBe(42);
  });
});

describe("collaboration", () => {
  it("pushes the reverted values to peers when the tab is shared", async () => {
    mocks.sharedDocService.forTab.mockReturnValue({
      ydoc: {},
      localOrigin: {},
      access: "edit",
      applyingRemote: false,
    });
    const scene = openScene();
    findClass(scene, "a").coordinates_2d.x = 9;
    historyService.record("move a");

    await historyService.undo();

    expect(mocks.applyLocalChangeToYDoc).toHaveBeenCalledWith(
      expect.anything(),
      { type: "coordinates", classInstanceUuid: "a", x: 0, y: 0, z: 0 },
      expect.anything(),
    );
    expect(mocks.globalObject.doSceneInstancePatchLocal).toBe(true);
  });

  it("stays silent on a read-only shared tab", async () => {
    mocks.sharedDocService.forTab.mockReturnValue({
      ydoc: {},
      localOrigin: {},
      access: "read",
      applyingRemote: false,
    });
    const scene = openScene();
    findClass(scene, "a").coordinates_2d.x = 9;
    historyService.record("move a");

    await historyService.undo();

    expect(mocks.applyLocalChangeToYDoc).not.toHaveBeenCalled();
  });

  it("restarts the history after a reconnect swapped in fresh server state", () => {
    const scene = openScene();
    findClass(scene, "a").coordinates_2d.x = 9;
    historyService.record("move a");
    expect(selectCanUndo(useHistoryStore.getState())).toBe(true);

    eventBus.publish("sharedSceneReconnected", { tabIndex: 0 });

    expect(useHistoryStore.getState().histories[scene.uuid].entries).toHaveLength(1);
    expect(selectCanUndo(useHistoryStore.getState())).toBe(false);
  });
});

describe("lifecycle", () => {
  it("keeps a separate stack per scene and follows the selected tab", () => {
    const first = openScene();
    findClass(first, "a").coordinates_2d.x = 9;
    historyService.record("move a");

    const second = SceneInstance.fromJS({
      uuid: "scene-2",
      uuid_scene_type: "type-1",
      class_instances: [],
      relationclasses_instances: [],
    }) as unknown as SceneInstance;
    mocks.globalObject.tabContext.push({ sceneInstance: second });
    mocks.globalObject.selectedTab = 1;
    historyService.initScene(second);

    expect(selectCanUndo(useHistoryStore.getState())).toBe(false);
    historyService.setActiveScene(first);
    expect(selectCanUndo(useHistoryStore.getState())).toBe(true);
  });

  it("forgets a closed scene", () => {
    const scene = openScene();
    historyService.dropScene(scene.uuid);
    expect(useHistoryStore.getState().histories[scene.uuid]).toBeUndefined();
  });
});
