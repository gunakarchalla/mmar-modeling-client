import {
  UUID,
  SceneInstance,
  ClassInstance,
  RelationclassInstance,
  AttributeInstance,
  PortInstance,
  ObjectInstance,
} from "@gds";
import * as THREE from "three";
import { globalObject } from "@/engine/global-definition";
import { eventBus } from "./event-bus";
import { logger } from "./logger";
import { metaUtility } from "./meta-utility";
import { useTabsStore } from "@/resources/store/tabsStore";

/**
 * Lookups over the INSTANCE side of the model: finding class, relation class, port,
 * scene and attribute instances by uuid, and collecting them across the open tabs.
 *
 * "Local" here means the scene tree already in memory (`globalObject.sceneTree`), not
 * the database — these are hot paths called from the render loop and from every vizRep
 * expression, so they never hit the network unless the method says so in its name.
 *
 * `createTabContextSceneInstance` is the single place a tab is created: it pushes onto
 * `globalObject.tabContext` and drives `tabsStore` in lockstep, which is what keeps the
 * store's index authoritative for the rest of the app.
 */
/**
 * Find an attribute instance in a list, by the uuid or the name of its meta attribute.
 * Which of the two `searchValue` means is decided by `searchBy`.
 */
function findAttributeInstance(
  instances: AttributeInstance[],
  searchValue: string | UUID,
  searchBy: "uuid" | "name",
): AttributeInstance | undefined {
  return searchBy === "uuid"
    ? instances.find((instance) => instance.uuid_attribute == searchValue)
    : instances.find((instance) => instance.name == searchValue);
}

export class InstanceUtility {
  private globalObjectInstance = globalObject;
  private metaUtility = metaUtility;
  private logger = logger;
  private eventAggregator = eventBus;

  // Function to get current tab context sceneInstance
  async getTabContextSceneInstance() {
    const tabContext = this.globalObjectInstance.tabContext[this.globalObjectInstance.selectedTab];
    if (tabContext && tabContext["sceneInstance"]) {
      const sceneInstance: SceneInstance = tabContext["sceneInstance"];
      return sceneInstance;
    }
    this.logger.log("no sceneInstance found", "close");
    return undefined;
  }

  async getAllOpenThreeScenes() {
    const tabContext = this.globalObjectInstance.tabContext;
    const threeScenes: THREE.Scene[] = [];
    for (const tab of tabContext) {
      threeScenes.push(tab.threeScene);
    }
    return threeScenes;
  }

  async getAllOpenSceneInstances() {
    const tabContext = this.globalObjectInstance.tabContext;
    const sceneInstances: SceneInstance[] = [];
    for (const tab of tabContext) {
      sceneInstances.push(tab.sceneInstance);
    }
    return sceneInstances;
  }

  // Create a new tab context for the sceneInstance.
  async createTabContextSceneInstance(sceneInstance: SceneInstance) {
    const sceneType = await this.metaUtility.getSceneTypeByUUID(sceneInstance.uuid_scene_type);
    if (!sceneType) {
      throw new Error(
        `Could not resolve scene type ${sceneInstance.uuid_scene_type} for scene instance ${sceneInstance.uuid}.`,
      );
    }

    const threeScene = this.globalObjectInstance.scene;
    threeScene.uuid = sceneInstance.uuid;

    const newTabContext = {
      sceneType: sceneType,
      sceneInstance: sceneInstance,
      threeScene: threeScene,
      contextDragObjects: [] as THREE.Mesh[],
      isShared: false,
    };

    this.globalObjectInstance.tabContext.push(newTabContext);
    this.globalObjectInstance.selectedTab = this.globalObjectInstance.tabContext.length - 1;

    // SINGLE MUTATION PATH: this is the one place a tab is created, so it drives the
    // reactive tabsStore in lockstep with globalObject.tabContext. openTab appends and
    // selects at the same index just set on the engine, which keeps
    // store.selectedTab === globalObject.selectedTab.
    useTabsStore.getState().openTab({
      name: sceneInstance.name ?? "",
      uuid: sceneInstance.uuid,
      isShared: false,
    });

    this.eventAggregator.publish("tabChanged");
    this.globalObjectInstance.dragObjects = newTabContext.contextDragObjects;
    return newTabContext;
  }

  // Function to get the classInstance with the given UUID
  async getClassInstance(uuid: UUID) {
    const sceneInstance = await this.getTabContextSceneInstance();
    let instance_of_uuid: ClassInstance | RelationclassInstance | undefined =
      sceneInstance!.class_instances.find((classInstance) => classInstance.uuid == uuid);
    if (instance_of_uuid) {
      return instance_of_uuid;
    } else {
      instance_of_uuid = sceneInstance!.relationclasses_instances.find(
        (relationclassInstance) => relationclassInstance.uuid == uuid,
      );
      if (instance_of_uuid) {
        return instance_of_uuid;
      }
      //if not in tabContext search in all classes
      else {
        const classInstances = await this.getAllClassInstances();
        instance_of_uuid = classInstances.find((classInstance) => classInstance.uuid == uuid);
        if (instance_of_uuid) {
          return instance_of_uuid;
        } else {
          const relationclassInstances = await this.getAllRelationClassInstances();
          instance_of_uuid = relationclassInstances.find(
            (relationclassInstance) => relationclassInstance.uuid == uuid,
          );
          if (instance_of_uuid) {
            return instance_of_uuid;
          }
        }
      }
    }
  }

  // Function to get all classInstances from local
  async getAllClassInstances() {
    let classInstances: ClassInstance[] = [];
    const sceneInstances = await this.getAllSceneInstancesFromLocal();
    for (const sceneInstance of sceneInstances) {
      classInstances = classInstances.concat(sceneInstance.class_instances);
    }
    return classInstances;
  }

  // retrieves all class and relation class instances of the open scene instance
  async getAllClassInstancesFromOpenSceneInstance() {
    const sceneInstance = await this.getTabContextSceneInstance();
    let instances: (ClassInstance | RelationclassInstance)[] = sceneInstance!.class_instances || [];
    instances = instances.concat(sceneInstance!.relationclasses_instances || []);
    return instances;
  }

  async getAllRelationClassInstances() {
    let relationclassInstances: RelationclassInstance[] = [];
    const sceneInstances = await this.getAllSceneInstancesFromLocal();
    for (const sceneInstance of sceneInstances) {
      relationclassInstances = relationclassInstances.concat(sceneInstance.relationclasses_instances);
    }
    return relationclassInstances;
  }

  // Function to get the sceneInstance with the given UUID
  async getSceneInstance(uuid: UUID) {
    let instance_of_uuid = await this.getTabContextSceneInstance();
    if (uuid == instance_of_uuid!.uuid) {
      return instance_of_uuid;
    }
    //if not in tabContext search in all sceneInstances
    else {
      const sceneInstances = await this.getAllSceneInstancesFromLocal();
      instance_of_uuid = sceneInstances.find((sceneInstance) => sceneInstance.uuid == uuid);
    }
    return instance_of_uuid;
  }

  async getAllSceneInstancesFromLocal() {
    const sceneInstances: SceneInstance[] = [];
    for (const sceneType of this.globalObjectInstance.sceneTree) {
      const children = sceneType.children;
      for (const sceneInstance of children) {
        if (children.length > 0 && this.checkIfSceneInstance(sceneInstance)) {
          sceneInstances.push(sceneInstance);
        }
      }
    }
    return sceneInstances;
  }

  /**
   * Every port instance of a scene: the scene's own, plus those of its class and
   * relation class instances.
   */
  private portInstancesOf(sceneInstance: SceneInstance): PortInstance[] {
    return [
      ...sceneInstance.port_instances,
      ...sceneInstance.class_instances.flatMap((classInstance) => classInstance.port_instance),
      ...sceneInstance.relationclasses_instances.flatMap((relationclassInstance) => relationclassInstance.port_instance),
    ];
  }

  // Function to get all portInstances of every locally loaded scene
  async getAllPortInstances() {
    const sceneInstances = await this.getAllSceneInstancesFromLocal();
    return sceneInstances.flatMap((sceneInstance) => this.portInstancesOf(sceneInstance));
  }

  // Function to get the portInstances of the open tab context
  async getAllPortInstancesOfTabContext() {
    const tabContext = this.globalObjectInstance.tabContext[this.globalObjectInstance.selectedTab];
    return this.portInstancesOf(tabContext.sceneInstance);
  }

  // Function to get the portInstance with the given UUID
  async getPortInstance(uuid: UUID): Promise<PortInstance | undefined> {
    const allPortInstances = await this.getAllPortInstances();
    return allPortInstances.find((portInstance) => portInstance.uuid == uuid);
  }

  // Function to get the UUID of the last created classInstance (class or relation)
  async get_current_class_instance_uuid() {
    const uuid: UUID = this.globalObjectInstance.current_class_instance.uuid;
    return uuid;
  }

  //check if input is sceneInstance
  checkIfSceneInstance(toBeDetermined: any): toBeDetermined is SceneInstance {
    if ((toBeDetermined as SceneInstance).uuid_scene_type) {
      return true;
    }
    return false;
  }

  // get an attributeInstance based on the UUID or the name of the meta attribute and the UUID of a classInstance
  async getAttributeInstanceFromClassInstance(
    searchValue: string | UUID,
    classInstanceUUID: UUID,
    searchBy: "uuid" | "name",
  ) {
    let attributeInstance: AttributeInstance | undefined = undefined;

    // Search in classInstances
    const classInstances = await this.getAllClassInstances();
    const classInstanceFound = classInstances.find((instance) => instance.uuid == classInstanceUUID);
    if (classInstanceFound) {
      const allAttributeInstances = classInstanceFound.attribute_instance;
      attributeInstance = findAttributeInstance(allAttributeInstances, searchValue, searchBy);
    }

    return attributeInstance;
  }

  // get an attributeInstance based on the UUID or the name of the meta attribute and the UUID of a relationclassInstance
  async getAttributeInstanceFromRelationClassInstance(
    searchValue: string | UUID,
    relationclassInstanceUUID: UUID,
    searchBy: "uuid" | "name",
  ) {
    let attributeInstance: AttributeInstance | undefined = undefined;

    // Search in relationclassInstances
    const relationclassInstances = await this.getAllRelationClassInstances();
    const relationclassInstanceFound = relationclassInstances.find(
      (instance) => instance.uuid == relationclassInstanceUUID,
    );
    if (relationclassInstanceFound) {
      const allAttributeInstances = relationclassInstanceFound.attribute_instance;
      attributeInstance = findAttributeInstance(allAttributeInstances, searchValue, searchBy);
    }

    return attributeInstance;
  }

  /**
   * Collects all attribute instances from an instanceObject recursively.
   * This also includes attribute instances from nested objects.
   * @param obj - The object to collect attribute instances from.
   * @returns A promise that resolves to an array of attribute instances.
   */
  async getAllAttributeInstancesFromObjectInstanceRecursively(
    obj: ObjectInstance,
  ): Promise<AttributeInstance[]> {
    const attributeInstances: AttributeInstance[] = [];

    if (Array.isArray(obj)) {
      for (const item of obj) {
        attributeInstances.push(
          ...(await this.getAllAttributeInstancesFromObjectInstanceRecursively(item)),
        );
      }
    } else if (obj && typeof obj === "object") {
      const anyObj = obj as any;
      for (const key of Object.keys(obj)) {
        if (key === "attribute_instance" && Array.isArray(anyObj[key])) {
          attributeInstances.push(...anyObj[key]);
        } else {
          attributeInstances.push(
            ...(await this.getAllAttributeInstancesFromObjectInstanceRecursively(anyObj[key])),
          );
        }
      }
    }
    return attributeInstances;
  }

  // get an attributeInstance based on the UUID or the name of the meta attribute and the UUID of a portInstance
  async getAttributeInstanceFromPortInstance(
    searchValue: string | UUID,
    portInstanceUUID: UUID,
    searchBy: "uuid" | "name",
  ) {
    let attributeInstance: AttributeInstance | undefined = undefined;

    // Search in portInstances
    const portInstances: PortInstance[] = await this.getAllPortInstances();
    const portInstanceFound = portInstances.find((instance) => instance.uuid == portInstanceUUID);
    if (portInstanceFound) {
      const allAttributeInstances = portInstanceFound.attribute_instances;
      attributeInstance = findAttributeInstance(allAttributeInstances, searchValue, searchBy);
    }

    return attributeInstance;
  }

  // get an attributeInstance based on the UUID or the name of the meta attribute and the UUID of an instance of any type
  async getAttributeInstanceFromAnyInstance(
    searchValue: string | UUID,
    instanceUUID: UUID,
    searchBy: "uuid" | "name",
  ) {
    let attributeInstance: AttributeInstance | undefined = undefined;

    // Search in classInstances
    const classInstances = await this.getAllClassInstances();
    const classInstanceFound = classInstances.find((instance) => instance.uuid == instanceUUID);
    if (classInstanceFound) {
      const allAttributeInstances = classInstanceFound.attribute_instance;
      attributeInstance = findAttributeInstance(allAttributeInstances, searchValue, searchBy);
    }

    // If not found in classInstances, search in relationclassInstances
    if (!attributeInstance) {
      const relationclassInstances = await this.getAllRelationClassInstances();
      const relationclassInstanceFound = relationclassInstances.find(
        (instance) => instance.uuid == instanceUUID,
      );
      if (relationclassInstanceFound) {
        const allAttributeInstances = relationclassInstanceFound.attribute_instance;
        attributeInstance = findAttributeInstance(allAttributeInstances, searchValue, searchBy);
      }
    }

    // If not found in relationclassInstances, search in sceneInstances
    if (!attributeInstance) {
      const sceneInstances = await this.getAllSceneInstancesFromLocal();
      const sceneInstanceFound = sceneInstances.find((instance) => instance.uuid == instanceUUID);
      if (sceneInstanceFound) {
        const allAttributeInstances = sceneInstanceFound.attribute_instances;
        attributeInstance = findAttributeInstance(allAttributeInstances, searchValue, searchBy);
      }
    }

    // If not found in sceneInstances, search in portInstances
    if (!attributeInstance) {
      const portInstances: PortInstance[] = await this.getAllPortInstances();
      const portInstanceFound = portInstances.find((instance) => instance.uuid == instanceUUID);
      if (portInstanceFound) {
        const allAttributeInstances = portInstanceFound.attribute_instances;
        attributeInstance = findAttributeInstance(allAttributeInstances, searchValue, searchBy);
      }
    }

    return attributeInstance;
  }

  async getAnyInstance(uuid: UUID) {
    let instance:
      | SceneInstance
      | ClassInstance
      | RelationclassInstance
      | PortInstance
      | AttributeInstance
      | undefined;
    // Check in scene instances first
    instance = (await this.getAllSceneInstancesFromLocal()).find((inst) => inst.uuid === uuid);
    if (instance) return instance;

    // Check in class instances
    instance = (await this.getAllClassInstances()).find((inst) => inst.uuid === uuid);
    if (instance) return instance;

    // Check in relation class instances
    instance = (await this.getAllRelationClassInstances()).find((inst) => inst.uuid === uuid);
    if (instance) return instance;

    // Check in port instances
    instance = (await this.getAllPortInstances()).find((inst) => inst.uuid === uuid);
    if (instance) return instance;

    // Check in the current scene's attribute instances
    const currentSceneInstance = await this.getTabContextSceneInstance();
    if (currentSceneInstance) {
      instance = (
        await this.getAllAttributeInstancesFromObjectInstanceRecursively(currentSceneInstance)
      ).find((inst) => inst.uuid === uuid);
      if (instance) return instance;
    }

    // Check in all scene instances' attribute instances
    for (const sceneInstance of await this.getAllSceneInstancesFromLocal()) {
      instance = (
        await this.getAllAttributeInstancesFromObjectInstanceRecursively(sceneInstance)
      ).find((inst) => inst.uuid === uuid);
      if (instance) return instance;
    }

    return null;
  }

  // retrieves all relations where the given instance is the destination and optionally filters by a specific relation type (metaClassUUID)
  async getIncomingRelationsFromInstance(instanceUUID: UUID, metaClassUUID: UUID | null = null) {
    const relationClasses = await this.getAllRelationClassInstances();
    let incomingRelations = relationClasses?.filter(
      (rel) => rel.role_instance_to?.uuid_has_reference_class_instance === instanceUUID,
    );
    if (metaClassUUID) {
      incomingRelations = incomingRelations?.filter((rel) => rel.uuid_relationclass == metaClassUUID);
    }
    return incomingRelations;
  }

  // retrieves all relations where the given instance is the source and optionally filters by a specific relation type (metaClassUUID)
  async getOutgoingRelationsFromInstance(instanceUUID: UUID, metaClassUUID: UUID | null = null) {
    const relationClasses = await this.getAllRelationClassInstances();
    let outgoingRelations = relationClasses.filter(
      (rel) => rel.role_instance_from.uuid_has_reference_class_instance == instanceUUID,
    );
    if (metaClassUUID) {
      outgoingRelations = outgoingRelations.filter((rel) => rel.uuid_relationclass == metaClassUUID);
    }
    return outgoingRelations;
  }
}

// Module singleton — one shared instance.
export const instanceUtility = new InstanceUtility();
