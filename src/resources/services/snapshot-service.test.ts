// P3 unit tests for snapshot-service (plan §7: "snapshot clone/rollback").
//
// The service reads/writes the engine god object. Importing the REAL
// global-definition constructs a WebGLRenderer + OrbitControls at module scope
// (no WebGL/DOM under vitest-node), so we replace it with a light, mutable fake —
// the service only ever touches plain state fields on it. The gds `SceneInstance`
// stays REAL so the `instanceof` / plainToInstance reviving is actually exercised.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { SceneInstance, ClassInstance } from "@gds";

const mocks = vi.hoisted(() => ({
  globalObject: {} as any,
}));

vi.mock("@/engine/global-definition", () => ({ globalObject: mocks.globalObject }));

import { snapshotService } from "./snapshot-service";
import { globalSelectedObject } from "@/engine/global-selected-object";

function fakeScene(): any {
  return { uuid: "", remove: vi.fn(), traverse: vi.fn() };
}

function makeSceneInstance(uuid: string, name: string): SceneInstance {
  // Revive from plain JSON exactly like the API path does, so the fixture is a real
  // gds instance with nested ClassInstance children.
  return SceneInstance.fromJS({
    uuid,
    name,
    uuid_scene_type: "st-1",
    class_instances: [
      { uuid: "A", uuid_class: "metaA", attribute_instance: [], port_instance: [] },
      { uuid: "B", uuid_class: "metaB", attribute_instance: [], port_instance: [] },
    ],
    relationclasses_instances: [],
    role_instances: [],
    attribute_instances: [],
    port_instances: [],
  }) as SceneInstance;
}

beforeEach(() => {
  Object.assign(mocks.globalObject, {
    selectedTab: 0,
    tabContext: [],
    scene: fakeScene(),
    dragObjects: [],
    attribute_instances: [],
    role_instances: [],
    relationObjects: [],
    current_class_instance: undefined,
    current_port_instance: undefined,
    current_meta_port: undefined,
  });
});

describe("SnapshotService — scene-open state snapshot/rollback", () => {
  it("restores the whole engine open-state after a mutation", () => {
    const g = mocks.globalObject;
    const tabA = { id: "a" };
    const tabB = { id: "b" };
    const drag = { id: "d1" };
    const attr = { id: "ai" };
    const cls = { id: "ci" };

    g.selectedTab = 2;
    g.tabContext = [tabA, tabB];
    g.dragObjects = [drag];
    g.attribute_instances = [attr];
    g.current_class_instance = cls;

    snapshotService.createSceneOpenSnapshot();

    // Simulate a failed scene-open that trashed the state.
    g.selectedTab = 0;
    g.tabContext = [];
    g.dragObjects = [];
    g.attribute_instances = [];
    g.current_class_instance = undefined;

    snapshotService.rollbackSceneOpen();

    expect(g.selectedTab).toBe(2);
    expect(g.tabContext).toEqual([tabA, tabB]);
    expect(g.dragObjects).toEqual([drag]);
    expect(g.attribute_instances).toEqual([attr]);
    expect(g.current_class_instance).toBe(cls);
  });

  it("rollback is a no-op when no snapshot was taken", () => {
    const g = mocks.globalObject;
    g.selectedTab = 5;
    snapshotService.clearSceneOpenSnapshot();
    snapshotService.rollbackSceneOpen();
    expect(g.selectedTab).toBe(5);
  });
});

describe("SnapshotService — per-SceneInstance deep clone/restore", () => {
  it("restores a deep clone that is a real gds instance and undoes local edits", () => {
    const g = mocks.globalObject;
    const original = makeSceneInstance("scene-1", "Original Name");
    const droppedMesh = { id: "mesh-1" };

    g.selectedTab = 0;
    g.tabContext = [
      {
        sceneInstance: original,
        threeScene: g.scene,
        contextDragObjects: [droppedMesh],
        isShared: false,
      },
    ];
    g.attribute_instances = [{ id: "stale" }];

    snapshotService.setSceneInstanceSnapshot(original);

    // Mutate the live scene instance (as an edit/import would).
    original.name = "MUTATED";
    original.class_instances.push(
      ClassInstance.fromJS({ uuid: "C", uuid_class: "metaC" }) as ClassInstance,
    );

    const restored = snapshotService.restoreSceneInstanceToCurrentTab();

    expect(restored).not.toBeNull();
    expect(restored).toBeInstanceOf(SceneInstance);
    // Deep clone => a NEW object, not the mutated live one.
    expect(restored).not.toBe(original);
    expect(restored!.name).toBe("Original Name");
    // The pushed class instance is gone; reviving kept instanceof working.
    expect(restored!.class_instances).toHaveLength(2);
    expect(restored!.class_instances[0]).toBeInstanceOf(ClassInstance);

    // Side effects: dropped meshes removed from the scene, tracking arrays cleared.
    expect(g.scene.remove).toHaveBeenCalledWith(droppedMesh);
    expect(g.tabContext[0].contextDragObjects).toHaveLength(0);
    expect(g.attribute_instances).toHaveLength(0);
    // The tab now points at the restored clone.
    expect(g.tabContext[0].sceneInstance).toBe(restored);
  });

  // A rollback pulls every mesh of the tab out of the THREE scene. Anything still
  // holding one of them keeps working against an object that is no longer in the scene
  // graph: the transform gizmo logs "TransformControls: The attached 3D object must be
  // a part of the scene graph" once per frame, and the selection box measures a mesh
  // that is gone.
  it("lets go of the selection and the transform gizmo before dropping the meshes", () => {
    const g = mocks.globalObject;
    const droppedMesh = { uuid: "A", isMesh: true } as any;
    const original = makeSceneInstance("s-detach", "Original Name");
    g.selectedTab = 0;
    g.transformControls = { detach: vi.fn() };
    g.tabContext = [
      { sceneInstance: original, threeScene: g.scene, contextDragObjects: [droppedMesh], isShared: false },
    ];
    globalSelectedObject.object = droppedMesh;

    snapshotService.setSceneInstanceSnapshot(original);
    snapshotService.restoreSceneInstanceToCurrentTab();

    expect(g.transformControls.detach).toHaveBeenCalled();
    expect(globalSelectedObject.object).toBeUndefined();
  });

  it("restores without a transform gizmo (no scene open yet)", () => {
    const g = mocks.globalObject;
    const original = makeSceneInstance("s-no-gizmo", "Original Name");
    g.selectedTab = 0;
    g.transformControls = undefined;
    g.tabContext = [
      { sceneInstance: original, threeScene: g.scene, contextDragObjects: [], isShared: false },
    ];

    snapshotService.setSceneInstanceSnapshot(original);

    expect(snapshotService.restoreSceneInstanceToCurrentTab()).not.toBeNull();
  });

  it("returns null when there is no snapshot for the current tab", () => {
    const g = mocks.globalObject;
    const other = makeSceneInstance("no-snapshot", "x");
    g.selectedTab = 0;
    g.tabContext = [
      { sceneInstance: other, threeScene: g.scene, contextDragObjects: [], isShared: false },
    ];
    expect(snapshotService.restoreSceneInstanceToCurrentTab()).toBeNull();
  });
});
