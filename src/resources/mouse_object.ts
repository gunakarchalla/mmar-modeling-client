import { singleton } from 'aurelia';
import { GlobalDefinition } from './global_definitions';
import * as THREE from 'three';
import { RayHelper } from './ray_helper';

@singleton()
export class MouseObject {

    constructor(
        private globalObjectInstance: GlobalDefinition,
        private rayHelper: RayHelper
    ) {

    }

    updateMousePos(event: MouseEvent) {
        //get mouse pos
        const mousePos2d: { x: number; y: number; } | undefined = this.getMousePos2d(this.globalObjectInstance.elementContainer, event);

        //set pos2D to textfield
        if (mousePos2d )

            this.globalObjectInstance.raycaster = this.rayHelper.shootRay(event);
        let objects: THREE.Object3D[];
        let intersects: { point: { getComponent: (arg0: number) => number; }; }[];

        objects = [this.globalObjectInstance.plane];
        //array with objects, that intersect with the ray (only plane)
        intersects = this.globalObjectInstance.raycaster.intersectObjects(objects);

        //set pos3d to textfield
        if (intersects ) {
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
                y: evt.clientY - rect.top
            };
        }
    }

}
