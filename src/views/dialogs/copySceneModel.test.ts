// P9 unit tests for the copy-scene uuid-rewriting deep copy.
//
// The contract: every uuid in the copied graph is FRESH, cross-references still point
// at the copy's own objects (never back at the original), and the original is left
// untouched. Runs in node — no engine, no DOM: copySceneModel is deliberately a plain
// module (the same split P6 used for tabActions and P8 for attributeModel).
//
// Fixtures are built with the gds static fromJS, never the app's plainToInstance
// (P3's class-transformer rule), so nested instances really are gds class instances.
import { describe, it, expect } from "vitest";
import { SceneInstance, ClassInstance } from "@gds";
import { collectSceneInstanceUuids, duplicateSceneInstance } from "./copySceneModel";

const SCENE_UUID = "11111111-1111-4111-8111-111111111111";
const SCENE_ATTR_UUID = "22222222-2222-4222-8222-222222222222";
const CLASS_UUID = "33333333-3333-4333-8333-333333333333";
const CLASS_ATTR_UUID = "44444444-4444-4444-8444-444444444444";
const TABLE_CELL_UUID = "55555555-5555-4555-8555-555555555555";
const NESTED_CELL_UUID = "66666666-6666-4666-8666-666666666666";
const PORT_UUID = "77777777-7777-4777-8777-777777777777";
const PORT_ATTR_UUID = "88888888-8888-4888-8888-888888888888";
const RELATION_UUID = "99999999-9999-4999-8999-999999999999";
const RELATION_ATTR_UUID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ROLE_FROM_UUID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ROLE_TO_UUID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SCENE_TYPE_UUID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const META_CLASS_UUID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

/**
 * A scene exercising every branch the old dialog walked, plus a NESTED table
 * attribute (a table cell that is itself a table — Robotic system → Joint's `button`
 * columns do this in the demo metamodel). The old dialog descended only one level;
 * this port recurses (deviation 2 in copySceneModel.ts) and the nested cell is here
 * to hold that line.
 *
 * Built from PLAIN json and read back out via fromJS — passing pre-built gds children
 * into a parent's fromJS yields a parent holding COPIES (the P4 fixture trap).
 */
function makeScene(): SceneInstance {
  return SceneInstance.fromJS({
    uuid: SCENE_UUID,
    uuid_scene_type: SCENE_TYPE_UUID,
    name: "Original scene",
    description: "original description",
    attribute_instances: [
      {
        uuid: SCENE_ATTR_UUID,
        uuid_attribute: "meta-attr-scene",
        assigned_uuid_scene_instance: SCENE_UUID, // cross-reference back at the scene
        value: "v",
        table_attributes: [],
      },
    ],
    class_instances: [
      {
        uuid: CLASS_UUID,
        uuid_class: META_CLASS_UUID,
        name: "Class A",
        attribute_instance: [
          {
            uuid: CLASS_ATTR_UUID,
            uuid_attribute: "meta-attr-class",
            assigned_uuid_class_instance: CLASS_UUID, // cross-reference at its class
            value: "v",
            table_attributes: [
              {
                uuid: TABLE_CELL_UUID,
                uuid_attribute: "meta-attr-cell",
                value: "cell",
                table_attributes: [
                  {
                    uuid: NESTED_CELL_UUID,
                    uuid_attribute: "meta-attr-nested",
                    value: "nested cell",
                    table_attributes: [],
                  },
                ],
              },
            ],
          },
        ],
        port_instance: [
          {
            uuid: PORT_UUID,
            uuid_port: "meta-port",
            uuid_class_instance: CLASS_UUID, // cross-reference at its class
            uuid_scene_instance: SCENE_UUID, // and at the scene
            attribute_instances: [
              {
                uuid: PORT_ATTR_UUID,
                uuid_attribute: "meta-attr-port",
                value: "v",
                table_attributes: [],
              },
            ],
          },
        ],
      },
    ],
    relationclasses_instances: [
      {
        uuid: RELATION_UUID,
        uuid_relationclass: "meta-relationclass",
        name: "Relation A",
        attribute_instance: [
          {
            uuid: RELATION_ATTR_UUID,
            uuid_attribute: "meta-attr-relation",
            value: "v",
            table_attributes: [],
          },
        ],
        role_instance_from: {
          uuid: ROLE_FROM_UUID,
          uuid_role: "meta-role-from",
          uuid_has_reference_class_instance: CLASS_UUID, // cross-reference at the class
        },
        role_instance_to: {
          uuid: ROLE_TO_UUID,
          uuid_role: "meta-role-to",
          uuid_has_reference_class_instance: CLASS_UUID,
        },
      },
    ],
  }) as SceneInstance;
}

/** Every uuid-looking string anywhere in the graph. */
function allUuidsDeep(value: unknown): string[] {
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const found: string[] = [];
  const walk = (node: unknown) => {
    if (typeof node === "string") {
      if (uuidRe.test(node)) found.push(node);
      return;
    }
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === "object") return Object.values(node).forEach(walk);
  };
  walk(JSON.parse(JSON.stringify(value)));
  return found;
}

describe("collectSceneInstanceUuids", () => {
  it("collects every instance uuid in the graph, including nested table attributes", () => {
    const uuids = collectSceneInstanceUuids(makeScene());

    expect(uuids).toEqual(
      expect.arrayContaining([
        SCENE_UUID,
        SCENE_ATTR_UUID,
        CLASS_UUID,
        CLASS_ATTR_UUID,
        TABLE_CELL_UUID,
        NESTED_CELL_UUID, // the old one-level walk missed this
        PORT_UUID,
        PORT_ATTR_UUID,
        RELATION_UUID,
        RELATION_ATTR_UUID,
        ROLE_FROM_UUID,
        ROLE_TO_UUID,
      ]),
    );
  });

  it("does not collect meta-object uuids — those must survive the copy", () => {
    const uuids = collectSceneInstanceUuids(makeScene());
    expect(uuids).not.toContain(SCENE_TYPE_UUID);
    expect(uuids).not.toContain(META_CLASS_UUID);
  });

  it("de-duplicates, so no uuid is rewritten twice", () => {
    const uuids = collectSceneInstanceUuids(makeScene());
    expect(new Set(uuids).size).toBe(uuids.length);
  });
});

describe("duplicateSceneInstance", () => {
  it("rewrites every instance uuid — the copy shares none with the original", () => {
    const original = makeScene();
    const originalUuids = new Set(collectSceneInstanceUuids(original));

    const copy = duplicateSceneInstance(original, "Copy", "copy description");

    for (const uuid of collectSceneInstanceUuids(copy)) {
      expect(originalUuids.has(uuid)).toBe(false);
    }
  });

  it("keeps cross-references internally consistent (they point at the copy, not the original)", () => {
    const original = makeScene();
    const copy = duplicateSceneInstance(original, "Copy", "");

    const copiedClass = copy.class_instances[0];
    const copiedRelation = copy.relationclasses_instances[0];
    const copiedPort = copiedClass.port_instance[0];

    // The scene's own uuid was rewritten at its identity AND at every child that
    // references it — this is what the JSON-text replace buys us.
    expect(copy.attribute_instances[0].assigned_uuid_scene_instance).toBe(copy.uuid);
    expect(copiedPort.uuid_scene_instance).toBe(copy.uuid);

    // Both roles still point at the COPY's class instance.
    expect(copiedRelation.role_instance_from.uuid_has_reference_class_instance).toBe(
      copiedClass.uuid,
    );
    expect(copiedRelation.role_instance_to.uuid_has_reference_class_instance).toBe(
      copiedClass.uuid,
    );

    // Attributes/ports still point at their own (copied) class instance.
    expect(copiedClass.attribute_instance[0].assigned_uuid_class_instance).toBe(copiedClass.uuid);
    expect(copiedPort.uuid_class_instance).toBe(copiedClass.uuid);
  });

  it("rewrites nested table-attribute uuids (the old one-level walk left these colliding)", () => {
    const original = makeScene();
    const copy = duplicateSceneInstance(original, "Copy", "");

    const nested = copy.class_instances[0].attribute_instance[0].table_attributes[0];
    expect(nested.uuid).not.toBe(TABLE_CELL_UUID);
    expect(nested.table_attributes[0].uuid).not.toBe(NESTED_CELL_UUID);
    // values are preserved — only identities change
    expect(nested.table_attributes[0].value).toBe("nested cell");
  });

  it("preserves meta-object references, structure and values", () => {
    const original = makeScene();
    const copy = duplicateSceneInstance(original, "Copy", "");

    expect(copy.uuid_scene_type).toBe(SCENE_TYPE_UUID);
    expect(copy.class_instances[0].uuid_class).toBe(META_CLASS_UUID);
    expect(copy.class_instances[0].name).toBe("Class A");
    expect(copy.class_instances).toHaveLength(1);
    expect(copy.relationclasses_instances).toHaveLength(1);
    expect(copy.class_instances[0].port_instance).toHaveLength(1);
  });

  it("applies the new name and description", () => {
    const copy = duplicateSceneInstance(makeScene(), "My copy", "my description");
    expect(copy.name).toBe("My copy");
    expect(copy.description).toBe("my description");
  });

  it("leaves the original completely untouched", () => {
    const original = makeScene();
    const before = JSON.stringify(original);

    duplicateSceneInstance(original, "Copy", "copy description");

    expect(JSON.stringify(original)).toBe(before);
  });

  it("revives into real gds instances (fromJS, not the app's plainToInstance)", () => {
    const copy = duplicateSceneInstance(makeScene(), "Copy", "");

    // P3: the app's plainToInstance would leave these nested objects as plain Objects
    // and every downstream instanceof check (expression-utility, graphic-context) would fail.
    expect(copy).toBeInstanceOf(SceneInstance);
    expect(copy.class_instances[0]).toBeInstanceOf(ClassInstance);
  });

  it("leaves no uuid of the original anywhere in the copy's JSON", () => {
    const original = makeScene();
    const copy = duplicateSceneInstance(original, "Copy", "");

    const instanceUuids = new Set(collectSceneInstanceUuids(original));
    const leaked = allUuidsDeep(copy).filter((u) => instanceUuids.has(u));

    expect(leaked).toEqual([]);
  });
});
