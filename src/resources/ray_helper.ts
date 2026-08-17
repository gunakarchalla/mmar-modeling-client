import { singleton } from 'aurelia';
import * as THREE from 'three';
import { GlobalDefinition } from './global_definitions';
import { SharedDocService } from './collaboration/shared_doc_service';

/**
 * What a broadcast cursor ray terminated on. The SENDER resolves this because only it
 * can: a receiver sees coordinates and cannot tell a geometry hit from a far-plane
 * fallback, and `objectUuid` is what lets receivers outline the object a peer is
 * pointing at rather than float a marker on its surface.
 */
export type CursorAnchorKind = 'object' | 'plane';

/** The modelling plane (z = globalObject.localZPlane) — reused, never allocated per ray. */
const modellingPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1));

@singleton()
export class RayHelper{

  private lastCursorBroadcast = 0;

  constructor(
    private globalObjectInstance : GlobalDefinition,
    private sharedDocService: SharedDocService,
  ){

  }


  //generate a raycast that shoots a ray from the camera to the mouse position
//returns the raycaster
shootRay(event: MouseEvent | TouchEvent): THREE.Raycaster {
  //calculate the x and y position of the mouse on the renderer
  const ev: any = event;
  let clientX;
  let clientY;

  //for touch
  try{
      clientX = ev.touches[0].clientX;
      clientY = ev.touches[0].clientY;
  } catch {}

  const rect: DOMRect = this.globalObjectInstance.renderer.domElement.getBoundingClientRect();

  //for touch
  if (clientX && clientY){
      this.globalObjectInstance.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      this.globalObjectInstance.mouse.y = - ((clientY - rect.top) / rect.height) * 2 + 1;
  }
  //if not touch
  else{
      this.globalObjectInstance.mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      this.globalObjectInstance.mouse.y = - ((ev.clientY - rect.top) / rect.height) * 2 + 1;
  }


  //Raycaster from Camera to mouseposition
  this.globalObjectInstance.raycaster.setFromCamera(this.globalObjectInstance.mouse, this.globalObjectInstance.camera);

  // Broadcast cursor position to awareness (throttled to ~33 ms / ~30 fps)
  this.broadcastCursor();

  return this.globalObjectInstance.raycaster;
}

/** Clear the local cursor state — call on pointer-leave of the canvas. */
clearCursor(): void {
  const session = this.sharedDocService.forTab(this.globalObjectInstance.selectedTab);
  if (!session) return;
  session.awareness.setLocalStateField('cursor', { active: false });
}

/**
 * Broadcast the local pointer as a world-space ray so remote clients can draw it as
 * a named cursor: tail on the camera's near plane (≈ the sender's eye, which is what
 * lets a peer read WHERE someone is looking from — a 2D user's ray drops vertically,
 * a 3D user's rakes in at an angle), head on the point the ray lands on.
 *
 * ANCHOR, IN PRIORITY ORDER: the first object the ray hits, else the modelling plane.
 * The old far-plane fallback is deliberately gone — it put the arrow head at the far
 * clipping distance, nowhere near what the sender was looking at, and every receiver
 * had to guess whether a coordinate meant "hit that object" or "hit nothing". A ray
 * that reaches neither (3D only: pointing away from the plane at empty space) has
 * nothing to say, so the cursor goes inactive instead of being drawn somewhere wrong.
 *
 * The near-plane point is obtained by unprojecting the pointer's normalized device
 * coordinates at clip-space depth z = -1. Because the unprojection runs through the
 * active camera's inverse projection matrix, this is identical to how THREE.Raycaster
 * builds its ray and works without branching for both the orthographic (2D) and
 * perspective (3D) cameras — the broadcast adapts as the user toggles modes.
 *
 * Computed here, on the broadcaster, because only this client knows its own camera
 * and what its ray hits in the shared scene. Throttled to ~30 fps.
 */
private broadcastCursor(): void {
  const now = Date.now();
  if (now - this.lastCursorBroadcast < 33) return;
  this.lastCursorBroadcast = now;

  const session = this.sharedDocService.forTab(this.globalObjectInstance.selectedTab);
  if (!session) return;

  const camera = this.globalObjectInstance.camera;
  const mouse = this.globalObjectInstance.mouse;

  // Arrow tail: pointer projected onto the camera's near plane.
  const origin = new THREE.Vector3(mouse.x, mouse.y, -1).unproject(camera);

  // The raycaster was already set from this camera in shootRay().
  const hits = this.globalObjectInstance.raycaster.intersectObjects(this.globalObjectInstance.dragObjects, false);

  let target: THREE.Vector3 | null;
  let kind: CursorAnchorKind = 'object';
  let objectUuid: string | undefined;

  if (hits.length > 0) {
    target = hits[0].point;
    objectUuid = hits[0].object.uuid;
  } else {
    // Plane equation is normal·p + constant = 0, so z = localZPlane needs -localZPlane.
    modellingPlane.constant = -this.globalObjectInstance.localZPlane;
    target = this.globalObjectInstance.raycaster.ray.intersectPlane(modellingPlane, new THREE.Vector3());
    kind = 'plane';
  }

  if (!target) {
    session.awareness.setLocalStateField('cursor', { active: false });
    return;
  }

  session.awareness.setLocalStateField('cursor', {
    active: true,
    origin: { x: origin.x, y: origin.y, z: origin.z },
    target: { x: target.x, y: target.y, z: target.z },
    kind,
    objectUuid,
  });
}

shootRayFromObject(fromObject: THREE.Mesh, toObject: THREE.Mesh) {
  const direction = new THREE.Vector3();
  const fromPosition: THREE.Vector3 = new THREE.Vector3();
  const toPosition: THREE.Vector3 = new THREE.Vector3();

  //we get the world position of the two
  fromObject.getWorldPosition(fromPosition);
  toObject.getWorldPosition(toPosition);

  const adaptedFromPosition = fromPosition;
  direction.subVectors(toPosition, adaptedFromPosition)
  this.globalObjectInstance.raycasterBetweenObjects.set(adaptedFromPosition, direction.normalize());
  const intersects = this.globalObjectInstance.raycasterBetweenObjects.intersectObject(toObject);
  if (intersects[0])
      return intersects[0].point;

}
}
