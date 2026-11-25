import { describe, it, expect, beforeEach, vi } from "vitest";
import { AttributeInstance, ClassInstance, SceneInstance } from "@gds";
import {
  ROBOTIC_SYSTEM_SCENETYPE_UUID,
  OBJECTSPACE_SCENETYPE_UUID,
  STATECHANGE_SCENETYPE_UUID,
  OBJECT_3D_ATTRIBUTE_UUID,
  IMAGE_TO_DETECT_ATTRIBUTE_UUID,
  REFERENCE_CLASS_UUID,
} from "@/constants";

/**
 * P12 tests for the hybrid-algorithms dispatcher. This file is ROUTING, and routing is
 * exactly what is worth pinning: every call site (attribute window, table/reference
 * dialogs, scenegroup, copy-scene, the 1 Hz ThreeCanvas heartbeat) calls
 * checkHybridAlgorithms() unconditionally and trusts this service to decide what
 * applies from the open tab's scene type. A wrong branch here is silent — the wrong
 * algorithm simply never runs, and nothing throws.
 *
 * The four algorithm modules are mocked: their own behaviour is tested elsewhere
 * (urdf-pose-service.test.ts) or needs a WebGL scene; what matters here is WHICH one is
 * called, with what.
 */

const fakeGlobal = vi.hoisted(() => ({
  globalObject: { tabContext: [] as unknown[] },
}));
vi.mock("@/engine/global-definition", () => fakeGlobal);

const mocks = vi.hoisted(() => ({
  objectspaceAlgorithms: {
    checkAugmentationsInstance: vi.fn(async () => undefined),
    checkDetectableInstance: vi.fn(async () => undefined),
  },
  statechangeAlgorithms: {
    checkForReference: vi.fn(async () => undefined),
    updateThreejsObject: vi.fn(async () => undefined),
    updateReferenceClassAttributeInstanceValues: vi.fn(async () => undefined),
  },
  urdfPoseService: {
    tryUpdateRobotFromJointOriginEdit: vi.fn(async () => true),
  },
  instanceUtility: {
    getTabContextSceneInstance: vi.fn(async (): Promise<SceneInstance | undefined> => undefined),
  },
  logger: { log: vi.fn() },
}));
vi.mock("@/engine/hybrid-algorithms/objectspace-algorithms", () => ({
  objectspaceAlgorithms: mocks.objectspaceAlgorithms,
}));
vi.mock("@/engine/hybrid-algorithms/statechange-algorithms", () => ({
  statechangeAlgorithms: mocks.statechangeAlgorithms,
}));
vi.mock("@/engine/hybrid-algorithms/urdf-pose-service", () => ({ urdfPoseService: mocks.urdfPoseService }));
vi.mock("@/resources/services/instance-utility", () => ({ instanceUtility: mocks.instanceUtility }));
vi.mock("@/resources/services/logger", () => ({ logger: mocks.logger }));

const { hybridAlgorithmsService } = await import("@/engine/hybrid-algorithms/hybrid-algorithms-service");

const CLASS_INSTANCE_UUID = "11111111-1111-4111-8111-111111111111";

/** Builds the scene from PLAIN json and reads the revived child back out (P4's trap). */
function makeScene(sceneTypeUuid: string, classInstances: unknown[] = []): SceneInstance {
  return SceneInstance.fromJS({
    uuid: "99999999-9999-4999-8999-999999999999",
    name: "scene",
    uuid_scene_type: sceneTypeUuid,
    class_instances: classInstances,
  }) as SceneInstance;
}

function makeAttributeInstance(uuidAttribute: string): AttributeInstance {
  return AttributeInstance.fromJS({
    uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    name: "attr",
    uuid_attribute: uuidAttribute,
    value: "v",
  }) as AttributeInstance;
}

function openTab(sceneTypeUuid: string, classInstances: unknown[] = []): SceneInstance {
  const scene = makeScene(sceneTypeUuid, classInstances);
  fakeGlobal.globalObject.tabContext = [{}];
  mocks.instanceUtility.getTabContextSceneInstance.mockResolvedValue(scene);
  return scene;
}

describe("hybrid-algorithms-service routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeGlobal.globalObject.tabContext = [];
    mocks.instanceUtility.getTabContextSceneInstance.mockResolvedValue(undefined);
  });

  it("does nothing at all when no tab is open", async () => {
    await hybridAlgorithmsService.checkHybridAlgorithms(makeAttributeInstance(OBJECT_3D_ATTRIBUTE_UUID));

    expect(mocks.instanceUtility.getTabContextSceneInstance).not.toHaveBeenCalled();
    expect(mocks.objectspaceAlgorithms.checkAugmentationsInstance).not.toHaveBeenCalled();
    expect(mocks.statechangeAlgorithms.checkForReference).not.toHaveBeenCalled();
  });

  it("is a no-op for an unrelated scene type (e.g. BPMN)", async () => {
    openTab("5e37e51c-e420-438c-9747-e9424723b4cd");

    await hybridAlgorithmsService.checkHybridAlgorithms(makeAttributeInstance(OBJECT_3D_ATTRIBUTE_UUID));

    expect(mocks.objectspaceAlgorithms.checkAugmentationsInstance).not.toHaveBeenCalled();
    expect(mocks.objectspaceAlgorithms.checkDetectableInstance).not.toHaveBeenCalled();
    expect(mocks.statechangeAlgorithms.checkForReference).not.toHaveBeenCalled();
  });

  describe("ObjectSpace", () => {
    it("routes an Object 3D attribute edit to checkAugmentationsInstance", async () => {
      openTab(OBJECTSPACE_SCENETYPE_UUID);
      const attributeInstance = makeAttributeInstance(OBJECT_3D_ATTRIBUTE_UUID);

      await hybridAlgorithmsService.checkHybridAlgorithms(attributeInstance);

      expect(mocks.objectspaceAlgorithms.checkAugmentationsInstance).toHaveBeenCalledWith(attributeInstance);
      expect(mocks.objectspaceAlgorithms.checkDetectableInstance).not.toHaveBeenCalled();
    });

    it("routes an Image to detect attribute edit to checkDetectableInstance", async () => {
      openTab(OBJECTSPACE_SCENETYPE_UUID);
      const attributeInstance = makeAttributeInstance(IMAGE_TO_DETECT_ATTRIBUTE_UUID);

      await hybridAlgorithmsService.checkHybridAlgorithms(attributeInstance);

      expect(mocks.objectspaceAlgorithms.checkDetectableInstance).toHaveBeenCalledWith(attributeInstance);
      expect(mocks.objectspaceAlgorithms.checkAugmentationsInstance).not.toHaveBeenCalled();
    });

    it("ignores an attribute edit that is neither Object 3D nor Image to detect", async () => {
      openTab(OBJECTSPACE_SCENETYPE_UUID);

      await hybridAlgorithmsService.checkHybridAlgorithms(makeAttributeInstance("dddddddd-dddd-4ddd-8ddd-dddddddddddd"));

      expect(mocks.objectspaceAlgorithms.checkAugmentationsInstance).not.toHaveBeenCalled();
      expect(mocks.objectspaceAlgorithms.checkDetectableInstance).not.toHaveBeenCalled();
    });

    it("harvests Object 3D / Image attributes out of passed class instances (the scene-open path)", async () => {
      const classInstanceJson = {
        uuid: CLASS_INSTANCE_UUID,
        name: "detectable",
        uuid_class: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        attribute_instance: [
          { uuid: "a1", name: "o3d", uuid_attribute: OBJECT_3D_ATTRIBUTE_UUID, value: "{}" },
          { uuid: "a2", name: "img", uuid_attribute: IMAGE_TO_DETECT_ATTRIBUTE_UUID, value: "data:image/png;x" },
          { uuid: "a3", name: "other", uuid_attribute: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", value: "x" },
        ],
      };
      const scene = openTab(OBJECTSPACE_SCENETYPE_UUID, [classInstanceJson]);
      const classInstance = scene.class_instances[0];

      await hybridAlgorithmsService.checkHybridAlgorithms(null, [classInstance]);

      // Exactly the two tagged attributes, and not the third.
      expect(mocks.objectspaceAlgorithms.checkAugmentationsInstance).toHaveBeenCalledTimes(1);
      expect(mocks.objectspaceAlgorithms.checkAugmentationsInstance).toHaveBeenCalledWith(
        classInstance.attribute_instance[0],
      );
      expect(mocks.objectspaceAlgorithms.checkDetectableInstance).toHaveBeenCalledTimes(1);
      expect(mocks.objectspaceAlgorithms.checkDetectableInstance).toHaveBeenCalledWith(
        classInstance.attribute_instance[1],
      );
    });
  });

  describe("Statechange", () => {
    it("runs checkForReference for a Statechange scene", async () => {
      openTab(STATECHANGE_SCENETYPE_UUID);

      await hybridAlgorithmsService.checkHybridAlgorithms(null, []);

      expect(mocks.statechangeAlgorithms.checkForReference).toHaveBeenCalledTimes(1);
    });

    it("updates only the Reference class instances among those passed", async () => {
      const scene = openTab(STATECHANGE_SCENETYPE_UUID, [
        { uuid: CLASS_INSTANCE_UUID, name: "ref", uuid_class: REFERENCE_CLASS_UUID, attribute_instance: [] },
        { uuid: "22222222-2222-4222-8222-222222222222", name: "other", uuid_class: "xxxx", attribute_instance: [] },
      ]);

      await hybridAlgorithmsService.checkHybridAlgorithms(null, scene.class_instances);

      expect(mocks.statechangeAlgorithms.updateThreejsObject).toHaveBeenCalledTimes(1);
      expect(mocks.statechangeAlgorithms.updateThreejsObject).toHaveBeenCalledWith(scene.class_instances[0]);
    });

    it("updateHybridAlgorithmAttributes (the 1 Hz ThreeCanvas heartbeat) only fires for Statechange", async () => {
      openTab(STATECHANGE_SCENETYPE_UUID);
      await hybridAlgorithmsService.updateHybridAlgorithmAttributes();
      expect(mocks.statechangeAlgorithms.updateReferenceClassAttributeInstanceValues).toHaveBeenCalledTimes(1);

      vi.clearAllMocks();
      openTab(OBJECTSPACE_SCENETYPE_UUID);
      await hybridAlgorithmsService.updateHybridAlgorithmAttributes();
      expect(mocks.statechangeAlgorithms.updateReferenceClassAttributeInstanceValues).not.toHaveBeenCalled();

      vi.clearAllMocks();
      fakeGlobal.globalObject.tabContext = [];
      await hybridAlgorithmsService.updateHybridAlgorithmAttributes();
      expect(mocks.statechangeAlgorithms.updateReferenceClassAttributeInstanceValues).not.toHaveBeenCalled();
    });
  });

  describe("Robotic system", () => {
    function jointInstanceWithUrdfRef(): ClassInstance {
      const instance = ClassInstance.fromJS({
        uuid: CLASS_INSTANCE_UUID,
        name: "joint",
        uuid_class: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        attribute_instance: [],
      }) as ClassInstance;
      (instance as ClassInstance & { urdfRef?: unknown }).urdfRef = { kind: "joint", name: "j1" };
      return instance;
    }

    it("re-poses the robot for a Joint/Origin edit on a urdf-imported instance", async () => {
      openTab(ROBOTIC_SYSTEM_SCENETYPE_UUID);
      const joint = jointInstanceWithUrdfRef();
      const editedCell = makeAttributeInstance("cell");

      await hybridAlgorithmsService.checkHybridAlgorithms(
        editedCell,
        [joint],
        null,
        { name: "Joint" } as never,
        { name: "Origin" } as never,
      );

      expect(mocks.urdfPoseService.tryUpdateRobotFromJointOriginEdit).toHaveBeenCalledWith(joint, editedCell);
    });

    it("does not re-pose for a different class/attribute, or an instance with no urdfRef", async () => {
      openTab(ROBOTIC_SYSTEM_SCENETYPE_UUID);
      const joint = jointInstanceWithUrdfRef();
      const cell = makeAttributeInstance("cell");

      // Right instance, wrong attribute.
      await hybridAlgorithmsService.checkHybridAlgorithms(cell, [joint], null, { name: "Joint" } as never, {
        name: "Limit",
      } as never);
      // Right attribute, wrong class.
      await hybridAlgorithmsService.checkHybridAlgorithms(cell, [joint], null, { name: "Link" } as never, {
        name: "Origin",
      } as never);
      // Right names, but the instance did not come from a URDF import.
      const plainJoint = ClassInstance.fromJS({ uuid: "x", name: "j", uuid_class: "c" }) as ClassInstance;
      await hybridAlgorithmsService.checkHybridAlgorithms(cell, [plainJoint], null, { name: "Joint" } as never, {
        name: "Origin",
      } as never);

      expect(mocks.urdfPoseService.tryUpdateRobotFromJointOriginEdit).not.toHaveBeenCalled();
    });

    it("returns before the ObjectSpace/Statechange passes (the original's `finally { return }`)", async () => {
      // A Robotic system scene holding a Reference class instance and an Object 3D
      // attribute: neither may be touched, because the robotic branch returns.
      const scene = openTab(ROBOTIC_SYSTEM_SCENETYPE_UUID, [
        {
          uuid: CLASS_INSTANCE_UUID,
          name: "ref",
          uuid_class: REFERENCE_CLASS_UUID,
          attribute_instance: [{ uuid: "a1", name: "o3d", uuid_attribute: OBJECT_3D_ATTRIBUTE_UUID, value: "{}" }],
        },
      ]);

      await hybridAlgorithmsService.checkHybridAlgorithms(
        makeAttributeInstance(OBJECT_3D_ATTRIBUTE_UUID),
        scene.class_instances,
      );

      expect(mocks.objectspaceAlgorithms.checkAugmentationsInstance).not.toHaveBeenCalled();
      expect(mocks.statechangeAlgorithms.updateThreejsObject).not.toHaveBeenCalled();
      expect(mocks.statechangeAlgorithms.checkForReference).not.toHaveBeenCalled();
    });

    it("skips quietly (no error toast) when called with only an attributeInstance", async () => {
      // The DEVIATION from the original, pinned: roboticsystem-algorithms.setReferenceAttribute
      // calls checkHybridAlgorithms(attrInst) for every Child/Parent link during a URDF
      // import. The original indexes classInstances[0] unguarded, so each of those threw
      // and got logged at 'error' -> one red snackbar per joint.
      openTab(ROBOTIC_SYSTEM_SCENETYPE_UUID);

      await hybridAlgorithmsService.checkHybridAlgorithms(makeAttributeInstance("cell"));

      expect(mocks.urdfPoseService.tryUpdateRobotFromJointOriginEdit).not.toHaveBeenCalled();
      expect(mocks.logger.log).not.toHaveBeenCalledWith(expect.anything(), "error");
    });

    it("logs, but does not throw, when the pose update fails", async () => {
      openTab(ROBOTIC_SYSTEM_SCENETYPE_UUID);
      mocks.urdfPoseService.tryUpdateRobotFromJointOriginEdit.mockRejectedValueOnce(new Error("boom"));

      await expect(
        hybridAlgorithmsService.checkHybridAlgorithms(
          makeAttributeInstance("cell"),
          [jointInstanceWithUrdfRef()],
          null,
          { name: "Joint" } as never,
          { name: "Origin" } as never,
        ),
      ).resolves.toBeUndefined();

      expect(mocks.logger.log).toHaveBeenCalledWith(expect.stringContaining("boom"), "error");
    });
  });
});
