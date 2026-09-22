import { describe, it, expect, beforeEach, vi } from "vitest";
import * as THREE from "three";

/**
 * P12 tests for the interaction handler's SIMULATION MODE branch, and only that branch.
 *
 * Plan §9 P12 lists "simulation_utility execution, interaction onSimulationMode un-stub"
 * as this phase's scope. Both turned out to be ALREADY ported and live — P3 ported
 * simulation-utility and P5 ported onSimulationMode in full (verified line-by-line
 * against the old interaction_handler.ts:707-719). But neither had any test: P5 shipped
 * tests for the consistency checker / creation / deletion handlers, not for the 733-line
 * machine's modes. So the un-stub P12 was asked to perform amounts to PROVING this path
 * works, which is what this file does. It is deliberately narrow — the other four modes
 * remain untested and out of scope here.
 *
 * SimulationMode is the 5th state: clicking a "button" mesh drawn by a vizRep runs that
 * button's `mechanism`/simulation code string against the instance it belongs to.
 */

const fakeGlobal = vi.hoisted(() => ({
  globalObject: {
    buttonObjects: [] as THREE.Mesh[],
    dragObjects: [] as THREE.Mesh[],
    raycaster: { intersectObjects: vi.fn(() => [] as { object: THREE.Object3D }[]), setFromCamera: vi.fn() },
    mouse: { x: 0, y: 0 },
    camera: {},
    scene: {},
    selectedTab: 0,
    tabContext: [] as unknown[],
  },
}));
vi.mock("@/engine/global-definition", () => fakeGlobal);

const mocks = vi.hoisted(() => ({
  globalStateObject: {
    // The real order (global_state_object.stateNames); index 4 is SimulationMode.
    stateNames: ["SelectionMode", "ViewMode", "DrawingMode", "DrawingModeRelationClass", "SimulationMode"],
    getState: vi.fn(() => "SimulationMode"),
    setState: vi.fn(),
    activeStateLine: undefined,
  },
  simulationUtility: { runSimulationFunction: vi.fn(async () => undefined) },
  instanceUtility: { getAnyInstance: vi.fn(async (_uuid: string): Promise<unknown> => undefined) },
  logger: { log: vi.fn() },
}));
vi.mock("@/engine/global-state-object", () => ({ globalStateObject: mocks.globalStateObject }));
vi.mock("@/resources/services/simulation-utility", () => ({ simulationUtility: mocks.simulationUtility }));
vi.mock("@/resources/services/instance-utility", () => ({ instanceUtility: mocks.instanceUtility }));
vi.mock("@/resources/services/logger", () => ({ logger: mocks.logger }));

// The rest of the engine graph the handler pulls in, stubbed to inert objects — this
// file only drives the SimulationMode branch.
vi.mock("@/engine/global-class-object", () => ({ globalClassObject: { getSelectedClass: vi.fn() } }));
vi.mock("@/engine/global-relationclass-object", () => ({
  globalRelationclassObject: { getSelectedRelationClass: vi.fn() },
}));
vi.mock("@/engine/global-selected-object", () => ({
  globalSelectedObject: { setObject: vi.fn(), getObject: vi.fn(), removeObject: vi.fn() },
}));
vi.mock("@/engine/ray-helper", () => ({ rayHelper: { shootRay: vi.fn(), getPositionOfIntersect: vi.fn() } }));
vi.mock("@/engine/graphic-context", () => ({
  graphicContext: { drawVizRep: vi.fn() },
  GraphicContext: class {},
}));
vi.mock("@/engine/instance-creation-handler", () => ({ instanceCreationHandler: { createClassInstance: vi.fn() } }));
vi.mock("@/engine/consistency-checker", () => ({ consistencyChecker: { checkConsistency: vi.fn() } }));
vi.mock("@/engine/deletion-handler", () => ({ deletionHandler: { onPressDelete: vi.fn() } }));
vi.mock("@/resources/services/meta-utility", () => ({ metaUtility: { getMetaClass: vi.fn() } }));
vi.mock("@/resources/collaboration/y-mapping", () => ({ applyLocalChangeToYDoc: vi.fn() }));

const { interactionHandler } = await import("@/engine/interaction-handler");

const SIMULATION_CODE = "async (expression, instance) => { /* move the robot */ }";
const PARENT_UUID = "11111111-1111-4111-8111-111111111111";

/** A vizRep "button" mesh: it carries its code string in userData.expression and hangs
 *  off the instance's own mesh, whose uuid IS the instance uuid (insertObjectToScene). */
function buttonMesh(code: string = SIMULATION_CODE) {
  const parent = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  parent.uuid = PARENT_UUID;
  const button = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1));
  button.userData.expression = code;
  parent.add(button);
  return button;
}

/** The pointer button that got us here. onDocumentMouseDown sets this from the real
 *  event before dispatching to a mode; calling a mode directly has to supply it. */
function setClickedButton(button: number) {
  (interactionHandler as unknown as { clickedButton: number }).clickedButton = button;
}

describe("interaction-handler — SimulationMode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeGlobal.globalObject.raycaster.intersectObjects.mockReturnValue([]);
    mocks.globalStateObject.getState.mockReturnValue("SimulationMode");
    // Default to a left click — the handler is a singleton, so this also stops one
    // test's button from leaking into the next.
    setClickedButton(0);
  });

  it("runs the clicked button's simulation code against the instance it belongs to", async () => {
    const button = buttonMesh();
    const instance = { uuid: PARENT_UUID, name: "robot" };
    fakeGlobal.globalObject.buttonObjects = [button];
    fakeGlobal.globalObject.raycaster.intersectObjects.mockReturnValue([{ object: button }]);
    mocks.instanceUtility.getAnyInstance.mockResolvedValue(instance);

    await interactionHandler.onSimulationMode();

    // It raycasts against the BUTTON meshes, not the draggable instance meshes.
    expect(fakeGlobal.globalObject.raycaster.intersectObjects).toHaveBeenCalledWith([button], false);
    // The instance is resolved from the button's PARENT (the button has no instance uuid).
    expect(mocks.instanceUtility.getAnyInstance).toHaveBeenCalledWith(PARENT_UUID);
    expect(mocks.simulationUtility.runSimulationFunction).toHaveBeenCalledWith(SIMULATION_CODE, instance);
  });

  it("does nothing when the click hits no button", async () => {
    fakeGlobal.globalObject.buttonObjects = [];
    fakeGlobal.globalObject.raycaster.intersectObjects.mockReturnValue([]);

    await interactionHandler.onSimulationMode();

    expect(mocks.simulationUtility.runSimulationFunction).not.toHaveBeenCalled();
  });

  it("does nothing when the button's parent resolves to no instance", async () => {
    const button = buttonMesh();
    fakeGlobal.globalObject.buttonObjects = [button];
    fakeGlobal.globalObject.raycaster.intersectObjects.mockReturnValue([{ object: button }]);
    mocks.instanceUtility.getAnyInstance.mockResolvedValue(undefined);

    await interactionHandler.onSimulationMode();

    expect(mocks.simulationUtility.runSimulationFunction).not.toHaveBeenCalled();
  });

  it("only reacts to the left mouse button", async () => {
    const button = buttonMesh();
    fakeGlobal.globalObject.buttonObjects = [button];
    fakeGlobal.globalObject.raycaster.intersectObjects.mockReturnValue([{ object: button }]);
    mocks.instanceUtility.getAnyInstance.mockResolvedValue({ uuid: PARENT_UUID });

    // 2 = right button, 1 = middle: a vizRep button only fires on a left click.
    setClickedButton(2);
    await interactionHandler.onSimulationMode();
    expect(mocks.simulationUtility.runSimulationFunction).not.toHaveBeenCalled();

    setClickedButton(1);
    await interactionHandler.onSimulationMode();
    expect(mocks.simulationUtility.runSimulationFunction).not.toHaveBeenCalled();

    setClickedButton(0);
    await interactionHandler.onSimulationMode();
    expect(mocks.simulationUtility.runSimulationFunction).toHaveBeenCalledTimes(1);
  });
});
