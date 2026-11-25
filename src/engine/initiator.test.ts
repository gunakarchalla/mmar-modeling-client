// @vitest-environment jsdom
//
// Regression tests for where `initEventListeners` binds pointer tracking.
//
// The engine's siblings are mocked so `three` never loads for real: importing it at
// module scope builds a WebGLRenderer, which has no context under jsdom. The renderer
// is faked as an object carrying a real <canvas>, because the canvas element identity
// is exactly what these tests are about.
import { describe, it, expect, beforeEach, vi } from "vitest";

const fakeGlobalObject = vi.hoisted(() => ({
  renderer: undefined as any,
  elementContainer: undefined as unknown as HTMLElement,
  onDocumentMouseDownEventListener: undefined as unknown,
}));

const mocks = vi.hoisted(() => ({
  updateMousePos: vi.fn(),
  onDocumentMouseDown: vi.fn(),
  resize: vi.fn(),
  setState: vi.fn(),
}));

vi.mock("@/engine/global-definition", () => ({ globalObject: fakeGlobalObject }));
vi.mock("@/engine/global-state-object", () => ({ globalStateObject: { setState: mocks.setState } }));
vi.mock("@/engine/mouse-object", () => ({ mouseObject: { updateMousePos: mocks.updateMousePos } }));
vi.mock("@/engine/interaction-handler", () => ({ interactionHandler: { onDocumentMouseDown: mocks.onDocumentMouseDown } }));
vi.mock("@/engine/resize", () => ({ resize: { resize: mocks.resize } }));
vi.mock("@/engine/ar-initiator", () => ({ arInitiator: { enableXR: vi.fn(), render: vi.fn() } }));
vi.mock("@/engine/scene-initiator", () => ({ sceneInitiator: { sceneInit: vi.fn(), initTransformControls: vi.fn() } }));
vi.mock("@/resources/services/logger", () => ({ logger: { log: vi.fn() } }));

import { initiator } from "./initiator";

/** A container div holding the singleton canvas, as ThreeCanvas + engine.mount arrange it. */
function mountContainer(canvas: HTMLCanvasElement): HTMLElement {
  const container = document.createElement("div");
  container.appendChild(canvas);
  document.body.appendChild(container);
  fakeGlobalObject.elementContainer = container;
  return container;
}

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = "";
  fakeGlobalObject.renderer = { domElement: document.createElement("canvas") };
  mountContainer(fakeGlobalObject.renderer.domElement);
});

describe("initEventListeners", () => {
  it("registers pointer tracking on the renderer's canvas, not on the container", async () => {
    // Asserted on the registration target rather than on a dispatched event: a move
    // over the canvas bubbles to the container, so either binding would look alike.
    const onCanvas = vi.spyOn(fakeGlobalObject.renderer.domElement, "addEventListener");
    const onContainer = vi.spyOn(fakeGlobalObject.elementContainer, "addEventListener");

    await initiator.initEventListeners();

    expect(onCanvas).toHaveBeenCalledWith("pointermove", expect.any(Function), expect.anything());
    expect(onContainer).not.toHaveBeenCalledWith("pointermove", expect.anything(), expect.anything());
  });

  it("routes a pointer move on the canvas into updateMousePos", async () => {
    await initiator.initEventListeners();

    fakeGlobalObject.renderer.domElement.dispatchEvent(new MouseEvent("pointermove", { bubbles: true }));

    expect(mocks.updateMousePos).toHaveBeenCalledTimes(1);
  });

  /**
   * The bug this guards: `initEventListeners` runs exactly once per page life, while
   * ThreeCanvas destroys and recreates its container on every remount (logout/login
   * being the usual trigger). Bound to the container, pointer tracking died on the
   * detached element after the first remount — and with it `broadcastCursor`, so a
   * remote collaborator's cursor froze until the sender clicked, `pointerdown` being
   * registered on the canvas and therefore still live. Only a page reload cured it.
   */
  it("keeps tracking after the container is swapped for a remount", async () => {
    await initiator.initEventListeners();
    const firstContainer = fakeGlobalObject.elementContainer;

    // What engine.mount() does on a remount: a brand-new container adopts the same
    // canvas, and the old one is dropped from the DOM.
    firstContainer.remove();
    mountContainer(fakeGlobalObject.renderer.domElement);

    fakeGlobalObject.renderer.domElement.dispatchEvent(new MouseEvent("pointermove", { bubbles: true }));

    expect(mocks.updateMousePos).toHaveBeenCalledTimes(1);
  });

  it("exposes the bound pointerdown handler for sceneInitiator to register", async () => {
    await initiator.initEventListeners();

    expect(typeof fakeGlobalObject.onDocumentMouseDownEventListener).toBe("function");
    (fakeGlobalObject.onDocumentMouseDownEventListener as () => void)();
    expect(mocks.onDocumentMouseDown).toHaveBeenCalledTimes(1);
  });
});
