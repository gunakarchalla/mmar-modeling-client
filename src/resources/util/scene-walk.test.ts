import { describe, it, expect } from "vitest";
import { AttributeInstance, SceneInstance } from "@gds";
import { attributesOf, enclosingTables, referenceTarget } from "./scene-walk";

const cell = (uuid: string, table: string, cells: object[] = []) => ({
  uuid,
  uuid_attribute: `column-of-${table}`,
  table_attribute_reference: table,
  table_row: 0,
  value: "",
  table_attributes: cells,
});

/** A scene whose class instance owns `table`, a table attribute holding `cells`. */
function sceneWithTable(cells: object[]): SceneInstance {
  return SceneInstance.fromJS({
    uuid: "scene",
    uuid_scene_type: "scene-type",
    attribute_instances: [{ uuid: "scene-attr", uuid_attribute: "meta-scene-attr", value: "" }],
    class_instances: [
      {
        uuid: "owner",
        uuid_class: "meta-class",
        attribute_instance: [{ uuid: "table", uuid_attribute: "meta-table", assigned_uuid_class_instance: "owner", value: "", table_attributes: cells }],
        port_instance: [{ uuid: "port", uuid_port: "meta-port", attribute_instances: [{ uuid: "port-attr", uuid_attribute: "meta-port-attr", value: "" }] }],
      },
    ],
    relationclasses_instances: [],
    port_instances: [],
  }) as SceneInstance;
}

const findCell = (scene: SceneInstance, ...path: number[]) =>
  path.reduce((attribute, index) => attribute.table_attributes[index], scene.class_instances[0].attribute_instance[0]);

describe("attributesOf", () => {
  it("lists the attributes of the scene, its instances and their ports, but not table cells", () => {
    const scene = sceneWithTable([cell("c", "table")]);

    expect(attributesOf(scene).map((attribute) => attribute.uuid)).toEqual(["scene-attr", "table", "port-attr"]);
  });
});

describe("enclosingTables", () => {
  it("is empty for an attribute that is not a cell", () => {
    const scene = sceneWithTable([]);

    expect(enclosingTables(scene.class_instances[0].attribute_instance[0], scene)).toEqual([]);
  });

  it("names a cell's table", () => {
    const scene = sceneWithTable([cell("c", "table")]);

    expect(enclosingTables(findCell(scene, 0), scene)!.map((table) => table.uuid)).toEqual(["table"]);
  });

  it("names the tables of a nested cell, innermost first", () => {
    const scene = sceneWithTable([cell("inner-table", "table", [cell("c", "inner-table")])]);

    expect(enclosingTables(findCell(scene, 0, 0), scene)!.map((table) => table.uuid)).toEqual(["inner-table", "table"]);
  });

  it("is undefined for a cell whose table is not in the scene", () => {
    const scene = sceneWithTable([]);
    const stray = AttributeInstance.fromJS(cell("c", "elsewhere")) as AttributeInstance;

    expect(enclosingTables(stray, scene)).toBeUndefined();
  });

  it("is undefined, rather than looping, for tables that contain each other", () => {
    const scene = sceneWithTable([cell("c", "table")]);
    // Not something the database allows, but a corrupt copy must not hang the client.
    scene.class_instances[0].attribute_instance[0].table_attribute_reference = "c";

    expect(enclosingTables(findCell(scene, 0), scene)).toBeUndefined();
  });
});

describe("referenceTarget", () => {
  it("reads whichever kind of instance a role points at", () => {
    expect(referenceTarget({ uuid_has_reference_port_instance: "p" } as never)).toBe("p");
    expect(referenceTarget({ uuid_has_reference_class_instance: "c" } as never)).toBe("c");
    expect(referenceTarget(undefined)).toBeUndefined();
  });
});
