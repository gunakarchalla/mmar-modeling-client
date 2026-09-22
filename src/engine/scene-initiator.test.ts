// @vitest-environment jsdom
//
// Regression tests for initTransformControls' cleanup of the PREVIOUS controls.
// global-definition builds a THREE.WebGLRenderer at module scope, so it is replaced
// with a fake carrying a real canvas as the renderer's domElement — TransformControls
// registers its pointer listeners there, and those listeners are what the leak is about.
import { describe, it, expect, beforeEach, vi } from "vitest";
import * as THREE from "three";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";

const fakeGlobalObject = vi.hoisted(() => ({
  scene: undefined as unknown as THREE.Scene,
  camera: undefined as unknown as THREE.Camera,
  renderer: undefined as any,
  transformControls: undefined as unknown as TransformControls,
  onDocumentMouseDownEventListener: () => {},
  elementContainer: undefined as unknown,
  localZPlane: 0,
  mousePointer3d: undefined as unknown as THREE.Mesh,
  plane: undefined as unknown as THREE.Mesh,
}));

vi.mock("@/engine/global-definition", () => ({ globalObject: fakeGlobalObject }));
vi.mock("@/engine/transform-control-events", () => ({ transformControlsEvents: { onTransformControlsPropertyChange: vi.fn(), onTransformControlsMouseUp: vi.fn() } }));

import { sceneInitiator } from "./scene-initiator";

beforeEach(() => {
  fakeGlobalObject.scene = new THREE.Scene();
  fakeGlobalObject.camera = new THREE.OrthographicCamera(0, 0, 0, 0);
  fakeGlobalObject.renderer = { domElement: document.createElement("canvas") };
  fakeGlobalObject.transformControls = undefined as unknown as TransformControls;
});

describe("initTransformControls", () => {
  it("builds controls and adds their helper to the scene", async () => {
    await sceneInitiator.initTransformControls();

    const controls = fakeGlobalObject.transformControls;
    expect(controls).toBeDefined();
    expect(fakeGlobalObject.scene.children).toContain(controls.getHelper());
  });

  /**
   * The leak behind the reported crash: the old lookup traversed the scene for a
   * `child instanceof TransformControls`, which since three 0.169 can never match —
   * TransformControls extends Controls, not Object3D, so it is not in the scene. Every
   * call left the previous instance connected to the canvas, and a stray 'mouseUp' from
   * one of those was read against the new, empty controls.
   */
  it("disconnects the PREVIOUS controls from the canvas", async () => {
    const canvas = fakeGlobalObject.renderer.domElement as HTMLCanvasElement;
    const removed: string[] = [];
    const realRemove = canvas.removeEventListener.bind(canvas);
    canvas.removeEventListener = ((type: string, ...rest: any[]) => {
      removed.push(type);
      return (realRemove as any)(type, ...rest);
    }) as typeof canvas.removeEventListener;

    await sceneInitiator.initTransformControls();
    const first = fakeGlobalObject.transformControls;
    removed.length = 0;

    await sceneInitiator.initTransformControls();

    expect(fakeGlobalObject.transformControls).not.toBe(first);
    // disconnect() takes off pointerdown / pointermove / pointerup.
    expect(removed).toContain("pointerdown");
    expect(removed).toContain("pointerup");
    expect(removed).toContain("pointermove");
  });

  it("does not leave the previous helper in the scene", async () => {
    await sceneInitiator.initTransformControls();
    const firstHelper = fakeGlobalObject.transformControls.getHelper();

    await sceneInitiator.initTransformControls();

    expect(fakeGlobalObject.scene.children).not.toContain(firstHelper);
    expect(firstHelper.parent).toBeNull();
    // Exactly one helper, however many times the scene is rebuilt.
    expect(fakeGlobalObject.scene.children.filter((c) => c === fakeGlobalObject.transformControls.getHelper())).toHaveLength(1);
  });

  /**
   * sceneInit and the tab switch both reassign `globalObject.scene` BEFORE calling this,
   * so the outgoing helper is parented to a scene we no longer hold.
   */
  it("detaches the previous helper even after the scene was swapped", async () => {
    await sceneInitiator.initTransformControls();
    const firstHelper = fakeGlobalObject.transformControls.getHelper();
    const oldScene = fakeGlobalObject.scene;
    fakeGlobalObject.scene = new THREE.Scene();

    await sceneInitiator.initTransformControls();

    expect(oldScene.children).not.toContain(firstHelper);
    expect(firstHelper.parent).toBeNull();
  });
});
