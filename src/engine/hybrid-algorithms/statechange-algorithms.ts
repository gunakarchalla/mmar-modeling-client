import * as THREE from "three";
import { AttributeInstance, ClassInstance } from "@gds";
import { globalObject } from "@/engine/global-definition";
import { instanceUtility } from "@/resources/services/instance-utility";
import {
  REFERENCE_CLASS_UUID,
  AUGMENTATION_REFERENCE_ATTRIBUTE_UUID,
  REFERENCE_POSITION_X_ATTRIBUTE_UUID,
  REFERENCE_POSITION_Y_ATTRIBUTE_UUID,
  REFERENCE_POSITION_Z_ATTRIBUTE_UUID,
  REFERENCE_ROTATION_X_ATTRIBUTE_UUID,
  REFERENCE_ROTATION_Y_ATTRIBUTE_UUID,
  REFERENCE_ROTATION_Z_ATTRIBUTE_UUID,
  REFERENCE_ROTATION_W_ATTRIBUTE_UUID,
  REFERENCE_SET_ROTATION_ATTRIBUTE_UUID,
  REFERENCE_SET_POSITION_ATTRIBUTE_UUID,
} from "@/constants";

/**
 * Hybrid algorithms for the Statechange metamodel, reached through
 * `hybridAlgorithmsService` and never directly.
 *
 * Its "Reference" class points at an instance in another open scene. These three
 * algorithms keep the reference's three.js object in sync with it:
 *   - `checkForReference()` adopts the referenced object's geometry and material.
 *   - `updateThreejsObject(ci)` pushes the instance's pose ATTRIBUTES onto its object.
 *   - `updateReferenceClassAttributeInstanceValues()` does the reverse, reading the
 *     object's pose back into the attributes (driven by the canvas heartbeat, 1 Hz).
 * The last two only act while the instance's own "Set Position" / "Set Rotation" flag
 * attributes hold the string "true".
 *
 * TYPES: gds declares `AttributeInstance.value` as a string, but the pose values are
 * written and read here as raw numbers and fed straight into `new THREE.Quaternion(...)`,
 * relying on JS coercion (`"0.5" != 0.5` is false, and THREE's maths coerces through `*`).
 * The casts keep that behaviour: running the values through `Number()` would change what
 * an empty or "undefined" value does.
 */
export class StatechangeAlgorithms {
  private globalObjectInstance = globalObject;
  private instanceUtility = instanceUtility;

  async checkForReference() {
    //ada138a9-646c-4df4-8622-fb79092a9ad0 is the uuid for the Reference metaclass
    //get all Reference classInstances
    const currentSceneInstance = await this.instanceUtility.getTabContextSceneInstance();
    if (!currentSceneInstance) return;
    const referenceInstances = currentSceneInstance.class_instances.filter(
      (classInstance) => classInstance.uuid_class == REFERENCE_CLASS_UUID,
    );

    //for each referenceInstance
    for (const referenceInstance of referenceInstances) {
      //get the attributeInstance of the attribute b8d05324-ed3b-4c10-885a-164ec15a0f36 -> Augmentation_Reference
      const augmentationReferenceAttributeInstances = referenceInstance.attribute_instance.filter(
        (attribute_instance) => attribute_instance.uuid_attribute == AUGMENTATION_REFERENCE_ATTRIBUTE_UUID,
      );
      //if there is an attributeInstance
      if (
        augmentationReferenceAttributeInstances.length > 0 &&
        augmentationReferenceAttributeInstances[0].value != "" &&
        augmentationReferenceAttributeInstances[0].role_instance_from
      ) {
        const roleInstanceFrom = augmentationReferenceAttributeInstances[0].role_instance_from;
        const uuid_has_reference_class_instance = roleInstanceFrom.uuid_has_reference_class_instance;

        //case 1: reference to class instance
        //we replace the referenceInstance object with the referenced object
        if (uuid_has_reference_class_instance) {
          //find the 3D object in any scene of the tabContext
          const allOpenThreeScenes: THREE.Scene[] = await this.instanceUtility.getAllOpenThreeScenes();
          //find the 3D object in any scene of the tabContext
          let object: THREE.Mesh | undefined = undefined;
          for (const threeScene of allOpenThreeScenes) {
            object = threeScene.getObjectByProperty("uuid", uuid_has_reference_class_instance) as
              | THREE.Mesh
              | undefined;
            if (object) {
              break;
            }
          }

          //if there is an object we replace the referenceInstance object with the found object
          if (object) {
            //get the 3D object of the referenceInstance
            const threeScene = this.globalObjectInstance.scene;
            const referenceObject = threeScene.getObjectByProperty("uuid", referenceInstance.uuid) as
              | THREE.Mesh
              | undefined;
            //we replace the referenceInstance object with the found object
            if (referenceObject) {
              referenceObject.geometry = object.geometry;
              referenceObject.material = object.material;
            }
          }
        }
        // References to a scene, a relation class or a port instance are recognised by
        // the metamodel but have no adoption behaviour yet.
      }
    }
  }

  //method to set the attributeInstance values of the Reference metaclass instances according to the threejs values
  async updateReferenceClassAttributeInstanceValues() {
    //get classes of the current scene
    const currentSceneInstance = await this.instanceUtility.getTabContextSceneInstance();
    if (!currentSceneInstance) return;
    //get all Reference classInstances
    const referenceInstances = currentSceneInstance.class_instances.filter(
      (classInstance) => classInstance.uuid_class == REFERENCE_CLASS_UUID,
    );
    const threeScene = this.globalObjectInstance.scene;
    //for each referenceInstance
    for (const referenceInstance of referenceInstances) {
      const referenceObject = threeScene.getObjectByProperty("uuid", referenceInstance.uuid);
      if (referenceObject) {
        const position = referenceObject.position;
        const rotation = referenceObject.quaternion;

        const find = (uuid: string) =>
          referenceInstance.attribute_instance.find(
            (attribute_instance) => attribute_instance.uuid_attribute == uuid,
          );

        //get the attributeInstance of the attribute 5a038d67-bc1a-4881-86e8-f53f37dae5d6 -> Position X
        const positionX = find(REFERENCE_POSITION_X_ATTRIBUTE_UUID);
        //get the attributeInstance of the attribute 455eae8f-35c7-44f9-8909-468972f53341 -> Position Y
        const positionY = find(REFERENCE_POSITION_Y_ATTRIBUTE_UUID);
        //get the attributeInstance of the attribute d84b02fd-3c04-4612-82f5-b7a1eb95a7c4 -> Position Z
        const positionZ = find(REFERENCE_POSITION_Z_ATTRIBUTE_UUID);
        //get the attributeInstance of the attribute 21ae60ea-be54-432c-a7c5-c66085f098a8 -> Rotation X
        const rotationX = find(REFERENCE_ROTATION_X_ATTRIBUTE_UUID);
        //get the attributeInstance of the attribute 35eaa212-71c2-4b15-8da9-4dc29be6b4e4 -> Rotation Y
        const rotationY = find(REFERENCE_ROTATION_Y_ATTRIBUTE_UUID);
        //get the attributeInstance of the attribute 8a4d3bc4-3dfb-4145-983c-dafe42a4b26e -> Rotation Z
        const rotationZ = find(REFERENCE_ROTATION_Z_ATTRIBUTE_UUID);
        //get the attributeInstance of the attribute e4e03c44-63e9-4d36-9304-a8fea5300cd3 -> Rotation W
        const rotationW = find(REFERENCE_ROTATION_W_ATTRIBUTE_UUID);
        // get the attributeInstance of the attribute 3a5b4525-4616-49f5-a5b1-2f9f4d8ec483 -> Set Rotation
        const setRotation = find(REFERENCE_SET_ROTATION_ATTRIBUTE_UUID);
        // get the attributeInstance of the attribute 043daf98-2cdd-4b85-9e7a-8d983c43f565 -> Set Position
        const setPosition = find(REFERENCE_SET_POSITION_ATTRIBUTE_UUID);

        // `?.value` rather than a bare dereference keeps
        // the same outcome (a missing flag !== "true" -> skip) without the TypeError.
        if (positionX && positionY && positionZ && setPosition?.value == "true") {
          positionX.value = position.x as unknown as string;
          positionY.value = position.y as unknown as string;
          positionZ.value = position.z as unknown as string;
        }

        if (rotationX && rotationY && rotationZ && rotationW && setRotation?.value == "true") {
          rotationX.value = rotation.x as unknown as string;
          rotationY.value = rotation.y as unknown as string;
          rotationZ.value = rotation.z as unknown as string;
          rotationW.value = rotation.w as unknown as string;
        }
      }
    }
  }

  async updateThreejsObject(classInstance: ClassInstance) {
    const threeScene = this.globalObjectInstance.scene;
    if (threeScene) {
      const referenceObject = threeScene.getObjectByProperty("uuid", classInstance.uuid);

      const attributeInstances: AttributeInstance[] = classInstance.attribute_instance;

      const find = (uuid: string) =>
        attributeInstances.find((attribute_instance) => attribute_instance.uuid_attribute == uuid);

      //get the attributeInstance of the attribute 5a038d67-bc1a-4881-86e8-f53f37dae5d6 -> Position X
      const positionX = find(REFERENCE_POSITION_X_ATTRIBUTE_UUID);
      //get the attributeInstance of the attribute 455eae8f-35c7-44f9-8909-468972f53341 -> Position Y
      const positionY = find(REFERENCE_POSITION_Y_ATTRIBUTE_UUID);
      //get the attributeInstance of the attribute d84b02fd-3c04-4612-82f5-b7a1eb95a7c4 -> Position Z
      const positionZ = find(REFERENCE_POSITION_Z_ATTRIBUTE_UUID);
      //get the attributeInstance of the attribute 21ae60ea-be54-432c-a7c5-c66085f098a8 -> Rotation X
      const rotationX = find(REFERENCE_ROTATION_X_ATTRIBUTE_UUID);
      //get the attributeInstance of the attribute 35eaa212-71c2-4b15-8da9-4dc29be6b4e4 -> Rotation Y
      const rotationY = find(REFERENCE_ROTATION_Y_ATTRIBUTE_UUID);
      //get the attributeInstance of the attribute 8a4d3bc4-3dfb-4145-983c-dafe42a4b26e -> Rotation Z
      const rotationZ = find(REFERENCE_ROTATION_Z_ATTRIBUTE_UUID);
      //get the attributeInstance of the attribute e4e03c44-63e9-4d36-9304-a8fea5300cd3 -> Rotation W
      const rotationW = find(REFERENCE_ROTATION_W_ATTRIBUTE_UUID);
      // get the attributeInstance of the attribute 3a5b4525-4616-49f5-a5b1-2f9f4d8ec483 -> Set Rotation
      const setRotation = find(REFERENCE_SET_ROTATION_ATTRIBUTE_UUID);
      // get the attributeInstance of the attribute 043daf98-2cdd-4b85-9e7a-8d983c43f565 -> Set Position
      const setPosition = find(REFERENCE_SET_POSITION_ATTRIBUTE_UUID);

      // Guarded access to referenceObject / setPosition / setRotation / the
      // rotation* cells unguarded — it throws a TypeError for a Reference instance
      // that is not (yet) drawn, or whose pose attributes are absent. Guarded here so
      // one bad instance cannot abort the whole hybrid pass; the reachable behaviour
      // (all attributes present + drawn) is unchanged.
      if (!referenceObject) return;

      if (positionX && setPosition?.value == "true") {
        referenceObject.position.x = parseFloat(positionX.value);
      }
      if (positionY && setPosition?.value == "true") {
        referenceObject.position.y = parseFloat(positionY.value);
      }
      if (positionZ && setPosition?.value == "true") {
        referenceObject.position.z = parseFloat(positionZ.value);
      }

      if (!rotationX || !rotationY || !rotationZ || !rotationW) return;

      const quaternion = new THREE.Quaternion(
        rotationX.value as unknown as number,
        rotationY.value as unknown as number,
        rotationZ.value as unknown as number,
        rotationW.value as unknown as number,
      );
      // check if the rotation of an object corresponds to the quaternion values
      //
      // KNOWN ODDITY, kept deliberately: `&&` binds tighter than `||`, so the
      // "Set Rotation" gate applies ONLY to the x comparison. A Reference whose y/z/w
      // differ is therefore rotated even with the flag off — almost certainly not the
      // intent (the position block above gates every axis), but it is the shipped
      // behaviour, and changing it changes what existing models do.
      if (
        (setRotation?.value == "true" && referenceObject.quaternion.x != quaternion.x) ||
        referenceObject.quaternion.y != quaternion.y ||
        referenceObject.quaternion.z != quaternion.z ||
        referenceObject.quaternion.w != quaternion.w
      ) {
        //reset object to world no rotation
        referenceObject.quaternion.set(0, 0, 0, 1);
        referenceObject.setRotationFromQuaternion(quaternion);
      }
    }
  }
}

// Module singleton — one shared instance.
export const statechangeAlgorithms = new StatechangeAlgorithms();
