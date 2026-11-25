import * as THREE from "three";

/**
 * Rounding helpers for object transforms: snapping a dragged object's position (and
 * quaternion) to a grid keeps stored coordinates tidy and stops floating-point drift
 * from registering as a change on every frame.
 */
export class MathUtility {
  roundPosOfObject(object: THREE.Mesh, precision: number) {
    let x = object.position.x;
    x = Math.round(x * precision) / precision;
    object.position.x = x;
    let y = object.position.y;
    y = Math.round(y * precision) / precision;
    object.position.y = y;
  }

}

// Module singleton — one shared instance.
export const mathUtility = new MathUtility();
