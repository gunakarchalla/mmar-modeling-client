import { AttributeInstance, ClassInstance, PortInstance, RelationclassInstance, SceneInstance } from "@gds";
import { globalObject } from "@/engine/global-definition";
import { graphicContext } from "@/engine/graphic-context";
import { instanceUtility } from "@/resources/services/instance-utility";
import { metaUtility } from "@/resources/services/meta-utility";
import { eventBus } from "@/resources/services/event-bus";
import { runExclusive } from "@/resources/services/draw-lock";
import { logger } from "@/resources/services/logger";
import { describeError } from "@/resources/util/describe-error";

/**
 * Re-runs a concept's vizRep when one of the attributes it reads changes.
 *
 * Both entry points are bus channels, subscribed in the constructor — which is why
 * importing this module is load-bearing: `checkForVizRepUpdate` re-evaluates every
 * instance of the open scene, `checkForVizRepUpdateByAttributeInstance` just the
 * instance owning one attribute.
 *
 * An update only runs when the meta attribute's NAME or uuid actually appears in the
 * concept's vizRep code string, so editing a value nothing draws costs nothing. Custom
 * variables that are not `user_locked` are dropped first so the re-run recomputes them,
 * while anything the user positioned by hand survives.
 *
 * Serialisation is the DRAW LANE (`runExclusive`), not `globalObject.readyForVizRepUpdate`
 * — that flag is only a "an update is in flight" signal for the request side, which
 * expression-utility waits on before asking for another; nothing waits on it before
 * STARTING one. It is still released in a `finally`, because leaving it set would wedge
 * every later request in a spin.
 */
export class VizrepUpdateChecker {
  private instanceUtility = instanceUtility;
  private metaUtility = metaUtility;
  private gc = graphicContext;
  private globalObjectInstance = globalObject;
  private eventAggregator = eventBus;

  constructor() {
    //event listener for the vizrep update
    //it is not ideal since we loose the synchronization between the event and the function call
    this.eventAggregator.subscribe("checkForVizRepUpdate", () => {
      void this.checkForVisualizationUpdate().catch((err) => logger.log("vizrep update failed: " + describeError(err), "error"));
    });

    //event listener for the vizrep update for specific attribute instances
    this.eventAggregator.subscribe("checkForVizRepUpdateByAttributeInstance", (payload) => {
      void this.checkForVizRepUpdate(payload as AttributeInstance).catch((err) => logger.log("vizrep update failed: " + describeError(err), "error"));
    });
  }

  /**
   * A concept without a vizRep function (`geometry` is nullable, and EVERY example
   * metamodel's SceneType has it null) has nothing to re-run — dereferencing it anyway
   * meant editing a scene-instance attribute threw
   * "Cannot read properties of null (reading 'toString')" before it could do anything.
   * Both the null geometry and a missing owner instance now short-circuit the update.
   */
  private geometryOf(concept: { geometry?: unknown } | undefined | null): string {
    const geometry = concept?.geometry;
    return geometry ? geometry.toString() : "";
  }

  /**
   * On the draw lane, because this re-runs a vizRep through the SHARED graphic context —
   * the same one a click, a peer's arriving change and every other vizRep update draw
   * into. `readyForVizRepUpdate` never provided that: nothing WAITS on it before
   * starting (it only gates expression-utility's request-side spin), so two updates
   * launched back to back from the same remote batch used to run at once, merge each
   * other's half-built meshes into one instance, and leave the other with the empty map
   * the first one's `resetInstance()` left behind — an instance that simply vanished
   * from the canvas, with nothing logged.
   */
  async checkForVizRepUpdate(attributeInstance: AttributeInstance) {
    return runExclusive(() => this.updateExclusive(attributeInstance));
  }

  private async updateExclusive(attributeInstance: AttributeInstance) {
    //if not set yet lock the vizrep update until the current update is finished
    this.globalObjectInstance.readyForVizRepUpdate = false;

    // The pipeline learns WHICH instance it is drawing from `current_class_instance`, so
    // the update below borrows that field — and has to give it back. It is also what a
    // Delete keypress acts on (`deletionHandler.onPressDelete` reads it and nothing
    // else, with no cross-check against the actual selection), so an attribute a PEER
    // edited used to leave the local user's next Delete aimed at the peer's element —
    // no timing coincidence required, and no selection visible on screen to explain it.
    const previousClassInstance = this.globalObjectInstance.current_class_instance;

    // Both are released in `finally`, including on the early returns below: the flag
    // gates expression-utility's wait loop, so leaving it set wedges every later refresh
    // in a spin, and leaving the borrowed instance behind is the delete bug above.
    try {
      this.gc.current_instance_object = undefined as any;
      this.gc.resetInstance();

      let objectInstance: ClassInstance | PortInstance | RelationclassInstance | SceneInstance | null = null;
      let geometryAsString = "";
      //retrieve instance where attributeInstance belongs to

      let classInstance: ClassInstance | undefined;
      let relationclassInstances: RelationclassInstance[];
      let relationclassInstance: RelationclassInstance | undefined;

      // check if the attribute instance belongs to a class instance or a relationclass instance
      if (attributeInstance.assigned_uuid_class_instance) {
        relationclassInstances = await this.instanceUtility.getAllRelationClassInstances();

        // find the relationcalss instance where the attribute instance belongs to
        relationclassInstance = relationclassInstances.find((relationclassInstance) => relationclassInstance.uuid == attributeInstance.assigned_uuid_class_instance);

        // if the relationclass instance is not found, the attribute instance belongs to a class instance
        if (!relationclassInstance) {
          classInstance = await this.instanceUtility.getClassInstance(attributeInstance.assigned_uuid_class_instance);
        }

        // set the object instance to the class instance if
        objectInstance = relationclassInstance ? relationclassInstance : classInstance!;
        if (!objectInstance) return;
        //set the globalObjectInstance.current_class_instance to the object instance
        //this is important for the vizrep update. The vizrep update needs to know the current class instance for relationclass instances and class instances
        this.globalObjectInstance.current_class_instance = objectInstance;

        // get the meta class or relation
        const metaClass = relationclassInstance ? await this.metaUtility.getMetaRelationclass(relationclassInstance.uuid_relationclass) : await this.metaUtility.getMetaClass(classInstance!.uuid_class);
        // set the current instance object to the object instance of the graphic context
        this.gc.current_instance_object = objectInstance;

        // set the geometry string
        geometryAsString = this.geometryOf(metaClass);
      }
      //if it was not a class instance or relationclass instance, check if it is a port instance
      else if (attributeInstance.assigned_uuid_port_instance) {
        const portInstance = await this.instanceUtility.getPortInstance(attributeInstance.assigned_uuid_port_instance);
        if (!portInstance) return;
        objectInstance = portInstance;
        geometryAsString = this.geometryOf(await this.metaUtility.getMetaPort(portInstance.uuid_port));
      }
      //if it was not a port instance, check if it is a scene instance
      else if (attributeInstance.assigned_uuid_scene_instance) {
        objectInstance = (await this.instanceUtility.getSceneInstance(attributeInstance.assigned_uuid_scene_instance)) ?? null;
        if (!objectInstance) return;
        geometryAsString = this.geometryOf(await this.metaUtility.getSceneTypeByUUID(objectInstance.uuid_scene_type));
      }

      // nothing to re-run: the concept draws nothing (a SceneType normally has no
      // vizRep of its own), so the value change cannot affect any geometry
      if (!geometryAsString) return;

      // get the meta attribute name
      const metaAttributeUUID = attributeInstance.uuid_attribute;
      const metaAttribute = await this.metaUtility.getMetaAttribute(metaAttributeUUID);
      const metaAttributeName = metaAttribute ? metaAttribute.name : null;

      // check if the meta attribute is referenced in the geometry attribute
      // we only update the vizrep if the meta attribute is referenced in the geometry attribute
      // If the meta attribute is referenced in the geometry attribute, the geometry attribute has to be updated
      if ((metaAttributeName && geometryAsString.includes(metaAttributeName)) || geometryAsString.includes(metaAttributeUUID)) {
        // get all custom_variables
        const customVariables = objectInstance!.custom_variables as any;

        // for each custom_variable (key) in the customVariables object, check if it the value user_locked is true, if not, store it in an array to be updated
        // this is necessary because we only want to update the custom variables that are not user_locked
        // e.g. a label the user dragged must not snap back to its computed position
        const customVariablesToUpdate: string[] = [];
        for (const key in customVariables) {
          if (customVariables[key].user_locked === false) {
            customVariablesToUpdate.push(key);
          }
        }

        // remove the custom variable from the object instance if not user_locked
        // the custom_variables will then be updated in the vizrep update
        for (const key of customVariablesToUpdate) {
          delete (objectInstance!.custom_variables as any)[key];
        }

        // run the vizrep function and call the update vizrep function to update the vizrep
        await this.gc.runVizRepFunction(geometryAsString);
        await this.gc.updateVizRep(objectInstance!);
      }
    } finally {
      // hand the borrowed instance back to whatever the local user had selected
      this.globalObjectInstance.current_class_instance = previousClassInstance;
      // unlock the vizrep update
      this.globalObjectInstance.readyForVizRepUpdate = true;
    }
  }

  /**
   * Checks for visualization updates.
   */
  async checkForVisualizationUpdate() {
    //get all attributeInstances that are assigned to the current sceneInstance, its classInstances, relationclassInstances and portInstances
    const sceneInstance = this.globalObjectInstance.tabContext[this.globalObjectInstance.selectedTab].sceneInstance;
    let attributeInstances: AttributeInstance[] = sceneInstance.attribute_instances;

    attributeInstances = [...attributeInstances, ...(await this.instanceUtility.getAllAttributeInstancesFromObjectInstanceRecursively(sceneInstance))];

    // Create a Set to track processed class instance UUIDs
    const processedClassInstanceUUIDs = new Set<string>();

    //for each attribute run the checkForVizRepUpdate function
    for (const attributeInstance of attributeInstances) {
      if (attributeInstance.assigned_uuid_class_instance && !processedClassInstanceUUIDs.has(attributeInstance.assigned_uuid_class_instance)) {
        await this.checkForVizRepUpdate(attributeInstance);
        processedClassInstanceUUIDs.add(attributeInstance.assigned_uuid_class_instance);
      }
    }
  }
}

// Module singleton — one shared instance.
export const vizrepUpdateChecker = new VizrepUpdateChecker();
