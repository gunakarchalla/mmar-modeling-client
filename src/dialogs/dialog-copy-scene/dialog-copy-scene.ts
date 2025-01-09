import { MetaUtility } from 'resources/services/meta_utility';
import { SceneInstance, SceneType } from "../../../../mmar-global-data-structure";
import { SceneInitiator } from 'resources/scene_initiator';
import { InstanceUtility } from 'resources/services/instance_utility';
import { GlobalDefinition } from 'resources/global_definitions';
import { GlobalRelationclassObject } from 'resources/global_relationclass_object';
import { GlobalClassObject } from 'resources/global_class_object';
import { Logger } from 'resources/services/logger';
import { generateUUID } from 'three/src/math/MathUtils';
import { bindable, EventAggregator } from 'aurelia';
import { plainToInstance } from "class-transformer";
import { PersistencyHandler } from 'resources/persistency_handler';
import { HybridAlgorithmsService } from 'resources/services/hybrid_algorithms_service';


export class DialogCopyScene {

    @bindable tree = null;
    selectedSceneInstance: SceneInstance = null;
    newSceneInstance: { name: string, description: string } = { name: "", description: "" };
    allSceneInstances: SceneInstance[] = [];

    constructor(
        private metaUtility: MetaUtility,
        private sceneInitiator: SceneInitiator,
        private instanceUtility: InstanceUtility,
        private globalObjectInstance: GlobalDefinition,
        private globalClassObject: GlobalClassObject,
        private globalRelationclassObject: GlobalRelationclassObject,
        private logger: Logger,
        private eventAggregator: EventAggregator,
        private persistencyHandler: PersistencyHandler,
        private hybridAlgorithmsService: HybridAlgorithmsService
    ) {
        // this.allSceneInstances = [];
        // // get all sceneInstances from tree
        // const treeArray : [] = this.tree as [];
        // treeArray.forEach(sceneType => {
        //     // get children array and append to allSceneInstances
        //     this.allSceneInstances = this.allSceneInstances.concat(sceneType["children"]);
        // });
    }


    async createNewScene() {
        if (this.instanceUtility.checkIfSceneInstance(this.selectedSceneInstance)) {
            const oldSceneInstance = this.selectedSceneInstance;
            const oldSceneInstanceUUID = oldSceneInstance.uuid;
            const newSceneInstanceUUID = generateUUID();

            let sceneInstanceAsString = JSON.stringify(this.selectedSceneInstance);

            // replace old sceneInstance uuid with new uuid
            sceneInstanceAsString = sceneInstanceAsString.replace(new RegExp(oldSceneInstanceUUID, 'g'), newSceneInstanceUUID);

            // For deep copy of SceneInstance
            //const sceneInstance = plainToInstance(SceneInstance, JSON.parse(JSON.stringify(this.selectedSceneInstance)));

            // for each attribute_instance in sceneInstance, create new uuid
            for (const attributeInstance of oldSceneInstance.attribute_instances) {
                const newAttributeInstanceUUID = generateUUID();
                // replace old attributeInstance uuid with new uuid
                sceneInstanceAsString = sceneInstanceAsString.replace(new RegExp(attributeInstance.uuid, 'g'), newAttributeInstanceUUID);
            }

            // for each class_instance in sceneInstance, create new uuid
            for (const classInstance of oldSceneInstance.class_instances) {
                const newClassInstanceUUID = generateUUID();
                // replace old classInstance uuid with new uuid
                sceneInstanceAsString = sceneInstanceAsString.replace(new RegExp(classInstance.uuid, 'g'), newClassInstanceUUID);


                // for each attribute_instance in class_instance, create new uuid
                for (const attributeInstance of classInstance.attribute_instance) {
                    const newAttributeInstanceUUID = generateUUID();
                    // replace old attributeInstance uuid with new uuid
                    sceneInstanceAsString = sceneInstanceAsString.replace(new RegExp(attributeInstance.uuid, 'g'), newAttributeInstanceUUID);

                    // for each table_attribute in attribute_instance, create new uuid
                    attributeInstance.table_attributes.forEach(tableAttribute => {
                        const newTableAttributeUUID = generateUUID();
                        // replace old tableAttribute uuid with new uuid
                        sceneInstanceAsString = sceneInstanceAsString.replace(new RegExp(tableAttribute.uuid, 'g'), newTableAttributeUUID);
                    });
                }
                // for each port in class_instance, create new uuid
                for (const port of classInstance.port_instance) {
                    const newPortUUID = generateUUID();
                    // replace old port uuid with new uuid
                    sceneInstanceAsString = sceneInstanceAsString.replace(new RegExp(port.uuid, 'g'), newPortUUID);

                    // for each attribute_instance in port, create new uuid
                    for (const attributeInstance of port.attribute_instances) {
                        const newAttributeInstanceUUID = generateUUID();
                        // replace old attributeInstance uuid with new uuid
                        sceneInstanceAsString = sceneInstanceAsString.replace(new RegExp(attributeInstance.uuid, 'g'), newAttributeInstanceUUID);
                    }
                }
            }

            // for each relation_instance in sceneInstance, create new uuid
            for (const relationclassInstance of oldSceneInstance.relationclasses_instances) {
                const newRelationInstanceUUID = generateUUID();
                // replace old relationInstance uuid with new uuid
                sceneInstanceAsString = sceneInstanceAsString.replace(new RegExp(relationclassInstance.uuid, 'g'), newRelationInstanceUUID);

                // for each attribute_instance in relation_instance, create new uuid
                for (const attributeInstance of relationclassInstance.attribute_instance) {
                    const newAttributeInstanceUUID = generateUUID();
                    // replace old attributeInstance uuid with new uuid
                    sceneInstanceAsString = sceneInstanceAsString.replace(new RegExp(attributeInstance.uuid, 'g'), newAttributeInstanceUUID);

                    // for each table_attribute in attribute_instance, create new uuid
                    attributeInstance.table_attributes.forEach(tableAttribute => {
                        const newTableAttributeUUID = generateUUID();
                        // replace old tableAttribute uuid with new uuid
                        sceneInstanceAsString = sceneInstanceAsString.replace(new RegExp(tableAttribute.uuid, 'g'), newTableAttributeUUID);
                    });
                }

                // for role_instance_from and role_instance_to in relation_instance, create new uuid
                const newRoleInstanceFromUUID = generateUUID();
                const newRoleInstanceToUUID = generateUUID();
                // replace old roleInstanceFrom uuid with new uuid
                sceneInstanceAsString = sceneInstanceAsString.replace(new RegExp(relationclassInstance.role_instance_from.uuid, 'g'), newRoleInstanceFromUUID);
                // replace old roleInstanceTo uuid with new uuid
                sceneInstanceAsString = sceneInstanceAsString.replace(new RegExp(relationclassInstance.role_instance_to.uuid, 'g'), newRoleInstanceToUUID);
            }

            // convert the json to a SceneInstance object
            const newSceneInstance : SceneInstance = plainToInstance(SceneInstance, JSON.parse(sceneInstanceAsString));

            newSceneInstance.name = this.newSceneInstance.name ;
            newSceneInstance.description = this.newSceneInstance.description;

            await this.sceneInitiator.sceneInit();
            await this.instanceUtility.createTabContextSceneInstance(newSceneInstance);
            await this.persistencyHandler.loadPersistedModel(newSceneInstance);

            // set globalClassObject classes
            this.globalClassObject.initClasses()
            this.globalRelationclassObject.initRelationClasses();

            //check hybrid algorithms -> specifically for reference attributes --> we do not give an attributeInstance as argument
            const classInstances = newSceneInstance.class_instances;
            await this.hybridAlgorithmsService.checkHybridAlgorithms(null, classInstances);

            this.logger.log(`SceneInstance with name ${newSceneInstance.name} created`, "info");
        }

        this.eventAggregator.publish('updateSceneGroup');
    }
    cancel() {
        this.logger.log('cancel button clicked', 'close');
    }

    onSelectionChange(event: CustomEvent) {
        this.selectedSceneInstance = event.detail.value;
        this.newSceneInstance.name = this.selectedSceneInstance.name + " - Copy";
    }
}