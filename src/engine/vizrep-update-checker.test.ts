// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { AttributeInstance, ClassInstance } from "@gds";

/**
 * P4 tests for the vizrep-update-checker's two event-bus channels (plan §5 +
 * §9 P4 "Done when: vizrep-update-checker reacts to the two bus channels").
 *
 * global-definition is faked (WebGLRenderer at module scope, see P3 note); the
 * graphic-context and the two utility singletons are mocked so we assert the
 * checker's ORCHESTRATION (which geometry string gets run, whether the vizrep is
 * refreshed at all, and the readyForVizRepUpdate lock) rather than re-testing the
 * drawing itself, which graphic-context.test.ts covers.
 */

const fakeGlobal = vi.hoisted(() => ({
  globalObject: {
    readyForVizRepUpdate: true,
    current_class_instance: null as unknown,
    selectedTab: 0,
    tabContext: [] as { sceneInstance: unknown }[],
  },
}));
vi.mock("@/engine/global-definition", () => fakeGlobal);

const gcMock = vi.hoisted(() => ({
  graphicContext: {
    current_instance_object: null as unknown,
    resetInstance: vi.fn(),
    runVizRepFunction: vi.fn(async () => {}),
    updateVizRep: vi.fn(async () => {}),
  },
}));
vi.mock("@/engine/graphic-context", () => gcMock);

const CLASS_INSTANCE_UUID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const META_CLASS_UUID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ATTR_UUID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

// Geometry that DOES reference the meta attribute's name ("label") -> must redraw.
const GEOMETRY_REFERENCING_ATTR = "async function vizRep(gc) { await gc.graphic_text(0,0,0,0.1,'black', await gc.expression.attrval('label')); }";
// Geometry that references neither the attribute name nor its uuid -> must NOT redraw.
const GEOMETRY_IGNORING_ATTR = "async function vizRep(gc) { await gc.graphic_sphere(0.05, 10, 10, 'black'); }";

const utils = vi.hoisted(() => ({
  instanceUtility: {
    getAllRelationClassInstances: vi.fn(async () => [] as unknown[]),
    getClassInstance: vi.fn(),
    getPortInstance: vi.fn(),
    getSceneInstance: vi.fn(),
    getAllAttributeInstancesFromObjectInstanceRecursively: vi.fn(async () => [] as unknown[]),
  },
  metaUtility: {
    getMetaClass: vi.fn(),
    getMetaRelationclass: vi.fn(),
    getMetaPort: vi.fn(),
    getSceneTypeByUUID: vi.fn(),
    getMetaAttribute: vi.fn(),
  },
}));
vi.mock("@/resources/services/instance-utility", () => ({ instanceUtility: utils.instanceUtility }));
vi.mock("@/resources/services/meta-utility", () => ({ metaUtility: utils.metaUtility }));

const { eventBus } = await import("@/resources/services/event-bus");
// Importing the module constructs the singleton, which is what subscribes the bus.
const { vizrepUpdateChecker } = await import("@/engine/vizrep-update-checker");

function makeClassInstance(): ClassInstance {
  return ClassInstance.fromJS({
    uuid: CLASS_INSTANCE_UUID,
    name: "inst",
    uuid_class: META_CLASS_UUID,
    coordinates_2d: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    custom_variables: {},
    attribute_instances: [],
    port_instances: [],
  }) as ClassInstance;
}

function makeAttributeInstance(): AttributeInstance {
  return AttributeInstance.fromJS({
    uuid: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    uuid_attribute: ATTR_UUID,
    assigned_uuid_class_instance: CLASS_INSTANCE_UUID,
    value: "new value",
  }) as AttributeInstance;
}

/** The bus dispatches synchronously but the handler is async — let it settle. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  vi.clearAllMocks();
  fakeGlobal.globalObject.readyForVizRepUpdate = true;
  fakeGlobal.globalObject.current_class_instance = null;
  utils.instanceUtility.getAllRelationClassInstances.mockResolvedValue([]);
  utils.instanceUtility.getClassInstance.mockResolvedValue(makeClassInstance());
  utils.metaUtility.getMetaClass.mockResolvedValue({ geometry: GEOMETRY_REFERENCING_ATTR });
  utils.metaUtility.getMetaAttribute.mockResolvedValue({ name: "label" });
});

describe("checkForVizRepUpdate", () => {
  it("re-runs and updates the vizrep when the geometry references the changed attribute", async () => {
    // `current_class_instance` is what the running vizRep code reads its values through
    // (gc.expression.attrval), so capture it AT THE MOMENT the geometry runs.
    let instanceSeenByVizRep: unknown;
    gcMock.graphicContext.runVizRepFunction.mockImplementationOnce(async () => {
      instanceSeenByVizRep = fakeGlobal.globalObject.current_class_instance;
    });

    await vizrepUpdateChecker.checkForVizRepUpdate(makeAttributeInstance());

    expect(gcMock.graphicContext.runVizRepFunction).toHaveBeenCalledWith(GEOMETRY_REFERENCING_ATTR);
    expect(gcMock.graphicContext.updateVizRep).toHaveBeenCalledTimes(1);
    // The instance must be the one the vizrep code will read its values from.
    expect((gcMock.graphicContext.updateVizRep.mock.calls[0] as unknown[])[0]).toMatchObject({ uuid: CLASS_INSTANCE_UUID });
    expect(instanceSeenByVizRep).toMatchObject({ uuid: CLASS_INSTANCE_UUID });
  });

  it("skips the redraw when the geometry does not reference the changed attribute", async () => {
    utils.metaUtility.getMetaClass.mockResolvedValue({ geometry: GEOMETRY_IGNORING_ATTR });

    await vizrepUpdateChecker.checkForVizRepUpdate(makeAttributeInstance());

    expect(gcMock.graphicContext.runVizRepFunction).not.toHaveBeenCalled();
    expect(gcMock.graphicContext.updateVizRep).not.toHaveBeenCalled();
  });

  it("matches on the attribute uuid too, not only its name", async () => {
    utils.metaUtility.getMetaClass.mockResolvedValue({ geometry: `async function vizRep(gc) { await gc.dynval('${ATTR_UUID}', 'x'); }` });
    // A meta attribute the server has no name for must not break uuid matching.
    utils.metaUtility.getMetaAttribute.mockResolvedValue(undefined);

    await vizrepUpdateChecker.checkForVizRepUpdate(makeAttributeInstance());

    expect(gcMock.graphicContext.runVizRepFunction).toHaveBeenCalledTimes(1);
  });

  it("drops non-user_locked custom variables so the vizrep can recompute them", async () => {
    const instance = makeClassInstance();
    (instance.custom_variables as Record<string, unknown>).free = { value: 1, instance_adaptable: true, user_locked: false };
    (instance.custom_variables as Record<string, unknown>).pinned = { value: 2, instance_adaptable: true, user_locked: true };
    utils.instanceUtility.getClassInstance.mockResolvedValue(instance);

    await vizrepUpdateChecker.checkForVizRepUpdate(makeAttributeInstance());

    // A variable the user moved by hand (user_locked) must survive the redraw.
    expect(instance.custom_variables).not.toHaveProperty("free");
    expect(instance.custom_variables).toHaveProperty("pinned");
  });

  it("releases the readyForVizRepUpdate lock when finished", async () => {
    await vizrepUpdateChecker.checkForVizRepUpdate(makeAttributeInstance());
    expect(fakeGlobal.globalObject.readyForVizRepUpdate).toBe(true);
  });

  // A SceneType has no vizRep of its own — `geometry` is null in every example
  // metamodel — so editing a scene instance's own attribute used to throw
  // "Cannot read properties of null (reading 'toString')" here.
  it("skips the update for a scene-instance attribute whose scene type draws nothing", async () => {
    const sceneAttribute = AttributeInstance.fromJS({
      uuid: "ai-scene",
      uuid_attribute: ATTR_UUID,
      assigned_uuid_scene_instance: "si-1",
      value: "my model",
    }) as AttributeInstance;
    utils.instanceUtility.getSceneInstance.mockResolvedValue({ uuid: "si-1", uuid_scene_type: "st-1" });
    utils.metaUtility.getSceneTypeByUUID.mockResolvedValue({ uuid: "st-1", geometry: null });

    await expect(vizrepUpdateChecker.checkForVizRepUpdate(sceneAttribute)).resolves.toBeUndefined();

    expect(gcMock.graphicContext.runVizRepFunction).not.toHaveBeenCalled();
    expect(fakeGlobal.globalObject.readyForVizRepUpdate).toBe(true);
  });

  it("redraws a scene instance whose scene type does have a geometry", async () => {
    const sceneAttribute = AttributeInstance.fromJS({
      uuid: "ai-scene",
      uuid_attribute: ATTR_UUID,
      assigned_uuid_scene_instance: "si-1",
      value: "my model",
    }) as AttributeInstance;
    const sceneInstance = { uuid: "si-1", uuid_scene_type: "st-1", custom_variables: {} };
    utils.instanceUtility.getSceneInstance.mockResolvedValue(sceneInstance);
    utils.metaUtility.getSceneTypeByUUID.mockResolvedValue({ uuid: "st-1", geometry: GEOMETRY_REFERENCING_ATTR });

    await vizrepUpdateChecker.checkForVizRepUpdate(sceneAttribute);

    expect(gcMock.graphicContext.runVizRepFunction).toHaveBeenCalledWith(GEOMETRY_REFERENCING_ATTR);
    expect(gcMock.graphicContext.updateVizRep).toHaveBeenCalledWith(sceneInstance);
  });

  it("releases the lock even when the update throws", async () => {
    gcMock.graphicContext.runVizRepFunction.mockRejectedValueOnce(new Error("boom"));

    await expect(vizrepUpdateChecker.checkForVizRepUpdate(makeAttributeInstance())).rejects.toThrow("boom");

    // Left false, expression-utility's `while (!readyForVizRepUpdate)` would spin forever.
    expect(fakeGlobal.globalObject.readyForVizRepUpdate).toBe(true);
  });
});

describe("event-bus channels", () => {
  it("'checkForVizRepUpdateByAttributeInstance' redraws the payload's instance", async () => {
    eventBus.publish("checkForVizRepUpdateByAttributeInstance", makeAttributeInstance());
    await flush();

    expect(gcMock.graphicContext.runVizRepFunction).toHaveBeenCalledWith(GEOMETRY_REFERENCING_ATTR);
    expect(gcMock.graphicContext.updateVizRep).toHaveBeenCalledTimes(1);
  });

  it("'checkForVizRepUpdate' sweeps every attribute instance of the open scene", async () => {
    const attributeInstance = makeAttributeInstance();
    fakeGlobal.globalObject.tabContext = [{ sceneInstance: { attribute_instances: [attributeInstance] } }];

    eventBus.publish("checkForVizRepUpdate");
    await flush();

    expect(gcMock.graphicContext.updateVizRep).toHaveBeenCalledTimes(1);
  });

  it("de-duplicates a sweep by class instance so each instance is redrawn once", async () => {
    // Two attributes on the SAME class instance -> a single redraw.
    fakeGlobal.globalObject.tabContext = [{ sceneInstance: { attribute_instances: [makeAttributeInstance(), makeAttributeInstance()] } }];

    await vizrepUpdateChecker.checkForVisualizationUpdate();

    expect(gcMock.graphicContext.updateVizRep).toHaveBeenCalledTimes(1);
  });
});

/**
 * The update BORROWS `globalObject.current_class_instance` to tell the vizRep pipeline
 * which instance it is drawing. That field is also the one a Delete keypress acts on —
 * `deletionHandler.onPressDelete` reads it and nothing else — so an update that walks
 * away leaving it set silently re-aims the user's next Delete. No timing coincidence is
 * needed: every remote attribute edit went through here.
 */
describe("checkForVizRepUpdate — the borrowed current_class_instance", () => {
  it("hands the field back to whatever the local user had selected", async () => {
    const userSelection = { uuid: "the-users-own-selection" };
    fakeGlobal.globalObject.current_class_instance = userSelection;

    // A peer's edit to a DIFFERENT instance arrives and redraws it.
    await vizrepUpdateChecker.checkForVizRepUpdate(makeAttributeInstance());

    expect(fakeGlobal.globalObject.current_class_instance).toBe(userSelection);
  });

  it("leaves nothing selected when nothing was selected before", async () => {
    // The worst version of the bug: no selection on screen to explain what Delete hits.
    fakeGlobal.globalObject.current_class_instance = null;

    await vizrepUpdateChecker.checkForVizRepUpdate(makeAttributeInstance());

    expect(fakeGlobal.globalObject.current_class_instance).toBeNull();
  });

  it("hands the field back even when the redraw throws", async () => {
    const userSelection = { uuid: "the-users-own-selection" };
    fakeGlobal.globalObject.current_class_instance = userSelection;
    gcMock.graphicContext.runVizRepFunction.mockRejectedValueOnce(new Error("boom"));

    await expect(vizrepUpdateChecker.checkForVizRepUpdate(makeAttributeInstance())).rejects.toThrow("boom");

    expect(fakeGlobal.globalObject.current_class_instance).toBe(userSelection);
  });

  it("hands it back on the early return where the attribute draws nothing", async () => {
    const userSelection = { uuid: "the-users-own-selection" };
    fakeGlobal.globalObject.current_class_instance = userSelection;
    utils.metaUtility.getMetaClass.mockResolvedValue({ geometry: GEOMETRY_IGNORING_ATTR });

    await vizrepUpdateChecker.checkForVizRepUpdate(makeAttributeInstance());

    // The field is set before the "does this attribute affect the drawing?" check, so the
    // restore has to cover the paths that never redraw at all.
    expect(fakeGlobal.globalObject.current_class_instance).toBe(userSelection);
  });
});

/**
 * Two updates launched back to back — one remote batch carrying two changed attributes
 * publishes them synchronously — used to run at the same time on the one shared graphic
 * context: each merged the other's half-built meshes into its instance, and whichever
 * finished second found the map the first one's `resetInstance()` had emptied and drew
 * an instance with no geometry, which vanished from the canvas with nothing logged.
 */
describe("checkForVizRepUpdate — one at a time", () => {
  it("does not let a second update start while the first is still drawing", async () => {
    const trace: string[] = [];
    let call = 0;

    // Each redraw is: run the geometry, then update. Overlap shows as interleaved marks.
    gcMock.graphicContext.runVizRepFunction.mockImplementation(async () => {
      const id = ++call;
      trace.push(`run${id}`);
      await new Promise((resolve) => setTimeout(resolve, 0));
      trace.push(`ran${id}`);
    });
    gcMock.graphicContext.updateVizRep.mockImplementation(async () => {
      trace.push(`update${call}`);
    });

    await Promise.all([
      vizrepUpdateChecker.checkForVizRepUpdate(makeAttributeInstance()),
      vizrepUpdateChecker.checkForVizRepUpdate(makeAttributeInstance()),
    ]);

    expect(trace).toEqual(["run1", "ran1", "update1", "run2", "ran2", "update2"]);
  });
});
