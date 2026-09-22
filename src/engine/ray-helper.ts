import * as THREE from "three";
import { globalObject } from "@/engine/global-definition";
// Type-only, so it is erased at build time and the engine keeps its runtime distance from
// the collaboration module (the sharedDocServiceRef indirection below is the point).
import type { SharedDocService } from "@/resources/collaboration/shared-doc-service";

/**
 * Pointer raycasting for the modeling canvas. `shootRay` builds the picking ray for every
 * pointer event and doubles as the emission site of the collaboration cursor
 * (`broadcastCursor` / `clearCursor`), publishing the `cursor` awareness field that
 * RemoteCursorRenderer draws on remote clients.
 *
 * The shared session is reached through `globalObject.sharedDocServiceRef` rather than a
 * direct import: the collaboration service sits downstream of the engine in the import
 * graph, and the back-reference keeps the engine free of that cycle. On a non-shared tab
 * `forTab()` returns null and both cursor methods are no-ops.
 */

/**
 * What a broadcast cursor ray terminated on. The sender resolves this because only it
 * can: a receiver sees coordinates and cannot tell a geometry hit from a far-plane
 * fallback. `objectUuid` is what lets receivers outline the object a peer is pointing at
 * rather than float a marker on its surface.
 */
export type CursorAnchorKind = "object" | "plane";

/** The modelling plane (z = globalObject.localZPlane) — reused, never allocated per ray. */
const modellingPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1));

// Scratch objects for `shootRayFromObject`, which the animator calls twice per relation
// line on every frame something moves — reused, never allocated per ray.
const rayFrom = new THREE.Vector3();
const rayOrigin = new THREE.Vector3();
const rayDirection = new THREE.Vector3();
const targetSphere = new THREE.Sphere();
const rayHits: THREE.Intersection[] = [];
/** The materials the running cast forced double-sided, mapped to the side each had. */
const forcedSides = new Map<THREE.Material, THREE.Side>();

function forceDoubleSided(material: THREE.Material) {
  // Recorded once per material: one the target uses twice must be restored to its own
  // side, not to the DoubleSide the first visit left on it.
  if (material.side === THREE.DoubleSide || forcedSides.has(material)) return;
  forcedSides.set(material, material.side);
  material.side = THREE.DoubleSide;
}

function forceDoubleSidedMaterials(object: THREE.Object3D) {
  const material = (object as THREE.Mesh).material;
  if (Array.isArray(material)) material.forEach(forceDoubleSided);
  else if (material) forceDoubleSided(material);
}

export class RayHelper {
  private lastCursorBroadcast = 0;

  private globalObjectInstance = globalObject;

  private get sharedDocService(): SharedDocService | null {
    return this.globalObjectInstance.sharedDocServiceRef;
  }

  //generate a raycast that shoots a ray from the camera to the mouse position
  //returns the raycaster
  shootRay(event: MouseEvent | TouchEvent): THREE.Raycaster {
    //calculate the x and y position of the mouse on the renderer
    const ev: any = event;
    let clientX: number | undefined;
    let clientY: number | undefined;

    //for touch
    try {
      clientX = ev.touches[0].clientX;
      clientY = ev.touches[0].clientY;
    } catch {
      /* not a touch event */
    }

    const rect: DOMRect = this.globalObjectInstance.renderer.domElement.getBoundingClientRect();

    //for touch
    if (clientX && clientY) {
      this.globalObjectInstance.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      this.globalObjectInstance.mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    }
    //if not touch
    else {
      this.globalObjectInstance.mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      this.globalObjectInstance.mouse.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    }

    //Raycaster from Camera to mouseposition
    this.globalObjectInstance.raycaster.setFromCamera(this.globalObjectInstance.mouse, this.globalObjectInstance.camera);

    // Broadcast cursor position to awareness (throttled to ~33 ms / ~30 fps). No-op
    // on a tab with no shared session.
    this.broadcastCursor();

    return this.globalObjectInstance.raycaster;
  }

  /** Clear the local cursor state — call on pointer-leave of the canvas (ThreeCanvas does). */
  clearCursor(): void {
    const session = this.sharedDocService?.forTab(this.globalObjectInstance.selectedTab);
    if (!session) return;
    session.awareness.setLocalStateField("cursor", { active: false });
  }

  /**
   * Broadcast the local pointer as a world-space ray so remote clients can draw it as a
   * named cursor: tail on the camera's near plane (roughly the sender's eye, which is
   * what lets a peer read where someone is looking from — a 2D user's ray drops
   * vertically, a 3D user's rakes in at an angle), head on the point the ray lands on.
   *
   * The anchor is the first object the ray hits, else the modelling plane. A ray that
   * reaches neither (3D only, pointing away from the plane at empty space) has nothing to
   * say, so the cursor goes inactive rather than being drawn somewhere wrong. The anchor
   * is resolved on the sender because only the sender can tell a geometry hit from a
   * miss, and naming the hit object lets receivers outline it.
   *
   * The unprojection runs through the active camera's inverse projection matrix, so this
   * works for both the orthographic (2D) and perspective (3D) cameras without branching.
   * Throttled to ~30 fps. No-op on a tab with no shared session.
   */
  private broadcastCursor(): void {
    const now = Date.now();
    if (now - this.lastCursorBroadcast < 33) return;
    this.lastCursorBroadcast = now;

    const session = this.sharedDocService?.forTab(this.globalObjectInstance.selectedTab);
    if (!session) return;

    const camera = this.globalObjectInstance.camera;
    const mouse = this.globalObjectInstance.mouse;

    // Arrow tail: pointer projected onto the camera's near plane.
    const origin = new THREE.Vector3(mouse.x, mouse.y, -1).unproject(camera);

    const hits = this.globalObjectInstance.raycaster.intersectObjects(this.globalObjectInstance.dragObjects, false);

    let target: THREE.Vector3 | null;
    let kind: CursorAnchorKind = "object";
    let objectUuid: string | undefined;

    if (hits.length > 0) {
      target = hits[0].point;
      objectUuid = hits[0].object.uuid;
    } else {
      // Plane equation is normal·p + constant = 0, so z = localZPlane needs -localZPlane.
      modellingPlane.constant = -this.globalObjectInstance.localZPlane;
      target = this.globalObjectInstance.raycaster.ray.intersectPlane(modellingPlane, new THREE.Vector3());
      kind = "plane";
    }

    if (!target) {
      session.awareness.setLocalStateField("cursor", { active: false });
      return;
    }

    session.awareness.setLocalStateField("cursor", {
      active: true,
      origin: { x: origin.x, y: origin.y, z: origin.z },
      target: { x: target.x, y: target.y, z: target.z },
      kind,
      objectUuid,
    });
  }

  /**
   * The point on `toObject`'s surface that faces `fromObject`, or undefined when one of
   * the two objects is missing.
   *
   * Both call sites in the animator resolve their objects by walking the scene and cast
   * the result to a Mesh, so either can be undefined — a relation whose endpoints were
   * removed from the scene (a save rolled back, an element deleted) keeps being drawn
   * for as long as its line is still in `updateLinesArray`. Answering undefined makes
   * the animator skip that line's frame; dereferencing it threw
   * "Cannot read properties of undefined (reading 'getWorldPosition')" once per frame.
   *
   * The ray is started just OUTSIDE `toObject` on the `fromObject` side and aimed at the
   * centre of its geometry rather than fired from `fromObject`'s origin. Firing from the
   * origin lost the relation ("line not updated: an end point ... could not be resolved")
   * whenever the two objects overlapped during a drag — the ray then started inside the
   * target and a single-sided material reports no hit on the way out — and whenever a
   * vizRep's merged geometry sat off its object origin, so a ray at the origin grazed
   * past it.
   *
   * The cast forces every material on the target double-sided for its duration: a vizRep
   * that renders BACK-SIDE only (the hollow-shell / flat-disc look) is invisible to the
   * raycaster on the wall nearest the incoming ray, so the endpoint would otherwise land
   * on the far wall or, with nothing hit at all, at the centre — the line then reads as
   * coming out of the middle of the object instead of off its edge. When the cast still
   * finds nothing the near point of the bounding sphere (facing `fromObject`) is used, so
   * the line meets the object's silhouette rather than its centre. A material the target
   * uses more than once (a merged vizRep's material array repeats shared ones) is forced
   * and restored exactly once, so the cast cannot leave it double-sided.
   */
  shootRayFromObject(fromObject: THREE.Mesh | undefined, toObject: THREE.Mesh | undefined) {
    if (!fromObject || !toObject) return undefined;

    //we get the world position of fromObject (also refreshes its world matrix) and
    //refresh toObject's world matrix, which positions its bounding sphere below
    fromObject.getWorldPosition(rayFrom);
    toObject.updateWorldMatrix(true, false);

    // Centre and radius of the target's geometry in world space: the centre is what the
    // ray aims at (robust to geometry that sits off the object origin), the radius is
    // how far outside the target to start so an overlapping / enclosing fromObject can
    // never leave the ray origin inside the mesh.
    const geometry = toObject.geometry;
    if (geometry?.getAttribute("position")) {
      if (!geometry.boundingSphere) geometry.computeBoundingSphere();
      targetSphere.copy(geometry.boundingSphere!).applyMatrix4(toObject.matrixWorld);
    } else {
      targetSphere.center.setFromMatrixPosition(toObject.matrixWorld);
      targetSphere.radius = 0;
    }
    const targetCentre = targetSphere.center;

    rayDirection.subVectors(targetCentre, rayFrom);
    // fromObject sitting exactly on the target centre: no meaningful direction to cast.
    if (rayDirection.lengthSq() === 0) return targetCentre.clone();
    rayDirection.normalize();

    rayOrigin.copy(targetCentre).addScaledVector(rayDirection, -(targetSphere.radius + 1));
    const raycaster = this.globalObjectInstance.raycasterBetweenObjects;
    // Line2 / LineSegments2 children (relation end markers, nested vizReps) read the
    // camera off the raycaster and throw when it is unset.
    raycaster.camera = this.globalObjectInstance.camera;
    raycaster.set(rayOrigin, rayDirection);

    toObject.traverse(forceDoubleSidedMaterials);
    try {
      // Emptied first as well as after: a cast that threw may have left hits behind.
      rayHits.length = 0;
      raycaster.intersectObject(toObject, true, rayHits);
    } finally {
      forcedSides.forEach((side, material) => (material.side = side));
      forcedSides.clear();
    }

    // No intersection: the point where the line meets the object's silhouette. Either way
    // a fresh vector — the caller holds on to it past the next cast.
    const point = rayHits[0]?.point ?? targetCentre.clone().addScaledVector(rayDirection, -targetSphere.radius);
    rayHits.length = 0;
    return point;
  }
}

// Module singleton — one shared instance.
export const rayHelper = new RayHelper();
