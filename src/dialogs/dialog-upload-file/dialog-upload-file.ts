import Uppy from '@uppy/core';
import Dashboard from '@uppy/dashboard';
import '@uppy/core/dist/style.min.css';
import '@uppy/dashboard/dist/style.min.css';
import { AttributeInstance } from "../../../../mmar-global-data-structure";
import { bindable } from "aurelia";
import { validate as uuidValidate } from 'uuid';
import { FetchHelper } from 'resources/services/fetchHelper';
import { EventAggregator } from 'aurelia';
import { MetaUtility } from 'resources/services/meta_utility';
import { FileUtility } from 'resources/services/file_utility';
import { observable } from "aurelia";
export class DialogUploadFile {

    @observable compress = false;
    @observable targetWidth = 100;
    @observable quality = 100;
    disableCompress = true;

    targetWidthError = '';
    qualityError = '';

    private uppy: Uppy;

    @bindable private attributeInstance: AttributeInstance;

    constructor(
        private fetchHelper: FetchHelper,
        private eventAggregator: EventAggregator,
        private metaUtility: MetaUtility,
        private fileUtility: FileUtility,
    ) { }

    async attached() {

        this.uppy = new Uppy({ restrictions: { maxNumberOfFiles: 1 } });
        this.uppy.use(Dashboard, { inline: true, target: '#forUpload', showProgressDetails: true, width: '100%', height: '200px', hideUploadButton: true });
        this.uppy.on('file-added', (file) => {
            this.validateFile(file);
        });
        this.uppy.on('file-removed', (file) => {
            this.disableCompress = true;
            this.targetWidthError = '';
            this.qualityError = '';
            this.compress = false;
        });
    }

    async detaching() {
        if (this.uppy) {
            this.uppy.destroy();
            this.uppy = null;
        }
    }

    upload() {
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

                    const response = uuidValidate(this.attributeInstance.value) ? await this.fetchHelper.patchFileByUUID(this.attributeInstance.value, newFile, this.compress, this.targetWidth, this.quality) : await this.fetchHelper.postFile(newFile, this.compress, this.targetWidth, this.quality);
                    if (response) {
                        this.eventAggregator.publish('fileUploaded', this.attributeInstance);
                        this.attributeInstance.value = response.uuid;
                        this.metaUtility.setFile(this.attributeInstance.value, newFile);

                        this.uppy.removeFile(file.id);
                        this.disableCompress = true;
                        this.targetWidthError = '';
                        this.qualityError = '';
                        this.compress = false;
                    }
                }

            }
        }
    }

    validateFile(file) {
        const fileType = file.type;
        if (fileType.startsWith('image/')) {
            this.disableCompress = false;
        } else {
            this.disableCompress = true;
        }
    }

    validateTargetWidth() {
        if (this.targetWidth === null || this.targetWidth === undefined || isNaN(Number(this.targetWidth))) {
            this.targetWidthError = 'Target width is required.';
        } else if (Number(this.targetWidth) <= 0) {
            this.targetWidthError = 'Must be a number greater than 0.';
        } else {
            this.targetWidthError = '';
        }
    }

    validateQuality() {
        if (this.quality === null || this.quality === undefined || isNaN(Number(this.quality))) {
            this.qualityError = 'Quality is required.';
        } else if (Number(this.quality) <= 0 || Number(this.quality) > 100) {
            this.qualityError = 'Must be a number between 1 and 100.';
        } else {
            this.qualityError = '';
        }
    }

    compressChanged() {
        // Reset errors when toggling compress
        if (!this.compress) {
            this.targetWidthError = '';
            this.qualityError = '';
        } else {
            this.validateTargetWidth();
            this.validateQuality();
        }
    }

    targetWidthChanged() {
        this.validateTargetWidth();
    }

    qualityChanged() {
        this.validateQuality();
    }
}