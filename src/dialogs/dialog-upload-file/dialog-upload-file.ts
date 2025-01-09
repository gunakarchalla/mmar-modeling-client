import Uppy from '@uppy/core';
import Dashboard from '@uppy/dashboard';
import '@uppy/core/dist/style.min.css';
import '@uppy/dashboard/dist/style.min.css';
import { AttributeInstance } from "../../../../mmar-global-data-structure";
import { bindable } from "aurelia";
import XHRUpload from '@uppy/xhr-upload';
import { validate as uuidValidate } from 'uuid';
import { FetchHelper } from 'resources/services/fetchHelper';
export class DialogUploadFile {
    private uppy: Uppy;

    @bindable private attributeInstance: AttributeInstance;

    updateEndpoint() {
        // Get the XHRUpload plugin instance
        const xhrUpload = this.uppy.getPlugin('XHRUpload');
        if (xhrUpload) {
            // Update the endpoint and method
            xhrUpload.setOptions({ endpoint: this.fetchHelper.getFileUploadbyUUIDUrl(this.attributeInstance.value), method: `PATCH` });
        } else {
            console.error('XHRUpload plugin is not found.');
        }
    }

    constructor(
        private fetchHelper: FetchHelper,
    ) { }

    async attached() {

        this.uppy = new Uppy(
            {
            }
        );

        //Using uppy dashboard and XHRUpload plugin 
        this.uppy.use(Dashboard, { inline: true, target: '#forUpload', showProgressDetails: true, width: '100%', height: '200px' }).use(XHRUpload, {
            endpoint: uuidValidate(this.attributeInstance.value) ? this.fetchHelper.getFileUploadbyUUIDUrl(this.attributeInstance.value) : this.fetchHelper.getFileUploadUrl(),
            method: uuidValidate(this.attributeInstance.value) ? `PATCH` : `POST`,
            fieldName: 'file',
            formData: true,
            responseType: 'text',
            bundle: true,

            //After the file is uploaded, the response is parsed and the uuid is assigned to the attribute value and the endpoint and method is updated
            onAfterResponse: (response) => {
                const res = JSON.parse(response.responseText);
                this.attributeInstance.value = res["uuid"];
                this.updateEndpoint();
            }
        });
    }
}
