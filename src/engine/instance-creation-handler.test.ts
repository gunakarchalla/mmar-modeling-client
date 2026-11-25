// P5 unit tests for the instance-creation handler — proves that creating a class
// instance produces a gds-VALID `ClassInstance` (real prototype, uuid, coordinates,
// meta name) with its metamodel attributes propagated as attribute instances, and
// that the modeling-only `sceneInstanceMutated` event fires (SimulationWindow, P12).
//
// global-definition + graphic-context + the two utilities are faked (the real
// global-definition builds a WebGLRenderer, the real graphic-context pulls in troika
// — neither is needed here). gds fixtures are REAL via fromJS. eventBus is REAL so we
// can assert the publish. Node env: no THREE renderer is constructed.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { Class, SceneInstance, SceneType, ClassInstance } from "@gds";

const mocks = vi.hoisted(() => ({
  globalObject: {
    attribute_instances: [] as unknown[],
    role_instances: [] as unknown[],
    current_class_instance: undefined as unknown,
    current_port_instance: undefined as unknown,
    render: false,
    selectedTab: 0,
    tabContext: [] as unknown[],
    autoSave: false,
    doSceneInstancePatch: false,
    doSceneInstancePatchLocal: false,
    currentTabAccess: undefined as unknown,
    sharedDocServiceRef: undefined as unknown,
  },
  applyLocalChangeToYDoc: vi.fn(),
  metaUtility: {
    getMetaClass: vi.fn(),
    getMetaRelationclass: vi.fn(),
    getMetaPort: vi.fn(),
    getTabContextSceneType: vi.fn(),
    parseMetaFunction: vi.fn(async () => () => ({})),
  },
  instanceUtility: {
    getTabContextSceneInstance: vi.fn(),
    getClassInstance: vi.fn(),
    getSceneInstance: vi.fn(),
    getPortInstance: vi.fn(),
  },
  graphicContext: {
    resetInstance: vi.fn(),
    runVizRepFunction: vi.fn(),
    drawVizRep: vi.fn(),
  },
}));

vi.mock("@/engine/global-definition", () => ({ globalObject: mocks.globalObject }));
vi.mock("@/engine/graphic-context", () => ({ graphicContext: mocks.graphicContext, GraphicContext: class {} }));
vi.mock("@/resources/services/meta-utility", () => ({ metaUtility: mocks.metaUtility }));
vi.mock("@/resources/services/instance-utility", () => ({ instanceUtility: mocks.instanceUtility }));
vi.mock("@/resources/collaboration/y-mapping", () => ({ applyLocalChangeToYDoc: mocks.applyLocalChangeToYDoc }));

const { instanceCreationHandler } = await import("./instance-creation-handler");
const { eventBus } = await import("@/resources/services/event-bus");

const CLASS_META_UUID = "88888888-8888-4888-8888-888888888888";
const ATTR_UUID = "77777777-7777-4777-8777-777777777777";
const SCENE_UUID = "99999999-9999-4999-8999-999999999999";
const SCENE_TYPE_UUID = "st-1";
const SCENE_ATTR_UUID = "66666666-6666-4666-8666-666666666666";

/** A metaclass with exactly one non-table attribute and no ports. */
function makeMetaClass(): Class {
  return Class.fromJS({
    uuid: CLASS_META_UUID,
    name: "MyClass",
    geometry: "function vizRep(gc){}",
    attributes: [
      {
        uuid: ATTR_UUID,
        name: "Label",
        default_value: "hello",
        attribute_type: { uuid: "at-1", name: "String", has_table_attribute: [] },
      },
    ],
    ports: [],
  }) as Class;
}

/** The scene type of the open tab, declaring one plain attribute of its own. */
function makeSceneType(): SceneType {
  return SceneType.fromJS({
    uuid: SCENE_TYPE_UUID,
    name: "MySceneType",
    geometry: "function vizRep(gc){}",
    classes: [],
    relationclasses: [],
    ports: [],
    procedures: [],
    attributes: [
      {
        uuid: SCENE_ATTR_UUID,
        name: "Comment",
        default_value: "a comment",
        attribute_type: { uuid: "at-1", name: "String", has_table_attribute: [] },
      },
    ],
  }) as SceneType;
}

function makeScene(): SceneInstance {
  return SceneInstance.fromJS({
    uuid: SCENE_UUID,
    name: "scene",
    uuid_scene_type: "st-1",
    class_instances: [],
    relationclasses_instances: [],
    port_instances: [],
    attribute_instances: [],
  }) as SceneInstance;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

let sceneInstance: SceneInstance;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.globalObject.attribute_instances = [];
  mocks.globalObject.role_instances = [];
  Object.assign(mocks.globalObject, {
    autoSave: false,
    doSceneInstancePatch: false,
    doSceneInstancePatchLocal: false,
    currentTabAccess: undefined,
    sharedDocServiceRef: undefined,
  });
  sceneInstance = makeScene();
  mocks.metaUtility.getMetaClass.mockResolvedValue(makeMetaClass());
  mocks.metaUtility.getTabContextSceneType.mockResolvedValue(makeSceneType());
  mocks.instanceUtility.getTabContextSceneInstance.mockResolvedValue(sceneInstance);
  mocks.instanceUtility.getSceneInstance.mockImplementation(async (uuid: string) =>
    uuid === sceneInstance.uuid ? sceneInstance : undefined,
  );
  // resolve the attribute's owner back to the instance the scene actually holds
  mocks.instanceUtility.getClassInstance.mockImplementation(async (uuid: string) => sceneInstance.class_instances.find((ci) => ci.uuid === uuid));
});

describe("InstanceCreationHandler.createClassInstance", () => {
  it("creates a gds-valid ClassInstance at the given position", async () => {
    const ci = await instanceCreationHandler.createClassInstance("ci-1", 1.2, -3.4, 0, CLASS_META_UUID, "class");

    expect(ci).toBeInstanceOf(ClassInstance);
    expect(ci.uuid).toBe("ci-1");
    expect(ci.uuid_class).toBe(CLASS_META_UUID);
    expect(ci.coordinates_2d).toEqual({ x: 1.2, y: -3.4, z: 0 });
    // modeling delta: bare meta name (the metamodeling twin appends the uuid)
    expect(ci.name).toBe("MyClass");
    // added to the tab's scene instance
    expect(sceneInstance.class_instances).toContain(ci);
  });

  it("propagates the metamodel attributes as attribute instances", async () => {
    const ci = await instanceCreationHandler.createClassInstance("ci-2", 0, 0, 0, CLASS_META_UUID, "class");
    // attribute creation is fire-and-forget inside the loop; let the microtasks run
    await flush();

    expect(ci.attribute_instance).toHaveLength(1);
    expect(ci.attribute_instance[0].uuid_attribute).toBe(ATTR_UUID);
    expect(ci.attribute_instance[0].value).toBe("hello");
    // also registered in the global attribute-instance list
    expect(mocks.globalObject.attribute_instances).toHaveLength(1);
  });

  it("publishes sceneInstanceMutated for the active scene", async () => {
    const seen: Array<{ sceneInstanceUuid: string; action?: string }> = [];
    const sub = eventBus.subscribe("sceneInstanceMutated", (p) => seen.push(p));

    await instanceCreationHandler.createClassInstance("ci-3", 0, 0, 0, CLASS_META_UUID, "class");
    sub.dispose();

    expect(seen).toHaveLength(1);
    expect(seen[0].sceneInstanceUuid).toBe(SCENE_UUID);
    expect(seen[0].action).toBe("added");
  });
});

// The scene-level counterpart of "propagates the metamodel attributes": a scene
// instance is created empty, so its scene type's attributes are instantiated here.
describe("InstanceCreationHandler.createMissingSceneAttributeInstances", () => {
  /** A shared session with `users` clients present in its awareness. */
  const fakeSession = (users: number) => ({
    ydoc: { fake: "ydoc" },
    localOrigin: {},
    applyingRemote: false,
    awareness: { getStates: () => new Map(Array.from({ length: users }, (_, i) => [i, {}])) },
  });

  it("instantiates a scene-type attribute the scene instance does not have yet", async () => {
    const created = await instanceCreationHandler.createMissingSceneAttributeInstances(sceneInstance);

    expect(created).toHaveLength(1);
    expect(sceneInstance.attribute_instances).toEqual(created);
    const [attributeInstance] = created;
    expect(attributeInstance.uuid_attribute).toBe(SCENE_ATTR_UUID);
    expect(attributeInstance.name).toBe("Comment");
    expect(attributeInstance.value).toBe("a comment");
    // parented by the scene, which is how the attribute window and the vizrep checker
    // resolve it back to the scene type
    expect(attributeInstance.assigned_uuid_scene_instance).toBe(SCENE_UUID);
    expect(mocks.globalObject.attribute_instances).toEqual(created);
  });

  it("is a no-op when the attribute is already instantiated (re-opening a scene)", async () => {
    await instanceCreationHandler.createMissingSceneAttributeInstances(sceneInstance);
    mocks.globalObject.attribute_instances = [];

    const created = await instanceCreationHandler.createMissingSceneAttributeInstances(sceneInstance);

    expect(created).toEqual([]);
    expect(sceneInstance.attribute_instances).toHaveLength(1);
    expect(mocks.globalObject.attribute_instances).toEqual([]);
  });

  it("flags the scene for the auto-save when it created something", async () => {
    mocks.globalObject.autoSave = true;

    await instanceCreationHandler.createMissingSceneAttributeInstances(sceneInstance);

    expect(mocks.globalObject.doSceneInstancePatch).toBe(true);
    // not shared -> the shared-mode flag stays untouched
    expect(mocks.globalObject.doSceneInstancePatchLocal).toBe(false);
  });

  it("leaves a read-only shared scene alone", async () => {
    mocks.globalObject.autoSave = true;
    mocks.globalObject.currentTabAccess = "read";

    const created = await instanceCreationHandler.createMissingSceneAttributeInstances(sceneInstance);

    expect(created).toEqual([]);
    expect(sceneInstance.attribute_instances).toEqual([]);
    // nothing to save, and no authorization alert from the shared auto-save
    expect(mocks.globalObject.doSceneInstancePatchLocal).toBe(false);
    expect(mocks.globalObject.doSceneInstancePatch).toBe(false);
  });

  it("flags a writable shared scene through the local-patch flag as well", async () => {
    mocks.globalObject.autoSave = true;
    mocks.globalObject.currentTabAccess = "edit";

    await instanceCreationHandler.createMissingSceneAttributeInstances(sceneInstance);

    expect(mocks.globalObject.doSceneInstancePatch).toBe(true);
    expect(mocks.globalObject.doSceneInstancePatchLocal).toBe(true);
  });

  it("hands the created instances to collaborators when alone in a shared session", async () => {
    const session = fakeSession(1);
    mocks.globalObject.sharedDocServiceRef = { forTab: () => session };

    const created = await instanceCreationHandler.createMissingSceneAttributeInstances(sceneInstance);

    expect(created).toHaveLength(1);
    expect(mocks.applyLocalChangeToYDoc).toHaveBeenCalledWith(
      session.ydoc,
      { type: "add_scene_attribute_instances", attributeInstances: created },
      session.localOrigin,
    );
  });

  it("leaves the instantiation to the peers already in the session", async () => {
    // Two clients each minting their own instance of the same scene-type attribute
    // would leave the scene holding the field twice — whoever is already there either
    // created them or will, and the Y.Doc carries them over.
    mocks.globalObject.sharedDocServiceRef = { forTab: () => fakeSession(2) };

    const created = await instanceCreationHandler.createMissingSceneAttributeInstances(sceneInstance);

    expect(created).toEqual([]);
    expect(sceneInstance.attribute_instances).toEqual([]);
    expect(mocks.applyLocalChangeToYDoc).not.toHaveBeenCalled();
  });

  it("leaves a scene that is not the active tab's alone", async () => {
    // Its attribute instances would attach to whatever getSceneInstance resolves, which
    // for a background tab can be the scene tree's own copy.
    const otherScene = SceneInstance.fromJS({
      uuid: "other-scene",
      uuid_scene_type: SCENE_TYPE_UUID,
      class_instances: [],
      relationclasses_instances: [],
      attribute_instances: [],
    }) as SceneInstance;

    const created = await instanceCreationHandler.createMissingSceneAttributeInstances(otherScene);

    expect(created).toEqual([]);
    expect(otherScene.attribute_instances).toEqual([]);
  });
});

describe("InstanceCreationHandler — tables", () => {
  /** A table attribute with columns B (sequence 2) and A (sequence 1); A itself holds a table. */
  function makeTableAttribute() {
    return (Class.fromJS({
      uuid: "class-with-table",
      name: "WithTable",
      attributes: [
        {
          uuid: "table-attr",
          name: "Table",
          default_value: "the table's own default, never a cell's",
          attribute_type: {
            uuid: "at-table",
            name: "Table",
            has_table_attribute: [
              {
                sequence: 2,
                attribute: { uuid: "col-b", name: "B", default_value: "b default", attribute_type: { uuid: "at-b", has_table_attribute: [] } },
              },
              {
                sequence: 1,
                attribute: {
                  uuid: "col-a",
                  name: "A",
                  default_value: "a default",
                  attribute_type: {
                    uuid: "at-a",
                    has_table_attribute: [
                      { sequence: 1, attribute: { uuid: "col-deep", name: "Deep", attribute_type: { uuid: "at-deep", has_table_attribute: [] } } },
                    ],
                  },
                },
              },
            ],
          },
        },
      ],
    }) as Class).attributes[0];
  }

  beforeEach(() => {
    mocks.globalObject.attribute_instances = [];
  });

  it("starts a table with one row: a cell per column, in column order, pointing at the table", async () => {
    const table = await instanceCreationHandler.createAttributeInstance(makeTableAttribute(), null as never, null as never, "");

    expect(table.table_attributes.map((cell) => [cell.uuid_attribute, cell.table_row, cell.table_attribute_reference])).toEqual([
      ["col-a", 0, table.uuid],
      ["col-b", 0, table.uuid],
    ]);
  });

  it("gives a cell its column's default, and a nested-table cell an empty value and a first row of its own", async () => {
    const table = await instanceCreationHandler.createAttributeInstance(makeTableAttribute(), null as never, null as never, "");
    const [nested, plain] = table.table_attributes;

    expect(plain.value).toBe("b default");
    expect(plain.name).toBe("B");
    expect(nested.value).toBe("");
    expect(nested.table_attributes.map((cell) => [cell.uuid_attribute, cell.table_row, cell.table_attribute_reference])).toEqual([
      ["col-deep", 0, nested.uuid],
    ]);
    // A column without a default starts empty, like every attribute without one.
    expect(nested.table_attributes[0].value).toBe("");
  });

  it("creates the cells of a further row without numbering or attaching them", async () => {
    const cells = await instanceCreationHandler.createTableRowCells(makeTableAttribute());

    expect(cells.map((cell) => cell.uuid_attribute)).toEqual(["col-a", "col-b"]);
    expect(cells.every((cell) => cell.table_row === undefined && cell.table_attribute_reference === undefined)).toBe(true);
  });
});
