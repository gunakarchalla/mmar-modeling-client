import { EventAggregator } from "aurelia";
import Uppy from '@uppy/core';
import Dashboard from '@uppy/dashboard';
import '@uppy/core/dist/style.min.css';
import '@uppy/dashboard/dist/style.min.css';
import { AttributeInstance } from "../../../../mmar-global-data-structure";
import { bindable } from "aurelia";
import { VizrepUpdateChecker } from "resources/services/vizrep_update_checker";

export class DialogUploadImage {
    private uppy: Uppy;
    @bindable private attributeInstance: AttributeInstance
    @bindable private firstLevel: boolean = null;

    constructor(
        private eventAggregator: EventAggregator,
        private vizrepUpdateChecker: VizrepUpdateChecker
    ) {
    }

    async attached() {
        //init uppy dashboard
        //only allow image files
        this.uppy = new Uppy(
            {
                restrictions: {
                    allowedFileTypes: ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.bmp', '.tiff']
                }
            }
        );

        //bind dashboard to the dragdrop element
        //if first level, bind to the first dragdrop element
        //if second level, bind to the second dragdrop element
        // we have to do this because the dragdrop element would be rendered twice otherwise
        if (this.firstLevel)
            this.uppy.use(Dashboard, { inline: true, target: '#imagedragdropfirstlevel', hideUploadButton: true, showProgressDetails: true, width: '100%', height: '200px' });
        else {
            this.uppy.use(Dashboard, { inline: true, target: '#imagedragdropsecondlevel', hideUploadButton: true, showProgressDetails: true, width: '100%', height: '200px' });
        }
    }

    load() {
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
            setTimeout(async () => {
                //publish the event to update the scene group
                this.eventAggregator.publish('imageUploaded', this.attributeInstance);
            }, 1000);
        }

        //event listener for when the file is loaded
        reader.addEventListener(
            "load",
            () => {
                //when a file is loaded, convert it to base64 string
                const result = reader.result;
                //remove the string 'data:*/*;base64' from the string
                // const string = result.toString().replace(/^data:image\/[a-z]+;base64,/, "");
                this.attributeInstance.value = result.toString();
                
                this.vizrepUpdateChecker.checkForVizRepUpdate(this.attributeInstance);
            },
            { passive: true }
        );
    }
}