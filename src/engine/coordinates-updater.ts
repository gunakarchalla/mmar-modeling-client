import * as THREE from "three";
import { ObjectInstance } from "@gds";
import { globalObject } from "@/engine/global-definition";
import { instanceUtility } from "@/resources/services/instance-utility";
import { mathUtility } from "@/resources/services/math-utility";
import { logger } from "@/resources/services/logger";
// Side-effect import: constructing the SharedDocService singleton is what sets
// `globalObject.sharedDocServiceRef`, the back-reference the engine handlers reach
// collaboration through. This module is part of the engine's import graph, so the import
// guarantees the reference is wired at engine load. Nothing here uses the service value.
import "@/resources/collaboration/shared-doc-service";
import { publishLocalChange } from "@/resources/collaboration/local-change-publisher";
import type { LocalChangeType } from "@/resources/collaboration/y-mapping";

/**
 * Writes three.js transforms back onto the gds object graph.
 *
 * The animator calls these three passes from the render loop whenever an object's
 * position / rotation / scale stops matching the previous frame's. Each pass compares
 * the mesh against the instance it is mapped to, copies the changed values over (which
 * is what auto-save then PATCHes) and pushes the delta to collaborators.
 */
/**
 * How long the same instance has to stay quiet before its transform is logged again.
 *
 * These three passes run on every frame of a drag, so logging each write-back
 * unthrottled emitted ~60 lines per second per moved object. That is not just wasted
 * string building: `logStore.log` copies the whole (500-entry) array and wakes the log
 * panel, which re-renders a MUI <Tooltip> per row — so a two-second drag re-rendered
 * hundreds of tooltips ~120 times AND flushed every other message out of the window.
 * One line per instance per window keeps the panel readable and the cost off the frame.
 */
const TRANSFORM_LOG_INTERVAL_MS = 500;

export class CoordinatesUpdater {
  private instanceUtility = instanceUtility;
  private mathUtility = mathUtility;
  private logger = logger;
  private globalObjectInstance = globalObject;

  /** Last time each instance/kind pair was logged, for the throttle above. */
  private lastTransformLog = new Map<string, number>();

  /**
   * Log a transform write-back at most once per `TRANSFORM_LOG_INTERVAL_MS` per
   * instance and kind. The write-back itself, and the change published to
   * collaborators, are never throttled — only the log line is.
   */
  private logTransform(kind: string, uuid: string, message: () => string): void {
    const key = `${kind}:${uuid}`;
    const now = Date.now();
    const last = this.lastTransformLog.get(key);
    if (last !== undefined && now - last < TRANSFORM_LOG_INTERVAL_MS) return;
    this.lastTransformLog.set(key, now);
    this.logger.log(message(), "done");
  }

  /**
   * Every draggable object (and its children) paired with the class or port instance
   * it renders. Objects with no instance behind them — the grid, the pointer sphere,
   * labels — are skipped.
   *
   * Children are visited because ports and labels are attached to their parent mesh
   * and carry their own instance; the scale pass deliberately does not use this, see
   * `updateScaleOnClassAndPortInstance`.
   */
  private async *mappedObjects(includeChildren: boolean): AsyncGenerator<{ object3D: THREE.Object3D; instance: ObjectInstance }> {
    const sceneInstance = (await this.instanceUtility.getTabContextSceneInstance())!;
    const allPortInstances = await this.instanceUtility.getAllPortInstancesOfTabContext();

    // Index by uuid once instead of scanning both instance lists per object. All three
    // passes run on every frame of a drag over every dragged object AND its children,
    // so the linear scans made the write-back O(objects x instances) per pass — the
    // cost grew with the square of the scene while the work actually done stayed the
    // same. Class instances are indexed first and ports must not displace them, which
    // is the precedence the `??` chain this replaces had.
    const instancesByUuid = new Map<string, ObjectInstance>();
    for (const instance of allPortInstances) instancesByUuid.set(instance.uuid, instance);
    for (const instance of sceneInstance.class_instances) instancesByUuid.set(instance.uuid, instance);

    for (const object of this.globalObjectInstance.dragObjects) {
      const objects = includeChildren ? [object as THREE.Object3D, ...object.children] : [object as THREE.Object3D];
      for (const object3D of objects) {
        const instance = instancesByUuid.get(object3D.uuid);
        if (instance) yield { object3D, instance };
      }
    }
  }

  /** Send one transform delta to collaborators and mark the scene dirty for auto-save. */
  private syncToYDoc(change: LocalChangeType): void {
    if (publishLocalChange(change)) {
      this.globalObjectInstance.doSceneInstancePatchLocal = true;
    }
  }

  /**
   * Copy the 2D coordinates of every moved object onto its class / port instance.
   *
   * The delta published to collaborators carries only the axes that actually moved,
   * which is what lets a peer dragging the same object along another axis keep their axis
   * through the merge (see the position note in the y-mapping schema comment). The
   * per-axis comparison is the same one that decides whether there is anything to do at
   * all, so it costs nothing extra.
   */
  async updateCoordinates2DonClassAndPortInstance() {
    for await (const { object3D, instance } of this.mappedObjects(true)) {
      this.mathUtility.roundPosOfObject(object3D as THREE.Mesh, 100);
      const { x, y, z } = object3D.position;
      const movedX = instance.coordinates_2d.x != x;
      const movedY = instance.coordinates_2d.y != y;
      const movedZ = instance.coordinates_2d.z != z;
      if (!movedX && !movedY && !movedZ) continue;

      instance.coordinates_2d.x = x;
      instance.coordinates_2d.y = y;
      instance.coordinates_2d.z = z;
      this.logTransform("coordinates", instance.uuid, () => `update coordinates in instance ${instance.name} to ${x} ${y} ${z}`);
      this.syncToYDoc({
        type: "coordinates",
        classInstanceUuid: instance.uuid,
        ...(movedX ? { x } : {}),
        ...(movedY ? { y } : {}),
        ...(movedZ ? { z } : {}),
      });
    }
  }

  /**
   * Copy the quaternion of every rotated object onto its class / port instance.
   */
  async updateRotationOnClassAndPortInstance() {
    for await (const { object3D, instance } of this.mappedObjects(true)) {
      const { x, y, z, w } = object3D.quaternion;
      if (instance.rotation.x == x && instance.rotation.y == y && instance.rotation.z == z && instance.rotation.w == w) continue;

      instance.rotation.x = x;
      instance.rotation.y = y;
      instance.rotation.z = z;
      instance.rotation.w = w;
      this.logTransform("rotation", instance.uuid, () => `update rotation in instance ${instance.name} to ${x} ${y} ${z} ${w}`);
      this.syncToYDoc({ type: "rotation", classInstanceUuid: instance.uuid, x, y, z, w });
    }
  }

  /**
   * Copy the scale of every resized object onto its class / port instance.
   *
   * Scale is held in `custom_variables["scale"]`. Children are not visited: they are
   * inverse-scaled relative to their parent and carry no independent persisted scale.
   */
  async updateScaleOnClassAndPortInstance() {
    for await (const { object3D, instance } of this.mappedObjects(false)) {
      const scale = object3D.scale;
      const customVariables = instance.custom_variables as any;
      const stored = customVariables ? customVariables["scale"] : undefined;
      // `stored` may alias object3D.scale (set by reference in graphic-context.setScale).
      // While aliased its x/y/z always match the object, so it is not a usable prior value.
      const hasPlainPrior = stored && stored !== scale;
      // With a reliable prior, sync on any delta; without one, only sync a non-identity
      // scale so loading a scene does not broadcast an identity scale for every object.
      const changed = hasPlainPrior ? stored.x != scale.x || stored.y != scale.y || stored.z != scale.z : scale.x != 1 || scale.y != 1 || scale.z != 1;
      if (!changed) continue;

      if (!instance.custom_variables) instance.custom_variables = {};
      // Store a plain copy, not the live THREE.Vector3, so the next comparison works.
      (instance.custom_variables as any)["scale"] = { x: scale.x, y: scale.y, z: scale.z };
      this.logTransform("scale", instance.uuid, () => `update scale in instance ${instance.name} to ${scale.x} ${scale.y} ${scale.z}`);
      this.syncToYDoc({ type: "scale", classInstanceUuid: instance.uuid, x: scale.x, y: scale.y, z: scale.z });
    }
  }
}

// Module singleton — one shared instance.
export const coordinatesUpdater = new CoordinatesUpdater();
