import { describe, it, expect, beforeEach, vi } from "vitest";
import { AttributeInstance, ClassInstance } from "@gds";
import { MECHANISM_ATTRIBUTE_TYPE_UUID } from "@/constants";

/**
 * The mechanism pass runs stored code once per heartbeat, from the render loop, which
 * routes the relation lines only after it. A mechanism that throws must therefore stay
 * inside this pass: these pin that the others still run and that the failure is
 * reported once rather than every second.
 */

const fakeGlobal = vi.hoisted(() => ({
  globalObject: { selectedTab: 0, tabContext: [] as { sceneInstance: unknown }[] },
}));
vi.mock("@/engine/global-definition", () => fakeGlobal);

const utils = vi.hoisted(() => ({
  instanceUtility: {
    getAllAttributeInstancesFromObjectInstanceRecursively: vi.fn(async () => [] as unknown[]),
    getClassInstance: vi.fn(),
    getPortInstance: vi.fn(),
    getSceneInstance: vi.fn(),
  },
  metaUtility: {
    getMetaAttribute: vi.fn(),
    parseMetaFunction: vi.fn(async (code: string) => new Function(`"use strict";return (${code})`)()),
  },
  expressionUtility: {},
  logger: { log: vi.fn() },
}));
vi.mock("./instance-utility", () => ({ instanceUtility: utils.instanceUtility }));
vi.mock("./meta-utility", () => ({ metaUtility: utils.metaUtility }));
vi.mock("./expression-utility", () => ({ expressionUtility: utils.expressionUtility }));
vi.mock("./logger", () => ({ logger: utils.logger }));

const { mechanismUtility } = await import("./mechanism-utility");

const OWNER_UUID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
// A mechanism saved as one line: its first comment now runs to the end of the code.
const BROKEN = "async function onUpdate(expression, instance) {  // a comment  instance.ran = true; }";
const WORKING = "async function onUpdate(expression, instance) {\n  instance.ran = true;\n}";

function mechanism(uuid: string, value: string): AttributeInstance {
  const attribute = new AttributeInstance(uuid, "mechanism-attribute", undefined as unknown as string, OWNER_UUID, value);
  attribute.name = "onUpdate";
  return attribute;
}

describe("MechanismUtility", () => {
  let owner: ClassInstance & { ran?: boolean };

  beforeEach(() => {
    vi.clearAllMocks();
    owner = new ClassInstance(OWNER_UUID, "owner-class");
    owner.name = "Owner";
    fakeGlobal.globalObject.tabContext = [{ sceneInstance: {} }];
    utils.instanceUtility.getClassInstance.mockResolvedValue(owner);
    utils.metaUtility.getMetaAttribute.mockResolvedValue({ attribute_type: { uuid: MECHANISM_ATTRIBUTE_TYPE_UUID } });
  });

  it("runs the other mechanisms when one fails, and does not throw", async () => {
    utils.instanceUtility.getAllAttributeInstancesFromObjectInstanceRecursively.mockResolvedValue([
      mechanism("broken", BROKEN),
      mechanism("working", WORKING),
    ]);

    await expect(mechanismUtility.executeAllMechanisms()).resolves.toBeUndefined();

    expect(owner.ran).toBe(true);
    expect(utils.logger.log).toHaveBeenCalledWith(expect.stringContaining("Mechanism onUpdate of Owner"), "error");
  });

  it("reports a broken mechanism once, and again only when its code changes", async () => {
    const broken = mechanism("broken-twice", BROKEN);
    utils.instanceUtility.getAllAttributeInstancesFromObjectInstanceRecursively.mockResolvedValue([broken]);
    const errors = () => utils.logger.log.mock.calls.filter(([, status]) => status === "error").length;

    await mechanismUtility.executeAllMechanisms();
    await mechanismUtility.executeAllMechanisms();
    expect(errors()).toBe(1);

    broken.value = `${BROKEN} // still one line`;
    await mechanismUtility.executeAllMechanisms();
    expect(errors()).toBe(2);
  });
});
