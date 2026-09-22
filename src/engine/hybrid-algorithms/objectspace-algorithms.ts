import * as THREE from "three";
import { AttributeInstance } from "@gds";
import { globalObject } from "@/engine/global-definition";
import { GraphicContext } from "@/engine/graphic-context";
import { instanceUtility } from "@/resources/services/instance-utility";
import {
  IMAGE_TO_DETECT_ATTRIBUTE_UUID,
  SIZE_IN_METERS_ATTRIBUTE_UUID,
} from "@/constants";

/**
 * Hybrid algorithms for the ObjectSpace metamodel, reached through
 * `hybridAlgorithmsService` and never directly.
 *
 * They replace an instance's geometry and material IN PLACE rather than going through
 * the vizRep pipeline: an Augmentation adopts an uploaded glTF, and a Detectable
 * becomes a textured plane sized from an uploaded image.
 *
 * Each call builds its OWN `GraphicContext` instead of using the shared one. That is
 * load-bearing: `graphic_gltf` / `graphic_cube` accumulate into `gc.object3D` and
 * `getMergedObjects()` merges whatever is in there, while the vizRep refresh that ran
 * just before is fire-and-forget and may still be drawing into the shared context. A
 * private context cannot race it; sharing one would silently drop half-built meshes.
 */
/** The uuid of whatever instance an attribute instance hangs off. */
function ownerUuidOf(attributeInstance: AttributeInstance): string {
  return (
    attributeInstance.assigned_uuid_class_instance ??
    attributeInstance.assigned_uuid_port_instance ??
    attributeInstance.assigned_uuid_scene_instance ??
    ""
  );
}

export class ObjectspaceAlgorithms {
  private globalObjectInstance = globalObject;
  private instanceUtility = instanceUtility;

  /**
   * An Augmentation's "Object 3D" attribute holds a glTF document. Parse it and give
   * the instance's mesh that geometry and material.
   */
  async checkAugmentationsInstance(attributeInstance?: AttributeInstance) {
    if (!attributeInstance) return;

    const uuidInstance = ownerUuidOf(attributeInstance);

    // A glTF document is JSON, so anything else is not one.
    if (attributeInstance.value?.startsWith("{") && uuidInstance) {
      const gc = new GraphicContext();
      //create object3d
      await gc.resetInstance();
      await gc.graphic_gltf(attributeInstance.value);
      const gltf = await gc.getMergedObjects();
      await gc.resetInstance();

      // get scene
      const threeScene = this.globalObjectInstance.scene;
      const object = threeScene.getObjectByProperty("uuid", uuidInstance) as THREE.Mesh | undefined;
      if (object) {
        object.geometry = gltf.geometry;
        object.material = gltf.material;
      }
    }
  }

  /**
   * A Detectable's mesh becomes a thin plane carrying its "Image to detect" as a
   * texture, sized so the plane is "size in meters" wide at the image's aspect ratio.
   */
  async checkDetectableInstance(attributeInstance?: AttributeInstance) {
    if (!attributeInstance) return;

    // Only a class instance can be a Detectable.
    const classInstance = await this.instanceUtility.getClassInstance(attributeInstance.assigned_uuid_class_instance ?? "");

    if (classInstance) {
      const imageToDetectAttributeInstances: AttributeInstance[] = classInstance.attribute_instance.filter(
        (attribute_instance) => attribute_instance.uuid_attribute == IMAGE_TO_DETECT_ATTRIBUTE_UUID,
      );
      const widthInMeters: AttributeInstance[] = classInstance.attribute_instance.filter(
        (attribute_instance) => attribute_instance.uuid_attribute == SIZE_IN_METERS_ATTRIBUTE_UUID,
      );

      //if there is an attributeInstance
      if (
        imageToDetectAttributeInstances.length > 0 &&
        widthInMeters.length > 0 &&
        Number(widthInMeters[0].value) > 0 &&
        imageToDetectAttributeInstances[0].value.startsWith("data:image/")
      ) {
        //create texture
        const textureOfBase64 = await this.getTextureOfBase64Image(imageToDetectAttributeInstances[0].value);
        const ratio = textureOfBase64.width / textureOfBase64.height;
        const width: number = Number(widthInMeters[0].value);
        const gc = new GraphicContext();
        await gc.resetInstance();
        const plane: THREE.Mesh = await gc.graphic_cube(
          width,
          width * (1 / ratio),
          0.001,
          "white",
          imageToDetectAttributeInstances[0].value,
        );
        await gc.resetInstance();
        // get scene
        const threeScene = this.globalObjectInstance.scene;
        const object = threeScene.getObjectByProperty("uuid", classInstance.uuid) as THREE.Mesh | undefined;
        if (object) {
          object.geometry = plane.geometry;
          object.material = plane.material;
        }
      }
    }
  }

  async getTextureOfBase64Image(
    base64Image: string,
  ): Promise<{ texture: THREE.Texture; width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const texture = new THREE.Texture(img);

      img.onload = () => {
        texture.needsUpdate = true;
        resolve({ texture: texture, width: img.width, height: img.height });
      };
      img.onerror = (error) => {
        reject(error);
      };
      img.src = base64Image;
    });
  }
}

// Module singleton — one shared instance.
export const objectspaceAlgorithms = new ObjectspaceAlgorithms();
