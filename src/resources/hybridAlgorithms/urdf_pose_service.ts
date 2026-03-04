import { singleton } from 'aurelia';
import * as THREE from 'three';
import { AttributeInstance, ClassInstance } from '../../../../mmar-global-data-structure';
import { GlobalDefinition } from '../global_definitions';
import { MetaUtility } from '../services/meta_utility';
import { Logger } from '../services/logger';

type UrdfRef = {
    kind: 'link' | 'joint';
    name: string;
};

type RobotRecord = {
    robot: any;
    scaleFactor: number;
    linkInstances: Map<string, ClassInstance>;
    jointInstances: Map<string, ClassInstance>;
};

@singleton()
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

    constructor(
        private globalObjectInstance: GlobalDefinition,
        private metaUtility: MetaUtility,
        private logger: Logger
    ) {
    }

    /**
     * Register (or replace) a robot cache record.
     *
     * We also cache a mapping from URDF link/joint names to the created MMAR class instances.
     * This keeps joint-origin edits fast and avoids scanning the full scene instance repeatedly.
     */
    registerRobot(
        robotKey: string,
        robot: any,
        scaleFactor: number,
        linkInstances: ClassInstance[],
        jointInstances: ClassInstance[]
    ) {
        const linkMap = new Map<string, ClassInstance>();
        const jointMap = new Map<string, ClassInstance>();

        for (const instance of linkInstances) {
            const ref = (instance as any).urdfRef as UrdfRef | undefined;
            if (ref?.kind === 'link' && ref.name) {
                linkMap.set(ref.name, instance);
            }
        }

        for (const instance of jointInstances) {
            const ref = (instance as any).urdfRef as UrdfRef | undefined;
            if (ref?.kind === 'joint' && ref.name) {
                jointMap.set(ref.name, instance);
            }
        }

        this.robotsByKey.set(robotKey, {
            robot,
            scaleFactor,
            linkInstances: linkMap,
            jointInstances: jointMap,
        });

        this.logger?.log(`Registered URDF robot '${robotKey}' (links=${linkMap.size}, joints=${jointMap.size})`, 'info');
    }

    /**
     * Called from the table-attribute dialog on each cell edit.
     *
     * If the edit is happening on a Joint instance's Origin table, update the matching URDF joint
     * transform and then push the resulting world poses back into MMAR instances + existing scene objects.
     */
    async tryUpdateRobotFromJointOriginEdit(jointInstance: ClassInstance, originAttributeInstance: AttributeInstance): Promise<boolean> {
        if (!jointInstance || !originAttributeInstance) return false;

        const robotKey = ((jointInstance as any).urdfRobotKey as string) || 'default';
        const record = this.robotsByKey.get(robotKey);
        if (!record?.robot) return false;

        const urdfJointName = this.getUrdfNameFromInstance(jointInstance);
        if (!urdfJointName) return false;

        const urdfJoint = this.getUrdfJoint(record.robot, urdfJointName);
        if (!urdfJoint) {
            this.logger?.log(`URDF joint '${urdfJointName}' not found in robot '${robotKey}'`, 'info');
            return false;
        }

        const { xyz, rpy } = await this.readOriginTable(originAttributeInstance);

        // Apply the new origin to the URDF joint. urdf-loader joints are THREE.Object3D at runtime.
        // We intentionally use THREE types here and cast the URDF joint to `any` because the URDF
        // class types don't always surface Object3D APIs in this project's TS setup.
        (urdfJoint as any).position?.set?.(xyz.x / record.scaleFactor, xyz.y / record.scaleFactor, xyz.z / record.scaleFactor);

        const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(rpy.roll, rpy.pitch, rpy.yaw, 'XYZ'));
        (urdfJoint as any).quaternion?.copy?.(quat);

        // Recompute world matrices so matrixWorld on links/joints is correct.
        (record.robot as any).updateMatrixWorld?.(true);

        // Push updated poses into instances and corresponding scene objects.
        this.applyRobotWorldPoses(record);

        this.globalObjectInstance.render = true;
        this.globalObjectInstance.doSceneInstancePatch = true;

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

        const robotKey = ((jointInstance as any).urdfRobotKey as string) || 'default';
        const record = this.robotsByKey.get(robotKey);
        if (!record?.robot) return false;

        const urdfJointName = this.getUrdfNameFromInstance(jointInstance);
        if (!urdfJointName) return false;

        const urdfJoint = this.getUrdfJoint(record.robot, urdfJointName);
        if (!urdfJoint) {
            this.logger?.log(`URDF joint '${urdfJointName}' not found in robot '${robotKey}'`, 'info');
            return false;
        }

        // urdf-loader exposes a stable API `setJointValue(value)` at runtime.
        // We keep fallbacks to tolerate variations across urdf-loader versions.
        if (typeof (urdfJoint as any).setJointValue === 'function') {
            (urdfJoint as any).setJointValue(jointValue);
        } else if ('jointValue' in (urdfJoint as any)) {
            (urdfJoint as any).jointValue = jointValue;
        } else {
            // Unknown joint API; cannot apply.
            return false;
        }

        // Recompute world matrices so matrixWorld on links/joints is correct.
        (record.robot as any).updateMatrixWorld?.(true);

        // Push updated poses into instances and corresponding scene objects.
        this.applyRobotWorldPoses(record);

        this.globalObjectInstance.render = true;
        this.globalObjectInstance.doSceneInstancePatch = true;

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

        const robotKey = ((jointInstance as any).urdfRobotKey as string) || 'default';
        const record = this.robotsByKey.get(robotKey);
        if (!record?.robot) return undefined;

        const urdfJointName = this.getUrdfNameFromInstance(jointInstance);
        if (!urdfJointName) return undefined;

        const urdfJoint = this.getUrdfJoint(record.robot, urdfJointName);
        if (!urdfJoint) return undefined;

        // Prefer explicit getter if present; otherwise fall back to the stored property.
        let raw: any;
        if (typeof (urdfJoint as any).getJointValue === 'function') {
            raw = (urdfJoint as any).getJointValue();
        } else if ('jointValue' in (urdfJoint as any)) {
            raw = (urdfJoint as any).jointValue;
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

    private getUrdfNameFromInstance(instance: ClassInstance): string | undefined {
        const ref = (instance as any).urdfRef as UrdfRef | undefined;
        if (ref?.name) return ref.name;

        // Fall back to the Name attribute instance value.
        const nameAttr = instance.attribute_instance?.find((a: any) => a?.name === 'Name' || a?.uuid_attribute_name === 'Name');
        if (nameAttr?.value) return String(nameAttr.value);

        // As a last resort, attempt to find an attribute whose meta name is "Name".
        const maybeName = instance.attribute_instance?.find((a: any) => typeof a?.value === 'string' && a?.value?.length);
        return maybeName?.value ? String(maybeName.value) : undefined;
    }

    private getUrdfJoint(robot: any, jointName: string): any | undefined {
        if (robot?.joints?.[jointName]) return robot.joints[jointName];

        // Some URDFs may not key by name; search values by `urdfName`.
        const joints = Object.values(robot?.joints || {});
        return joints.find((j: any) => j?.urdfName === jointName);
    }

    private getUrdfLink(robot: any, linkName: string): any | undefined {
        if (robot?.links?.[linkName]) return robot.links[linkName];
        const links = Object.values(robot?.links || {});
        return links.find((l: any) => l?.urdfName === linkName);
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

    private applyWorldPoseToInstance(instance: ClassInstance, obj3d: any, scaleFactor: number) {
        const pos = new THREE.Vector3();
        const rot = new THREE.Quaternion();
        const scl = new THREE.Vector3();

        // Decompose the world matrix into pos/rot/scale.
        obj3d.matrixWorld.decompose(pos, rot, scl);

        // Persist the pose back into the MMAR instance (used by PersistencyHandler / GraphicContext).
        instance.coordinates_2d.x = pos.x * scaleFactor;
        instance.coordinates_2d.y = pos.y * scaleFactor;
        instance.coordinates_2d.z = pos.z * scaleFactor;
        instance.rotation = rot;

        // Also update the existing THREE object in the scene immediately, if present.
        const sceneObj = this.globalObjectInstance.scene?.getObjectByProperty?.('uuid', instance.uuid) as any;
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

        const cells = (originAttributeInstance as any).table_attributes as AttributeInstance[] | undefined;
        if (!cells?.length) return { xyz, rpy };

        for (const cell of cells) {
            const metaAttr = await this.metaUtility.getMetaAttribute(cell.uuid_attribute);
            const name = metaAttr?.name;
            const value = this.toNumber(cell.value);

            switch (name) {
                case 'Position x': xyz.x = value; break;
                case 'Position y': xyz.y = value; break;
                case 'Position z': xyz.z = value; break;
                case 'Roll': rpy.roll = value; break;
                case 'Pitch': rpy.pitch = value; break;
                case 'Yaw': rpy.yaw = value; break;
                default: break;
            }
        }

        return { xyz, rpy };
    }

    private toNumber(value: any): number {
        const n = typeof value === 'number' ? value : parseFloat(String(value ?? '0'));
        return Number.isFinite(n) ? n : 0;
    }
}
