// @vitest-environment jsdom
//
// Regression tests for the transform-gizmo mouse-up handler. global-definition builds a
// THREE.WebGLRenderer at module scope (needs a GL canvas), so it is replaced with a
// light fake carrying only the fields this handler touches; THREE itself stays REAL.
import { describe, it, expect, beforeEach, vi } from "vitest";
import * as THREE from "three";
import { SceneInstance } from "@gds";

const fakeGlobalObject = vi.hoisted(() => ({
  transformControls: undefined as any,
  scene: undefined as unknown as THREE.Scene,
  boxHelper: undefined as unknown as THREE.BoxHelper,
  sharedDocServiceRef: undefined as any,
  doSceneInstancePatchLocal: false,
  selectedTab: 0,
  tabContext: [] as any[],
  render: false,
}));

vi.mock("@/engine/global-definition", () => ({ globalObject: fakeGlobalObject }));
vi.mock("@/resources/services/instance-utility", () => ({
  instanceUtility: {
    getTabContextSceneInstance: vi.fn(async () => SceneInstance.fromJS({ uuid: "s-1", class_instances: [], relationclasses_instances: [] })),
    getAllPortInstancesOfTabContext: vi.fn(async () => []),
  },
}));
const publisher = vi.hoisted(() => ({ publishLocalChange: vi.fn(() => true) }));
vi.mock("@/resources/collaboration/local-change-publisher", () => publisher);

import { transformControlsEvents } from "./transform-control-events";
import { eventBus } from "@/resources/services/event-bus";
import { instanceUtility } from "@/resources/services/instance-utility";

/**
 * Stands in for TransformControls. `object` and `mode` are all the handler needs for
 * the scale / rotate paths; a translate drag also reads the live-drag fields the
 * reconciler inspects (`axis`, `dragging`, `space`).
 */
function fakeControls(object: THREE.Object3D | undefined, mode: string, drag: Record<string, unknown> = {}) {
  return { object, mode, axis: null, dragging: false, space: "world", ...drag };
}

beforeEach(() => {
  vi.clearAllMocks();
  publisher.publishLocalChange.mockReturnValue(true);
  fakeGlobalObject.scene = new THREE.Scene();
  fakeGlobalObject.render = false;
  fakeGlobalObject.doSceneInstancePatchLocal = false;
});

describe("onTransformControlsMouseUp", () => {
  /**
   * The reported crash: the listener is registered per TransformControls instance but
   * the handler resolves the controls through globalObject, so a mouseUp dispatched by
   * a leaked instance is read against the current, EMPTY one. Its default mode is
   * "scale" — the branch that dereferences `object.userData`.
   */
  it("does not throw when the mouseUp arrives with nothing attached in scale mode", async () => {
    fakeGlobalObject.transformControls = fakeControls(undefined, "scale");
    await expect(transformControlsEvents.onTransformControlsMouseUp()).resolves.toBeUndefined();
  });

  it("does not throw with nothing attached in translate or rotate mode either", async () => {
    for (const mode of ["translate", "rotate"]) {
      fakeGlobalObject.transformControls = fakeControls(undefined, mode);
      await expect(transformControlsEvents.onTransformControlsMouseUp()).resolves.toBeUndefined();
    }
  });

  it("does not throw when the controls themselves are gone", async () => {
    fakeGlobalObject.transformControls = undefined;
    await expect(transformControlsEvents.onTransformControlsMouseUp()).resolves.toBeUndefined();
  });

  it("records NO undo step for a mouseUp with nothing attached", async () => {
    const recorded: unknown[] = [];
    const sub = eventBus.subscribe("historyRecord", (p) => recorded.push(p));
    fakeGlobalObject.transformControls = fakeControls(undefined, "scale");

    await transformControlsEvents.onTransformControlsMouseUp();
    sub.dispose();

    // There was no drag, so an undo step here would be a phantom one.
    expect(recorded).toEqual([]);
  });

  it("still handles a real completed scale drag", async () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    mesh.scale.set(3, 3, 3);
    const child = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    mesh.add(child);
    fakeGlobalObject.transformControls = fakeControls(mesh, "scale");
    const recorded: any[] = [];
    const sub = eventBus.subscribe("historyRecord", (p) => recorded.push(p));

    await transformControlsEvents.onTransformControlsMouseUp();
    sub.dispose();

    expect(mesh.userData.custom_variables.scale).toBe(mesh.scale);
    // Children are counter-scaled so their absolute size is unchanged.
    expect(child.scale.x).toBeCloseTo(1 / 3);
    expect(recorded[0].label).toBe("scale");
    expect(fakeGlobalObject.render).toBe(true);
  });
});

/**
 * The window this closes: a peer's write to an axis the local user is HOLDING is folded
 * onto the gds instance but deliberately not onto the mesh (see the coordinates branch
 * in y-mapping), and the animator republishes our value on the next frame the mesh
 * moves. A drag held perfectly still never produces such a frame, so without one write
 * at mouse-up the peer's value would survive on an axis we were holding — the object
 * drawn where we put it, stored where they put it.
 */
describe("re-asserting the dragged axes at mouse-up", () => {
  const INSTANCE_UUID = "ci-drag-1";

  /** A scene holding one class instance whose uuid matches the dragged mesh. */
  function sceneWithInstance() {
    return SceneInstance.fromJS({
      uuid: "s-1",
      class_instances: [
        {
          uuid: INSTANCE_UUID,
          uuid_class: "class-1",
          name: "dragged",
          coordinates_2d: { x: 0, y: 7, z: 0 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          custom_variables: {},
          attribute_instance: [],
        },
      ],
      relationclasses_instances: [],
    }) as SceneInstance;
  }

  function draggedMesh() {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    Object.defineProperty(mesh, "uuid", { value: INSTANCE_UUID });
    mesh.position.set(42, 99, 5);
    return mesh;
  }

  it("publishes only the axes the gizmo owned, and writes them onto the instance", async () => {
    const scene = sceneWithInstance();
    vi.mocked(instanceUtility.getTabContextSceneInstance).mockResolvedValue(scene);
    const mesh = draggedMesh();
    fakeGlobalObject.transformControls = fakeControls(mesh, "translate", { axis: "X", dragging: true });

    await transformControlsEvents.onTransformControlsMouseUp();

    expect(publisher.publishLocalChange).toHaveBeenCalledWith({ type: "coordinates", classInstanceUuid: INSTANCE_UUID, x: 42 });
    const ci = scene.class_instances[0];
    expect(ci.coordinates_2d.x).toBe(42);
    // y was the peer's axis: left exactly as the merge left it, not overwritten with 99.
    expect(ci.coordinates_2d.y).toBe(7);
    expect(fakeGlobalObject.doSceneInstancePatchLocal).toBe(true);
  });

  it("covers every axis of a plane handle", async () => {
    vi.mocked(instanceUtility.getTabContextSceneInstance).mockResolvedValue(sceneWithInstance());
    fakeGlobalObject.transformControls = fakeControls(draggedMesh(), "translate", { axis: "XZ", dragging: true });

    await transformControlsEvents.onTransformControlsMouseUp();

    expect(publisher.publishLocalChange).toHaveBeenCalledWith({ type: "coordinates", classInstanceUuid: INSTANCE_UUID, x: 42, z: 5 });
  });

  it("publishes nothing when the translate mouseUp follows no drag", async () => {
    vi.mocked(instanceUtility.getTabContextSceneInstance).mockResolvedValue(sceneWithInstance());
    fakeGlobalObject.transformControls = fakeControls(draggedMesh(), "translate", { axis: null, dragging: false });

    await transformControlsEvents.onTransformControlsMouseUp();

    expect(publisher.publishLocalChange).not.toHaveBeenCalled();
  });

  /**
   * three's `pointerUp` dispatches mouseUp and only THEN clears `dragging` / `axis`, so
   * the handler has to read them before its first await. Simulating the reset at that
   * exact point is what catches a read that drifted after one.
   */
  it("reads the drag axes before the first await, while three still exposes them", async () => {
    vi.mocked(instanceUtility.getTabContextSceneInstance).mockImplementation(async () => {
      // three has moved on by the time this resolves.
      fakeGlobalObject.transformControls.dragging = false;
      fakeGlobalObject.transformControls.axis = null;
      return sceneWithInstance();
    });
    fakeGlobalObject.transformControls = fakeControls(draggedMesh(), "translate", { axis: "X", dragging: true });

    await transformControlsEvents.onTransformControlsMouseUp();

    expect(publisher.publishLocalChange).toHaveBeenCalledWith({ type: "coordinates", classInstanceUuid: INSTANCE_UUID, x: 42 });
  });
});
