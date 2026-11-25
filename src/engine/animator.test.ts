import { describe, it, expect, beforeEach, vi } from "vitest";
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { SceneInstance } from "@gds";

/**
 * Tests for the animator's line-routing pass.
 *
 * `setPos` runs for EVERY relation line on every frame in which anything in the scene
 * moved, so it carries two caches that exist purely to keep that affordable: the
 * per-frame uuid -> mesh index that replaced a full `scene.traverse` per line, and the
 * `userData.linePositions` snapshot that skips the geometry rebuild when a line's route
 * came out the same as last frame. Both are invisible when they work and produce lines
 * pointing at the wrong place when they do not, which is what these tests pin down.
 *
 * global-definition is faked (importing it for real builds a WebGLRenderer at module
 * scope); the gds scene is real, built via fromJS.
 */

const fakeGlobal = vi.hoisted(() => ({
  globalObject: {
    scene: null as unknown as THREE.Scene,
    dragObjects: [] as THREE.Mesh[],
    updateLinesArray: [] as Line2[],
    tabContext: [] as unknown[],
    selectedTab: 0,
    raycasterBetweenObjects: null as unknown as THREE.Raycaster,
  },
}));
vi.mock("@/engine/global-definition", () => fakeGlobal);
vi.mock("@/resources/collaboration/shared-doc-service", () => ({ sharedDocService: { forTab: () => null } }));
vi.mock("@/resources/collaboration/y-mapping", () => ({ applyLocalChangeToYDoc: vi.fn() }));
vi.mock("@/resources/store/logStore", () => ({ useLogStore: { getState: () => ({ log: vi.fn() }) } }));

const { animator } = await import("@/engine/animator");
const g = fakeGlobal.globalObject;

const CLASS_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLASS_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const RELATION = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function makeMesh(uuid: string, x: number, y: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
  mesh.uuid = uuid;
  mesh.position.set(x, y, 0);
  mesh.userData.boxParameter = { x: 2, y: 2, z: 2 };
  return mesh;
}

let line: Line2;
let meshA: THREE.Mesh;
let meshB: THREE.Mesh;

beforeEach(() => {
  g.scene = new THREE.Scene();
  g.raycasterBetweenObjects = new THREE.Raycaster();

  meshA = makeMesh(CLASS_A, 0, 0);
  meshB = makeMesh(CLASS_B, 20, 0);
  g.scene.add(meshA, meshB);

  const geometry = new LineGeometry();
  geometry.setPositions([0, 0, 0, 1, 1, 0]);
  line = new Line2(geometry, new LineMaterial({ linewidth: 1 }));
  line.uuid = RELATION;
  const endFrom = makeMesh("end-from", 0, 0);
  const endTo = makeMesh("end-to", 0, 0);
  line.add(endFrom, endTo);
  line.userData.relObj = [meshA, meshB];
  line.userData.midPoint = new THREE.Vector3();
  g.scene.add(line);

  const sceneInstance = SceneInstance.fromJS({
    uuid: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    name: "scene",
    uuid_scene_type: "99999999-9999-4999-8999-999999999999",
    class_instances: [],
    relationclasses_instances: [],
    port_instances: [],
    attribute_instances: [],
  }) as SceneInstance;
  // line_points is the routing input `setPos` reads; fromJS does not revive it.
  (sceneInstance.relationclasses_instances as unknown[]).push({
    uuid: RELATION,
    line_points: [
      { UUID: CLASS_A, Point: { x: 0, y: 0, z: 0 } },
      { UUID: CLASS_B, Point: { x: 20, y: 0, z: 0 } },
    ],
  });

  g.dragObjects = [meshA, meshB];
  g.updateLinesArray = [line];
  g.tabContext = [{ sceneInstance, threeScene: g.scene, contextDragObjects: g.dragObjects, isShared: false }];
});

describe("Animator.setPos routing", () => {
  it("routes the line between the two end objects", async () => {
    await animator.setPos(line);

    const positions = line.userData.linePositions as number[];
    expect(positions).toHaveLength(6);
    // Trimmed back to the surfaces, so the route stays strictly between the two centres.
    expect(positions[0]).toBeGreaterThan(0);
    expect(positions[3]).toBeLessThan(20);
    expect(positions[0]).toBeLessThan(positions[3]);
  });

  it("resolves end objects through the per-frame index exactly as a scene walk does", async () => {
    await animator.setPos(line);
    const withoutIndex = (line.userData.linePositions as number[]).slice();

    // Same frame, same scene — going through the index must produce the same route as
    // the standalone fallback path above.
    line.userData.linePositions = undefined;
    (animator as unknown as { buildFrameIndexes(): void }).buildFrameIndexes();
    await animator.setPos(line);
    (animator as unknown as { clearFrameIndexes(): void }).clearFrameIndexes();

    expect(line.userData.linePositions).toEqual(withoutIndex);
  });

  it("does not rebuild the geometry when nothing moved", async () => {
    await animator.setPos(line);
    const geometry = line.geometry;

    await animator.setPos(line);

    expect(line.geometry).toBe(geometry);
  });

  it("rebuilds the geometry when an end object moves", async () => {
    await animator.setPos(line);
    const geometry = line.geometry;

    meshB.position.x = 30;
    await animator.setPos(line);

    expect(line.geometry).not.toBe(geometry);
    expect((line.userData.linePositions as number[])[3]).toBeGreaterThan(20);
  });

  it("keeps the line unscaled even on a frame that skips the rebuild", async () => {
    await animator.setPos(line);
    const geometry = line.geometry;

    // A line is selectable, so the scale gizmo can leave a scale on it. The geometry
    // holds world-space points, so that scale has to be cleared whether or not the
    // route itself changed.
    line.scale.set(3, 3, 3);
    await animator.setPos(line);

    expect(line.geometry).toBe(geometry);
    expect(line.scale.toArray()).toEqual([1, 1, 1]);
  });
});
