import { GlobalSelectedObject } from './../global_selected_object';
import { GlobalDefinition } from 'resources/global_definitions';
import { inject, singleton } from 'aurelia';
import * as THREE from 'three';
import { ObjectInstance } from '../../../../mmar-global-data-structure';
import { InstanceUtility } from './instance_utility';

@singleton()
export class TransformControlsEvents {

    constructor(
        private globalObjectInstance: GlobalDefinition,
        private globalSelectedObject: GlobalSelectedObject,
        private instanceUtility: InstanceUtility
    ) { }

    onTransformControlsPropertyChange() {
        if (this.globalSelectedObject.object) {
            this.globalSelectedObject.getObject();
            //set scale of y to scale of x -> proportional scale
            this.globalSelectedObject.object.scale.setY(this.globalSelectedObject.object.scale.x);
            this.globalObjectInstance.objectScaled = true;
        }

        this.globalObjectInstance.render = true;

    }


    //this event is triggered, when the button is released in the transformControl mode
    async onTransformControlsMouseUp() {
        const controls = this.globalObjectInstance.transformControls;
        const object: THREE.Mesh = controls.object as THREE.Mesh;
        const mode = controls.mode;


        if (controls && object && mode == 'translate') {
            let instance: ObjectInstance;
            const sceneInstace = await this.instanceUtility.getTabContextSceneInstance();
            const object_Instances: ObjectInstance[] = [...sceneInstace.class_instances, ...await this.instanceUtility.getAllPortInstancesOfTabContext()];
            instance = object_Instances.find(instance_obj => instance_obj.uuid == object.uuid)
            if (!instance) {
                instance = object_Instances.find(instance_obj => instance_obj.uuid == object.parent.uuid)
            }

            //updates the x_rel, y_rel, z_rel of the instance when label is shifted
            if (object.uuid != instance.uuid && object.userData.custom_variables) {
                object.userData.custom_variables[Object.keys(object.userData.custom_variables)[0]]["value"] = object.position.x;
                object.userData.custom_variables[Object.keys(object.userData.custom_variables)[0]]["user_locked"] = true;
                object.userData.custom_variables[Object.keys(object.userData.custom_variables)[1]]["value"] = object.position.y;
                object.userData.custom_variables[Object.keys(object.userData.custom_variables)[1]]["user_locked"] = true;
                object.userData.custom_variables[Object.keys(object.userData.custom_variables)[2]]["value"] = object.position.z;
                object.userData.custom_variables[Object.keys(object.userData.custom_variables)[2]]["user_locked"] = true;
                
                //update instance custom_variables on instance as well
                instance.custom_variables[Object.keys(object.userData.custom_variables)[0]]["value"] = object.position.x;
                instance.custom_variables[Object.keys(object.userData.custom_variables)[0]]["user_locked"] = true;
                instance.custom_variables[Object.keys(object.userData.custom_variables)[1]]["value"] = object.position.y;
                instance.custom_variables[Object.keys(object.userData.custom_variables)[1]]["user_locked"] = true;
                instance.custom_variables[Object.keys(object.userData.custom_variables)[2]]["value"] = object.position.z;
                instance.custom_variables[Object.keys(object.userData.custom_variables)[2]]["user_locked"] = true;
                // instance.custom_variables = { ...instance.custom_variables, ...object.userData.custom_variables }

            }
        }

        //if scale mode we set the scale to the instance custom_variables and we check if the children must be rescaled to hold absolue scale
        //if the children have a scale themselfes, they are ignored
        if (mode == 'scale') {
            let instance: ObjectInstance;
            const sceneInstace = await this.instanceUtility.getTabContextSceneInstance();
            const object_Instances: ObjectInstance[] = [...sceneInstace.class_instances, ...await this.instanceUtility.getAllPortInstancesOfTabContext()];
            instance = object_Instances.find(instance_obj => instance_obj.uuid == object.uuid)


            if (!object.userData.custom_variables) {
                object.userData.custom_variables = {};
            }

            object.userData.custom_variables.scale = object.scale;
            object.traverse((child: THREE.Mesh) => {
                if (child != object) {
                    const newScale: THREE.Vector3 = new THREE.Vector3(1, 1, 1).divide(object.scale);
                    if (!child.userData || !("custom_variables" in child.userData) || !("scale" in child.userData.custom_variables)) {
                        child.scale.set(newScale.x, newScale.y, newScale.z);
                    }
                    else {
                        const scale: THREE.Vector3 = child.userData.custom_variables["scale"];
                        child.scale.set(scale.x, scale.y, scale.z);
                    }
                }
            });
            //update box
            const selected: THREE.Mesh = this.globalSelectedObject.getObject();
        }

        if (controls && object && mode == 'rotate') {
            let instance: ObjectInstance;
            const sceneInstace = await this.instanceUtility.getTabContextSceneInstance();
            const object_Instances: ObjectInstance[] = [...sceneInstace.class_instances, ...await this.instanceUtility.getAllPortInstancesOfTabContext()];
            instance = object_Instances.find(instance_obj => instance_obj.uuid == object.uuid)
            if (!instance) {
                instance = object_Instances.find(instance_obj => instance_obj.uuid == object.parent.uuid)
            }

            //updates the rx, ry, rz and rw of the instance when label is rotated
            if (object.uuid != instance.uuid && object.userData.custom_variables) {
                object.userData.custom_variables[Object.keys(object.userData.custom_variables)[3]]["value"] = object.quaternion.x;
                object.userData.custom_variables[Object.keys(object.userData.custom_variables)[3]]["user_locked"] = true;
                object.userData.custom_variables[Object.keys(object.userData.custom_variables)[4]]["value"] = object.quaternion.y;
                object.userData.custom_variables[Object.keys(object.userData.custom_variables)[4]]["user_locked"] = true;
                object.userData.custom_variables[Object.keys(object.userData.custom_variables)[5]]["value"] = object.quaternion.z;
                object.userData.custom_variables[Object.keys(object.userData.custom_variables)[5]]["user_locked"] = true;
                object.userData.custom_variables[Object.keys(object.userData.custom_variables)[6]]["value"] = object.quaternion.w;
                object.userData.custom_variables[Object.keys(object.userData.custom_variables)[6]]["user_locked"] = true;
                
                //update instance custom_variables on instance as well
                instance.custom_variables[Object.keys(object.userData.custom_variables)[3]]["value"] = object.quaternion.x;
                instance.custom_variables[Object.keys(object.userData.custom_variables)[3]]["user_locked"] = true;
                instance.custom_variables[Object.keys(object.userData.custom_variables)[4]]["value"] = object.quaternion.y;
                instance.custom_variables[Object.keys(object.userData.custom_variables)[4]]["user_locked"] = true;
                instance.custom_variables[Object.keys(object.userData.custom_variables)[5]]["value"] = object.quaternion.z;
                instance.custom_variables[Object.keys(object.userData.custom_variables)[5]]["user_locked"] = true;
                instance.custom_variables[Object.keys(object.userData.custom_variables)[6]]["value"] = object.quaternion.w;
                instance.custom_variables[Object.keys(object.userData.custom_variables)[6]]["user_locked"] = true;
                // instance.custom_variables = { ...instance.custom_variables, ...object.userData.custom_variables }
            
            }
        }

        this.globalObjectInstance.render = true;
    }
}