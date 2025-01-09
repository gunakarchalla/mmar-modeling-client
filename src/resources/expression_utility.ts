import { singleton } from 'aurelia';
import { GlobalDefinition } from './global_definitions';
import { InstanceUtility } from './services/instance_utility';

@singleton()
export class ExpressionUtility {


    constructor(
        private globalObjectInstance: GlobalDefinition,
        private instanceUtility: InstanceUtility,
    ) {
    }


    /**
     * Calls the value of the attribute instance in the local client based on the UUID of the meta attribute.
     * The context is the current class instance.
     * 
     * @param {string} UUID - The UUID of the meta attribute.
     * @returns {Promise<string>} - A promise resolving to the value of the attributInstance.
     */
    async attrval(attrUUID: string): Promise<string> {
        let attributeInstances = await this.instanceUtility.getAttributeInstanceFromClassInstance(attrUUID, this.globalObjectInstance.current_class_instance.uuid, "uuid");
        // if not found in class, get from relationclassInstance
        if (!attributeInstances){
            attributeInstances = await this.instanceUtility.getAttributeInstanceFromRelationClassInstance(attrUUID, this.globalObjectInstance.current_class_instance.uuid, "uuid");
        }
        // if not found in relationclass, get from portInstance
        if (!attributeInstances){
            attributeInstances = await this.instanceUtility.getAttributeInstanceFromPortInstance(attrUUID, this.globalObjectInstance.current_port_instance.uuid, "uuid");
        }
        return attributeInstances.value;
    }

    /**
     * Calls the value of the attribute instance in the local client based on the name of the meta attribute.
     * The context is the current class instance.
     * 
     * @param {string} attributeName - The name of the meta attribute.
     * @returns {Promise<string>} - A promise resolving to the value of the attributInstance.
     */
    async attrvalByName(attrName: string): Promise<string> {
        let attributeInstances = await this.instanceUtility.getAttributeInstanceFromClassInstance(attrName, this.globalObjectInstance.current_class_instance.uuid, "name");
        // if not found in class, get from relationclassInstance
        if (!attributeInstances){
            attributeInstances = await this.instanceUtility.getAttributeInstanceFromRelationClassInstance(attrName, this.globalObjectInstance.current_class_instance.uuid, "name");
        }
        // if not found in relationclass, get from portInstance
        if (!attributeInstances){
            attributeInstances = await this.instanceUtility.getAttributeInstanceFromPortInstance(attrName, this.globalObjectInstance.current_port_instance.uuid, "name");
        }
        return attributeInstances.value;
    }

    /**
     * Calls the value of the attribute instance in the local client based on the UUID of any type of instance and the meta attribute UUID.
     * 
     * @param {string} instUUID - The UUID of any type of instance.
     * @param {string} attrUUID - The UUID of the meta attribute.
     * @returns {Promise<string>} - A promise resolving to the value of the attributInstance.
     */
    async attrvalByInst(attrUUID: string, instUUID: string): Promise<string> {
        const instance = await this.instanceUtility.getAnyInstance(instUUID);
        const attributeInstances = await this.instanceUtility.getAttributeInstanceFromAnyInstance(attrUUID, instance.uuid, "uuid");
        return attributeInstances.value;
    }


    //todo add more functions for the expression utility

}