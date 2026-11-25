import * as THREE from "three";
import { globalObject } from "@/engine/global-definition";
import { rayHelper } from "@/engine/ray-helper";

/**
 * Tracks the pointer in the 3D world: on every `pointermove` it raycasts against the
 * invisible modelling plane and parks `mousePointer3d` at the hit point. Relation
 * drawing uses that sphere as the line's floating end point.
 *
 * This is also the only pointer-motion path into `rayHelper.shootRay`, which is where
 * the collaboration cursor is broadcast — so a peer's cursor moves exactly as often as
 * this handler runs. `initiator.initEventListeners` registers it on the renderer's
 * canvas for that reason; see the comment there.
 */
export class MouseObject {
  private globalObjectInstance = globalObject;
  private rayHelper = rayHelper;

  updateMousePos(event: MouseEvent) {
    // Only fire the ray once there is a canvas to measure against — the same element
    // `shootRay` unprojects from, so the guard and the picking ray always agree on one
    // rectangle.
    //
    // This used to ask `getMousePos2d` for the canvas-relative point and then use it
    // purely as a null check, throwing the coordinates away. That cost a second
    // `getBoundingClientRect` on top of the one `shootRay` does — and this handler runs
    // on EVERY pointermove, so it was two forced layout flushes per mouse move, each of
    // which has to wait for pending style and layout work. The presence check is what
    // the branch actually wanted.
    const canvas: HTMLElement | null = this.globalObjectInstance.renderer.domElement;

    //set pos2D to textfield
    if (canvas != null) this.globalObjectInstance.raycaster = this.rayHelper.shootRay(event);

    const objects: THREE.Object3D[] = [this.globalObjectInstance.plane];
    //array with objects, that intersect with the ray (only plane)
    const intersects: { point: { getComponent: (arg0: number) => number } }[] = this.globalObjectInstance.raycaster.intersectObjects(objects);

    //set pos3d to textfield
    if (intersects.length > 0) {
      this.globalObjectInstance.mousePointer3d.position.x = intersects[0].point.getComponent(0);
      this.globalObjectInstance.mousePointer3d.position.y = intersects[0].point.getComponent(1);
    }
  }

  getMousePos2d(canvas: HTMLElement | null, evt: MouseEvent) {
    //catch null
    if (canvas != null) {
      const rect: DOMRect = canvas.getBoundingClientRect();
      return {
        x: evt.clientX - rect.left,
        y: evt.clientY - rect.top,
      };
    }
  }
}

// Module singleton — one shared instance.
export const mouseObject = new MouseObject();
