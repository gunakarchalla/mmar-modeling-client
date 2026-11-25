// P11: RemoteCursorRenderer draws one ArrowHelper per remote collaborator with an
// active cursor. Drives the renderer through a mocked awareness (states map in ->
// arrows in/out of the scene per clientId), exactly the plan's §9 P11 test brief.
//
// `@/engine/global-definition` and `./shared-doc-service` are mocked per the P3/P4
// pattern (the real global-definition builds a WebGLRenderer at module scope). THREE is
// REAL: ArrowHelper/Scene are pure objects, and asserting on real scene children is
// what makes these tests worth writing.
import { describe, it, expect, beforeEach, vi } from "vitest";
import * as THREE from "three";

const mocks = vi.hoisted(() => ({
  globalObject: { tabContext: [] as unknown[], render: false } as any,
  sharedDocService: { forTab: vi.fn(() => null as unknown) },
}));

vi.mock("@/engine/global-definition", () => ({ globalObject: mocks.globalObject }));
vi.mock("./shared-doc-service", () => ({ sharedDocService: mocks.sharedDocService }));

import { RemoteCursorRenderer } from "./remote-cursor-renderer";

/** Minimal stand-in for y-protocols' Awareness: a states map + a handler registry. */
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

const cursorAt = (color: string, tx: number) => ({
  user: { color },
  cursor: { active: true, origin: { x: 0, y: 0, z: 0 }, target: { x: tx, y: 0, z: 0 } },
});

/** A cursor whose ray landed on geometry — what ray-helper sends with kind "object". */
const cursorOnObject = (color: string, objectUuid: string, selectedUuid: string | null = null) => ({
  user: { color },
  cursor: { active: true, origin: { x: 0, y: 0, z: 5 }, target: { x: 0, y: 0, z: 0 }, kind: "object", objectUuid },
  selection: { uuid: selectedUuid },
});

let awareness: FakeAwareness;
let scene: THREE.Scene;
let renderer: RemoteCursorRenderer;

const arrows = () => scene.children.filter((c) => c instanceof THREE.ArrowHelper);
const sprites = () => scene.children.filter((c) => c instanceof THREE.Sprite);
const hoverBoxes = () => scene.children.filter((c) => c instanceof THREE.BoxHelper);

beforeEach(() => {
  vi.clearAllMocks();
  awareness = new FakeAwareness();
  scene = new THREE.Scene();
  mocks.globalObject.tabContext = [{ threeScene: scene }];
  mocks.globalObject.render = false;
  // Labels size themselves against the active camera; a zeroed frustum would make
  // every assertion about scale meaningless.
  mocks.globalObject.camera = new THREE.OrthographicCamera(-1, 1, 1, -1);
  mocks.sharedDocService.forTab = vi.fn((tabIndex: number) =>
    tabIndex === 0 ? ({ awareness } as unknown) : null,
  ) as any;
  renderer = new RemoteCursorRenderer();
});

describe("RemoteCursorRenderer", () => {
  it("adds an arrow for a remote client with an active cursor", () => {
    renderer.bindToSession(0);
    awareness.states.set(2, cursorAt("#ff0000", 5));
    awareness.emit();

    expect(arrows()).toHaveLength(1);
    // The arrow points along +x, from the broadcast origin.
    expect(arrows()[0].position.x).toBe(0);
    expect(mocks.globalObject.render).toBe(true);
  });

  it("never draws an arrow for the local client", () => {
    renderer.bindToSession(0);
    awareness.states.set(awareness.clientID, cursorAt("#ff0000", 5));
    awareness.emit();

    expect(arrows()).toHaveLength(0);
  });

  it("draws one arrow per remote clientId and reuses it on later updates", () => {
    renderer.bindToSession(0);
    awareness.states.set(2, cursorAt("#ff0000", 5));
    awareness.states.set(3, cursorAt("#00ff00", 7));
    awareness.emit();
    expect(arrows()).toHaveLength(2);

    const before = arrows()[0];
    awareness.states.set(2, cursorAt("#ff0000", 9));
    awareness.emit();

    // Same helper re-oriented, not a second arrow for the same client.
    expect(arrows()).toHaveLength(2);
    expect(arrows()[0]).toBe(before);
  });

  it("removes the arrow when a client deactivates its cursor (pointer left the canvas)", () => {
    renderer.bindToSession(0);
    awareness.states.set(2, cursorAt("#ff0000", 5));
    awareness.emit();
    expect(arrows()).toHaveLength(1);

    // What rayHelper.clearCursor() broadcasts on mouseleave.
    awareness.states.set(2, { user: { color: "#ff0000" }, cursor: { active: false } });
    awareness.emit();

    expect(arrows()).toHaveLength(0);
  });

  it("removes the arrow when a client disconnects entirely", () => {
    renderer.bindToSession(0);
    awareness.states.set(2, cursorAt("#ff0000", 5));
    awareness.emit();

    awareness.states.delete(2);
    awareness.emit();

    expect(arrows()).toHaveLength(0);
  });

  it("ignores a degenerate zero-length cursor ray instead of drawing a broken arrow", () => {
    renderer.bindToSession(0);
    awareness.states.set(2, {
      user: { color: "#ff0000" },
      cursor: { active: true, origin: { x: 1, y: 1, z: 1 }, target: { x: 1, y: 1, z: 1 } },
    });
    awareness.emit();

    // The arrow is created but left un-oriented (orientArrow bails under MIN_ARROW_LENGTH).
    expect(arrows()).toHaveLength(1);
    expect(arrows()[0].position.x).toBe(0);
  });

  it("clearForTab removes the tab's arrows and stops listening", () => {
    renderer.bindToSession(0);
    awareness.states.set(2, cursorAt("#ff0000", 5));
    awareness.emit();
    expect(arrows()).toHaveLength(1);

    renderer.clearForTab(0);
    expect(arrows()).toHaveLength(0);
    expect(awareness.handlers).toHaveLength(0);

    // Further awareness churn must not resurrect anything for the closed tab.
    awareness.emit();
    expect(arrows()).toHaveLength(0);
  });

  it("does nothing when the tab has no shared session", () => {
    mocks.sharedDocService.forTab = vi.fn(() => null) as any;
    renderer.bindToSession(0);

    expect(awareness.handlers).toHaveLength(0);
    expect(arrows()).toHaveLength(0);
  });

  // --- named cursor -------------------------------------------------------

  it("puts a named cursor sprite on the point the ray landed on", () => {
    renderer.bindToSession(0);
    awareness.states.set(2, cursorAt("#ff0000", 5));
    awareness.emit();

    expect(sprites()).toHaveLength(1);
    expect(sprites()[0].position.x).toBe(5);
  });

  it("marks the point with a solid head on a translucent shaft", () => {
    renderer.bindToSession(0);
    awareness.states.set(2, cursorAt("#ff0000", 5));
    awareness.emit();

    const arrow = arrows()[0] as THREE.ArrowHelper;
    expect(arrow.cone.visible).toBe(true);
    expect((arrow.cone.material as THREE.MeshBasicMaterial).transparent).toBe(false);
    // Shaft stays translucent so several peers' rays don't swamp the model.
    expect((arrow.line.material as THREE.LineBasicMaterial).opacity).toBeLessThan(1);
  });

  it("keeps the head the same size however long the ray is", () => {
    renderer.bindToSession(0);
    awareness.states.set(2, cursorAt("#ff0000", 5));
    awareness.states.set(3, cursorAt("#00ff00", 200));
    awareness.emit();

    // setLength writes the head length into cone.scale.y; three's default would make
    // it a fifth of the ray, so the long ray would carry a 40-unit cone.
    const [near, far] = arrows() as THREE.ArrowHelper[];
    expect(near.cone.scale.y).toBe(far.cone.scale.y);
    expect(near.cone.scale.y).toBeLessThan(1);
  });

  it("draws the initials pill on top, so a moving pointer's name never flickers", () => {
    renderer.bindToSession(0);
    awareness.states.set(2, cursorAt("#ff0000", 5));
    awareness.emit();

    // The one presence helper that is NOT depth-tested — the selection name tag is.
    expect((sprites()[0] as THREE.Sprite).material.depthTest).toBe(false);
  });

  it("moves the named cursor with the ray and disposes it with the arrow", () => {
    renderer.bindToSession(0);
    awareness.states.set(2, cursorAt("#ff0000", 5));
    awareness.emit();
    const sprite = sprites()[0];

    awareness.states.set(2, cursorAt("#ff0000", 9));
    awareness.emit();
    expect(sprites()).toHaveLength(1);
    expect(sprites()[0]).toBe(sprite);
    expect(sprite.position.x).toBe(9);

    awareness.states.delete(2);
    awareness.emit();
    expect(sprites()).toHaveLength(0);
  });

  it("refreshCursors re-sizes labels when the local camera zooms (awareness is silent then)", () => {
    renderer.bindToSession(0);
    awareness.states.set(2, cursorAt("#ff0000", 5));
    awareness.emit();
    const before = sprites()[0].scale.y;

    (mocks.globalObject.camera as THREE.OrthographicCamera).zoom = 2;
    renderer.refreshCursors();

    // Half the world height in view => half the world size, same size on screen.
    expect(sprites()[0].scale.y).toBeCloseTo(before / 2);
  });

  // --- hover --------------------------------------------------------------

  it("outlines the object a collaborator is pointing at", () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    scene.add(mesh);
    renderer.bindToSession(0);
    awareness.states.set(2, cursorOnObject("#ff0000", mesh.uuid));
    awareness.emit();

    expect(hoverBoxes()).toHaveLength(1);
    // Weaker than a selection box, which draws opaque.
    const material = (hoverBoxes()[0] as THREE.BoxHelper).material as THREE.LineBasicMaterial;
    expect(material.opacity).toBeLessThan(1);
  });

  it("drops the hover outline when the pointer moves off the object onto the plane", () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    scene.add(mesh);
    renderer.bindToSession(0);
    awareness.states.set(2, cursorOnObject("#ff0000", mesh.uuid));
    awareness.emit();
    expect(hoverBoxes()).toHaveLength(1);

    awareness.states.set(2, cursorAt("#ff0000", 5));
    awareness.emit();

    expect(hoverBoxes()).toHaveLength(0);
    expect(arrows()).toHaveLength(1);
  });

  it("does not outline an object the collaborator already has selected", () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    scene.add(mesh);
    renderer.bindToSession(0);
    // RemoteSelectionRenderer draws that object's box; two outlines would stack.
    awareness.states.set(2, cursorOnObject("#ff0000", mesh.uuid, mesh.uuid));
    awareness.emit();

    expect(hoverBoxes()).toHaveLength(0);
  });

  it("disposes the hover outline with the rest of the cursor", () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    scene.add(mesh);
    renderer.bindToSession(0);
    awareness.states.set(2, cursorOnObject("#ff0000", mesh.uuid));
    awareness.emit();
    expect(hoverBoxes()).toHaveLength(1);

    renderer.clearForTab(0);

    expect(hoverBoxes()).toHaveLength(0);
    expect(sprites()).toHaveLength(0);
    expect(arrows()).toHaveLength(0);
  });
});
