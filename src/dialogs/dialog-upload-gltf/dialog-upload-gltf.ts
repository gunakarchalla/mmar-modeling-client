import { EventAggregator } from "aurelia";
import Uppy from '@uppy/core';
import Dashboard from '@uppy/dashboard';
import '@uppy/core/dist/style.min.css';
import '@uppy/dashboard/dist/style.min.css';
import { plainToInstance } from "class-transformer";
import { AttributeInstance, SceneInstance, SceneType } from "../../../../mmar-global-data-structure";
import { GlobalDefinition } from "resources/global_definitions";
import { bindable } from "aurelia";
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export class DialogUploadGltf {
    private uppy: Uppy;
    @bindable private attributeInstance: AttributeInstance
    @bindable private firstLevel: boolean = null;

    constructor(
        private eventAggregator: EventAggregator,
    ) {
    }

    async attached() {
        //init uppy dashboard
        //only allow gltf files
        this.uppy = new Uppy(
            {
                restrictions: {
                    allowedFileTypes: ['.gltf','.referenceobject']
                }
            }
        );

        //bind dashboard to the dragdrop element
        //if first level, bind to the first dragdrop element
        //if second level, bind to the second dragdrop element
        // we have to do this because the dragdrop element would be rendered twice otherwise
        if (this.firstLevel)
            this.uppy.use(Dashboard, { inline: true, target: '#dragdropfirstlevel', hideUploadButton: true, showProgressDetails: true, width: '100%', height: '200px' });
        else {
            this.uppy.use(Dashboard, { inline: true, target: '#dragdropsecondlevel', hideUploadButton: true, showProgressDetails: true, width: '100%', height: '200px' });
        }
    }

    load() {
        const files = this.uppy.getFiles();
        const reader = new FileReader();

        if (files) {
            for (const file of files) {
                //read the file -> trigger the event listener
                // if file name is .referenceobject, read as data url
                if (file.name.includes('.referenceobject')) {
                    reader.readAsDataURL(file.data);
                    console.log("Reference object uploaded");
                } else {
                reader.readAsText(file.data);
                console.log("GLTF uploaded");
                }
                //remove the file from the uppy dashboard
                this.uppy.removeFile(file.id)
            }
            //timeout to wait for the files to be read
            setTimeout(async () => {
                //publish the event to update the scene group
                this.eventAggregator.publish('gltfUploaded', this.attributeInstance);
            }, 1000);
        }

        //event listener for when the file is loaded
        reader.addEventListener(
            "load",
            () => {
                //when a file is loaded, convert it to string
                const string = reader.result as string;
                this.attributeInstance.value = string;
            },
            { passive: true }
        );
    }
}