import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { AttributeInstance, ClassInstance, Port, PortInstance, RoleInstance, SceneInstance, SceneType } from "@gds";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { getToken } from "@/resources/services/token";
import type { SharedDocService } from "@/resources/collaboration/shared-doc-service";

/**
 * The engine's shared mutable state: the renderer, the cameras and controls, the
 * raycasters, the per-tab context and the flags the three.js world coordinates on.
 * Every engine module and utility imports the single `globalObject` instance below.
 *
 * `tabContext` holds one entry per open scene tab. `dragObjects` is the pick list the
 * raycasters test against, `updateLinesArray` the relation lines the animator re-routes,
 * and `allPositions` / `allRotations` / `allScales` the previous frame's transforms the
 * animator diffs against to decide whether anything moved.
 *
 * Two members are deliberate indirections:
 *  - `accessToken` is a read-only mirror of the JWT held in `services/token.ts` (written
 *    by `authStore`), so engine code can read the token without depending on the store.
 *  - `sharedDocServiceRef` is the back-reference SharedDocService sets on itself at
 *    construction. It is what lets the engine reach a shared session without importing
 *    the collaboration layer; the import below is TYPE-ONLY and erased at build time, so
 *    no runtime cycle exists. It stays `null` until that module is first imported.
 */
export class GlobalDefinition {
  selectedTab: number;
  tabContext: {
    sceneType: SceneType;
    sceneInstance: SceneInstance;
    threeScene: THREE.Scene;
    contextDragObjects: THREE.Mesh[];
    /** True when this tab is connected to the sync server for real-time collaboration. */
    isShared: boolean;
  }[];
  transformControls: TransformControls;
  orbitControls: OrbitControls;
  boxHelper: THREE.BoxHelper;
  scene: THREE.Scene;
  elementContainer: HTMLElement;
  camera: THREE.OrthographicCamera | THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  normalCamera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  normalCamera2d: THREE.OrthographicCamera;
  normalCamera3d: THREE.PerspectiveCamera;
  localZPlane: number;
  mousePointer3d: THREE.Mesh;
  render: boolean;
  dragObjects: THREE.Mesh[];
  updateLinesArray: Line2[];
  buttonObjects: THREE.Mesh[];
  objectScaled: boolean;
  allPositions: number[];
  allRotations: number[];
  allScales: number[];
  ARCamera: THREE.PerspectiveCamera;
  mouse: THREE.Vector2;
  raycaster: THREE.Raycaster;
  raycasterBetweenObjects: THREE.Raycaster;
  plane: THREE.Mesh;
  current_class_instance: ClassInstance;
  current_port_instance: PortInstance;
  current_meta_port: Port;
  attribute_instances: AttributeInstance[];
  role_instances: RoleInstance[];
  relationObjects: THREE.Mesh[];
  sceneTypes: SceneType[];
  // Holds the bound interaction-handler `onDocumentMouseDown` so the same reference
  // can be added and removed as the renderer's `pointerdown` listener. Typed
  // this `void`; under strict TS that cannot hold a function, so it is widened to
  // `any` (runtime behaviour is identical).
  onDocumentMouseDownEventListener: any;
  sceneTree: any[];
  importSceneTypes: SceneType[];
  importSceneInstances: SceneInstance[];
  threeDimensional: boolean;
  orbitControls2d: OrbitControls;
  orbitControls3d: OrbitControls;
  readyForVizRepUpdate: boolean;
  runMechanism: boolean;
  localFiles: Map<string, string>;
  autoSave: boolean;
  doSceneInstancePatch: boolean;
  /** Set only for local-origin mutations in a shared scene; remote Yjs updates must NOT set this. */
  doSceneInstancePatchLocal: boolean;
  /** Back-reference to SharedDocService, set when that module is first evaluated. */
  sharedDocServiceRef: SharedDocService | null;

  /** Read-only mirror of the JWT held in token.ts (single source of truth, written by authStore). */
  get accessToken(): string {
    return getToken() ?? "";
  }

  /** Returns 'read' | 'edit' | 'delete' for the active tab's shared session, or null if not shared. */
  get currentTabAccess(): string | null {
    if (!this.sharedDocServiceRef) return null;
    return this.sharedDocServiceRef.forTab(this.selectedTab)?.access ?? null;
  }

  constructor() {
    this.selectedTab = 0;
    this.tabContext = [];
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(0, 0, 0, 0);
    this.normalCamera2d = new THREE.OrthographicCamera(0, 0, 0, 0);
    this.normalCamera3d = new THREE.PerspectiveCamera(0, 0, 0, 0);
    this.normalCamera = this.normalCamera2d;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.localZPlane = 0;
    this.mousePointer3d = new THREE.Mesh();
    this.updateLinesArray = [];
    this.objectScaled = false;
    this.allPositions = [];
    this.allRotations = [];
    this.allScales = [];
    this.ARCamera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 100);
    this.mouse = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();
    this.raycasterBetweenObjects = new THREE.Raycaster();
    this.render = true;
    this.plane = new THREE.Mesh();
    this.dragObjects = [];
    this.buttonObjects = [];
    // current_meta_port / current_class_instance / current_port_instance start
    // undefined until something selects or creates one (strictPropertyInitialization
    // is off, so they need no explicit initialiser).
    this.attribute_instances = [];
    this.role_instances = [];
    this.relationObjects = [];
    this.orbitControls = new OrbitControls(this.normalCamera, this.renderer.domElement);
    this.sceneTree = [];
    this.importSceneTypes = [];
    this.importSceneInstances = [];
    this.threeDimensional = false;
    this.readyForVizRepUpdate = true;
    this.runMechanism = false;
    this.localFiles = new Map<string, string>();
    this.autoSave = true;
    this.doSceneInstancePatch = false;
    this.doSceneInstancePatchLocal = false;
    this.sharedDocServiceRef = null;
    this.sceneTypes = [];
  }
}

// Module singleton — one shared instance. Every
// engine port + utility imports this instance.
export const globalObject = new GlobalDefinition();
