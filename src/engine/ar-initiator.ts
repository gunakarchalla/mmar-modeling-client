import * as THREE from "three";
import { XRControllerModelFactory } from "three/examples/jsm/webxr/XRControllerModelFactory.js";
import { OculusHandPointerModel } from "three/examples/jsm/webxr/OculusHandPointerModel.js";
import { XRHandModelFactory } from "three/examples/jsm/webxr/XRHandModelFactory.js";
import { FontLoader } from "three/examples/jsm/loaders/FontLoader.js";
import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry.js";
import { globalObject } from "@/engine/global-definition";
import { animator } from "@/engine/animator";
import { logger } from "@/resources/services/logger";

/**
 * WebXR (AR / VR) support: session lifecycle, hand and controller models, grabbing
 * objects by pinching, and the world-origin axis marker.
 *
 * `enableXR()` is idempotent and is called from `engine.mount()` and when the XR entry
 * button is created, so a session started from either place runs through
 * `onSessionStarted` / `onSessionEnded`. Entering a session swaps the active camera to
 * `ARCamera`; leaving it swaps back.
 */

/** Font for the world-origin axis labels. Fetched on demand, only inside an XR session. */
const AXIS_LABEL_FONT_URL = "https://cdn.jsdelivr.net/gh/mrdoob/three.js/examples/fonts/helvetiker_regular.typeface.json";

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

  xrSession: any = null;
  xrReferenceSpace: any = null;

  private xrListenersRegistered = false;

  private globalObjectInstance = globalObject;
  private animator = animator;
  private logger = logger;

  /** Turn WebXR on and wire the session lifecycle. Idempotent. */
  enableXR() {
    const renderer = this.globalObjectInstance.renderer;
    renderer.xr.enabled = true;
    if (!this.xrListenersRegistered) {
      renderer.xr.addEventListener("sessionstart", () => void this.onSessionStarted());
      renderer.xr.addEventListener("sessionend", () => this.onSessionEnded());
      this.xrListenersRegistered = true;
    }
  }

  /**
   * The renderer's animation-loop callback. The `timestamp` / `frame` arguments are
   * unused here but are the hook for XR frame data (e.g. image tracking).
   */
  render(_timestamp?: number, _frame?: any) {
    // XR requires a fresh render every frame; the desktop dirty-flag optimisation
    // (animator only draws when render===true, and onSessionStarted sets it false)
    // would otherwise freeze the AR view. Force it true while presenting.
    if (this.globalObjectInstance.renderer.xr.isPresenting) {
      this.globalObjectInstance.render = true;
    }

    void this.animator.animate();
  }
  async onSessionStarted() {
    this.globalObjectInstance.camera = this.globalObjectInstance.ARCamera;
    this.globalObjectInstance.render = false;
    this.logger.log("ar camera active", "info");

    this.createWorldOriginMarker();

    this.initHands();
  }

  onSessionEnded() {
    this.globalObjectInstance.camera = this.globalObjectInstance.normalCamera;
    this.globalObjectInstance.render = true;
    this.logger.log("normal camera active", "info");

    this.removeWorldOriginMarker();
  }

  /** Build the controller and hand models and wire pinch-to-grab on both hands. */
  initHands() {
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
    this.hand1.addEventListener("pinchstart", (event: any) => this.onSelectStart(event));
    this.hand1.addEventListener("pinchend", (event: any) => this.onSelectEnd(event));
    this.hand2.addEventListener("pinchstart", (event: any) => this.onSelectStart(event));
    this.hand2.addEventListener("pinchend", (event: any) => this.onSelectEnd(event));
  }

  /** Pinch start: grab the first object the pinching hand's pointer is aimed at. */
  onSelectStart(event: any) {
    const controller = this.controllerFor(event);
    if (!controller) return;

    const pointer = controller === this.controller1 ? this.handPointer1 : this.handPointer2;
    const otherController = controller === this.controller1 ? this.controller2 : this.controller1;

    const intersection = (pointer.intersectObjects(this.globalObjectInstance.dragObjects, false) as THREE.Intersection[])[0];
    // Already held by the other hand — leave it there.
    if (!intersection || intersection.object.parent === otherController) return;

    const object = intersection.object;
    // Remember where it came from so onSelectEnd can put it back.
    controller.userData.objectParent = object.parent;
    controller.attach(object);
    controller.userData.selected = object;
  }

  /** Pinch end: detach the held object from the hand and re-attach it to its parent. */
  onSelectEnd(event: any) {
    const controller = this.controllerFor(event);
    if (!controller) return;

    // `selected` is the normal case; falling back to the first child covers an object
    // that ended up on the controller without a matching select-start.
    const object = controller.userData.selected ?? controller.children[0];
    if (!object) return;

    controller.userData.objectParent?.attach(object);
    controller.userData.objectParent = undefined;
    controller.userData.selected = undefined;
  }

  /** The controller belonging to the hand that raised a pinch event. */
  private controllerFor(event: any): any | undefined {
    if (event.target === this.hand1) return this.controller1;
    if (event.target === this.hand2) return this.controller2;
    return undefined;
  }

  /** Draw the world origin as an axis cross with a labelled tip on each axis. */
  createWorldOriginMarker() {
    const worldOriginMarker = new THREE.AxesHelper(0.3);
    worldOriginMarker.position.set(0, 0, 0);
    worldOriginMarker.name = "worldOriginMarker";
    this.globalObjectInstance.scene.add(worldOriginMarker);

    const axes: { label: string; color: number; position: [number, number, number] }[] = [
      { label: "+X", color: 0xff0000, position: [0.3, 0, 0] },
      { label: "+Y", color: 0x00ff00, position: [0, 0.3, 0] },
      { label: "+Z", color: 0x0000ff, position: [0, 0, 0.3] },
    ];

    const loader = new FontLoader();
    loader.load(AXIS_LABEL_FONT_URL, (font: any) => {
      for (const axis of axes) {
        const geometry = new TextGeometry(axis.label, { font, size: 0.05, height: 0.01 });
        const text = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: axis.color }));
        text.position.set(...axis.position);
        worldOriginMarker.add(text);
      }
    });
  }

  removeWorldOriginMarker() {
    const marker = this.globalObjectInstance.scene.getObjectByName("worldOriginMarker");
    if (marker) {
      this.globalObjectInstance.scene.remove(marker);
    }
  }
}

// Module singleton — one shared instance.
export const arInitiator = new ArInitiator();
