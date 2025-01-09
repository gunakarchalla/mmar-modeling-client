import { StatechangeAlgorithms } from './../hybridAlgorithms/statechange_algorithms';
import { singleton } from "aurelia";
import { GlobalDefinition } from "resources/global_definitions";
import { InstanceUtility } from "./instance_utility";
import { ObjectspaceAlgorithms } from 'resources/hybridAlgorithms/objectspace_algorithms';
import { AttributeInstance } from '../../../../mmar-global-data-structure/models/instance/Instance_attributes.structure';
import { ClassInstance, PortInstance } from '../../../../mmar-global-data-structure';

@singleton()
export class HybridAlgorithmsService {

    constructor(
        private globalObjectInstance: GlobalDefinition,
        private instanceUtility: InstanceUtility,
        private objectspaceAlgorithms: ObjectspaceAlgorithms,
        private statechangeAlgorithms: StatechangeAlgorithms
    ) {

    }

    async checkHybridAlgorithms(attributeInstance?: AttributeInstance, classInstances?: ClassInstance[], portInstances?: PortInstance[]) {

        // check if open tab is an ObjectSpace Scene
        if (this.globalObjectInstance.tabContext.length > 0) {
            const sceneInstance = await this.instanceUtility.getTabContextSceneInstance();

            //if attributeInstance passed 
            if (attributeInstance) {
                // a3b35b86-2636-4987-8cc4-814f468f6c4b is the uuid for the ObjectSpace SceneType
                if (sceneInstance && sceneInstance.uuid_scene_type == "a3b35b86-2636-4987-8cc4-814f468f6c4b") {
                    //check if there is an augmentation or detectable
                    //only check if the attributeInstance is from attribute Object 3D
                    if (attributeInstance.uuid_attribute == "b058b3b4-b523-4ffe-b08e-4f8dda2831c8") {
                        await this.objectspaceAlgorithms.checkAugmentationsInstance(attributeInstance);
                    }
                    //only check if the attributeInstance is from attribute Image to detect
                    if (attributeInstance.uuid_attribute == "d334dd62-5651-4d0f-a7a0-13718f20da36") {
                        await this.objectspaceAlgorithms.checkDetectableInstance(attributeInstance);
                    }
                }
            }



            //if classInstances passed
            if (classInstances) {
                //we have to check for each classInstance if there is an augmentation or detectable attribute instance 
                const attributeInstancesObject3D = await this.getObject3DAttributeInstances(classInstances);
                for (const attributeInstance of attributeInstancesObject3D) {
                    await this.objectspaceAlgorithms.checkAugmentationsInstance(attributeInstance);
                }
                const attributeInstancesImageToDetect = await this.getImageToDetectAttributeInstances(classInstances);
                for (const attributeInstance of attributeInstancesImageToDetect) {
                    await this.objectspaceAlgorithms.checkDetectableInstance(attributeInstance);
                }

                // ada138a9-646c-4df4-8622-fb79092a9ad0 is the uuid of the clas "Reference"
                const referenceClassInstances = await this.getReferenceClassInstances(classInstances);
                if (referenceClassInstances) {
                    for (const classInstance of referenceClassInstances) {
                        await this.statechangeAlgorithms.updateThreejsObject(classInstance)
                    }
                }
            }

            //if portInstances passed
            if (portInstances) {
                //we have to check for each portInstance if there is an augmentation or detectable attribute instance 
                const attributeInstancesObject3D = await this.getObject3DAttributeInstances(portInstances);
                for (const attributeInstance of attributeInstancesObject3D) {
                    await this.objectspaceAlgorithms.checkAugmentationsInstance(attributeInstance);
                }
                const attributeInstancesImageToDetect = await this.getImageToDetectAttributeInstances(portInstances);
                for (const attributeInstance of attributeInstancesImageToDetect) {
                    await this.objectspaceAlgorithms.checkDetectableInstance(attributeInstance);
                }
            }


            //run hybrid algorithm for Statechange -> reference
            // 239c5597-6cc9-498a-bf61-432cf85b3835 is the uuid for the ObjectSpace Statechange
            if (sceneInstance && sceneInstance.uuid_scene_type == "239c5597-6cc9-498a-bf61-432cf85b3835") {
                //check if there is an Reference Class Instance
                await this.statechangeAlgorithms.checkForReference();
            }
        }
    }

    async getObject3DAttributeInstances(parentInstances: ClassInstance[] | PortInstance[]) {
        let attributeInstances: AttributeInstance[] = [];
        for (const parentInstance of parentInstances) {
            //check if there is a property attribute_instance
            if (parentInstance["attribute_instance"]) {
                attributeInstances = attributeInstances.concat(parentInstance["attribute_instance"]);
            }
            //check if there is a property attribute_instances
            if (parentInstance["attribute_instances"]) {
                attributeInstances = attributeInstances.concat(parentInstance["attribute_instances"]);
            }
        }
        return attributeInstances.filter(attributeInstance => attributeInstance.uuid_attribute == "b058b3b4-b523-4ffe-b08e-4f8dda2831c8");
    }

    async getImageToDetectAttributeInstances(parentInstances: ClassInstance[] | PortInstance[]) {
        let attributeInstances: AttributeInstance[] = [];
        for (const parentInstance of parentInstances) {
            //check if there is a property attribute_instance
            if (parentInstance["attribute_instance"]) {
                attributeInstances = attributeInstances.concat(parentInstance["attribute_instance"]);
            }
            //check if there is a property attribute_instances
            if (parentInstance["attribute_instances"]) {
                attributeInstances = attributeInstances.concat(parentInstance["attribute_instances"]);
            }
        }
        return attributeInstances.filter(attributeInstance => attributeInstance.uuid_attribute == "d334dd62-5651-4d0f-a7a0-13718f20da36");
    }

    async updateHybridAlgorithmAttributes() {
        // check if open tab is an ObjectSpace Scene
        if (this.globalObjectInstance.tabContext.length > 0) {
            const sceneInstance = await this.instanceUtility.getTabContextSceneInstance();
            // if sceneInstance is a Statechange SceneType
            if (sceneInstance.uuid_scene_type == "239c5597-6cc9-498a-bf61-432cf85b3835") {
                //update the reference class attribute instance values
                await this.statechangeAlgorithms.updateReferenceClassAttributeInstanceValues();
            }
        }
    }

    async getReferenceClassInstances(classInstances: ClassInstance[]) {
        const referenceClassInstances: ClassInstance[] = [];
        for (const classInstance of classInstances) {
            if (classInstance.uuid_class == "ada138a9-646c-4df4-8622-fb79092a9ad0") {
                referenceClassInstances.push(classInstance);
            }
        }
        return referenceClassInstances;
    }
}