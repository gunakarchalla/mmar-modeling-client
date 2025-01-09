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


export class DialogCreateNewScene {

    @bindable tree = null;
    selectedSceneType: SceneType = null;
    newSceneInstance: { name: string, description: string } = { name: "", description: "" };
    selectedIndex = null;

    constructor(
        private metaUtility: MetaUtility,
        private sceneInitiator: SceneInitiator,
        private instanceUtility: InstanceUtility,
        private globalObjectInstance: GlobalDefinition,
        private globalClassObject: GlobalClassObject,
        private globalRelationclassObject: GlobalRelationclassObject,
        private logger: Logger,
        private eventAggregator: EventAggregator
    ) { }

    async attached() {
        //subscribe to event aggregator from this -> this.eventAggregator.publish('openCreateNewSceneInstanceDialog', { sceneType: sceneType });
        this.eventAggregator.subscribe('openCreateNewSceneInstanceDialog', async payload => { await this.setValuesFromPayload(payload); });
    }

    async createNewScene() {
        if (this.metaUtility.checkIfSceneType(this.selectedSceneType)) {
            const sceneType = this.selectedSceneType as SceneType;
            const sceneInstance = new SceneInstance(generateUUID(), sceneType.uuid);
            sceneInstance.name = this.newSceneInstance.name;
            sceneInstance.description = this.newSceneInstance.description;

            await this.sceneInitiator.sceneInit();
            await this.instanceUtility.createTabContextSceneInstance(sceneInstance);

            // check if new SceneInstances is from an importet sceneType
            for (const importSceneType of this.globalObjectInstance.importSceneTypes) {
                if (sceneInstance.uuid_scene_type === sceneType.uuid) {

                    let index = this.tree.findIndex((item: { uuid: string; }) => item.uuid === sceneType.uuid);
                    if (index === -1) {
                        this.logger.log(`SceneType with uuid ${sceneType.uuid} not found in tree`, "info");
                        continue;
                    }
                    if (this.tree[index].children === undefined) {
                        this.tree[index].children = [];
                    }
                    this.tree[index].children.push(sceneInstance);
                }
            }

            // set globalClassObject classes
            this.globalClassObject.initClasses()
            this.globalRelationclassObject.initRelationClasses();
            this.logger.log(`SceneInstance with name ${sceneInstance.name} created`, "info");
        }

        this.eventAggregator.publish('updateSceneGroup');
    }
    cancel() {
        this.logger.log('cancel button clicked', 'close');
    }

    onSelectionChange(event: CustomEvent) {
        this.selectedSceneType = event.detail.value;
        this.newSceneInstance.name = "new " + this.selectedSceneType.name;
        console.log(this.selectedIndex);
    }

    //set values from payload -> this is only used if a user makes a double click on a sceneType in the treeview and the dialog should be opened with the selected sceneType
    async setValuesFromPayload(payload) {
        this.selectedSceneType = payload["sceneType"] as SceneType;
        this.newSceneInstance.name = "new " + this.selectedSceneType.name;
        this.selectedIndex = this.selectedSceneType
    }
}