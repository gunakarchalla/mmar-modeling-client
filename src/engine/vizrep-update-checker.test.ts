// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { AttributeInstance, ClassInstance, PortInstance, RelationclassInstance } from "@gds";

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
    objectScaled: false,
    current_class_instance: null as unknown,
    current_port_instance: undefined as unknown,
    selectedTab: 0,
    tabContext: [] as { sceneInstance: unknown }[],
  },
}));
vi.mock("@/engine/global-definition", () => fakeGlobal);

const gcMock = vi.hoisted(() => ({
  graphicContext: {
    current_instance_object: null as unknown,
    resetInstance: vi.fn(),
    runVizRepFunction: vi.fn(async (_geometry: string) => {}),
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
    getAllPortInstancesOfTabContext: vi.fn(async () => [] as unknown[]),
    getSceneInstance: vi.fn(),
    getTabContextSceneInstance: vi.fn(),
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
// Real: what the checker decides from is what this module recorded.
const { vizRepReads, readKeys } = await import("@/engine/vizrep-reads");
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
  utils.instanceUtility.getAllPortInstancesOfTabContext.mockResolvedValue([]);
  utils.instanceUtility.getSceneInstance.mockResolvedValue(undefined);
  fakeGlobal.globalObject.tabContext = [];
  fakeGlobal.globalObject.selectedTab = 0;
  vizRepReads.clear();
  utils.metaUtility.getMetaClass.mockResolvedValue({ geometry: GEOMETRY_REFERENCING_ATTR });
  utils.metaUtility.getMetaAttribute.mockResolvedValue({ name: "label" });
});

/**
 * An instance whose vizRep has not run under tracking has no record of what it reads:
 * for it, the old rule decides — whether the vizRep source names the changed attribute.
 */
describe("checkForVizRepUpdate — an instance with no record of its reads", () => {
  it("re-runs and updates the vizrep when the geometry references the changed attribute", async () => {
    // `current_class_instance` is what the running vizRep code reads its values through
    // (gc.expression.attrval), so capture it AT THE MOMENT the geometry runs.
    let instanceSeenByVizRep: unknown;
    gcMock.graphicContext.runVizRepFunction.mockImplementationOnce(async () => {
      instanceSeenByVizRep = fakeGlobal.globalObject.current_class_instance;
    });

    await vizrepUpdateChecker.checkForVizRepUpdate(makeAttributeInstance());

    // Tracked: handed the instance being drawn.
    expect(gcMock.graphicContext.runVizRepFunction).toHaveBeenCalledWith(GEOMETRY_REFERENCING_ATTR, expect.objectContaining({ uuid: CLASS_INSTANCE_UUID }));
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

  it("asks for relations to be re-routed, because a redraw can change an outline", async () => {
    fakeGlobal.globalObject.objectScaled = false;

    await vizrepUpdateChecker.checkForVizRepUpdate(makeAttributeInstance());

    expect(fakeGlobal.globalObject.objectScaled).toBe(true);
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

    expect(gcMock.graphicContext.runVizRepFunction).toHaveBeenCalledWith(GEOMETRY_REFERENCING_ATTR, sceneInstance);
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

    expect(gcMock.graphicContext.runVizRepFunction).toHaveBeenCalledWith(GEOMETRY_REFERENCING_ATTR, expect.objectContaining({ uuid: CLASS_INSTANCE_UUID }));
    expect(gcMock.graphicContext.updateVizRep).toHaveBeenCalledTimes(1);
  });

  it("'checkForVizRepUpdate' redraws every class and relation instance of the open scene, whatever they read", async () => {
    const classInstance = makeClassInstance();
    const relation = RelationclassInstance.fromJS({ uuid: "rel-1", uuid_relationclass: "meta-rel", custom_variables: {} }) as RelationclassInstance;
    fakeGlobal.globalObject.tabContext = [{ sceneInstance: { class_instances: [classInstance], relationclasses_instances: [relation] } }];
    utils.instanceUtility.getClassInstance.mockImplementation(async (uuid: string) => [classInstance, relation].find((instance) => instance.uuid === uuid));
    utils.metaUtility.getMetaClass.mockResolvedValue({ geometry: GEOMETRY_IGNORING_ATTR });
    utils.metaUtility.getMetaRelationclass.mockResolvedValue({ geometry: GEOMETRY_IGNORING_ATTR });

    eventBus.publish("checkForVizRepUpdate");
    await flush();
    await flush();

    expect(gcMock.graphicContext.updateVizRep.mock.calls.map((call) => (call as unknown[])[0])).toEqual([classInstance, relation]);
  });

  it("redraws an instance once when a sweep is asked for twice before it runs", async () => {
    fakeGlobal.globalObject.tabContext = [{ sceneInstance: { class_instances: [makeClassInstance()], relationclasses_instances: [] } }];

    await Promise.all([vizrepUpdateChecker.checkForVisualizationUpdate(), vizrepUpdateChecker.checkForVisualizationUpdate()]);

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

/**
 * A table cell records only the table it belongs to (`table_attribute_reference`), never
 * the instance owning that table, so the update used to find no owner for an edited cell
 * and drop the redraw: a vizRep drawing a table's contents never saw a cell edit.
 */
describe("checkForVizRepUpdate — a table cell", () => {
  const TABLE_ATTR_UUID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  const COLUMN_ATTR_UUID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
  const NESTED_COLUMN_ATTR_UUID = "99999999-9999-4999-8999-999999999999";
  const metaNames: Record<string, string> = {
    [TABLE_ATTR_UUID]: "Steps",
    [COLUMN_ATTR_UUID]: "Product",
    [NESTED_COLUMN_ATTR_UUID]: "Detail",
  };

  const cellOf = (table: string, uuid_attribute: string, uuid = "cell-1") =>
    AttributeInstance.fromJS({ uuid, uuid_attribute, table_attribute_reference: table, table_row: 0, value: "edited" }) as AttributeInstance;

  /** A scene whose class instance owns one table attribute holding `cells`. */
  function openSceneWithTable(cells: AttributeInstance[]) {
    const table = AttributeInstance.fromJS({
      uuid: "table-1",
      uuid_attribute: TABLE_ATTR_UUID,
      assigned_uuid_class_instance: CLASS_INSTANCE_UUID,
      value: "",
    }) as AttributeInstance;
    table.table_attributes = cells;
    const owner = makeClassInstance();
    owner.attribute_instance = [table];
    utils.instanceUtility.getClassInstance.mockResolvedValue(owner);
    utils.instanceUtility.getTabContextSceneInstance.mockResolvedValue({
      attribute_instances: [],
      class_instances: [owner],
      relationclasses_instances: [],
      port_instances: [],
    });
    return owner;
  }

  const vizRepNaming = (name: string) => ({ geometry: `async function vizRep(gc) { const rows = await gc.expression.attrvalByName('${name}'); }` });

  beforeEach(() => {
    gcMock.graphicContext.runVizRepFunction.mockImplementation(async () => {});
    gcMock.graphicContext.updateVizRep.mockImplementation(async () => {});
    utils.metaUtility.getMetaAttribute.mockImplementation(async (uuid: string) => (metaNames[uuid] ? { name: metaNames[uuid] } : undefined));
  });

  it("redraws the instance owning the table when the vizRep names the table", async () => {
    const owner = openSceneWithTable([cellOf("table-1", COLUMN_ATTR_UUID)]);
    utils.metaUtility.getMetaClass.mockResolvedValue(vizRepNaming("Steps"));

    await vizrepUpdateChecker.checkForVizRepUpdate(owner.attribute_instance[0].table_attributes[0]);

    expect(gcMock.graphicContext.updateVizRep).toHaveBeenCalledWith(owner);
  });

  it("redraws it when the vizRep names the cell's column", async () => {
    const owner = openSceneWithTable([cellOf("table-1", COLUMN_ATTR_UUID)]);
    utils.metaUtility.getMetaClass.mockResolvedValue({ geometry: `async function vizRep(gc) { /* ${COLUMN_ATTR_UUID} */ }` });

    await vizrepUpdateChecker.checkForVizRepUpdate(owner.attribute_instance[0].table_attributes[0]);

    expect(gcMock.graphicContext.updateVizRep).toHaveBeenCalledWith(owner);
  });

  it("follows a cell of a nested table up to the instance owning the outer table", async () => {
    const nestedTable = cellOf("table-1", COLUMN_ATTR_UUID, "nested-table");
    const nestedCell = cellOf("nested-table", NESTED_COLUMN_ATTR_UUID, "nested-cell");
    nestedTable.table_attributes = [nestedCell];
    const owner = openSceneWithTable([nestedTable]);
    utils.metaUtility.getMetaClass.mockResolvedValue(vizRepNaming("Steps"));

    await vizrepUpdateChecker.checkForVizRepUpdate(nestedCell);

    expect(gcMock.graphicContext.updateVizRep).toHaveBeenCalledWith(owner);
  });

  it("skips the redraw when the vizRep names neither the cell nor a table around it", async () => {
    const owner = openSceneWithTable([cellOf("table-1", COLUMN_ATTR_UUID)]);
    utils.metaUtility.getMetaClass.mockResolvedValue({ geometry: GEOMETRY_IGNORING_ATTR });

    await vizrepUpdateChecker.checkForVizRepUpdate(owner.attribute_instance[0].table_attributes[0]);

    expect(gcMock.graphicContext.runVizRepFunction).not.toHaveBeenCalled();
  });

  it("skips a cell whose table is not in the open scene, and releases the lock", async () => {
    openSceneWithTable([]);
    utils.metaUtility.getMetaClass.mockResolvedValue(vizRepNaming("Steps"));

    await vizrepUpdateChecker.checkForVizRepUpdate(cellOf("some-other-table", COLUMN_ATTR_UUID));

    expect(gcMock.graphicContext.runVizRepFunction).not.toHaveBeenCalled();
    expect(fakeGlobal.globalObject.readyForVizRepUpdate).toBe(true);
  });
});

/**
 * Adding or removing a relation changes no attribute of the instances it connects, so
 * nothing used to redraw them, and a vizRep that draws from its relations went stale.
 */
describe("checkForVizRepUpdateOfRelationEnds", () => {
  const OTHER_CLASS_INSTANCE_UUID = "12121212-1212-4121-8121-121212121212";
  const PORT_INSTANCE_UUID = "34343434-3434-4343-8343-343434343434";

  const relationBetween = (fromRole: object, toRole: object) =>
    RelationclassInstance.fromJS({ uuid: "rel-1", uuid_relationclass: "meta-rel", role_instance_from: fromRole, role_instance_to: toRole }) as RelationclassInstance;
  const toClass = (uuid: string) => ({ uuid: `role-${uuid}`, uuid_has_reference_class_instance: uuid });
  const toPort = (uuid: string) => ({ uuid: `role-${uuid}`, uuid_has_reference_port_instance: uuid });

  function classInstanceWith(uuid: string): ClassInstance {
    const instance = makeClassInstance();
    instance.uuid = uuid;
    return instance;
  }

  let scene: Record<string, ClassInstance>;

  beforeEach(() => {
    gcMock.graphicContext.runVizRepFunction.mockImplementation(async () => {});
    gcMock.graphicContext.updateVizRep.mockImplementation(async () => {});
    fakeGlobal.globalObject.current_port_instance = undefined;
    scene = {
      [CLASS_INSTANCE_UUID]: classInstanceWith(CLASS_INSTANCE_UUID),
      [OTHER_CLASS_INSTANCE_UUID]: classInstanceWith(OTHER_CLASS_INSTANCE_UUID),
    };
    utils.instanceUtility.getClassInstance.mockImplementation(async (uuid: string) => scene[uuid]);
    utils.instanceUtility.getAllPortInstancesOfTabContext.mockResolvedValue([]);
    // Draws nothing any attribute would name: a relation change redraws regardless.
    utils.metaUtility.getMetaClass.mockResolvedValue({ geometry: GEOMETRY_IGNORING_ATTR });
  });

  const redrawn = () => gcMock.graphicContext.updateVizRep.mock.calls.map((call) => (call as unknown[])[0]);

  it("redraws the instances at both ends", async () => {
    await vizrepUpdateChecker.checkForVizRepUpdateOfRelationEnds(relationBetween(toClass(CLASS_INSTANCE_UUID), toClass(OTHER_CLASS_INSTANCE_UUID)));

    expect(redrawn()).toEqual([scene[CLASS_INSTANCE_UUID], scene[OTHER_CLASS_INSTANCE_UUID]]);
  });

  it("redraws an instance once when the relation leads back to it", async () => {
    await vizrepUpdateChecker.checkForVizRepUpdateOfRelationEnds(relationBetween(toClass(CLASS_INSTANCE_UUID), toClass(CLASS_INSTANCE_UUID)));

    expect(redrawn()).toEqual([scene[CLASS_INSTANCE_UUID]]);
  });

  it("redraws the end of a relation still being drawn, which has no 'to' role yet", async () => {
    await vizrepUpdateChecker.checkForVizRepUpdateOfRelationEnds(relationBetween(toClass(CLASS_INSTANCE_UUID), undefined as unknown as object));

    expect(redrawn()).toEqual([scene[CLASS_INSTANCE_UUID]]);
  });

  it("skips an end that is gone by the time the redraw runs, and releases the lock", async () => {
    delete scene[OTHER_CLASS_INSTANCE_UUID];

    await vizrepUpdateChecker.checkForVizRepUpdateOfRelationEnds(relationBetween(toClass(CLASS_INSTANCE_UUID), toClass(OTHER_CLASS_INSTANCE_UUID)));

    expect(redrawn()).toEqual([scene[CLASS_INSTANCE_UUID]]);
    expect(fakeGlobal.globalObject.readyForVizRepUpdate).toBe(true);
  });

  it("joins requests for an instance whose redraw has not started yet", async () => {
    await Promise.all([
      vizrepUpdateChecker.checkForVizRepUpdateByInstance(CLASS_INSTANCE_UUID),
      vizrepUpdateChecker.checkForVizRepUpdateByInstance(CLASS_INSTANCE_UUID),
      vizrepUpdateChecker.checkForVizRepUpdateByInstance(CLASS_INSTANCE_UUID),
    ]);
    // A request after the redraw ran is a new one.
    await vizrepUpdateChecker.checkForVizRepUpdateByInstance(CLASS_INSTANCE_UUID);

    expect(redrawn()).toEqual([scene[CLASS_INSTANCE_UUID], scene[CLASS_INSTANCE_UUID]]);
  });

  it("redraws a port end as the port, reading the port's own attributes", async () => {
    const port = PortInstance.fromJS({ uuid: PORT_INSTANCE_UUID, uuid_port: "meta-port", custom_variables: {}, attribute_instances: [] }) as PortInstance;
    utils.instanceUtility.getAllPortInstancesOfTabContext.mockResolvedValue([port]);
    const PORT_GEOMETRY = "async function vizRep(gc) { /* the port */ }";
    utils.metaUtility.getMetaPort.mockResolvedValue({ geometry: PORT_GEOMETRY });
    const userSelection = { uuid: "the-users-own-selection" };
    fakeGlobal.globalObject.current_class_instance = userSelection;
    let seen: unknown[] = [];
    gcMock.graphicContext.runVizRepFunction.mockImplementation(async (geometry: string) => {
      if (geometry === PORT_GEOMETRY) seen = [fakeGlobal.globalObject.current_class_instance, fakeGlobal.globalObject.current_port_instance];
    });

    await vizrepUpdateChecker.checkForVizRepUpdateOfRelationEnds(relationBetween(toClass(CLASS_INSTANCE_UUID), toPort(PORT_INSTANCE_UUID)));

    // The expression API reads the class first, so a class left set would shadow the port.
    expect(seen).toEqual([undefined, port]);
    expect(redrawn()).toEqual([scene[CLASS_INSTANCE_UUID], port]);
    expect(fakeGlobal.globalObject.current_class_instance).toBe(userSelection);
    expect(fakeGlobal.globalObject.current_port_instance).toBeUndefined();
  });

  it("draws a class with no port set, and gives back a port the user had selected", async () => {
    const selectedPort = { uuid: "the-users-port" };
    fakeGlobal.globalObject.current_port_instance = selectedPort;
    let portWhileDrawing: unknown = "not run";
    gcMock.graphicContext.runVizRepFunction.mockImplementation(async () => {
      portWhileDrawing = fakeGlobal.globalObject.current_port_instance;
    });

    await vizrepUpdateChecker.checkForVizRepUpdateByInstance(CLASS_INSTANCE_UUID);

    // A port left set would collect the class's label variables (drawLabels).
    expect(portWhileDrawing).toBeUndefined();
    expect(fakeGlobal.globalObject.current_port_instance).toBe(selectedPort);
  });

  it("is what the 'checkForVizRepUpdateByRelationInstance' channel does", async () => {
    eventBus.publish("checkForVizRepUpdateByRelationInstance", relationBetween(toClass(CLASS_INSTANCE_UUID), toClass(OTHER_CLASS_INSTANCE_UUID)));
    await flush();
    await flush();

    expect(redrawn()).toEqual([scene[CLASS_INSTANCE_UUID], scene[OTHER_CLASS_INSTANCE_UUID]]);
  });
});

/** Record what a tracked vizRep run of `instanceUuid` would: these calls, nothing else. */
async function recordReads(instanceUuid: string, calls: [string, ...unknown[]][]) {
  const expression = Object.fromEntries(calls.map(([method]) => [method, async () => undefined]));
  const run = vizRepReads.tracking(expression, { uuid: instanceUuid } as never);
  for (const [method, ...args] of calls) await (run.expression as Record<string, (...args: unknown[]) => Promise<unknown>>)[method](...args);
  run.done();
}

/**
 * Once an instance's vizRep has run under tracking, what that run read decides — not
 * what its source text happens to mention.
 */
describe("checkForVizRepUpdate — recorded reads decide", () => {
  const OTHER = "56565656-5656-4565-8565-565656565656";
  let instances: Record<string, ClassInstance>;
  const redrawn = () => gcMock.graphicContext.updateVizRep.mock.calls.map((call) => ((call as unknown[])[0] as { uuid: string }).uuid);

  beforeEach(() => {
    gcMock.graphicContext.runVizRepFunction.mockImplementation(async () => {});
    gcMock.graphicContext.updateVizRep.mockImplementation(async () => {});
    instances = { [CLASS_INSTANCE_UUID]: makeClassInstance(), [OTHER]: Object.assign(makeClassInstance(), { uuid: OTHER }) };
    utils.instanceUtility.getClassInstance.mockImplementation(async (uuid: string) => instances[uuid]);
  });

  it("redraws the owner whose last run read the attribute, though its source never names it", async () => {
    utils.metaUtility.getMetaClass.mockResolvedValue({ geometry: GEOMETRY_IGNORING_ATTR });
    await recordReads(CLASS_INSTANCE_UUID, [["attrval", ATTR_UUID]]);

    await vizrepUpdateChecker.checkForVizRepUpdate(makeAttributeInstance());

    expect(redrawn()).toEqual([CLASS_INSTANCE_UUID]);
  });

  it("matches a read by attribute name", async () => {
    utils.metaUtility.getMetaClass.mockResolvedValue({ geometry: GEOMETRY_IGNORING_ATTR });
    await recordReads(CLASS_INSTANCE_UUID, [["attrvalByName", "label"]]);

    await vizrepUpdateChecker.checkForVizRepUpdate(makeAttributeInstance());

    expect(redrawn()).toEqual([CLASS_INSTANCE_UUID]);
  });

  it("does not redraw an owner whose last run did not read the attribute, though its source names it", async () => {
    await recordReads(CLASS_INSTANCE_UUID, [["attrvalByName", "something else"]]);

    await vizrepUpdateChecker.checkForVizRepUpdate(makeAttributeInstance());

    expect(redrawn()).toEqual([]);
  });

  it("redraws another instance whose vizRep read the attribute", async () => {
    await recordReads(CLASS_INSTANCE_UUID, []);
    await recordReads(OTHER, [["attrvalByInst", ATTR_UUID, CLASS_INSTANCE_UUID]]);

    await vizrepUpdateChecker.checkForVizRepUpdate(makeAttributeInstance());
    await flush();

    expect(redrawn()).toEqual([OTHER]);
  });

  it("redraws an instance that read a table when one of its cells changes", async () => {
    const TABLE_ATTR_UUID = "78787878-7878-4787-8787-787878787878";
    const table = AttributeInstance.fromJS({ uuid: "table-1", uuid_attribute: TABLE_ATTR_UUID, assigned_uuid_class_instance: CLASS_INSTANCE_UUID, value: "" }) as AttributeInstance;
    const cell = AttributeInstance.fromJS({ uuid: "cell-1", uuid_attribute: "column", table_attribute_reference: "table-1", table_row: 0, value: "x" }) as AttributeInstance;
    table.table_attributes = [cell];
    instances[CLASS_INSTANCE_UUID].attribute_instance = [table];
    utils.instanceUtility.getTabContextSceneInstance.mockResolvedValue({ class_instances: [instances[CLASS_INSTANCE_UUID]], relationclasses_instances: [], port_instances: [], attribute_instances: [] });
    await recordReads(CLASS_INSTANCE_UUID, []);
    await recordReads(OTHER, [["getTableRows", CLASS_INSTANCE_UUID, TABLE_ATTR_UUID]]);

    await vizrepUpdateChecker.checkForVizRepUpdate(cell);
    await flush();

    expect(redrawn()).toEqual([OTHER]);
  });

  it("also redraws the instances that read the relations of a relation's ends", async () => {
    const THIRD = "9a9a9a9a-9a9a-49a9-89a9-9a9a9a9a9a9a";
    instances[THIRD] = Object.assign(makeClassInstance(), { uuid: THIRD });
    await recordReads(THIRD, [["getOutgoingRelationsByInstanceUUID", CLASS_INSTANCE_UUID]]);
    const relation = RelationclassInstance.fromJS({
      uuid: "rel-1",
      role_instance_from: { uuid: "r1", uuid_has_reference_class_instance: CLASS_INSTANCE_UUID },
      role_instance_to: { uuid: "r2", uuid_has_reference_class_instance: OTHER },
    }) as RelationclassInstance;

    await vizrepUpdateChecker.checkForVizRepUpdateOfRelationEnds(relation);

    expect(redrawn()).toEqual([CLASS_INSTANCE_UUID, OTHER, THIRD]);
  });
});

/**
 * Only the active tab is drawn into, and switching tabs redraws nothing by itself, so a
 * redraw due in a background tab used to be lost for good.
 */
describe("redraws due in a background tab", () => {
  const BACKGROUND = "bcbcbcbc-bcbc-4bcb-8bcb-bcbcbcbcbcbc";
  let background: ClassInstance;
  const redrawn = () => gcMock.graphicContext.updateVizRep.mock.calls.map((call) => ((call as unknown[])[0] as { uuid: string }).uuid);

  beforeEach(() => {
    gcMock.graphicContext.runVizRepFunction.mockImplementation(async () => {});
    gcMock.graphicContext.updateVizRep.mockImplementation(async () => {});
    background = Object.assign(makeClassInstance(), { uuid: BACKGROUND });
    fakeGlobal.globalObject.tabContext = [
      { sceneInstance: { uuid: "active-scene", class_instances: [], relationclasses_instances: [] } },
      { sceneInstance: { uuid: "background-scene", class_instances: [background], relationclasses_instances: [] } },
    ];
    fakeGlobal.globalObject.selectedTab = 0;
    // Lookups answer for the active tab only, as instance-utility's do.
    utils.instanceUtility.getClassInstance.mockImplementation(async (uuid: string) =>
      (fakeGlobal.globalObject.tabContext[fakeGlobal.globalObject.selectedTab].sceneInstance as { class_instances: ClassInstance[] }).class_instances.find((instance) => instance.uuid === uuid),
    );
  });

  it("holds a redraw back until its tab is shown, then runs it once", async () => {
    await vizrepUpdateChecker.checkForVizRepUpdateByInstance(BACKGROUND);
    expect(redrawn()).toEqual([]);

    fakeGlobal.globalObject.selectedTab = 1;
    eventBus.publish("checkForVizRepUpdateOfActiveTab");
    await flush();
    await flush();
    expect(redrawn()).toEqual([BACKGROUND]);

    eventBus.publish("checkForVizRepUpdateOfActiveTab");
    await flush();
    expect(redrawn()).toEqual([BACKGROUND]);
  });

  it("holds back an attribute change of an instance in a background tab", async () => {
    const attribute = AttributeInstance.fromJS({ uuid: "a-1", uuid_attribute: ATTR_UUID, assigned_uuid_class_instance: BACKGROUND, value: "v" }) as AttributeInstance;

    await vizrepUpdateChecker.checkForVizRepUpdate(attribute);
    fakeGlobal.globalObject.selectedTab = 1;
    await vizrepUpdateChecker.checkForVizRepUpdateOfHeldBack();

    expect(redrawn()).toEqual([BACKGROUND]);
  });

  it("forgets what it knows of an instance no open tab holds", async () => {
    await recordReads("gone", [["attrval", ATTR_UUID]]);

    await vizrepUpdateChecker.checkForVizRepUpdateByInstance("gone");

    expect(vizRepReads.hasRecord("gone")).toBe(false);
    expect(redrawn()).toEqual([]);
  });

  it("forgets everything when the user signs out", async () => {
    await recordReads(BACKGROUND, [["attrval", ATTR_UUID]]);
    await vizrepUpdateChecker.checkForVizRepUpdateByInstance(BACKGROUND);

    eventBus.publish("login", false);
    fakeGlobal.globalObject.selectedTab = 1;
    await vizrepUpdateChecker.checkForVizRepUpdateOfHeldBack();

    expect(vizRepReads.hasRecord(BACKGROUND)).toBe(false);
    expect(vizRepReads.readers([readKeys.attribute(BACKGROUND, ATTR_UUID)]).size).toBe(0);
    expect(redrawn()).toEqual([]);
  });
});
