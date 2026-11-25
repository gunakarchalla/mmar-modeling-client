import type { SceneInstance } from "@gds";

/**
 * Pure snapshot/diff helpers behind the undo-redo history (`history-service.ts`).
 *
 * WHY A DIFF AND NOT A WHOLE-SCENE RESTORE. A tab may
 * be a live collaborative session: peers mutate the SAME SceneInstance while it sits in
 * our history. Restoring a past snapshot wholesale would therefore revert THEIR edits
 * too. So an undo step is applied as a *scoped* diff — only the instances the recorded
 * action itself touched are moved back, everything else in the live scene is left
 * exactly as it is. That is what makes "the history holds only local changes" true even
 * though the snapshots are of the whole scene.
 *
 * This module is deliberately dependency-free (plain JSON in, plain JSON out) so the
 * diff rules are unit-testable without the three.js engine or a Y.Doc. `history-service`
 * owns everything with a side effect: rendering, persistence and the Yjs broadcast.
 */

/** A snapshot is the plain-JSON form of a SceneInstance (what `cloneScene` produces). */
export type Json = Record<string, unknown>;

export interface SceneSnapshot extends Json {
  uuid?: string;
  name?: string;
  description?: string;
  class_instances?: Json[];
  relationclasses_instances?: Json[];
  /** The scene instance's OWN attributes (the scene type's), edited in the attribute window. */
  attribute_instances?: Json[];
}

export type InstanceKind = "class" | "relation";

/** An instance that exists on both sides but differs. `target` is its wanted JSON. */
export interface InstanceChange {
  uuid: string;
  kind: InstanceKind;
  target: Json;
  /** Set when `coordinates_2d` differs — broadcast as a `coordinates` Y.Doc change. */
  coordinates?: { x: number; y: number; z: number };
  /** Set when `rotation` differs — broadcast as a `rotation` Y.Doc change. */
  rotation?: { x: number; y: number; z: number; w: number };
  /** Keys of `custom_variables` that differ (includes `scale`). */
  customVariableKeys: string[];
  /** Attribute instances whose `value` differs, own + port-owned. */
  attributes: { uuid: string; value: string }[];
}

export interface SceneDelta {
  added: { kind: InstanceKind; instance: Json }[];
  removed: { kind: InstanceKind; uuid: string }[];
  changed: InstanceChange[];
  /**
   * What differs on the scene instance itself: its scalar fields (`name` /
   * `description`) and the values of its own attribute instances. Null when neither did.
   */
  sceneFields: SceneFieldsChange | null;
}

/** The scene instance's own state, as far as an undo step can move it. */
export interface SceneFieldsChange {
  name?: string;
  description?: string;
  /** Scene-owned attribute instances whose `value` or table differs. */
  attributes?: SceneAttributeChange[];
}

/**
 * A scene-owned attribute instance to move back. `table_attributes` is present when the
 * attribute is a table whose cells differ — rows added, removed or moved, or a cell
 * edited — and holds the cells wanted. A class's tables need no such field: an instance
 * change assigns the instance's whole JSON.
 */
export interface SceneAttributeChange {
  uuid: string;
  value: string;
  table_attributes?: Json[];
}

/** Sentinel `touched` entry standing for the scene's own scalar fields. */
export const SCENE_FIELDS_KEY = "__scene__";

/**
 * Properties the engine hangs off gds instances that do NOT survive a JSON round-trip.
 * `urdfVizRep.data` is an ArrayBuffer for an STL mesh, which `JSON.stringify` flattens
 * to `{}` — writing that back would leave the robot part with no geometry to draw. They
 * are dropped from every snapshot and never written by `assignInPlace`, so the live
 * values simply stay put across an undo. (`urdfRobotKey` / `urdfRef` are plain data and
 * round-trip fine, so they are not listed.)
 */
const ENGINE_ONLY_KEYS = new Set(["urdfVizRep"]);

const omitEngineOnly = (key: string, value: unknown) => (ENGINE_ONLY_KEYS.has(key) ? undefined : value);

/** Deep clone a SceneInstance (or a snapshot) into plain JSON. */
export function cloneScene(scene: SceneInstance | SceneSnapshot): SceneSnapshot {
  return JSON.parse(serializeScene(scene)) as SceneSnapshot;
}

/** Serialize a snapshot for storage in the history stack (strings are compact). */
export function serializeScene(scene: SceneInstance | SceneSnapshot): string {
  return JSON.stringify(scene, omitEngineOnly);
}

/** Parse a stored snapshot back into JSON. */
export function parseScene(serialized: string): SceneSnapshot {
  return JSON.parse(serialized) as SceneSnapshot;
}

function byUuid(list: Json[] | undefined): Map<string, Json> {
  const map = new Map<string, Json>();
  for (const entry of list ?? []) {
    const uuid = entry?.["uuid"];
    if (typeof uuid === "string") map.set(uuid, entry);
  }
  return map;
}

function stable(value: unknown): string {
  return JSON.stringify(value ?? null);
}

/**
 * UUIDs of the instances that differ between two snapshots, plus `SCENE_FIELDS_KEY`
 * when a scene-level scalar changed. This is the fallback for mutation sites that
 * cannot name what they touched (bulk imports, algorithm runs).
 */
export function touchedUuids(from: SceneSnapshot, to: SceneSnapshot): string[] {
  const touched = new Set<string>();

  for (const key of ["class_instances", "relationclasses_instances"] as const) {
    const before = byUuid(from[key]);
    const after = byUuid(to[key]);
    for (const [uuid, entry] of after) {
      if (!before.has(uuid) || stable(before.get(uuid)) !== stable(entry)) touched.add(uuid);
    }
    for (const uuid of before.keys()) {
      if (!after.has(uuid)) touched.add(uuid);
    }
  }

  if (from.name !== to.name || from.description !== to.description) touched.add(SCENE_FIELDS_KEY);
  if (sceneAttributeChanges(from, to).length > 0) touched.add(SCENE_FIELDS_KEY);

  return [...touched];
}

/**
 * The scene instance's own attribute instances whose value or table differs — the fields
 * the attribute window edits while nothing is selected. They ride along with the scene's
 * scalar fields under `SCENE_FIELDS_KEY`, since the scene itself is what changed.
 */
function sceneAttributeChanges(from: SceneSnapshot, to: SceneSnapshot): SceneAttributeChange[] {
  const before = byUuid(from.attribute_instances);
  const changes: SceneAttributeChange[] = [];
  for (const [uuid, target] of byUuid(to.attribute_instances)) {
    const current = before.get(uuid);
    const value = String(target["value"] ?? "");
    const valueChanged = current === undefined || String(current["value"] ?? "") !== value;
    const tableChanged = stable(current?.["table_attributes"] ?? []) !== stable(target["table_attributes"] ?? []);
    if (!valueChanged && !tableChanged) continue;
    changes.push(
      tableChanged ? { uuid, value, table_attributes: (target["table_attributes"] as Json[]) ?? [] } : { uuid, value },
    );
  }
  return changes;
}

/**
 * Collect the attribute instances of an instance, its ports included — the flat list
 * the attribute window edits. Keyed by uuid so a diff can compare values pairwise.
 */
function attributeValues(instance: Json | undefined): Map<string, string> {
  const values = new Map<string, string>();
  if (!instance) return values;

  const collect = (list: unknown) => {
    if (!Array.isArray(list)) return;
    for (const entry of list as Json[]) {
      const uuid = entry?.["uuid"];
      if (typeof uuid === "string") values.set(uuid, String(entry["value"] ?? ""));
    }
  };

  collect(instance["attribute_instance"]);
  const ports = instance["port_instance"];
  if (Array.isArray(ports)) {
    for (const port of ports as Json[]) {
      collect(port?.["attribute_instances"]);
      collect(port?.["attribute_instance"]);
    }
  }
  return values;
}

function diffOneKind(
  kind: InstanceKind,
  before: Json[] | undefined,
  after: Json[] | undefined,
  restrict: ReadonlySet<string> | undefined,
  delta: SceneDelta,
): void {
  const beforeMap = byUuid(before);
  const afterMap = byUuid(after);
  const wanted = (uuid: string) => !restrict || restrict.has(uuid);

  for (const [uuid, target] of afterMap) {
    if (!wanted(uuid)) continue;
    const current = beforeMap.get(uuid);
    if (!current) {
      delta.added.push({ kind, instance: target });
      continue;
    }
    if (stable(current) === stable(target)) continue;

    const change: InstanceChange = { uuid, kind, target, customVariableKeys: [], attributes: [] };

    if (stable(current["coordinates_2d"]) !== stable(target["coordinates_2d"])) {
      const coordinates = target["coordinates_2d"] as { x: number; y: number; z: number } | undefined;
      if (coordinates) change.coordinates = { x: coordinates.x, y: coordinates.y, z: coordinates.z };
    }
    if (stable(current["rotation"]) !== stable(target["rotation"])) {
      const rotation = target["rotation"] as { x: number; y: number; z: number; w: number } | undefined;
      if (rotation) change.rotation = { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w };
    }

    const currentVars = (current["custom_variables"] ?? {}) as Json;
    const targetVars = (target["custom_variables"] ?? {}) as Json;
    for (const key of new Set([...Object.keys(currentVars), ...Object.keys(targetVars)])) {
      if (stable(currentVars[key]) !== stable(targetVars[key])) change.customVariableKeys.push(key);
    }

    const currentValues = attributeValues(current);
    for (const [attributeUuid, value] of attributeValues(target)) {
      if (currentValues.get(attributeUuid) !== value) change.attributes.push({ uuid: attributeUuid, value });
    }

    delta.changed.push(change);
  }

  for (const uuid of beforeMap.keys()) {
    if (!wanted(uuid) || afterMap.has(uuid)) continue;
    delta.removed.push({ kind, uuid });
  }
}

/**
 * What has to happen to turn `from` (the live scene) into `to` (the history entry).
 * `restrict` limits the diff to the instances the recorded action touched — without
 * it every difference is reported, which is what a bulk action (import) needs.
 */
export function diffScene(
  from: SceneSnapshot,
  to: SceneSnapshot,
  restrict?: ReadonlySet<string>,
): SceneDelta {
  const delta: SceneDelta = { added: [], removed: [], changed: [], sceneFields: null };

  diffOneKind("class", from.class_instances, to.class_instances, restrict, delta);
  diffOneKind(
    "relation",
    from.relationclasses_instances,
    to.relationclasses_instances,
    restrict,
    delta,
  );

  if (!restrict || restrict.has(SCENE_FIELDS_KEY)) {
    const sceneFields: SceneFieldsChange = {};
    if (from.name !== to.name) sceneFields.name = to.name;
    if (from.description !== to.description) sceneFields.description = to.description;
    const attributes = sceneAttributeChanges(from, to);
    if (attributes.length > 0) sceneFields.attributes = attributes;
    if (Object.keys(sceneFields).length > 0) delta.sceneFields = sceneFields;
  }

  return delta;
}

/** True when a delta would change nothing. */
export function isEmptyDelta(delta: SceneDelta): boolean {
  return (
    delta.added.length === 0 &&
    delta.removed.length === 0 &&
    delta.changed.length === 0 &&
    delta.sceneFields === null
  );
}

/**
 * Overwrite `target`'s contents with `source`'s, IN PLACE.
 *
 * Object identity is load-bearing here and a plain re-assignment would break it: the
 * engine keeps flat reference arrays into the SceneInstance graph
 * (`globalObject.attribute_instances`, `role_instances`), the attribute window renders
 * the very AttributeInstance objects it was handed, and three.js meshes are matched to
 * instances by uuid. So existing objects are mutated rather than replaced, arrays are
 * re-matched BY UUID (not by index, which reorders under an insert), and only genuinely
 * new elements are cloned in. Prototypes are never touched, so `instanceof ClassInstance`
 * keeps holding for everything that was already revived.
 */
export function assignInPlace(target: unknown, source: unknown): void {
  if (!isObject(target) || !isObject(source)) return;

  if (Array.isArray(target) && Array.isArray(source)) {
    assignArrayInPlace(target, source);
    return;
  }

  for (const key of Object.keys(source as Json)) {
    if (ENGINE_ONLY_KEYS.has(key)) continue;
    const nextValue = (source as Json)[key];
    const currentValue = (target as Json)[key];
    if (isObject(currentValue) && isObject(nextValue) && Array.isArray(currentValue) === Array.isArray(nextValue)) {
      assignInPlace(currentValue, nextValue);
    } else {
      (target as Json)[key] = structuredCopy(nextValue);
    }
  }

  // Drop keys the snapshot does not have. Both sides come from the same JSON shape, so
  // this only ever removes something a mutation added after the snapshot was taken —
  // except the engine-only keys, which are absent from every snapshot by design.
  for (const key of Object.keys(target as Json)) {
    if (!(key in (source as Json)) && !ENGINE_ONLY_KEYS.has(key)) delete (target as Json)[key];
  }
}

function assignArrayInPlace(target: unknown[], source: unknown[]): void {
  const existing = new Map<string, unknown>();
  for (const entry of target) {
    const uuid = isObject(entry) ? (entry as Json)["uuid"] : undefined;
    if (typeof uuid === "string") existing.set(uuid, entry);
  }

  const next: unknown[] = [];
  for (let index = 0; index < source.length; index++) {
    const sourceEntry = source[index];
    const uuid = isObject(sourceEntry) ? (sourceEntry as Json)["uuid"] : undefined;
    // Same uuid -> keep the live object and update it; otherwise fall back to the
    // element at the same position (line points and other uuid-less rows).
    const reuse =
      typeof uuid === "string"
        ? existing.get(uuid)
        : isObject(target[index]) && isObject(sourceEntry) && Array.isArray(target[index]) === Array.isArray(sourceEntry)
          ? target[index]
          : undefined;

    if (reuse !== undefined && isObject(reuse) && isObject(sourceEntry)) {
      assignInPlace(reuse, sourceEntry);
      next.push(reuse);
    } else {
      next.push(structuredCopy(sourceEntry));
    }
  }

  target.length = 0;
  target.push(...next);
}

function isObject(value: unknown): value is Json | unknown[] {
  return typeof value === "object" && value !== null;
}

/** Plain deep copy for values that have no live counterpart to preserve. */
function structuredCopy<T>(value: T): T {
  if (!isObject(value)) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}
