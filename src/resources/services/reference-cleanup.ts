import type { AttributeInstance, RoleInstance, SceneInstance, UUID } from "@gds";
import { globalObject } from "@/engine/global-definition";
import { attributesOf, referenceTarget } from "@/resources/util/scene-walk";
import { expressionUtility } from "./expression-utility";

/**
 * Keeps the open scenes in step with references the database has cleared.
 *
 * When an object is deleted, the database clears every reference to it in every scene
 * instance, table cells included, and their rows stay (`clear_attribute_reference()` in
 * init.sql). An open tab holds its own copy of the scene instance, so the same happens
 * here: otherwise the tab keeps showing the reference and writes it back on the next save.
 *
 * On the active tab the instance owning a cleared reference is redrawn, whether the
 * reference sat in the attribute itself or in a cell of its table: a vizRep that draws a
 * table reads it through the table attribute.
 */

function collectTargets(attribute: AttributeInstance, targets: Set<UUID>): void {
  const target = referenceTarget(attribute.role_instance_from);
  if (target) targets.add(target);
  for (const cell of attribute.table_attributes ?? []) collectTargets(cell, targets);
}

/** What the attribute instances of `scene` reference, table cells included. */
export function referencedTargets(scene: SceneInstance): Set<UUID> {
  const targets = new Set<UUID>();
  for (const attribute of attributesOf(scene)) collectTargets(attribute, targets);
  return targets;
}

/**
 * Clear the references to `deleted` held by `attribute` and by the cells of its table,
 * nested tables included.
 * @returns Whether anything was cleared: `attribute` itself or any cell of its table.
 */
function clearReferences(attribute: AttributeInstance, deleted: Set<UUID>): boolean {
  let cleared = false;
  // Every cell is visited: a `some` would stop at the first cleared one.
  for (const cell of attribute.table_attributes ?? []) {
    if (clearReferences(cell, deleted)) cleared = true;
  }

  const target = referenceTarget(attribute.role_instance_from);
  if (!target || !deleted.has(target)) return cleared;
  attribute.role_instance_from = null as unknown as RoleInstance;
  attribute.value = "";
  return true;
}

/**
 * Clear the references to `deleted` in every open tab.
 * @param deleted The uuids of everything the delete took with it, as the server lists them.
 */
export async function removeReferencesTo(deleted: Iterable<UUID>): Promise<void> {
  const deletedUuids = new Set(deleted);
  if (deletedUuids.size === 0) return;

  const activeScene = globalObject.tabContext[globalObject.selectedTab]?.sceneInstance;
  for (const { sceneInstance } of globalObject.tabContext) {
    if (!sceneInstance) continue;
    for (const attribute of attributesOf(sceneInstance)) {
      if (!clearReferences(attribute, deletedUuids)) continue;

      const owner = attribute.assigned_uuid_class_instance ?? attribute.assigned_uuid_port_instance;
      if (sceneInstance === activeScene && owner) {
        await expressionUtility.checkForVisualizationUpdateByAttributeUUID(owner, attribute.uuid_attribute);
      }
    }
  }
}

/**
 * A copy of a scene instance read before something it references was deleted is
 * corrected by the server when it is saved: the reference comes back cleared. Follow that
 * here, which is how another window or collaborator's tab catches up with a delete it
 * never saw.
 * @param sent What the saved copy referenced, read before it was sent.
 * @param saved The scene instance the server answered with.
 */
export async function removeReferencesDroppedBySave(sent: Set<UUID>, saved: SceneInstance): Promise<void> {
  const kept = referencedTargets(saved);
  await removeReferencesTo([...sent].filter((target) => !kept.has(target)));
}
