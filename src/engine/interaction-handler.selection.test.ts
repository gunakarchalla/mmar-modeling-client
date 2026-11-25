import { describe, it, expect, beforeEach, vi } from "vitest";
import * as THREE from "three";

/**
 * Tests for `interactionHandler.selectInstanceByUuid` — the entry point the left-panel
 * model tree uses to select a scene object from a list rather than a canvas pick. It
 * must drive the same engine state a pick does (selected object, gizmo, selection store,
 * attribute-GUI bus) and optionally pan the camera, and be a safe no-op for a UUID that
 * is not currently drawn.
 */

// No THREE here — vi.hoisted runs before the `import * as THREE` above. The camera and
// orbit controls (which need real Vector3 maths in focusCameraOnObject) are assigned in
// beforeEach instead.
const fakeGlobal = vi.hoisted(() => ({
  globalObject: {
    dragObjects: [] as unknown[],
    transformControls: { setMode: vi.fn(), attach: vi.fn(), detach: vi.fn() },
    orbitControls: undefined as any,
    camera: undefined as any,
    raycaster: { intersectObjects: vi.fn(() => []), setFromCamera: vi.fn() },
    current_class_instance: undefined as unknown,
    current_port_instance: undefined as unknown,
    selectedTab: 0,
    tabContext: [] as unknown[],
    scene: {},
    render: false,
    threeDimensional: false,
  },
}));
vi.mock("@/engine/global-definition", () => fakeGlobal);

const mocks = vi.hoisted(() => ({
  globalStateObject: {
    stateNames: ["SelectionMode", "ViewMode", "DrawingMode", "DrawingModeRelationClass", "SimulationMode"],
    getState: vi.fn(() => "SelectionMode"),
    setState: vi.fn(),
    activeStateLine: undefined,
  },
  globalSelectedObject: { setObject: vi.fn(), getObject: vi.fn(), removeObject: vi.fn(), setSelectedInstance: vi.fn() },
  instanceUtility: {
    getClassInstance: vi.fn(async (_uuid: string): Promise<unknown> => undefined),
    getPortInstance: vi.fn(async (_uuid: string): Promise<unknown> => undefined),
    getTabContextSceneInstance: vi.fn(async () => ({ relationclasses_instances: [] })),
  },
  logger: { log: vi.fn() },
}));
vi.mock("@/engine/global-state-object", () => ({ globalStateObject: mocks.globalStateObject }));
vi.mock("@/engine/global-selected-object", () => ({ globalSelectedObject: mocks.globalSelectedObject }));
vi.mock("@/resources/services/instance-utility", () => ({ instanceUtility: mocks.instanceUtility }));
vi.mock("@/resources/services/logger", () => ({ logger: mocks.logger }));

// The rest of the engine graph the handler imports, stubbed inert.
vi.mock("@/engine/global-class-object", () => ({ globalClassObject: { getSelectedClass: vi.fn() } }));
vi.mock("@/engine/global-relationclass-object", () => ({
  globalRelationclassObject: { getSelectedRelationClass: vi.fn() },
}));
vi.mock("@/engine/ray-helper", () => ({ rayHelper: { shootRay: vi.fn(), getPositionOfIntersect: vi.fn() } }));
vi.mock("@/engine/graphic-context", () => ({ graphicContext: { drawVizRep: vi.fn() }, GraphicContext: class {} }));
vi.mock("@/engine/instance-creation-handler", () => ({ instanceCreationHandler: { createClassInstance: vi.fn() } }));
vi.mock("@/engine/consistency-checker", () => ({ consistencyChecker: { checkConsistency: vi.fn() } }));
vi.mock("@/engine/deletion-handler", () => ({ deletionHandler: { onPressDelete: vi.fn() } }));
vi.mock("@/resources/services/meta-utility", () => ({ metaUtility: { getMetaClass: vi.fn() } }));
vi.mock("@/resources/services/simulation-utility", () => ({ simulationUtility: { runSimulationFunction: vi.fn() } }));
vi.mock("@/resources/collaboration/local-change-publisher", () => ({ publishLocalChange: vi.fn() }));

const { interactionHandler } = await import("@/engine/interaction-handler");
const { useSelectionStore } = await import("@/resources/store/selectionStore");
const { eventBus } = await import("@/resources/services/event-bus");
const { runExclusive, resetDrawLock } = await import("@/resources/services/draw-lock");

const UUID = "22222222-2222-4222-8222-222222222222";

function instanceMesh(uuid: string, at = new THREE.Vector3(5, 7, 0)) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  mesh.uuid = uuid;
  mesh.position.copy(at);
  mesh.updateMatrixWorld(true);
  return mesh;
}

describe("interaction-handler — selectInstanceByUuid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDrawLock();
    fakeGlobal.globalObject.dragObjects = [];
    fakeGlobal.globalObject.orbitControls = { target: new THREE.Vector3(0, 0, 0), update: vi.fn() };
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 0, 10);
    fakeGlobal.globalObject.camera = camera;
    fakeGlobal.globalObject.render = false;
    mocks.globalStateObject.getState.mockReturnValue("SelectionMode");
    useSelectionStore.getState().clearSelection();
  });

  it("selects the drawn object: gizmo, selection store and attribute bus", async () => {
    const mesh = instanceMesh(UUID);
    fakeGlobal.globalObject.dragObjects = [mesh];
    mocks.instanceUtility.getClassInstance.mockResolvedValue({ uuid: UUID, name: "Task" });

    const removed = vi.fn();
    const sub = eventBus.subscribe("removeAttributeGui", removed);

    await interactionHandler.selectInstanceByUuid(UUID);
    sub.dispose();

    expect(mocks.globalSelectedObject.setObject).toHaveBeenCalledWith(mesh);
    expect(fakeGlobal.globalObject.transformControls.attach).toHaveBeenCalledWith(mesh);
    expect(useSelectionStore.getState().selectedInstanceUuid).toBe(UUID);
    expect(useSelectionStore.getState().selectedType).toBe("class");
    expect(removed).toHaveBeenCalled();
    expect(fakeGlobal.globalObject.render).toBe(true);
  });

  it("enters SelectionMode first when the canvas is in another mode", async () => {
    fakeGlobal.globalObject.dragObjects = [instanceMesh(UUID)];
    mocks.globalStateObject.getState.mockReturnValue("ViewMode");

    await interactionHandler.selectInstanceByUuid(UUID);

    expect(mocks.globalStateObject.setState).toHaveBeenCalledWith(0);
  });

  it("pans the camera to the object when focusCamera is set", async () => {
    fakeGlobal.globalObject.dragObjects = [instanceMesh(UUID, new THREE.Vector3(5, 7, 0))];

    await interactionHandler.selectInstanceByUuid(UUID, { focusCamera: true });

    expect(fakeGlobal.globalObject.orbitControls.target.x).toBeCloseTo(5);
    expect(fakeGlobal.globalObject.orbitControls.target.y).toBeCloseTo(7);
    // camera keeps its offset from the target (was (0,0,10) with target (0,0,0)).
    expect(fakeGlobal.globalObject.camera.position.z).toBeCloseTo(10);
    expect(fakeGlobal.globalObject.orbitControls.update).toHaveBeenCalled();
  });

  it("waits for a click or draw pass already in the lane", async () => {
    fakeGlobal.globalObject.dragObjects = [instanceMesh(UUID)];
    let finishDraw!: () => void;
    const draw = runExclusive(() => new Promise<void>((resolve) => (finishDraw = resolve)));

    const selecting = interactionHandler.selectInstanceByUuid(UUID);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mocks.globalSelectedObject.setObject).not.toHaveBeenCalled();

    finishDraw();
    await Promise.all([draw, selecting]);
    expect(mocks.globalSelectedObject.setObject).toHaveBeenCalledTimes(1);
  });

  it("is a logged no-op for a UUID that is not drawn", async () => {
    fakeGlobal.globalObject.dragObjects = [];

    await expect(interactionHandler.selectInstanceByUuid("not-drawn")).resolves.toBeUndefined();

    expect(mocks.globalSelectedObject.setObject).not.toHaveBeenCalled();
    expect(mocks.logger.log).toHaveBeenCalled();
  });
});
