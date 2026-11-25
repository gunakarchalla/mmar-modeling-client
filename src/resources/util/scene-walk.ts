import type { AttributeInstance, RoleInstance, SceneInstance, UUID } from "@gds";

/**
 * Pure walks over a gds scene instance, shared by the services that need to find their
 * way around one without asking the engine.
 */

/**
 * What a role instance points at: a class, relation, port, scene or attribute instance.
 * A relation's roles name its two ends this way, and a reference attribute names its
 * target through the same kind of role.
 */
export function referenceTarget(role: RoleInstance | null | undefined): UUID | undefined {
  if (!role) return undefined;
  return (
    role.uuid_has_reference_class_instance ??
    role.uuid_has_reference_relationclass_instance ??
    role.uuid_has_reference_port_instance ??
    role.uuid_has_reference_scene_instance ??
    role.uuid_has_reference_attribute_instance ??
    undefined
  );
}

/**
 * Every attribute instance the scene, its classes, its relations and its ports own.
 * Table cells are not listed: a cell belongs to its table, which is listed.
 */
export function attributesOf(scene: SceneInstance): AttributeInstance[] {
  const classes = [...(scene.class_instances ?? []), ...(scene.relationclasses_instances ?? [])];
  const ports = [...(scene.port_instances ?? []), ...classes.flatMap((instance) => instance.port_instance ?? [])];
  return [
    ...(scene.attribute_instances ?? []),
    ...classes.flatMap((instance) => instance.attribute_instance ?? []),
    ...ports.flatMap((port) => port.attribute_instances ?? []),
  ];
}

/** Whether `scene` holds a class, relation or port instance with this uuid. */
export function sceneHolds(scene: SceneInstance, instanceUuid: UUID): boolean {
  const classes = [...(scene.class_instances ?? []), ...(scene.relationclasses_instances ?? [])];
  if (classes.some((instance) => instance.uuid === instanceUuid)) return true;
  const ports = [...(scene.port_instances ?? []), ...classes.flatMap((instance) => instance.port_instance ?? [])];
  return ports.some((port) => port.uuid === instanceUuid);
}

/**
 * The tables a table cell sits in, innermost first: its own table, then the table that
 * one is a cell of, and so on up to the table an instance owns. A cell records only the
 * table it belongs to (`table_attribute_reference`), never the instance that owns it, so
 * this is how a cell is traced back to its owner.
 *
 * @returns An empty list for an attribute that is not a cell, and undefined for a cell
 * whose table is not in `scene` (or whose tables loop, which the database forbids).
 */
export function enclosingTables(cell: AttributeInstance, scene: SceneInstance): AttributeInstance[] | undefined {
  if (!cell.table_attribute_reference) return [];

  const byUuid = new Map<UUID, AttributeInstance>();
  const index = (attributes: AttributeInstance[]) => {
    for (const attribute of attributes) {
      byUuid.set(attribute.uuid, attribute);
      index(attribute.table_attributes ?? []);
    }
  };
  index(attributesOf(scene));

  const tables: AttributeInstance[] = [];
  let tableUuid: UUID | undefined = cell.table_attribute_reference;
  while (tableUuid) {
    const table = byUuid.get(tableUuid);
    if (!table || tables.includes(table)) return undefined;
    tables.push(table);
    tableUuid = table.table_attribute_reference;
  }
  return tables;
}
