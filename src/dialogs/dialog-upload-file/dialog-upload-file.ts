import Uppy from '@uppy/core';
import Dashboard from '@uppy/dashboard';
import '@uppy/core/dist/style.min.css';
import '@uppy/dashboard/dist/style.min.css';
import { AttributeInstance } from "../../../../mmar-global-data-structure";
import { bindable } from "aurelia";
import { validate as uuidValidate } from 'uuid';
import { FetchHelper } from 'resources/services/fetchHelper';
import { EventAggregator } from 'aurelia';
export class DialogUploadFile {
    private uppy: Uppy;

    @bindable private attributeInstance: AttributeInstance;

    constructor(
        private fetchHelper: FetchHelper,
        private eventAggregator: EventAggregator,
    ) { }

    async attached() {

        this.uppy = new Uppy(
            {
            }
        );

        //Using uppy dashboard
        this.uppy.use(Dashboard, { inline: true, target: '#forUpload', showProgressDetails: true, width: '100%', height: '200px', hideUploadButton: true });
    }

    load() {
        const files = this.uppy.getFiles();
        const reader = new FileReader();

        if (files) {
            for (const file of files) {
                reader.readAsDataURL(file.data);
                reader.onload = async () => {
                    const dataURL = reader.result.toString();

                    // Extract base64 data
                    const base64Data = dataURL.split(',')[1];
                    const binaryString = window.atob(base64Data);
                    const byteArray = new Uint8Array(binaryString.length);
                    for (let i = 0; i < binaryString.length; i++) {
                        byteArray[i] = binaryString.charCodeAt(i);
                    }

                    // Create a proper binary File
                    const newFile = new File([byteArray], file.name, { type: file.type });

                    const response = uuidValidate(this.attributeInstance.value) ? await this.fetchHelper.patchFileByUUID(this.attributeInstance.value, newFile) : await this.fetchHelper.postFile(newFile);
                    if (response) {
                        this.eventAggregator.publish('fileUploaded', this.attributeInstance);
                        this.attributeInstance.value = response.uuid;
                    }
                }
                this.uppy.removeFile(file.id);
            }
        }
    }
}