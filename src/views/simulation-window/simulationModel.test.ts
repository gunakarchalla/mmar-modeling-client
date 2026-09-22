import { describe, it, expect, beforeEach, vi } from "vitest";
import { ClassInstance, SceneInstance } from "@gds";
import { ROBOTIC_SYSTEM_SCENETYPE_UUID, META_JOINT_UUID } from "@/constants";

/**
 * P12 tests for the simulation window's data half — "what are the sliders for the open
 * tab, and what happens when one moves" (plan §9 P12: "simulation window renders sliders
 * for a fixture robotic scene"; the rendering half is SimulationWindow.test.tsx).
 *
 * global-definition is faked (WebGLRenderer at module scope — P3 note). urdf-pose-service
 * is mocked: its maths has its own test against a real URDF, and here we only care that
 * the slider is seeded from the robot's CURRENT joint value and clamped to the limits.
 */

const fakeGlobal = vi.hoisted(() => ({ globalObject: {} }));
vi.mock("@/engine/global-definition", () => fakeGlobal);

const mocks = vi.hoisted(() => ({
  metaUtility: {
    getTabContextSceneType: vi.fn(async (): Promise<unknown> => undefined),
    getMetaAttribute: vi.fn(async (_uuid: string): Promise<{ name: string } | undefined> => undefined),
  },
  instanceUtility: {
    getTabContextSceneInstance: vi.fn(async (): Promise<SceneInstance | undefined> => undefined),
  },
  urdfPoseService: {
    tryGetRobotJointValue: vi.fn((_i: ClassInstance): number | undefined => undefined),
    tryUpdateRobotFromJointValue: vi.fn(async () => true),
  },
}));
vi.mock("@/resources/services/meta-utility", () => ({ metaUtility: mocks.metaUtility }));
vi.mock("@/resources/services/instance-utility", () => ({ instanceUtility: mocks.instanceUtility }));
vi.mock("@/engine/hybrid-algorithms/urdf-pose-service", () => ({ urdfPoseService: mocks.urdfPoseService }));

const { buildSimulationState, applyJointValue, clamp, toNumber } = await import(
  "@/views/simulation-window/simulationModel"
);

const LOWER_ATTR = "aaaa0001-0000-4000-8000-000000000000";
const UPPER_ATTR = "aaaa0002-0000-4000-8000-000000000000";

/** Builds a Joint instance whose `Limit` table carries Lower/Upper cells. */
function jointJson(uuid: string, name: string, lower: string, upper: string) {
  return {
    uuid,
    name,
    uuid_class: META_JOINT_UUID,
    attribute_instance: [
      { uuid: `${uuid}-name`, name: "Name", uuid_attribute: "n", value: name },
      {
        uuid: `${uuid}-limit`,
        name: "Limit",
        uuid_attribute: "l",
        value: "",
        table_attributes: [
          { uuid: `${uuid}-lower`, name: "Lower", uuid_attribute: LOWER_ATTR, value: lower },
          { uuid: `${uuid}-upper`, name: "Upper", uuid_attribute: UPPER_ATTR, value: upper },
        ],
      },
    ],
  };
}

function openScene(sceneTypeUuid: string, classInstances: unknown[]): SceneInstance {
  // Built from PLAIN json (P4's fromJS deep-copy trap) and handed back revived.
  const scene = SceneInstance.fromJS({
    uuid: "99999999-9999-4999-8999-999999999999",
    name: "robot scene",
    uuid_scene_type: sceneTypeUuid,
    class_instances: classInstances,
  }) as SceneInstance;
  mocks.metaUtility.getTabContextSceneType.mockResolvedValue({ uuid: sceneTypeUuid });
  mocks.instanceUtility.getTabContextSceneInstance.mockResolvedValue(scene);
  return scene;
}

describe("simulationModel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.metaUtility.getTabContextSceneType.mockResolvedValue(undefined);
    mocks.instanceUtility.getTabContextSceneInstance.mockResolvedValue(undefined);
    mocks.urdfPoseService.tryGetRobotJointValue.mockReturnValue(undefined);
    // Resolve the Limit table's columns by META attribute name (the stable path).
    mocks.metaUtility.getMetaAttribute.mockImplementation(async (uuid: string) =>
      uuid === LOWER_ATTR ? { name: "Lower" } : uuid === UPPER_ATTR ? { name: "Upper" } : undefined,
    );
  });

  describe("clamp / toNumber", () => {
    it("clamps into range and coerces junk to 0", () => {
      expect(clamp(5, 0, 1)).toBe(1);
      expect(clamp(-5, 0, 1)).toBe(0);
      expect(clamp(0.5, 0, 1)).toBe(0.5);

      expect(toNumber("1.5")).toBe(1.5);
      expect(toNumber(2)).toBe(2);
      expect(toNumber("abc")).toBe(0);
      expect(toNumber(undefined)).toBe(0);
      expect(toNumber(null)).toBe(0);
    });
  });

  describe("buildSimulationState", () => {
    it("reports not-robotic with no sliders when no tab is open", async () => {
      expect(await buildSimulationState()).toEqual({ isRoboticSystemSceneType: false, jointControls: [] });
    });

    it("reports not-robotic for another scene type, even if it somehow holds joints", async () => {
      openScene("5e37e51c-e420-438c-9747-e9424723b4cd", [jointJson("j1", "shoulder", "-1", "1")]);

      const state = await buildSimulationState();

      expect(state.isRoboticSystemSceneType).toBe(false);
      expect(state.jointControls).toEqual([]);
    });

    it("builds one control per Joint instance, ignoring other classes", async () => {
      openScene(ROBOTIC_SYSTEM_SCENETYPE_UUID, [
        jointJson("j1", "shoulder", "-1.5", "1.5"),
        jointJson("j2", "elbow", "0", "2"),
        { uuid: "l1", name: "a link", uuid_class: "some-link-class", attribute_instance: [] },
      ]);

      const state = await buildSimulationState();

      expect(state.isRoboticSystemSceneType).toBe(true);
      expect(state.jointControls).toHaveLength(2);
      expect(state.jointControls.map((c) => c.displayName)).toEqual(["shoulder", "elbow"]);
      expect(state.jointControls[0]).toMatchObject({ lower: -1.5, upper: 1.5, step: 0.01, disabled: false });
      expect(state.jointControls[1]).toMatchObject({ lower: 0, upper: 2 });
    });

    it("is robotic-but-empty when the scene has no Joint instances", async () => {
      openScene(ROBOTIC_SYSTEM_SCENETYPE_UUID, [{ uuid: "l1", name: "link", uuid_class: "x", attribute_instance: [] }]);

      const state = await buildSimulationState();

      expect(state.isRoboticSystemSceneType).toBe(true);
      expect(state.jointControls).toEqual([]);
    });

    it("seeds each slider from the robot's current joint value, clamped to the limits", async () => {
      openScene(ROBOTIC_SYSTEM_SCENETYPE_UUID, [jointJson("j1", "shoulder", "-1", "1")]);
      mocks.urdfPoseService.tryGetRobotJointValue.mockReturnValue(0.4);

      expect((await buildSimulationState()).jointControls[0].value).toBe(0.4);

      // A robot value outside the declared limits must not produce an invalid slider.
      mocks.urdfPoseService.tryGetRobotJointValue.mockReturnValue(99);
      expect((await buildSimulationState()).jointControls[0].value).toBe(1);
    });

    it("defaults the slider to 0 when no robot is registered for the joint", async () => {
      openScene(ROBOTIC_SYSTEM_SCENETYPE_UUID, [jointJson("j1", "shoulder", "-1", "1")]);
      mocks.urdfPoseService.tryGetRobotJointValue.mockReturnValue(undefined);

      expect((await buildSimulationState()).jointControls[0].value).toBe(0);
    });

    it("rounds the limits to 2dp and falls back to 0/0 when the Limit table is missing", async () => {
      openScene(ROBOTIC_SYSTEM_SCENETYPE_UUID, [
        jointJson("j1", "precise", "-1.23456", "1.23456"),
        { uuid: "j2", name: "no-limit", uuid_class: META_JOINT_UUID, attribute_instance: [] },
      ]);

      const state = await buildSimulationState();

      expect(state.jointControls[0]).toMatchObject({ lower: -1.23, upper: 1.23 });
      expect(state.jointControls[1]).toMatchObject({ lower: 0, upper: 0, displayName: "no-limit" });
    });

    it("resolves the Limit columns by META attribute name, not by cell order", async () => {
      // Same table with the cells in the opposite order and misleading instance-level
      // names: only the meta lookup can tell Lower from Upper.
      openScene(ROBOTIC_SYSTEM_SCENETYPE_UUID, [
        {
          uuid: "j1",
          name: "shoulder",
          uuid_class: META_JOINT_UUID,
          attribute_instance: [
            {
              uuid: "j1-limit",
              name: "Limit",
              uuid_attribute: "l",
              value: "",
              table_attributes: [
                { uuid: "c1", name: "zzz", uuid_attribute: UPPER_ATTR, value: "3" },
                { uuid: "c2", name: "aaa", uuid_attribute: LOWER_ATTR, value: "-3" },
              ],
            },
          ],
        },
      ]);

      expect((await buildSimulationState()).jointControls[0]).toMatchObject({ lower: -3, upper: 3 });
    });

    it("prefers the Name attribute over the instance name for the label", async () => {
      openScene(ROBOTIC_SYSTEM_SCENETYPE_UUID, [
        {
          uuid: "j1",
          name: "instance name",
          uuid_class: META_JOINT_UUID,
          attribute_instance: [{ uuid: "a", name: "Name", uuid_attribute: "n", value: "urdf joint name" }],
        },
      ]);

      expect((await buildSimulationState()).jointControls[0].displayName).toBe("urdf joint name");
    });
  });

  describe("applyJointValue", () => {
    const ctrl = () => ({
      instance: ClassInstance.fromJS({ uuid: "j1", name: "j", uuid_class: META_JOINT_UUID }) as ClassInstance,
      displayName: "j",
      lower: -1,
      upper: 1,
      value: 0,
    });

    it("clamps the value, forwards it to the robot, and returns what the UI should show", async () => {
      const control = ctrl();

      expect(await applyJointValue(control, 0.5)).toBe(0.5);
      expect(mocks.urdfPoseService.tryUpdateRobotFromJointValue).toHaveBeenLastCalledWith(control.instance, 0.5);

      expect(await applyJointValue(control, 42)).toBe(1);
      expect(mocks.urdfPoseService.tryUpdateRobotFromJointValue).toHaveBeenLastCalledWith(control.instance, 1);

      expect(await applyJointValue(control, -42)).toBe(-1);
      expect(mocks.urdfPoseService.tryUpdateRobotFromJointValue).toHaveBeenLastCalledWith(control.instance, -1);
    });

    it("tolerates a string value (the old MDC slider emitted strings)", async () => {
      const control = ctrl();

      expect(await applyJointValue(control, "0.25")).toBe(0.25);
      expect(mocks.urdfPoseService.tryUpdateRobotFromJointValue).toHaveBeenLastCalledWith(control.instance, 0.25);
    });
  });
});
