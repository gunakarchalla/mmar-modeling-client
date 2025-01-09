import { GraphicContext } from '../graphic_context';
import { singleton } from "aurelia";
import { InstanceUtility } from "resources/services/instance_utility";
import { AttributeInstance } from "../../../../mmar-global-data-structure";
import * as THREE from 'three';
import { GlobalDefinition } from 'resources/global_definitions';

@singleton()
export class ObjectspaceAlgorithms {

  constructor(
    private instanceUtility: InstanceUtility,
    private gc: GraphicContext,
    private globalObjectInstance: GlobalDefinition

  ) {

  }

  //99ccdf26-98ec-4424-9443-490bcb825307 is the uuid for the augmentation metaclass
  async checkAugmentationsInstance(attributeInstance?: AttributeInstance) {

    // get the uuid of instance the attributeInstance belongs to
    let uuidInstance = "";
    if (attributeInstance.assigned_uuid_class_instance) {
      uuidInstance = attributeInstance.assigned_uuid_class_instance;
    } else if (attributeInstance.assigned_uuid_port_instance) {
      uuidInstance = attributeInstance.assigned_uuid_port_instance;
    } else if (attributeInstance.assigned_uuid_scene_instance) {
      uuidInstance = attributeInstance.assigned_uuid_scene_instance;
    }


    //if there is an attributeInstance
    if (attributeInstance && attributeInstance.value.startsWith("{") && uuidInstance) {
      //create object3d
      await this.gc.resetInstance();
      await this.gc.graphic_gltf(attributeInstance.value);
      const gltf = await this.gc.getMergedObjects();
      await this.gc.resetInstance();

      // get scene
      const threeScene = this.globalObjectInstance.scene;
      const object: THREE.Object3D = threeScene.getObjectByProperty('uuid', uuidInstance);
      if (object) {
        object.geometry = gltf.geometry;
        object.material = gltf.material;
      }
      //   }
    }
  }

  //a8e78bba-087e-407f-974a-18c36d830bc8 is the uuid for the detectable metaclass
  async checkDetectableInstance(attributeInstance?: AttributeInstance) {
    
    // get the uuid of instance the attributeInstance belongs to
    let uuidInstance = "";
    if (attributeInstance.assigned_uuid_class_instance) {
      uuidInstance = attributeInstance.assigned_uuid_class_instance;
    }

    let classInstance = await this.instanceUtility.getClassInstance(uuidInstance);

    if (classInstance) {
      //get the attributeInstance of the attribute d334dd62-5651-4d0f-a7a0-13718f20da36 -> image to detect
      const imageToDetectAttributeInstances: AttributeInstance[] = classInstance.attribute_instance.filter(attribute_instance => attribute_instance.uuid_attribute == "d334dd62-5651-4d0f-a7a0-13718f20da36");
      //get the attributeInstance of the attribute c1d9b467-08d8-4350-aa62-a47d6939b6ec -> size in meters
      const widthInMeters: AttributeInstance[] = classInstance.attribute_instance.filter(attribute_instance => attribute_instance.uuid_attribute == "c1d9b467-08d8-4350-aa62-a47d6939b6ec");

      //if there is an attributeInstance
      if (imageToDetectAttributeInstances.length > 0 && widthInMeters.length > 0 && Number(widthInMeters[0].value) > 0 && imageToDetectAttributeInstances[0].value.startsWith("data:image/")) {
        //create texture
        const textureOfBase64: { texture: THREE.Texture, width: number, height: number } = await this.getTextureOfBase64Image(imageToDetectAttributeInstances[0].value);
        const ratio = textureOfBase64.width / textureOfBase64.height;
        const width: number = Number(widthInMeters[0].value);
        await this.gc.resetInstance();
        const plane: THREE.Object3D = await this.gc.graphic_cube(width, width * (1 / ratio), 0.001, "white", imageToDetectAttributeInstances[0].value);
        await this.gc.resetInstance();
        // get scene
        const threeScene = this.globalObjectInstance.scene;
        const object: THREE.Object3D = threeScene.getObjectByProperty('uuid', classInstance.uuid);
        if (object) {
          object.geometry = plane.geometry;
          object.material = plane.material;
        }
      }
    }
  }

  async getTextureOfBase64Image(base64Image: string): Promise<{ texture: THREE.Texture, width: number, height: number }> {
    return new Promise((resolve, reject) => {
      let img = new Image();
      const texture = new THREE.Texture(img);

      img.onload = () => {
        texture.needsUpdate = true;
        resolve({ texture: texture, width: img.width, height: img.height });
      }
      img.onerror = (error) => {
        reject(error);
      }
      img.src = base64Image;
    });
  }
}