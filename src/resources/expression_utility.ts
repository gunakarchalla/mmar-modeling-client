import { singleton } from 'aurelia';
import { GlobalDefinition } from './global_definitions';
import { InstanceUtility } from './services/instance_utility';
import { UUID } from 'crypto';
import { AttributeInstance, ClassInstance, RelationclassInstance } from '../../../mmar-global-data-structure';

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
        let current_class_instance = this.globalObjectInstance.current_class_instance;
        let attributeInstances = await this.instanceUtility.getAttributeInstanceFromClassInstance(attrUUID, current_class_instance?.uuid, "uuid");
        // if not found in class, get from relationclassInstance
        if (!attributeInstances) {
            attributeInstances = await this.instanceUtility.getAttributeInstanceFromRelationClassInstance(attrUUID, current_class_instance?.uuid, "uuid");
        }
        // if not found in relationclass, get from portInstance
        if (!attributeInstances && this.globalObjectInstance.current_port_instance) {
            attributeInstances = await this.instanceUtility.getAttributeInstanceFromPortInstance(attrUUID, this.globalObjectInstance.current_port_instance.uuid, "uuid");
        }
        return attributeInstances?.value;
    }

    /**
     * Calls the value of the attribute instance in the local client based on the name of the meta attribute.
     * The context is the current class instance.
     * 
     * @param {string} attributeName - The name of the meta attribute.
     * @returns {Promise<string>} - A promise resolving to the value of the attributInstance.
     */
    async attrvalByName(attrName: string): Promise<string> {
        let attributeInstances = await this.instanceUtility.getAttributeInstanceFromClassInstance(attrName, this.globalObjectInstance.current_class_instance?.uuid, "name");
        // if not found in class, get from relationclassInstance
        if (!attributeInstances) {
            attributeInstances = await this.instanceUtility.getAttributeInstanceFromRelationClassInstance(attrName, this.globalObjectInstance.current_class_instance?.uuid, "name");
        }
        // if not found in relationclass, get from portInstance
        if (!attributeInstances && this.globalObjectInstance.current_port_instance) {
            attributeInstances = await this.instanceUtility.getAttributeInstanceFromPortInstance(attrName, this.globalObjectInstance.current_port_instance.uuid, "name");
        }
        return attributeInstances?.value;
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
        return attributeInstances?.value;
    }

    /**
        * Retrieves the attribute instance in the local client based on the UUID of any type of instance and the meta attribute UUID.
        * 
        * @param {string} instanceUUID - The UUID of any type of instance.
        * @param {string} metaAttributeUUID - The UUID of the meta attribute.
        * @returns {Promise<AttributeInstance>} - A promise resolving to the attribute instance. 
        */
    async getAttrByInstanceUUID(instanceUUID: string, metaAttributeUUID: string): Promise<AttributeInstance> {
        const instance = await this.instanceUtility.getAnyInstance(instanceUUID);
        const attributeInstance = await this.instanceUtility.getAttributeInstanceFromAnyInstance(metaAttributeUUID, instance.uuid, "uuid");
        return attributeInstance;
    }

    /**
     * Updates the value of the attribute instance in the local client based on the UUID of any type of instance and the meta attribute UUID.
     * 
     * @param {string} instanceUUID - The UUID of any type of instance.
     * @param {string} metaAttributeUUID - The UUID of the meta attribute. 
     * @param {any} value - The new value of the attribute instance. 
     */
    async setAttrvalByInstanceUUID(instanceUUID: string, metaAttributeUUID: string, value: any) {
        const instance = await this.instanceUtility.getAnyInstance(instanceUUID);
        const attributeInstance = await this.instanceUtility.getAttributeInstanceFromAnyInstance(metaAttributeUUID, instance.uuid, "uuid");
        attributeInstance.value = value;
    }

    /**
     * Retrieves all class (and relation class) instances in the local client based on the UUID of the meta class.
     * 
     * @param {string} metaClassUUID - The UUID of the meta class.
     * @returns {Promise<ClassInstance[]>} - A promise resolving to an array of the class (and relation class) instances. 
     */
    async getClassInstancesByMetaUUID(metaClassUUID: string): Promise<ClassInstance[]> {
        const instances = await this.instanceUtility.getAllClassInstancesFromOpenSceneInstance();
        return instances.filter(inst =>
            (inst instanceof ClassInstance && inst.uuid_class === metaClassUUID) ||
            (inst instanceof RelationclassInstance && inst.uuid_relationclass === metaClassUUID)
        );
    }


    /**
     * Retrieves the source (origin) class instance in the local client based on the UUID of the relation class instance. 
     * 
     * @param {string} relInstanceUUID - The UUID of the relation class instance.
     * @returns {Promise<ClassInstance>} - A promise resolving to the source class instance. 
     */
    async getSourceByRelInstanceUUID(relInstanceUUID: string): Promise<ClassInstance> {
        const relInstance = await this.instanceUtility.getAnyInstance(relInstanceUUID);
        if (relInstance instanceof RelationclassInstance) {
            const classUUID = relInstance.role_instance_from.uuid_has_reference_class_instance;
            const classInstance = await this.instanceUtility.getAnyInstance(classUUID);
            if (classInstance instanceof ClassInstance) {
                return classInstance;
            }
        }
    }

    /**
     * Retrieves the destination (target) class instance in the local client based on the UUID of the relation class instance. 
     * 
     * @param {string} relInstanceUUID - The UUID of the relation class instance.
     * @returns {Promise<ClassInstance>} - A promise resolving to the destination class instance. 
     */
    async getDestinationByRelInstanceUUID(relInstanceUUID: string): Promise<ClassInstance> {
        const relInstance = await this.instanceUtility.getAnyInstance(relInstanceUUID);
        if (relInstance instanceof RelationclassInstance) {
            const classUUID = relInstance.role_instance_to.uuid_has_reference_class_instance;
            const classInstance = await this.instanceUtility.getAnyInstance(classUUID);
            if (classInstance instanceof ClassInstance) {
                return classInstance;
            }
        }
    }

    /**
 * Retrieves all relation class instances in the local client where the given instance is the destination (target) based on its UUID and optionally filters them by a specific relation type (metaClassUUID).
 * @param {string} instanceUUID - The UUID of any type of instance.
 * @param {string|null} [metaClassUUID=null] - Optional UUID of the relation class type to filter by.
 * @returns {Promise<RelationclassInstance[]>} - A promise resolving to an array of incoming relation class instances. 
 */
    async getIncomingRelationsByInstanceUUID(instanceUUID: string, metaClassUUID: string | null = null): Promise<RelationclassInstance[]> {
        const relationClasses = await this.instanceUtility.getIncomingRelationsFromInstance(instanceUUID, metaClassUUID);
        return relationClasses;
    }

    /**
     * Retrieves all relation class instances in the local client where the given instance is the source (origin) based on its UUID and optionally filters them by a specific relation type (metaClassUUID).
     * 
     * @param {string} instanceUUID - The UUID of any type of instance.
     * @param {string|null} [metaClassUUID=null] - Optional UUID of the relation class type to filter by.
     * @returns {Promise<RelationclassInstance[]>} - A promise resolving to an array of outgoing relation class instances. 
     */
    async getOutgoingRelationsByInstanceUUID(instanceUUID: string, metaClassUUID: string | null = null): Promise<RelationclassInstance[]> {
        const relationClasses = await this.instanceUtility.getOutgoingRelationsFromInstance(instanceUUID, metaClassUUID);
        return relationClasses;
    }

    /**
     * Checks if any type of instance in the local client has both incoming and outgoing relations (i.e. is connected).
     * 
     * @param {string} instanceUUID - The UUID of any type of instance. 
     * @returns {Promise<boolean>} - A promise resolving to "true" if the instance is connected, or "false" otherwise. 
     */
    async isConnected(instanceUUID: string): Promise<boolean> {
        const incomingRelations = await this.instanceUtility.getIncomingRelationsFromInstance(instanceUUID);
        const outgoingRelations = await this.instanceUtility.getOutgoingRelationsFromInstance(instanceUUID);
        return incomingRelations.length > 0 && outgoingRelations.length > 0;
    }


}