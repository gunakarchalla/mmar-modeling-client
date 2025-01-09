import * as THREE from "three";
import { singleton } from "aurelia";
import { InstanceUtility } from "./instance_utility";
import { ObjectInstance } from "../../../../mmar-global-data-structure";
import { MathUtility } from "./math_utility";
import { Logger } from "./logger";
import { GlobalDefinition } from "resources/global_definitions";

@singleton
export class CoordinatesUpdater {

    constructor(
        private instanceUtility: InstanceUtility,
        private mathUtility: MathUtility,
        private logger: Logger,
        private globalObjectInstance: GlobalDefinition

    ) { }

    /**
     * Asynchronously updates the 2D coordinates of class and port instances based on their current positions in the 3D scene.
     * This function iterates over all draggable objects and their children, updating their associated instance's 2D coordinates if they have moved.
     */
    async updateCoordinates2DonClassAndPortInstance() {

        const sceneInstance = await this.instanceUtility.getTabContextSceneInstance();
        const allPortInstances = await this.instanceUtility.getAllPortInstancesOfTabContext();

        //update positions in instances

        for (const object of this.globalObjectInstance.dragObjects) {
            const object3D: THREE.Object3D = object;
            let object_instance: ObjectInstance = null;
            object_instance = sceneInstance.class_instances.find(instance => instance.uuid == object3D.uuid);
            if (!object_instance) {
                object_instance = allPortInstances.find(instance => instance.uuid == object3D.uuid);
            }
            if (object_instance) {
                this.mathUtility.roundPosOfObject(object3D as THREE.Mesh, 100)
                if (object_instance.coordinates_2d.x != object3D.position.x || object_instance.coordinates_2d.y != object3D.position.y || object_instance.coordinates_2d.z != object3D.position.z) {
                    object_instance.coordinates_2d.x = object3D.position.x;
                    object_instance.coordinates_2d.y = object3D.position.y;
                    object_instance.coordinates_2d.z = object3D.position.z;
                    this.logger.log("update coordinates in instance " + object_instance.name + " to " + object_instance.coordinates_2d.x + " " + object_instance.coordinates_2d.y + " " + object_instance.coordinates_2d.z, "done");
                }
                object_instance = null;
            }

            for (const child_object of object.children) {
                const child_object3D: THREE.Object3D = child_object;
                let child_object_instance: ObjectInstance = null;
                child_object_instance = sceneInstance.class_instances.find(instance => instance.uuid == child_object3D.uuid);
                if (!child_object_instance) {
                    child_object_instance = allPortInstances.find(instance => instance.uuid == child_object3D.uuid);
                }
                if (child_object_instance) {
                    this.mathUtility.roundPosOfObject(child_object3D as THREE.Mesh, 100)
                    if (child_object_instance.coordinates_2d.x != child_object3D.position.x || child_object_instance.coordinates_2d.y != child_object3D.position.y || child_object_instance.coordinates_2d.z != child_object3D.position.z) {
                        child_object_instance.coordinates_2d.x = child_object3D.position.x;
                        child_object_instance.coordinates_2d.y = child_object3D.position.y;
                        child_object_instance.coordinates_2d.z = child_object3D.position.z;
                        this.logger.log("update coordinates in instance " + child_object_instance.name + " to " + child_object_instance.coordinates_2d.x + " " + child_object_instance.coordinates_2d.y + " " + child_object_instance.coordinates_2d.z, "done");
                    }
                    child_object_instance = null;
                }
            }
        }
    }

     /**
     * Asynchronously updates the rotation of class and port instances based on their current rotation in the 3D scene.
     * This function iterates over all draggable objects and their children, updating their associated instances rotations if they have changed.
     */
    async updateRotationOnClassAndPortInstance() {
        const sceneInstance = await this.instanceUtility.getTabContextSceneInstance();
        const allPortInstances = await this.instanceUtility.getAllPortInstancesOfTabContext();

        //check if the rotation of an object has changed
        //if yes, update rotation in instances
        for (const object of this.globalObjectInstance.dragObjects) {
            const object3D: THREE.Object3D = object;
            let object_instance: ObjectInstance = null;
            object_instance = sceneInstance.class_instances.find(instance => instance.uuid == object3D.uuid);
            if (!object_instance) {
                object_instance = allPortInstances.find(instance => instance.uuid == object3D.uuid);
            }
            if (object_instance) {
                if (object_instance.rotation.x != object3D.quaternion.x || object_instance.rotation.y != object3D.quaternion.y || object_instance.rotation.z != object3D.quaternion.z || object_instance.rotation.w != object3D.quaternion.w) {
                    object_instance.rotation.x = object3D.quaternion.x;
                    object_instance.rotation.y = object3D.quaternion.y;
                    object_instance.rotation.z = object3D.quaternion.z;
                    object_instance.rotation.w = object3D.quaternion.w;
                    this.logger.log("update rotation in instance " + object_instance.name + " to " + object_instance.rotation.x + " " + object_instance.rotation.y + " " + object_instance.rotation.z + " " + object_instance.rotation.w, "done");
                }
                object_instance = null;
            }

            for (const child_object of object.children) {
                const child_object3D: THREE.Object3D = child_object;
                let child_object_instance: ObjectInstance = null;
                child_object_instance = sceneInstance.class_instances.find(instance => instance.uuid == child_object3D.uuid);
                if (!child_object_instance) {
                    child_object_instance = allPortInstances.find(instance => instance.uuid == child_object3D.uuid);
                }
                if (child_object_instance) {
                    if (child_object_instance.rotation.x != child_object3D.quaternion.x || child_object_instance.rotation.y != child_object3D.quaternion.y || child_object_instance.rotation.z != child_object3D.quaternion.z || child_object_instance.rotation.w != child_object3D.quaternion.w) {
                        child_object_instance.rotation.x = child_object3D.quaternion.x;
                        child_object_instance.rotation.y = child_object3D.quaternion.y;
                        child_object_instance.rotation.z = child_object3D.quaternion.z;
                        child_object_instance.rotation.w = child_object3D.quaternion.w;
                        this.logger.log("update rotation in instance " + child_object_instance.name + " to " + child_object_instance.rotation.x + " " + child_object_instance.rotation.y + " " + child_object_instance.rotation.z + " " + child_object_instance.rotation.w, "done");
                    }
                    child_object_instance = null;
                }
            }
        }
    }

}