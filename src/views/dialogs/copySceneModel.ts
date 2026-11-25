import { v4 as uuidv4 } from "uuid";
import { SceneInstance } from "@gds";
import type { AttributeInstance } from "@gds";

/**
 * The uuid-rewriting deep copy behind the "Duplicate SceneInstance" dialog, kept apart
 * from the component so the rewriting is unit-testable without rendering a dialog.
 *
 * HOW IT WORKS: the SceneInstance is serialised to JSON once, and every uuid in the
 * graph is then replaced by a fresh v4 uuid with a global string replace over that
 * text. Working on the text rather than walking and assigning is what keeps the copy
 * internally consistent for free — a uuid that appears both as an identity
 * (`class_instance.uuid`) and as a cross-reference
 * (`role_instance.uuid_has_reference_class_instance`, `assigned_uuid_class_instance`, …)
 * is rewritten at BOTH sites in the same pass. That is why this is not a structured walk.
 *
 * Two details worth keeping:
 *
 * 1. Revival goes through gds's own `SceneInstance.fromJS`, never the app's
 *    `plainToInstance`. The app and gds each bundle their own class-transformer, and
 *    gds's `@Type` metadata lives only in gds's copy, so the app's `plainToInstance`
 *    shallow-revives: nested class instances would stay plain objects and every
 *    downstream `instanceof ClassInstance` check would fail.
 *
 * 2. `table_attributes` are rewritten RECURSIVELY, because a table column's own
 *    attribute can itself be a table (the demo metamodel's Robotic system → Joint does
 *    exactly this). Descending only one level would leave the copy holding the
 *    ORIGINAL's uuids down there, so both scenes would claim the same attribute-instance
 *    uuid and their saves would collide on the same database row.
 */

/** Collects an attribute instance's uuid plus, recursively, its table attributes'. */
function collectAttributeUuids(attributeInstances: AttributeInstance[] | undefined): string[] {
  const uuids: string[] = [];
  for (const attributeInstance of attributeInstances ?? []) {
    uuids.push(attributeInstance.uuid);
    // Recurse: a table column's attribute can itself be a table.
    uuids.push(...collectAttributeUuids(attributeInstance.table_attributes));
  }
  return uuids;
}

/**
 * Every uuid in a SceneInstance's object graph, collected in one deterministic
 * them (scene → its attributes → classes (attributes, tables, ports + their
 * attributes) → relationclasses (attributes, tables, both role instances)).
 * Order does not affect the result — each uuid is replaced independently — but it
 * keeps the traversal easy to audit against the gds model.
 */
export function collectSceneInstanceUuids(sceneInstance: SceneInstance): string[] {
  const uuids: string[] = [sceneInstance.uuid];

  uuids.push(...collectAttributeUuids(sceneInstance.attribute_instances));

  for (const classInstance of sceneInstance.class_instances ?? []) {
    uuids.push(classInstance.uuid);
    uuids.push(...collectAttributeUuids(classInstance.attribute_instance));

    for (const port of classInstance.port_instance ?? []) {
      uuids.push(port.uuid);
      uuids.push(...collectAttributeUuids(port.attribute_instances));
    }
  }

  for (const relationclassInstance of sceneInstance.relationclasses_instances ?? []) {
    uuids.push(relationclassInstance.uuid);
    uuids.push(...collectAttributeUuids(relationclassInstance.attribute_instance));

    if (relationclassInstance.role_instance_from) {
      uuids.push(relationclassInstance.role_instance_from.uuid);
    }
    if (relationclassInstance.role_instance_to) {
      uuids.push(relationclassInstance.role_instance_to.uuid);
    }
  }

  // A uuid can legitimately appear twice in the walk (e.g. a role instance already
  // seen); replacing it twice would rewrite the second occurrence's fresh uuid, so
  // de-duplicate before replacing.
  return [...new Set(uuids.filter(Boolean))];
}

/** Escapes a uuid for use in a RegExp. UUIDs contain no metacharacters, but the old
 * code built `new RegExp(uuid, 'g')` from unvalidated data — this keeps that safe if
 * a malformed uuid ever shows up. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Deep-copies a SceneInstance, giving every instance in the graph a fresh uuid and
 * applying the new name/description. Returns a fully revived gds SceneInstance.
 */
export function duplicateSceneInstance(
  sceneInstance: SceneInstance,
  name: string,
  description: string,
): SceneInstance {
  let sceneInstanceAsString = JSON.stringify(sceneInstance);

  for (const oldUuid of collectSceneInstanceUuids(sceneInstance)) {
    sceneInstanceAsString = sceneInstanceAsString.replace(
      new RegExp(escapeRegExp(oldUuid), "g"),
      uuidv4(),
    );
  }

  // gds fromJS, never the app's plainToInstance — see the header.
  const newSceneInstance = SceneInstance.fromJS(JSON.parse(sceneInstanceAsString)) as SceneInstance;
  newSceneInstance.name = name;
  newSceneInstance.description = description;
  return newSceneInstance;
}
