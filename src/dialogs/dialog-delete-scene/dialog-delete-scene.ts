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
import { FetchHelper } from 'resources/services/fetchHelper';


export class DialogDeleteScene {

    @bindable tree = null;
    selectedSceneInstance: SceneInstance = null;

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
        private hybridAlgorithmsService: HybridAlgorithmsService,
        private fetchHelper: FetchHelper
    ) {
    }


    async deleteScene() {
        await this.fetchHelper.sceneInstancesAllDELETE2(this.selectedSceneInstance.uuid).then(async (response) => {
            this.logger.log('SceneInstance' + this.selectedSceneInstance.uuid + ' deleted', 'delete');
        });

         

        this.eventAggregator.publish('initSceneGroup');
        this.selectedSceneInstance = null;
    }
    cancel() {
        this.logger.log('cancel button clicked', 'close');
    }

    onSelectionChange(event: CustomEvent) {
        this.selectedSceneInstance = event.detail.value;
    }
}