import * as THREE from "three";
import type { URDFRobot, URDFJoint, URDFLink } from "urdf-loader";
import { AttributeInstance, ClassInstance } from "@gds";
import { globalObject } from "@/engine/global-definition";
import { metaUtility } from "@/resources/services/meta-utility";
import { eventBus } from "@/resources/services/event-bus";
import { logger } from "@/resources/services/logger";

/**
 * The bridge between a parsed urdf-loader robot (a THREE.Object3D hierarchy) and the
 * MMAR instances that mirror it.
 *
 * `roboticsystem-algorithms` registers a robot after import. Afterwards a Joint "Origin"
 * edit in the table dialog, or a slider in simulation mode, re-poses the robot here, and
 * the recomputed world poses are pushed back into both the gds instances and the live
 * three.js objects.
 *
 * The `setJointValue` / `jointValue` fallbacks are kept even though the pinned
 * urdf-loader version always takes the first branch: they are tolerance for other
 * versions, and the API is reached through a duck-typed check rather than a cast.
 */

type UrdfRef = {
  kind: "link" | "joint";
  name: string;
};

type RobotRecord = {
  robot: URDFRobot;
  scaleFactor: number;
  linkInstances: Map<string, ClassInstance>;
  jointInstances: Map<string, ClassInstance>;
};

/**
 * The URDF linkage metadata `roboticsystem-algorithms` stamps onto each created
 * ClassInstance. These are NOT gds fields — they are transient, in-memory only, and do
 * not survive a save/reload round-trip (the server drops unknown properties). The old
 * client did the same with `(classInstance as any).urdfRobotKey`; this type just names
 * the shape so both files agree on it.
 */
export type UrdfTaggedClassInstance = ClassInstance & {
  urdfRobotKey?: string;
  urdfRef?: UrdfRef;
};

export class UrdfPoseService {
  /**
   * Cache of URDF robots keyed by a stable robot key.
   *
   * Why this exists:
   * - URDF import parses to a THREE.Object3D hierarchy via `urdf-loader`.
   * - When the user edits a Joint's Origin (Roll/Pitch/Yaw) in the table dialog,
   *   we want to recompute all link/joint world poses using that hierarchy and
   *   update the existing scene objects in-place.
   */
  private robotsByKey = new Map<string, RobotRecord>();

  private globalObjectInstance = globalObject;
  private eventAggregator = eventBus;
  private metaUtility = metaUtility;
  private logger = logger;

  /**
   * Register (or replace) a robot cache record.
   *
   * We also cache a mapping from URDF link/joint names to the created MMAR class instances.
   * This keeps joint-origin edits fast and avoids scanning the full scene instance repeatedly.
   */
  registerRobot(
    robotKey: string,
    robot: URDFRobot,
    scaleFactor: number,
    linkInstances: ClassInstance[],
    jointInstances: ClassInstance[],
  ) {
    const linkMap = new Map<string, ClassInstance>();
    const jointMap = new Map<string, ClassInstance>();

    for (const instance of linkInstances) {
      const ref = (instance as UrdfTaggedClassInstance).urdfRef;
      if (ref?.kind === "link" && ref.name) {
        linkMap.set(ref.name, instance);
      }
    }

    for (const instance of jointInstances) {
      const ref = (instance as UrdfTaggedClassInstance).urdfRef;
      if (ref?.kind === "joint" && ref.name) {
        jointMap.set(ref.name, instance);
      }
    }

    this.robotsByKey.set(robotKey, {
      robot,
      scaleFactor,
      linkInstances: linkMap,
      jointInstances: jointMap,
    });

    this.logger?.log(
      `Registered URDF robot '${robotKey}' (links=${linkMap.size}, joints=${jointMap.size})`,
      "info",
    );
  }

  /**
   * Called from the table-attribute dialog on each cell edit.
   *
   * If the edit is happening on a Joint instance's Origin table, update the matching URDF joint
   * transform and then push the resulting world poses back into MMAR instances + existing scene objects.
   */
  async tryUpdateRobotFromJointOriginEdit(
    jointInstance: ClassInstance,
    originAttributeInstance: AttributeInstance,
  ): Promise<boolean> {
    if (!jointInstance || !originAttributeInstance) return false;

    const record = this.getRecordForInstance(jointInstance);
    if (!record?.robot) return false;

    const urdfJointName = this.getUrdfNameFromInstance(jointInstance);
    if (!urdfJointName) return false;

    const urdfJoint = this.getUrdfJoint(record.robot, urdfJointName);
    if (!urdfJoint) {
      this.logger?.log(
        `URDF joint '${urdfJointName}' not found in robot '${this.getRobotKey(jointInstance)}'`,
        "info",
      );
      return false;
    }

    const { xyz, rpy } = await this.readOriginTable(originAttributeInstance);

    // Apply the new origin to the URDF joint. urdf-loader joints are THREE.Object3D at runtime.
    urdfJoint.position?.set?.(
      xyz.x / record.scaleFactor,
      xyz.y / record.scaleFactor,
      xyz.z / record.scaleFactor,
    );

    const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(rpy.roll, rpy.pitch, rpy.yaw, "XYZ"));
    urdfJoint.quaternion?.copy?.(quat);

    // Recompute world matrices so matrixWorld on links/joints is correct.
    record.robot.updateMatrixWorld?.(true);

    // Push updated poses into instances and corresponding scene objects.
    this.applyRobotWorldPoses(record);

    this.globalObjectInstance.render = true;
    this.globalObjectInstance.doSceneInstancePatch = true;

    // Re-posing a robot rewrites the pose attributes of every link/joint instance, so
    // it is one undo step like any other edit. Coalesced per joint: the table dialog
    // commits a value per field, and a origin edit is several of those in a row.
    this.eventAggregator.publish("historyRecord", {
      label: "joint origin",
      coalesceKey: `urdf-origin:${jointInstance?.uuid ?? ""}`,
    });

    return true;
  }

  /**
   * Called from SimulationMode UI when the user moves a joint slider.
   *
   * Updates the underlying urdf-loader joint value (radians for revolute/continuous, meters for prismatic)
   * and then recomputes world matrices to push updated poses back into MMAR instances + THREE scene objects.
   */
  async tryUpdateRobotFromJointValue(jointInstance: ClassInstance, jointValue: number): Promise<boolean> {
    if (!jointInstance || !Number.isFinite(jointValue)) return false;

    const record = this.getRecordForInstance(jointInstance);
    if (!record?.robot) return false;

    const urdfJointName = this.getUrdfNameFromInstance(jointInstance);
    if (!urdfJointName) return false;

    const urdfJoint = this.getUrdfJoint(record.robot, urdfJointName);
    if (!urdfJoint) {
      this.logger?.log(
        `URDF joint '${urdfJointName}' not found in robot '${this.getRobotKey(jointInstance)}'`,
        "info",
      );
      return false;
    }

    // urdf-loader exposes a stable API `setJointValue(value)` at runtime.
    // We keep fallbacks to tolerate variations across urdf-loader versions.
    const jointApi = urdfJoint as unknown as Record<string, unknown>;
    if (typeof jointApi.setJointValue === "function") {
      urdfJoint.setJointValue(jointValue);
    } else if ("jointValue" in jointApi) {
      jointApi.jointValue = jointValue;
    } else {
      // Unknown joint API; cannot apply.
      return false;
    }

    // Recompute world matrices so matrixWorld on links/joints is correct.
    record.robot.updateMatrixWorld?.(true);

    // Push updated poses into instances and corresponding scene objects.
    this.applyRobotWorldPoses(record);

    this.globalObjectInstance.render = true;
    this.globalObjectInstance.doSceneInstancePatch = true;

    // A dragged slider fires this on every tick; the coalesce key collapses the whole
    // drag into one undo step instead of one per intermediate joint value.
    this.eventAggregator.publish("historyRecord", {
      label: "joint value",
      coalesceKey: `urdf-joint:${jointInstance?.uuid ?? ""}`,
    });

    return true;
  }

  /**
   * Reads the current joint value from the cached URDF robot (if available).
   *
   * Why this exists:
   * - The Simulation UI should initialize sliders to the robot's current joint state.
   * - urdf-loader versions may expose the value via different shapes (method/property).
   */
  tryGetRobotJointValue(jointInstance: ClassInstance): number | undefined {
    if (!jointInstance) return undefined;

    const record = this.getRecordForInstance(jointInstance);
    if (!record?.robot) return undefined;

    const urdfJointName = this.getUrdfNameFromInstance(jointInstance);
    if (!urdfJointName) return undefined;

    const urdfJoint = this.getUrdfJoint(record.robot, urdfJointName);
    if (!urdfJoint) return undefined;

    // Prefer explicit getter if present; otherwise fall back to the stored property.
    const jointApi = urdfJoint as unknown as Record<string, unknown>;
    let raw: unknown;
    if (typeof jointApi.getJointValue === "function") {
      raw = (jointApi.getJointValue as () => unknown)();
    } else if ("jointValue" in jointApi) {
      raw = jointApi.jointValue;
    } else {
      return undefined;
    }

    // Some implementations may store the value as an array; pick the first finite number.
    if (Array.isArray(raw)) {
      for (const v of raw) {
        const n = this.toNumber(v);
        if (Number.isFinite(n)) return n;
      }
      return undefined;
    }

    const n = this.toNumber(raw);
    return Number.isFinite(n) ? n : undefined;
  }

  private getRobotKey(instance: ClassInstance): string {
    return (instance as UrdfTaggedClassInstance).urdfRobotKey || "default";
  }

  private getRecordForInstance(instance: ClassInstance): RobotRecord | undefined {
    return this.robotsByKey.get(this.getRobotKey(instance));
  }

  private getUrdfNameFromInstance(instance: ClassInstance): string | undefined {
    const ref = (instance as UrdfTaggedClassInstance).urdfRef;
    if (ref?.name) return ref.name;

    // Fall back to the Name attribute instance value.
    const nameAttr = instance.attribute_instance?.find(
      (a) => a?.name === "Name" || (a as unknown as { uuid_attribute_name?: string })?.uuid_attribute_name === "Name",
    );
    if (nameAttr?.value) return String(nameAttr.value);

    // As a last resort, attempt to find an attribute whose meta name is "Name".
    const maybeName = instance.attribute_instance?.find((a) => typeof a?.value === "string" && a?.value?.length);
    return maybeName?.value ? String(maybeName.value) : undefined;
  }

  private getUrdfJoint(robot: URDFRobot, jointName: string): URDFJoint | undefined {
    if (robot?.joints?.[jointName]) return robot.joints[jointName];

    // Some URDFs may not key by name; search values by `urdfName`.
    const joints: URDFJoint[] = Object.values(robot?.joints || {});
    return joints.find((j) => j?.urdfName === jointName);
  }

  private getUrdfLink(robot: URDFRobot, linkName: string): URDFLink | undefined {
    if (robot?.links?.[linkName]) return robot.links[linkName];
    const links: URDFLink[] = Object.values(robot?.links || {});
    return links.find((l) => l?.urdfName === linkName);
  }

  private applyRobotWorldPoses(record: RobotRecord) {
    // Update all known link instances
    record.linkInstances.forEach((instance, linkName) => {
      const linkObj = this.getUrdfLink(record.robot, linkName);
      if (!linkObj?.matrixWorld) return;
      this.applyWorldPoseToInstance(instance, linkObj, record.scaleFactor);
    });

    // Update all known joint instances
    record.jointInstances.forEach((instance, jointName) => {
      const jointObj = this.getUrdfJoint(record.robot, jointName);
      if (!jointObj?.matrixWorld) return;
      this.applyWorldPoseToInstance(instance, jointObj, record.scaleFactor);
    });
  }

  private applyWorldPoseToInstance(instance: ClassInstance, obj3d: THREE.Object3D, scaleFactor: number) {
    const pos = new THREE.Vector3();
    const rot = new THREE.Quaternion();
    const scl = new THREE.Vector3();

    // Decompose the world matrix into pos/rot/scale.
    obj3d.matrixWorld.decompose(pos, rot, scl);

    // Persist the pose back into the MMAR instance (used by PersistencyHandler / GraphicContext).
    instance.coordinates_2d.x = pos.x * scaleFactor;
    instance.coordinates_2d.y = pos.y * scaleFactor;
    instance.coordinates_2d.z = pos.z * scaleFactor;
    // gds `rotation` is a plain {x,y,z,w} object (Quaternion). Assigning the raw
    // THREE.Quaternion serializes via JSON.stringify to an ARRAY ([x,y,z,w]); the
    // server then stores that array as a Postgres array literal ({"0","0","0","1"})
    // which is not valid JSON, so the next read-back JSON.parse throws and the whole
    // scene PATCH 500s. Always write the plain object shape the gds expects.
    instance.rotation = { x: rot.x, y: rot.y, z: rot.z, w: rot.w };

    // Also update the existing THREE object in the scene immediately, if present.
    const sceneObj = this.globalObjectInstance.scene?.getObjectByProperty?.("uuid", instance.uuid);
    if (sceneObj) {
      sceneObj.position.set(instance.coordinates_2d.x, instance.coordinates_2d.y, instance.coordinates_2d.z);
      sceneObj.quaternion.copy(rot);
    }
  }

  private async readOriginTable(originAttributeInstance: AttributeInstance) {
    // The Origin table has one row; values are stored as flat `table_attributes` on the parent.
    // We map values by the meta-attribute name (Position x/y/z, Roll/Pitch/Yaw) to avoid
    // depending on column ordering.
    const xyz = { x: 0, y: 0, z: 0 };
    const rpy = { roll: 0, pitch: 0, yaw: 0 };

    const cells = originAttributeInstance.table_attributes;
    if (!cells?.length) return { xyz, rpy };

    for (const cell of cells) {
      const metaAttr = await this.metaUtility.getMetaAttribute(cell.uuid_attribute);
      const name = metaAttr?.name;
      const value = this.toNumber(cell.value);

      switch (name) {
        case "Position x":
          xyz.x = value;
          break;
        case "Position y":
          xyz.y = value;
          break;
        case "Position z":
          xyz.z = value;
          break;
        case "Roll":
          rpy.roll = value;
          break;
        case "Pitch":
          rpy.pitch = value;
          break;
        case "Yaw":
          rpy.yaw = value;
          break;
        default:
          break;
      }
    }

    return { xyz, rpy };
  }

  private toNumber(value: unknown): number {
    const n = typeof value === "number" ? value : parseFloat(String(value ?? "0"));
    return Number.isFinite(n) ? n : 0;
  }
}

// Module singleton — one shared instance.
export const urdfPoseService = new UrdfPoseService();
