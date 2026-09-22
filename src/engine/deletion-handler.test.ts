// P5 unit test for the deletion handler — proves the CASCADE: deleting a class
// instance also removes every relation connected to it (via its role instances) and
// tears down those role instances, keeping the SceneInstance object graph consistent.
// A shallow delete would leave dangling relations that crash Animator.setPos on the
// next frame, so the cascade is the property worth pinning.
//
// global-definition + graphic-context + instance-utility + backend-service are faked
// (WebGLRenderer / troika / network). The THREE.Scene is REAL so getObjectByProperty
// + scene.remove behave; gds fixtures are REAL via fromJS. autoSave is false so no DB
// calls happen. Node env.
import { describe, it, expect, beforeEach, vi } from "vitest";
import * as THREE from "three";
import { SceneInstance, RoleInstance } from "@gds";

const threeScene = new THREE.Scene();

const mocks = vi.hoisted(() => ({
  globalObject: {
    role_instances: [] as unknown[],
    attribute_instances: [] as unknown[],
    updateLinesArray: [] as unknown[],
    autoSave: false,
    doSceneInstancePatch: false,
    sharedDocServiceRef: null as unknown,
    selectedTab: 0,
    boxHelper: undefined as unknown,
    current_class_instance: undefined as unknown,
    scene: undefined as unknown,
  },
  graphicContext: { deleteObject: vi.fn(async () => {}) },
  instanceUtility: { getTabContextSceneInstance: vi.fn() },
  backendService: {
    classesInstancesAllDELETE2: vi.fn(),
    relationClassesInstancesAllDELETE2: vi.fn(),
    bendpointInstanceDELETE: vi.fn(),
  },
}));

vi.mock("@/engine/global-definition", () => ({ globalObject: mocks.globalObject }));
vi.mock("@/engine/graphic-context", () => ({ graphicContext: mocks.graphicContext, GraphicContext: class {} }));
vi.mock("@/resources/services/instance-utility", () => ({ instanceUtility: mocks.instanceUtility }));
vi.mock("@/resources/services/backend-service", () => ({ backendService: mocks.backendService }));
// onPressDelete finishes with setState(0), and the real state machine reaches for
// transformControls / orbitControls / the DOM container, none of which the faked
// globalObject has. globalSelectedObject stays REAL — it is the thing under test.
vi.mock("@/engine/global-state-object", () => ({
  globalStateObject: { activeStateLine: undefined, setState: vi.fn() },
}));

const { deletionHandler } = await import("./deletion-handler");
const { globalSelectedObject } = await import("./global-selected-object");
const { eventBus } = await import("@/resources/services/event-bus");

const CI_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CI_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const REL = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const RF = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const RT = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

/** Scene with A --REL--> B, where REL's from/to roles reference A and B. */
function makeScene(): SceneInstance {
  return SceneInstance.fromJS({
    uuid: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    name: "scene",
    uuid_scene_type: "st-1",
    class_instances: [
      { uuid: CI_A, name: "A", uuid_class: "mc", attribute_instance: [], port_instance: [] },
      { uuid: CI_B, name: "B", uuid_class: "mc", attribute_instance: [], port_instance: [] },
    ],
    relationclasses_instances: [
      {
        uuid: REL,
        name: "R",
        uuid_relationclass: "mrc",
        line_points: [],
        attribute_instance: [],
        role_instance_from: { uuid: RF, uuid_role: "role-from", uuid_has_reference_class_instance: CI_A },
        role_instance_to: { uuid: RT, uuid_role: "role-to", uuid_has_reference_class_instance: CI_B },
      },
    ],
    port_instances: [],
    attribute_instances: [],
  }) as SceneInstance;
}

function meshFor(uuid: string, name: string): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  m.uuid = uuid;
  m.name = name;
  return m;
}

let sceneInstance: SceneInstance;

beforeEach(() => {
  vi.clearAllMocks();
  // reset the shared THREE scene
  threeScene.clear();
  threeScene.add(meshFor(CI_A, "A"), meshFor(CI_B, "B"), meshFor(REL, "R"));

  sceneInstance = makeScene();
  mocks.globalObject.scene = threeScene;
  mocks.globalObject.boxHelper = undefined;
  mocks.globalObject.updateLinesArray = [];
  mocks.globalObject.attribute_instances = [];
  mocks.globalObject.doSceneInstancePatch = false;
  // Reset explicitly: the cascade suite below turns auto-save on to observe the DB
  // deletes, and the "autoSave is off" test must not inherit that.
  mocks.globalObject.autoSave = false;
  // both role instances live in the global list, matching the relation's roles
  mocks.globalObject.role_instances = [
    RoleInstance.fromJS({ uuid: RF, uuid_role: "role-from", uuid_has_reference_class_instance: CI_A }),
    RoleInstance.fromJS({ uuid: RT, uuid_role: "role-to", uuid_has_reference_class_instance: CI_B }),
  ];
  mocks.instanceUtility.getTabContextSceneInstance.mockResolvedValue(sceneInstance);
});

describe("DeletionHandler.deleteClassInstance — cascade", () => {
  it("removes the class AND the relation connected to it, plus both role instances", async () => {
    const classA = sceneInstance.class_instances[0];

    await deletionHandler.deleteClassInstance(classA, 0);

    // class A gone, class B remains
    expect(sceneInstance.class_instances.map((c) => c.uuid)).toEqual([CI_B]);
    // the connected relation cascaded away
    expect(sceneInstance.relationclasses_instances).toHaveLength(0);
    // both role instances torn down
    expect(mocks.globalObject.role_instances).toHaveLength(0);
    // local patch flag raised for auto-save
    expect(mocks.globalObject.doSceneInstancePatch).toBe(true);
  });

  it("does not call the DB delete endpoints when autoSave is off", async () => {
    const classA = sceneInstance.class_instances[0];

    await deletionHandler.deleteClassInstance(classA, 0);

    expect(mocks.backendService.classesInstancesAllDELETE2).not.toHaveBeenCalled();
    expect(mocks.backendService.relationClassesInstancesAllDELETE2).not.toHaveBeenCalled();
  });
});

/**
 * The cascade splices the very arrays a caller's index points into: deleting a relation
 * takes its bendpoints, and a bendpoint is a class instance in `class_instances`. An
 * index captured before that ran removed a BYSTANDER and left the instance the user
 * deleted in place — while the DB delete for it had already gone out. The next
 * auto-save then PATCHed a scene containing an instance the database had cascaded
 * away, and the server's upsert tried to re-create it and its vanished roles: the 500
 * behind "SceneInstance save failed".
 *
 * The property: whatever the ordering of `class_instances`, the scene left behind holds
 * exactly the survivors, and nothing the cascade deleted from the database is still in
 * it to be sent back.
 */
describe("DeletionHandler.deleteClassInstance — cascade over chained relations", () => {
  const BP = "10000000-0000-4000-8000-000000000000";
  const CI_C = "0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c";
  const REL2 = "22222222-2222-4222-8222-222222222222";
  const R2F = "d3333333-dddd-4ddd-8ddd-dddddddddddd";
  const R2T = "d4444444-dddd-4ddd-8ddd-dddddddddddd";

  const classInstanceJson = (uuid: string, name: string) => ({ uuid, name, uuid_class: "mc", attribute_instance: [], port_instance: [] });
  const linePoint = (uuid: string) => ({ UUID: uuid, Point: { x: 0, y: 0, z: 0 } });

  /** A --REL(bendpoint BP)--> B --REL2--> C, with `classOrder` fixing the array order. */
  function makeChainedScene(classOrder: string[]): SceneInstance {
    const names: Record<string, string> = { [BP]: "bendpoint", [CI_A]: "A", [CI_B]: "B", [CI_C]: "C" };
    return SceneInstance.fromJS({
      uuid: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      name: "scene",
      uuid_scene_type: "st-1",
      class_instances: classOrder.map((uuid) => classInstanceJson(uuid, names[uuid])),
      relationclasses_instances: [
        {
          uuid: REL, name: "R", uuid_relationclass: "mrc",
          line_points: [linePoint(CI_A), linePoint(BP), linePoint(CI_B)],
          attribute_instance: [],
          role_instance_from: { uuid: RF, uuid_role: "role-from", uuid_has_reference_class_instance: CI_A },
          role_instance_to: { uuid: RT, uuid_role: "role-to", uuid_has_reference_class_instance: CI_B },
        },
        {
          uuid: REL2, name: "R2", uuid_relationclass: "mrc",
          line_points: [linePoint(CI_B), linePoint(CI_C)],
          attribute_instance: [],
          role_instance_from: { uuid: R2F, uuid_role: "role-from", uuid_has_reference_class_instance: CI_B },
          role_instance_to: { uuid: R2T, uuid_role: "role-to", uuid_has_reference_class_instance: CI_C },
        },
      ],
      port_instances: [],
      attribute_instances: [],
    }) as SceneInstance;
  }

  /** Set the shared fixture up for `classOrder` and delete B, the middle of the chain. */
  async function deleteMiddleOf(classOrder: string[]): Promise<SceneInstance> {
    const scene = makeChainedScene(classOrder);
    mocks.instanceUtility.getTabContextSceneInstance.mockResolvedValue(scene);
    threeScene.clear();
    for (const uuid of [...classOrder, REL, REL2]) threeScene.add(meshFor(uuid, uuid));
    mocks.globalObject.autoSave = true;
    mocks.globalObject.role_instances = [
      RoleInstance.fromJS({ uuid: RF, uuid_role: "role-from", uuid_has_reference_class_instance: CI_A }),
      RoleInstance.fromJS({ uuid: RT, uuid_role: "role-to", uuid_has_reference_class_instance: CI_B }),
      RoleInstance.fromJS({ uuid: R2F, uuid_role: "role-from", uuid_has_reference_class_instance: CI_B }),
      RoleInstance.fromJS({ uuid: R2T, uuid_role: "role-to", uuid_has_reference_class_instance: CI_C }),
    ];

    const classB = scene.class_instances.find((instance) => instance.uuid === CI_B)!;
    const staleIndex = scene.class_instances.findIndex((instance) => instance.uuid === CI_B);
    await deletionHandler.deleteClassInstance(classB, staleIndex);
    return scene;
  }

  // The bendpoint sits BEFORE the target, so the cascade shifts the target's index down
  // by one before the outer splice runs. This is the ordering that used to keep B and
  // drop C.
  it("removes the instance the user deleted, whatever the cascade did to the indices", async () => {
    const scene = await deleteMiddleOf([BP, CI_A, CI_B, CI_C]);

    expect(scene.class_instances.map((instance) => instance.uuid)).toEqual([CI_A, CI_C]);
    expect(scene.relationclasses_instances).toHaveLength(0);
  });

  it("removes the same instances when the bendpoint sits after the target", async () => {
    const scene = await deleteMiddleOf([CI_A, CI_B, CI_C, BP]);

    expect(scene.class_instances.map((instance) => instance.uuid)).toEqual([CI_A, CI_C]);
    expect(scene.relationclasses_instances).toHaveLength(0);
  });

  // The one that turns into a 500: nothing the cascade deleted from the database may
  // still be in the scene the next PATCH sends.
  it("leaves nothing in the scene that it deleted from the database", async () => {
    const scene = await deleteMiddleOf([BP, CI_A, CI_B, CI_C]);

    const deletedFromDb = [
      ...mocks.backendService.classesInstancesAllDELETE2.mock.calls.map((call) => call[0]),
      ...mocks.backendService.relationClassesInstancesAllDELETE2.mock.calls.map((call) => call[0]),
      ...mocks.backendService.bendpointInstanceDELETE.mock.calls.map((call) => call[0]),
    ];
    const stillInScene = [
      ...scene.class_instances.map((instance) => instance.uuid),
      ...scene.relationclasses_instances.map((instance) => instance.uuid),
    ];

    expect(deletedFromDb).toContain(CI_B);
    expect(stillInScene.filter((uuid) => deletedFromDb.includes(uuid))).toEqual([]);
  });

  // deleteBendpoint used to hand deleteClassInstance an `undefined` instance and an
  // index of -1 when the bendpoint was no longer a class instance of the scene, which
  // threw on `classInstance.port_instance` and abandoned the rest of the cascade.
  it("survives a relation whose bendpoint has no class instance left", async () => {
    const scene = makeChainedScene([CI_A, CI_B, CI_C]); // BP referenced by REL, but absent
    mocks.instanceUtility.getTabContextSceneInstance.mockResolvedValue(scene);
    threeScene.clear();
    for (const uuid of [CI_A, CI_B, CI_C, REL, REL2]) threeScene.add(meshFor(uuid, uuid));
    mocks.globalObject.role_instances = [
      RoleInstance.fromJS({ uuid: RF, uuid_role: "role-from", uuid_has_reference_class_instance: CI_A }),
      RoleInstance.fromJS({ uuid: RT, uuid_role: "role-to", uuid_has_reference_class_instance: CI_B }),
    ];

    const classB = scene.class_instances.find((instance) => instance.uuid === CI_B)!;
    await expect(deletionHandler.deleteClassInstance(classB, 1)).resolves.toBeUndefined();
    expect(scene.class_instances.map((instance) => instance.uuid)).toEqual([CI_A, CI_C]);
  });
});

/**
 * Delete acts on THE SELECTION — what has the red box around it — and on nothing when
 * nothing is selected.
 *
 * It used to act on `globalObject.current_class_instance`, which answers a different
 * question: that field is the vizRep pipeline's "instance being drawn" pointer, so it
 * keeps naming whatever was drawn or picked last. Delete therefore fired when the user
 * had deselected by clicking empty canvas, and on the instance just dropped in drawing
 * mode — in both cases with nothing selected on screen to explain what was destroyed.
 */
describe("DeletionHandler.onPressDelete — acts on the selection", () => {
  beforeEach(() => {
    globalSelectedObject.removeObject();
  });

  /**
   * Select an instance exactly the way onSelectionMode does — including setting the
   * engine's `current_class_instance`, which it also does. Without that the "deselect
   * then Delete" case below would not reproduce: the whole point is that clearing the
   * selection has to clear that pointer too.
   */
  function select(uuid: string, instance: unknown) {
    globalSelectedObject.setObject(meshFor(uuid, uuid));
    mocks.globalObject.current_class_instance = instance;
    globalSelectedObject.setSelectedInstance(instance as never);
  }

  it("deletes the selected class instance", async () => {
    select(CI_A, sceneInstance.class_instances[0]);

    await deletionHandler.onPressDelete();

    expect(sceneInstance.class_instances.map((instance) => instance.uuid)).toEqual([CI_B]);
  });

  it("deletes the selected relation instance", async () => {
    select(REL, sceneInstance.relationclasses_instances[0]);

    await deletionHandler.onPressDelete();

    expect(sceneInstance.relationclasses_instances).toHaveLength(0);
    // The classes it connected are untouched.
    expect(sceneInstance.class_instances.map((instance) => instance.uuid)).toEqual([CI_A, CI_B]);
  });

  // The reported bug: select something, click empty canvas to deselect, press Delete.
  it("deletes nothing after the selection was cleared by a click on empty canvas", async () => {
    select(CI_A, sceneInstance.class_instances[0]);
    // What onSelectionMode does when the click hits nothing.
    globalSelectedObject.removeObject();

    await deletionHandler.onPressDelete();

    expect(sceneInstance.class_instances.map((instance) => instance.uuid)).toEqual([CI_A, CI_B]);
    expect(sceneInstance.relationclasses_instances).toHaveLength(1);
  });

  // Drawing mode leaves the engine pointer on the instance it just created, and never
  // clears it — nothing is selected, so Delete must still do nothing.
  it("deletes nothing when only the engine's draw pointer names an instance", async () => {
    mocks.globalObject.current_class_instance = sceneInstance.class_instances[0];

    await deletionHandler.onPressDelete();

    expect(sceneInstance.class_instances.map((instance) => instance.uuid)).toEqual([CI_A, CI_B]);
  });

  it("deletes nothing when the selected instance is no longer in the scene", async () => {
    // A peer deleted it while it was selected here.
    select(CI_A, { uuid: "a-uuid-the-scene-does-not-hold" });

    await deletionHandler.onPressDelete();

    expect(sceneInstance.class_instances.map((instance) => instance.uuid)).toEqual([CI_A, CI_B]);
  });

  it("records no undo step when it deleted nothing", async () => {
    const steps: unknown[] = [];
    const subscription = eventBus.subscribe("historyRecord", (payload) => steps.push(payload));

    await deletionHandler.onPressDelete();
    expect(steps).toHaveLength(0);

    // ...but a real delete still records exactly one.
    select(CI_A, sceneInstance.class_instances[0]);
    await deletionHandler.onPressDelete();
    expect(steps).toHaveLength(1);

    subscription.dispose();
  });
});
