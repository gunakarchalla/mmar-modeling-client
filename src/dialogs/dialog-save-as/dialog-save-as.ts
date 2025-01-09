import { GlobalDefinition } from "resources/global_definitions";
import { SceneInstance } from "../../../../mmar-global-data-structure";
import { Logger } from "resources/services/logger";
import { PersistencyHandler } from "resources/persistency_handler";
import { InstanceUtility } from "resources/services/instance_utility";
import { EventAggregator } from "aurelia";

export class DialogSaveAs {

    sceneInstance: SceneInstance;
    tabContext;

    constructor(
        private globalObjectInstance: GlobalDefinition,
        private logger: Logger,
        private persistencyHandler: PersistencyHandler,
        private instanceUtility: InstanceUtility,
        private eventAggregator: EventAggregator
    ) {
        this.tabContext = this.globalObjectInstance.tabContext;
    }

    async attached() {
        this.eventAggregator.subscribe("openDialogSaveAs", async () => {
            await this.init();
        });
    }

    init() {
        this.sceneInstance = this.tabContext[this.globalObjectInstance.selectedTab]["sceneInstance"] as SceneInstance;
        return ''
    }

    getCoordinates3D() {
        return JSON.stringify(this.sceneInstance.relative_coordinate_3d);
    }

    getAbsoluteCoordinates3D() {
        return JSON.stringify(this.sceneInstance.absolute_coordinate_3d);
    }

    getCustomVariables() {
        return JSON.stringify(this.sceneInstance.custom_variables);
    }

    async saveToText() {
        this.logger.log('saveToText button clicked', 'info');
        await this.persistencyHandler.saveToTextfile();
    }

    async saveToDatabase() {
        this.logger.log('saveToDatabase button clicked', 'info');
        await this.persistencyHandler.persistSceneInstanceToDB()
    }

    cancel() {
        this.logger.log('cancel button clicked', 'close');
    }
}