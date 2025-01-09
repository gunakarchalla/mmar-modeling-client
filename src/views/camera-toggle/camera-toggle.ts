import { GlobalDefinition } from "resources/global_definitions";
import { GlobalStateObject } from "resources/global_state_object";

import { Logger } from 'resources/services/logger';

export class CameraToggle {

    constructor(
        private globalObjectInstance: GlobalDefinition,
        private logger: Logger,
        private globalStateObject: GlobalStateObject
    ) {
    }

    //when the toggle button is clicked the camera is changed from 2d to 3d and vice versa
    //this includes also seperate orbitcontrols for 2d and 3d
    async toggle() {
        this.globalObjectInstance.threeDimensional = !this.globalObjectInstance.threeDimensional;
        this.logger.log('CameraToggle toggle' + this.globalObjectInstance.threeDimensional, 'info')

        //change normal camera to 2d or 3d
        await this.resetView();

        if (!this.globalObjectInstance.threeDimensional) {
            this.globalObjectInstance.normalCamera = this.globalObjectInstance.normalCamera2d;
            this.globalObjectInstance.camera = this.globalObjectInstance.normalCamera;
            this.globalObjectInstance.orbitControls = this.globalObjectInstance.orbitControls2d;
        }
        if (this.globalObjectInstance.threeDimensional) {
            this.globalObjectInstance.normalCamera = this.globalObjectInstance.normalCamera3d;
            this.globalObjectInstance.camera = this.globalObjectInstance.normalCamera;
            this.globalObjectInstance.orbitControls = this.globalObjectInstance.orbitControls3d;
        }


        this.globalObjectInstance.transformControls.camera = this.globalObjectInstance.camera;
        await this.resetView();
    }

    async enableTranslate() {
        this.globalObjectInstance.transformControls.setMode("translate");
    }

    async enableRotate() {
        this.globalObjectInstance.transformControls.setMode("rotate");
    }

    async enableScale() {
        this.globalObjectInstance.transformControls.setMode("scale");
    }

    async resetView() {

        this.globalStateObject.setState(1);
        if (!this.globalObjectInstance.threeDimensional) {
            this.globalObjectInstance.normalCamera2d.position.set(0, 0, 10);
            this.globalObjectInstance.normalCamera2d.zoom = 1;
            this.globalObjectInstance.orbitControls2d.reset();
        }

        if (this.globalObjectInstance.threeDimensional) {
            this.globalObjectInstance.normalCamera3d.position.set(0, 0, 10);
            this.globalObjectInstance.normalCamera3d.zoom = 1;
            this.globalObjectInstance.orbitControls3d.reset();
        }
    }
}