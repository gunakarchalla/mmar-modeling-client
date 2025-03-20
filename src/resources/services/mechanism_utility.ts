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
        private gc: GlobalDefinition,
        private metaUtility: MetaUtility,
        private expression: ExpressionUtility,
        private instanceUtility: InstanceUtility
    ) { }

    /**
     * Executes the mechanism on the instance.
     */
    async executeMechanismOnInstance() {
        const tabContext = this.gc.tabContext;
        const selectedTab = this.gc.selectedTab;
        const sceneInstance = tabContext[selectedTab]?.sceneInstance;

        if (sceneInstance) {

            // get all attribute instances from the sceneinstance
            const allAttributeInstances: AttributeInstance[] = await this.instanceUtility.getAllAttributeInstancesFromObjectInstanceRecursively(sceneInstance);
            // filter attributes that match mechanism function
            const targetAttributeInstances = allAttributeInstances.filter(attributeInstance => attributeInstance.value.startsWith("async function"));
            console.log(targetAttributeInstances);

            if (targetAttributeInstances.length > 0) {
                for (const targetAttributeInstance of targetAttributeInstances) {
                    const generalMechanismCode = targetAttributeInstance.value.toString();
                    let contextInstance;
                    if (targetAttributeInstance.assigned_uuid_class_instance) {
                        contextInstance = await this.instanceUtility.getClassInstance(targetAttributeInstance.assigned_uuid_class_instance);
                    } else if (targetAttributeInstance.assigned_uuid_port_instance) {
                        contextInstance = await this.instanceUtility.getPortInstance(targetAttributeInstance.assigned_uuid_port_instance);
                    } else if (targetAttributeInstance.assigned_uuid_scene_instance) {
                        contextInstance = await this.instanceUtility.getSceneInstance(targetAttributeInstance.assigned_uuid_scene_instance);
                    }

                    contextInstance ? await this.runMechanismFunction(generalMechanismCode, contextInstance) : console.log("No context instance found for mechanism");
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