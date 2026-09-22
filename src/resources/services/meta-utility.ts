import { UUID, Class, Relationclass, Port, SceneType, Attribute } from "@gds";
import { globalObject } from "@/engine/global-definition";
import { backendService } from "./backend-service";
import { fileUtility } from "./file-utility";

/**
 * Lookups over the META side of the model: scene types, classes, relation classes,
 * ports and attributes, plus the client-side file cache.
 *
 * `Files` maps a file uuid to both the `File` and its data-URL / text form, filled once
 * by `getFiles()` before the scene tree is built. Palette icons, image attributes and
 * the glTF and URDF loaders all resolve their content through it rather than fetching
 * per use.
 *
 * `parseMetaFunction` compiles a stored code string into a runnable function. The
 * `new Function(...)` there is the whole point of the feature: vizRep, mechanism and
 * procedure behaviour is authored in the metamodel and evaluated here.
 */
export class MetaUtility {
  private globalObjectInstance = globalObject;

  Files: Map<UUID, [File, string]> = new Map<UUID, [File, string]>(); // To store all files

  async getFiles() {
    // Fetch all files from the database and store them in the Files map
    const filesData = (await backendService.getFiles()) as any[];
    for (const fileData of filesData) {
      const file = fileUtility.bufferToFile(
        fileData["data"],
        fileData["name"],
        fileData["type"],
        fileData["creation_time"],
        fileData["modification_time"],
      );
      let str: string;
      if (file.type.includes("model/gltf+json") || file.type.includes("application/octet-stream")) {
        // If the fileData is a glTF model or binary, read it as text
        str = await file.text();
      } else {
        str = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const result = typeof reader.result === "string" ? reader.result : "";
            resolve(result);
          };
          reader.onerror = (error) => {
            reject(error);
          };
          reader.readAsDataURL(file);
        });
      }
      this.Files.set(fileData.uuid, [file, str]); // Store the fileData and its DataURL in the map
    }
  }

  getFileByUUID(uuid: UUID): File {
    return this.Files.get(uuid)![0];
  }

  async setFile(uuid: UUID, file: File) {
    let str: string;
    if (file.type.includes("model/gltf+json") || file.type.includes("application/octet-stream")) {
      // If the file is a glTF model or binary, read it as text
      str = await file.text();
    } else {
      str = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = typeof reader.result === "string" ? reader.result : "";
          resolve(result);
        };
        reader.onerror = (error) => {
          reject(error);
        };
        reader.readAsDataURL(file);
      });
    }
    this.Files.set(uuid, [file, str]); // Store the file and its DataURL in the map
  }

  deleteFileByUUID(uuid: UUID) {
    this.Files.delete(uuid);
  }

  async getAllSceneTypesFromDB() {
    // backendService.getSceneTypes() already deep-revives via gds `Metamodel.fromJS`
    // (gds's own class-transformer copy, which holds the @Type metadata). Consume the
    // array directly and just attach the `children[]` tree field — do NOT re-run the
    // app's `plainToInstance`, which would shallow-revive and strip nested instances
    // (the app's class-transformer copy has no @Type metadata for gds classes).
    const sceneTypes: SceneType[] = (await backendService.getSceneTypes()) ?? [];
    // add empty children array to sceneTypes
    for (const sceneType of sceneTypes) {
      (sceneType as any)["children"] = [];
    }
    return sceneTypes;
  }

  // Function to get current tab context scene type
  async getTabContextSceneType() {
    const tabContext = this.globalObjectInstance.tabContext[this.globalObjectInstance.selectedTab];
    const sceneType = tabContext.sceneType;
    return sceneType;
  }

  async getSceneTypeByUUID(uuid: UUID) {
    return this.globalObjectInstance.sceneTypes.find((sceneType) => sceneType.uuid == uuid);
  }

  // Function to find objects of a specific type within a given object and its children
  findType(object: any, type: any, objects: any[]) {
    for (const child of object.children) {
      if (child.type === type) {
        objects.push(child);
      }
      this.findType(child, type, objects);
    }
  }

  // Function to get the meta class based on its UUID
  async getMetaClass(uuid: UUID) {
    const sceneType = await this.getTabContextSceneType();
    const class_of_uuid: Class | undefined = sceneType.classes.find(
      (metaClass) => metaClass.uuid == uuid,
    );
    return class_of_uuid;
  }

  // Function to get the meta relation class based on its UUID
  async getMetaRelationclass(uuid: UUID) {
    const sceneType = await this.getTabContextSceneType();
    const class_of_uuid: Relationclass | undefined = sceneType.relationclasses.find(
      (metaClass) => metaClass.uuid == uuid,
    );
    return class_of_uuid;
  }

  // Async function to get a metaPort by UUID
  async getMetaPort(uuid: UUID): Promise<Port | undefined> {
    let port_of_uuid: Port | undefined = undefined;
    let sceneType = await this.getTabContextSceneType();

    for (const metaClass of sceneType.classes) {
      // Check if class contains ports
      if (metaClass.ports) {
        // Check if class contains ports
        for (const metaPort of metaClass.ports) {
          if (metaPort.uuid == uuid) {
            port_of_uuid = metaPort;
          }
        }
      }
    }

    if (!port_of_uuid) {
      // Check if sceneType contains ports
      sceneType = await this.getTabContextSceneType();
      if (sceneType.ports) {
        for (const metaPort of sceneType.ports) {
          if (metaPort.uuid == uuid) {
            port_of_uuid = metaPort;
          }
        }
      }
    }

    this.globalObjectInstance.current_meta_port = port_of_uuid as Port;

    if (!port_of_uuid) {
      return undefined;
    } else {
      return port_of_uuid;
    }
  }

  // Function to parse a string function to a JavaScript function
  async parseMetaFunction(stringFunction: string) {
    // Define function from string
    const f = new Function('"use strict";return (' + stringFunction + ")")();
    return f;
    //return Function('"use strict";return (' + stringFunction + ')')() as Function;
  }

  //check if input is sceneType
  checkIfSceneType(toBeDetermined: any): toBeDetermined is SceneType {
    if ((toBeDetermined as SceneType).classes) {
      return true;
    }
    return false;
  }

  //get metaAttribute by uuid
  async getMetaAttribute(uuid: UUID): Promise<Attribute | undefined> {
    //search in sceneType, classes, relationclasses
    const sceneType = await this.getTabContextSceneType();
    let metaAttribute: Attribute | undefined = sceneType.attributes.find(
      (attribute) => attribute.uuid == uuid,
    );
    if (!metaAttribute) {
      for (const metaClass of sceneType.classes) {
        metaAttribute = metaClass.attributes.find((attribute) => attribute.uuid == uuid);
        if (metaAttribute) {
          return metaAttribute;
        }
      }
    }
    if (!metaAttribute) {
      for (const metaRelationClass of sceneType.relationclasses) {
        metaAttribute = metaRelationClass.attributes.find((attribute) => attribute.uuid == uuid);
        if (metaAttribute) {
          return metaAttribute;
        }
      }
    }

    if (!metaAttribute) {
      // MODELING-ONLY server fallback. backendService.attributesGET already revives
      // the response into an Attribute instance (old code plainToInstance'd it here).
      metaAttribute = await backendService.attributesGET(uuid);
    }

    return metaAttribute;
  }

  // get metaAttribute by uuid from a specific class -> needed for sequence and ui-component
  async getMetaAttributeWithSequence(uuid: UUID, uuidAssignedConcept: UUID) {
    const metaClass = await this.getMetaClass(uuidAssignedConcept);
    const metaRelationClass = await this.getMetaRelationclass(uuidAssignedConcept);
    const metaPort = await this.getMetaPort(uuidAssignedConcept);
    const metaSceneType = await this.getSceneTypeByUUID(uuidAssignedConcept);

    let attribute: Attribute | undefined = undefined;
    if (metaClass) attribute = metaClass.attributes.find((attribute) => attribute.uuid == uuid);
    if (metaRelationClass && !attribute)
      attribute = metaRelationClass.attributes.find((attribute) => attribute.uuid == uuid);
    if (metaPort && !attribute)
      attribute = metaPort.attributes.find((attribute) => attribute.uuid == uuid);
    if (metaSceneType && !attribute)
      attribute = metaSceneType.attributes.find((attribute) => attribute.uuid == uuid);
    return attribute;
  }
}

// Module singleton — one shared instance.
export const metaUtility = new MetaUtility();
