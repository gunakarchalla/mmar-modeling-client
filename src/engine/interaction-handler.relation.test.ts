import { describe, it, expect, beforeEach, vi } from "vitest";
import * as THREE from "three";

/**
 * The click that closes a relation in DrawingModeRelationClass, and only that click.
 *
 * Two ways a relation used to be saved and never seen: one ending on the object it
 * starts on (the animator has no second object to route to), and one whose last routing
 * frame missed the short window after the click, so its line kept ending at the pointer.
 */

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const RELATION = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const RELATIONCLASS = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const fakeGlobal = vi.hoisted(() => ({
  globalObject: {
    dragObjects: [] as unknown[],
    relationObjects: [] as unknown[],
    raycaster: { intersectObjects: vi.fn(() => [] as unknown[]) },
    autoSave: false,
    objectScaled: false,
    render: false,
    mousePointer3d: { uuid: "pointer" },
  },
}));
vi.mock("@/engine/global-definition", () => fakeGlobal);

const mocks = vi.hoisted(() => ({
  globalStateObject: {
    stateNames: ["SelectionMode", "ViewMode", "DrawingMode", "DrawingModeRelationClass", "SimulationMode"],
    getState: vi.fn(() => "DrawingModeRelationClass"),
    setState: vi.fn(),
    activeStateLine: undefined as { uuid: string } | undefined,
  },
  globalRelationclassObject: {
    getSelectedRelationClass: vi.fn(() => "Flow"),
    relationClassNames: ["Flow"],
    relationClassGeometry: ["async function vizRep(gc) {}"],
    relationClassUUID: [] as string[],
  },
  scene: { class_instances: [] as unknown[], relationclasses_instances: [] as any[] },
  instanceCreationHandler: {
    create_UUID: vi.fn(() => "role-uuid"),
    addLastLinePoint: vi.fn(),
    addPointToClassInstance: vi.fn((relation: any, object: { uuid: string }) => relation.line_points.push({ UUID: object.uuid })),
    createRoleInstance: vi.fn(async () => ({ uuid: "role-uuid" })),
  },
  consistencyChecker: { checkEndPoint: vi.fn(() => true) },
  logger: { log: vi.fn() },
}));
vi.mock("@/engine/global-state-object", () => ({ globalStateObject: mocks.globalStateObject }));
vi.mock("@/engine/global-relationclass-object", () => ({ globalRelationclassObject: mocks.globalRelationclassObject }));
vi.mock("@/engine/instance-creation-handler", () => ({ instanceCreationHandler: mocks.instanceCreationHandler }));
vi.mock("@/engine/consistency-checker", () => ({ consistencyChecker: mocks.consistencyChecker }));
vi.mock("@/resources/services/logger", () => ({ logger: mocks.logger }));
vi.mock("@/resources/services/instance-utility", () => ({
  instanceUtility: {
    getTabContextSceneInstance: vi.fn(async () => mocks.scene),
    getAllPortInstancesOfTabContext: vi.fn(async () => []),
  },
}));
vi.mock("@/resources/services/meta-utility", () => ({
  metaUtility: {
    parseMetaFunction: vi.fn(async () => async () => undefined),
    getTabContextSceneType: vi.fn(async () => ({ relationclasses: [{ uuid: RELATIONCLASS }] })),
  },
}));
vi.mock("@/resources/collaboration/local-change-publisher", () => ({ publishLocalChange: vi.fn() }));

// The rest of the engine graph the handler pulls in, stubbed to inert objects.
vi.mock("@/engine/global-class-object", () => ({ globalClassObject: { getSelectedClass: vi.fn() } }));
vi.mock("@/engine/global-selected-object", () => ({
  globalSelectedObject: { setObject: vi.fn(), getObject: vi.fn(), removeObject: vi.fn() },
}));
vi.mock("@/engine/ray-helper", () => ({ rayHelper: { shootRay: vi.fn() } }));
vi.mock("@/engine/graphic-context", () => ({ graphicContext: {}, GraphicContext: class {} }));
vi.mock("@/engine/deletion-handler", () => ({ deletionHandler: {} }));
vi.mock("@/resources/services/simulation-utility", () => ({ simulationUtility: {} }));

const { interactionHandler } = await import("@/engine/interaction-handler");
const { eventBus } = await import("@/resources/services/event-bus");

/** The relation being drawn, its line so far, and a left click on the object `target`. */
function drawing(linePoints: string[], target: string) {
  const relation: any = { uuid: RELATION, name: "Flow", line_points: linePoints.map((uuid) => ({ UUID: uuid })) };
  mocks.scene.class_instances = [{ uuid: A }, { uuid: B }];
  mocks.scene.relationclasses_instances = [relation];
  mocks.globalStateObject.activeStateLine = { uuid: RELATION };
  const object = new THREE.Mesh();
  object.uuid = target;
  fakeGlobal.globalObject.raycaster.intersectObjects.mockReturnValue([{ object, point: new THREE.Vector3() }]);
  (interactionHandler as unknown as { clickedButton: number }).clickedButton = 0;
  return relation;
}

describe("interaction-handler: the click that closes a relation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.globalRelationclassObject.relationClassUUID = [RELATIONCLASS];
    fakeGlobal.globalObject.objectScaled = false;
    fakeGlobal.globalObject.render = false;
  });

  it("refuses to end on the object it starts on, and keeps drawing", async () => {
    const relation = drawing([A, "pointer"], A);

    await interactionHandler.onDrawingModeRelationclass();

    expect(mocks.logger.log).toHaveBeenCalledWith(expect.stringContaining("cannot end on the object it starts on"), "error");
    expect(relation.role_instance_to).toBeUndefined();
    expect(mocks.instanceCreationHandler.addLastLinePoint).not.toHaveBeenCalled();
    expect(mocks.globalStateObject.activeStateLine).toEqual({ uuid: RELATION });
  });

  it("lets a relation return to its start through a bendpoint, which gives it a line", async () => {
    const relation = drawing([A, "bendpoint", "pointer"], A);

    await interactionHandler.onDrawingModeRelationclass();

    expect(relation.role_instance_to).toBeDefined();
    expect(relation.line_points.map((point: { UUID: string }) => point.UUID)).toEqual([A, "bendpoint", A]);
  });

  it("closes on another object and has the next frame route its line", async () => {
    const relation = drawing([A, "pointer"], B);

    await interactionHandler.onDrawingModeRelationclass();

    expect(relation.role_instance_to).toBeDefined();
    expect(relation.line_points.map((point: { UUID: string }) => point.UUID)).toEqual([A, B]);
    expect(fakeGlobal.globalObject.objectScaled).toBe(true);
    expect(fakeGlobal.globalObject.render).toBe(true);
  });

  // A vizRep that draws from its relations has to see the new one.
  it("has the instances the finished relation connects redrawn", async () => {
    const relation = drawing([A, "pointer"], B);
    const received: unknown[] = [];
    const sub = eventBus.subscribe("checkForVizRepUpdateByRelationInstance", (payload) => received.push(payload));

    await interactionHandler.onDrawingModeRelationclass();
    sub.dispose();

    expect(received).toEqual([relation]);
  });

  it("redraws nothing for a click that does not finish the relation", async () => {
    drawing([A, "pointer"], A);
    const received: unknown[] = [];
    const sub = eventBus.subscribe("checkForVizRepUpdateByRelationInstance", (payload) => received.push(payload));

    await interactionHandler.onDrawingModeRelationclass();
    sub.dispose();

    expect(received).toEqual([]);
  });
});
