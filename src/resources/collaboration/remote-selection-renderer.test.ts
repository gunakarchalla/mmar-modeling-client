// P11: RemoteSelectionRenderer draws one BoxHelper per remote collaborator's selected
// object, in that collaborator's colour. Same harness as remote-cursor-renderer.test.ts
// (mocked global-definition + shared-doc-service, real THREE), plus refreshBoxes() —
// the animator hook that keeps boxes glued to objects as peers drag them.
import { describe, it, expect, beforeEach, vi } from "vitest";
import * as THREE from "three";

const mocks = vi.hoisted(() => ({
  globalObject: { tabContext: [] as unknown[], render: false } as any,
  sharedDocService: { forTab: vi.fn(() => null as unknown) },
}));

vi.mock("@/engine/global-definition", () => ({ globalObject: mocks.globalObject }));
vi.mock("./shared-doc-service", () => ({ sharedDocService: mocks.sharedDocService }));

import { RemoteSelectionRenderer } from "./remote-selection-renderer";

class FakeAwareness {
  clientID = 1;
  states = new Map<number, unknown>();
  handlers: (() => void)[] = [];
  getStates() {
    return this.states;
  }
  on(_event: string, handler: () => void) {
    this.handlers.push(handler);
  }
  off(_event: string, handler: () => void) {
    this.handlers = this.handlers.filter((h) => h !== handler);
  }
  emit() {
    this.handlers.forEach((h) => h());
  }
}

let awareness: FakeAwareness;
let scene: THREE.Scene;
let renderer: RemoteSelectionRenderer;
let meshA: THREE.Mesh;
let meshB: THREE.Mesh;

const boxes = () => scene.children.filter((c) => c instanceof THREE.BoxHelper);
const tags = () => scene.children.filter((c) => c instanceof THREE.Sprite);

/** A selection awareness state, as globalSelectedObject.publishSelection writes it. */
const selecting = (uuid: string | null, color = "#ff0000") => ({
  user: { color, username: "ada", initials: "AD" },
  selection: { uuid },
});

beforeEach(() => {
  vi.clearAllMocks();
  awareness = new FakeAwareness();
  scene = new THREE.Scene();
  meshA = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  meshB = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
  scene.add(meshA, meshB);
  mocks.globalObject.tabContext = [{ threeScene: scene }];
  mocks.globalObject.render = false;
  mocks.globalObject.camera = new THREE.OrthographicCamera(-1, 1, 1, -1);
  mocks.sharedDocService.forTab = vi.fn((tabIndex: number) =>
    tabIndex === 0 ? ({ awareness } as unknown) : null,
  ) as any;
  renderer = new RemoteSelectionRenderer();
});

describe("RemoteSelectionRenderer", () => {
  it("draws a box around the object a remote client selected", () => {
    renderer.bindToSession(0);
    awareness.states.set(2, selecting(meshA.uuid));
    awareness.emit();

    expect(boxes()).toHaveLength(1);
    expect(mocks.globalObject.render).toBe(true);
  });

  it("never draws a box for the local client (we draw our own red one)", () => {
    renderer.bindToSession(0);
    awareness.states.set(awareness.clientID, selecting(meshA.uuid));
    awareness.emit();

    expect(boxes()).toHaveLength(0);
  });

  it("removes the box when a client clears its selection", () => {
    renderer.bindToSession(0);
    awareness.states.set(2, selecting(meshA.uuid));
    awareness.emit();
    expect(boxes()).toHaveLength(1);

    awareness.states.set(2, selecting(null));
    awareness.emit();

    expect(boxes()).toHaveLength(0);
  });

  it("removes the box when a client disconnects", () => {
    renderer.bindToSession(0);
    awareness.states.set(2, selecting(meshA.uuid));
    awareness.emit();

    awareness.states.delete(2);
    awareness.emit();

    expect(boxes()).toHaveLength(0);
  });

  it("rebuilds the box when a client switches to a different object", () => {
    renderer.bindToSession(0);
    awareness.states.set(2, selecting(meshA.uuid));
    awareness.emit();
    const first = boxes()[0];

    awareness.states.set(2, selecting(meshB.uuid));
    awareness.emit();

    expect(boxes()).toHaveLength(1);
    expect(boxes()[0]).not.toBe(first);
  });

  it("ignores a selection whose object is not in the local scene yet", () => {
    renderer.bindToSession(0);
    awareness.states.set(2, selecting("not-a-mesh-in-this-scene"));
    awareness.emit();

    expect(boxes()).toHaveLength(0);
  });

  it("refreshBoxes re-fits a box after its target moves (awareness does not fire on drag)", () => {
    renderer.bindToSession(0);
    awareness.states.set(2, selecting(meshA.uuid));
    awareness.emit();
    const box = boxes()[0] as THREE.BoxHelper;
    const fit = vi.spyOn(box, "setFromObject");

    meshA.position.set(10, 0, 0);
    meshA.updateMatrixWorld(true);
    renderer.refreshBoxes();

    expect(fit).toHaveBeenCalledWith(meshA);
  });

  it("refreshBoxes drops a box whose target was deleted remotely", () => {
    renderer.bindToSession(0);
    awareness.states.set(2, selecting(meshA.uuid));
    awareness.emit();
    expect(boxes()).toHaveLength(1);

    scene.remove(meshA);
    renderer.refreshBoxes();

    expect(boxes()).toHaveLength(0);
  });

  it("refreshBoxes is a cheap no-op with no remote selections", () => {
    renderer.bindToSession(0);
    expect(() => renderer.refreshBoxes()).not.toThrow();
    expect(boxes()).toHaveLength(0);
  });

  it("clearForTab removes the tab's boxes and stops listening", () => {
    renderer.bindToSession(0);
    awareness.states.set(2, selecting(meshA.uuid));
    awareness.emit();
    expect(boxes()).toHaveLength(1);

    renderer.clearForTab(0);

    expect(boxes()).toHaveLength(0);
    expect(awareness.handlers).toHaveLength(0);
  });

  // --- name tag -----------------------------------------------------------

  it("names the box's owner above it (the box outlives their cursor, so it must)", () => {
    renderer.bindToSession(0);
    awareness.states.set(2, selecting(meshA.uuid));
    awareness.emit();

    expect(tags()).toHaveLength(1);
    // meshA is a unit cube at the origin, so its top edge is y = 0.5.
    expect(tags()[0].position.y).toBeGreaterThan(0.5);
    expect(tags()[0].position.x).toBeCloseTo(0);
  });

  it("refreshBoxes carries the name tag along when the target moves", () => {
    renderer.bindToSession(0);
    awareness.states.set(2, selecting(meshA.uuid));
    awareness.emit();

    meshA.position.set(10, 4, 0);
    meshA.updateMatrixWorld(true);
    renderer.refreshBoxes();

    expect(tags()[0].position.x).toBeCloseTo(10);
    expect(tags()[0].position.y).toBeGreaterThan(4.5);
  });

  it("depth-tests the name tag, unlike the cursor pill — it sits in the scene", () => {
    renderer.bindToSession(0);
    awareness.states.set(2, selecting(meshA.uuid));
    awareness.emit();

    expect((tags()[0] as THREE.Sprite).material.depthTest).toBe(true);
  });

  it("removes the name tag with its box", () => {
    renderer.bindToSession(0);
    awareness.states.set(2, selecting(meshA.uuid));
    awareness.emit();
    expect(tags()).toHaveLength(1);

    awareness.states.set(2, selecting(null));
    awareness.emit();

    expect(tags()).toHaveLength(0);
  });
});
