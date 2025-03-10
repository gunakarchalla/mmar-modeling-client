import { FetchHelper } from './fetchHelper';
import { plainToInstance } from 'class-transformer';
import { MetaUtility } from './meta_utility';
import { GlobalDefinition } from 'resources/global_definitions';
import { UUID, SceneInstance, ClassInstance, RelationclassInstance, AttributeInstance, PortInstance, ObjectInstance } from '../../../../mmar-global-data-structure';
import { singleton, EventAggregator } from 'aurelia';
import * as THREE from 'three';
import { Logger } from './logger';

@singleton()
export class InstanceUtility {

    constructor(
        private globalObjectInstance: GlobalDefinition,
        private metaUtility: MetaUtility,
        private logger: Logger,
        private eventAggregator: EventAggregator,
        private fetchHelper: FetchHelper
    ) { }



    // Function to get current tab context sceneInstance
    async getTabContextSceneInstance() {
        let tabContext = this.globalObjectInstance.tabContext[this.globalObjectInstance.selectedTab];
        if (tabContext && tabContext["sceneInstance"]) {
            let sceneInstance: SceneInstance = tabContext["sceneInstance"];
            return sceneInstance;
        }
        this.logger.log("no sceneInstance found", "close")
        return undefined;
    }

    async getTabContextThreeInstance() {
        let tabContext: { threeScene: any } = this.globalObjectInstance.tabContext[this.globalObjectInstance.selectedTab] as { threeScene: any };
        let threeScene = tabContext.threeScene;
        return threeScene as THREE.Scene;
    }

    async getAllOpenThreeScenes() {
        let tabContext = this.globalObjectInstance.tabContext;
        let threeScenes: THREE.Scene[] = [];
        for (const tab of tabContext) {
            threeScenes.push(tab.threeScene);
        }
        return threeScenes;
    }

    async getAllOpenSceneInstances() {
        let tabContext = this.globalObjectInstance.tabContext;
        let sceneInstances: SceneInstance[] = [];
        for (const tab of tabContext) {
            sceneInstances.push(tab.sceneInstance);
        }
        return sceneInstances;
    }

    // Create a new tab context for the sceneInstance.
    async createTabContextSceneInstance(sceneInstance: SceneInstance) {

        let sceneType = await this.metaUtility.getSceneTypeByUUID(sceneInstance.uuid_scene_type);

        let threeScene = this.globalObjectInstance.scene;
        threeScene.uuid = sceneInstance.uuid;


        let newTabContext = {
            sceneType: sceneType,
            sceneInstance: sceneInstance,
            threeScene: threeScene,
            contextDragObjects: []
        }

        this.globalObjectInstance.tabContext.push(newTabContext);

        this.globalObjectInstance.selectedTab = this.globalObjectInstance.tabContext.length - 1;
        this.eventAggregator.publish('tabChanged');
        this.globalObjectInstance.dragObjects = newTabContext.contextDragObjects;
        return newTabContext;
    }

    // Function to get the classInstance with the given UUID
    async getClassInstance(uuid: UUID) {
        let sceneInstance = await this.getTabContextSceneInstance();
        let instance_of_uuid = sceneInstance.class_instances.find(classInstance => classInstance.uuid == uuid);
        if (instance_of_uuid) {
            return instance_of_uuid;
        }
        else {
            instance_of_uuid = sceneInstance.relationclasses_instances.find(relationclassInstance => relationclassInstance.uuid == uuid);
            if (instance_of_uuid) {
                return instance_of_uuid;
            }
            //if not in tabContext search in all classes
            else {
                let classInstances = await this.getAllClassInstances();
                instance_of_uuid = classInstances.find(classInstance => classInstance.uuid == uuid);
                if (instance_of_uuid) {
                    return instance_of_uuid;
                }
                else {
                    let relationclassInstances = await this.getAllRelationClassInstances();
                    instance_of_uuid = relationclassInstances.find(relationclassInstance => relationclassInstance.uuid == uuid);
                    if (instance_of_uuid) {
                        return instance_of_uuid;
                    }
                }
            }
        }
    }

    // Function to get all classInstances from local
    async getAllClassInstances() {
        let classInstances: ClassInstance[] = [];
        let sceneInstances = await this.getAllSceneInstancesFromLocal();
        for (const sceneInstance of sceneInstances) {
            classInstances = classInstances.concat(sceneInstance.class_instances);
        }
        return classInstances;
    }

    async getAllClassInstancesOfMetaClass(metaClassUuid: UUID) {
        let classInstances: ClassInstance[] = [];
        let sceneInstances = await this.getAllSceneInstancesFromLocal();
        for (const sceneInstance of sceneInstances) {
            // if classInstance is not yet in classInstances
            for (const classInstance of sceneInstance.class_instances) {
                if (classInstances.filter(instance => instance.uuid == classInstance.uuid).length == 0) {
                    classInstances = classInstances.concat(sceneInstance.class_instances);
                }
            }
        }
        let instancesOfClass = classInstances.filter(classInstance => classInstance.uuid_class == metaClassUuid);
        return instancesOfClass;
    }

    // retrieves all class and relation class instances of the open scene instance 
    async getAllClassInstancesFromOpenSceneInstance() {
        let sceneInstance = await this.getTabContextSceneInstance();
        let instances = sceneInstance.class_instances || [];
        instances = instances.concat(sceneInstance.relationclasses_instances || []);
        return instances;
    }

    async getAllRelationClassInstances() {
        let relationclassInstances: RelationclassInstance[] = [];
        let sceneInstances = await this.getAllSceneInstancesFromLocal();
        for (const sceneInstance of sceneInstances) {
            relationclassInstances = relationclassInstances.concat(sceneInstance.relationclasses_instances);
        }
        return relationclassInstances;
    }

    // Function to get the sceneInstance with the given UUID
    async getSceneInstance(uuid: UUID) {
        let instance_of_uuid = await this.getTabContextSceneInstance();
        if (uuid == instance_of_uuid.uuid) {
            return instance_of_uuid;
        }
        //if not in tabContext search in all sceneInstances
        else {
            let sceneInstances = await this.getAllSceneInstancesFromLocal();
            instance_of_uuid = sceneInstances.find(sceneInstance => sceneInstance.uuid == uuid);
        }
        return instance_of_uuid;
    }

    async getAllSceneInstancesFromLocal() {
        let sceneInstances: SceneInstance[] = [];
        // let tabContextSceneInstance = await this.getTabContextSceneInstance();
        // sceneInstances.push(tabContextSceneInstance);
        for (const sceneType of this.globalObjectInstance.sceneTree) {
            let children = sceneType.children;
            for (const sceneInstance of children) {
                if (children.length > 0 && this.checkIfSceneInstance(sceneInstance)) {
                    sceneInstances.push(sceneInstance);
                }
            }
        }
        return sceneInstances;
    }

    async getAllSceneInstancesFromDB() {
        let sceneTypes = await this.metaUtility.getAllSceneTypesFromDB();
        let sceneInstances: SceneInstance[] = [];
        for (const sceneType of sceneTypes) {
            // fetch sceneInstances of scene type from db
            let sceneInstancesOfSceneType = await this.fetchHelper.sceneInstancesAllGET(sceneType.uuid);
            // add sceneInstances to sceneInstances array
            sceneInstances = sceneInstances.concat(sceneInstancesOfSceneType);
        }
        return sceneInstances;
    }

    // Function to get all portInstances
    async getAllPortInstances() {

        let sceneInstances = await this.getAllSceneInstancesFromLocal();
        let sceneInstancePortInstances = [];
        let classesPortInstances = [];
        let relationclassesPortInstances = [];

        for (const sceneInstance of sceneInstances) {
            sceneInstancePortInstances = sceneInstancePortInstances.concat(sceneInstance.port_instances);

            // Get all portInstances of all classInstances
            for (const classInstance of sceneInstance.class_instances) {
                classesPortInstances = classesPortInstances.concat(classInstance.port_instance);
            }
            // Get all portInstances of all relationclassInstances
            for (const relationclassInstance of sceneInstance.relationclasses_instances) {
                relationclassesPortInstances = relationclassesPortInstances.concat(relationclassInstance.port_instance);
            }

        }

        // Concatenate all portInstances
        let allPortInstances = sceneInstancePortInstances.concat(classesPortInstances);
        allPortInstances = allPortInstances.concat(relationclassesPortInstances);
        return allPortInstances;
    }

    // Function to get the portInstance of open tab context
    async getAllPortInstancesOfTabContext() {
        const tabContext = this.globalObjectInstance.tabContext[this.globalObjectInstance.selectedTab];
        const sceneInstance = tabContext.sceneInstance;
        const sceneInstancePortInstances = sceneInstance.port_instances;
        let classesPortInstances = [];
        let relationclassesPortInstances = [];

        // Get all portInstances of all classInstances
        for (const classInstance of sceneInstance.class_instances) {
            classesPortInstances = classesPortInstances.concat(classInstance.port_instance);
        }
        // Get all portInstances of all relationclassInstances
        for (const relationclassInstance of sceneInstance.relationclasses_instances) {
            relationclassesPortInstances = relationclassesPortInstances.concat(relationclassInstance.port_instance);
        }

        // Concatenate all portInstances
        let allPortInstances = sceneInstancePortInstances.concat(classesPortInstances);
        allPortInstances = allPortInstances.concat(relationclassesPortInstances);
        return allPortInstances;
    }

    // Function to get the portInstance with the given UUID
    async getPortInstance(uuid: UUID): Promise<PortInstance> {
        let allPortInstances = await this.getAllPortInstances();

        // Find portInstance with given UUID
        const instance_of_uuid = allPortInstances.find(portInstance => portInstance.uuid == uuid);
        return instance_of_uuid;
    }

    // Function to get the UUID of the last created classInstance (class or relation)
    async get_current_class_instance_uuid() {
        const uuid: UUID = this.globalObjectInstance.current_class_instance.uuid;
        return uuid;
    }

    // Function to get the UUID of the last created portInstance
    async get_current_port_instance_uuid() {
        const uuid: UUID = this.globalObjectInstance.current_port_instance.uuid;
        return uuid;
    }

    //check if input is sceneInstance
    checkIfSceneInstance(toBeDetermined: any): toBeDetermined is SceneInstance {
        if ((toBeDetermined as SceneInstance).uuid_scene_type) {
            return true
        }
        return false
    }

    // get an attributeInstance based on the UUID or the name of the meta attribute and the UUID of a classInstance
    async getAttributeInstanceFromClassInstance(searchValue: string | UUID, classInstanceUUID: UUID, searchBy: 'uuid' | 'name') {
        let attributeInstance: AttributeInstance = undefined;
        let allAttributeInstances = [];

        // Helper function to find the attributeInstance based on the search criteria
        const findAttributeInstance = (instances) => {
            return searchBy === 'uuid'
                ? instances.find(instance => instance.uuid_attribute == searchValue)
                : instances.find(instance => instance.name == searchValue);
        };

        // Search in classInstances
        const classInstances = await this.getAllClassInstances();
        const classInstanceFound = classInstances.find(instance => instance.uuid == classInstanceUUID);
        if (classInstanceFound) {
            allAttributeInstances = classInstanceFound.attribute_instance;
            attributeInstance = await findAttributeInstance(allAttributeInstances);
        }

        return attributeInstance;
    }

    // get an attributeInstance based on the UUID or the name of the meta attribute and the UUID of a relationclassInstance
    async getAttributeInstanceFromRelationClassInstance(searchValue: string | UUID, relationclassInstanceUUID: UUID, searchBy: 'uuid' | 'name') {
        let attributeInstance: AttributeInstance = undefined;
        let allAttributeInstances = [];

        // Helper function to find the attributeInstance based on the search criteria
        const findAttributeInstance = (instances) => {
            return searchBy === 'uuid'
                ? instances.find(instance => instance.uuid_attribute == searchValue)
                : instances.find(instance => instance.name == searchValue);
        };

        // Search in relationclassInstances
        const relationclassInstances = await this.getAllRelationClassInstances();
        const relationclassInstanceFound = relationclassInstances.find(instance => instance.uuid == relationclassInstanceUUID);
        if (relationclassInstanceFound) {
            allAttributeInstances = relationclassInstanceFound.attribute_instance;
            attributeInstance = findAttributeInstance(allAttributeInstances);
        }

        return attributeInstance;
    }

    // get an attributeInstance based on the UUID or the name of the meta attribute and the UUID of a sceneInstance
    async getAttributeInstanceFromSceneInstance(searchValue: string | UUID, sceneInstanceUUID: UUID, searchBy: 'uuid' | 'name') {
        let attributeInstance: AttributeInstance = undefined;
        let allAttributeInstances = [];

        // Helper function to find the attributeInstance based on the search criteria
        const findAttributeInstance = (instances) => {
            return searchBy === 'uuid'
                ? instances.find(instance => instance.uuid_attribute == searchValue)
                : instances.find(instance => instance.name == searchValue);
        };

        // Search in sceneInstances
        const sceneInstances = await this.getAllSceneInstancesFromLocal();
        const sceneInstanceFound = sceneInstances.find(instance => instance.uuid == sceneInstanceUUID);
        if (sceneInstanceFound) {
            allAttributeInstances = sceneInstanceFound.attribute_instances;
            attributeInstance = findAttributeInstance(allAttributeInstances);
        }

        return attributeInstance;
    }

    /**
 * Collects all attribute instances from an instanceObject recursively.
 * This also includes attribute instances from nested objects.
 * @param obj - The object to collect attribute instances from.
 * @returns A promise that resolves to an array of attribute instances.
 */
    async getAllAttributeInstancesFromObjectInstanceRecursively(obj: ObjectInstance): Promise<AttributeInstance[]> {
        const attributeInstances: AttributeInstance[] = [];

        if (Array.isArray(obj)) {
            for (const item of obj) {
                attributeInstances.push(...(await this.getAllAttributeInstancesFromObjectInstanceRecursively(item)));
            }
        } else if (obj && typeof obj === 'object') {
            for (const key of Object.keys(obj)) {
                if (key === 'attribute_instance' && Array.isArray(obj[key])) {
                    attributeInstances.push(...obj[key]);
                } else {
                    attributeInstances.push(...(await this.getAllAttributeInstancesFromObjectInstanceRecursively(obj[key])));
                }
            }
        }
        return attributeInstances;
    }

    // get an attributeInstance based on the UUID or the name of the meta attribute and the UUID of a portInstance
    async getAttributeInstanceFromPortInstance(searchValue: string | UUID, portInstanceUUID: UUID, searchBy: 'uuid' | 'name') {
        let attributeInstance: AttributeInstance = undefined;
        let allAttributeInstances = [];

        // Helper function to find the attributeInstance based on the search criteria
        const findAttributeInstance = (instances) => {
            return searchBy === 'uuid'
                ? instances.find(instance => instance.uuid_attribute == searchValue)
                : instances.find(instance => instance.name == searchValue);
        };

        // Search in portInstances
        const portInstances: PortInstance[] = await this.getAllPortInstances();
        const portInstanceFound = portInstances.find(instance => instance.uuid == portInstanceUUID);
        if (portInstanceFound) {
            allAttributeInstances = portInstanceFound.attribute_instances;
            attributeInstance = findAttributeInstance(allAttributeInstances);
        }

        return attributeInstance;
    }

    // get an attributeInstance based on the UUID or the name of the meta attribute and the UUID of an instance of any type
    async getAttributeInstanceFromAnyInstance(searchValue: string | UUID, instanceUUID: UUID, searchBy: 'uuid' | 'name') {
        let attributeInstance: AttributeInstance = undefined;
        let allAttributeInstances = [];

        // Helper function to find the attributeInstance based on the search criteria
        const findAttributeInstance = async (instances) => {
            return searchBy === 'uuid'
                ? instances.find(instance => instance.uuid_attribute == searchValue)
                : instances.find(instance => instance.name == searchValue);
        };

        // Search in classInstances
        const classInstances = await this.getAllClassInstances();
        const classInstanceFound = classInstances.find(instance => instance.uuid == instanceUUID);
        if (classInstanceFound) {
            allAttributeInstances = classInstanceFound.attribute_instance;
            attributeInstance = await findAttributeInstance(allAttributeInstances);
        }

        // If not found in classInstances, search in relationclassInstances
        if (!attributeInstance) {
            const relationclassInstances = await this.getAllRelationClassInstances();
            const relationclassInstanceFound = relationclassInstances.find(instance => instance.uuid == instanceUUID);
            if (relationclassInstanceFound) {
                allAttributeInstances = relationclassInstanceFound.attribute_instance;
                attributeInstance = await findAttributeInstance(allAttributeInstances);
            }
        }

        // If not found in relationclassInstances, search in sceneInstances
        if (!attributeInstance) {
            const sceneInstances = await this.getAllSceneInstancesFromLocal();
            const sceneInstanceFound = sceneInstances.find(instance => instance.uuid == instanceUUID);
            if (sceneInstanceFound) {
                allAttributeInstances = sceneInstanceFound.attribute_instances;
                attributeInstance = await findAttributeInstance(allAttributeInstances);
            }
        }

        // If not found in sceneInstances, search in portInstances
        if (!attributeInstance) {
            const portInstances: PortInstance[] = await this.getAllPortInstances();
            const portInstanceFound = portInstances.find(instance => instance.uuid == instanceUUID);
            if (portInstanceFound) {
                allAttributeInstances = portInstanceFound.attribute_instances;
                attributeInstance = await findAttributeInstance(allAttributeInstances);
            }
        }

        return attributeInstance;
    }

    // get an instance of any type based on the UUID
    // this will search the types sceneInstance, classInstance, relationclassInstance, portInstance
    async getAnyInstance(uuid: UUID) {
        let instance: SceneInstance | ClassInstance | RelationclassInstance | PortInstance = undefined;
        let instances = [];

        // Get instances from the first source.
        instances = await this.getAllSceneInstancesFromLocal();
        instance = instances.find(instance => instance.uuid === uuid);

        // If not found, check the next source.
        if (!instance) {
            instances = await this.getAllClassInstances();
            instance = instances.find(instance => instance.uuid === uuid);
        }

        // If still not found, check the next source.
        if (!instance) {
            instances = await this.getAllRelationClassInstances();
            instance = instances.find(instance => instance.uuid === uuid);
        }

        // Finally, check the last source if still not found.
        if (!instance) {
            instances = await this.getAllPortInstances();
            instance = instances.find(instance => instance.uuid === uuid);
        }

        return instance;
    }


    // retrieves all relations where the given instance is the destination and optionally filters by a specific relation type (metaClassUUID)
    async getIncomingRelationsFromInstance(instanceUUID: UUID, metaClassUUID = null) {
        const relationClasses = await this.getAllRelationClassInstances();
        let incomingRelations = relationClasses.filter(rel => rel.role_instance_to.uuid_has_reference_class_instance === instanceUUID);
        if (metaClassUUID) {
            incomingRelations = incomingRelations.filter(rel => rel.uuid_relationclass == metaClassUUID);
        }
        return incomingRelations;
    }

    // retrieves all relations where the given instance is the source and optionally filters by a specific relation type (metaClassUUID)
    async getOutgoingRelationsFromInstance(instanceUUID: UUID, metaClassUUID = null) {
        const relationClasses = await this.getAllRelationClassInstances();
        let outgoingRelations = relationClasses.filter(rel => rel.role_instance_from.uuid_has_reference_class_instance == instanceUUID);
        if (metaClassUUID) {
            outgoingRelations = outgoingRelations.filter(rel => rel.uuid_relationclass == metaClassUUID);
        }
        return outgoingRelations;
    }

}