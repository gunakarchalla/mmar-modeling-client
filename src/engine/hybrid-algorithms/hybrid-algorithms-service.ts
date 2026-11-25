import { Attribute, AttributeInstance, Class, ClassInstance, PortInstance } from "@gds";
import { globalObject } from "@/engine/global-definition";
import { objectspaceAlgorithms } from "@/engine/hybrid-algorithms/objectspace-algorithms";
import { statechangeAlgorithms } from "@/engine/hybrid-algorithms/statechange-algorithms";
import { urdfPoseService, type UrdfTaggedClassInstance } from "@/engine/hybrid-algorithms/urdf-pose-service";
import { instanceUtility } from "@/resources/services/instance-utility";
import { logger } from "@/resources/services/logger";
import { describeError } from "@/resources/util/describe-error";
import {
  ROBOTIC_SYSTEM_SCENETYPE_UUID,
  OBJECTSPACE_SCENETYPE_UUID,
  STATECHANGE_SCENETYPE_UUID,
  OBJECT_3D_ATTRIBUTE_UUID,
  IMAGE_TO_DETECT_ATTRIBUTE_UUID,
  REFERENCE_CLASS_UUID,
} from "@/constants";

/**
 * Dispatcher for the "hybrid algorithms" — per-metamodel behaviours that run OUTSIDE
 * the vizRep pipeline and mutate meshes and attributes directly.
 *
 * Every caller (the attribute window, the table and reference dialogs, the scene tree,
 * copy-scene, the canvas heartbeat) goes through `checkHybridAlgorithms(...)`, and this
 * file decides what applies from the OPEN TAB's scene type — which is why no call site
 * carries a scene-type check of its own. For any other scene type it is a no-op.
 *
 * Routing (all gated on there being an open tab):
 *   Robotic system  a Joint "Origin" table edit re-poses the URDF robot. This branch
 *                   returns, so the passes below never run for a robotic scene.
 *   ObjectSpace     "Object 3D" / "Image to detect" attribute edits swap an instance's mesh.
 *   Statechange     Reference class instances adopt their referenced object's mesh.
 */
export class HybridAlgorithmsService {
  private globalObjectInstance = globalObject;
  private instanceUtility = instanceUtility;
  private objectspaceAlgorithms = objectspaceAlgorithms;
  private statechangeAlgorithms = statechangeAlgorithms;
  private urdfPoseService = urdfPoseService;
  private logger = logger;

  async checkHybridAlgorithms(
    attributeInstance?: AttributeInstance | null,
    classInstances?: ClassInstance[] | null,
    portInstances?: PortInstance[] | null,
    currentClass?: Class | null,
    currentAttribute?: Attribute | null,
  ) {
    // check if any open tabs
    if (this.globalObjectInstance.tabContext.length > 0) {
      const sceneInstance = await this.instanceUtility.getTabContextSceneInstance();

      if (sceneInstance && sceneInstance.uuid_scene_type == ROBOTIC_SYSTEM_SCENETYPE_UUID) {
        // A robotic scene returns unconditionally, whether or not the pass below threw:
        // the ObjectSpace and Statechange passes further down do not apply to it.
        try {
          const currentClassName = (currentClass?.name || "").toLowerCase();
          const currentAttributeName = (currentAttribute?.name || "").toLowerCase();
          // `?.[0]` rather than `[0]`: callers that pass only an attribute instance are
          // routine — setReferenceAttribute does it for every Child/Parent link of a URDF
          // import — and an unguarded index would throw a TypeError per joint, each one
          // surfacing as an error snackbar. The guard below already means "skip when
          // absent".
          const firstClassInstance = classInstances?.[0];
          const hasUrdfRef = !!(firstClassInstance && (firstClassInstance as UrdfTaggedClassInstance).urdfRef);

          if (firstClassInstance && hasUrdfRef && currentClassName === "joint" && currentAttributeName === "origin") {
            // `attributeInstance` here is the EDITED CELL; the caller (TableAttributeDialog)
            // passes the parent Origin table attribute via the class instance's own
            // attribute list.
            await this.urdfPoseService.tryUpdateRobotFromJointOriginEdit(firstClassInstance, attributeInstance!);
          }
        } catch (err) {
          this.logger?.log(`Error handling table attribute change for URDF pose update: ${describeError(err)}`, "error");
        }
        return;
      }

      //if attributeInstance passed
      if (attributeInstance) {
        // a3b35b86-2636-4987-8cc4-814f468f6c4b is the uuid for the ObjectSpace SceneType
        if (sceneInstance && sceneInstance.uuid_scene_type == OBJECTSPACE_SCENETYPE_UUID) {
          //check if there is an augmentation or detectable
          //only check if the attributeInstance is from attribute Object 3D
          if (attributeInstance.uuid_attribute == OBJECT_3D_ATTRIBUTE_UUID) {
            await this.objectspaceAlgorithms.checkAugmentationsInstance(attributeInstance);
          }
          //only check if the attributeInstance is from attribute Image to detect
          if (attributeInstance.uuid_attribute == IMAGE_TO_DETECT_ATTRIBUTE_UUID) {
            await this.objectspaceAlgorithms.checkDetectableInstance(attributeInstance);
          }
        }
      }

      //if classInstances passed
      if (classInstances) {
        //we have to check for each classInstance if there is an augmentation or detectable attribute instance
        const attributeInstancesObject3D = await this.getObject3DAttributeInstances(classInstances);
        for (const object3DAttributeInstance of attributeInstancesObject3D) {
          await this.objectspaceAlgorithms.checkAugmentationsInstance(object3DAttributeInstance);
        }
        const attributeInstancesImageToDetect = await this.getImageToDetectAttributeInstances(classInstances);
        for (const imageAttributeInstance of attributeInstancesImageToDetect) {
          await this.objectspaceAlgorithms.checkDetectableInstance(imageAttributeInstance);
        }

        // ada138a9-646c-4df4-8622-fb79092a9ad0 is the uuid of the clas "Reference"
        const referenceClassInstances = await this.getReferenceClassInstances(classInstances);
        if (referenceClassInstances) {
          for (const classInstance of referenceClassInstances) {
            await this.statechangeAlgorithms.updateThreejsObject(classInstance);
          }
        }
      }

      //if portInstances passed
      if (portInstances) {
        //we have to check for each portInstance if there is an augmentation or detectable attribute instance
        const attributeInstancesObject3D = await this.getObject3DAttributeInstances(portInstances);
        for (const object3DAttributeInstance of attributeInstancesObject3D) {
          await this.objectspaceAlgorithms.checkAugmentationsInstance(object3DAttributeInstance);
        }
        const attributeInstancesImageToDetect = await this.getImageToDetectAttributeInstances(portInstances);
        for (const imageAttributeInstance of attributeInstancesImageToDetect) {
          await this.objectspaceAlgorithms.checkDetectableInstance(imageAttributeInstance);
        }
      }

      //run hybrid algorithm for Statechange -> reference
      // 239c5597-6cc9-498a-bf61-432cf85b3835 is the uuid for the ObjectSpace Statechange
      if (sceneInstance && sceneInstance.uuid_scene_type == STATECHANGE_SCENETYPE_UUID) {
        //check if there is an Reference Class Instance
        await this.statechangeAlgorithms.checkForReference();
      }
    }
  }

  async getObject3DAttributeInstances(parentInstances: ClassInstance[] | PortInstance[]) {
    return this.collectAttributeInstances(parentInstances, OBJECT_3D_ATTRIBUTE_UUID);
  }

  async getImageToDetectAttributeInstances(parentInstances: ClassInstance[] | PortInstance[]) {
    return this.collectAttributeInstances(parentInstances, IMAGE_TO_DETECT_ATTRIBUTE_UUID);
  }

  /**
   * Two near-identical lookups (Object 3D / Image to detect)
   * as two byte-identical methods differing only in the uuid they filter on; folded into
   * one helper. Both public methods are kept — they are part of the class's surface and
   * the ports/classes branches above call them by name.
   *
   * The `attribute_instance` / `attribute_instances` double-read is NOT redundant: gds
   * names the field `attribute_instance` on ClassInstance and PortInstance, and the old
   * client read both spellings defensively. Kept.
   */
  private collectAttributeInstances(
    parentInstances: ClassInstance[] | PortInstance[],
    uuidAttribute: string,
  ): AttributeInstance[] {
    let attributeInstances: AttributeInstance[] = [];
    for (const parentInstance of parentInstances) {
      const bag = parentInstance as unknown as {
        attribute_instance?: AttributeInstance[];
        attribute_instances?: AttributeInstance[];
      };
      //check if there is a property attribute_instance
      if (bag.attribute_instance) {
        attributeInstances = attributeInstances.concat(bag.attribute_instance);
      }
      //check if there is a property attribute_instances
      if (bag.attribute_instances) {
        attributeInstances = attributeInstances.concat(bag.attribute_instances);
      }
    }
    return attributeInstances.filter((attributeInstance) => attributeInstance.uuid_attribute == uuidAttribute);
  }

  async updateHybridAlgorithmAttributes() {
    // check if open tab is an ObjectSpace Scene
    if (this.globalObjectInstance.tabContext.length > 0) {
      const sceneInstance = await this.instanceUtility.getTabContextSceneInstance();
      // if sceneInstance is a Statechange SceneType
      if (sceneInstance?.uuid_scene_type == STATECHANGE_SCENETYPE_UUID) {
        //update the reference class attribute instance values
        await this.statechangeAlgorithms.updateReferenceClassAttributeInstanceValues();
      }
    }
  }

  async getReferenceClassInstances(classInstances: ClassInstance[]) {
    const referenceClassInstances: ClassInstance[] = [];
    for (const classInstance of classInstances) {
      if (classInstance.uuid_class == REFERENCE_CLASS_UUID) {
        referenceClassInstances.push(classInstance);
      }
    }
    return referenceClassInstances;
  }
}

// Module singleton — one shared instance.
export const hybridAlgorithmsService = new HybridAlgorithmsService();
