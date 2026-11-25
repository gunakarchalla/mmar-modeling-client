/**
 * Composition root and mount facade for the engine.
 *
 * Each engine module exports its own singleton. This file imports them in dependency
 * order — global-definition first, then the global-* state holders, then the leaf
 * helpers, then the handlers and initiators — so the `new ClassName()` at the bottom of
 * each file runs in a deterministic order, and so any cross-singleton wiring that would
 * otherwise risk a circular import is funnelled through one place. Import engine
 * singletons FROM HERE, not from their leaf files.
 *
 * Importing `vizrep-update-checker` is load-bearing rather than cosmetic: its
 * constructor is what subscribes the `checkForVizRepUpdate*` bus channels, so the module
 * must be evaluated for vizrep refreshes to work at all.
 *
 * The `engine` facade below is what React talks to: `mount(container)` /
 * `unmount(token)` / `whenReady()` / `createXRButton()`. The memoized init promise and
 * the monotonic mount token make StrictMode's double-mount and per-tab remounts safe,
 * and the single page-lifetime WebGLRenderer is re-attached rather than recreated —
 * browsers cap live WebGL contexts at around 16.
 */
import { XRButton } from "three/examples/jsm/webxr/XRButton.js";
import { globalObject } from "@/engine/global-definition";
import { globalSelectedObject } from "@/engine/global-selected-object";
import { globalStateObject } from "@/engine/global-state-object";
import { globalClassObject } from "@/engine/global-class-object";
import { globalRelationclassObject } from "@/engine/global-relationclass-object";
import { rayHelper } from "@/engine/ray-helper";
import { mouseObject } from "@/engine/mouse-object";
import { resize } from "@/engine/resize";
import { graphicContext } from "@/engine/graphic-context";
import { coordinatesUpdater } from "@/engine/coordinates-updater";
import { vizrepUpdateChecker } from "@/engine/vizrep-update-checker";
import { transformControlsEvents } from "@/engine/transform-control-events";
import { consistencyChecker } from "@/engine/consistency-checker";
import { instanceCreationHandler } from "@/engine/instance-creation-handler";
import { deletionHandler } from "@/engine/deletion-handler";
import { interactionHandler } from "@/engine/interaction-handler";
import { animator } from "@/engine/animator";
import { arInitiator } from "@/engine/ar-initiator";
import { sceneInitiator } from "@/engine/scene-initiator";
import { initiator } from "@/engine/initiator";

export {
  globalObject,
  globalSelectedObject,
  globalStateObject,
  globalClassObject,
  globalRelationclassObject,
  rayHelper,
  mouseObject,
  resize,
  graphicContext,
  coordinatesUpdater,
  vizrepUpdateChecker,
  transformControlsEvents,
  consistencyChecker,
  instanceCreationHandler,
  deletionHandler,
  interactionHandler,
  animator,
  arInitiator,
  sceneInitiator,
  initiator,
};

// init() is expensive (builds cameras / scene / controls / plane) and must run
// exactly ONCE for the lifetime of the singleton engine.
//
// A plain boolean set *after* `await initiator.init()` does not hold: two mounts
// that race the same in-flight init both observe `false` and both run the heavy
// branch, duplicating the scene, orbit controls and the window resize listener. So
// we memoize the init *promise* (not a boolean). Concurrent mounts await the same
// init; only the first creates it.
let initPromise: Promise<void> | null = null;
let initialized = false;

// Resolves once the one-time init has completed. Callers outside ThreeCanvas hold no
// mount token and cannot await the mount promise, but must not touch engine state
// (scene, cameras, tabContext) before init. It never rejects: a failed init leaves
// it pending until a later mount retries and succeeds.
let signalReady: () => void;
const readyPromise = new Promise<void>((resolve) => {
  signalReady = resolve;
});

// Monotonic mount token. Every mount() takes the next token and becomes the engine's
// owner. An attach or unmount whose token is no longer current has been superseded by
// a newer mount and must not touch the renderer. StrictMode reuses the *same*
// container element, so ownership cannot be decided by comparing elements.
let mountToken = 0;

export const engine = {
  /**
   * Boot (or re-attach) the engine into `container`, and return the mount token
   * identifying this mount. Pass that token to `unmount(token)` so a superseded
   * cleanup becomes a no-op.
   *
   * Idempotent and concurrency-safe: the heavy `initiator.init()` +
   * `initEventListeners()` run at most once per page life; every mount then ensures
   * the singleton canvas is attached to `container` with a running render loop. The
   * renderer is never recreated — only re-attached.
   */
  async mount(container: HTMLElement): Promise<number> {
    const token = ++mountToken;
    globalObject.elementContainer = container;

    if (!initPromise) {
      initPromise = (async () => {
        await initiator.init();
        await initiator.initEventListeners();
        // Turn WebXR on and wire session start/end. Idempotent, and harmless on a
        // machine with no XR hardware.
        arInitiator.enableXR();
        initialized = true;
        signalReady();
      })().catch((err: unknown) => {
        // Let a later mount retry a failed init rather than wedging the engine.
        initPromise = null;
        throw err;
      });
    }
    await initPromise;

    // Superseded while init was in flight: the newer mount owns the renderer and will
    // attach it to its own container. Attaching here would steal the canvas.
    if (token !== mountToken) return token;

    // Re-apply the 2D/3D flag so camera + orbit controls agree on every mount (a
    // toggle that landed while init was in flight would otherwise leave them out of
    // sync). No-op when they already agree.
    engine.setThreeDimensional(globalObject.threeDimensional);

    // init() already appended the canvas into `elementContainer`; for every later
    // mount this is the re-attach. Both paths converge here so there is exactly one
    // place that starts the render loop.
    const dom = globalObject.renderer.domElement;
    if (dom.parentElement !== container) {
      container.appendChild(dom);
    }
    globalObject.renderer.setSize(container.clientWidth, container.clientHeight, true);
    globalObject.renderer.setAnimationLoop(arInitiator.render.bind(arInitiator));
    globalObject.render = true;

    return token;
  },

  /**
   * Switch the world between 2D (orthographic) and 3D (perspective) — swaps the active
   * camera + orbit controls the same way init does and flags a re-render. Cameras /
   * controls only exist after `mount()`/`init()`, so before that we just record the
   * flag and the next `init()` honours it. The modeling default is 2D.
   */
  setThreeDimensional(is3d: boolean): void {
    globalObject.threeDimensional = is3d;
    if (!initialized) return;

    if (is3d) {
      globalObject.normalCamera = globalObject.normalCamera3d;
      globalObject.orbitControls = globalObject.orbitControls3d;
    } else {
      globalObject.normalCamera = globalObject.normalCamera2d;
      globalObject.orbitControls = globalObject.orbitControls2d;
    }
    globalObject.camera = globalObject.normalCamera;
    globalObject.render = true;
  },

  /**
   * Create three's XR entry button, bound to our renderer. `XrButton` overlays the
   * returned element on the canvas. Enabling XR here (idempotently) is what makes the
   * session listeners live for a session the button starts.
   */
  createXRButton(): HTMLElement {
    arInitiator.enableXR();
    return XRButton.createButton(globalObject.renderer, {
      requiredFeatures: ["local"],
      optionalFeatures: ["hand-tracking"],
    });
  },

  /**
   * Stop the render loop and detach the canvas from the DOM. The singleton scene /
   * cameras / controls / renderer are preserved so a later `mount()` is a cheap
   * re-attach — never a recreate (a recreated WebGLRenderer would leak its context;
   * browsers cap live contexts at ~16). Pass the token returned by the matching
   * `mount()`; a stale token makes this a no-op. Calling with no token forces detach.
   */
  unmount(token?: number): void {
    if (token !== undefined && token !== mountToken) return;

    globalObject.renderer.setAnimationLoop(null);
    const dom = globalObject.renderer.domElement;
    if (dom.parentElement) {
      dom.parentElement.removeChild(dom);
    }
  },

  /**
   * Await the one-time init. Resolves immediately once it has completed, and stays
   * pending until some ThreeCanvas has mounted successfully. Use before reading or
   * mutating engine state from anywhere that did not itself call mount().
   */
  whenReady(): Promise<void> {
    return readyPromise;
  },

  /** Test seam: has the heavy one-time init completed? */
  get isInitialized(): boolean {
    return initialized;
  },
};
