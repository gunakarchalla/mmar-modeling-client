import { describe, it, expect, beforeEach, vi } from "vitest";
import * as THREE from "three";
import { SceneInstance } from "@gds";
import {
  REFERENCE_CLASS_UUID,
  REFERENCE_POSITION_X_ATTRIBUTE_UUID,
  REFERENCE_POSITION_Y_ATTRIBUTE_UUID,
  REFERENCE_POSITION_Z_ATTRIBUTE_UUID,
  REFERENCE_ROTATION_X_ATTRIBUTE_UUID,
  REFERENCE_ROTATION_Y_ATTRIBUTE_UUID,
  REFERENCE_ROTATION_Z_ATTRIBUTE_UUID,
  REFERENCE_ROTATION_W_ATTRIBUTE_UUID,
  REFERENCE_SET_ROTATION_ATTRIBUTE_UUID,
  REFERENCE_SET_POSITION_ATTRIBUTE_UUID,
  AUGMENTATION_REFERENCE_ATTRIBUTE_UUID,
} from "@/constants";

/**
 * P12 tests for statechange-algorithms — the Statechange metamodel's two-way sync
 * between a Reference instance's pose ATTRIBUTES and its three.js object.
 *
 * Worth testing directly: `updateReferenceClassAttributeInstanceValues` is what the
 * ThreeCanvas 1 Hz heartbeat drives (the only writer of those attributes), and
 * `updateThreejsObject` carries a precedence bug that P13 has to rule on — pinning it
 * means a fix shows up here as a deliberate red rather than a surprise.
 *
 * global-definition is faked (WebGLRenderer at module scope — P3 note) but the scene is
 * a REAL THREE.Scene, so the pose reads/writes are real. gds fixtures are REAL via
 * fromJS, built from PLAIN json and read back out (P4's deep-copy trap).
 */

const scene = new THREE.Scene();

const fakeGlobal = vi.hoisted(() => ({
  globalObject: { scene: null as unknown as THREE.Scene, selectedTab: 0, tabContext: [] as unknown[] },
}));
vi.mock("@/engine/global-definition", () => fakeGlobal);

const mocks = vi.hoisted(() => ({
  instanceUtility: {
    getTabContextSceneInstance: vi.fn(async (): Promise<SceneInstance | undefined> => undefined),
    getAllOpenThreeScenes: vi.fn(async (): Promise<THREE.Scene[]> => []),
  },
}));
vi.mock("@/resources/services/instance-utility", () => ({ instanceUtility: mocks.instanceUtility }));

const { statechangeAlgorithms } = await import("@/engine/hybrid-algorithms/statechange-algorithms");

const REF_UUID = "11111111-1111-4111-8111-111111111111";
const TARGET_UUID = "22222222-2222-4222-8222-222222222222";

type Cell = { uuid: string; name: string; uuid_attribute: string; value: string };

function attr(uuid_attribute: string, value: string): Cell {
  return { uuid: `a-${uuid_attribute}`, name: "a", uuid_attribute, value };
}

/** A Reference class instance carrying the full pose attribute set. */
function referenceJson(over: { setPosition?: string; setRotation?: string; pose?: Partial<Record<string, string>> } = {}) {
  const pose = { px: "0", py: "0", pz: "0", rx: "0", ry: "0", rz: "0", rw: "1", ...over.pose };
  return {
    uuid: REF_UUID,
    name: "reference",
    uuid_class: REFERENCE_CLASS_UUID,
    attribute_instance: [
      attr(REFERENCE_POSITION_X_ATTRIBUTE_UUID, pose.px!),
      attr(REFERENCE_POSITION_Y_ATTRIBUTE_UUID, pose.py!),
      attr(REFERENCE_POSITION_Z_ATTRIBUTE_UUID, pose.pz!),
      attr(REFERENCE_ROTATION_X_ATTRIBUTE_UUID, pose.rx!),
      attr(REFERENCE_ROTATION_Y_ATTRIBUTE_UUID, pose.ry!),
      attr(REFERENCE_ROTATION_Z_ATTRIBUTE_UUID, pose.rz!),
      attr(REFERENCE_ROTATION_W_ATTRIBUTE_UUID, pose.rw!),
      attr(REFERENCE_SET_POSITION_ATTRIBUTE_UUID, over.setPosition ?? "true"),
      attr(REFERENCE_SET_ROTATION_ATTRIBUTE_UUID, over.setRotation ?? "true"),
    ],
  };
}

function openScene(classInstances: unknown[]): SceneInstance {
  const sceneInstance = SceneInstance.fromJS({
    uuid: "99999999-9999-4999-8999-999999999999",
    name: "statechange scene",
    uuid_scene_type: "st",
    class_instances: classInstances,
  }) as SceneInstance;
  fakeGlobal.globalObject.tabContext = [{}];
  mocks.instanceUtility.getTabContextSceneInstance.mockResolvedValue(sceneInstance);
  return sceneInstance;
}

/** The scene keys objects by INSTANCE uuid (insertObjectToScene does this). */
function meshFor(uuid: string) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  mesh.uuid = uuid;
  scene.add(mesh);
  return mesh;
}

const valueOf = (sceneInstance: SceneInstance, uuidAttribute: string) =>
  sceneInstance.class_instances[0].attribute_instance.find((a) => a.uuid_attribute === uuidAttribute)!.value;

describe("statechange-algorithms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scene.clear();
    fakeGlobal.globalObject.scene = scene;
    fakeGlobal.globalObject.tabContext = [];
    mocks.instanceUtility.getTabContextSceneInstance.mockResolvedValue(undefined);
  });

  describe("updateReferenceClassAttributeInstanceValues (the 1 Hz heartbeat's writer)", () => {
    it("reads the object's pose back into the attributes when both flags are on", async () => {
      const sceneInstance = openScene([referenceJson()]);
      const mesh = meshFor(REF_UUID);
      mesh.position.set(1, 2, 3);
      mesh.quaternion.set(0, 0, Math.sin(Math.PI / 4), Math.cos(Math.PI / 4));

      await statechangeAlgorithms.updateReferenceClassAttributeInstanceValues();

      // NOTE the values are written as raw NUMBERS into a string-typed gds field — the
      // old client did this and downstream code coerces. Ported byte-identically.
      expect(Number(valueOf(sceneInstance, REFERENCE_POSITION_X_ATTRIBUTE_UUID))).toBeCloseTo(1);
      expect(Number(valueOf(sceneInstance, REFERENCE_POSITION_Y_ATTRIBUTE_UUID))).toBeCloseTo(2);
      expect(Number(valueOf(sceneInstance, REFERENCE_POSITION_Z_ATTRIBUTE_UUID))).toBeCloseTo(3);
      expect(Number(valueOf(sceneInstance, REFERENCE_ROTATION_W_ATTRIBUTE_UUID))).toBeCloseTo(Math.cos(Math.PI / 4));
    });

    it("respects each flag independently", async () => {
      const sceneInstance = openScene([referenceJson({ setPosition: "false", setRotation: "true" })]);
      const mesh = meshFor(REF_UUID);
      mesh.position.set(9, 9, 9);
      mesh.quaternion.set(0, 0, 1, 0);

      await statechangeAlgorithms.updateReferenceClassAttributeInstanceValues();

      // Set Position off -> untouched; Set Rotation on -> written.
      expect(valueOf(sceneInstance, REFERENCE_POSITION_X_ATTRIBUTE_UUID)).toBe("0");
      expect(Number(valueOf(sceneInstance, REFERENCE_ROTATION_Z_ATTRIBUTE_UUID))).toBeCloseTo(1);
    });

    it("ignores non-Reference instances and instances with no object in the scene", async () => {
      const sceneInstance = openScene([
        referenceJson(),
        { uuid: "other", name: "x", uuid_class: "not-a-reference", attribute_instance: [] },
      ]);
      // No mesh added for REF_UUID.

      await expect(statechangeAlgorithms.updateReferenceClassAttributeInstanceValues()).resolves.toBeUndefined();
      expect(valueOf(sceneInstance, REFERENCE_POSITION_X_ATTRIBUTE_UUID)).toBe("0");
    });

    it("does nothing when no tab is open", async () => {
      await expect(statechangeAlgorithms.updateReferenceClassAttributeInstanceValues()).resolves.toBeUndefined();
    });
  });

  describe("updateThreejsObject (attributes -> object)", () => {
    it("pushes the attribute pose onto the object when both flags are on", async () => {
      const sceneInstance = openScene([
        referenceJson({ pose: { px: "5", py: "6", pz: "7", rz: String(Math.sin(Math.PI / 4)), rw: String(Math.cos(Math.PI / 4)) } }),
      ]);
      const mesh = meshFor(REF_UUID);

      await statechangeAlgorithms.updateThreejsObject(sceneInstance.class_instances[0]);

      expect(mesh.position.x).toBeCloseTo(5);
      expect(mesh.position.y).toBeCloseTo(6);
      expect(mesh.position.z).toBeCloseTo(7);
      expect(mesh.quaternion.w).toBeCloseTo(Math.cos(Math.PI / 4));
    });

    it("leaves the position alone when Set Position is off", async () => {
      const sceneInstance = openScene([referenceJson({ setPosition: "false", pose: { px: "5" } })]);
      const mesh = meshFor(REF_UUID);

      await statechangeAlgorithms.updateThreejsObject(sceneInstance.class_instances[0]);

      expect(mesh.position.x).toBe(0);
    });

    it("does not throw for a Reference that has no object in the scene", async () => {
      const sceneInstance = openScene([referenceJson()]);
      // No mesh: the original dereferences referenceObject unguarded and throws here.
      await expect(statechangeAlgorithms.updateThreejsObject(sceneInstance.class_instances[0])).resolves.toBeUndefined();
    });

    // PINS THE PRECEDENCE BUG (state.json -> known_issues, for P13). The original reads
    // `setRotation == 'true' && q.x != qx || q.y != qy || q.z != qz || q.w != qw`, and &&
    // binds tighter than ||, so the flag gates ONLY the x comparison. A Reference whose
    // y/z/w differ is therefore rotated even with Set Rotation OFF — unlike the position
    // block, which honours its flag on every axis. If P13 fixes it, THIS test goes red:
    // that is the point.
    it("rotates even with Set Rotation off, when a non-x component differs (ported bug)", async () => {
      const sceneInstance = openScene([
        referenceJson({ setRotation: "false", pose: { rz: String(Math.sin(Math.PI / 4)), rw: String(Math.cos(Math.PI / 4)) } }),
      ]);
      const mesh = meshFor(REF_UUID);

      await statechangeAlgorithms.updateThreejsObject(sceneInstance.class_instances[0]);

      // Faithful-but-wrong: the flag is off, yet the object was re-rotated.
      expect(mesh.quaternion.z).toBeCloseTo(Math.sin(Math.PI / 4));
    });
  });

  describe("checkForReference (adopt the referenced object's mesh)", () => {
    it("copies the referenced object's geometry and material onto the Reference's object", async () => {
      const sceneInstance = openScene([
        {
          ...referenceJson(),
          attribute_instance: [
            {
              uuid: "aug",
              name: "Augmentation_Reference",
              uuid_attribute: AUGMENTATION_REFERENCE_ATTRIBUTE_UUID,
              value: "Some Target",
              role_instance_from: {
                uuid: "role-1",
                uuid_has_reference_class_instance: TARGET_UUID,
              },
            },
          ],
        },
      ]);
      const referenceMesh = meshFor(REF_UUID);
      // The target lives in ANOTHER open scene — that is why getAllOpenThreeScenes exists.
      const otherScene = new THREE.Scene();
      const targetMesh = new THREE.Mesh(new THREE.SphereGeometry(2), new THREE.MeshBasicMaterial({ color: "red" }));
      targetMesh.uuid = TARGET_UUID;
      otherScene.add(targetMesh);
      mocks.instanceUtility.getAllOpenThreeScenes.mockResolvedValue([otherScene]);

      await statechangeAlgorithms.checkForReference();

      expect(referenceMesh.geometry).toBe(targetMesh.geometry);
      expect(referenceMesh.material).toBe(targetMesh.material);
      expect(sceneInstance.class_instances[0].uuid).toBe(REF_UUID);
    });

    it("does nothing when the reference has no role instance or an empty value", async () => {
      openScene([
        {
          ...referenceJson(),
          attribute_instance: [
            { uuid: "aug", name: "Augmentation_Reference", uuid_attribute: AUGMENTATION_REFERENCE_ATTRIBUTE_UUID, value: "" },
          ],
        },
      ]);
      const referenceMesh = meshFor(REF_UUID);
      const originalGeometry = referenceMesh.geometry;

      await statechangeAlgorithms.checkForReference();

      expect(referenceMesh.geometry).toBe(originalGeometry);
      expect(mocks.instanceUtility.getAllOpenThreeScenes).not.toHaveBeenCalled();
    });
  });
});
