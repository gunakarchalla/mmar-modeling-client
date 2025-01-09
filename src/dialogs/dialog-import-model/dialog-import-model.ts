import { EventAggregator } from "aurelia";


import Uppy from '@uppy/core';
import Dashboard from '@uppy/dashboard';

import '@uppy/core/dist/style.min.css';
import '@uppy/dashboard/dist/style.min.css';
// import '@uppy/drag-drop/dist/style.min.css';

import { plainToInstance } from "class-transformer";
import { SceneInstance } from "../../../../mmar-global-data-structure";
import { GlobalDefinition } from "resources/global_definitions";
import { Logger } from "resources/services/logger";

export class DialogImportModel {
    private uppy: Uppy;

    constructor(
        private eventAggregator: EventAggregator,
        private globalObjectInstance: GlobalDefinition,
        private logger: Logger,
    ) {
        this.eventAggregator.subscribe('openDialogImportModel', async () => { await this.open() });
    }


    async open() {

        //init uppy dashboard
        //only allow json files
        this.uppy = new Uppy(
            {
                restrictions: {
                    allowedFileTypes: ['.json']
                }
            }
        );

        //bind dashboard to the dragdrop element
        this.uppy.use(Dashboard, { inline: true, replaceTargetContent: true, target: '#dragdropModel', hideUploadButton: true, showProgressDetails: true, width: '100%', height: '200px' });
    }

    loadLocal() {
        const files = this.uppy.getFiles();


        if (files) {
            for (const file of files) {
                const reader = new FileReader();
                //read the file -> trigger the event listener
                reader.readAsDataURL(file.data);
                //remove the file from the uppy dashboard
                this.uppy.removeFile(file.id)

                //event listener for when the file is loaded
                reader.addEventListener(
                    "load",
                    () => {
                        //when a file is loaded, convert it to JSON string
                        const string = reader.result as string;
                        const json = atob(string.substring(29));
                        const result = JSON.parse(json);

                        //convert the json to a SceneType object
                        const sceneInstance = plainToInstance(SceneInstance, result);
                        this.globalObjectInstance.importSceneInstances.push(sceneInstance);
                        this.logger.log("sceneInstance: " + sceneInstance.uuid + " pushed to importSceneInstances", "info");
                        this.logger.log("importSceneInstances: " + this.globalObjectInstance.importSceneInstances, "info");
                    },
                    { passive: true }
                );

            }
            //timeout to wait for the files to be read
            setTimeout(() => {
                //publish the event to update the scene group
                this.eventAggregator.publish('updateSceneGroup');
                this.uppy.close();
            }, 1000);
        }
    }
}