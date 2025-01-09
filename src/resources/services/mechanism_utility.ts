import { singleton } from "aurelia";
import { GlobalDefinition } from "resources/global_definitions";
import { MetaUtility } from "./meta_utility";
import { ExpressionUtility } from "resources/expression_utility";

/**
 * Utility class for executing mechanisms on instances.
 */
@singleton
export class MechanismUtility {
    constructor(
        private gc: GlobalDefinition,
        private metaUtility: MetaUtility,
        private expression: ExpressionUtility
    ) { }

    /**
     * Executes the mechanism on the instance.
     */
    async executeMechanismOnInstance() {
        const tabContext = this.gc.tabContext;
        const selectedTab = this.gc.selectedTab;
        const classes = tabContext[selectedTab].sceneType.classes;
        const class_instances = tabContext[selectedTab].sceneInstance.class_instances;
        // Prepare a map for quick lookup of attributes by uuid
        const attributeMap = new Map();

        // Collect all attributes from all classes
        classes.forEach(({ attributes }) =>
            // fill the map for quick lookup of attributes by uuid
            attributes.forEach(attribute =>
                attributeMap.set(attribute.uuid, attribute)
            )
        );

        // List all attribute_instances and their corresponding attributes
        const allAttributeInstances = class_instances.flatMap(({ attribute_instance }) =>
            attribute_instance.map(instance => ({
                // get the attribute_instance
                attribute_instance: instance,
                // get the attribute from the map
                attribute: attributeMap.get(instance.uuid_attribute),
                // get the attribute_type from the attribute
                attribute_type: attributeMap.get(instance.uuid_attribute)?.attribute_type
            }))
        );

        // Search for the mechanism attribute_type with the specific UUID
        const targetUUID = "a8e33bad-9eed-4a24-a4b2-406c5439d13a";
        const targetAttributeInstances = allAttributeInstances.filter(({ attribute_type }) => attribute_type?.uuid === targetUUID);

        if (targetAttributeInstances.length > 0) {
            for (const targetAttributeInstance of targetAttributeInstances) {
                const generalMechanismCode = targetAttributeInstance.attribute_instance.value.toString();
                await this.runMechanismFunction(generalMechanismCode);
            }
        }
    }

    /**
     * Runs the mechanism function with the provided mechanism code.
     * @param mechanismCode The mechanism code to be executed.
     */
    async runMechanismFunction(mechanismCode: string) {
        const mechanismFunction = await this.metaUtility.parseMetaFunction(mechanismCode);
        await mechanismFunction(this.expression);
    }
}