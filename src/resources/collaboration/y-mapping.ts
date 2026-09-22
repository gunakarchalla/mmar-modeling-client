import * as Y from "yjs";
import * as THREE from "three";
import { SceneInstance, ClassInstance, AttributeInstance, RelationclassInstance, RoleInstance } from "@gds";
import type { GlobalDefinition } from "@/engine/global-definition";
import { AXES, locallyDraggedAxes, rebaseDragBaseline } from "./drag-reconciler";

/**
 * The bidirectional mapping between gds instances and the shared Y.Doc: the `*ToYMap`
 * builders seed and extend the document from local state, and the `applyYDoc*` handlers
 * fold remote events back onto the SceneInstance and THREE scene.
 *
 * These are plain functions taking `GlobalDefinition` as a parameter, and the engine
 * import is type-only, which keeps this module out of the engine's runtime import graph.
 *
 * The `*FromYMap` helpers revive instances with real constructor calls
 * (`new ClassInstance(...)`), so `instanceof` holds for remotely-added instances.
 */

// ---------------------------------------------------------------------------
// Y.Doc shape
// ---------------------------------------------------------------------------
//
// A shared scene instance is encoded as a single Y.Doc with three top-level maps.
// This is the implicit schema every function below reads and writes — keep the
// *ToYMap / *FromYMap pairs and the apply* handlers in sync with it.
//
//   info                        Y.Map<string>
//     uuid, uuid_scene_type, name, description
//
//   attribute_instances         Y.Map<Y.Map>    keyed by AttributeInstance.uuid
//     the scene instance's own attributes (the scene type's, shown in the attribute
//     window while nothing is selected)
//     <uuid> → { uuid, uuid_attribute, name, value } : string
//
//   class_instances             Y.Map<Y.Map>    keyed by ClassInstance.uuid
//     <uuid> →
//       uuid, uuid_class, name, description : string
//       coordinates_2d          Y.Map<number>   { x, y, z }
//       rotation                string          JSON-encoded unit quaternion { x, y, z, w }
//       custom_variables        Y.Map<string>   values are JSON strings (incl. 'scale')
//       attribute_instance      Y.Map<Y.Map>    keyed by AttributeInstance.uuid
//         <uuid> → { uuid, uuid_attribute, name, value } : string
//
//   relationclasses_instances   Y.Map<Y.Map>    keyed by RelationclassInstance.uuid
//     <uuid> →
//       uuid, uuid_class, name, description : string
//       coordinates_2d          Y.Map<number>   { x, y, z }
//       rotation                string          JSON-encoded unit quaternion { x, y, z, w }
//       line_points             Y.Array<string> each element a JSON-encoded point
//       attribute_instance      Y.Map<Y.Map>    (same shape as above)
//       role_instance_from,
//       role_instance_to        string          JSON-encoded RoleInstance (for delete cascades)
//
// Encoding: nested values without their own CRDT semantics (rotation, custom_variables
// entries, line_points, role instances) are stored as JSON strings rather than nested Y
// types. They are replaced wholesale on change, never merged field-by-field.
//
// Position is decomposed into three keys, and each write must be minimal. A Y.Map merges
// per key, so x, y and z resolve independently and two users dragging the same object
// along different axes each keep their own axis. That only holds while each peer writes
// just the axes it moved: a peer that also rewrites its stale values for the other two
// makes every key concurrent, and per-key resolution then hands all three to one winner,
// which is indistinguishable from whole-position last-writer-wins. Same-axis contention
// still resolves to a single deterministic winner — no CRDT can merge two absolute
// values for one scalar.
//
// Rotation is NOT decomposed, for the opposite reason. Every (x, y, z) triple is a valid
// position, but a component-wise blend of two unit quaternions is not itself unit-length,
// and THREE's `quaternion.set` does not normalize, so a mixed value reaches the object's
// matrix and shears the mesh instead of rotating it. One key makes the merge atomic:
// whichever peer wins, it wins with the whole rotation it authored.
//
// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A rotation, structurally identical to the gds `Quaternion` class. Declared locally
 * because that one is a decorated class and this module only needs the four numbers.
 */
type Quaternion = { x: number; y: number; z: number; w: number };

export type LocalChangeType =
  // The axes are optional on purpose: each is its own Y.Map key, so a delta carrying
  // only the axes that moved lets a peer's concurrent drag along a different axis
  // survive the merge. Publishing all three would collapse it into whole-position
  // last-writer-wins.
  | { type: "coordinates"; classInstanceUuid: string; x?: number; y?: number; z?: number }
  | { type: "rotation"; classInstanceUuid: string; x: number; y: number; z: number; w: number }
  | { type: "scale"; classInstanceUuid: string; x: number; y: number; z: number }
  | { type: "custom_variable"; classInstanceUuid: string; key: string; value: unknown }
  | { type: "attribute_value"; classInstanceUuid: string; attributeUuid: string; value: string }
  | { type: "add_class_instance"; classInstance: ClassInstance }
  | { type: "remove_class_instance"; classInstanceUuid: string }
  | { type: "add_relation_class_instance"; relationClassInstance: RelationclassInstance }
  | { type: "remove_relation_class_instance"; relationClassInstanceUuid: string }
  | { type: "relation_attribute_value"; relationClassInstanceUuid: string; attributeUuid: string; value: string }
  // The scene instance's own attributes: no owning instance uuid, because the scene is
  // the owner and a Y.Doc holds exactly one scene.
  | { type: "scene_attribute_value"; attributeUuid: string; value: string }
  | { type: "add_scene_attribute_instances"; attributeInstances: AttributeInstance[] };

/** Carries side-effect metadata back to the observer in SharedDocService. */
export interface YDocChangeResult {
  classInstanceAdded: boolean;
  relationInstanceAdded: boolean;
  changedAttributeInstances: AttributeInstance[];
  /**
   * UUIDs of the class / relationclass instances a peer deleted. The observer needs them
   * because the local selection may point at one: nothing in this module knows about the
   * selection, and a deleted instance that stays selected leaves the attribute window
   * showing an object that is no longer in the scene.
   */
  deletedInstanceUuids: string[];
}

// ---------------------------------------------------------------------------
// Populate Y.Doc from a freshly loaded SceneInstance
// ---------------------------------------------------------------------------

export function sceneInstanceToYDoc(sceneInstance: SceneInstance, ydoc: Y.Doc, origin?: object): void {
  ydoc.transact(() => {
    // info
    const info = ydoc.getMap<string>("info");
    info.set("uuid", sceneInstance.uuid ?? "");
    info.set("uuid_scene_type", sceneInstance.uuid_scene_type ?? "");
    info.set("name", sceneInstance.name ?? "");
    info.set("description", sceneInstance.description ?? "");

    // class_instances
    const classInstances = ydoc.getMap<Y.Map<unknown>>("class_instances");
    for (const ci of sceneInstance.class_instances ?? []) {
      classInstances.set(ci.uuid, classInstanceToYMap(ci));
    }

    // relationclasses_instances
    const relInstances = ydoc.getMap<Y.Map<unknown>>("relationclasses_instances");
    for (const ri of sceneInstance.relationclasses_instances ?? []) {
      relInstances.set(ri.uuid, relationClassInstanceToYMap(ri));
    }

    // the scene instance's own attributes
    const sceneAttributes = ydoc.getMap<Y.Map<unknown>>("attribute_instances");
    for (const ai of sceneInstance.attribute_instances ?? []) {
      sceneAttributes.set(ai.uuid, attrInstanceToYMap(ai));
    }
  }, origin);
}

// ---------------------------------------------------------------------------
// Write a single local delta to the Y.Doc (local origin prevents observer echo)
// ---------------------------------------------------------------------------

export function applyLocalChangeToYDoc(ydoc: Y.Doc, change: LocalChangeType, origin: object): void {
  ydoc.transact(() => {
    const classInstances = ydoc.getMap<Y.Map<unknown>>("class_instances");

    switch (change.type) {
      case "coordinates": {
        const ciMap = classInstances.get(change.classInstanceUuid);
        if (!ciMap) break;
        const coordMap = ciMap.get("coordinates_2d") as Y.Map<number>;
        if (!coordMap) break;
        // Only the axes the delta carries. An axis left out is one this peer did not
        // move, and not writing it is what lets a concurrent drag along it survive.
        for (const axis of AXES) {
          const value = change[axis];
          if (value !== undefined) coordMap.set(axis, value);
        }
        break;
      }
      case "rotation": {
        const ciMap = classInstances.get(change.classInstanceUuid);
        if (!ciMap) break;
        // One key write, so a concurrent rotation merges as a whole quaternion rather
        // than component-by-component (see the encoding note above).
        ciMap.set("rotation", rotationToJson(change));
        break;
      }
      case "scale": {
        const ciMap = classInstances.get(change.classInstanceUuid);
        if (!ciMap) break;
        const cvMap = ciMap.get("custom_variables") as Y.Map<string>;
        if (!cvMap) break;
        // custom_variables values are stored as JSON strings (see customVariablesToYMap).
        cvMap.set("scale", JSON.stringify({ x: change.x, y: change.y, z: change.z }));
        break;
      }
      case "custom_variable": {
        const ciMap = classInstances.get(change.classInstanceUuid);
        if (!ciMap) break;
        const cvMap = ciMap.get("custom_variables") as Y.Map<string>;
        if (!cvMap) break;
        // custom_variables values are stored as JSON strings (see customVariablesToYMap).
        // `value` is the full descriptor, e.g. { value, instance_adaptable, user_locked }.
        cvMap.set(change.key, JSON.stringify(change.value));
        break;
      }
      case "attribute_value": {
        const ciMap = classInstances.get(change.classInstanceUuid);
        if (!ciMap) break;
        const attrMap = ciMap.get("attribute_instance") as Y.Map<Y.Map<unknown>>;
        if (!attrMap) break;
        const attrEntry = attrMap.get(change.attributeUuid);
        if (!attrEntry) break;
        attrEntry.set("value", change.value);
        break;
      }
      case "add_class_instance": {
        const ci = change.classInstance;
        classInstances.set(ci.uuid, classInstanceToYMap(ci));
        break;
      }
      case "remove_class_instance": {
        classInstances.delete(change.classInstanceUuid);
        break;
      }

      // ------------------------------------------------------------------
      // RelationclassInstance mutations
      // ------------------------------------------------------------------
      case "add_relation_class_instance": {
        const ri = change.relationClassInstance;
        const relInstances = ydoc.getMap<Y.Map<unknown>>("relationclasses_instances");
        relInstances.set(ri.uuid, relationClassInstanceToYMap(ri));
        break;
      }
      case "remove_relation_class_instance": {
        const relInstances = ydoc.getMap<Y.Map<unknown>>("relationclasses_instances");
        relInstances.delete(change.relationClassInstanceUuid);
        break;
      }
      case "relation_attribute_value": {
        const relInstances = ydoc.getMap<Y.Map<unknown>>("relationclasses_instances");
        const riMap = relInstances.get(change.relationClassInstanceUuid);
        if (!riMap) break;
        const attrMap = riMap.get("attribute_instance") as Y.Map<Y.Map<unknown>>;
        if (!attrMap) break;
        const attrEntry = attrMap.get(change.attributeUuid);
        if (!attrEntry) break;
        attrEntry.set("value", change.value);
        break;
      }

      // ------------------------------------------------------------------
      // The scene instance's own attributes
      // ------------------------------------------------------------------
      case "scene_attribute_value": {
        const sceneAttributes = ydoc.getMap<Y.Map<unknown>>("attribute_instances");
        const attrEntry = sceneAttributes.get(change.attributeUuid) as Y.Map<unknown> | undefined;
        if (!attrEntry) break;
        attrEntry.set("value", change.value);
        break;
      }
      case "add_scene_attribute_instances": {
        const sceneAttributes = ydoc.getMap<Y.Map<unknown>>("attribute_instances");
        for (const ai of change.attributeInstances) {
          if (sceneAttributes.has(ai.uuid)) continue;
          sceneAttributes.set(ai.uuid, attrInstanceToYMap(ai));
        }
        break;
      }
    }
  }, origin);
}

// ---------------------------------------------------------------------------
// Apply a class-instance Yjs deep event to the in-memory SceneInstance and Three.js
// scene. Called only for remote-origin events; the SharedDocService observer skips
// local-origin ones, whose in-memory model was already updated at the mutation site.
// ---------------------------------------------------------------------------

export function applyYDocClassChangeToSceneInstance(
  event: Y.YEvent<Y.Map<unknown>>,
  sceneInstance: SceneInstance,
  threeScene: THREE.Scene,
  globalObjectInstance: GlobalDefinition,
): YDocChangeResult {
  const result: YDocChangeResult = { classInstanceAdded: false, relationInstanceAdded: false, changedAttributeInstances: [], deletedInstanceUuids: [] };
  const path = event.path as Array<string | number>;

  // Path is relative to the 'class_instances' Y.Map (the observeDeep root).
  if (path.length === 0) {
    (event as Y.YMapEvent<Y.Map<unknown>>).changes.keys.forEach((change, uuid) => {
      if (change.action === "delete") {
        // Reported back so the observer can drop a selection that pointed here.
        result.deletedInstanceUuids.push(uuid);
        const idx = sceneInstance.class_instances.findIndex((c) => c.uuid === uuid);
        if (idx !== -1) sceneInstance.class_instances.splice(idx, 1);
        const obj = threeScene.getObjectByProperty("uuid", uuid);
        if (obj) threeScene.remove(obj);
        const tabCtx = globalObjectInstance.tabContext[globalObjectInstance.selectedTab];
        if (tabCtx) {
          tabCtx.contextDragObjects = tabCtx.contextDragObjects.filter((o) => o.uuid !== uuid);
        }
        globalObjectInstance.dragObjects = globalObjectInstance.dragObjects.filter((o) => o.uuid !== uuid);
      } else if (change.action === "add") {
        const classInstancesMap = event.target as Y.Map<Y.Map<unknown>>;
        const newInstanceMap = classInstancesMap.get(uuid);
        if (newInstanceMap && !sceneInstance.class_instances.find((c) => c.uuid === uuid)) {
          const newCi = classInstanceFromYMap(newInstanceMap);
          sceneInstance.class_instances.push(newCi);
          // Register the new attribute instances in the global flat list
          for (const ai of newCi.attribute_instance) {
            if (!globalObjectInstance.attribute_instances.find((a) => a.uuid === ai.uuid)) {
              globalObjectInstance.attribute_instances.push(ai);
            }
          }
          result.classInstanceAdded = true;
        }
      }
    });
    return result;
  }

  const classInstanceUuid = path[0] as string;
  const changedField = path[1] as string | undefined;

  // coordinates_2d nested Y.Map changed
  if (changedField === "coordinates_2d") {
    const coordMap = event.target as Y.Map<number>;
    const ci = sceneInstance.class_instances.find((c) => c.uuid === classInstanceUuid);
    if (ci && ci.coordinates_2d) {
      // getObjectByProperty stops at the first match, unlike traverse, which would walk
      // the whole scene on every drag frame.
      const obj = threeScene.getObjectByProperty("uuid", classInstanceUuid);
      // Empty unless the local user is dragging this object right now.
      const draggedAxes = locallyDraggedAxes(globalObjectInstance.transformControls, classInstanceUuid);

      for (const axis of AXES) {
        if (!coordMap.has(axis)) continue;
        const value = coordMap.get(axis)!;
        // The gds instance always follows the merged document, even on an axis the local
        // pointer owns: that mismatch against the mesh is what makes the animator's
        // coordinates pass republish our value and win the axis back.
        ci.coordinates_2d[axis] = value;
        if (draggedAxes.has(axis)) continue;
        if (obj) obj.position[axis] = value;
        // Without this the next pointer-move would restore the pre-drag value.
        rebaseDragBaseline(globalObjectInstance.transformControls, classInstanceUuid, axis, value);
      }
    }
    return result;
  }

  // Rotation is a single JSON-encoded key on the class-instance map, not a nested
  // Y.Map, so the event lands at path [uuid] with `rotation` among the changed keys.
  if (path.length === 1) {
    if (!(event as Y.YMapEvent<unknown>).changes.keys.has("rotation")) return result;
    const ci = sceneInstance.class_instances.find((c) => c.uuid === classInstanceUuid);
    if (!ci) return result;
    ci.rotation = rotationFromJson((event.target as Y.Map<unknown>).get("rotation") as string | undefined);
    const obj = threeScene.getObjectByProperty("uuid", classInstanceUuid);
    if (obj) {
      (obj as THREE.Mesh).quaternion.set(ci.rotation.x, ci.rotation.y, ci.rotation.z, ci.rotation.w);
    }
    return result;
  }

  // custom_variables nested Y.Map changed. 'scale' drives the object's own scale;
  // the label-positioning keys (x/y/z offsets, rx/ry/rz/rw) drive the attached text labels.
  if (changedField === "custom_variables") {
    const cvMap = event.target as Y.Map<string>;
    const ci = sceneInstance.class_instances.find((c) => c.uuid === classInstanceUuid);
    if (!ci) return result;
    ci.custom_variables = ci.custom_variables ?? {};
    const threeObj = threeScene.getObjectByProperty("uuid", classInstanceUuid);
    (event as Y.YMapEvent<string>).changes.keys.forEach((change, key) => {
      if (change.action === "delete") {
        delete (ci.custom_variables as Record<string, unknown>)[key];
        return;
      }
      const parsed = parseCustomVariable(cvMap.get(key));
      if (parsed === undefined) return;
      (ci.custom_variables as Record<string, unknown>)[key] = parsed;
      if (key === "scale") {
        const scale = parseScale(cvMap.get(key));
        if (scale && threeObj) applyScaleToThreeObject(threeObj, scale);
      } else if (threeObj) {
        applyCustomVariableToLabels(threeObj, key, parsed);
      }
    });
    return result;
  }

  // attribute_instance Y.Map: a specific attribute entry changed
  if (path.length >= 3 && changedField === "attribute_instance") {
    const attrUuid = path[2] as string;
    const ci = sceneInstance.class_instances.find((c) => c.uuid === classInstanceUuid);
    if (!ci) return result;
    const attrInst = ci.attribute_instance.find((a) => a.uuid === attrUuid);
    if (!attrInst) return result;
    const attrMap = event.target as Y.Map<unknown>;
    if (attrMap.has("value")) {
      attrInst.value = attrMap.get("value") as string;
      // Reported back so the caller can trigger a VizRep update for this attribute.
      result.changedAttributeInstances.push(attrInst);
    }
    return result;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Apply a Yjs deep event from 'relationclasses_instances' to the in-memory
// SceneInstance. Called only for remote-origin events.
// ---------------------------------------------------------------------------

export function applyYDocRelationChangeToSceneInstance(
  event: Y.YEvent<Y.Map<unknown>>,
  sceneInstance: SceneInstance,
  threeScene: THREE.Scene,
  globalObjectInstance: GlobalDefinition,
): YDocChangeResult {
  const result: YDocChangeResult = { classInstanceAdded: false, relationInstanceAdded: false, changedAttributeInstances: [], deletedInstanceUuids: [] };
  const path = event.path as Array<string | number>;

  // Top-level add / delete of an entire RelationclassInstance entry
  if (path.length === 0) {
    (event as Y.YMapEvent<Y.Map<unknown>>).changes.keys.forEach((change, uuid) => {
      if (change.action === "delete") {
        // Reported back so the observer can drop a selection that pointed here.
        result.deletedInstanceUuids.push(uuid);
        const idx = sceneInstance.relationclasses_instances.findIndex((r) => r.uuid === uuid);
        if (idx !== -1) sceneInstance.relationclasses_instances.splice(idx, 1);
        const obj = threeScene.getObjectByProperty("uuid", uuid);
        if (obj) threeScene.remove(obj);
        globalObjectInstance.dragObjects = globalObjectInstance.dragObjects.filter((o) => o.uuid !== uuid);
        globalObjectInstance.role_instances = globalObjectInstance.role_instances.filter((r) => r.uuid_relationclass !== uuid);
      } else if (change.action === "add") {
        const relMap = event.target as Y.Map<Y.Map<unknown>>;
        const newInstanceMap = relMap.get(uuid);
        if (newInstanceMap && !sceneInstance.relationclasses_instances.find((r) => r.uuid === uuid)) {
          const newRi = relationClassInstanceFromYMap(newInstanceMap);
          sceneInstance.relationclasses_instances.push(newRi);
          // Register attribute and role instances in the global flat lists.
          for (const ai of newRi.attribute_instance) {
            if (!globalObjectInstance.attribute_instances.find((a) => a.uuid === ai.uuid)) {
              globalObjectInstance.attribute_instances.push(ai);
            }
          }
          if (newRi.role_instance_from && !globalObjectInstance.role_instances.find((r) => r.uuid === newRi.role_instance_from.uuid)) {
            globalObjectInstance.role_instances.push(newRi.role_instance_from);
          }
          if (newRi.role_instance_to && !globalObjectInstance.role_instances.find((r) => r.uuid === newRi.role_instance_to.uuid)) {
            globalObjectInstance.role_instances.push(newRi.role_instance_to);
          }
          result.relationInstanceAdded = true;
        }
      }
    });
    return result;
  }

  const relationClassInstanceUuid = path[0] as string;
  const changedField = path[1] as string | undefined;

  // attribute_instance nested Y.Map: a specific attribute entry value changed
  if (path.length >= 3 && changedField === "attribute_instance") {
    const attrUuid = path[2] as string;
    const ri = sceneInstance.relationclasses_instances.find((r) => r.uuid === relationClassInstanceUuid);
    if (!ri) return result;
    const attrInst = (ri.attribute_instance ?? []).find((a) => a.uuid === attrUuid);
    if (!attrInst) return result;
    const attrMap = event.target as Y.Map<unknown>;
    if (attrMap.has("value")) {
      attrInst.value = attrMap.get("value") as string;
      result.changedAttributeInstances.push(attrInst);
    }
    return result;
  }

  // line_points Y.Array changed
  if (changedField === "line_points") {
    const ri = sceneInstance.relationclasses_instances.find((r) => r.uuid === relationClassInstanceUuid);
    if (!ri) return result;
    const lpArray = event.target as unknown as Y.Array<string>;
    ri.line_points = lpArray.toArray().map((s) => JSON.parse(s));
    return result;
  }

  // coordinates_2d nested Y.Map changed
  if (changedField === "coordinates_2d") {
    const coordMap = event.target as Y.Map<number>;
    const ri = sceneInstance.relationclasses_instances.find((r) => r.uuid === relationClassInstanceUuid);
    if (ri && ri.coordinates_2d) {
      if (coordMap.has("x")) ri.coordinates_2d.x = coordMap.get("x")!;
      if (coordMap.has("y")) ri.coordinates_2d.y = coordMap.get("y")!;
      if (coordMap.has("z")) ri.coordinates_2d.z = coordMap.get("z")!;
    }
    return result;
  }

  return result;
}

/**
 * Apply a Yjs deep event from the top-level 'attribute_instances' map — the scene
 * instance's own attributes — to the in-memory SceneInstance. Called only for
 * remote-origin events.
 *
 * Two shapes, mirroring the class and relation observers: a root-level add/delete of a
 * whole attribute entry (a peer instantiated the scene type's attributes for a scene
 * that had none — see instance-creation-handler.createMissingSceneAttributeInstances),
 * and a nested `value` change (a peer edited the field).
 */
export function applyYDocSceneAttributeChangeToSceneInstance(
  event: Y.YEvent<Y.Map<unknown>>,
  sceneInstance: SceneInstance,
  globalObjectInstance: GlobalDefinition,
): YDocChangeResult {
  const result: YDocChangeResult = { classInstanceAdded: false, relationInstanceAdded: false, changedAttributeInstances: [], deletedInstanceUuids: [] };
  const path = event.path as Array<string | number>;
  sceneInstance.attribute_instances = sceneInstance.attribute_instances ?? [];

  if (path.length === 0) {
    (event as Y.YMapEvent<Y.Map<unknown>>).changes.keys.forEach((change, uuid) => {
      if (change.action === "delete") {
        const index = sceneInstance.attribute_instances.findIndex((ai) => ai.uuid === uuid);
        if (index !== -1) sceneInstance.attribute_instances.splice(index, 1);
        globalObjectInstance.attribute_instances = globalObjectInstance.attribute_instances.filter(
          (ai) => ai.uuid !== uuid,
        );
        return;
      }
      if (change.action !== "add") return;
      const attrMap = (event.target as Y.Map<Y.Map<unknown>>).get(uuid);
      if (!attrMap) return;
      if (sceneInstance.attribute_instances.some((ai) => ai.uuid === uuid)) return;
      const attributeInstance = sceneAttrInstanceFromYMap(attrMap, sceneInstance.uuid);
      sceneInstance.attribute_instances.push(attributeInstance);
      // Register it in the flat list the vizrep pipeline and the undo history look in.
      if (!globalObjectInstance.attribute_instances.find((ai) => ai.uuid === attributeInstance.uuid)) {
        globalObjectInstance.attribute_instances.push(attributeInstance);
      }
      result.changedAttributeInstances.push(attributeInstance);
    });
    return result;
  }

  // A single attribute entry changed (path is [attributeUuid]).
  const attributeUuid = path[0] as string;
  const attributeInstance = sceneInstance.attribute_instances.find((ai) => ai.uuid === attributeUuid);
  if (!attributeInstance) return result;
  const attrMap = event.target as Y.Map<unknown>;
  if (attrMap.has("value")) {
    attributeInstance.value = attrMap.get("value") as string;
    result.changedAttributeInstances.push(attributeInstance);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse a JSON-encoded custom_variable descriptor, returning undefined on malformed input. */
function parseCustomVariable(raw: string | undefined): unknown {
  if (raw === undefined) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/**
 * Mirror a remotely-changed custom variable onto the text labels attached to a
 * class-instance object. Labels carry their own copy of the positioning variables
 * in userData.custom_variables (see GraphicContext.graphic_text / attachText); we
 * update the matching entry and recompute the label transform.
 */
function applyCustomVariableToLabels(parentObject: THREE.Object3D, key: string, parsed: unknown): void {
  const labels = parentObject.userData?.Label;
  if (!Array.isArray(labels)) return;
  if (!parsed || typeof parsed !== "object" || !("value" in (parsed as Record<string, unknown>))) return;
  const descriptor = parsed as { value: unknown; user_locked?: boolean };
  for (const label of labels as THREE.Object3D[]) {
    const cv = label.userData?.custom_variables as Record<string, { value: unknown; user_locked?: boolean }> | undefined;
    if (!cv || !cv[key]) continue;
    cv[key].value = descriptor.value;
    if ("user_locked" in descriptor) cv[key].user_locked = descriptor.user_locked;
    repositionLabelFromCustomVariables(label);
  }
}

/**
 * Recompute a label's position/rotation from its custom_variables, mirroring the
 * heuristic in GraphicContext.attachText: position keys contain "rel" + axis, and
 * rotation is held in rx/ry/rz/rw.
 */
function repositionLabelFromCustomVariables(label: THREE.Object3D): void {
  const cv = label.userData?.custom_variables as Record<string, { value: number }> | undefined;
  if (!cv) return;
  const keys = Object.keys(cv);
  const relX = keys.find((k) => k.includes("rel") && k.includes("x"));
  const relY = keys.find((k) => k.includes("rel") && k.includes("y"));
  const relZ = keys.find((k) => k.includes("rel") && k.includes("z"));
  if (relX) label.position.x = cv[relX].value;
  if (relY) label.position.y = cv[relY].value;
  if (relZ) label.position.z = cv[relZ].value;
  if (cv.rx && cv.ry && cv.rz && cv.rw) {
    (label as THREE.Mesh).quaternion.set(cv.rx.value, cv.ry.value, cv.rz.value, cv.rw.value);
  }
}

/** Parse a JSON-encoded {x,y,z} scale value, returning null on any malformed input. */
function parseScale(raw: string | undefined): { x: number; y: number; z: number } | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw);
    if (s && typeof s.x === "number" && typeof s.y === "number" && typeof s.z === "number") {
      return { x: s.x, y: s.y, z: s.z };
    }
  } catch {
    /* ignore malformed JSON */
  }
  return null;
}

/**
 * Apply a scale to a Three.js object and inverse-scale its children so they keep
 * their absolute size. Mirrors the local scale behaviour in
 * TransformControlsEvents.onTransformControlsMouseUp (mode === 'scale').
 */
function applyScaleToThreeObject(object: THREE.Object3D, scale: { x: number; y: number; z: number }): void {
  object.scale.set(scale.x, scale.y, scale.z);
  object.traverse((child: THREE.Object3D) => {
    if (child === object) return;
    const cv = child.userData?.custom_variables;
    if (!cv || !("scale" in cv)) {
      const inverse = new THREE.Vector3(1, 1, 1).divide(object.scale);
      child.scale.set(inverse.x, inverse.y, inverse.z);
    } else {
      const childScale = cv["scale"] as THREE.Vector3;
      child.scale.set(childScale.x, childScale.y, childScale.z);
    }
  });
}

function classInstanceToYMap(ci: ClassInstance): Y.Map<unknown> {
  const m = new Y.Map<unknown>();
  m.set("uuid", ci.uuid ?? "");
  m.set("uuid_class", ci.uuid_class ?? "");
  m.set("name", ci.name ?? "");
  m.set("description", ci.description ?? "");
  m.set("coordinates_2d", coordsToYMap(ci.coordinates_2d));
  m.set("rotation", rotationToJson(ci.rotation));
  m.set("custom_variables", customVariablesToYMap(ci.custom_variables as Record<string, unknown> | undefined));
  m.set("attribute_instance", attrInstancesToYMap(ci.attribute_instance ?? []));
  return m;
}

function classInstanceFromYMap(yMap: Y.Map<unknown>): ClassInstance {
  const ci = new ClassInstance(yMap.get("uuid") as string, yMap.get("uuid_class") as string);
  ci.name = (yMap.get("name") as string) ?? "";
  ci.description = (yMap.get("description") as string) ?? "";
  const coordMap = yMap.get("coordinates_2d") as Y.Map<number>;
  ci.coordinates_2d = {
    x: coordMap?.get("x") ?? 0,
    y: coordMap?.get("y") ?? 0,
    z: coordMap?.get("z") ?? 0,
  };
  ci.rotation = rotationFromJson(yMap.get("rotation") as string | undefined);
  ci.port_instance = [];
  // custom_variables are stored as a Y.Map of JSON strings (see customVariablesToYMap).
  const cvMap = yMap.get("custom_variables") as Y.Map<string>;
  ci.custom_variables = {};
  if (cvMap) {
    cvMap.forEach((value, key) => {
      try {
        (ci.custom_variables as Record<string, unknown>)[key] = JSON.parse(value);
      } catch {
        (ci.custom_variables as Record<string, unknown>)[key] = value;
      }
    });
  }
  ci.attribute_instance = attrInstancesFromYMap(yMap.get("attribute_instance") as Y.Map<Y.Map<unknown>>, ci.uuid);
  return ci;
}

function relationClassInstanceToYMap(ri: RelationclassInstance): Y.Map<unknown> {
  const m = new Y.Map<unknown>();
  m.set("uuid", ri.uuid ?? "");
  m.set("uuid_class", ri.uuid_class ?? "");
  m.set("name", ri.name ?? "");
  m.set("description", ri.description ?? "");
  m.set("coordinates_2d", coordsToYMap(ri.coordinates_2d));
  m.set("rotation", rotationToJson(ri.rotation));
  const linePoints = new Y.Array<string>();
  for (const lp of ri.line_points ?? []) {
    linePoints.push([JSON.stringify(lp)]);
  }
  m.set("line_points", linePoints);
  m.set("attribute_instance", attrInstancesToYMap(ri.attribute_instance ?? []));
  // Role instances travel along so remote clients can reconstruct deletion dependencies.
  if (ri.role_instance_from) {
    m.set("role_instance_from", JSON.stringify(ri.role_instance_from));
  }
  if (ri.role_instance_to) {
    m.set("role_instance_to", JSON.stringify(ri.role_instance_to));
  }
  return m;
}

function relationClassInstanceFromYMap(yMap: Y.Map<unknown>): RelationclassInstance {
  // The gds constructor types role_from/role_to as required, but they are restored from
  // the JSON-encoded copies further down, so `undefined` is passed here and the cast
  // satisfies strict TS.
  const ri = new RelationclassInstance(
    yMap.get("uuid") as string,
    yMap.get("uuid_class") as string,
    undefined as unknown as RoleInstance,
    undefined as unknown as RoleInstance,
  );
  ri.name = (yMap.get("name") as string) ?? "";
  ri.description = (yMap.get("description") as string) ?? "";
  const coordMap = yMap.get("coordinates_2d") as Y.Map<number>;
  ri.coordinates_2d = {
    x: coordMap?.get("x") ?? 0,
    y: coordMap?.get("y") ?? 0,
    z: coordMap?.get("z") ?? 0,
  };
  const lpArray = yMap.get("line_points") as unknown as Y.Array<string>;
  ri.line_points = lpArray ? lpArray.toArray().map((s) => JSON.parse(s)) : [];
  ri.attribute_instance = attrInstancesFromYMap(yMap.get("attribute_instance") as Y.Map<Y.Map<unknown>>, ri.uuid);
  const roleFromJson = yMap.get("role_instance_from") as string | undefined;
  if (roleFromJson) {
    try {
      ri.role_instance_from = JSON.parse(roleFromJson) as RoleInstance;
    } catch {
      /* ignore */
    }
  }
  const roleToJson = yMap.get("role_instance_to") as string | undefined;
  if (roleToJson) {
    try {
      ri.role_instance_to = JSON.parse(roleToJson) as RoleInstance;
    } catch {
      /* ignore */
    }
  }
  return ri;
}

function coordsToYMap(coords: { x: number; y: number; z: number } | undefined): Y.Map<number> {
  const m = new Y.Map<number>();
  m.set("x", coords?.x ?? 0);
  m.set("y", coords?.y ?? 0);
  m.set("z", coords?.z ?? 0);
  return m;
}

/** The rotation of an instance that has none, and the fallback for anything unusable. */
const IDENTITY_ROTATION: Quaternion = { x: 0, y: 0, z: 0, w: 1 };

/**
 * Coerce a quaternion to unit length. Only a unit quaternion is a rotation: THREE
 * composes `quaternion` straight into the object's matrix without normalizing, so a
 * non-unit one scales and shears the mesh rather than turning it.
 *
 * Callers pass `object3D.quaternion`, which THREE already keeps normalized, so this is a
 * no-op on the live path; it exists to stop a value that is not a rotation from reaching
 * the doc and every peer. A zero-length quaternion has no direction to preserve, so it
 * degrades to identity.
 */
function normalizeQuaternion(rot: Partial<Quaternion> | undefined): Quaternion {
  const x = rot?.x, y = rot?.y, z = rot?.z, w = rot?.w;
  if (![x, y, z, w].every((n) => typeof n === "number" && Number.isFinite(n))) return { ...IDENTITY_ROTATION };
  const length = Math.hypot(x!, y!, z!, w!);
  if (length === 0) return { ...IDENTITY_ROTATION };
  return { x: x! / length, y: y! / length, z: z! / length, w: w! / length };
}

/**
 * Encode a quaternion as the single atomic value the doc stores under `rotation`.
 * Normalizing here keeps the document canonical: every rotation in it is a real
 * rotation, whatever the caller passed.
 */
function rotationToJson(rot: Partial<Quaternion> | undefined): string {
  return JSON.stringify(normalizeQuaternion(rot));
}

/**
 * Decode the `rotation` value written by `rotationToJson`. Malformed JSON, a missing
 * field or a non-finite component all fall back to identity rather than propagating a
 * value that would corrupt the object's matrix.
 */
function rotationFromJson(raw: string | undefined): Quaternion {
  if (typeof raw !== "string") return { ...IDENTITY_ROTATION };
  try {
    const parsed = JSON.parse(raw) as Partial<Quaternion> | null;
    return normalizeQuaternion(parsed ?? undefined);
  } catch {
    return { ...IDENTITY_ROTATION };
  }
}

function customVariablesToYMap(vars: Record<string, unknown> | undefined): Y.Map<string> {
  const m = new Y.Map<string>();
  if (!vars) return m;
  for (const [k, v] of Object.entries(vars)) {
    m.set(k, JSON.stringify(v));
  }
  return m;
}

function attrInstanceToYMap(attr: AttributeInstance): Y.Map<unknown> {
  const am = new Y.Map<unknown>();
  am.set("uuid", attr.uuid ?? "");
  am.set("uuid_attribute", attr.uuid_attribute ?? "");
  am.set("name", attr.name ?? "");
  am.set("value", attr.value ?? "");
  return am;
}

function attrInstancesToYMap(attrs: AttributeInstance[]): Y.Map<Y.Map<unknown>> {
  const m = new Y.Map<Y.Map<unknown>>();
  for (const attr of attrs) {
    m.set(attr.uuid, attrInstanceToYMap(attr));
  }
  return m;
}

/**
 * Reconstruct one AttributeInstance owned by the scene instance itself: same encoding as
 * the class and relationclass entries, but the parent uuid goes in the scene slot, which
 * is what the attribute window and the vizrep checker resolve it through.
 */
function sceneAttrInstanceFromYMap(attrEntry: Y.Map<unknown>, sceneUuid: string): AttributeInstance {
  const ai = new AttributeInstance(
    attrEntry.get("uuid") as string,
    attrEntry.get("uuid_attribute") as string,
    sceneUuid,
    null as unknown as string,
    (attrEntry.get("value") as string) ?? "",
  );
  ai.name = (attrEntry.get("name") as string) ?? "";
  return ai;
}

/**
 * Reconstruct AttributeInstances from the nested `attribute_instance` Y.Map
 * (inverse of attrInstancesToYMap). `parentUuid` is the owning class- or
 * relationclass-instance uuid recorded on each AttributeInstance.
 */
function attrInstancesFromYMap(attrMap: Y.Map<Y.Map<unknown>> | undefined, parentUuid: string): AttributeInstance[] {
  const attrs: AttributeInstance[] = [];
  if (!attrMap) return attrs;
  attrMap.forEach((attrEntry) => {
    const ai = new AttributeInstance(
      attrEntry.get("uuid") as string,
      attrEntry.get("uuid_attribute") as string,
      // assigned_uuid_scene_instance: null, though gds types it UUID.
      null as unknown as string,
      parentUuid,
      (attrEntry.get("value") as string) ?? "",
    );
    ai.name = (attrEntry.get("name") as string) ?? "";
    attrs.push(ai);
  });
  return attrs;
}
