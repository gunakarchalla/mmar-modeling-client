// P3 unit tests for expression-utility (plan §7: "expression utility against
// fixture instances"). This transitively exercises instance-utility's lookups too.
//
// global-definition is faked (see snapshot-service.test.ts for why); the gds
// instances are REAL and revived via fromJS, which is the whole point — the
// modeling client's expression helpers branch on `instanceof ClassInstance /
// RelationclassInstance`, so the fixtures must carry real class identity.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { SceneInstance, ClassInstance, RelationclassInstance } from "@gds";

const mocks = vi.hoisted(() => ({
  globalObject: {} as any,
  loadAllSceneInstances: vi.fn(async () => undefined),
}));

vi.mock("@/engine/global-definition", () => ({ globalObject: mocks.globalObject }));
vi.mock("./scene-tree-service", () => ({ loadAllSceneInstances: mocks.loadAllSceneInstances }));

import { expressionUtility } from "./expression-utility";
import { useLogStore } from "@/resources/store/logStore";

// A tiny model: class A --R--> class B, where A carries a "label" attribute.
function buildSceneInstance(): SceneInstance {
  return SceneInstance.fromJS({
    uuid: "scene-1",
    name: "Demo Scene",
    uuid_scene_type: "st-1",
    class_instances: [
      {
        uuid: "A",
        uuid_class: "metaA",
        attribute_instance: [
          { uuid: "ai-A", uuid_attribute: "attr-1", name: "label", value: "hello" },
        ],
        port_instance: [],
      },
      { uuid: "B", uuid_class: "metaB", attribute_instance: [], port_instance: [] },
    ],
    relationclasses_instances: [
      {
        uuid: "R",
        uuid_relationclass: "metaR",
        attribute_instance: [],
        port_instance: [],
        line_points: [],
        role_instance_from: { uuid: "rf", uuid_has_reference_class_instance: "A" },
        role_instance_to: { uuid: "rt", uuid_has_reference_class_instance: "B" },
      },
    ],
    role_instances: [],
    attribute_instances: [],
    port_instances: [],
  }) as SceneInstance;
}

beforeEach(() => {
  const sceneInstance = buildSceneInstance();
  Object.assign(mocks.globalObject, {
    selectedTab: 0,
    tabContext: [
      {
        sceneType: {},
        sceneInstance,
        threeScene: {},
        contextDragObjects: [],
        isShared: false,
      },
    ],
    // getAllSceneInstancesFromLocal walks sceneTree -> children.
    sceneTree: [{ children: [sceneInstance] }],
    current_class_instance: sceneInstance.class_instances[0], // A
    current_port_instance: undefined,
    readyForVizRepUpdate: true,
  });
});

describe("ExpressionUtility — vizrep helper API over fixture instances", () => {
  it("getClassInstancesByMetaUUID filters by meta class (instanceof ClassInstance)", async () => {
    const result = await expressionUtility.getClassInstancesByMetaUUID("metaA");
    expect(result).toHaveLength(1);
    expect(result[0].uuid).toBe("A");
    expect(result[0]).toBeInstanceOf(ClassInstance);
  });

  it("getClassInstancesByMetaUUID matches relation classes by uuid_relationclass", async () => {
    const result = await expressionUtility.getClassInstancesByMetaUUID("metaR");
    expect(result).toHaveLength(1);
    expect(result[0].uuid).toBe("R");
    expect(result[0]).toBeInstanceOf(RelationclassInstance);
  });

  it("attrval reads the attribute value from the current class instance", async () => {
    expect(await expressionUtility.attrval("attr-1")).toBe("hello");
    expect(await expressionUtility.attrvalByName("label")).toBe("hello");
  });

  it("getSource/DestinationByRelInstanceUUID resolve the relation endpoints", async () => {
    const source = await expressionUtility.getSourceByRelInstanceUUID("R");
    const destination = await expressionUtility.getDestinationByRelInstanceUUID("R");
    expect(source).toBeInstanceOf(ClassInstance);
    expect(source!.uuid).toBe("A");
    expect(destination).toBeInstanceOf(ClassInstance);
    expect(destination!.uuid).toBe("B");
  });

  it("getIncoming/OutgoingRelationsByInstanceUUID walk the role instances", async () => {
    const outgoingA = await expressionUtility.getOutgoingRelationsByInstanceUUID("A");
    const incomingB = await expressionUtility.getIncomingRelationsByInstanceUUID("B");
    expect(outgoingA).toHaveLength(1);
    expect(outgoingA[0].uuid).toBe("R");
    expect(incomingB).toHaveLength(1);
    expect(incomingB[0].uuid).toBe("R");
    // A is a source but not a destination -> not "connected" (needs both).
    expect(await expressionUtility.isConnected("A")).toBe(false);
  });
});

describe("ExpressionUtility — calls for procedures", () => {
  it("log writes to the log window, defaulting to an info line", () => {
    useLogStore.setState({ logArray: [] });
    expressionUtility.log("Project length: 12 days");
    expressionUtility.log("Unsatisfiable", "error");

    const [newest, oldest] = useLogStore.getState().logArray;
    expect(oldest).toMatchObject({ value: "Project length: 12 days", status: "info" });
    expect(newest).toMatchObject({ value: "Unsatisfiable", status: "error" });
  });

  it("loadAllSceneInstances fills the local tree on demand", async () => {
    await expressionUtility.loadAllSceneInstances();
    expect(mocks.loadAllSceneInstances).toHaveBeenCalledTimes(1);
  });

  it("getInstanceByUUID reaches an instance with no relations, class included", async () => {
    const lonely = await expressionUtility.getInstanceByUUID("B");
    expect(lonely).toBeInstanceOf(ClassInstance);
    expect((lonely as ClassInstance).uuid_class).toBe("metaB");
  });

  it("getInstanceByUUID finds nothing for an unknown uuid", async () => {
    expect(await expressionUtility.getInstanceByUUID("gone")).toBeNull();
  });
});

describe("ExpressionUtility — helpers for reading related instances and tables", () => {
  beforeEach(() => {
    const scene = mocks.globalObject.tabContext[0].sceneInstance as SceneInstance;
    const revived = SceneInstance.fromJS({
      uuid: "extra",
      uuid_scene_type: "st-1",
      class_instances: [
        { uuid: "C", uuid_class: "metaA", attribute_instance: [], port_instance: [] },
        { uuid: "D", uuid_class: "metaB", attribute_instance: [], port_instance: [{ uuid: "P", uuid_port: "metaP", attribute_instances: [] }] },
      ],
      relationclasses_instances: [
        // A to a port of D, through another relation class
        { uuid: "R2", uuid_relationclass: "metaR2", attribute_instance: [], line_points: [], role_instance_from: { uuid: "r2f", uuid_has_reference_class_instance: "A" }, role_instance_to: { uuid: "r2t", uuid_has_reference_port_instance: "P" } },
        // a second relation from C to B, and one still being drawn from C
        { uuid: "R3", uuid_relationclass: "metaR", attribute_instance: [], line_points: [], role_instance_from: { uuid: "r3f", uuid_has_reference_class_instance: "C" }, role_instance_to: { uuid: "r3t", uuid_has_reference_class_instance: "B" } },
        { uuid: "R4", uuid_relationclass: "metaR", attribute_instance: [], line_points: [], role_instance_from: { uuid: "r4f", uuid_has_reference_class_instance: "C" } },
      ],
      port_instances: [],
      attribute_instances: [],
    }) as SceneInstance;
    scene.class_instances.push(...revived.class_instances);
    scene.relationclasses_instances.push(...revived.relationclasses_instances);

    scene.class_instances[0].attribute_instance.push(
      ...(SceneInstance.fromJS({
        uuid: "tmp",
        class_instances: [
          {
            uuid: "tmp-class",
            attribute_instance: [
              {
                uuid: "table",
                uuid_attribute: "meta-table",
                name: "Steps",
                value: "",
                assigned_uuid_class_instance: "A",
                table_attributes: [
                  { uuid: "c00", uuid_attribute: "col-product", name: "Product", table_row: 0, table_attribute_reference: "table", value: "name of B", role_instance_from: { uuid: "ref", uuid_has_reference_class_instance: "B" } },
                  { uuid: "c01", uuid_attribute: "col-note", name: "Note", table_row: 0, table_attribute_reference: "table", value: "first" },
                  { uuid: "c11", uuid_attribute: "col-note", name: "Note", table_row: 1, table_attribute_reference: "table", value: "second" },
                ],
              },
            ],
          },
        ],
      }) as SceneInstance).class_instances[0].attribute_instance,
    );
  });

  const uuids = (instances: { uuid: string }[]) => instances.map((instance) => instance.uuid);

  it("getDestinationsByInstanceUUID lists what an instance's relations lead to, ports included", async () => {
    expect(uuids(await expressionUtility.getDestinationsByInstanceUUID("A"))).toEqual(["B", "P"]);
    expect(uuids(await expressionUtility.getDestinationsByInstanceUUID("A", "metaR"))).toEqual(["B"]);
    expect(uuids(await expressionUtility.getDestinationsByInstanceUUID("A", ["metaR2"]))).toEqual(["P"]);
  });

  it("getSourcesByInstanceUUID lists where the relations ending at an instance start, each once", async () => {
    expect(uuids(await expressionUtility.getSourcesByInstanceUUID("B"))).toEqual(["A", "C"]);
    expect(uuids(await expressionUtility.getSourcesByInstanceUUID("P"))).toEqual(["A"]);
    // R4 is still being drawn: it has no "to" end, so it leads nowhere.
    expect(uuids(await expressionUtility.getDestinationsByInstanceUUID("C"))).toEqual(["B"]);
  });

  it("getTableRows reads the rows of a table, each cell under its column's name and uuid", async () => {
    const rows = await expressionUtility.getTableRows("A", "meta-table");

    expect(rows).toHaveLength(2);
    expect(rows[0].Product.value).toBe("name of B");
    expect(rows[0]["col-product"]).toBe(rows[0].Product);
    expect(rows[1].Note.value).toBe("second");
    expect(rows[1].Product).toBeUndefined();
    expect(await expressionUtility.getTableRows("A", "no-such-attribute")).toEqual([]);
  });

  it("getReference resolves what a reference cell points at", async () => {
    const [row] = await expressionUtility.getTableRows("A", "meta-table");

    expect((await expressionUtility.getReference(row.Product))?.uuid).toBe("B");
    expect(await expressionUtility.getReference(row.Note)).toBeUndefined();
  });

  it("attrvalByNameAndInst reads another instance's attribute by name", async () => {
    expect(await expressionUtility.attrvalByNameAndInst("label", "A")).toBe("hello");
    expect(await expressionUtility.attrvalByNameAndInst("no such name", "A")).toBeUndefined();
  });

  it("self is undefined outside a vizRep", async () => {
    expect(await expressionUtility.self()).toBeUndefined();
  });
});
