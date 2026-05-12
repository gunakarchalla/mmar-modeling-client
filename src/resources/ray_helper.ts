import { singleton } from 'aurelia';
import * as THREE from 'three';
import { GlobalDefinition } from './global_definitions';
import { SharedDocService } from './collaboration/shared_doc_service';

@singleton()
export class RayHelper{

  private lastCursorBroadcast = 0;
  private readonly cursorPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

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

private broadcastCursor(): void {
  const now = Date.now();
  if (now - this.lastCursorBroadcast < 33) return;
  this.lastCursorBroadcast = now;

  const session = this.sharedDocService.forTab(this.globalObjectInstance.selectedTab);
  if (!session) return;

  const worldPoint = new THREE.Vector3();
  const hit = this.globalObjectInstance.raycaster.ray.intersectPlane(this.cursorPlane, worldPoint);

  session.awareness.setLocalStateField('cursor', {
    active: true,
    world: hit ? { x: worldPoint.x, y: worldPoint.y, z: worldPoint.z } : { x: 0, y: 0, z: 0 },
    ndc: {
      x: this.globalObjectInstance.mouse.x,
      y: this.globalObjectInstance.mouse.y,
    },
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
