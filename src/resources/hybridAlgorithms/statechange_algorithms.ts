import { singleton } from "aurelia";
import { GlobalDefinition } from "resources/global_definitions";
import { InstanceUtility } from "resources/services/instance_utility";
import * as THREE from 'three';
import { AttributeInstance, ClassInstance } from "../../../../mmar-global-data-structure";

@singleton()
export class StatechangeAlgorithms {

    constructor(
        private instanceUtility: InstanceUtility,
        private globalObjectInstance: GlobalDefinition
    ) { }


    async checkForReference() {
        //ada138a9-646c-4df4-8622-fb79092a9ad0 is the uuid for the Reference metaclass
        //get all Reference classInstances
        // let referenceInstances = await this.instanceUtility.getAllClassInstancesOfMetaClass("ada138a9-646c-4df4-8622-fb79092a9ad0");

        let currentSceneInstance = await this.instanceUtility.getTabContextSceneInstance();
        let referenceInstances = currentSceneInstance.class_instances.filter(classInstance => classInstance.uuid_class == "ada138a9-646c-4df4-8622-fb79092a9ad0");

        //for each referenceInstance
        for (const referenceInstance of referenceInstances) {
            //get the attributeInstance of the attribute b8d05324-ed3b-4c10-885a-164ec15a0f36 -> Augmentation_Reference
            const augmentationReferenceAttributeInstances = referenceInstance.attribute_instance.filter(attribute_instance => attribute_instance.uuid_attribute == "b8d05324-ed3b-4c10-885a-164ec15a0f36");
            //if there is an attributeInstance
            if (augmentationReferenceAttributeInstances.length > 0 && augmentationReferenceAttributeInstances[0].value != "" && augmentationReferenceAttributeInstances[0].role_instance_from) {
                let uuid_has_reference_class_instance = augmentationReferenceAttributeInstances[0].role_instance_from.uuid_has_reference_class_instance;
                let uuid_has_reference_scene_instance = augmentationReferenceAttributeInstances[0].role_instance_from.uuid_has_reference_scene_instance;
                let uuid_has_reference_relationclass_instance = augmentationReferenceAttributeInstances[0].role_instance_from.uuid_has_reference_relationclass_instance;
                let uuid_has_reference_port_instance = augmentationReferenceAttributeInstances[0].role_instance_from.uuid_has_reference_port_instance;

                //case 1: reference to class instance
                //we replace the referenceInstance object with the referenced object
                if (uuid_has_reference_class_instance) {
                    //find the 3D object in any scene of the tabContext
                    const tabContext = this.globalObjectInstance.tabContext[this.globalObjectInstance.selectedTab];
                    const allOpenThreeScenes: THREE.Scene[] = await this.instanceUtility.getAllOpenThreeScenes();
                    //find the 3D object in any scene of the tabContext
                    let object = null;
                    for (const threeScene of allOpenThreeScenes) {
                        object = threeScene.getObjectByProperty('uuid', uuid_has_reference_class_instance);
                        if (object) {
                            break;
                        }
                    }

                    //if there is an object we replace the referenceInstance object with the found object
                    if (object) {
                        //get the 3D object of the referenceInstance
                        const threeScene = this.globalObjectInstance.scene;
                        const referenceObject: THREE.Object3D = threeScene.getObjectByProperty('uuid', referenceInstance.uuid);
                        //we replace the referenceInstance object with the found object
                        if (referenceObject) {
                            referenceObject.geometry = object.geometry;
                            referenceObject.material = object.material;
                        }
                    }
                } else if (uuid_has_reference_scene_instance) {
                    console.info("not implemented yet")
                } else if (uuid_has_reference_relationclass_instance) {
                    console.info("not implemented yet")
                } else if (uuid_has_reference_port_instance) {
                    console.info("not implemented yet")
                }
            }
        }
    }

    //method to set the attributeInstance values of the Reference metaclass instances according to the threejs values
    async updateReferenceClassAttributeInstanceValues() {
        //get classes of the current scene
        let currentSceneInstance = await this.instanceUtility.getTabContextSceneInstance();
        //get all Reference classInstances
        let referenceInstances = currentSceneInstance.class_instances.filter(classInstance => classInstance.uuid_class == "ada138a9-646c-4df4-8622-fb79092a9ad0");
        const threeScene = this.globalObjectInstance.scene;
        //for each referenceInstance
        for (const referenceInstance of referenceInstances) {
            const referenceObject: THREE.Object3D = threeScene.getObjectByProperty('uuid', referenceInstance.uuid);
            if (referenceObject) {
                let position = referenceObject.position;
                let rotation = referenceObject.quaternion;

                //get the attributeInstance of the attribute 5a038d67-bc1a-4881-86e8-f53f37dae5d6 -> Position X
                const positionX = referenceInstance.attribute_instance.find(attribute_instance => attribute_instance.uuid_attribute == "5a038d67-bc1a-4881-86e8-f53f37dae5d6");
                //get the attributeInstance of the attribute 455eae8f-35c7-44f9-8909-468972f53341 -> Position Y
                const positionY = referenceInstance.attribute_instance.find(attribute_instance => attribute_instance.uuid_attribute == "455eae8f-35c7-44f9-8909-468972f53341");
                //get the attributeInstance of the attribute d84b02fd-3c04-4612-82f5-b7a1eb95a7c4 -> Position Z
                const positionZ = referenceInstance.attribute_instance.find(attribute_instance => attribute_instance.uuid_attribute == "d84b02fd-3c04-4612-82f5-b7a1eb95a7c4");
                //get the attributeInstance of the attribute 21ae60ea-be54-432c-a7c5-c66085f098a8 -> Rotation X
                const rotationX = referenceInstance.attribute_instance.find(attribute_instance => attribute_instance.uuid_attribute == "21ae60ea-be54-432c-a7c5-c66085f098a8");
                //get the attributeInstance of the attribute 35eaa212-71c2-4b15-8da9-4dc29be6b4e4 -> Rotation Y
                const rotationY = referenceInstance.attribute_instance.find(attribute_instance => attribute_instance.uuid_attribute == "35eaa212-71c2-4b15-8da9-4dc29be6b4e4");
                //get the attributeInstance of the attribute 8a4d3bc4-3dfb-4145-983c-dafe42a4b26e -> Rotation Z
                const rotationZ = referenceInstance.attribute_instance.find(attribute_instance => attribute_instance.uuid_attribute == "8a4d3bc4-3dfb-4145-983c-dafe42a4b26e");
                //get the attributeInstance of the attribute e4e03c44-63e9-4d36-9304-a8fea5300cd3 -> Rotation W
                const rotationW = referenceInstance.attribute_instance.find(attribute_instance => attribute_instance.uuid_attribute == "e4e03c44-63e9-4d36-9304-a8fea5300cd3");
                // get the attributeInstance of the attribute 3a5b4525-4616-49f5-a5b1-2f9f4d8ec483 -> Set Rotation
                const setRotation = referenceInstance.attribute_instance.find(attribute_instance => attribute_instance.uuid_attribute == "3a5b4525-4616-49f5-a5b1-2f9f4d8ec483");
                // get the attributeInstance of the attribute 043daf98-2cdd-4b85-9e7a-8d983c43f565 -> Set Position
                const setPosition = referenceInstance.attribute_instance.find(attribute_instance => attribute_instance.uuid_attribute == "043daf98-2cdd-4b85-9e7a-8d983c43f565");

                if (positionX && positionY && positionZ && setPosition.value == "true") {
                    positionX.value = position.x;
                    positionY.value = position.y;
                    positionZ.value = position.z;
                }

                if (rotationX && rotationY && rotationZ && rotationW && setRotation.value == "true") {
                    rotationX.value = rotation.x;
                    rotationY.value = rotation.y;
                    rotationZ.value = rotation.z;
                    rotationW.value = rotation.w;
                }
            }
        }
    }

    async updateThreejsObject(classInstance: ClassInstance) {
        const threeScene = this.globalObjectInstance.scene;
        if (threeScene) {
            const referenceObject: THREE.Object3D = threeScene.getObjectByProperty('uuid', classInstance.uuid);


            let attributeInstances = classInstance.attribute_instance;
            //get the attributeInstance of the attribute 5a038d67-bc1a-4881-86e8-f53f37dae5d6 -> Position X
            const positionX = attributeInstances.find(attribute_instance => attribute_instance.uuid_attribute == "5a038d67-bc1a-4881-86e8-f53f37dae5d6");
            //get the attributeInstance of the attribute 455eae8f-35c7-44f9-8909-468972f53341 -> Position Y
            const positionY = attributeInstances.find(attribute_instance => attribute_instance.uuid_attribute == "455eae8f-35c7-44f9-8909-468972f53341");
            //get the attributeInstance of the attribute d84b02fd-3c04-4612-82f5-b7a1eb95a7c4 -> Position Z
            const positionZ = attributeInstances.find(attribute_instance => attribute_instance.uuid_attribute == "d84b02fd-3c04-4612-82f5-b7a1eb95a7c4");
            //get the attributeInstance of the attribute 21ae60ea-be54-432c-a7c5-c66085f098a8 -> Rotation X
            const rotationX = attributeInstances.find(attribute_instance => attribute_instance.uuid_attribute == "21ae60ea-be54-432c-a7c5-c66085f098a8");
            //get the attributeInstance of the attribute 35eaa212-71c2-4b15-8da9-4dc29be6b4e4 -> Rotation Y
            const rotationY = attributeInstances.find(attribute_instance => attribute_instance.uuid_attribute == "35eaa212-71c2-4b15-8da9-4dc29be6b4e4");
            //get the attributeInstance of the attribute 8a4d3bc4-3dfb-4145-983c-dafe42a4b26e -> Rotation Z
            const rotationZ = attributeInstances.find(attribute_instance => attribute_instance.uuid_attribute == "8a4d3bc4-3dfb-4145-983c-dafe42a4b26e");
            //get the attributeInstance of the attribute e4e03c44-63e9-4d36-9304-a8fea5300cd3 -> Rotation W
            const rotationW = attributeInstances.find(attribute_instance => attribute_instance.uuid_attribute == "e4e03c44-63e9-4d36-9304-a8fea5300cd3");
            // get the attributeInstance of the attribute 3a5b4525-4616-49f5-a5b1-2f9f4d8ec483 -> Set Rotation
            const setRotation = attributeInstances.find(attribute_instance => attribute_instance.uuid_attribute == "3a5b4525-4616-49f5-a5b1-2f9f4d8ec483");
            // get the attributeInstance of the attribute 043daf98-2cdd-4b85-9e7a-8d983c43f565 -> Set Position
            const setPosition = attributeInstances.find(attribute_instance => attribute_instance.uuid_attribute == "043daf98-2cdd-4b85-9e7a-8d983c43f565");

            if (positionX && setPosition.value == "true") {
                referenceObject.position.x = parseFloat(positionX.value);
            }
            if (positionY && setPosition.value == "true") {
                referenceObject.position.y = parseFloat(positionY.value);
            }
            if (positionZ && setPosition.value == "true") {
                referenceObject.position.z = parseFloat(positionZ.value);
            }

            const quaternion = new THREE.Quaternion(rotationX.value, rotationY.value, rotationZ.value, rotationW.value);
            // check if the rotation of an object corresponds to the quaternion values
            if (setRotation.value == "true" && referenceObject.quaternion.x != quaternion.x || referenceObject.quaternion.y != quaternion.y || referenceObject.quaternion.z != quaternion.z || referenceObject.quaternion.w != quaternion.w) {
                //reset object to world no rotation
                referenceObject.quaternion.set(0, 0, 0, 1);
                referenceObject.setRotationFromQuaternion(quaternion);
            }
        }
    }

}