// @vitest-environment jsdom
//
// Regression tests for RayHelper.shootRayFromObject — the animator calls it twice per
// relation per frame to find where the line meets each end object, and a relation stops
// following a dragged object the moment it returns undefined ("line not updated: an end
// point of the relation could not be resolved" in the log window).
//
// global-definition builds a THREE.WebGLRenderer at module scope, so it is replaced with
// a light fake carrying only the fields RayHelper touches. THREE itself stays REAL —
// Mesh / Raycaster / geometry work under jsdom without WebGL.
import { describe, it, expect, beforeEach, vi } from "vitest";
import * as THREE from "three";

const fakeGlobalObject = vi.hoisted(() => ({
  raycasterBetweenObjects: undefined as unknown as THREE.Raycaster,
  camera: undefined as unknown as THREE.Camera,
  selectedTab: 0,
  sharedDocServiceRef: null as unknown,
  localZPlane: 0,
  dragObjects: [] as THREE.Object3D[],
}));

vi.mock("@/engine/global-definition", () => ({ globalObject: fakeGlobalObject }));

import { rayHelper } from "./ray-helper";

beforeEach(() => {
  fakeGlobalObject.raycasterBetweenObjects = new THREE.Raycaster();
  fakeGlobalObject.camera = new THREE.PerspectiveCamera();
});

/** A unit cube mesh at `pos`, world matrix current, matching how the engine inserts vizReps. */
function cubeAt(x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  mesh.position.set(x, y, z);
  mesh.updateMatrixWorld(true);
  return mesh;
}

describe("RayHelper.shootRayFromObject", () => {
  it("returns undefined when an end object is missing (relation outlived its endpoint)", () => {
    expect(rayHelper.shootRayFromObject(undefined, cubeAt(0, 0, 0))).toBeUndefined();
    expect(rayHelper.shootRayFromObject(cubeAt(0, 0, 0), undefined)).toBeUndefined();
  });

  it("returns the surface point facing the other object for separated objects", () => {
    const point = rayHelper.shootRayFromObject(cubeAt(0, 0, 0), cubeAt(10, 0, 0));
    expect(point).toBeDefined();
    // Near face of a unit cube centred at x=10 is x=9.5.
    expect(point!.x).toBeCloseTo(9.5, 3);
    expect(point!.y).toBeCloseTo(0, 3);
  });

  it("still resolves a point when the two objects overlap during a drag", () => {
    // fromObject sitting on top of toObject used to leave the ray origin inside a
    // single-sided mesh -> no hit -> undefined -> the line froze.
    const point = rayHelper.shootRayFromObject(cubeAt(0, 0, 0), cubeAt(0.2, 0, 0));
    expect(point).toBeDefined();
    expect(Number.isNaN(point!.x)).toBe(false);
  });

  it("resolves a point when the target geometry sits off its object origin", () => {
    // mergeOjects() bakes sub-shape transforms into the geometry, so a vizRep can end up
    // with geometry nowhere near (0,0,0); a ray aimed at the object origin grazed past it.
    const geometry = new THREE.BoxGeometry(1, 1, 1).translate(5, 0, 0);
    const offOrigin = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    offOrigin.position.set(10, 0, 0); // geometry actually lives around x=15
    offOrigin.updateMatrixWorld(true);

    const point = rayHelper.shootRayFromObject(cubeAt(0, 0, 0), offOrigin);
    expect(point).toBeDefined();
    expect(point!.x).toBeCloseTo(14.5, 3);
  });

  it("meets the silhouette, not the centre, of a BACK-SIDE-only vizRep (hollow shell)", () => {
    // graphic_sphere with material.side = THREE.BackSide: the raycaster skips the near
    // wall, so the endpoint used to fall through to the far wall / object centre.
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 16), new THREE.MeshBasicMaterial());
    shell.material.side = THREE.BackSide;
    shell.position.set(10, 0, 0);
    shell.updateMatrixWorld(true);

    const point = rayHelper.shootRayFromObject(cubeAt(0, 0, 0), shell);
    expect(point).toBeDefined();
    // Near rim of a r=0.6 sphere centred at x=10, i.e. x≈9.4 — not x≈10 (centre).
    expect(point!.x).toBeCloseTo(9.4, 1);
    // material.side is left as the caller set it.
    expect(shell.material.side).toBe(THREE.BackSide);
  });

  it("restores a material the target uses more than once to its own side", () => {
    // mergeOjects() hands a merged vizRep a material ARRAY, which repeats any material its
    // sub-shapes share. Restoring per occurrence put the second visit's DoubleSide back.
    const shared = new THREE.MeshBasicMaterial({ side: THREE.BackSide });
    const target = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), [shared, shared, shared, shared, shared, shared]);
    target.position.set(10, 0, 0);
    target.updateMatrixWorld(true);

    const point = rayHelper.shootRayFromObject(cubeAt(0, 0, 0), target);

    expect(point!.x).toBeCloseTo(9.5, 3);
    expect(shared.side).toBe(THREE.BackSide);
  });

  it("returns a point that a later cast does not overwrite", () => {
    // The animator keeps the start point while it casts for the end point.
    const start = rayHelper.shootRayFromObject(cubeAt(0, 0, 0), cubeAt(10, 0, 0));
    const empty = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    empty.position.set(0, 4, 0);
    empty.updateMatrixWorld(true);
    const end = rayHelper.shootRayFromObject(cubeAt(0, 0, 0), empty);

    expect(start!.x).toBeCloseTo(9.5, 3);
    expect(start!.y).toBeCloseTo(0, 3);
    expect(end!.y).toBeCloseTo(4, 3);
  });

  it("falls back to the silhouette point rather than undefined when nothing is hit", () => {
    const empty = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    empty.position.set(4, 2, 0);
    empty.updateMatrixWorld(true);

    const point = rayHelper.shootRayFromObject(cubeAt(0, 0, 0), empty);
    expect(point).toBeDefined();
    expect(point!.x).toBeCloseTo(4, 3);
    expect(point!.y).toBeCloseTo(2, 3);
  });
});
