import { GlobalDefinition } from "resources/global_definitions";
import { PersistencyHandler } from "resources/persistency_handler";

import { Logger } from 'resources/services/logger';

export class AutoSave {

    constructor(
        private globalObjectInstance: GlobalDefinition,
        private logger: Logger,
        private persistencyHandler: PersistencyHandler
    ) {
    }

    async attached() {
        // start 5 sec interval
        // if the autoSave is true, and the globalObjectInstance doSceneInstancePatch is true,
        // make a patch to the server
        setInterval(async () => {
            if (this.globalObjectInstance.autoSave && this.globalObjectInstance.doSceneInstancePatch) {
                this.logger.log('AutoSave: ' + this.globalObjectInstance.autoSave, 'info');
                await this.persistencyHandler.persistSceneInstanceToDB();
                this.globalObjectInstance.doSceneInstancePatch = false;
            }
        }, 5000);
    }

    //when the toggle button is clicked the camera is changed from 2d to 3d and vice versa
    //this includes also seperate orbitcontrols for 2d and 3d
    async toggle() {
        this.globalObjectInstance.autoSave = !this.globalObjectInstance.autoSave;
        this.logger.log('CameraToggle toggle ' + this.globalObjectInstance.autoSave, 'info')
    }
}