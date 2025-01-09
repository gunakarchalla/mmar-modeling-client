import { singleton } from "aurelia";
import * as THREE from "three";

singleton()
export class MathUtility{

    roundPosOfObject(object: THREE.Mesh, precision: number) {
        let x = object.position.x;
        x = Math.round(x * precision) / precision;
        object.position.x = x;
        let y = object.position.y;
        y = Math.round(y * precision) / precision;
        object.position.y = y;
      }

      roundQuaternionOfObject(object: THREE.Mesh, precision: number) {
        let x = object.quaternion.x;
        x = Math.round(x * precision) / precision;
        object.quaternion.x = x;
        let y = object.quaternion.y;
        y = Math.round(y * precision) / precision;
        object.quaternion.y = y;
        let z = object.quaternion.z;
        z = Math.round(z * precision) / precision;
        object.quaternion.z = z;
        let w = object.quaternion.w;
        w = Math.round(w * precision) / precision;
        object.quaternion.w = w;
      }

}