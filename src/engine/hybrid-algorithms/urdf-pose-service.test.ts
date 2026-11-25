// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import * as THREE from "three";
import URDFLoader from "urdf-loader";
import { ClassInstance } from "@gds";

/**
 * P12 tests for urdf-pose-service — the joint maths behind the simulation sliders
 * (plan §9 P12: "urdf_pose_service joint math with a fixture URDF"). urdf-loader 0.12.6
 * ships NO sample URDFs in its npm package, so the fixture below is a real (minimal)
 * two-joint arm parsed by the REAL urdf-loader: that keeps the assertions about
 * kinematics honest rather than testing a mock of THREE.
 *
 * jsdom is REQUIRED, not cosmetic: URDFLoader.parse() uses DOMParser, which Node 20
 * does not provide as a global (same class of constraint as P10's live sync test).
 *
 * global-definition is faked (WebGLRenderer at module scope — P3 note). The scene is a
 * REAL THREE.Scene so the "push the pose onto the live object too" half is exercised.
 */

const scene = new THREE.Scene();

const fakeGlobal = vi.hoisted(() => ({
  globalObject: {
    render: false,
    doSceneInstancePatch: false,
    scene: null as unknown as THREE.Scene,
  },
}));
vi.mock("@/engine/global-definition", () => fakeGlobal);

const utils = vi.hoisted(() => ({
  metaUtility: { getMetaAttribute: vi.fn(async (_uuid: string): Promise<{ name: string } | undefined> => undefined) },
  logger: { log: vi.fn() },
}));
vi.mock("@/resources/services/meta-utility", () => ({ metaUtility: utils.metaUtility }));
vi.mock("@/resources/services/logger", () => ({ logger: utils.logger }));

const { UrdfPoseService } = await import("@/engine/hybrid-algorithms/urdf-pose-service");
type UrdfPoseServiceType = InstanceType<typeof UrdfPoseService>;

/**
 * A minimal but REAL URDF: base -> (fixed 0.5m up) -> shoulder -> (revolute about Z,
 * 1m along X) -> forearm. The revolute joint is what the slider drives.
 */
const FIXTURE_URDF = `<?xml version="1.0"?>
<robot name="test_arm">
  <link name="base_link"/>
  <link name="shoulder_link"/>
  <link name="forearm_link"/>
  <joint name="base_to_shoulder" type="fixed">
    <parent link="base_link"/>
    <child link="shoulder_link"/>
    <origin xyz="0 0 0.5" rpy="0 0 0"/>
  </joint>
  <joint name="shoulder_to_forearm" type="revolute">
    <parent link="shoulder_link"/>
    <child link="forearm_link"/>
    <origin xyz="1 0 0" rpy="0 0 0"/>
    <axis xyz="0 0 1"/>
    <limit lower="-1.57" upper="1.57" effort="10" velocity="1"/>
  </joint>
</robot>`;

const JOINT_INSTANCE_UUID = "11111111-1111-4111-8111-111111111111";
const FOREARM_INSTANCE_UUID = "22222222-2222-4222-8222-222222222222";

function makeInstance(uuid: string): ClassInstance {
  // Built from PLAIN json via fromJS so the revive is real (P3's class-transformer rule)
  // and the object we hold IS the one under test (P4's deep-copy trap).
  return ClassInstance.fromJS({
    uuid,
    name: "joint",
    uuid_class: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    coordinates_2d: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    attribute_instance: [],
  }) as ClassInstance;
}

/** Tags an instance the way roboticsystem-algorithms does after a URDF import. */
function tag(instance: ClassInstance, kind: "link" | "joint", name: string, robotKey = "test_arm") {
  const tagged = instance as ClassInstance & { urdfRobotKey?: string; urdfRef?: { kind: string; name: string } };
  tagged.urdfRobotKey = robotKey;
  tagged.urdfRef = { kind, name };
  return instance;
}

function parseRobot() {
  const loader = new URDFLoader();
  loader.parseVisual = false;
  loader.parseCollision = false;
  return loader.parse(FIXTURE_URDF);
}

describe("urdf-pose-service", () => {
  let service: UrdfPoseServiceType;
  let jointInstance: ClassInstance;
  let forearmInstance: ClassInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    scene.clear();
    fakeGlobal.globalObject.scene = scene;
    fakeGlobal.globalObject.render = false;
    fakeGlobal.globalObject.doSceneInstancePatch = false;

    service = new UrdfPoseService();
    jointInstance = tag(makeInstance(JOINT_INSTANCE_UUID), "joint", "shoulder_to_forearm");
    forearmInstance = tag(makeInstance(FOREARM_INSTANCE_UUID), "link", "forearm_link");
  });

  it("parses the fixture URDF into the joints/links the tests rely on", () => {
    const robot = parseRobot();
    expect(Object.keys(robot.joints).sort()).toEqual(["base_to_shoulder", "shoulder_to_forearm"]);
    expect(Object.keys(robot.links).sort()).toEqual(["base_link", "forearm_link", "shoulder_link"]);
    expect(robot.joints["shoulder_to_forearm"].jointType).toBe("revolute");
    expect(robot.joints["shoulder_to_forearm"].limit.lower).toBeCloseTo(-1.57);
  });

  it("tryUpdateRobotFromJointValue rotates the joint and writes the world pose onto the instances", async () => {
    const robot = parseRobot();
    service.registerRobot("test_arm", robot, 1, [forearmInstance], [jointInstance]);

    const applied = await service.tryUpdateRobotFromJointValue(jointInstance, Math.PI / 2);
    expect(applied).toBe(true);

    // The revolute joint sits 1m along X of a shoulder that is 0.5m up: rotating it does
    // not move the joint itself...
    expect(jointInstance.coordinates_2d.x).toBeCloseTo(1);
    expect(jointInstance.coordinates_2d.z).toBeCloseTo(0.5);
    // ...but it does rotate it a quarter turn about Z (w = cos(45°)).
    expect(jointInstance.rotation.z).toBeCloseTo(Math.sin(Math.PI / 4));
    expect(jointInstance.rotation.w).toBeCloseTo(Math.cos(Math.PI / 4));

    // The engine must be told to redraw and the scene marked dirty for auto-save.
    expect(fakeGlobal.globalObject.render).toBe(true);
    expect(fakeGlobal.globalObject.doSceneInstancePatch).toBe(true);

    // Regression: rotation must be a plain {x,y,z,w} object, NOT a raw THREE.Quaternion.
    // A THREE.Quaternion JSON.stringifies to an ARRAY ([x,y,z,w]); the server then stores
    // that as a Postgres array literal ({"0","0","0","1"}) which is not valid JSON, so the
    // scene PATCH 500s on read-back. Serializing to a plain object keeps it valid JSON.
    expect(jointInstance.rotation).not.toBeInstanceOf(THREE.Quaternion);
    expect(Array.isArray(jointInstance.rotation)).toBe(false);
    const serialized = JSON.stringify(jointInstance.rotation);
    expect(serialized.startsWith("{")).toBe(true);
    expect(() => JSON.parse(serialized)).not.toThrow();
    expect(Object.keys(JSON.parse(serialized)).sort()).toEqual(["w", "x", "y", "z"]);
  });

  it("scaleFactor multiplies the world position written onto the instance", async () => {
    const robot = parseRobot();
    service.registerRobot("test_arm", robot, 10, [forearmInstance], [jointInstance]);

    await service.tryUpdateRobotFromJointValue(jointInstance, 0);

    // Same 1m/0.5m pose as above, at scaleFactor 10.
    expect(jointInstance.coordinates_2d.x).toBeCloseTo(10);
    expect(jointInstance.coordinates_2d.z).toBeCloseTo(5);
  });

  it("pushes the new pose onto the live three.js object when one is in the scene", async () => {
    const robot = parseRobot();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    // The scene keys objects by the INSTANCE uuid (insertObjectToScene does this).
    mesh.uuid = JOINT_INSTANCE_UUID;
    scene.add(mesh);

    service.registerRobot("test_arm", robot, 1, [forearmInstance], [jointInstance]);
    await service.tryUpdateRobotFromJointValue(jointInstance, Math.PI / 2);

    expect(mesh.position.x).toBeCloseTo(1);
    expect(mesh.position.z).toBeCloseTo(0.5);
    expect(mesh.quaternion.w).toBeCloseTo(Math.cos(Math.PI / 4));
  });

  it("tryGetRobotJointValue reads back the value that was applied (the slider's initial state)", async () => {
    const robot = parseRobot();
    service.registerRobot("test_arm", robot, 1, [forearmInstance], [jointInstance]);

    expect(service.tryGetRobotJointValue(jointInstance)).toBeCloseTo(0);

    await service.tryUpdateRobotFromJointValue(jointInstance, 0.75);
    expect(service.tryGetRobotJointValue(jointInstance)).toBeCloseTo(0.75);
  });

  it("refuses to act on an unregistered robot / unknown joint / non-finite value", async () => {
    const robot = parseRobot();

    // Nothing registered yet.
    expect(await service.tryUpdateRobotFromJointValue(jointInstance, 1)).toBe(false);
    expect(service.tryGetRobotJointValue(jointInstance)).toBeUndefined();

    service.registerRobot("test_arm", robot, 1, [forearmInstance], [jointInstance]);

    // Registered, but the value is junk.
    expect(await service.tryUpdateRobotFromJointValue(jointInstance, NaN)).toBe(false);

    // Registered, but this instance names a joint the robot does not have.
    const stranger = tag(makeInstance("33333333-3333-4333-8333-333333333333"), "joint", "no_such_joint");
    expect(await service.tryUpdateRobotFromJointValue(stranger, 1)).toBe(false);
    expect(utils.logger.log).toHaveBeenCalledWith(expect.stringContaining("no_such_joint"), "info");
  });

  it("tryUpdateRobotFromJointOriginEdit re-poses the joint from the Origin table's meta-attribute names", async () => {
    const robot = parseRobot();
    service.registerRobot("test_arm", robot, 1, [forearmInstance], [jointInstance]);

    // The Origin table is read by META-attribute name, not column order, so the meta
    // lookup is what maps each cell to x/y/z/roll/pitch/yaw.
    const names: Record<string, string> = {
      "aaaa0001-0000-4000-8000-000000000000": "Position x",
      "aaaa0002-0000-4000-8000-000000000000": "Position y",
      "aaaa0003-0000-4000-8000-000000000000": "Position z",
      "aaaa0004-0000-4000-8000-000000000000": "Roll",
      "aaaa0005-0000-4000-8000-000000000000": "Pitch",
      "aaaa0006-0000-4000-8000-000000000000": "Yaw",
    };
    utils.metaUtility.getMetaAttribute.mockImplementation(async (uuid: string) =>
      names[uuid] ? { name: names[uuid] } : undefined,
    );

    const originAttribute = {
      uuid: "bbbb0000-0000-4000-8000-000000000000",
      table_attributes: [
        { uuid_attribute: "aaaa0001-0000-4000-8000-000000000000", value: "2" },
        { uuid_attribute: "aaaa0002-0000-4000-8000-000000000000", value: "3" },
        { uuid_attribute: "aaaa0003-0000-4000-8000-000000000000", value: "4" },
        { uuid_attribute: "aaaa0004-0000-4000-8000-000000000000", value: "0" },
        { uuid_attribute: "aaaa0005-0000-4000-8000-000000000000", value: "0" },
        { uuid_attribute: "aaaa0006-0000-4000-8000-000000000000", value: String(Math.PI / 2) },
      ],
    };

    const applied = await service.tryUpdateRobotFromJointOriginEdit(
      jointInstance,
      originAttribute as unknown as Parameters<UrdfPoseServiceType["tryUpdateRobotFromJointOriginEdit"]>[1],
    );
    expect(applied).toBe(true);

    // The joint moved to the edited origin, offset by the shoulder's 0.5m rise.
    expect(jointInstance.coordinates_2d.x).toBeCloseTo(2);
    expect(jointInstance.coordinates_2d.y).toBeCloseTo(3);
    expect(jointInstance.coordinates_2d.z).toBeCloseTo(4.5);
    // Yaw of 90° about Z.
    expect(jointInstance.rotation.w).toBeCloseTo(Math.cos(Math.PI / 4));
  });

  it("registerRobot maps instances by their urdfRef name, ignoring untagged ones", () => {
    const robot = parseRobot();
    const untagged = makeInstance("44444444-4444-4444-8444-444444444444");

    service.registerRobot("test_arm", robot, 1, [forearmInstance, untagged], [jointInstance]);

    expect(utils.logger.log).toHaveBeenCalledWith(expect.stringContaining("links=1, joints=1"), "info");
  });
});
