import { InteractionHandler } from './interaction_handler';
import { MouseObject } from './mouse_object';
import { TransformControlsEvents } from 'resources/services/transform_control_events';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls';
import { singleton } from "aurelia";
import { GlobalDefinition } from "./global_definitions";
import * as THREE from "three";
import { Initiator } from './initiator';

@singleton()
export class SceneInitiator {

    constructor(
        private globalObjectInstance: GlobalDefinition,
        private transformControlsEvents: TransformControlsEvents,
        private mouseObject: MouseObject,
        private interactionHandler: InteractionHandler,
    ) { }

    async sceneInit() {


        if (this.globalObjectInstance.elementContainer) {

            this.globalObjectInstance.scene = new THREE.Scene();

            //-------------------------------
            //set up controls
            //-------------------------------
            //add transformcontrols to scene
            await this.initTransformControls();

            this.globalObjectInstance.scene.add(this.globalObjectInstance.mousePointer3d);

            await this.initLights();

            this.globalObjectInstance.scene.add(this.globalObjectInstance.plane);

            // add grid
            const helper = new THREE.GridHelper(1000, 1000);
            helper.position.z = this.globalObjectInstance.localZPlane;
            helper.material.opacity = 0.1;
            helper.material.transparent = true;
            //rotate the grid so that it is horizontal
            helper.rotateX(Math.PI / 2);
            this.globalObjectInstance.scene.add(helper);

            const helper2 = new THREE.GridHelper(1000, 100);
            helper2.position.z = this.globalObjectInstance.localZPlane;
            helper2.material.opacity = 0.05;
            helper2.material.transparent = true;
            //rotate the grid so that it is horizontal
            this.globalObjectInstance.scene.add(helper2);

        }
    }

    async initTransformControls() {

        let oldTransformControls;
        //search in scene for transformControls
        this.globalObjectInstance.scene.traverse((child) => {
            if (child instanceof TransformControls) {
                oldTransformControls = child;
            }
        });

        if (oldTransformControls) {
            //remove old transformControls from scene.children
            this.globalObjectInstance.scene.remove(oldTransformControls);
        }

        this.globalObjectInstance.transformControls = new TransformControls(this.globalObjectInstance.camera, this.globalObjectInstance.renderer.domElement);

        // this.globalObjectInstance.scene.add(this.globalObjectInstance.transformControls);
        this.globalObjectInstance.scene.add( this.globalObjectInstance.transformControls.getHelper() )
        this.globalObjectInstance.transformControls.setMode('scale')

        //remove event listener for onDocumentMouseDown
        //this is important, since thhe transformControls event listener must be registered before the pointerdown event listener 
        //thus, we remove it before we initialize the transformControls and add it again after the transformControls are initialized
        this.globalObjectInstance.renderer.domElement.removeEventListener('pointerdown', this.globalObjectInstance.onDocumentMouseDownEventListener, { passive: true });

        //add event listener for transformControls
        this.globalObjectInstance.transformControls.addEventListener('change', () => this.transformControlsEvents.onTransformControlsPropertyChange(), { passive: true });
        this.globalObjectInstance.transformControls.addEventListener('mouseUp', async () => await this.transformControlsEvents.onTransformControlsMouseUp(), { passive: true });

        //add again event listener for pointerdown
        this.globalObjectInstance.renderer.domElement.addEventListener('pointerdown', this.globalObjectInstance.onDocumentMouseDownEventListener, { passive: true });
    }

    async initLights() {
        // const light = new THREE.AmbientLight('#f8ede0')
        // light.intensity = 0.5;
        // this.globalObjectInstance.scene.add(light);

        // //add hemisphere light
        // const hemiLight = new THREE.HemisphereLight('white', 'black', 0.7);
        // hemiLight.position.set(0, 0, 10);
        // this.globalObjectInstance.scene.add(hemiLight);

        // const directLight = new THREE.DirectionalLight('white', 1);
        // this.globalObjectInstance.scene.add(directLight);
        // directLight.position.set(0, 3, 0);

        //create two directional lights pointing at the point 0,0,0
        const light1 = new THREE.DirectionalLight(0xffffff, 1.3);
        light1.position.set(10, 10, 10);
        this.globalObjectInstance.scene.add(light1);

        const light2 = new THREE.DirectionalLight(0xffffff, 1.3);
        light2.position.set(-10, -10, 0);
        this.globalObjectInstance.scene.add(light2);

    }



}
