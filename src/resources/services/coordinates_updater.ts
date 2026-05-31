import * as THREE from "three";
import { singleton } from "aurelia";
import { InstanceUtility } from "./instance_utility";
import { ObjectInstance } from "../../../../mmar-global-data-structure";
import { MathUtility } from "./math_utility";
import { Logger } from "./logger";
import { GlobalDefinition } from "resources/global_definitions";
import { SharedDocService } from "../collaboration/shared_doc_service";
import { applyLocalChangeToYDoc } from "../collaboration/y_mapping";

@singleton
export class CoordinatesUpdater {

    constructor(
        private instanceUtility: InstanceUtility,
        private mathUtility: MathUtility,
        private logger: Logger,
        private globalObjectInstance: GlobalDefinition,
        private sharedDocService: SharedDocService
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
                    this.syncCoordinatesToYDoc(object_instance.uuid, object_instance.coordinates_2d.x, object_instance.coordinates_2d.y, object_instance.coordinates_2d.z);
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
                        this.syncCoordinatesToYDoc(child_object_instance.uuid, child_object_instance.coordinates_2d.x, child_object_instance.coordinates_2d.y, child_object_instance.coordinates_2d.z);
                    }
                    child_object_instance = null;
                }
            }
        }
    }

    private syncCoordinatesToYDoc(uuid: string, x: number, y: number, z: number): void {
        const session = this.sharedDocService.forTab(this.globalObjectInstance.selectedTab);
        if (!session || session.applyingRemote) return;
        applyLocalChangeToYDoc(session.ydoc, { type: 'coordinates', classInstanceUuid: uuid, x, y, z }, session.localOrigin);
        this.globalObjectInstance.doSceneInstancePatchLocal = true;
    }

    private syncRotationToYDoc(uuid: string, x: number, y: number, z: number, w: number): void {
        const session = this.sharedDocService.forTab(this.globalObjectInstance.selectedTab);
        if (!session || session.applyingRemote) return;
        applyLocalChangeToYDoc(session.ydoc, { type: 'rotation', classInstanceUuid: uuid, x, y, z, w }, session.localOrigin);
        this.globalObjectInstance.doSceneInstancePatchLocal = true;
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
                    this.syncRotationToYDoc(object_instance.uuid, object_instance.rotation.x, object_instance.rotation.y, object_instance.rotation.z, object_instance.rotation.w);
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
                        this.syncRotationToYDoc(child_object_instance.uuid, child_object_instance.rotation.x, child_object_instance.rotation.y, child_object_instance.rotation.z, child_object_instance.rotation.w);
                    }
                    child_object_instance = null;
                }
            }
        }
    }

    /**
     * Asynchronously updates the scale of class and port instances based on their current
     * scale in the 3D scene, propagating any change to collaborators via the shared Y.Doc.
     * Scale is held in custom_variables["scale"]. Children are not iterated because they are
     * inverse-scaled relative to their parent and carry no independent persisted scale.
     */
    async updateScaleOnClassAndPortInstance() {
        const sceneInstance = await this.instanceUtility.getTabContextSceneInstance();
        const allPortInstances = await this.instanceUtility.getAllPortInstancesOfTabContext();

        for (const object of this.globalObjectInstance.dragObjects) {
            const object3D: THREE.Object3D = object;
            let object_instance: ObjectInstance = null;
            object_instance = sceneInstance.class_instances.find(instance => instance.uuid == object3D.uuid);
            if (!object_instance) {
                object_instance = allPortInstances.find(instance => instance.uuid == object3D.uuid);
            }
            if (!object_instance) continue;

            const scale = object3D.scale;
            const stored = object_instance.custom_variables ? object_instance.custom_variables["scale"] : undefined;
            // `stored` may alias object3D.scale (set by reference in graphic_context.setScale).
            // When aliased its x/y/z always match the object, so it can't be used as a prior value.
            const hasPlainPrior = stored && stored !== scale;
            // With a reliable prior, sync on any delta; without one, only sync a non-default
            // (non-identity) scale so we don't broadcast identity scales for every object on load.
            const changed = hasPlainPrior
                ? (stored.x != scale.x || stored.y != scale.y || stored.z != scale.z)
                : (scale.x != 1 || scale.y != 1 || scale.z != 1);
            if (changed) {
                if (!object_instance.custom_variables) object_instance.custom_variables = {};
                // Store a plain copy (not a live Three.Vector3 reference) so future comparisons work.
                object_instance.custom_variables["scale"] = { x: scale.x, y: scale.y, z: scale.z };
                this.logger.log("update scale in instance " + object_instance.name + " to " + scale.x + " " + scale.y + " " + scale.z, "done");
                this.syncScaleToYDoc(object_instance.uuid, scale.x, scale.y, scale.z);
            }
        }
    }

    private syncScaleToYDoc(uuid: string, x: number, y: number, z: number): void {
        const session = this.sharedDocService.forTab(this.globalObjectInstance.selectedTab);
        if (!session || session.applyingRemote) return;
        applyLocalChangeToYDoc(session.ydoc, { type: 'scale', classInstanceUuid: uuid, x, y, z }, session.localOrigin);
        this.globalObjectInstance.doSceneInstancePatchLocal = true;
    }

}