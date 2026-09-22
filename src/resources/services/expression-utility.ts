import { AttributeInstance, ClassInstance, RelationclassInstance, UUID } from "@gds";
import { globalObject } from "@/engine/global-definition";
import { instanceUtility } from "./instance-utility";
import { eventBus } from "./event-bus";
import { metaUtility } from "./meta-utility";
import { fileUtility } from "./file-utility";
import { logger } from "./logger";

/** How long a redraw request waits on an in-flight update before going ahead anyway. */
const CLAIM_VIZREP_TIMEOUT_MS = 2000;

/**
 * The `gc.expression.*` API that stored vizRep and mechanism code strings call.
 *
 * Like `graphic-context`, the method surface is a contract with code held in the
 * database: names and parameter order must not change, and methods are kept even when
 * nothing in this repository calls them.
 *
 * The `attrval*` family reads attribute values (by meta uuid, by meta name, or for an
 * arbitrary instance), the relation helpers walk incoming and outgoing relations, and
 * the `checkForVisualizationUpdate*` pair asks the vizRep pipeline for a redraw.
 */
export class ExpressionUtility {
  private globalObjectInstance = globalObject;
  private instanceUtility = instanceUtility;
  private eventAggregator = eventBus;
  private metaUtility = metaUtility;
  private fileUtility = fileUtility;

  /**
   * Calls the value of the attribute instance in the local client based on the UUID of the meta attribute.
   * The context is the current class instance.
   *
   * @param {string} UUID - The UUID of the meta attribute.
   * @returns {Promise<string>} - A promise resolving to the value of the attributInstance.
   */
  async attrval(attrUUID: string): Promise<string | undefined> {
    const current_class_instance = this.globalObjectInstance.current_class_instance;
    let attributeInstances = await this.instanceUtility.getAttributeInstanceFromClassInstance(
      attrUUID,
      current_class_instance?.uuid,
      "uuid",
    );
    // if not found in class, get from relationclassInstance
    if (!attributeInstances) {
      attributeInstances = await this.instanceUtility.getAttributeInstanceFromRelationClassInstance(
        attrUUID,
        current_class_instance?.uuid,
        "uuid",
      );
    }
    // if not found in relationclass, get from portInstance
    if (!attributeInstances && this.globalObjectInstance.current_port_instance) {
      attributeInstances = await this.instanceUtility.getAttributeInstanceFromPortInstance(
        attrUUID,
        this.globalObjectInstance.current_port_instance.uuid,
        "uuid",
      );
    }
    return attributeInstances?.value;
  }

  /**
   * Calls the value of the attribute instance in the local client based on the name of the meta attribute.
   * The context is the current class instance.
   *
   * @param {string} attributeName - The name of the meta attribute.
   * @returns {Promise<string>} - A promise resolving to the value of the attributInstance.
   */
  async attrvalByName(attrName: string): Promise<string | undefined> {
    let attributeInstances = await this.instanceUtility.getAttributeInstanceFromClassInstance(
      attrName,
      this.globalObjectInstance.current_class_instance?.uuid,
      "name",
    );
    // if not found in class, get from relationclassInstance
    if (!attributeInstances) {
      attributeInstances = await this.instanceUtility.getAttributeInstanceFromRelationClassInstance(
        attrName,
        this.globalObjectInstance.current_class_instance?.uuid,
        "name",
      );
    }
    // if not found in relationclass, get from portInstance
    if (!attributeInstances && this.globalObjectInstance.current_port_instance) {
      attributeInstances = await this.instanceUtility.getAttributeInstanceFromPortInstance(
        attrName,
        this.globalObjectInstance.current_port_instance.uuid,
        "name",
      );
    }
    return attributeInstances?.value;
  }

  /**
   * Calls the value of the attribute instance in the local client based on the UUID of any type of instance and the meta attribute UUID.
   *
   * @param {string} instUUID - The UUID of any type of instance.
   * @param {string} attrUUID - The UUID of the meta attribute.
   * @returns {Promise<string>} - A promise resolving to the value of the attributInstance.
   */
  async attrvalByInst(attrUUID: string, instUUID: string): Promise<string | undefined> {
    const instance = await this.instanceUtility.getAnyInstance(instUUID);
    if (!instance) return undefined;
    const attributeInstances = await this.instanceUtility.getAttributeInstanceFromAnyInstance(
      attrUUID,
      instance.uuid,
      "uuid",
    );
    return attributeInstances?.value;
  }

  /**
   * Retrieves the attribute instance in the local client based on the UUID of any type of instance and the meta attribute UUID.
   *
   * @param {string} instanceUUID - The UUID of any type of instance.
   * @param {string} metaAttributeUUID - The UUID of the meta attribute.
   * @returns {Promise<AttributeInstance>} - A promise resolving to the attribute instance.
   */
  async getAttrByInstanceUUID(
    instanceUUID: string,
    metaAttributeUUID: string,
  ): Promise<AttributeInstance | undefined> {
    return this.findAttributeInstance(instanceUUID, metaAttributeUUID);
  }

  /**
   * Updates the value of the attribute instance in the local client based on the UUID of any type of instance and the meta attribute UUID.
   *
   * @param {string} instanceUUID - The UUID of any type of instance.
   * @param {string} metaAttributeUUID - The UUID of the meta attribute.
   * @param {any} value - The new value of the attribute instance.
   */
  async setAttrvalByInstanceUUID(instanceUUID: string, metaAttributeUUID: string, value: any) {
    const attributeInstance = await this.findAttributeInstance(instanceUUID, metaAttributeUUID);
    // Nothing to write to. Mechanisms run from the render loop, once per frame, against
    // whatever the scene holds AT THAT MOMENT — and a delete is a chain of awaited HTTP
    // calls, so frames are drawn while the cascade is still running and an instance a
    // mechanism names can vanish between two of them. That is a normal race, not a
    // fault, so it is skipped rather than thrown: the exception escaped as an unhandled
    // rejection out of Animator.animate and took the rest of the frame with it.
    if (!attributeInstance) return;
    attributeInstance.value = value;
  }

  /**
   * Retrieves all class (and relation class) instances in the local client based on the UUID of the meta class.
   *
   * @param {string} metaClassUUID - The UUID of the meta class.
   * @returns {Promise<ClassInstance[]>} - A promise resolving to an array of the class (and relation class) instances.
   */
  async getClassInstancesByMetaUUID(metaClassUUID: string): Promise<ClassInstance[]> {
    const instances = await this.instanceUtility.getAllClassInstancesFromOpenSceneInstance();
    return instances.filter(
      (inst) =>
        (inst instanceof ClassInstance && inst.uuid_class === metaClassUUID) ||
        (inst instanceof RelationclassInstance && inst.uuid_relationclass === metaClassUUID),
    );
  }

  /**
   * Retrieves the source (origin) class instance in the local client based on the UUID of the relation class instance.
   *
   * @param {string} relInstanceUUID - The UUID of the relation class instance.
   * @returns {Promise<ClassInstance>} - A promise resolving to the source class instance.
   */
  async getSourceByRelInstanceUUID(relInstanceUUID: string): Promise<ClassInstance | undefined> {
    const relInstance = await this.instanceUtility.getAnyInstance(relInstanceUUID);
    if (relInstance instanceof RelationclassInstance) {
      const classUUID = relInstance.role_instance_from.uuid_has_reference_class_instance;
      const classInstance = await this.instanceUtility.getAnyInstance(classUUID);
      if (classInstance instanceof ClassInstance) {
        return classInstance;
      }
    }
  }

  /**
   * Retrieves the destination (target) class instance in the local client based on the UUID of the relation class instance.
   *
   * @param {string} relInstanceUUID - The UUID of the relation class instance.
   * @returns {Promise<ClassInstance>} - A promise resolving to the destination class instance.
   */
  async getDestinationByRelInstanceUUID(
    relInstanceUUID: string,
  ): Promise<ClassInstance | null | undefined> {
    const relInstance = await this.instanceUtility.getAnyInstance(relInstanceUUID);
    if (relInstance && relInstance instanceof RelationclassInstance) {
      const role_instance_to = relInstance.role_instance_to;
      if (role_instance_to) {
        const classUUID = relInstance.role_instance_to.uuid_has_reference_class_instance;
        const classInstance = await this.instanceUtility.getAnyInstance(classUUID);
        if (classInstance instanceof ClassInstance) {
          return classInstance;
        } else {
          return null;
        }
      }
    }
  }

  /**
   * Retrieves all relation class instances in the local client where the given instance is the destination (target) based on its UUID and optionally filters them by a specific relation type (metaClassUUID).
   * @param {string} instanceUUID - The UUID of any type of instance.
   * @param {string|null} [metaClassUUID=null] - Optional UUID of the relation class type to filter by.
   * @returns {Promise<RelationclassInstance[]>} - A promise resolving to an array of incoming relation class instances.
   */
  async getIncomingRelationsByInstanceUUID(
    instanceUUID: string,
    metaClassUUID: string | null = null,
  ): Promise<RelationclassInstance[]> {
    return this.instanceUtility.getIncomingRelationsFromInstance(instanceUUID, metaClassUUID);
  }

  /**
   * Retrieves all relation class instances in the local client where the given instance is the source (origin) based on its UUID and optionally filters them by a specific relation type (metaClassUUID).
   *
   * @param {string} instanceUUID - The UUID of any type of instance.
   * @param {string|null} [metaClassUUID=null] - Optional UUID of the relation class type to filter by.
   * @returns {Promise<RelationclassInstance[]>} - A promise resolving to an array of outgoing relation class instances.
   */
  async getOutgoingRelationsByInstanceUUID(
    instanceUUID: string,
    metaClassUUID: string | null = null,
  ): Promise<RelationclassInstance[]> {
    return this.instanceUtility.getOutgoingRelationsFromInstance(instanceUUID, metaClassUUID);
  }

  /**
   * Checks if any type of instance in the local client has both incoming and outgoing relations (i.e. is connected).
   *
   * @param {string} instanceUUID - The UUID of any type of instance.
   * @returns {Promise<boolean>} - A promise resolving to "true" if the instance is connected, or "false" otherwise.
   */
  async isConnected(instanceUUID: string): Promise<boolean> {
    const incomingRelations = await this.instanceUtility.getIncomingRelationsFromInstance(instanceUUID);
    const outgoingRelations = await this.instanceUtility.getOutgoingRelationsFromInstance(instanceUUID);
    return incomingRelations.length > 0 && outgoingRelations.length > 0;
  }

  /**
   * Wait for any vizRep update in flight to finish, then claim the flag for the update
   * we are about to request, so requests do not pile onto a half-updated instance.
   *
   * BOUNDED, because one wait can never be satisfied: this is part of the `gc.expression.*`
   * surface that stored code strings call, and a vizRep asking for a redraw from INSIDE
   * the update that is running it waits for a flag only that same update's `finally` can
   * clear. That used to hang the one call chain; now that vizRep updates hold the draw
   * lane, an unbounded wait would hold the lane with it and freeze clicks, remote changes
   * and undo along with it. After the deadline the request goes ahead and says so —
   * a redraw racing a stale flag is recoverable, a frozen canvas is not.
   */
  private async claimVizRepUpdate(): Promise<void> {
    const deadline = Date.now() + CLAIM_VIZREP_TIMEOUT_MS;
    while (!this.globalObjectInstance.readyForVizRepUpdate) {
      if (Date.now() >= deadline) {
        logger.log(
          `vizRep update still in flight after ${CLAIM_VIZREP_TIMEOUT_MS}ms; requesting anyway`,
          "close",
        );
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    this.globalObjectInstance.readyForVizRepUpdate = false;
  }

  /** Ask the vizRep pipeline to re-evaluate the whole open scene. */
  async checkForVisualizationUpdate() {
    await this.claimVizRepUpdate();
    this.eventAggregator.publish("checkForVizRepUpdate");
  }

  /** Ask the vizRep pipeline to re-evaluate just the instance holding one attribute. */
  async checkForVisualizationUpdateByAttributeUUID(instanceUUID: string, metaAttributeUUID: string) {
    const attributeInstance = await this.findAttributeInstance(instanceUUID, metaAttributeUUID);
    if (!attributeInstance) return;

    await this.claimVizRepUpdate();
    this.eventAggregator.publish("checkForVizRepUpdateByAttributeInstance", attributeInstance);
  }

  /**
   * The attribute instance of `metaAttributeUUID` on any kind of instance, or undefined
   * when the scene no longer holds that instance — which is the ordinary outcome for a
   * mechanism naming something the user has just deleted.
   */
  private async findAttributeInstance(instanceUUID: string, metaAttributeUUID: string): Promise<AttributeInstance | undefined> {
    const instance = await this.instanceUtility.getAnyInstance(instanceUUID);
    if (!instance) return undefined;
    return this.instanceUtility.getAttributeInstanceFromAnyInstance(metaAttributeUUID, instance.uuid, "uuid");
  }

  /** A cached file as a data-URL, for image and icon vizReps. */
  async getImageByUUID(fileUUID: UUID): Promise<string> {
    return this.fileUtility.FiletoDataUrl(this.metaUtility.getFileByUUID(fileUUID));
  }

  /** A cached file as raw bytes, for the glTF and URDF loaders. */
  async getGltfByUUID(fileUUID: UUID): Promise<ArrayBuffer> {
    return this.metaUtility.getFileByUUID(fileUUID).arrayBuffer();
  }
}

// Module singleton — one shared instance.
export const expressionUtility = new ExpressionUtility();
