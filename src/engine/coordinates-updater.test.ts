import { describe, it, expect, beforeEach, vi } from "vitest";
import * as THREE from "three";
import { ClassInstance, SceneInstance } from "@gds";

/**
 * Tests for the coordinates-updater — the animator calls it every frame an
 * object's transform changes, and it is the only thing that writes three.js
 * transforms back onto the gds instance graph that auto-save then PATCHes. If it
 * silently no-ops, edits look fine on screen and are lost on reload, so the
 * write-back is worth asserting directly.
 *
 * global-definition is faked (importing it for real builds a WebGLRenderer at module
 * scope); gds fixtures are REAL (built via fromJS). Node env: THREE is only used for
 * meshes, never a renderer.
 */

const fakeGlobal = vi.hoisted(() => ({
  globalObject: {
    dragObjects: [] as THREE.Mesh[],
    selectedTab: 0,
    doSceneInstancePatchLocal: false,
    // The shared session is reached through this back-reference (see
    // collaboration/local-change-publisher); it is wired to the mock below.
    sharedDocServiceRef: null as null | { forTab: (tabIndex: number) => unknown },
  },
}));
vi.mock("@/engine/global-definition", () => fakeGlobal);

const utils = vi.hoisted(() => ({
  instanceUtility: {
    getTabContextSceneInstance: vi.fn(),
    getAllPortInstancesOfTabContext: vi.fn(async () => [] as unknown[]),
  },
  // Mocked so the tests can assert the exact change payloads without a Y.Doc or a socket.
  sharedDocService: {
    forTab: vi.fn((_tabIndex: number) => null as null | { ydoc: unknown; localOrigin: object; applyingRemote: boolean }),
  },
  applyLocalChangeToYDoc: vi.fn(),
}));
vi.mock("@/resources/services/instance-utility", () => ({ instanceUtility: utils.instanceUtility }));
vi.mock("@/resources/collaboration/shared-doc-service", () => ({ sharedDocService: utils.sharedDocService }));
vi.mock("@/resources/collaboration/y-mapping", () => ({ applyLocalChangeToYDoc: utils.applyLocalChangeToYDoc }));
fakeGlobal.globalObject.sharedDocServiceRef = utils.sharedDocService;

const { coordinatesUpdater } = await import("@/engine/coordinates-updater");

const INSTANCE_UUID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

const classInstanceJson = (custom_variables: Record<string, unknown> = {}) => ({
  uuid: INSTANCE_UUID,
  name: "moved-instance",
  uuid_class: "88888888-8888-4888-8888-888888888888",
  coordinates_2d: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
  custom_variables,
  attribute_instances: [],
  port_instances: [],
});

/**
 * Builds the scene from PLAIN json and hands back the revived class instance the
 * scene actually holds. Reviving pre-built ClassInstance objects through
 * SceneInstance.fromJS would deep-COPY them, so the updater would mutate the
 * scene's copy while the test asserted on the original and saw nothing change.
 */
function makeScene(custom_variables: Record<string, unknown> = {}): { sceneInstance: SceneInstance; classInstance: ClassInstance } {
  const sceneInstance = SceneInstance.fromJS({
    uuid: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    name: "scene",
    uuid_scene_type: "99999999-9999-4999-8999-999999999999",
    class_instances: [classInstanceJson(custom_variables)],
    relationclasses_instances: [],
    port_instances: [],
    attribute_instances: [],
  }) as SceneInstance;
  return { sceneInstance, classInstance: sceneInstance.class_instances[0] };
}

/** A mesh standing in for the drawn instance: three.js uuid == gds instance uuid. */
function makeMesh(): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  mesh.uuid = INSTANCE_UUID;
  return mesh;
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeGlobal.globalObject.dragObjects = [];
  fakeGlobal.globalObject.doSceneInstancePatchLocal = false;
  utils.instanceUtility.getAllPortInstancesOfTabContext.mockResolvedValue([]);
  // Default: the tab is not shared (clearAllMocks drops the implementation).
  utils.sharedDocService.forTab.mockReturnValue(null);
});

describe("updateCoordinates2DonClassAndPortInstance", () => {
  it("writes a moved mesh's position back onto its class instance", async () => {
    const { sceneInstance, classInstance } = makeScene();
    const mesh = makeMesh();
    mesh.position.set(1.5, -2.25, 3);
    fakeGlobal.globalObject.dragObjects = [mesh];
    utils.instanceUtility.getTabContextSceneInstance.mockResolvedValue(sceneInstance);

    await coordinatesUpdater.updateCoordinates2DonClassAndPortInstance();

    expect(classInstance.coordinates_2d.x).toBe(1.5);
    expect(classInstance.coordinates_2d.y).toBe(-2.25);
    expect(classInstance.coordinates_2d.z).toBe(3);
  });

  it("rounds the mesh position (100ths) before storing it", async () => {
    const { sceneInstance, classInstance } = makeScene();
    const mesh = makeMesh();
    mesh.position.set(1.23456, 0, 0);
    fakeGlobal.globalObject.dragObjects = [mesh];
    utils.instanceUtility.getTabContextSceneInstance.mockResolvedValue(sceneInstance);

    await coordinatesUpdater.updateCoordinates2DonClassAndPortInstance();

    expect(classInstance.coordinates_2d.x).toBe(1.23);
  });

  it("writes back a moved child mesh (e.g. a port on its parent class)", async () => {
    const { sceneInstance, classInstance: childInstance } = makeScene();
    const parent = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    parent.uuid = "77777777-7777-4777-8777-777777777777";
    const child = makeMesh();
    child.position.set(0.5, 0.5, 0);
    parent.add(child);
    fakeGlobal.globalObject.dragObjects = [parent];
    utils.instanceUtility.getTabContextSceneInstance.mockResolvedValue(sceneInstance);

    await coordinatesUpdater.updateCoordinates2DonClassAndPortInstance();

    expect(childInstance.coordinates_2d.x).toBe(0.5);
    expect(childInstance.coordinates_2d.y).toBe(0.5);
  });

  it("ignores meshes that have no matching instance", async () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.position.set(5, 5, 5);
    fakeGlobal.globalObject.dragObjects = [mesh];
    const { sceneInstance, classInstance } = makeScene();
    utils.instanceUtility.getTabContextSceneInstance.mockResolvedValue(sceneInstance);

    await expect(coordinatesUpdater.updateCoordinates2DonClassAndPortInstance()).resolves.not.toThrow();
    expect(classInstance.coordinates_2d.x).toBe(0);
  });
});

describe("updateRotationOnClassAndPortInstance", () => {
  it("writes a rotated mesh's quaternion back onto its class instance", async () => {
    const { sceneInstance, classInstance } = makeScene();
    const mesh = makeMesh();
    mesh.quaternion.set(0, 0.7071, 0, 0.7071);
    fakeGlobal.globalObject.dragObjects = [mesh];
    utils.instanceUtility.getTabContextSceneInstance.mockResolvedValue(sceneInstance);

    await coordinatesUpdater.updateRotationOnClassAndPortInstance();

    expect(classInstance.rotation.y).toBeCloseTo(0.7071);
    expect(classInstance.rotation.w).toBeCloseTo(0.7071);
  });
});

describe("updateScaleOnClassAndPortInstance", () => {
  it("stores a non-identity scale as a plain copy, not a live Vector3 alias", async () => {
    const { sceneInstance, classInstance } = makeScene();
    const mesh = makeMesh();
    mesh.scale.set(2, 2, 2);
    fakeGlobal.globalObject.dragObjects = [mesh];
    utils.instanceUtility.getTabContextSceneInstance.mockResolvedValue(sceneInstance);

    await coordinatesUpdater.updateScaleOnClassAndPortInstance();

    const stored = (classInstance.custom_variables as Record<string, THREE.Vector3>).scale;
    expect(stored).toEqual({ x: 2, y: 2, z: 2 });
    // Aliasing mesh.scale would make every later comparison a false negative.
    expect(stored).not.toBe(mesh.scale);
  });

  it("does not store an identity scale when there is no prior value", async () => {
    const { sceneInstance, classInstance } = makeScene();
    const mesh = makeMesh();
    fakeGlobal.globalObject.dragObjects = [mesh];
    utils.instanceUtility.getTabContextSceneInstance.mockResolvedValue(sceneInstance);

    await coordinatesUpdater.updateScaleOnClassAndPortInstance();

    expect(classInstance.custom_variables).not.toHaveProperty("scale");
  });

  it("updates a scale that changed away from its stored prior", async () => {
    const { sceneInstance, classInstance } = makeScene({ scale: { x: 2, y: 2, z: 2 } });
    const mesh = makeMesh();
    mesh.scale.set(3, 3, 3);
    fakeGlobal.globalObject.dragObjects = [mesh];
    utils.instanceUtility.getTabContextSceneInstance.mockResolvedValue(sceneInstance);

    await coordinatesUpdater.updateScaleOnClassAndPortInstance();

    expect((classInstance.custom_variables as Record<string, THREE.Vector3>).scale).toEqual({ x: 3, y: 3, z: 3 });
  });
});

// --- Collaboration propagation, driven through the public updaters ---------------

describe("Yjs propagation (shared scenes)", () => {
  const session = { ydoc: { fake: "ydoc" }, localOrigin: {}, applyingRemote: false };

  /** Move a mesh and run the given updater with the tab shared. */
  async function runShared(run: () => Promise<void>, prepare: (mesh: THREE.Mesh) => void, custom_variables = {}) {
    const { sceneInstance } = makeScene(custom_variables);
    const mesh = makeMesh();
    prepare(mesh);
    fakeGlobal.globalObject.dragObjects = [mesh];
    utils.instanceUtility.getTabContextSceneInstance.mockResolvedValue(sceneInstance);
    utils.sharedDocService.forTab.mockReturnValue(session);
    await run();
  }

  it("pushes a coordinates change and marks the scene locally dirty", async () => {
    await runShared(
      () => coordinatesUpdater.updateCoordinates2DonClassAndPortInstance(),
      (mesh) => mesh.position.set(1, 2, 3),
    );

    expect(utils.applyLocalChangeToYDoc).toHaveBeenCalledWith(
      session.ydoc,
      { type: "coordinates", classInstanceUuid: INSTANCE_UUID, x: 1, y: 2, z: 3 },
      session.localOrigin,
    );
    // AutoSave's shared branch keys off this flag (NOT doSceneInstancePatch).
    expect(fakeGlobal.globalObject.doSceneInstancePatchLocal).toBe(true);
  });

  /**
   * The delta must name ONLY the axes that moved. Each axis is its own Y.Map key, so an
   * omitted axis is one a peer's concurrent drag can still win; publishing our stale
   * value for it makes every key concurrent and collapses the merge back into
   * whole-position last-writer-wins. The fixture starts at the origin, so moving x
   * alone must produce a delta with no y and no z.
   */
  it("names only the axes that actually moved, so a peer keeps the others", async () => {
    await runShared(
      () => coordinatesUpdater.updateCoordinates2DonClassAndPortInstance(),
      (mesh) => mesh.position.set(1, 0, 0),
    );

    expect(utils.applyLocalChangeToYDoc).toHaveBeenCalledWith(session.ydoc, { type: "coordinates", classInstanceUuid: INSTANCE_UUID, x: 1 }, session.localOrigin);
  });

  it("pushes a rotation change", async () => {
    await runShared(
      () => coordinatesUpdater.updateRotationOnClassAndPortInstance(),
      (mesh) => mesh.quaternion.set(0, 0, 1, 0),
    );

    expect(utils.applyLocalChangeToYDoc).toHaveBeenCalledWith(
      session.ydoc,
      { type: "rotation", classInstanceUuid: INSTANCE_UUID, x: 0, y: 0, z: 1, w: 0 },
      session.localOrigin,
    );
  });

  it("pushes a scale change", async () => {
    await runShared(
      () => coordinatesUpdater.updateScaleOnClassAndPortInstance(),
      (mesh) => mesh.scale.set(3, 3, 3),
      { scale: { x: 2, y: 2, z: 2 } },
    );

    expect(utils.applyLocalChangeToYDoc).toHaveBeenCalledWith(
      session.ydoc,
      { type: "scale", classInstanceUuid: INSTANCE_UUID, x: 3, y: 3, z: 3 },
      session.localOrigin,
    );
  });

  it("writes nothing to the YDoc when the tab is not shared", async () => {
    const { sceneInstance } = makeScene();
    const mesh = makeMesh();
    mesh.position.set(1, 2, 3);
    fakeGlobal.globalObject.dragObjects = [mesh];
    utils.instanceUtility.getTabContextSceneInstance.mockResolvedValue(sceneInstance);

    await coordinatesUpdater.updateCoordinates2DonClassAndPortInstance();

    expect(utils.applyLocalChangeToYDoc).not.toHaveBeenCalled();
    expect(fakeGlobal.globalObject.doSceneInstancePatchLocal).toBe(false);
  });

  it("does not echo a change back while a remote update is being applied", async () => {
    utils.sharedDocService.forTab.mockReturnValue({ ...session, applyingRemote: true });
    const { sceneInstance } = makeScene();
    const mesh = makeMesh();
    mesh.position.set(1, 2, 3);
    fakeGlobal.globalObject.dragObjects = [mesh];
    utils.instanceUtility.getTabContextSceneInstance.mockResolvedValue(sceneInstance);

    await coordinatesUpdater.updateCoordinates2DonClassAndPortInstance();

    expect(utils.applyLocalChangeToYDoc).not.toHaveBeenCalled();
    expect(fakeGlobal.globalObject.doSceneInstancePatchLocal).toBe(false);
  });
});
