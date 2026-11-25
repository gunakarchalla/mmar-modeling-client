// P8 unit tests for the attribute-window data model (the old `updater()`):
// grouping into plain / table / reference, sequence sorting, facet parsing, the
// File-attribute-type scan, and the fieldChange side effects.
//
// `@/engine` is mocked (the real barrel builds a WebGLRenderer at module scope — see
// the P3/P4 test-pattern note); gds fixtures are REAL, revived via `X.fromJS` so the
// nested @Type props deep-revive (the P3 class-transformer rule).
import { describe, it, expect, beforeEach, vi } from "vitest";
import { AttributeInstance, ClassInstance, PortInstance, SceneInstance } from "@gds";
import { FILE_ATTRIBUTE_TYPE_UUID } from "@/constants";

const mocks = vi.hoisted(() => ({
  globalObject: {
    selectedTab: 0,
    doSceneInstancePatch: false,
    doSceneInstancePatchLocal: false,
  } as any,
  globalSelectedObject: { getObject: vi.fn() },
  instanceUtility: {
    getTabContextSceneInstance: vi.fn(),
    getAllPortInstancesOfTabContext: vi.fn(async () => [] as PortInstance[]),
    getClassInstance: vi.fn(),
    getPortInstance: vi.fn(),
    getSceneInstance: vi.fn(),
  },
  metaUtility: {
    getMetaAttribute: vi.fn(),
    getMetaAttributeWithSequence: vi.fn(),
  },
  // P10: attributeModel now imports shared-doc-service, which imports the REAL
  // @/engine/global-definition (a WebGLRenderer at module scope). Mocking the barrel
  // alone is not enough — mock the service too, the same way P9's TopNavBar test had
  // to mock persistency-handler.
  sharedDocService: {
    forTab: vi.fn((_tabIndex: number) => null as null | { ydoc: unknown; localOrigin: object; applyingRemote: boolean }),
  },
  applyLocalChangeToYDoc: vi.fn(),
  // P12: hybrid-algorithms-service imports the @/engine/global-definition LEAF directly,
  // so it bypasses the `@/engine` barrel mock below and drags in a real WebGLRenderer at
  // module scope — this whole file fails to load without this mock. (Same lesson as P9's
  // persistency-handler, P10's shared-doc-service and P11's renderers.)
  hybridAlgorithmsService: { checkHybridAlgorithms: vi.fn(async () => undefined) },
  // The undo/redo history service imports the @/engine/global-definition LEAF (a
  // WebGLRenderer at module scope), so it bypasses the `@/engine` barrel mock and has
  // to be mocked in its own right — same lesson as persistency-handler (P9),
  // shared-doc-service (P10) and hybrid-algorithms-service (P12).
  historyService: {
    record: vi.fn(),
    recordAfterTransformSync: vi.fn(async () => undefined),
    initScene: vi.fn(),
    setActiveScene: vi.fn(),
    dropScene: vi.fn(),
    undo: vi.fn(async () => undefined),
    redo: vi.fn(async () => undefined),
    reset: vi.fn(),
  },
}));
vi.mock("@/resources/services/history-service", () => ({ historyService: mocks.historyService }));

vi.mock("@/engine/hybrid-algorithms/hybrid-algorithms-service", () => ({
  hybridAlgorithmsService: mocks.hybridAlgorithmsService,
}));
// Modules that reach the engine's global-definition LEAF (rather than the `@/engine`
// barrel below) need it mocked in its own right: importing it for real constructs a
// WebGLRenderer at module scope, which needs a DOM.
vi.mock("@/engine/global-definition", () => ({ globalObject: mocks.globalObject }));
vi.mock("@/engine", () => ({
  globalObject: mocks.globalObject,
  globalSelectedObject: mocks.globalSelectedObject,
}));
vi.mock("@/resources/services/instance-utility", () => ({ instanceUtility: mocks.instanceUtility }));
vi.mock("@/resources/services/meta-utility", () => ({ metaUtility: mocks.metaUtility }));
vi.mock("@/resources/collaboration/shared-doc-service", () => ({ sharedDocService: mocks.sharedDocService }));
// The change publisher resolves the shared session through this back-reference.
mocks.globalObject.sharedDocServiceRef = mocks.sharedDocService;
vi.mock("@/resources/collaboration/y-mapping", () => ({ applyLocalChangeToYDoc: mocks.applyLocalChangeToYDoc }));

import { buildAttributeGroups, applyFieldChange, emptyAttributeGroups, type AttributeOwner } from "./attributeModel";
import { eventBus } from "@/resources/services/event-bus";

const CLASS_INSTANCE_UUID = "ci-1";
const CLASS_UUID = "class-1";
const SCENE_INSTANCE_UUID = "si-1";
const SCENE_TYPE_UUID = "st-1";

/**
 * A meta attribute, shaped as the server sends it. Not revived into a gds `Attribute`
 * on purpose: the code only reads plain fields off it, and building the whole
 * AttributeType/Role graph would add nothing to what these tests check.
 */
function metaAttribute(overrides: Record<string, unknown> = {}) {
  return {
    uuid: "attr-1",
    name: "Name",
    sequence: 1,
    ui_component: "text",
    facets: "",
    default_value: "",
    attribute_type: { uuid: "at-string", name: "String", regex_value: "^.*$", role: null, has_table_attribute: [] },
    ...overrides,
  };
}

/**
 * Build the scene from PLAIN json and read the revived child back out — passing a
 * pre-built gds child into SceneInstance.fromJS gives you a scene holding a COPY
 * (the P4 fixture trap).
 */
function makeSceneWithClassInstance(attributeInstances: Record<string, unknown>[]): {
  sceneInstance: SceneInstance;
  classInstance: ClassInstance;
} {
  const sceneInstance = SceneInstance.fromJS({
    uuid: "si-1",
    uuid_scene_type: "st-1",
    name: "scene",
    class_instances: [
      {
        uuid: CLASS_INSTANCE_UUID,
        uuid_class: CLASS_UUID,
        name: "Task",
        attribute_instance: attributeInstances,
      },
    ],
    relationclasses_instances: [],
  }) as SceneInstance;
  return { sceneInstance, classInstance: sceneInstance.class_instances[0] };
}

function attributeInstanceJson(overrides: Record<string, unknown> = {}) {
  return {
    uuid: "ai-1",
    uuid_attribute: "attr-1",
    assigned_uuid_class_instance: CLASS_INSTANCE_UUID,
    value: "hello",
    name: "Name",
    table_attributes: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(mocks.globalObject, {
    selectedTab: 0,
    doSceneInstancePatch: false,
    doSceneInstancePatchLocal: false,
  });
  mocks.instanceUtility.getAllPortInstancesOfTabContext.mockResolvedValue([]);
  mocks.instanceUtility.getPortInstance.mockResolvedValue(undefined);
  mocks.instanceUtility.getSceneInstance.mockResolvedValue(undefined);
  mocks.metaUtility.getMetaAttribute.mockResolvedValue(metaAttribute());
  mocks.metaUtility.getMetaAttributeWithSequence.mockResolvedValue(metaAttribute());
  // Default: the active tab is not shared (clearAllMocks drops the implementation).
  mocks.sharedDocService.forTab.mockReturnValue(null);
});

describe("buildAttributeGroups", () => {
  it("returns the reset state when no scene is open", async () => {
    mocks.globalSelectedObject.getObject.mockReturnValue(undefined);
    mocks.instanceUtility.getTabContextSceneInstance.mockResolvedValue(undefined);

    const groups = await buildAttributeGroups();

    expect(groups).toEqual(emptyAttributeGroups());
  });

  it("resolves the selected mesh to its class instance and groups a plain attribute", async () => {
    const { sceneInstance, classInstance } = makeSceneWithClassInstance([attributeInstanceJson()]);
    mocks.globalSelectedObject.getObject.mockReturnValue({ uuid: CLASS_INSTANCE_UUID });
    mocks.instanceUtility.getTabContextSceneInstance.mockResolvedValue(sceneInstance);
    mocks.instanceUtility.getClassInstance.mockResolvedValue(classInstance);

    const groups = await buildAttributeGroups();

    expect(groups.currentClassInstance).toBe(classInstance);
    expect(groups.currentClassInstance).toBeInstanceOf(ClassInstance);
    expect(groups.plain).toHaveLength(1);
    expect(groups.plain[0].attributeInstance).toBeInstanceOf(AttributeInstance);
    expect(groups.plain[0].uiType).toBe("text");
    expect(groups.table).toHaveLength(0);
    expect(groups.reference).toHaveLength(0);
  });

  it("sorts by the meta attribute's sequence, defaulting a missing sequence to 1000", async () => {
    const { sceneInstance, classInstance } = makeSceneWithClassInstance([
      attributeInstanceJson({ uuid: "ai-last", uuid_attribute: "attr-no-seq" }),
      attributeInstanceJson({ uuid: "ai-mid", uuid_attribute: "attr-seq-5" }),
      attributeInstanceJson({ uuid: "ai-first", uuid_attribute: "attr-seq-1" }),
    ]);
    mocks.globalSelectedObject.getObject.mockReturnValue({ uuid: CLASS_INSTANCE_UUID });
    mocks.instanceUtility.getTabContextSceneInstance.mockResolvedValue(sceneInstance);
    mocks.instanceUtility.getClassInstance.mockResolvedValue(classInstance);
    mocks.metaUtility.getMetaAttributeWithSequence.mockImplementation(async (uuid: string) => {
      if (uuid === "attr-seq-1") return metaAttribute({ sequence: 1 });
      if (uuid === "attr-seq-5") return metaAttribute({ sequence: 5 });
      return metaAttribute({ sequence: undefined }); // -> 1000
    });

    const groups = await buildAttributeGroups();

    expect(groups.plain.map((e) => e.attributeInstance.uuid)).toEqual(["ai-first", "ai-mid", "ai-last"]);
    expect(groups.plain[2].sequence).toBe(1000);
  });

  it("splits table and reference attributes out of the plain group", async () => {
    const { sceneInstance, classInstance } = makeSceneWithClassInstance([
      attributeInstanceJson({ uuid: "ai-plain", uuid_attribute: "attr-plain" }),
      attributeInstanceJson({
        uuid: "ai-table",
        uuid_attribute: "attr-table",
        table_attributes: [attributeInstanceJson({ uuid: "cell-1", table_row: 0 })],
      }),
      attributeInstanceJson({ uuid: "ai-ref", uuid_attribute: "attr-ref" }),
    ]);
    mocks.globalSelectedObject.getObject.mockReturnValue({ uuid: CLASS_INSTANCE_UUID });
    mocks.instanceUtility.getTabContextSceneInstance.mockResolvedValue(sceneInstance);
    mocks.instanceUtility.getClassInstance.mockResolvedValue(classInstance);
    // A reference attribute is one whose attribute_type carries a Role.
    const withRole = metaAttribute({
      attribute_type: { uuid: "at-ref", regex_value: "^.*$", role: { uuid: "role-1" }, has_table_attribute: [] },
    });
    // A table attribute is one whose attribute_type has columns.
    const withColumns = metaAttribute({
      attribute_type: { uuid: "at-table", regex_value: null, role: null, has_table_attribute: [{ sequence: 1, attribute: { uuid: "attr-col" } }] },
    });
    mocks.metaUtility.getMetaAttribute.mockImplementation(async (uuid: string) =>
      uuid === "attr-ref" ? withRole : uuid === "attr-table" ? withColumns : metaAttribute(),
    );

    const groups = await buildAttributeGroups();

    expect(groups.plain.map((e) => e.attributeInstance.uuid)).toEqual(["ai-plain"]);
    expect(groups.table.map((e) => e.attributeInstance.uuid)).toEqual(["ai-table"]);
    expect(groups.reference.map((e) => e.attributeInstance.uuid)).toEqual(["ai-ref"]);
  });

  it("keeps a table whose rows were all removed in the table group", async () => {
    const { sceneInstance, classInstance } = makeSceneWithClassInstance([
      attributeInstanceJson({ uuid: "ai-table", uuid_attribute: "attr-table", table_attributes: [] }),
    ]);
    mocks.globalSelectedObject.getObject.mockReturnValue({ uuid: CLASS_INSTANCE_UUID });
    mocks.instanceUtility.getTabContextSceneInstance.mockResolvedValue(sceneInstance);
    mocks.instanceUtility.getClassInstance.mockResolvedValue(classInstance);
    mocks.metaUtility.getMetaAttribute.mockResolvedValue(
      metaAttribute({
        attribute_type: { uuid: "at-table", regex_value: null, role: null, has_table_attribute: [{ sequence: 1, attribute: { uuid: "attr-col" } }] },
      }),
    );

    const groups = await buildAttributeGroups();

    expect(groups.table.map((e) => e.attributeInstance.uuid)).toEqual(["ai-table"]);
    expect(groups.plain).toEqual([]);
  });

  it("parses facets from the meta attribute only when the attribute type has a regex", async () => {
    const { sceneInstance, classInstance } = makeSceneWithClassInstance([
      attributeInstanceJson({ uuid: "ai-drop", uuid_attribute: "attr-drop" }),
      attributeInstanceJson({ uuid: "ai-noregex", uuid_attribute: "attr-noregex" }),
    ]);
    mocks.globalSelectedObject.getObject.mockReturnValue({ uuid: CLASS_INSTANCE_UUID });
    mocks.instanceUtility.getTabContextSceneInstance.mockResolvedValue(sceneInstance);
    mocks.instanceUtility.getClassInstance.mockResolvedValue(classInstance);
    mocks.metaUtility.getMetaAttributeWithSequence.mockImplementation(async (uuid: string) => {
      if (uuid === "attr-drop") {
        return metaAttribute({ sequence: 1, ui_component: "Dropdown", facets: "catching|throwing|boundary" });
      }
      // facets present but the type has no regex_value -> the old code ignores them
      return metaAttribute({
        sequence: 2,
        facets: "a|b",
        attribute_type: { uuid: "at-x", regex_value: null, role: null, has_table_attribute: [] },
      });
    });

    const groups = await buildAttributeGroups();

    expect(groups.plain[0].facets).toEqual(["catching", "throwing", "boundary"]);
    expect(groups.plain[0].uiType).toBe("Dropdown");
    expect(groups.plain[1].facets).toEqual([]);
  });

  it("flags attribute instances whose meta attribute is of the File attribute type", async () => {
    const { sceneInstance, classInstance } = makeSceneWithClassInstance([
      attributeInstanceJson({ uuid: "ai-file", uuid_attribute: "attr-file" }),
      attributeInstanceJson({ uuid: "ai-text", uuid_attribute: "attr-text" }),
    ]);
    mocks.globalSelectedObject.getObject.mockReturnValue({ uuid: CLASS_INSTANCE_UUID });
    mocks.instanceUtility.getTabContextSceneInstance.mockResolvedValue(sceneInstance);
    mocks.instanceUtility.getClassInstance.mockResolvedValue(classInstance);
    mocks.metaUtility.getMetaAttribute.mockImplementation(async (uuid: string) =>
      uuid === "attr-file"
        ? metaAttribute({
            attribute_type: {
              uuid: FILE_ATTRIBUTE_TYPE_UUID,
              regex_value: "^.*$",
              role: null,
              has_table_attribute: [],
            },
          })
        : metaAttribute(),
    );

    const groups = await buildAttributeGroups();

    expect(groups.fileTypeUuids).toEqual(["ai-file"]);
  });

  // --- the scene fallback: nothing selected -> the open scene instance's attributes ---

  /** A scene carrying its own attribute instances (parented by `assigned_uuid_scene_instance`). */
  function makeSceneWithOwnAttributes(attributeInstances: Record<string, unknown>[]): SceneInstance {
    return SceneInstance.fromJS({
      uuid: SCENE_INSTANCE_UUID,
      uuid_scene_type: SCENE_TYPE_UUID,
      name: "my model",
      class_instances: [],
      relationclasses_instances: [],
      attribute_instances: attributeInstances,
    }) as SceneInstance;
  }

  function sceneAttributeInstanceJson(overrides: Record<string, unknown> = {}) {
    return attributeInstanceJson({
      uuid: "ai-scene",
      assigned_uuid_class_instance: undefined,
      assigned_uuid_scene_instance: SCENE_INSTANCE_UUID,
      ...overrides,
    });
  }

  it("shows the open scene instance's attributes when nothing is selected", async () => {
    const sceneInstance = makeSceneWithOwnAttributes([sceneAttributeInstanceJson({ value: "model name" })]);
    mocks.globalSelectedObject.getObject.mockReturnValue(undefined);
    mocks.instanceUtility.getTabContextSceneInstance.mockResolvedValue(sceneInstance);
    mocks.instanceUtility.getClassInstance.mockResolvedValue(undefined);
    mocks.instanceUtility.getSceneInstance.mockResolvedValue(sceneInstance);

    const groups = await buildAttributeGroups();

    expect(groups.currentSceneInstance).toBe(sceneInstance);
    expect(groups.currentClassInstance).toBeNull();
    expect(groups.currentPortInstance).toBeNull();
    expect(groups.currentRelationclassInstance).toBeNull();
    expect(groups.plain.map((e) => e.attributeInstance.value)).toEqual(["model name"]);
    // the meta attribute is resolved through the SCENE TYPE, not a class
    expect(mocks.metaUtility.getMetaAttributeWithSequence).toHaveBeenCalledWith("attr-1", SCENE_TYPE_UUID);
  });

  it("falls back to the scene when a stale selection matches no instance", async () => {
    // globalSelectedObject starts as an empty THREE.Mesh and keeps the last mesh after a
    // deletion, so "nothing selected" reaches here as a uuid that resolves to nothing.
    const sceneInstance = makeSceneWithOwnAttributes([sceneAttributeInstanceJson()]);
    mocks.globalSelectedObject.getObject.mockReturnValue({ uuid: "not-an-instance" });
    mocks.instanceUtility.getTabContextSceneInstance.mockResolvedValue(sceneInstance);
    mocks.instanceUtility.getClassInstance.mockResolvedValue(undefined);
    mocks.instanceUtility.getSceneInstance.mockResolvedValue(sceneInstance);

    const groups = await buildAttributeGroups();

    expect(groups.currentSceneInstance).toBe(sceneInstance);
    expect(groups.plain).toHaveLength(1);
  });

  it("prefers the selected element over the scene", async () => {
    const { sceneInstance, classInstance } = makeSceneWithClassInstance([attributeInstanceJson()]);
    sceneInstance.attribute_instances = [
      AttributeInstance.fromJS(sceneAttributeInstanceJson()) as AttributeInstance,
    ];
    mocks.globalSelectedObject.getObject.mockReturnValue({ uuid: CLASS_INSTANCE_UUID });
    mocks.instanceUtility.getTabContextSceneInstance.mockResolvedValue(sceneInstance);
    mocks.instanceUtility.getClassInstance.mockResolvedValue(classInstance);

    const groups = await buildAttributeGroups();

    expect(groups.currentSceneInstance).toBeNull();
    expect(groups.currentClassInstance).toBe(classInstance);
    expect(groups.plain.map((e) => e.attributeInstance.uuid)).toEqual(["ai-1"]);
  });

  it("shows the scene with no dynamic attributes when the scene type declares none", async () => {
    const sceneInstance = makeSceneWithOwnAttributes([]);
    mocks.globalSelectedObject.getObject.mockReturnValue(undefined);
    mocks.instanceUtility.getTabContextSceneInstance.mockResolvedValue(sceneInstance);

    const groups = await buildAttributeGroups();

    expect(groups.currentSceneInstance).toBe(sceneInstance);
    expect(groups.plain).toEqual([]);
    expect(groups.table).toEqual([]);
    expect(groups.reference).toEqual([]);
  });

  it("reads a port instance's attributes when the selection is a port", async () => {
    const sceneInstance = SceneInstance.fromJS({
      uuid: "si-1",
      uuid_scene_type: "st-1",
      class_instances: [],
      relationclasses_instances: [],
    }) as SceneInstance;
    const portInstance = PortInstance.fromJS({
      uuid: "pi-1",
      uuid_port: "port-1",
      name: "Port",
      attribute_instances: [attributeInstanceJson({ uuid: "ai-port", assigned_uuid_class_instance: undefined, assigned_uuid_port_instance: "pi-1" })],
    }) as PortInstance;

    mocks.globalSelectedObject.getObject.mockReturnValue({ uuid: "pi-1" });
    mocks.instanceUtility.getTabContextSceneInstance.mockResolvedValue(sceneInstance);
    mocks.instanceUtility.getAllPortInstancesOfTabContext.mockResolvedValue([portInstance]);
    mocks.instanceUtility.getClassInstance.mockResolvedValue(undefined);
    mocks.instanceUtility.getPortInstance.mockResolvedValue(portInstance);

    const groups = await buildAttributeGroups();

    expect(groups.currentPortInstance).toBe(portInstance);
    expect(groups.plain.map((e) => e.attributeInstance.uuid)).toEqual(["ai-port"]);
    // resolved through the port's meta port, not a meta class
    expect(mocks.metaUtility.getMetaAttributeWithSequence).toHaveBeenCalledWith("attr-1", "port-1");
  });
});

describe("applyFieldChange", () => {
  const classInstance = ClassInstance.fromJS({ uuid: CLASS_INSTANCE_UUID, uuid_class: CLASS_UUID }) as ClassInstance;

  const ownerOf = (over: Partial<AttributeOwner> = {}): AttributeOwner => ({
    currentClassInstance: null,
    currentPortInstance: null,
    currentRelationclassInstance: null,
    currentSceneInstance: null,
    ...over,
  });

  it("stringifies the value, publishes the vizrep channel and flags the scene dirty", async () => {
    const attributeInstance = AttributeInstance.fromJS(attributeInstanceJson({ value: "new value" })) as AttributeInstance;
    const received: AttributeInstance[] = [];
    const sub = eventBus.subscribe("checkForVizRepUpdateByAttributeInstance", (payload) =>
      received.push(payload),
    );

    await applyFieldChange(attributeInstance, ownerOf({ currentClassInstance: classInstance }));
    sub.dispose();

    expect(received).toEqual([attributeInstance]);
    expect(mocks.globalObject.doSceneInstancePatch).toBe(true);
    // Not shared -> no Yjs write and the local-patch flag stays untouched.
    expect(mocks.applyLocalChangeToYDoc).not.toHaveBeenCalled();
    expect(mocks.globalObject.doSceneInstancePatchLocal).toBe(false);
  });

  // --- P10: the shared branch, now reachable ------------------------------------

  // P12 un-stub. The hybrid algorithms are what redraw an ObjectSpace Augmentation /
  // Detectable after its Object 3D or Image attribute is edited; if this call is ever
  // dropped, the value still saves and the mesh silently stops following it.
  it("runs the hybrid algorithms for the owning class instance", async () => {
    const attributeInstance = AttributeInstance.fromJS(attributeInstanceJson()) as AttributeInstance;

    await applyFieldChange(attributeInstance, ownerOf({ currentClassInstance: classInstance }));

    expect(mocks.hybridAlgorithmsService.checkHybridAlgorithms).toHaveBeenCalledWith(null, [classInstance]);
  });

  it("runs the hybrid algorithms against the port slot when a port owns the attribute", async () => {
    const portInstance = { uuid: "pi-1" } as never;
    const attributeInstance = AttributeInstance.fromJS(attributeInstanceJson()) as AttributeInstance;

    await applyFieldChange(attributeInstance, ownerOf({ currentPortInstance: portInstance }));

    expect(mocks.hybridAlgorithmsService.checkHybridAlgorithms).toHaveBeenCalledWith(null, null, [portInstance]);
  });

  it("does not run the hybrid algorithms when neither a class nor a port is selected", async () => {
    const attributeInstance = AttributeInstance.fromJS(attributeInstanceJson()) as AttributeInstance;

    await applyFieldChange(attributeInstance, ownerOf());

    expect(mocks.hybridAlgorithmsService.checkHybridAlgorithms).not.toHaveBeenCalled();
  });

  it("commits an attribute whose stored value is null instead of throwing", async () => {
    const attributeInstance = AttributeInstance.fromJS(attributeInstanceJson({ value: null })) as AttributeInstance;

    await applyFieldChange(attributeInstance, ownerOf({ currentClassInstance: classInstance }));

    expect(attributeInstance.value).toBe("");
    expect(mocks.globalObject.doSceneInstancePatch).toBe(true);
  });

  it("flags the scene dirty for a scene-owned attribute, without hybrid algorithms", async () => {
    const sceneInstance = { uuid: SCENE_INSTANCE_UUID } as never;
    const attributeInstance = AttributeInstance.fromJS(
      attributeInstanceJson({ assigned_uuid_class_instance: undefined, assigned_uuid_scene_instance: SCENE_INSTANCE_UUID }),
    ) as AttributeInstance;
    const received: AttributeInstance[] = [];
    const sub = eventBus.subscribe("checkForVizRepUpdateByAttributeInstance", (payload) => received.push(payload));

    await applyFieldChange(attributeInstance, ownerOf({ currentSceneInstance: sceneInstance }));
    sub.dispose();

    // The vizrep checker resolves scene-parented attributes through the scene type.
    expect(received).toEqual([attributeInstance]);
    expect(mocks.globalObject.doSceneInstancePatch).toBe(true);
    // Neither hybrid dispatch applies to a scene, and there is no Yjs case for one.
    expect(mocks.hybridAlgorithmsService.checkHybridAlgorithms).not.toHaveBeenCalled();
    expect(mocks.applyLocalChangeToYDoc).not.toHaveBeenCalled();
  });

  it("broadcasts a scene-owned attribute as a scene_attribute_value change when shared", async () => {
    const session = { ydoc: { fake: "ydoc" }, localOrigin: {}, applyingRemote: false };
    mocks.sharedDocService.forTab.mockReturnValue(session);
    const attributeInstance = AttributeInstance.fromJS(
      attributeInstanceJson({ value: "shared model name" }),
    ) as AttributeInstance;

    await applyFieldChange(attributeInstance, ownerOf({ currentSceneInstance: { uuid: SCENE_INSTANCE_UUID } as never }));

    // The scene owns the attribute, and a Y.Doc holds one scene -> no owner uuid.
    expect(mocks.applyLocalChangeToYDoc).toHaveBeenCalledWith(
      session.ydoc,
      {
        type: "scene_attribute_value",
        attributeUuid: attributeInstance.uuid,
        value: "shared model name",
      },
      session.localOrigin,
    );
    expect(mocks.globalObject.doSceneInstancePatchLocal).toBe(true);
  });

  it("writes an attribute_value change to the YDoc and sets the local flag when shared", async () => {
    const session = { ydoc: { fake: "ydoc" }, localOrigin: {}, applyingRemote: false };
    mocks.sharedDocService.forTab.mockReturnValue(session);
    const attributeInstance = AttributeInstance.fromJS(attributeInstanceJson({ value: "shared value" })) as AttributeInstance;

    await applyFieldChange(attributeInstance, ownerOf({ currentClassInstance: classInstance }));

    expect(mocks.applyLocalChangeToYDoc).toHaveBeenCalledWith(
      session.ydoc,
      {
        type: "attribute_value",
        classInstanceUuid: CLASS_INSTANCE_UUID,
        attributeUuid: attributeInstance.uuid,
        value: "shared value",
      },
      session.localOrigin,
    );
    expect(mocks.globalObject.doSceneInstancePatchLocal).toBe(true);
    // The shared branch must NOT use the non-shared flag (they drive different saves).
    expect(mocks.globalObject.doSceneInstancePatch).toBe(false);
  });

  it("uses relation_attribute_value when a relationclass instance owns the attribute", async () => {
    const session = { ydoc: { fake: "ydoc" }, localOrigin: {}, applyingRemote: false };
    mocks.sharedDocService.forTab.mockReturnValue(session);
    const relationclassInstance = { uuid: "ri-1" } as any;
    const attributeInstance = AttributeInstance.fromJS(attributeInstanceJson({ value: "rel value" })) as AttributeInstance;

    await applyFieldChange(attributeInstance, ownerOf({ currentRelationclassInstance: relationclassInstance }));

    expect(mocks.applyLocalChangeToYDoc).toHaveBeenCalledWith(
      session.ydoc,
      {
        type: "relation_attribute_value",
        relationClassInstanceUuid: "ri-1",
        attributeUuid: attributeInstance.uuid,
        value: "rel value",
      },
      session.localOrigin,
    );
    expect(mocks.globalObject.doSceneInstancePatchLocal).toBe(true);
  });

  it("ignores a change that is being applied from a remote update (no echo)", async () => {
    mocks.sharedDocService.forTab.mockReturnValue({ ydoc: {}, localOrigin: {}, applyingRemote: true });
    const attributeInstance = AttributeInstance.fromJS(attributeInstanceJson({ value: "echo" })) as AttributeInstance;
    const received: AttributeInstance[] = [];
    const sub = eventBus.subscribe("checkForVizRepUpdateByAttributeInstance", (payload) => received.push(payload));

    await applyFieldChange(attributeInstance, ownerOf({ currentClassInstance: classInstance }));
    sub.dispose();

    expect(received).toEqual([]);
    expect(mocks.applyLocalChangeToYDoc).not.toHaveBeenCalled();
    expect(mocks.globalObject.doSceneInstancePatchLocal).toBe(false);
    expect(mocks.globalObject.doSceneInstancePatch).toBe(false);
  });
});
