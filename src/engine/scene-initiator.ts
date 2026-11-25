import * as THREE from "three";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { globalObject } from "@/engine/global-definition";
import { globalSelectedObject } from "@/engine/global-selected-object";
import { transformControlsEvents } from "@/engine/transform-control-events";

/**
 * Builds a fresh THREE.Scene for a tab: transform controls, lights, the modelling
 * plane, the pointer sphere and the two grid helpers.
 *
 * `initTransformControls` re-registers the canvas `pointerdown` listener around
 * creating the controls, and the order matters: the transform controls must claim the
 * event first, so the interaction handler's listener is removed and added back after.
 */
export class SceneInitiator {
  private globalObjectInstance = globalObject;
  private transformControlsEvents = transformControlsEvents;

  async sceneInit() {
    if (this.globalObjectInstance.elementContainer) {
      // Clear any live selection BEFORE swapping in the new scene, while
      // `globalObject.scene` still points at the outgoing one. Otherwise the red
      // selection box (and its refs) are stranded in the old scene and can never
      // be removed. `switchToTab` already does this for tab switches; opening a
      // brand-new scene/tab goes straight through here instead.
      globalSelectedObject.removeObject();
      this.globalObjectInstance.transformControls?.detach();

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
    // Retire the previous controls before building the replacement.
    //
    // This used to look for them by traversing the scene, which since three 0.169 can
    // never find them: TransformControls extends Controls (an EventDispatcher), not
    // Object3D, so it is not IN the scene — only its helper is. The search therefore
    // always came up empty and every call to this method leaked a live controls object
    // whose canvas pointer listeners stayed registered, plus an orphaned helper. A
    // leaked instance still dispatching 'mouseUp' is what surfaced as "Cannot read
    // properties of undefined (reading 'userData')" in onTransformControlsMouseUp: the
    // handler reads the CURRENT controls, which has nothing attached.
    //
    // `globalObject` is where the live instance actually is, so retire that one.
    const oldTransformControls: TransformControls | undefined = this.globalObjectInstance.transformControls;
    if (oldTransformControls) {
      // The helper may sit in a scene we have already swapped away from (sceneInit and
      // the tab switch both reassign `globalObject.scene` first), so detach it from
      // whatever parent it actually has rather than from the current scene.
      const oldHelper = oldTransformControls.getHelper();
      oldHelper.removeFromParent();
      oldHelper.traverse((child: THREE.Object3D) => {
        const mesh = child as Partial<THREE.Mesh>;
        if (mesh.geometry) mesh.geometry.dispose();
        // Gizmo materials are built per instance in the TransformControlsGizmo
        // constructor, so nothing else is holding these.
        const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else if (material) material.dispose();
      });
      // `disconnect()` rather than `dispose()`: three 0.169's TransformControls.dispose
      // calls `this.traverse`, which Controls does not define, so it throws. Removing
      // the canvas pointerdown/move/up listeners is the part that matters here, and
      // that is exactly what disconnect does.
      oldTransformControls.disconnect();
    }

    this.globalObjectInstance.transformControls = new TransformControls(this.globalObjectInstance.camera, this.globalObjectInstance.renderer.domElement);

    // this.globalObjectInstance.scene.add(this.globalObjectInstance.transformControls);
    this.globalObjectInstance.scene.add(this.globalObjectInstance.transformControls.getHelper());
    this.globalObjectInstance.transformControls.setMode("scale");

    //remove event listener for onDocumentMouseDown
    //this is important, since the transformControls event listener must be registered before the pointerdown event listener
    //thus, we remove it before we initialize the transformControls and add it again after the transformControls are initialized
    this.globalObjectInstance.renderer.domElement.removeEventListener("pointerdown", this.globalObjectInstance.onDocumentMouseDownEventListener);

    //add event listener for transformControls
    this.globalObjectInstance.transformControls.addEventListener("change", () => this.transformControlsEvents.onTransformControlsPropertyChange());
    (this.globalObjectInstance.transformControls as any).addEventListener("mouseUp", async () => await this.transformControlsEvents.onTransformControlsMouseUp());

    //add again event listener for pointerdown
    this.globalObjectInstance.renderer.domElement.addEventListener("pointerdown", this.globalObjectInstance.onDocumentMouseDownEventListener);
  }

  async initLights() {
    //create two directional lights pointing at the point 0,0,0
    const light1 = new THREE.DirectionalLight(0xffffff, 1.3);
    light1.position.set(10, 10, 10);
    this.globalObjectInstance.scene.add(light1);

    const light2 = new THREE.DirectionalLight(0xffffff, 1.3);
    light2.position.set(-10, -10, 0);
    this.globalObjectInstance.scene.add(light2);
  }
}

// Module singleton — one shared instance.
export const sceneInitiator = new SceneInitiator();
