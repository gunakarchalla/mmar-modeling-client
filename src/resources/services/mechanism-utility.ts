import { AttributeInstance, ObjectInstance } from "@gds";
import { globalObject } from "@/engine/global-definition";
import { metaUtility } from "./meta-utility";
import { expressionUtility } from "./expression-utility";
import { instanceUtility } from "./instance-utility";
import { MECHANISM_ATTRIBUTE_TYPE_UUID } from "@/constants";
import { logger } from "./logger";
import { describeError } from "@/resources/util/describe-error";

/**
 * Runs the "mechanism" code strings of the open scene.
 *
 * A mechanism is an attribute whose value is a function body; the animator calls
 * `executeAllMechanisms()` from the render loop whenever `globalObject.runMechanism` is
 * set. Candidates are pre-filtered on the value containing "function" — a cheap string
 * test that avoids a meta-attribute lookup per attribute instance — and only those whose
 * meta attribute really is of the mechanism type are executed, against the instance that
 * owns them.
 *
 * Each mechanism runs on its own: one that fails is reported and the rest still run. A
 * mechanism is stored code, and the render loop awaits this pass before it routes the
 * relation lines, so one throwing used to skip the line pass on every heartbeat — and a
 * relation drawn after that was never routed, so it never appeared.
 */
export class MechanismUtility {
  private globalObjectInstance = globalObject;
  private metaUtility = metaUtility;
  private expression = expressionUtility;
  private instanceUtility = instanceUtility;

  /**
   * The code of each mechanism that failed, by attribute instance uuid. A broken
   * mechanism fails on every heartbeat; it is reported once, and again only when its
   * code changes and still fails.
   */
  private failedCode = new Map<string, string>();

  async executeAllMechanisms() {
    const tabContext = this.globalObjectInstance.tabContext;
    const selectedTab = this.globalObjectInstance.selectedTab;
    const sceneInstance = tabContext[selectedTab]?.sceneInstance;

    if (sceneInstance) {
      // get all attribute instances from the sceneinstance
      const allAttributeInstances: AttributeInstance[] =
        await this.instanceUtility.getAllAttributeInstancesFromObjectInstanceRecursively(sceneInstance);
      // filter attributes that match mechanism function -> check if value contains 'function'
      const targetAttributeInstances = allAttributeInstances.filter((attributeInstance) =>
        attributeInstance.value.toString().includes("function"),
      );
      if (targetAttributeInstances.length > 0) {
        for (const attributeInstance of targetAttributeInstances) {
          const attributeTypeUUID = attributeInstance.uuid_attribute;
          const attribute = await this.metaUtility.getMetaAttribute(attributeTypeUUID);
          const attributeType = attribute?.attribute_type;
          if (attributeType?.uuid === MECHANISM_ATTRIBUTE_TYPE_UUID) {
            const generalMechanismCode = attributeInstance.value.toString();
            let contextInstance: ObjectInstance | undefined;
            if (attributeInstance.assigned_uuid_class_instance) {
              contextInstance = await this.instanceUtility.getClassInstance(
                attributeInstance.assigned_uuid_class_instance,
              );
            } else if (attributeInstance.assigned_uuid_port_instance) {
              contextInstance = await this.instanceUtility.getPortInstance(
                attributeInstance.assigned_uuid_port_instance,
              );
            } else if (attributeInstance.assigned_uuid_scene_instance) {
              contextInstance = await this.instanceUtility.getSceneInstance(
                attributeInstance.assigned_uuid_scene_instance,
              );
            }
            if (contextInstance) {
              try {
                await this.runMechanismFunction(generalMechanismCode, contextInstance);
                this.failedCode.delete(attributeInstance.uuid);
              } catch (error) {
                this.reportFailure(attributeInstance, contextInstance, generalMechanismCode, error);
              }
            }
          }
        }
      }
    }
  }

  private reportFailure(attributeInstance: AttributeInstance, contextInstance: ObjectInstance, code: string, error: unknown) {
    if (this.failedCode.get(attributeInstance.uuid) === code) return;
    this.failedCode.set(attributeInstance.uuid, code);
    const owner = contextInstance.name ? ` of ${contextInstance.name}` : "";
    logger.log(`Mechanism ${attributeInstance.name ?? attributeInstance.uuid_attribute}${owner} (${contextInstance.uuid}) failed: ${describeError(error)}`, "error");
  }

  /**
   * Runs the mechanism function with the provided mechanism code.
   * @param mechanismCode The mechanism code to be executed.
   */
  async runMechanismFunction(mechanismCode: string, contextInstance: ObjectInstance): Promise<void> {
    const mechanismFunction = await this.metaUtility.parseMetaFunction(mechanismCode);
    await mechanismFunction(this.expression, contextInstance);
  }
}

// Module singleton — one shared instance.
export const mechanismUtility = new MechanismUtility();
