import { AttributeInstance, ClassInstance } from "@gds";
import { metaUtility } from "@/resources/services/meta-utility";
import { instanceUtility } from "@/resources/services/instance-utility";
import { urdfPoseService } from "@/engine/hybrid-algorithms/urdf-pose-service";
import { ROBOTIC_SYSTEM_SCENETYPE_UUID, META_JOINT_UUID } from "@/constants";

/**
 * The data half of the simulation window, as plain functions so the joint-slider maths
 * is unit-testable without rendering.
 *
 * The component owns the subscriptions, the coalescing timer and the React state; this
 * module answers "which sliders does the open tab have, and what happens when one
 * moves".
 */

export type JointControl = {
  instance: ClassInstance;
  displayName: string;
  lower: number;
  upper: number;
  value: number;
  step?: number;
  disabled?: boolean;
};

export type SimulationState = {
  isRoboticSystemSceneType: boolean;
  jointControls: JointControl[];
};

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function toNumber(value: unknown): number {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

function getDisplayName(instance: ClassInstance): string {
  // Prefer the explicit Name attribute value set during URDF import.
  const nameAttr = (instance.attribute_instance || []).find((a) => a?.name === "Name");
  if (nameAttr?.value) return String(nameAttr.value);
  return instance.name || instance.uuid;
}

/**
 * Reads joint limits from the Joint instance's `Limit` table attribute.
 * Bounds are expected to be present as table columns named `Lower` and `Upper`.
 */
async function readLimitBounds(jointInstance: ClassInstance): Promise<{ lower: number; upper: number }> {
  const limitAttr = (jointInstance.attribute_instance || []).find((a) => a?.name === "Limit");
  if (!limitAttr) {
    return { lower: 0, upper: 0 };
  }

  const cells: AttributeInstance[] | undefined = limitAttr.table_attributes;
  if (!cells?.length) {
    return { lower: 0, upper: 0 };
  }

  let lower = 0;
  let upper = 0;

  for (const cell of cells) {
    // Prefer meta attribute name resolution (stable even if instance cell.name differs).
    const metaAttr = await metaUtility.getMetaAttribute(cell.uuid_attribute);
    const columnName = metaAttr?.name || cell?.name;
    const value = toNumber(cell?.value);

    if (columnName === "Lower") lower = value;
    if (columnName === "Upper") upper = value;
  }

  return { lower, upper };
}

/**
 * Recomputes all joint slider view models for the current tab.
 *
 * Note: We intentionally read from the open tab context (sceneType + sceneInstance)
 * because SimulationMode is defined per active tab.
 */
export async function buildSimulationState(): Promise<SimulationState> {
  const empty: SimulationState = { isRoboticSystemSceneType: false, jointControls: [] };

  const sceneType = await metaUtility.getTabContextSceneType();
  const sceneInstance = await instanceUtility.getTabContextSceneInstance();

  if (!sceneType || !sceneInstance) return empty;

  if (sceneType.uuid !== ROBOTIC_SYSTEM_SCENETYPE_UUID) return empty;

  const jointInstances = sceneInstance.class_instances.filter((ci) => ci?.uuid_class === META_JOINT_UUID);

  const controls: JointControl[] = [];
  for (const jointInstance of jointInstances) {
    const displayName = getDisplayName(jointInstance);
    const { lower, upper } = await readLimitBounds(jointInstance);

    // Initialize the slider with the robot's current joint value (if available).
    // We clamp to the joint limits to avoid invalid UI states when limits are missing/incorrect.
    const lowerRounded = Math.round(lower * 100) / 100;
    const upperRounded = Math.round(upper * 100) / 100;
    const currentJointValue = urdfPoseService.tryGetRobotJointValue(jointInstance) ?? 0;
    const initialValue = clamp(currentJointValue, lowerRounded, upperRounded);

    controls.push({
      instance: jointInstance,
      displayName,
      lower: lowerRounded,
      upper: upperRounded,
      value: initialValue,
      step: 0.01,
      disabled: false,
    });
  }

  return { isRoboticSystemSceneType: true, jointControls: controls };
}

/**
 * Slider callback. Returns the clamped value the UI should show rather than mutating
 * the control, so the caller decides what to store and React re-renders from it.
 */
export async function applyJointValue(ctrl: JointControl, rawValue: unknown): Promise<number> {
  const value = toNumber(rawValue);

  // Clamp to guard against UI edge cases.
  const clamped = clamp(value, ctrl.lower, ctrl.upper);

  await urdfPoseService.tryUpdateRobotFromJointValue(ctrl.instance, clamped);

  return clamped;
}
