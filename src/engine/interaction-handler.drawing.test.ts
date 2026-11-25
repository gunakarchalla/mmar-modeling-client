import { describe, it, expect, beforeEach, vi } from "vitest";
import * as THREE from "three";

/**
 * The click that drops a new class instance from the palette (DrawingMode), and how it
 * draws the instance's ports.
 *
 * A port's vizRep reads attributes through the expression API, which looks in the class
 * instance first. The drop used to leave the new class set while its ports were drawn,
 * so a port reading "Name" showed its CLASS's name until its next redraw.
 */

const plane = { uuid: "plane" };

const fakeGlobal = vi.hoisted(() => ({
  globalObject: {
    dragObjects: [] as unknown[],
    raycaster: { intersectObjects: vi.fn(() => [] as unknown[]) },
    plane: undefined as unknown,
    autoSave: false,
    render: false,
    current_class_instance: undefined as unknown,
    current_port_instance: undefined as unknown,
  },
}));
vi.mock("@/engine/global-definition", () => fakeGlobal);

const mocks = vi.hoisted(() => ({
  classInstance: undefined as unknown as { uuid: string; name: string; port_instance: { uuid: string; uuid_port: string }[] },
  graphicContext: {
    resetInstance: vi.fn(async () => undefined),
    runVizRepFunction: vi.fn(async (_code: unknown, _instance?: unknown) => undefined),
    drawVizRep: vi.fn(async () => ({ uuid: "class-object" })),
    current_instance_object: undefined as unknown,
  },
  portRuns: [] as { instance: unknown; currentClass: unknown; currentPort: unknown }[],
}));

vi.mock("@/engine/graphic-context", () => ({
  graphicContext: mocks.graphicContext,
  GraphicContext: class {
    async resetInstance() {}
    async runVizRepFunction(_code: unknown, instance: unknown) {
      mocks.portRuns.push({ instance, currentClass: fakeGlobal.globalObject.current_class_instance, currentPort: fakeGlobal.globalObject.current_port_instance });
    }
    async drawVizRepPort() {
      return { position: { set: vi.fn() } };
    }
    attachPort() {}
  },
}));
vi.mock("@/engine/global-class-object", () => ({
  globalClassObject: {
    getSelectedClassUUID: vi.fn(() => "meta-class"),
    classUUID: ["meta-class"],
    classGeometry: [JSON.stringify("class vizRep")],
  },
}));
vi.mock("@/engine/instance-creation-handler", () => ({
  instanceCreationHandler: {
    create_UUID: vi.fn(() => "new-uuid"),
    createClassInstance: vi.fn(async () => {
      // As the real one leaves it: the new instance is the one being drawn.
      fakeGlobal.globalObject.current_class_instance = mocks.classInstance;
      return mocks.classInstance;
    }),
  },
}));
vi.mock("@/resources/services/meta-utility", () => ({
  metaUtility: {
    parseMetaFunction: vi.fn(async (code: string) => code),
    getMetaPort: vi.fn(async () => ({ geometry: "port vizRep", coordinates_2d: { x: 0, y: 0, z: 0 } })),
  },
}));
vi.mock("@/resources/collaboration/local-change-publisher", () => ({ publishLocalChange: vi.fn() }));
vi.mock("@/resources/services/logger", () => ({ logger: { log: vi.fn() } }));
vi.mock("@/resources/services/instance-utility", () => ({ instanceUtility: {} }));
vi.mock("@/engine/global-state-object", () => ({ globalStateObject: { setState: vi.fn() } }));
vi.mock("@/engine/global-relationclass-object", () => ({ globalRelationclassObject: {} }));
vi.mock("@/engine/global-selected-object", () => ({ globalSelectedObject: {} }));
vi.mock("@/engine/consistency-checker", () => ({ consistencyChecker: {} }));
vi.mock("@/engine/ray-helper", () => ({ rayHelper: {} }));
vi.mock("@/engine/deletion-handler", () => ({ deletionHandler: {} }));
vi.mock("@/resources/services/simulation-utility", () => ({ simulationUtility: {} }));

const { interactionHandler } = await import("@/engine/interaction-handler");

describe("interaction-handler: dropping a class instance from the palette", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.portRuns.length = 0;
    mocks.classInstance = { uuid: "class-1", name: "Thing", port_instance: [{ uuid: "port-1", uuid_port: "meta-port" }] };
    fakeGlobal.globalObject.plane = plane;
    fakeGlobal.globalObject.raycaster.intersectObjects.mockReturnValue([{ object: plane, point: new THREE.Vector3(1, 2, 0) }]);
    (interactionHandler as unknown as { clickedButton: number }).clickedButton = 0;
  });

  it("draws the class as the class, and each port as the port with no class set", async () => {
    await interactionHandler.onDrawingMode();

    expect(mocks.graphicContext.runVizRepFunction).toHaveBeenCalledWith("class vizRep", mocks.classInstance);
    expect(mocks.portRuns).toEqual([{ instance: mocks.classInstance.port_instance[0], currentClass: undefined, currentPort: mocks.classInstance.port_instance[0] }]);
    // Afterwards the new instance is the one being drawn again, as before the ports.
    expect(fakeGlobal.globalObject.current_class_instance).toBe(mocks.classInstance);
    expect(fakeGlobal.globalObject.current_port_instance).toBeUndefined();
  });
});
