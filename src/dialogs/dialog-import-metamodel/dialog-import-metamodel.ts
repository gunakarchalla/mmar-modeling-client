import { Logger } from '../../resources/services/logger';
import { EventAggregator } from "aurelia";

import Uppy from '@uppy/core';
import Dashboard from '@uppy/dashboard';

import '@uppy/core/dist/style.min.css';
import '@uppy/dashboard/dist/style.min.css';

import { plainToInstance } from "class-transformer";
import { SceneType } from "../../../../mmar-global-data-structure";
import { GlobalDefinition } from "resources/global_definitions";

export class DialogImportMetamodel {
    private uppy: Uppy;

    constructor(
        private eventAggregator: EventAggregator,
        private globalObjectInstance: GlobalDefinition,
        private logger: Logger
    ) {
        this.eventAggregator.subscribe('openDialogImportMetamodel', async () => { await this.open() });
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
        this.uppy.use(Dashboard, { inline: true, replaceTargetContent: true, target: '#dragdropMetamodel', hideUploadButton: true, showProgressDetails: true, width: '100%', height: '200px' });

    }

    loadLocal() {
        const files = this.uppy.getFiles();
        const reader = new FileReader();

        if (files) {
            for (const file of files) {
                //read the file -> trigger the event listener
                reader.readAsDataURL(file.data);
                //remove the file from the uppy dashboard
                this.uppy.removeFile(file.id)
            }
            //timeout to wait for the files to be read
            setTimeout(() => {
                //publish the event to update the scene group
                this.eventAggregator.publish('updateSceneGroup');
                this.uppy.close();
            }, 1000);
        }

        //event listener for when the file is loaded
        reader.addEventListener(
            "load",
            () => {
                //when a file is loaded, convert it to JSON string
                const string = reader.result as string;
                const json = atob(string.substring(29));
                const result = JSON.parse(json);

                //convert the json to a SceneType object
                const sceneType = plainToInstance(SceneType, result);
                this.globalObjectInstance.importSceneTypes.push(sceneType);
                this.globalObjectInstance.sceneTypes.push(...[sceneType]);

                this.logger.log("sceneType: " + sceneType.uuid + " pushed to importSceneTypes", "info");
                this.logger.log("importSceneTypes: " + this.globalObjectInstance.importSceneTypes, "info");
            },
            { passive: true }
        );
    }
}