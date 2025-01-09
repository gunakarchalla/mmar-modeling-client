import { Animator } from './animator';
import { singleton } from 'aurelia';
import * as THREE from 'three';
import { GlobalDefinition } from './global_definitions';
import { Logger } from './services/logger';

import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js';
import { OculusHandPointerModel } from 'three/examples/jsm/webxr/OculusHandPointerModel';
import { XRHandModelFactory } from 'three/examples/jsm/webxr/XRHandModelFactory.js';

import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';



@singleton()
export class ArInitiator {
  controller1: any;
  controller2: any;
  controllerGrip1: any;
  hand1: any;
  controllerGrip2: any;
  hand2: any;
  handPointer1: any;
  handPointer2: any;

  raycaster = new THREE.Raycaster();
  tempMatrix = new THREE.Matrix4();

  xrSession = null;
  xrReferenceSpace = null;





  constructor(
    private globalObjectInstance: GlobalDefinition,
    private animator: Animator,
    private logger: Logger
  ) {
  }



  // for AR additional support, e.g., image-tracking
  // compare https://github.com/ShirinStar/webAR_experiments/tree/main/16-webxr-image_tracking
  render(timestamp, frame) {

    this.animator.animate();

  }
  //AR events
  async onSessionStarted() {
    this.globalObjectInstance.camera = this.globalObjectInstance.ARCamera;
    this.globalObjectInstance.render = false;
    this.logger.log('ar camera active', 'info')

    this.createWorldOriginMarker();

    this.initHands();
  }

  onSessionEnded() {
    this.globalObjectInstance.camera = this.globalObjectInstance.normalCamera;
    this.globalObjectInstance.render = true;
    this.logger.log('normal camera active', 'info')

    this.removeWorldOriginMarker();

  }






  initHands() {

    // controllers

    this.controller1 = this.globalObjectInstance.renderer.xr.getController(0);
    this.globalObjectInstance.scene.add(this.controller1);

    this.controller2 = this.globalObjectInstance.renderer.xr.getController(1);
    this.globalObjectInstance.scene.add(this.controller2);

    const controllerModelFactory = new XRControllerModelFactory();
    const handModelFactory = new XRHandModelFactory();

    // Hand 1
    this.controllerGrip1 = this.globalObjectInstance.renderer.xr.getControllerGrip(0);
    this.controllerGrip1.add(controllerModelFactory.createControllerModel(this.controllerGrip1));
    this.globalObjectInstance.scene.add(this.controllerGrip1);

    this.hand1 = this.globalObjectInstance.renderer.xr.getHand(0);
    this.hand1.add(handModelFactory.createHandModel(this.hand1));
    this.handPointer1 = new OculusHandPointerModel(this.hand1, this.controller1);
    this.hand1.add(this.handPointer1);

    this.globalObjectInstance.scene.add(this.hand1);

    // Hand 2
    this.controllerGrip2 = this.globalObjectInstance.renderer.xr.getControllerGrip(1);
    this.controllerGrip2.add(controllerModelFactory.createControllerModel(this.controllerGrip2));
    this.globalObjectInstance.scene.add(this.controllerGrip2);

    this.hand2 = this.globalObjectInstance.renderer.xr.getHand(1);
    this.hand2.add(handModelFactory.createHandModel(this.hand2));
    this.handPointer2 = new OculusHandPointerModel(this.hand2, this.controller2);
    this.hand2.add(this.handPointer2);

    this.globalObjectInstance.scene.add(this.hand2);

    // events
    this.hand1.addEventListener('pinchstart', (event) => this.onSelectStart(event));
    this.hand1.addEventListener('pinchend', (event) => this.onSelectEnd(event));
    this.hand2.addEventListener('pinchstart', (event) => this.onSelectStart(event));
    this.hand2.addEventListener('pinchend', (event) => this.onSelectEnd(event));
  }

  onSelectStart(event) {

    console.log('pichstart')
    let controller = event.target;

    if (controller === this.hand1) {
      controller = this.controller1;
    } else if (controller === this.hand2) {
      controller = this.controller2;
    }
    else { controller === undefined }

    console.log(controller)

    let intersection = undefined;

    if (controller === this.controller1 && !intersection) {
      intersection = this.handPointer1.intersectObjects(this.globalObjectInstance.dragObjects, false)[0];
      if (intersection) {
        console.log('object c1')
        if (intersection.object.parent === this.controller2) {
          return;
        }
      }
    }
    if (controller === this.controller2 && !intersection) {
      intersection = this.handPointer2.intersectObjects(this.globalObjectInstance.dragObjects, false)[0];
      if (intersection) {
        console.log('object c2')
        if (intersection.object.parent === this.controller1 ) {
          return;
        }
      }
    }
    if (intersection) {
      const object = intersection.object;
      controller.userData.objectParent = object.parent;
      controller.attach(object);
      controller.userData.selected = object;
    }


  }


  //detach from hand and attach back to former parent
  onSelectEnd(event) {

    let controller = event.target;

    if (controller === this.hand1) {
      controller = this.controller1;
    } else if (controller === this.hand2) {
      controller = this.controller2;
    }
    else { controller === undefined }

    if (controller.userData.selected !== undefined) {
      const object = controller.userData.selected;
      let parent = controller.userData.objectParent;
      parent.attach(object);
      controller.userData.objectParent = undefined;
      controller.userData.selected = undefined;
    }
    // else check if object is attached to controller and detach
    else if (controller.children.length > 0) {
        let object = controller.children[0];
        let parent = controller.userData.objectParent;
        parent.attach(object);
        controller.userData.objectParent = undefined;
        controller.userData.selected = undefined
        console.log('object detached')
      }
  }

  createWorldOriginMarker() {
    // create a plane sowing the directions of the world axes 
    const worldOriginMarker = new THREE.AxesHelper(0.3);
    worldOriginMarker.position.set(0, 0, 0);
    this.globalObjectInstance.scene.add(worldOriginMarker);
    worldOriginMarker.name = "worldOriginMarker";

    // set a text label for each axis of the world origin
    const loader = new FontLoader();
    loader.load('https://cdn.jsdelivr.net/gh/mrdoob/three.js/examples/fonts/helvetiker_regular.typeface.json', (font) => {
      const textGeometryX = new TextGeometry('+X', {
        font: font,
        size: 0.05,
        height: 0.01,
      });
      const textMaterialX = new THREE.MeshBasicMaterial({ color: 0xff0000 });
      const textX = new THREE.Mesh(textGeometryX, textMaterialX);
      textX.position.set(0.3, 0, 0);
      worldOriginMarker.add(textX);

      const textGeometryY = new TextGeometry('+Y', {
        font: font,
        size: 0.05,
        height: 0.01,
      });
      const textMaterialY = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
      const textY = new THREE.Mesh(textGeometryY, textMaterialY);
      textY.position.set(0, 0.3, 0);
      worldOriginMarker.add(textY);

      const textGeometryZ = new TextGeometry('+Z', {
        font: font,
        size: 0.05,
        height: 0.01,
      });
      const textMaterialZ = new THREE.MeshBasicMaterial({ color: 0x0000ff });
      const textZ = new THREE.Mesh(textGeometryZ, textMaterialZ);
      textZ.position.set(0, 0, 0.3);
      worldOriginMarker.add(textZ);
    });


  }

  removeWorldOriginMarker() {
    this.globalObjectInstance.scene.remove(this.globalObjectInstance.scene.getObjectByName('worldOriginMarker'));
  }
}
