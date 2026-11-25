import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { globalObject } from "@/engine/global-definition";
import { globalStateObject } from "@/engine/global-state-object";
import { arInitiator } from "@/engine/ar-initiator";
import { mouseObject } from "@/engine/mouse-object";
import { interactionHandler } from "@/engine/interaction-handler";
import { logger } from "@/resources/services/logger";
import { sceneInitiator } from "@/engine/scene-initiator";
import { resize } from "@/engine/resize";

/**
 * One-time boot of the three.js world: cameras, orbit controls, the mouse pointer
 * sphere, the invisible intersection plane, the scene itself (delegated to
 * `sceneInitiator`) and the global DOM event listeners.
 *
 * `engine.mount(container)` is the only caller — it passes the canvas host element in
 * directly, which is why there is no DOM lookup here. XR is enabled separately by
 * `arInitiator.enableXR()` (also from `engine.mount`), and the XR entry button is
 * created on demand by `engine.createXRButton()`.
 *
 * 2D (orthographic) is the modeling default: `normalCamera` starts as `normalCamera2d`.
 */
export class Initiator {
  private globalObjectInstance = globalObject;
  private globalStateObject = globalStateObject;
  private arInitiator = arInitiator;
  private mouseObject = mouseObject;
  private interactionHandler = interactionHandler;
  private logger = logger;
  private sceneInitiator = sceneInitiator;
  private resize = resize;

  async init() {
    const containerWidth = this.globalObjectInstance.elementContainer.clientWidth;
    const containerHeight = this.globalObjectInstance.elementContainer.clientHeight;
    const aspectRatio = containerWidth / containerHeight;
    const nearPlane = 0.1;
    const farPlane = 5000;

    // Perspective Camera
    const fov = 70; // Field of view in degrees
    this.globalObjectInstance.normalCamera3d = new THREE.PerspectiveCamera(fov, aspectRatio, nearPlane, farPlane);
    this.globalObjectInstance.normalCamera3d.position.set(0, 0, 10);

    // Orthographic Camera
    const frustumSize = 10;
    this.globalObjectInstance.normalCamera2d = new THREE.OrthographicCamera(
      (frustumSize * aspectRatio) / -2,
      (frustumSize * aspectRatio) / 2,
      frustumSize / 2,
      frustumSize / -2,
      nearPlane,
      farPlane
    );
    this.globalObjectInstance.normalCamera2d.position.set(0, 0, 10);
    this.globalObjectInstance.normalCamera2d.zoom = 1; // Adjust zoom to match perspective view
    this.globalObjectInstance.normalCamera2d.updateProjectionMatrix();

    this.globalObjectInstance.normalCamera = this.globalObjectInstance.normalCamera2d;
    this.globalObjectInstance.camera = this.globalObjectInstance.normalCamera;
    this.globalObjectInstance.renderer.setSize(this.globalObjectInstance.elementContainer.clientWidth, this.globalObjectInstance.elementContainer.clientHeight, true);
    this.globalObjectInstance.elementContainer.appendChild(this.globalObjectInstance.renderer.domElement);

    await this.initMousePointer3d();

    await this.initOrbitControls();

    await this.sceneInitiator.sceneInit();

    await this.createIntersectionPlane();

    // The render loop runs through the renderer's animation loop so that it also
    // drives WebXR sessions (bound because the callback loses `this`).
    this.globalObjectInstance.renderer.setAnimationLoop(this.arInitiator.render.bind(this.arInitiator));
  }

  async initMousePointer3d() {
    this.globalObjectInstance.mousePointer3d = this.createSphereMesh(new THREE.Color("blue"));
    this.globalObjectInstance.mousePointer3d.visible = false;
    this.globalObjectInstance.mousePointer3d.position.z = this.globalObjectInstance.localZPlane;
    this.globalObjectInstance.scene.add(this.globalObjectInstance.mousePointer3d);
    this.globalObjectInstance.mousePointer3d.name = "mousePointer3d";
  }

  async initOrbitControls() {
    this.globalObjectInstance.orbitControls2d = new OrbitControls(this.globalObjectInstance.normalCamera2d, this.globalObjectInstance.renderer.domElement);
    this.globalObjectInstance.orbitControls3d = new OrbitControls(this.globalObjectInstance.normalCamera3d, this.globalObjectInstance.renderer.domElement);

    //orbit controls to move camera
    this.globalObjectInstance.orbitControls2d.target = new THREE.Vector3(0, 0, this.globalObjectInstance.localZPlane);
    this.globalObjectInstance.orbitControls3d.target = new THREE.Vector3(0, 0, this.globalObjectInstance.localZPlane);

    // max and min Zoom for OrbitControls
    this.globalObjectInstance.orbitControls2d.minDistance = 0.2;
    this.globalObjectInstance.orbitControls2d.maxDistance = 500;
    this.globalObjectInstance.orbitControls3d.minDistance = 0.2;
    this.globalObjectInstance.orbitControls3d.maxDistance = 500;

    //set orbitcontrol values for 3d
    this.globalObjectInstance.orbitControls3d.maxPolarAngle = Math.PI; // radians
    this.globalObjectInstance.orbitControls3d.minPolarAngle = 0; // radians
    this.globalObjectInstance.orbitControls3d.maxAzimuthAngle = Infinity; // radians
    this.globalObjectInstance.orbitControls3d.minAzimuthAngle = Infinity; // radians

    // set orbitcontrol values for 2d
    this.globalObjectInstance.orbitControls2d.maxPolarAngle = Math.PI / 2; // radians
    this.globalObjectInstance.orbitControls2d.minPolarAngle = Math.PI / 2; // radians
    this.globalObjectInstance.orbitControls2d.maxAzimuthAngle = 0; // radians
    this.globalObjectInstance.orbitControls2d.minAzimuthAngle = 0; // radians

    this.globalObjectInstance.orbitControls = this.globalObjectInstance.threeDimensional
      ? this.globalObjectInstance.orbitControls3d
      : this.globalObjectInstance.orbitControls2d;

    // Any camera move must trigger a redraw. `mouseUp` is not in three's
    // EventDispatcher typing, hence the cast.
    for (const controls of [this.globalObjectInstance.orbitControls2d, this.globalObjectInstance.orbitControls3d]) {
      controls.addEventListener("change", () => (this.globalObjectInstance.render = true));
      (controls as any).addEventListener("mouseUp", () => (this.globalObjectInstance.render = true));
      controls.saveState();
    }
  }

  createSphereMesh(color: THREE.Color) {
    const sphGeom = new THREE.SphereGeometry(0.05, 8, 4);
    const sphMat = new THREE.MeshBasicMaterial({
      color: color,
      wireframe: false,
    });
    return new THREE.Mesh(sphGeom, sphMat);
  }

  async initEventListeners() {
    this.globalStateObject.setState(0);

    // Keep the bound handler around so the same reference can be added and removed as
    // a listener. It is registered by `sceneInitiator.initTransformControls`, not here:
    // the transform controls must claim `pointerdown` first.
    this.globalObjectInstance.onDocumentMouseDownEventListener = this.interactionHandler.onDocumentMouseDown.bind(this.interactionHandler);

    // Pointer tracking binds to the renderer's canvas, NOT to `elementContainer`.
    // This method runs exactly once per page life (engine.mount memoizes the init
    // promise), whereas the container is a React-owned element that ThreeCanvas
    // destroys and recreates on every remount — a logout/login round trip being the
    // common one. A listener left on the container therefore ends up on a detached
    // element after the first remount and never fires again, while `pointerdown`
    // keeps working because it lives on the canvas. That asymmetry surfaced as a
    // remote collaborator's cursor freezing until they clicked: `updateMousePos` is
    // the only thing that drives `rayHelper.broadcastCursor` on pointer motion.
    //
    // The canvas is a page-lifetime singleton that `engine.mount` re-parents rather
    // than recreates, so a listener on it outlives every remount. It also fills the
    // container exactly (the renderer is sized to it), so the events seen are the same.
    this.globalObjectInstance.renderer.domElement.addEventListener("pointermove", this.mouseObject.updateMousePos.bind(this.mouseObject), { passive: true });

    window.addEventListener("resize", this.resize.resize.bind(this.resize));
  }

  async createIntersectionPlane() {
    // add intersection plane
    const geometry: THREE.PlaneGeometry = new THREE.PlaneGeometry(10000, 10000);
    const material = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
    material.color = new THREE.Color("grey");
    this.globalObjectInstance.plane = new THREE.Mesh(geometry, material);
    this.globalObjectInstance.plane.receiveShadow = true;
    this.globalObjectInstance.plane.position.z = this.globalObjectInstance.localZPlane;
    this.logger.log("intersection plane created at position :" + JSON.stringify(this.globalObjectInstance.plane.position), "done");
    this.globalObjectInstance.plane.geometry.name = "plane";
    this.globalObjectInstance.scene.add(this.globalObjectInstance.plane);
  }
}

// Module singleton — one shared instance.
export const initiator = new Initiator();
