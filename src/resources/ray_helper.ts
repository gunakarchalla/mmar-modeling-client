import { singleton } from 'aurelia';
import * as THREE from 'three';
import { GlobalDefinition } from './global_definitions';
import { SharedDocService } from './collaboration/shared_doc_service';

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
 * Broadcast the local pointer as a world-space ray so remote clients can draw it
 * as an arrow: tail on the camera's near plane, head on the first scene object the
 * ray hits — or, when it misses everything, on the camera's far plane.
 *
 * The near/far plane points are obtained by unprojecting the pointer's normalized
 * device coordinates at the two clip-space depths (z = -1 → near plane, z = +1 →
 * far plane). Because the unprojection runs through the active camera's inverse
 * projection matrix, this is identical to how THREE.Raycaster builds its ray and
 * works without branching for both the orthographic (2D) and perspective (3D)
 * cameras — the broadcast adapts automatically as the user toggles modes.
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

  // Arrow head: the first object the ray hits, otherwise the camera's far plane.
  // The raycaster was already set from this camera in shootRay().
  const hits = this.globalObjectInstance.raycaster.intersectObjects(this.globalObjectInstance.dragObjects, false);
  const target = hits.length > 0
    ? hits[0].point
    : new THREE.Vector3(mouse.x, mouse.y, 1).unproject(camera);

  session.awareness.setLocalStateField('cursor', {
    active: true,
    origin: { x: origin.x, y: origin.y, z: origin.z },
    target: { x: target.x, y: target.y, z: target.z },
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
