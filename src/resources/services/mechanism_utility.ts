import { singleton } from "aurelia";
import { GlobalDefinition } from "resources/global_definitions";
import { MetaUtility } from "./meta_utility";
import { ExpressionUtility } from "resources/expression_utility";
import { InstanceUtility } from "./instance_utility";
import { AttributeInstance, ObjectInstance } from "../../../../mmar-global-data-structure";

/**
 * Utility class for executing mechanisms on instances.
 */
@singleton
export class MechanismUtility {
    constructor(
        private globalObjectInstance: GlobalDefinition,
        private metaUtility: MetaUtility,
        private expression: ExpressionUtility,
        private instanceUtility: InstanceUtility
    ) { }


    async executeAllMechanisms() {
        const tabContext = this.globalObjectInstance.tabContext;
        const selectedTab = this.globalObjectInstance.selectedTab;
        const sceneInstance = tabContext[selectedTab]?.sceneInstance;

        if (sceneInstance) {
            // get all attribute instances from the sceneinstance
            const allAttributeInstances: AttributeInstance[] = await this.instanceUtility.getAllAttributeInstancesFromObjectInstanceRecursively(sceneInstance);
            // filter attributes that match mechanism function -> check if value contains 'function'
            const targetAttributeInstances = allAttributeInstances.filter(attributeInstance => attributeInstance.value.toString().includes('function'));
            //check if attributeType of meta attribute is mechanism -> a8e33bad-9eed-4a24-a4b2-406c5439d13a
            if (targetAttributeInstances.length > 0) {
                for (const attributeInstance of targetAttributeInstances) {
                    let attributeTypeUUID = attributeInstance.uuid_attribute;
                    let attribute = await this.metaUtility.getMetaAttribute(attributeTypeUUID);
                    let attributeType = attribute?.attribute_type;
                    if (attributeType.uuid === 'a8e33bad-9eed-4a24-a4b2-406c5439d13a') {

                        const generalMechanismCode = attributeInstance.value.toString();
                        let contextInstance;
                        if (attributeInstance.assigned_uuid_class_instance) {
                            contextInstance = await this.instanceUtility.getClassInstance(attributeInstance.assigned_uuid_class_instance);
                        } else if (attributeInstance.assigned_uuid_port_instance) {
                            contextInstance = await this.instanceUtility.getPortInstance(attributeInstance.assigned_uuid_port_instance);
                        } else if (attributeInstance.assigned_uuid_scene_instance) {
                            contextInstance = await this.instanceUtility.getSceneInstance(attributeInstance.assigned_uuid_scene_instance);
                        }
                        if (contextInstance) {
                            await this.runMechanismFunction(generalMechanismCode, contextInstance)
                        }
                    }
                }
            }
        }
    }

    /**
     * Runs the mechanism function with the provided mechanism code.
     * @param mechanismCode The mechanism code to be executed.
     */
    async runMechanismFunction(mechanismCode: string, contextInstance: ObjectInstance): Promise<void> {
        const mechanismFunction = await this.metaUtility.parseMetaFunction(mechanismCode);
        await mechanismFunction(this.expression, contextInstance);
    }

}