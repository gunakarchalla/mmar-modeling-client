// P5 unit tests for the consistency checker — the min/max role cardinality gate that
// decides whether a relation may start/end on a given class instance. It is the only
// thing standing between the user and a metamodel-invalid diagram, so the counting
// logic is worth asserting directly.
//
// global-definition is faked (the real one builds a WebGLRenderer at import time —
// P3 note). Its only field the checker reads is `role_instances`. gds fixtures are
// REAL (built via fromJS so instanceof + nested references revive correctly).
import { describe, it, expect, beforeEach, vi } from "vitest";
import { Relationclass, ClassInstance, RoleInstance } from "@gds";

const mocks = vi.hoisted(() => ({
  globalObject: { role_instances: [] as RoleInstance[] },
}));
vi.mock("@/engine/global-definition", () => ({ globalObject: mocks.globalObject }));

const { consistencyChecker } = await import("./consistency-checker");

const CLASS_META_UUID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_META_UUID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ROLE_FROM_UUID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ROLE_TO_UUID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const CLASS_INSTANCE_UUID = "11111111-1111-4111-8111-111111111111";

/** A relationclass whose role_from allows CLASS_META_UUID with the given min/max. */
function makeRelationclass(min: number, max: number): Relationclass {
  return Relationclass.fromJS({
    uuid: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    name: "Connects",
    role_from: {
      uuid: ROLE_FROM_UUID,
      name: "from",
      class_references: [{ uuid: CLASS_META_UUID, min, max }],
      relationclass_references: [],
      port_references: [],
      scenetype_references: [],
      attribute_references: [],
    },
    role_to: {
      uuid: ROLE_TO_UUID,
      name: "to",
      class_references: [{ uuid: CLASS_META_UUID, min, max }],
      relationclass_references: [],
      port_references: [],
      scenetype_references: [],
      attribute_references: [],
    },
  }) as Relationclass;
}

function makeClassInstance(metaUuid: string): ClassInstance {
  return ClassInstance.fromJS({
    uuid: CLASS_INSTANCE_UUID,
    name: "ci",
    uuid_class: metaUuid,
    attribute_instance: [],
    port_instance: [],
  }) as ClassInstance;
}

/** A role instance already occupying the `from` role on our class instance. */
function makeExistingRoleInstance(): RoleInstance {
  return RoleInstance.fromJS({
    uuid: "22222222-2222-4222-8222-222222222222",
    uuid_role: ROLE_FROM_UUID,
    uuid_has_reference_class_instance: CLASS_INSTANCE_UUID,
  }) as RoleInstance;
}

beforeEach(() => {
  mocks.globalObject.role_instances = [];
});

describe("ConsistencyChecker.checkStartPoint", () => {
  it("allows the relation when no role instance yet occupies the class (min 0, max 1)", () => {
    const rc = makeRelationclass(0, 1);
    const ci = makeClassInstance(CLASS_META_UUID);

    expect(consistencyChecker.checkStartPoint(rc, ci, undefined)).toBe(true);
  });

  it("forbids the relation when the class already holds the max number of roles", () => {
    const rc = makeRelationclass(0, 1);
    const ci = makeClassInstance(CLASS_META_UUID);
    // one existing role_from on this class instance -> count+1 = 2 > max 1
    mocks.globalObject.role_instances = [makeExistingRoleInstance()];

    expect(consistencyChecker.checkStartPoint(rc, ci, undefined)).toBe(false);
  });

  it("forbids the relation when the class' metaclass is not referenced by role_from", () => {
    const rc = makeRelationclass(0, 1);
    const ci = makeClassInstance(OTHER_META_UUID); // not in class_references

    expect(consistencyChecker.checkStartPoint(rc, ci, undefined)).toBe(false);
  });

  it("treats a null max as unbounded (still allowed with existing roles present)", () => {
    const rc = makeRelationclass(0, null as unknown as number);
    const ci = makeClassInstance(CLASS_META_UUID);
    mocks.globalObject.role_instances = [makeExistingRoleInstance()];

    expect(consistencyChecker.checkStartPoint(rc, ci, undefined)).toBe(true);
  });
});

describe("ConsistencyChecker.checkEndPoint", () => {
  it("allows a valid end point (min 0, max 1, no existing roles)", () => {
    const rc = makeRelationclass(0, 1);
    const ci = makeClassInstance(CLASS_META_UUID);

    expect(consistencyChecker.checkEndPoint(rc, ci, undefined)).toBe(true);
  });
});
