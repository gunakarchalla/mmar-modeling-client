import { singleton } from 'aurelia';
import * as THREE from 'three';

@singleton()
export class RotationConverter {

    // Convert Euler angles (Roll, Pitch, Yaw) to Quaternion
    // URDF uses fixed-axis XYZ, which corresponds to intrinsic ZYX
    eulerToQuaternion(roll: number, pitch: number, yaw: number): { x: number, y: number, z: number, w: number } {
        const euler = new THREE.Euler(roll, pitch, yaw, 'ZYX');
        const quaternion = new THREE.Quaternion();
        quaternion.setFromEuler(euler);
        return { x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w };
    }

    // Convert Quaternion to Euler angles (Roll, Pitch, Yaw)
    quaternionToEuler(x: number, y: number, z: number, w: number): { roll: number, pitch: number, yaw: number } {
        const quaternion = new THREE.Quaternion(x, y, z, w);
        const euler = new THREE.Euler();
        euler.setFromQuaternion(quaternion, 'ZYX');
        return { roll: euler.x, pitch: euler.y, yaw: euler.z };
    }
}
