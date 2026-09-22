// @vitest-environment jsdom
//
// Lifecycle contract for the `engine` mount facade (P2).
//
// Embedded in the modeling shell the canvas mounts and unmounts on every tab switch,
// and StrictMode double-invokes the effect in dev. These tests pin the three
// properties that make that survivable:
//   1. the heavy initiator.init() runs at most once, even for mounts that race it;
//   2. the singleton renderer is re-attached, never recreated (no WebGL context leak);
//   3. a cleanup that lands after a newer mount cannot detach the newer canvas.
//
// The engine's sibling modules are mocked so `three` never loads: importing it for
// real constructs a WebGLRenderer at module scope, which has no context under jsdom.
import { describe, it, expect, beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  initiator: {
    init: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    initEventListeners: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  },
  arInitiator: { enableXR: vi.fn(), render: vi.fn() },
  globalObject: {
    elementContainer: null as HTMLElement | null,
    render: false,
    renderer: null as unknown as {
      domElement: HTMLCanvasElement;
      setSize: ReturnType<typeof vi.fn>;
      setAnimationLoop: ReturnType<typeof vi.fn>;
    },
    // Cameras / controls as plain strings: identity is all setThreeDimensional picks
    // between, and it reads far better than two three.js instances in a diff. The
    // modeling default is 2D (threeDimensional: false).
    threeDimensional: false,
    camera: "" as string,
    normalCamera: "" as string,
    normalCamera2d: "camera2d",
    normalCamera3d: "camera3d",
    orbitControls: "" as string,
    orbitControls2d: "controls2d",
    orbitControls3d: "controls3d",
  },
}));

vi.mock("three/examples/jsm/webxr/XRButton.js", () => ({ XRButton: { createButton: vi.fn() } }));
vi.mock("@/engine/global-definition", () => ({ globalObject: mocks.globalObject }));
vi.mock("@/engine/initiator", () => ({ initiator: mocks.initiator }));
vi.mock("@/engine/ar-initiator", () => ({ arInitiator: mocks.arInitiator }));
vi.mock("@/engine/global-selected-object", () => ({ globalSelectedObject: {} }));
vi.mock("@/engine/global-state-object", () => ({ globalStateObject: {} }));
vi.mock("@/engine/global-class-object", () => ({ globalClassObject: {} }));
vi.mock("@/engine/global-relationclass-object", () => ({ globalRelationclassObject: {} }));
vi.mock("@/engine/ray-helper", () => ({ rayHelper: {} }));
vi.mock("@/engine/mouse-object", () => ({ mouseObject: {} }));
vi.mock("@/engine/resize", () => ({ resize: { resize: vi.fn() } }));
vi.mock("@/engine/transform-control-events", () => ({ transformControlsEvents: {} }));
vi.mock("@/engine/interaction-handler", () => ({ interactionHandler: {} }));
vi.mock("@/engine/animator", () => ({ animator: {} }));
vi.mock("@/engine/scene-initiator", () => ({ sceneInitiator: {} }));

type Engine = typeof import("@/engine").engine;

/** Fresh module state per test — `initPromise` / `mountToken` are module-scoped. */
async function loadEngine(): Promise<Engine> {
  vi.resetModules();
  return (await import("@/engine")).engine;
}

function makeContainer(): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
}

/** A promise plus its resolvers, to hold `init()` open and drive the race by hand. */
function deferred<T = void>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = "";

  mocks.initiator.init.mockImplementation(() => Promise.resolve());
  mocks.initiator.initEventListeners.mockImplementation(() => Promise.resolve());
  mocks.globalObject.elementContainer = null;
  mocks.globalObject.render = false;
  mocks.globalObject.renderer = {
    domElement: document.createElement("canvas"),
    setSize: vi.fn(),
    setAnimationLoop: vi.fn(),
  };
  mocks.globalObject.threeDimensional = false;
  mocks.globalObject.camera = "";
  mocks.globalObject.normalCamera = "";
  mocks.globalObject.orbitControls = "";
});

describe("engine.mount — one-time init", () => {
  it("runs the heavy init exactly once for two mounts racing the same in-flight init", async () => {
    const gate = deferred();
    mocks.initiator.init.mockImplementation(() => gate.promise);

    const engine = await loadEngine();
    const first = engine.mount(makeContainer());
    const second = engine.mount(makeContainer());

    gate.resolve();
    await Promise.all([first, second]);

    expect(mocks.initiator.init).toHaveBeenCalledTimes(1);
    expect(mocks.initiator.initEventListeners).toHaveBeenCalledTimes(1);
    // XR is enabled exactly once as part of the one-time init.
    expect(mocks.arInitiator.enableXR).toHaveBeenCalledTimes(1);
  });

  it("does not re-initialise on a later remount, and re-attaches the same canvas", async () => {
    const engine = await loadEngine();
    const canvas = mocks.globalObject.renderer.domElement;

    const elA = makeContainer();
    const tokenA = await engine.mount(elA);
    expect(canvas.parentElement).toBe(elA);

    engine.unmount(tokenA);
    expect(canvas.parentElement).toBeNull();

    const elB = makeContainer();
    await engine.mount(elB);

    // Re-attached, not recreated: same canvas node, init never ran twice.
    expect(mocks.initiator.init).toHaveBeenCalledTimes(1);
    expect(mocks.globalObject.renderer.domElement).toBe(canvas);
    expect(canvas.parentElement).toBe(elB);
  });

  it("restarts the render loop on every mount and reports initialisation", async () => {
    const engine = await loadEngine();
    const el = makeContainer();

    expect(engine.isInitialized).toBe(false);
    await engine.mount(el);

    expect(engine.isInitialized).toBe(true);
    expect(mocks.globalObject.render).toBe(true);
    expect(mocks.globalObject.renderer.setAnimationLoop).toHaveBeenLastCalledWith(expect.any(Function));
    expect(mocks.globalObject.renderer.setSize).toHaveBeenCalled();
  });

  it("lets a later mount retry after a failed init", async () => {
    mocks.initiator.init.mockImplementationOnce(() => Promise.reject(new Error("no webgl")));

    const engine = await loadEngine();
    await expect(engine.mount(makeContainer())).rejects.toThrow("no webgl");

    // The memoized promise must be cleared, or the engine stays wedged forever.
    await expect(engine.mount(makeContainer())).resolves.toEqual(expect.any(Number));
    expect(mocks.initiator.init).toHaveBeenCalledTimes(2);
  });

  it("resolves whenReady() only after init has completed", async () => {
    const gate = deferred();
    mocks.initiator.init.mockImplementation(() => gate.promise);

    const engine = await loadEngine();
    let ready = false;
    void engine.whenReady().then(() => (ready = true));

    const mount = engine.mount(makeContainer());
    await Promise.resolve();
    expect(ready).toBe(false);

    gate.resolve();
    await mount;
    await engine.whenReady();
    expect(ready).toBe(true);
  });
});

describe("engine.unmount — token ownership", () => {
  it("stops the render loop and detaches when the token is current", async () => {
    const engine = await loadEngine();
    const el = makeContainer();
    const token = await engine.mount(el);

    engine.unmount(token);

    expect(mocks.globalObject.renderer.setAnimationLoop).toHaveBeenLastCalledWith(null);
    expect(mocks.globalObject.renderer.domElement.parentElement).toBeNull();
  });

  it("ignores a stale token so a superseded cleanup cannot detach a newer canvas", async () => {
    const engine = await loadEngine();
    const staleToken = await engine.mount(makeContainer());
    const elNew = makeContainer();
    await engine.mount(elNew);

    engine.unmount(staleToken);

    expect(mocks.globalObject.renderer.domElement.parentElement).toBe(elNew);
  });

  it("detaches unconditionally when called with no token", async () => {
    const engine = await loadEngine();
    await engine.mount(makeContainer());

    engine.unmount();

    expect(mocks.globalObject.renderer.domElement.parentElement).toBeNull();
  });
});

describe("engine — StrictMode double-mount", () => {
  it("leaves the canvas attached and the loop running after mount -> deferred unmount -> mount", async () => {
    const gate = deferred();
    mocks.initiator.init.mockImplementation(() => gate.promise);

    const engine = await loadEngine();
    const el = makeContainer();

    const firstMount = engine.mount(el); // effect #1
    const secondMount = engine.mount(el); // effect #2 (same element)

    gate.resolve();
    const staleToken = await firstMount;
    await secondMount;

    // Cleanup #1 finally runs, carrying the now-stale token.
    engine.unmount(staleToken);

    expect(mocks.initiator.init).toHaveBeenCalledTimes(1);
    expect(mocks.globalObject.renderer.domElement.parentElement).toBe(el);
    expect(mocks.globalObject.renderer.setAnimationLoop).not.toHaveBeenLastCalledWith(null);
  });
});

describe("engine.setThreeDimensional — 2D/3D toggle", () => {
  it("does nothing but record the flag before the engine is initialised", async () => {
    const engine = await loadEngine();
    engine.setThreeDimensional(true);

    expect(mocks.globalObject.threeDimensional).toBe(true);
    // No cameras exist yet, so it must not have picked one.
    expect(mocks.globalObject.camera).toBe("");
    expect(mocks.globalObject.orbitControls).toBe("");
  });

  it("swaps camera and orbit controls together, and asks for a redraw", async () => {
    const engine = await loadEngine();
    await engine.mount(makeContainer());

    mocks.globalObject.render = false;
    engine.setThreeDimensional(true);
    expect(mocks.globalObject.camera).toBe("camera3d");
    expect(mocks.globalObject.normalCamera).toBe("camera3d");
    expect(mocks.globalObject.orbitControls).toBe("controls3d");
    expect(mocks.globalObject.render).toBe(true);

    engine.setThreeDimensional(false);
    expect(mocks.globalObject.camera).toBe("camera2d");
    expect(mocks.globalObject.orbitControls).toBe("controls2d");
  });

  it("preserves the chosen dimension across a remount (tab switch)", async () => {
    const engine = await loadEngine();
    const tokenA = await engine.mount(makeContainer());
    engine.setThreeDimensional(true);
    engine.unmount(tokenA);

    await engine.mount(makeContainer());

    expect(mocks.globalObject.camera).toBe("camera3d");
    expect(mocks.globalObject.orbitControls).toBe("controls3d");
  });
});
